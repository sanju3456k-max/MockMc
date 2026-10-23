import { MathTest, TestAttempt, UserProfile } from '../types';
import { loadLocalProjects, HtmlProject, HtmlNoteItem } from './htmlNotesSync';

export interface ThetaGlobalCapsule {
  userName: string;
  totalTestsInLibrary: number;
  totalTestsAttempted: number;
  overallAccuracy: number;
  masterySummary: {
    strongCount: number;
    developingCount: number;
    needsPracticeCount: number;
    unattemptedCount: number;
    strongTopics: string[];
    needsPracticeTopics: string[];
  };
  htmlNotesSummary: {
    totalProjects: number;
    totalFiles: number;
    projects: Array<{
      id: string;
      name: string;
      fileCount: number;
      fileTitles: string[];
    }>;
  };
  standardNotesSummary: {
    totalNotes: number;
    tags: Record<string, number>;
  };
  testCatalog: Array<{
    id: string;
    title: string;
    topic: string;
    totalQuestions: number;
    difficulty?: string;
  }>;
  recentAttempts: Array<{
    testId: string;
    testTitle: string;
    scoreText: string;
    accuracy: number;
    date: string;
    mode: string;
  }>;
}

export interface ThetaTargetedLookup {
  type: 'html_notes' | 'topic_mastery' | 'question_detail' | 'standard_notes';
  data: any;
}

export interface ThetaLeanAppContext {
  globalCapsule: ThetaGlobalCapsule;
  targetedLookup: ThetaTargetedLookup | null;
}

/**
 * Strips HTML tags and normalizes whitespace for token-efficient extraction of note text
 */
function cleanHtmlSnippet(html: string, maxChars: number = 500): string {
  if (!html) return '';
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxChars);
}

/**
 * Computes 4-tier topical mastery across all user attempts:
 * Tier 1: Mastered / Strong (>= 75% accuracy, attempted >= 50%)
 * Tier 2: Developing / Moderate (50% - 74% accuracy)
 * Tier 3: Needs Practice / Weaker (< 50% accuracy or high error rate)
 * Tier 4: Unattempted (0 attempted questions)
 */
