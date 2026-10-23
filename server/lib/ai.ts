import { GoogleGenAI } from "@google/genai";

export const withTimeout = <T>(promise: Promise<T>, timeoutMs = 15000, errorMsg = "Gemini request timed out"): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
};

export const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  return new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

export const CANDIDATE_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

export async function generateWithFallback(ai: GoogleGenAI, params: { 
  contents: any; 
  config?: any;
  tools?: any[];
}) {
  let lastErr: any = null;
  const models = [...CANDIDATE_MODELS];
  
  for (const model of models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...params.config,
            tools: params.tools,
          },
        }),
        25000,
        `Timeout querying model ${model}`
      );
      if (response) return response;
    } catch (err: any) {
      lastErr = err;
      const isQuotaErr = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      if (isQuotaErr) {
        console.warn(`Model ${model} quota limit reached (429), switching to next model...`);
      } else {
        console.warn(`Model ${model} fallback trigger:`, err.message?.slice(0, 120));
      }
      
      // If it failed because of tools and we can fallback to no tools, do it
      if (params.tools || err.message?.includes("tool") || err.message?.includes("400") || err.message?.includes("503")) {
         try {
           const noToolsConfig = { ...params.config };
           delete noToolsConfig.tools;
           const responseNoTools = await withTimeout(
             ai.models.generateContent({
               model,
               contents: params.contents,
               config: noToolsConfig,
             }),
             20000,
             `Timeout querying model ${model} without tools`
           );
           if (responseNoTools) return responseNoTools;
         } catch (e2) {}
      }
      continue;
    }
  }
  
  // Synthetic fallback when quota is completely exhausted or models time out
  return {
    text: "Notice: AI service busy. Your note content and changes are safely stored. Please try sending your query again in a moment."
  };
}

export function cleanAndParseJson(str: string): any {
  if (!str || typeof str !== 'string') return null;

  const trimmed = str.trim();

  try {
    return JSON.parse(trimmed);
  } catch (e) {}

  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch (e) {}

  let repaired = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        repaired += char;
      } else if (char === '\\') {
        const nextChar = stripped[i + 1] || '';
        if (nextChar === '"' || nextChar === '\\' || nextChar === '/') {
          repaired += '\\';
          isEscaped = true;
        } else if (nextChar === 'u' && /^[0-9a-fA-F]{4}/.test(stripped.substring(i + 2, i + 6))) {
          repaired += '\\';
          isEscaped = true;
        } else if (['n', 'r', 't', 'b', 'f'].includes(nextChar)) {
          const followingChar = stripped[i + 2] || '';
          if (/^[a-zA-Z]/.test(followingChar)) {
            repaired += '\\\\';
          } else {
            repaired += '\\';
            isEscaped = true;
          }
        } else {
          repaired += '\\\\';
        }
      } else if (char === '"') {
        inString = false;
        repaired += char;
      } else if (char === '\n') {
        repaired += '\\n';
      } else if (char === '\r') {
        repaired += '\\r';
      } else if (char === '\t') {
        repaired += '\\t';
      } else {
        repaired += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      repaired += char;
    }
  }

  repaired = repaired.replace(/,\s*([\}\]])/g, '$1');

  try {
    return JSON.parse(repaired);
  } catch (e) {
    try {
      let aggressive = stripped
        .replace(/([^\\])\\([a-zA-Z0-9{}()_^+=\-*\/])/g, '$1\\\\$2')
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"');
      return JSON.parse(aggressive);
    } catch (e2) {
      return null;
    }
  }
}

export function extractSectionByHeading(code: string, headingText: string): string | null {
  if (!code || !headingText) return null;
  const lowerCode = code.toLowerCase();
  const lowerHeading = headingText.toLowerCase();
  const startIdx = lowerCode.indexOf(lowerHeading);
  if (startIdx === -1) return null;

  const tagStart = code.lastIndexOf('<h', startIdx);
  if (tagStart === -1) return null;

  const levelMatch = code.substring(tagStart, tagStart + 5).match(/<h([1-6])/i);
  const level = levelMatch ? levelMatch[1] : '2';

  const nextHeadingRegex = new RegExp(`<h[1-${level}][\\s>]`, 'i');
  const remaining = code.substring(tagStart + 10);
  const nextMatch = remaining.match(nextHeadingRegex);

  if (nextMatch && nextMatch.index !== undefined) {
    return code.substring(tagStart, tagStart + 10 + nextMatch.index);
  }
  
  const bodyClose = code.lastIndexOf('</body>');
  if (bodyClose !== -1 && bodyClose > tagStart) {
    return code.substring(tagStart, bodyClose);
  }

  return code.substring(tagStart);
}

/**
 * Stage 1: Structural Analysis
 * Uses a small model to determine which sections need modification based on the outline.
 */
