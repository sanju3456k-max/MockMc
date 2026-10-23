import { SessionStagedQuestion } from '../types';
import { ParsedTestAction } from '../../GeminiTestActionCard';
import { ParsedAppAction, normalizeQuestions } from '../../../types';

export function extractTestAction(content: string): { cleanContent: string; testAction: ParsedTestAction | null } {
  if (!content) return { cleanContent: '', testAction: null };

  let matchedStr = '';
  let jsonStr = '';

  // 1. Check for closed ```test-action ... ``` block
  const closedMatch = content.match(/```(?:test-action|json:test-action|test_action|testaction)\s*([\s\S]*?)\s*```/i);
  if (closedMatch) {
    matchedStr = closedMatch[0];
    jsonStr = closedMatch[1].trim();
  } else {
    // 1b. Check for unclosed ```test-action ... (if output was truncated or omitted closing fence)
    const unclosedMatch = content.match(/```(?:test-action|json:test-action|test_action|testaction)\s*([\s\S]+)$/i);
    if (unclosedMatch) {
      matchedStr = unclosedMatch[0];
      jsonStr = unclosedMatch[1].trim();
    }
  }

  // 2. Check for ```json ... ``` block containing test action or questions
  if (!jsonStr) {
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?"(?:action|questions)"[\s\S]*?\})\s*```/i);
    if (jsonMatch) {
      matchedStr = jsonMatch[0];
      jsonStr = jsonMatch[1].trim();
    }
  }

  // 3. Fallback: Search for raw JSON containing "action": "CREATE_TEST" or "UPDATE_TEST" or "DELETE_TEST" or "questions": [
  if (!jsonStr) {
    const rawActionMatch = content.match(/(\{[\s\r\n]*"(?:action|questions)"[\s\S]*\})/i);
    if (rawActionMatch) {
      matchedStr = rawActionMatch[0];
      jsonStr = rawActionMatch[1].trim();
    }
  }

  if (!jsonStr) {
    return { cleanContent: content, testAction: null };
  }

  // Multi-pass JSON cleaner & repairer
  let parsed: any = null;
  const attempts = [
    // Attempt 1: Direct JSON.parse
    () => JSON.parse(jsonStr),
    // Attempt 2: Strip comments and trailing commas
    () => {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(s);
    },
    // Attempt 3: Fix unescaped backslashes (common in LaTeX formulas)
    () => {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      s = s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(s);
    },
    // Attempt 4: Character-by-character string escape scanner
    () => {
      let cleaned = '';
      let inString = false;
      let isEscaped = false;
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (!inString) {
          if (char === '"') {
            inString = true;
            cleaned += char;
          } else {
            cleaned += char;
          }
        } else {
          if (isEscaped) {
            cleaned += char;
            isEscaped = false;
          } else if (char === '\\') {
            const next = jsonStr[i + 1];
            if (next && '\"\\/bfnrtu'.includes(next)) {
              cleaned += char;
              isEscaped = true;
            } else {
              cleaned += '\\\\';
            }
          } else if (char === '"') {
            inString = false;
            cleaned += char;
          } else if (char === '\n') {
            cleaned += '\\n';
          } else if (char === '\r') {
            cleaned += '\\r';
          } else if (char === '\t') {
            cleaned += '\\t';
          } else {
            cleaned += char;
          }
        }
      }
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    }
  ];

  for (const attempt of attempts) {
    try {
      parsed = attempt();
      if (parsed && typeof parsed === 'object') break;
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') {
    return { cleanContent: content, testAction: null };
  }

  // Remove the matched block cleanly from message content
  const cleanContent = matchedStr ? content.replace(matchedStr, '').trim() : content;

  // Handle DELETE_TEST
  if (parsed.action === 'DELETE_TEST') {
    const testObj = parsed.test || { 
      id: parsed.testId || 'test_to_delete', 
      title: parsed.testTitle || 'Test' 
    };
    return {
      cleanContent,
      testAction: {
        action: 'DELETE_TEST',
        summary: parsed.summary || `Delete test "${testObj.title || testObj.id}"`,
        test: testObj
      } as ParsedTestAction
    };
  }

  // Handle standard { action: 'CREATE_TEST' | 'UPDATE_TEST', test: { ... } }
  if (parsed.test && typeof parsed.test === 'object' && Array.isArray(parsed.test.questions)) {
    return { 
      cleanContent, 
      testAction: {
        action: parsed.action || 'CREATE_TEST',
        summary: parsed.summary,
        test: {
          ...parsed.test,
          questions: normalizeQuestions(parsed.test.questions)
        }
      } as ParsedTestAction 
    };
  }
  
  // Handle direct MathTest object { title, topic, questions: [...] }
  if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    return {
      cleanContent,
      testAction: {
        action: parsed.action || 'CREATE_TEST',
        summary: parsed.summary || `Generated ${parsed.questions.length}-question practice test`,
        test: {
          id: parsed.id || `test_${Date.now()}`,
          title: parsed.title || 'Session Practice Test',
          topic: parsed.topic || 'General Mathematics',
          difficulty: parsed.difficulty || 'Medium',
          timeLimitMinutes: parsed.timeLimitMinutes || 15,
          passingScorePercentage: parsed.passingScorePercentage || 70,
          description: parsed.description || 'Generated from session files and conversation context',
          questions: normalizeQuestions(parsed.questions)
        }
      } as ParsedTestAction
    };
  }

  return { cleanContent: content, testAction: null };
}