export function computeUnifiedTopicMastery(tests: MathTest[] = [], attempts: TestAttempt[] = []) {
  const topicStats: Record<string, {
    total: number;
    attempted: number;
    correct: number;
    wrong: number;
    skipped: number;
    missedQuestions: Array<{ qNum: number; testTitle: string; text?: string; subtopic?: string }>;
    subtopics: Record<string, { total: number; correct: number; wrong: number }>;
  }> = {};

  // Seed topics from all known tests
  tests.forEach((t) => {
    const testTopic = t.topic?.trim() || 'General Math';
    if (!topicStats[testTopic]) {
      topicStats[testTopic] = {
        total: 0,
        attempted: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        missedQuestions: [],
        subtopics: {}
      };
    }
  });

  // Aggregate questions and answers from all completed attempts
  attempts.forEach((att) => {
    const parentTest = tests.find((t) => t.id === att.testId || t.title === att.testTitle);
    const answersMap = att.answers || {};
    const testQuestions = parentTest?.questions || [];
    const questionCount = Math.max(testQuestions.length, Object.keys(answersMap).length, att.totalPoints || 0);

    for (let i = 0; i < questionCount; i++) {
      const qNum = i + 1;
      const q = testQuestions[i] || null;
      const qId = q?.id || `q_${qNum}`;
      const ans = answersMap[qId] || answersMap[String(qNum)] || answersMap[String(i)] || null;

      const isAttempted = Boolean(ans && ans.selectedOption && ans.selectedOption.trim() !== '');
      const isCorrect = Boolean(ans && ans.isCorrect);

      const topic = q?.topic?.trim() || parentTest?.topic?.trim() || att.testTopic?.trim() || 'General Math';
      const subtopic = q?.subtopic?.trim() || '';

      if (!topicStats[topic]) {
        topicStats[topic] = {
          total: 0,
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          missedQuestions: [],
          subtopics: {}
        };
      }

      const ts = topicStats[topic];
      ts.total++;

      if (isAttempted) {
        ts.attempted++;
        if (isCorrect) {
          ts.correct++;
        } else {
          ts.wrong++;
          ts.missedQuestions.push({
            qNum,
            testTitle: att.testTitle || parentTest?.title || 'Test',
            text: q?.text ? q.text.slice(0, 120) : undefined,
            subtopic: subtopic || undefined
          });
        }
      } else {
        ts.skipped++;
      }

      if (subtopic) {
        if (!ts.subtopics[subtopic]) {
          ts.subtopics[subtopic] = { total: 0, correct: 0, wrong: 0 };
        }
        ts.subtopics[subtopic].total++;
        if (isCorrect) ts.subtopics[subtopic].correct++;
        else if (isAttempted && !isCorrect) ts.subtopics[subtopic].wrong++;
      }
    }
  });

  const strongTopics: string[] = [];
  const developingTopics: string[] = [];
  const needsPracticeTopics: string[] = [];
  const unattemptedTopics: string[] = [];

  const detailedBreakdown: Array<{
    topic: string;
    tier: 'strong' | 'developing' | 'needs_practice' | 'unattempted';
    accuracy: number;
    attempted: number;
    total: number;
    correct: number;
    wrong: number;
    missedQuestions: Array<{ qNum: number; testTitle: string; text?: string; subtopic?: string }>;
    subtopics: Record<string, { total: number; correct: number; wrong: number }>;
  }> = [];

  Object.entries(topicStats).forEach(([topic, stat]) => {
    const accuracy = stat.attempted > 0 ? Math.round((stat.correct / stat.attempted) * 100) : 0;
    const coverageRate = stat.total > 0 ? stat.attempted / stat.total : 0;

    let tier: 'strong' | 'developing' | 'needs_practice' | 'unattempted';

    if (stat.attempted === 0) {
      tier = 'unattempted';
      unattemptedTopics.push(topic);
    } else if (accuracy >= 75 && stat.correct > stat.wrong && (coverageRate >= 0.5 || stat.total <= 2)) {
      tier = 'strong';
      strongTopics.push(topic);
    } else if (accuracy >= 50) {
      tier = 'developing';
      developingTopics.push(topic);
    } else {
      tier = 'needs_practice';
      needsPracticeTopics.push(topic);
    }

    detailedBreakdown.push({
      topic,
      tier,
      accuracy,
      attempted: stat.attempted,
      total: stat.total,
      correct: stat.correct,
      wrong: stat.wrong,
      missedQuestions: stat.missedQuestions.slice(0, 5),
      subtopics: stat.subtopics
    });
  });

  return {
    strongTopics,
    developingTopics,
    needsPracticeTopics,
    unattemptedTopics,
    detailedBreakdown
  };
}

/**
 * Builds the complete token-lean app context for Theta AI:
 * - Tier 1: Global Capsule (~100 tokens, always present)
 * - Tier 2: Dynamic On-Demand Resolution (injected ONLY when relevant intent is detected)
 */