export async function analyzeDocumentStructure(ai: any, params: {
  prompt: string;
  outline: string;
  currentTitle: string;
  projectManifest?: string;
}): Promise<{
  operation: 'UPDATE' | 'INSERT' | 'REWRITE' | 'DELETE' | 'PROJECT_MGMT' | 'SYNTHESIZE';
  targetHeadings: string[];
  targetIds: string[]; // Targeted data-note-id attributes
  relevantFiles: string[]; // IDs or Titles of other files in project needed for context
  isFullRewrite: boolean;
  styleNotes: string; // Brief description of document style/flow
  reasoning: string;
}> {
  const systemInstruction = `You are a Document Structure Analyst & Planner for "Theta Notes Studio". 
Analyze the user prompt against the provided document outline AND the global project manifest.
Identify the exact blocks (by data-note-id) or sections (by heading) that are relevant.
Determine the stylistic "flow" of the document (e.g., uses tables for definitions, uses blue callouts for theorems).

JSON Schema:
{
  "operation": "UPDATE" | "INSERT" | "REWRITE" | "DELETE" | "PROJECT_MGMT" | "SYNTHESIZE",
  "targetHeadings": ["Heading Text"],
  "targetIds": ["data-note-id-1"],
  "relevantFiles": ["File Title or ID"],
  "isFullRewrite": boolean,
  "styleNotes": "e.g., Uses A4 paper style with centering and blue headers.",
  "reasoning": "Plan: User wants to combine X from 'Notes A' and Y from current note. I will first read 'Notes A', then update Section Z..."
}

Rules:
1. If the user refers to specific blocks present in the outline, list their "data-note-id" in targetIds.
2. If the user refers to topics in OTHER files (from manifest), list those files in relevantFiles.
3. PREFER targetIds for higher precision if the outline provides them.
4. "SYNTHESIZE" operation is used when combining data from multiple project files.`;

  const userContent = `CURRENT NOTE: "${params.currentTitle}"
OUTLINE:
${params.outline}

${params.projectManifest ? `GLOBAL PROJECT MANIFEST:\n${params.projectManifest}` : ''}

USER PROMPT: "${params.prompt}"`;

  try {
    // Using generateWithFallback for higher reliability
    const response = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const result = cleanAndParseJson(response.text);
    return {
      operation: result?.operation || 'UPDATE',
      targetHeadings: Array.isArray(result?.targetHeadings) ? result.targetHeadings : [],
      targetIds: Array.isArray(result?.targetIds) ? result.targetIds : [],
      relevantFiles: Array.isArray(result?.relevantFiles) ? result.relevantFiles : [],
      isFullRewrite: Boolean(result?.isFullRewrite),
      styleNotes: result?.styleNotes || '',
      reasoning: result?.reasoning || ''
    };
  } catch (err) {
    console.warn("Structural analysis failed:", err);
    return { 
      operation: 'UPDATE', 
      targetHeadings: [], 
      targetIds: [], 
      relevantFiles: [], 
      isFullRewrite: false, 
      styleNotes: '', 
      reasoning: 'Fallback (Structural analysis hit quota or timeout)' 
    };
  }
}

export async function generateImageVisualUrl(
  ai: GoogleGenAI, 
  prompt: string, 
  options?: { aspectRatio?: string; style?: string; seed?: number }
): Promise<string> {
  const cleanPrompt = (prompt || "futuristic concept visual").trim();
  const lowerPrompt = cleanPrompt.toLowerCase();
  
  const isAcademicMath = lowerPrompt.includes('number system') || lowerPrompt.includes('prime') || lowerPrompt.includes('multiplication') || lowerPrompt.includes('times table') || lowerPrompt.includes('venn diagram') || lowerPrompt.includes('geometry theorem') || lowerPrompt.includes('calculus') || lowerPrompt.includes('algebra') || lowerPrompt.includes('trigonometry');

  let finalPrompt = cleanPrompt;
  let targetAspectRatio = options?.aspectRatio || '1:1';

  if (isAcademicMath) {
    targetAspectRatio = options?.aspectRatio || '4:3';
    let promptSubject = cleanPrompt;
    if (lowerPrompt.includes('number system') || lowerPrompt.includes('real number')) {
      promptSubject = 'Hierarchy of Number Systems classification (Natural Numbers N, Whole Numbers W, Integers Z, Rational Numbers Q, Real Numbers R, Complex Numbers C) shown as nested concentric Euler Venn diagram with clear example numbers';
    } else if (lowerPrompt.includes('prime')) {
      promptSubject = 'Grid table of Prime Numbers from 1 to 100 with highlighted prime numbers';
    } else if (lowerPrompt.includes('multiplication') || lowerPrompt.includes('times table')) {
      promptSubject = 'Multiplication grid table poster from 1x1 to 10x10 with color-coded rows and columns';
    }
    finalPrompt = `Clean educational STEM diagram poster illustrating: ${promptSubject}. Pure bright studio background, high contrast navy, teal and emerald accents, crisp legible graphic layout, flat minimal modern aesthetic, 8k resolution, vector clarity.`;
  } else {
    const styleModifier = options?.style ? `, ${options.style}` : '';
    finalPrompt = `${cleanPrompt}${styleModifier}, high quality, ultra-detailed, 8k resolution, cinematic lighting, masterpiece, award winning composition.`;
  }

  const imageCandidateModels = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3-pro-image'];
  for (const imgModel of imageCandidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: imgModel,
        contents: {
          parts: [{ text: finalPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: targetAspectRatio as any,
          },
        },
      });
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            return `data:${mime};base64,${part.inlineData.data}`;
          }
        }
      }
    } catch {
      // Quota limit or model unavailable
    }
  }

  const dimensionsMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720 },
    '4:3': { width: 1024, height: 768 },
    '9:16': { width: 720, height: 1280 },
    '3:2': { width: 1080, height: 720 },
  };
  const dims = dimensionsMap[targetAspectRatio] || { width: 1024, height: 1024 };
  const promptSeed = options?.seed || Math.abs(cleanPrompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + Date.now()) % 100000;
  const encodedPrompt = encodeURIComponent(finalPrompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${promptSeed}&model=flux`;
}