export function extractAppAction(content: string): { cleanContent: string; appAction: ParsedAppAction | null } {
  if (!content) return { cleanContent: '', appAction: null };

  const appActionBlockRegex = /```(?:app-action|app_action|appaction|json:app-action)\s*([\s\S]*?)```/i;
  const match = content.match(appActionBlockRegex);

  if (!match) {
    return { cleanContent: content, appAction: null };
  }

  const matchedStr = match[0];
  const jsonStr = match[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && parsed.type) {
      const cleanContent = content.replace(matchedStr, '').trim();
      return {
        cleanContent,
        appAction: parsed as ParsedAppAction
      };
    }
  } catch {
    try {
      let s = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      s = s.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        const cleanContent = content.replace(matchedStr, '').trim();
        return {
          cleanContent,
          appAction: parsed as ParsedAppAction
        };
      }
    } catch {}
  }

  return { cleanContent: content, appAction: null };
}

export function extractQuestionsFromText(text: string): SessionStagedQuestion[] {
  if (!text) return [];
  const questions: SessionStagedQuestion[] = [];
  
  // Find questions structured like "Question 1:", "Q1:", "1. ", etc.
  const regex = /(?:^|\n)(?:#{1,4}\s*)?(?:(?:\*{1,2})?(?:Question|Q\.?)\s*(\d+)[:.]?(?:\*{1,2})?|(\d+)\.\s+)([\s\S]*?)(?=(?:\n(?:#{1,4}\s*)?(?:\*{1,2})?(?:Question|Q\.?)\s*\d+[:.]?(?:\*{1,2})?|\n\d+\.\s+)|$)/gi;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qNum = match[1] || match[2];
    const body = match[3]?.trim();
    if (!body || body.length < 15) continue;

    // Extract options
    const options: string[] = [];
    const optRegex = /(?:\n|^)(?:[A-D]\)|\([A-D]\)|[A-D]\.)\s+([^\n]+)/g;
    let optMatch;
    while ((optMatch = optRegex.exec(body)) !== null) {
      options.push(optMatch[1].trim());
    }

    // Extract correct answer
    let correctAnswer = '';
    const ansMatch = body.match(/(?:Correct\s+)?(?:Answer|Ans|Option)[:\s*]+(?:\(([A-D])\)|([A-D])|([^\n]+))/i);
    if (ansMatch) {
      correctAnswer = (ansMatch[1] || ansMatch[2] || ansMatch[3] || '').trim();
    }

    // Clean text by taking the part before options or answers
    let qText = body;
    const splitIndex = body.search(/(?:\n|^)(?:[A-D]\)|\([A-D]\)|[A-D]\.)\s+/);
    if (splitIndex !== -1) {
      qText = body.substring(0, splitIndex).trim();
    }

    questions.push({
      id: `staged_q_${Date.now()}_${questions.length + 1}`,
      questionNumber: qNum ? parseInt(qNum, 10) : questions.length + 1,
      text: qText || body,
      type: options.length >= 2 ? 'mcq' : 'numerical',
      options: options.length >= 2 ? options : undefined,
      correctAnswer: correctAnswer || (options.length > 0 ? options[0] : 'N/A'),
      explanation: body.includes('Solution') || body.includes('Explanation') 
        ? body.split(/(?:Solution|Explanation)[:\s*]+/i)[1]?.trim() 
        : undefined
    });
  }

  return questions;
}