export function buildThetaLeanAppContext(
  latestUserText: string = '',
  tests: MathTest[] = [],
  attempts: TestAttempt[] = [],
  userProfile?: UserProfile | null,
  localNotes: any[] = [],
  selectedTestId?: string | null
): ThetaLeanAppContext {
  const textLower = (latestUserText || '').toLowerCase().trim();

  // 1. Load HTML Notes Studio projects safely
  let htmlProjects: HtmlProject[] = [];
  try {
    htmlProjects = loadLocalProjects();
  } catch (err) {
    console.warn('buildThetaLeanAppContext: Unable to load HTML projects:', err);
  }

  const totalHtmlFiles = htmlProjects.reduce((acc, p) => acc + (p.files?.length || 0), 0);
  const htmlProjectsCatalog = htmlProjects.map((p) => ({
    id: p.id,
    name: p.name,
    fileCount: p.files?.length || 0,
    fileTitles: (p.files || []).map((f) => f.title)
  }));

  // 2. Compute 4-tier topic mastery
  const mastery = computeUnifiedTopicMastery(tests, attempts);

  // 3. User lifetime accuracy and attempt counts
  let lifetimeTests = attempts.length;
  let overallAcc = 0;
  if (userProfile?.statsRollup && userProfile.statsRollup.totalTestsAttempted > 0) {
    lifetimeTests = userProfile.statsRollup.totalTestsAttempted;
    const corr = userProfile.statsRollup.totalQuestionsCorrect || 0;
    const ans = userProfile.statsRollup.totalQuestionsAnswered || 1;
    overallAcc = Math.round((corr / ans) * 100);
  } else if (attempts.length > 0) {
    const passed = attempts.filter((a) => a.passed).length;
    overallAcc = Math.round((passed / attempts.length) * 100);
  }

  // 4. Test Catalog Manifest (lean index of tests)
  const testCatalog = (tests || []).slice(0, 15).map((t) => ({
    id: t.id,
    title: t.title,
    topic: t.topic || 'Math',
    totalQuestions: t.questions?.length || 0,
    difficulty: t.difficulty || 'Medium'
  }));

  // 5. Recent attempts
  const recentAttempts = (attempts || []).slice(0, 4).map((a) => ({
    testId: a.testId,
    testTitle: a.testTitle || 'Math Assessment',
    scoreText: `${a.score}/${a.totalPoints || a.score}`,
    accuracy: a.percentage,
    date: a.completedAt ? new Date(a.completedAt).toLocaleDateString() : 'Recent',
    mode: a.attemptMode || 'online'
  }));

  // 6. Standard Notes summary
  const tagsSummary: Record<string, number> = {};
  localNotes.forEach((n) => {
    const tag = n.tag || 'general';
    tagsSummary[tag] = (tagsSummary[tag] || 0) + 1;
  });

  // TIER 1: Global Capsule (~100-120 tokens)
  const globalCapsule: ThetaGlobalCapsule = {
    userName: userProfile?.displayName || 'Student',
    totalTestsInLibrary: tests.length,
    totalTestsAttempted: lifetimeTests,
    overallAccuracy: overallAcc,
    masterySummary: {
      strongCount: mastery.strongTopics.length,
      developingCount: mastery.developingTopics.length,
      needsPracticeCount: mastery.needsPracticeTopics.length,
      unattemptedCount: mastery.unattemptedTopics.length,
      strongTopics: mastery.strongTopics.slice(0, 4),
      needsPracticeTopics: mastery.needsPracticeTopics.slice(0, 4)
    },
    htmlNotesSummary: {
      totalProjects: htmlProjects.length,
      totalFiles: totalHtmlFiles,
      projects: htmlProjectsCatalog
    },
    standardNotesSummary: {
      totalNotes: localNotes.length,
      tags: tagsSummary
    },
    testCatalog,
    recentAttempts
  };

  // TIER 2: Intelligent On-Demand Dynamic Resolution (Injected ONLY when needed)
  let targetedLookup: ThetaTargetedLookup | null = null;

  // Pattern A: HTML Notes Studio / Slide Deck Inquiry
  const isHtmlNoteInquiry = /\b(html\s*notes?|slides?|decks?|presentation|html\s*projects?|projects?|slide\s*deck|matrix|matrices\s*slide)\b/i.test(textLower) ||
    htmlProjects.some((p) => textLower.includes(p.name.toLowerCase()) || (p.files || []).some((f) => textLower.includes(f.title.toLowerCase())));

  if (isHtmlNoteInquiry) {
    // Find matching project or files
    let matchedFiles: Array<{ project: string; title: string; tags?: string[]; snippet: string }> = [];

    htmlProjects.forEach((p) => {
      (p.files || []).forEach((f) => {
        const matchesTitle = textLower.includes(f.title.toLowerCase());
        const matchesProj = textLower.includes(p.name.toLowerCase());
        const isGeneral = /\b(html\s*notes?|slides?|my\s*notes)\b/i.test(textLower);

        if (matchesTitle || matchesProj || isGeneral) {
          matchedFiles.push({
            project: p.name,
            title: f.title,
            tags: f.tags,
            snippet: cleanHtmlSnippet(f.code, 350)
          });
        }
      });
    });

    targetedLookup = {
      type: 'html_notes',
      data: {
        matchedFiles: matchedFiles.slice(0, 4),
        totalProjects: htmlProjects.length,
        allProjectNames: htmlProjects.map((p) => p.name)
      }
    };
  }

  // Pattern B: Question Deep-Dive (e.g. "Q7", "question 15", "why did I get Q3 wrong")
  if (!targetedLookup) {
    const qMatch = textLower.match(/\b(?:q(?:uestion)?\.?\s*(\d+))\b/i) || textLower.match(/\b(\d+)(?:st|nd|rd|th)?\s+question\b/i);
    if (qMatch) {
      const targetQNum = parseInt(qMatch[1], 10);
      let matchedTest = tests.find((t) => selectedTestId && t.id === selectedTestId);
      if (!matchedTest) {
        matchedTest = tests.find((t) => t.title && textLower.includes(t.title.toLowerCase()));
      }
      if (!matchedTest && attempts.length > 0) {
        matchedTest = tests.find((t) => t.id === attempts[0].testId || (t.title && t.title === attempts[0].testTitle));
      }
      if (!matchedTest && tests.length > 0) {
        matchedTest = tests[0];
      }

      if (matchedTest && Array.isArray(matchedTest.questions)) {
        const questionIndex = targetQNum - 1;
        const matchedQ = matchedTest.questions[questionIndex] ||
          matchedTest.questions.find((q, idx) => (q.id && q.id.includes(String(targetQNum))) || idx + 1 === targetQNum);

        if (matchedQ) {
          const relAttempt = attempts.find((a) => a.testId === matchedTest!.id || a.testTitle === matchedTest!.title);
          let studentAns: string | undefined = undefined;
          let isCorrect: boolean | undefined = undefined;
          if (relAttempt?.answers) {
            const qId = matchedQ.id || `q_${targetQNum}`;
            const aObj = relAttempt.answers[qId] || relAttempt.answers[String(targetQNum)] || relAttempt.answers[String(questionIndex)];
            if (aObj) {
              studentAns = aObj.selectedOption || 'Skipped';
              isCorrect = Boolean(aObj.isCorrect);
            }
          }

          targetedLookup = {
            type: 'question_detail',
            data: {
              testTitle: matchedTest.title,
              questionNumber: targetQNum,
              text: matchedQ.text,
              options: matchedQ.options,
              correctAnswer: matchedQ.correctAnswer,
              solution: matchedQ.explanation || matchedQ.solution,
              userAnswer: studentAns,
              isCorrect
            }
          };
        }
      }
    }
  }

  // Pattern C: 4-Tier Topical Mastery & Diagnostic Inquiry (e.g. "weakness", "weakest", "mistakes", "practice", "accuracy")
  if (!targetedLookup && /\b(reports?|weak(est|er|ness(es)?)?|mistakes?|wrong|fail(ed|s|ing)?|scores?|accurac(y|ies)|performance|diagnostics?|master(y|ed)|practic(e|ing)|improv(e|ed|ing)|recommend(ed|ations?)?)\b/i.test(textLower)) {
    const latestAttempt = attempts.length > 0 ? attempts[0] : null;

    targetedLookup = {
      type: 'topic_mastery',
      data: {
        latestAttempt: latestAttempt ? {
          testTitle: latestAttempt.testTitle,
          scoreText: `${latestAttempt.score}/${latestAttempt.totalPoints || latestAttempt.score}`,
          accuracy: latestAttempt.percentage,
          date: latestAttempt.completedAt ? new Date(latestAttempt.completedAt).toLocaleDateString() : 'Recent'
        } : null,
        masteryTiers: {
          mastered: mastery.detailedBreakdown.filter((t) => t.tier === 'strong'),
          developing: mastery.detailedBreakdown.filter((t) => t.tier === 'developing'),
          needsPractice: mastery.detailedBreakdown.filter((t) => t.tier === 'needs_practice'),
          unattempted: mastery.detailedBreakdown.filter((t) => t.tier === 'unattempted')
        }
      }
    };
  }

  // Pattern D: Standard IDB Notes / Formulas Inquiry
  if (!targetedLookup && /\b(notes?|formulas?|tricks?|mistake\s*notes?)\b/i.test(textLower) && localNotes.length > 0) {
    const matchedNotes = localNotes.filter((n) => {
      const matchTag = (n.tag && textLower.includes(n.tag.toLowerCase())) || textLower.includes('note');
      const matchText = n.text && n.text.toLowerCase().split(' ').some((word: string) => word.length > 3 && textLower.includes(word));
      return matchTag || matchText;
    }).slice(0, 4);

    if (matchedNotes.length > 0) {
      targetedLookup = {
        type: 'standard_notes',
        data: {
          notes: matchedNotes.map((n) => ({
            title: n.title || 'Formula Note',
            tag: n.tag || 'general',
            content: (n.text || n.content || '').slice(0, 250)
          }))
        }
      };
    }
  }

  return {
    globalCapsule,
    targetedLookup
  };
}
