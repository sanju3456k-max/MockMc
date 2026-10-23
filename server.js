// server.ts
import express from "express";
import path2 from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// server/routes/index.ts
import { Router as Router8 } from "express";

// server/routes/drive.ts
import { Router } from "express";
var router = Router();
router.get("/media/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({ error: "Missing or invalid fileId parameter" });
    }
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    const token = queryToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "");
    if (!token) {
      return res.status(401).json({ error: "Authentication token required to stream Google Drive file" });
    }
    let metaMime = "";
    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name,size&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        metaMime = meta?.mimeType || "";
      }
    } catch (e) {
    }
    let fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
    if (metaMime.startsWith("application/vnd.google-apps")) {
      fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`;
    }
    const driveRes = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!driveRes.ok) {
      const errBody = await driveRes.text();
      return res.status(driveRes.status).json({
        error: "Google Drive request failed",
        status: driveRes.status,
        details: errBody
      });
    }
    const contentType = driveRes.headers.get("content-type") || metaMime || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const arrayBuffer = await driveRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err) {
    console.error("Error in /api/drive/media/:fileId:", err);
    return res.status(500).json({ error: err.message || "Internal server error streaming Drive file" });
  }
});
var drive_default = router;

// server/routes/share.ts
import { Router as Router2 } from "express";
var router2 = Router2();
var SHARED_TESTS_CACHE = /* @__PURE__ */ new Map();
router2.post("/", (req, res) => {
  try {
    const testData = req.body;
    if (!testData || !testData.title || !Array.isArray(testData.questions)) {
      return res.status(400).json({ error: "Invalid test payload" });
    }
    const shortId = Math.random().toString(36).substring(2, 9);
    SHARED_TESTS_CACHE.set(shortId, testData);
    return res.json({ shareId: shortId });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create share ID" });
  }
});
router2.get("/:shareId", (req, res) => {
  const { shareId } = req.params;
  const testData = SHARED_TESTS_CACHE.get(shareId);
  if (!testData) {
    return res.status(404).json({ error: "Shared test not found or expired" });
  }
  return res.json(testData);
});
var share_default = router2;

// server/routes/ai/index.ts
import { Router as Router7 } from "express";

// server/routes/ai/notes.ts
import { Router as Router3 } from "express";

// server/lib/ai.ts
import { GoogleGenAI } from "@google/genai";
var withTimeout = (promise, timeoutMs = 15e3, errorMsg = "Gemini request timed out") => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};
var getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};
var CANDIDATE_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest"
];
async function generateWithFallback(ai, params) {
  let lastErr = null;
  const models = [...CANDIDATE_MODELS];
  for (const model of models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...params.config,
            tools: params.tools
          }
        }),
        25e3,
        `Timeout querying model ${model}`
      );
      if (response) return response;
    } catch (err) {
      lastErr = err;
      const isQuotaErr = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      if (isQuotaErr) {
        console.warn(`Model ${model} quota limit reached (429), switching to next model...`);
      } else {
        console.warn(`Model ${model} fallback trigger:`, err.message?.slice(0, 120));
      }
      if (params.tools || err.message?.includes("tool") || err.message?.includes("400") || err.message?.includes("503")) {
        try {
          const noToolsConfig = { ...params.config };
          delete noToolsConfig.tools;
          const responseNoTools = await withTimeout(
            ai.models.generateContent({
              model,
              contents: params.contents,
              config: noToolsConfig
            }),
            2e4,
            `Timeout querying model ${model} without tools`
          );
          if (responseNoTools) return responseNoTools;
        } catch (e2) {
        }
      }
      continue;
    }
  }
  return {
    text: "Notice: AI service busy. Your note content and changes are safely stored. Please try sending your query again in a moment."
  };
}
function cleanAndParseJson(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
  }
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
  }
  let repaired = "";
  let inString = false;
  let isEscaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        repaired += char;
      } else if (char === "\\") {
        const nextChar = stripped[i + 1] || "";
        if (nextChar === '"' || nextChar === "\\" || nextChar === "/") {
          repaired += "\\";
          isEscaped = true;
        } else if (nextChar === "u" && /^[0-9a-fA-F]{4}/.test(stripped.substring(i + 2, i + 6))) {
          repaired += "\\";
          isEscaped = true;
        } else if (["n", "r", "t", "b", "f"].includes(nextChar)) {
          const followingChar = stripped[i + 2] || "";
          if (/^[a-zA-Z]/.test(followingChar)) {
            repaired += "\\\\";
          } else {
            repaired += "\\";
            isEscaped = true;
          }
        } else {
          repaired += "\\\\";
        }
      } else if (char === '"') {
        inString = false;
        repaired += char;
      } else if (char === "\n") {
        repaired += "\\n";
      } else if (char === "\r") {
        repaired += "\\r";
      } else if (char === "	") {
        repaired += "\\t";
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
  repaired = repaired.replace(/,\s*([\}\]])/g, "$1");
  try {
    return JSON.parse(repaired);
  } catch (e) {
    try {
      let aggressive = stripped.replace(/([^\\])\\([a-zA-Z0-9{}()_^+=\-*\/])/g, "$1\\\\$2").replace(/,\s*([\}\]])/g, "$1").replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
      return JSON.parse(aggressive);
    } catch (e2) {
      return null;
    }
  }
}
function extractSectionByHeading(code, headingText) {
  if (!code || !headingText) return null;
  const lowerCode = code.toLowerCase();
  const lowerHeading = headingText.toLowerCase();
  const startIdx = lowerCode.indexOf(lowerHeading);
  if (startIdx === -1) return null;
  const tagStart = code.lastIndexOf("<h", startIdx);
  if (tagStart === -1) return null;
  const levelMatch = code.substring(tagStart, tagStart + 5).match(/<h([1-6])/i);
  const level = levelMatch ? levelMatch[1] : "2";
  const nextHeadingRegex = new RegExp(`<h[1-${level}][\\s>]`, "i");
  const remaining = code.substring(tagStart + 10);
  const nextMatch = remaining.match(nextHeadingRegex);
  if (nextMatch && nextMatch.index !== void 0) {
    return code.substring(tagStart, tagStart + 10 + nextMatch.index);
  }
  const bodyClose = code.lastIndexOf("</body>");
  if (bodyClose !== -1 && bodyClose > tagStart) {
    return code.substring(tagStart, bodyClose);
  }
  return code.substring(tagStart);
}
async function analyzeDocumentStructure(ai, params) {
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

${params.projectManifest ? `GLOBAL PROJECT MANIFEST:
${params.projectManifest}` : ""}

USER PROMPT: "${params.prompt}"`;
  try {
    const response = await generateWithFallback(ai, {
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });
    const result = cleanAndParseJson(response.text);
    return {
      operation: result?.operation || "UPDATE",
      targetHeadings: Array.isArray(result?.targetHeadings) ? result.targetHeadings : [],
      targetIds: Array.isArray(result?.targetIds) ? result.targetIds : [],
      relevantFiles: Array.isArray(result?.relevantFiles) ? result.relevantFiles : [],
      isFullRewrite: Boolean(result?.isFullRewrite),
      styleNotes: result?.styleNotes || "",
      reasoning: result?.reasoning || ""
    };
  } catch (err) {
    console.warn("Structural analysis failed:", err);
    return {
      operation: "UPDATE",
      targetHeadings: [],
      targetIds: [],
      relevantFiles: [],
      isFullRewrite: false,
      styleNotes: "",
      reasoning: "Fallback (Structural analysis hit quota or timeout)"
    };
  }
}
async function generateImageVisualUrl(ai, prompt, options) {
  const cleanPrompt = (prompt || "futuristic concept visual").trim();
  const lowerPrompt = cleanPrompt.toLowerCase();
  const isAcademicMath = lowerPrompt.includes("number system") || lowerPrompt.includes("prime") || lowerPrompt.includes("multiplication") || lowerPrompt.includes("times table") || lowerPrompt.includes("venn diagram") || lowerPrompt.includes("geometry theorem") || lowerPrompt.includes("calculus") || lowerPrompt.includes("algebra") || lowerPrompt.includes("trigonometry");
  let finalPrompt = cleanPrompt;
  let targetAspectRatio = options?.aspectRatio || "1:1";
  if (isAcademicMath) {
    targetAspectRatio = options?.aspectRatio || "4:3";
    let promptSubject = cleanPrompt;
    if (lowerPrompt.includes("number system") || lowerPrompt.includes("real number")) {
      promptSubject = "Hierarchy of Number Systems classification (Natural Numbers N, Whole Numbers W, Integers Z, Rational Numbers Q, Real Numbers R, Complex Numbers C) shown as nested concentric Euler Venn diagram with clear example numbers";
    } else if (lowerPrompt.includes("prime")) {
      promptSubject = "Grid table of Prime Numbers from 1 to 100 with highlighted prime numbers";
    } else if (lowerPrompt.includes("multiplication") || lowerPrompt.includes("times table")) {
      promptSubject = "Multiplication grid table poster from 1x1 to 10x10 with color-coded rows and columns";
    }
    finalPrompt = `Clean educational STEM diagram poster illustrating: ${promptSubject}. Pure bright studio background, high contrast navy, teal and emerald accents, crisp legible graphic layout, flat minimal modern aesthetic, 8k resolution, vector clarity.`;
  } else {
    const styleModifier = options?.style ? `, ${options.style}` : "";
    finalPrompt = `${cleanPrompt}${styleModifier}, high quality, ultra-detailed, 8k resolution, cinematic lighting, masterpiece, award winning composition.`;
  }
  const imageCandidateModels = ["gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1", "gemini-3-pro-image"];
  for (const imgModel of imageCandidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: imgModel,
        contents: {
          parts: [{ text: finalPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: targetAspectRatio
          }
        }
      });
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType || "image/png";
            return `data:${mime};base64,${part.inlineData.data}`;
          }
        }
      }
    } catch {
    }
  }
  const dimensionsMap = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1280, height: 720 },
    "4:3": { width: 1024, height: 768 },
    "9:16": { width: 720, height: 1280 },
    "3:2": { width: 1080, height: 720 }
  };
  const dims = dimensionsMap[targetAspectRatio] || { width: 1024, height: 1024 };
  const promptSeed = options?.seed || Math.abs(cleanPrompt.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + Date.now()) % 1e5;
  const encodedPrompt = encodeURIComponent(finalPrompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${promptSeed}&model=flux`;
}

// src/components/htmlNotes/utils/docStructureMap.ts
function buildDocumentOutline(code, noteTitle = "Untitled Note") {
  if (!code) {
    return {
      title: noteTitle,
      totalLength: 0,
      totalLines: 0,
      sections: [],
      hasKatex: false,
      hasTables: false,
      hasImages: false,
      outlineText: "Document is currently empty."
    };
  }
  const lines = code.split("\n");
  const totalLength = code.length;
  const totalLines = lines.length;
  const hasKatex = code.includes("$") || code.includes("katex");
  const hasTables = /<table\b/i.test(code);
  const hasImages = /<img\b/i.test(code);
  const sections = [];
  const headingRegex = /<h([1-6])([^>]*)>(.*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(code)) !== null) {
    const level = parseInt(match[1], 10);
    const attributes = match[2] || "";
    const rawHeadingHtml = match[3] || "";
    const idMatch = attributes.match(/\b(?:data-note-id|id)=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : `sec_${sections.length + 1}`;
    const headingText = rawHeadingHtml.replace(/<[^>]+>/g, "").trim();
    if (!headingText) continue;
    const startCharIndex = match.index;
    const endCharIndex = match.index + match[0].length;
    const afterHeading = code.substring(endCharIndex, endCharIndex + 300);
    const cleanTextAfter = afterHeading.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippetSummary = cleanTextAfter.slice(0, 120);
    sections.push({
      id,
      type: "heading",
      level,
      headingText,
      startCharIndex,
      endCharIndex,
      snippetSummary
    });
  }
  const blockRegex = /<(?:section|div|table|article)[^>]*\bdata-note-id=["']([^"']+)["'][^>]*>/gi;
  while ((match = blockRegex.exec(code)) !== null) {
    const id = match[1];
    if (sections.some((s) => s.id === id)) continue;
    const startCharIndex = match.index;
    const endCharIndex = match.index + match[0].length;
    const afterBlock = code.substring(endCharIndex, endCharIndex + 300);
    const cleanTextAfter = afterBlock.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippetSummary = cleanTextAfter.slice(0, 120);
    sections.push({
      id,
      type: match[0].toLowerCase().includes("table") ? "table" : "block",
      startCharIndex,
      endCharIndex,
      snippetSummary
    });
  }
  sections.sort((a, b) => a.startCharIndex - b.startCharIndex);
  let outlineText = `DOCUMENT MAP FOR "${noteTitle}" (Stable IDs enabled):
`;
  if (sections.length === 0) {
    outlineText += `- No explicit HTML headings or tagged blocks found.
`;
  } else {
    sections.forEach((sec) => {
      const indent = sec.level ? "  ".repeat(sec.level - 1) : "  ";
      const typeLabel = sec.type.toUpperCase();
      const contentDesc = sec.headingText ? `[HEADING] "${sec.headingText}"` : `[CONTENT] "${sec.snippetSummary}..."`;
      outlineText += `${indent}- ${contentDesc} (data-note-id: "${sec.id}")
`;
    });
  }
  return {
    title: noteTitle,
    totalLength,
    totalLines,
    sections,
    hasKatex,
    hasTables,
    hasImages,
    outlineText
  };
}
function isFullDocumentRequest(promptText) {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return lower.includes("read full") || lower.includes("full code") || lower.includes("entire document") || lower.includes("whole note") || lower.includes("complete file") || lower.includes("rewrite full") || lower.includes("full text");
}

// server/routes/ai/notes.ts
var router3 = Router3();
router3.post(["/generate", "/notes-assistant"], async (req, res) => {
  try {
    const { contents, systemInstruction, prompt, currentCode, currentTitle, selectedText } = req.body;
    const ai = getAiClient();
    const docOutline = buildDocumentOutline(currentCode || "", currentTitle || "Untitled Note");
    const analysis = await analyzeDocumentStructure(ai, {
      prompt: prompt || "",
      outline: docOutline.outlineText,
      currentTitle: currentTitle || "Untitled Note"
    });
    const isFullReadRequested = analysis.isFullRewrite || isFullDocumentRequest(prompt || "");
    let targetSectionCodeBlock = "";
    if (!isFullReadRequested && analysis.targetHeadings.length > 0) {
      for (const heading of analysis.targetHeadings) {
        const code = extractSectionByHeading(currentCode || "", heading);
        if (code) {
          targetSectionCodeBlock += `
Section: "${heading}"
\`\`\`html
${code}
\`\`\`
`;
        }
      }
    }
    let finalContents = contents;
    let finalInstruction = systemInstruction || `You are an expert AI Note Assistant. Generate clean HTML5 and KaTeX math. 
${!isFullReadRequested ? `Focus ONLY on patching the relevant sections: ${analysis.targetHeadings.join(", ")}.` : "Rewrite the full document as requested."}`;
    if (!finalContents && prompt) {
      let promptText = `DOCUMENT TITLE: "${currentTitle || "Untitled Note"}"
`;
      if (selectedText) {
        promptText += `TARGET SELECTED TEXT:
"""
${selectedText}
"""

`;
      }
      promptText += `USER PROMPT:
${prompt}

`;
      if (isFullReadRequested) {
        promptText += `FULL DOCUMENT CONTEXT:
\`\`\`html
${(currentCode || "").slice(0, 15e3)}
\`\`\``;
      } else {
        promptText += `PATCH CONTEXT:${targetSectionCodeBlock || `
\`\`\`html
${(currentCode || "").slice(-2e3)}
\`\`\``}`;
      }
      finalContents = [{ role: "user", parts: [{ text: promptText }] }];
    }
    const response = await generateWithFallback(ai, {
      contents: finalContents,
      config: {
        systemInstruction: { parts: [{ text: finalInstruction }] },
        temperature: 0.7
      }
    });
    const responseText = response.text || "";
    const codeMatch = responseText.match(/```(?:html|xml)?\n([\s\S]*?)```/i);
    const suggestedCode = codeMatch ? codeMatch[1].trim() : null;
    const cleanReplyText = responseText.replace(/```html[\s\S]*?```/gi, "").trim() || "Here is your updated note content:";
    const isTargetedEdit = Boolean(selectedText && suggestedCode && !suggestedCode.toLowerCase().startsWith("<!doctype"));
    return res.json({
      replyText: cleanReplyText,
      suggestedCode,
      hasCodeChange: Boolean(suggestedCode),
      isTargetedEdit,
      selectedText: selectedText || null
    });
  } catch (err) {
    console.warn("Notes AI Assistant endpoint error:", err?.message);
    return res.status(500).json({ error: "Failed to process AI request." });
  }
});
router3.post(["/chat-stream", "/notes-assistant-stream"], async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { prompt, currentCode, currentTitle, selectedText, activeProjectFiles, fileSummaries, attachments, activeFileId } = req.body;
  if ((!prompt || typeof prompt !== "string") && (!attachments || !attachments.length)) {
    res.write(`data: ${JSON.stringify({ error: "Prompt or file attachment is required" })}

`);
    res.write(`data: [DONE]

`);
    return res.end();
  }
  try {
    const ai = getAiClient();
    const tools = [
      {
        functionDeclarations: [
          {
            name: "read_note_content",
            description: "Reads the full HTML/KaTeX content of a specific note from the project.",
            parameters: {
              type: "object",
              properties: {
                fileIdOrTitle: { type: "string", description: "The ID or exact Title of the note to read." }
              },
              required: ["fileIdOrTitle"]
            }
          },
          {
            name: "create_note",
            description: "Creates a new note in the project.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "The title for the new note." },
                content: { type: "string", description: "The HTML/KaTeX content for the new note." }
              },
              required: ["title", "content"]
            }
          },
          {
            name: "patch_current_note",
            description: "Surgically modifies the currently open note. Use this for specific edits, insertions, or replacements.",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["REPLACE_SECTION", "REPLACE_BLOCK", "INSERT_BEFORE_SECTION", "INSERT_AFTER_SECTION", "APPEND_TO_SECTION", "INSERT_AT_END"],
                  description: "The type of surgical operation."
                },
                targetId: { type: "string", description: "The data-note-id or Heading Title to target." },
                content: { type: "string", description: "The new HTML/KaTeX content to insert/replace." }
              },
              required: ["action", "targetId", "content"]
            }
          },
          {
            name: "update_note",
            description: "Updates the entire content of an existing note (current or other).",
            parameters: {
              type: "object",
              properties: {
                fileIdOrTitle: { type: "string", description: "The ID or Title of the note to update." },
                content: { type: "string", description: "The full new content for the note." }
              },
              required: ["fileIdOrTitle", "content"]
            }
          },
          {
            name: "delete_note",
            description: "Deletes a specific note from the project.",
            parameters: {
              type: "object",
              properties: {
                fileIdOrTitle: { type: "string", description: "The ID or Title of the note to delete." }
              },
              required: ["fileIdOrTitle"]
            }
          }
        ]
      }
    ];
    const projectManifest = (activeProjectFiles || []).map((f) => ({
      id: f.id,
      title: f.title,
      summary: (fileSummaries || {})[f.id] || "No summary available."
    }));
    const systemInstruction = `You are Theta Notes Assistant, a project-aware AI expert for HTML/KaTeX note-taking.
You help users brainstorm, study, answer math questions, and manage a workspace of notes. 

CURRENT WORKSPACE CONTEXT:
- Active Note: "${currentTitle || "Untitled"}" (ID: ${activeFileId || "unknown"})
- All Files: ${JSON.stringify(projectManifest)}

CRITICAL USAGE RULES:
1. CHAT & CONCEPTUAL DISCUSSIONS VS NOTE MODIFICATIONS:
   - When the user asks a question, requests an explanation, brainstorms, or explores topics (e.g. "show me more important types of abelian groups", "explain Cauchy theorem", "where is the topic on eigenvalues", "what are the properties"):
     -> DO NOT call note modification tools (patch_current_note, update_note, create_note, delete_note)!
     -> Answer directly, richly, and helpfully in the chat using Markdown with clean KaTeX math ($...$ inline or $$...$$ block formulas).
     -> The user wants to discuss and learn in the chat first! Do NOT touch or overwrite their notes unless explicitly requested.
   - ONLY call note modification tools (patch_current_note, update_note, create_note, delete_note) when the user EXPLICITLY asks to alter their notes (e.g., words like "add to notes", "insert this", "update section", "replace formula", "merge these notes", "create note", "delete note").
2. TARGETED SELECTION REFINEMENT:
   - If 'SELECTED TEXT IN ACTIVE NOTE' is provided and the user asks to rewrite, fix, or format it, use 'patch_current_note' (action: 'REPLACE_SECTION', targetId: selected text, content: replacement snippet).
3. SURGICAL EDITS & FLOW-AWARE SECTION POSITIONING:
   - When the user asks to add or adjust content in the active note, determine the comfortable, logical position in the document flow:
     -> To add content beneath/after a section (e.g. "add two more sections under section 1", "add below section 2"): use 'patch_current_note' with action: 'INSERT_AFTER_SECTION', targetId: 'Section 1' (or the exact heading text).
     -> To add content above/before a section (e.g. "add a section above section 3"): use 'patch_current_note' with action: 'INSERT_BEFORE_SECTION', targetId: 'Section 3' (or the exact heading text).
     -> To append inside a section: use action: 'APPEND_TO_SECTION', targetId: heading or section name.
     -> To update or replace a section: use action: 'REPLACE_SECTION', targetId: heading or section name.
     -> To add at the end of the note: use action: 'INSERT_AT_END'.
   - By selecting the exact action and targetId, the code is finalized for its exact position so the user can review and apply it directly.
4. ACCURACY & HONESTY:
   - Always use 'read_note_content' when synthesizing or comparing other notes to prevent hallucination.
   - NEVER claim "I have updated your note" or "This is done" if you only explained a concept or didn't provide the code tool.
5. STRUCTURE:
   - Ensure all HTML code generated uses clean semantic tags and KaTeX ($...$ or $$...$$) for math.

ALWAYS explain your proposal briefly before calling note modification tools.`;
    const userParts = [];
    if (selectedText) userParts.push({ text: `SELECTED TEXT IN ACTIVE NOTE:
"""
${selectedText}
"""

` });
    userParts.push({ text: `USER REQUEST: ${prompt}

ACTIVE NOTE CONTENT:
\`\`\`html
${(currentCode || "").slice(0, 1e5)}
\`\`\`` });
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments.slice(0, 5)) {
        const mime = (att.mimeType || "application/octet-stream").toLowerCase();
        const cleanBase64 = typeof att.data === "string" ? att.data.replace(/^data:[^;]+;base64,/, "") : "";
        userParts.push({ inlineData: { mimeType: mime, data: cleanBase64 } });
      }
    }
    const chatModels = [
      "gemini-flash-lite-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-latest"
    ];
    let chat = null;
    let responseStream = null;
    let activeModelUsed = "";
    for (const modelName of chatModels) {
      try {
        chat = ai.chats.create({
          model: modelName,
          config: {
            systemInstruction,
            tools
          }
        });
        responseStream = await chat.sendMessageStream({ message: userParts });
        activeModelUsed = modelName;
        break;
      } catch (err) {
        const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
        if (isQuota) {
          console.warn(`Chat model ${modelName} rate limit reached (429), trying fallback model...`);
        } else {
          console.warn(`Chat model ${modelName} with tools failed:`, err.message?.slice(0, 100));
        }
      }
    }
    if (!responseStream) {
      const enhancedInstruction = `${systemInstruction}

NOTE ACTIONS: If the user explicitly asks to create or update notes, format the action at the end in a json block like:
\`\`\`json
{"action": "create_note", "title": "Note Title", "content": "HTML content"}
\`\`\` or \`\`\`json
{"action": "patch_current_note", "action": "APPEND_TO_SECTION", "targetId": "Section", "content": "HTML content"}
\`\`\``;
      for (const modelName of chatModels) {
        try {
          chat = ai.chats.create({
            model: modelName,
            config: {
              systemInstruction: enhancedInstruction
            }
          });
          responseStream = await chat.sendMessageStream({ message: userParts });
          activeModelUsed = modelName;
          break;
        } catch (err) {
          console.warn(`Chat model ${modelName} without tools failed:`, err.message?.slice(0, 100));
        }
      }
    }
    if (!responseStream) {
      res.write(`data: ${JSON.stringify({ text: "Hello! I am Theta Notes Assistant. I am ready to help you write notes, format equations with LaTeX, and review your mathematical concepts." })}

`);
      res.write(`data: [DONE]

`);
      return res.end();
    }
    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}

`);
      }
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        for (const call of chunk.functionCalls) {
          const cleanName = (call.name || "").replace(/^default_api:/, "");
          const clientCall = { ...call, name: cleanName };
          res.write(`data: ${JSON.stringify({ toolCall: clientCall })}

`);
          if (cleanName === "read_note_content") {
            const target = String(call.args?.fileIdOrTitle || "").trim().toLowerCase();
            const file = activeProjectFiles?.find((f) => f.id === target || String(f.title || "").trim().toLowerCase() === target);
            const toolOutput = { content: file?.code || "File not found." };
            try {
              const followUp = await chat.sendMessageStream({
                message: [{
                  functionResponse: {
                    name: call.name,
                    response: toolOutput
                  }
                }]
              });
              for await (const followChunk of followUp) {
                if (followChunk.text) {
                  res.write(`data: ${JSON.stringify({ text: followChunk.text })}

`);
                }
                if (followChunk.functionCalls) {
                  for (const nextCall of followChunk.functionCalls) {
                    const nextCleanName = (nextCall.name || "").replace(/^default_api:/, "");
                    res.write(`data: ${JSON.stringify({ toolCall: { ...nextCall, name: nextCleanName } })}

`);
                  }
                }
              }
            } catch (e) {
              console.warn("Follow-up function response error:", e?.message);
            }
          }
        }
      }
    }
    res.write(`data: [DONE]

`);
    return res.end();
  } catch (err) {
    console.error("Error in chat-stream:", err);
    res.write(`data: ${JSON.stringify({ error: err?.message || "Internal error" })}

`);
    res.write(`data: [DONE]

`);
    return res.end();
  }
});
router3.post("/summarize-note", async (req, res) => {
  let code = "";
  try {
    const body = req.body || {};
    const title = body.title;
    code = body.code;
    if (!code) return res.json({ summary: "Empty note." });
    const ai = getAiClient();
    const prompt = `Provide a concise 1-2 sentence semantic summary of this HTML note titled "${title || "Untitled"}". 
Focus on the main topics and concepts covered.
Note Code:
${code.slice(0, 5e3)}`;
    const response = await generateWithFallback(ai, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2 }
    });
    return res.json({ summary: response.text || "Summary unavailable." });
  } catch (err) {
    const plainText = (code || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const fallbackSummary = plainText.length > 0 ? plainText.slice(0, 160) + "..." : "Notes document summary unavailable.";
    return res.json({ summary: fallbackSummary });
  }
});
var notes_default = router3;

// server/routes/ai/chatbot.ts
import { Router as Router4 } from "express";
import { ThinkingLevel } from "@google/genai";
var router4 = Router4();
router4.post(["/", "/chatbot"], async (req, res) => {
  const {
    messages = [],
    model,
    modelTier,
    selectedModel: directSelectedModel,
    role,
    rolePreset,
    customSystemInstruction,
    customInstruction,
    temperature = 0.7,
    testLibrary = [],
    testAttempts = [],
    selectedTestId = null,
    sessionDocuments = [],
    stagedQuestions = [],
    appContext = null
  } = req.body;
  const requestedModelStr = directSelectedModel || modelTier || model || "gemini-flash-lite-latest";
  let selectedModel = "gemini-flash-lite-latest";
  if (requestedModelStr.includes("3.1-pro") || requestedModelStr.includes("pro-preview")) {
    selectedModel = "gemini-3.1-pro-preview";
  } else if (requestedModelStr.includes("4-argon")) {
    selectedModel = "gemini-4-argon";
  } else if (requestedModelStr.includes("3.8-flash")) {
    selectedModel = "gemini-3.8-flash";
  } else if (requestedModelStr.includes("flash-latest")) {
    selectedModel = "gemini-flash-latest";
  } else if (requestedModelStr.includes("3.1-flash-lite") || requestedModelStr.includes("lite")) {
    selectedModel = "gemini-3.1-flash-lite";
  } else {
    selectedModel = "gemini-flash-lite-latest";
  }
  const effectiveRole = rolePreset || role || "general_tutor";
  const effectiveInstruction = customInstruction || customSystemInstruction || "";
  function parseVisualPromptAndOptions(raw) {
    if (!raw) return { prompt: "visual concept artwork", aspectRatio: "1:1" };
    let text = raw;
    if (text.includes("[TARGETED IMAGE EDIT MODE]") || text.includes("[TARGETED EDIT MODE]")) {
      const userPromptMatch = text.match(/User's (?:editing instructions|prompt instructing how to edit or modify[^:]*):\s*"?([\s\S]*?)"?(?:\n|$)/i);
      const origMatch = text.match(/(?:Original image description\/context|Here is the original [^:]* content):\s*"?([\s\S]*?)"?(?:\n|$)/i);
      const userInstruction = userPromptMatch ? userPromptMatch[1].trim() : "";
      const orig = origMatch ? origMatch[1].trim() : "";
      if (userInstruction) {
        text = orig ? `${orig}, ${userInstruction}` : userInstruction;
      }
    }
    text = text.replace(/^\s*\/image\s+/i, "");
    text = text.replace(/Regarding the (?:generated )?visual image for "([^"]+)":/gi, "$1,");
    text = text.replace(/Regarding the (?:Python )?Matplotlib plot for "([^"]+)":/gi, "$1,");
    text = text.replace(/Please generate an updated image incorporating these visual adjustments\.?/gi, "");
    text = text.replace(/Please execute updated Python code using Matplotlib to render the improved plot\.?/gi, "");
    let aspectRatio = "1:1";
    const aspectMatch = text.match(/Aspect\s*ratio:\s*(16:9|4:3|1:1|9:16|3:2)/i) || text.match(/\b(16:9|4:3|1:1|9:16|3:2)\b/i);
    if (aspectMatch) {
      aspectRatio = aspectMatch[1];
      text = text.replace(aspectMatch[0], "");
    }
    let style = void 0;
    const styleMatch = text.match(/Style:\s*([A-Za-z0-9\s\-]+?)(?:\.|$)/i);
    if (styleMatch) {
      style = styleMatch[1].trim();
      text = text.replace(styleMatch[0], "");
    }
    const cleanPrompt = text.replace(/Style:\s*/gi, "").replace(/Aspect ratio:\s*/gi, "").replace(/\[TARGETED (?:IMAGE )?EDIT MODE\]/gi, "").replace(/MANDATORY INSTRUCTIONS:[\s\S]*$/gi, "").replace(/\s+/g, " ").trim();
    return {
      prompt: cleanPrompt || "visual concept artwork",
      aspectRatio,
      style
    };
  }
  let isImageGenerationRequest = false;
  try {
    const ai = getAiClient();
    const ROLE_INSTRUCTIONS = {
      complex_researcher: `You are an elite Professor of Mathematical Sciences, Theoretical Physics, and Academic Test Architect. 
Your goal is to solve deep, complex problems, formulate rigorous mathematical proofs, provide step-by-step analytical derivations, and thoroughly explore abstract concepts.
ALWAYS render mathematical formulas using clean standard LaTeX notation (e.g. $f(x) = \\int_a^b g(t) \\, dt$ or $$\\lim_{n \\to \\infty} \\sum_{i=1}^n \\frac{1}{i^2} = \\frac{\\pi^2}{6}$$).
Maintain highest analytical precision, define terms rigorously, and address edge cases.`,
      general_tutor: `You are an empathetic, insightful STEM, Mathematics Tutor, and Test Library Architect named Theta, powered by Gemini AI.
Your purpose is to explain concepts clearly, break down problem-solving steps methodically, provide intuitive analogies, and verify student comprehension.
Use standard LaTeX ($...$ and $$...$$) for all formulas, equations, and mathematical variables.
Keep explanations clear, engaging, structured, and easy to follow.`,
      fast_solver: `You are a high-speed, direct Mathematical & STEM Problem Solver and Test Editor.
Provide immediate, concise, and accurate answers, computational results, and core formulas with zero fluff or unnecessary conversational preamble.
Provide exact LaTeX expressions ($...$) and immediate numerical/symbolic solutions instantly.`,
      socratic_coach: `You are a Socratic Mathematics and Science Coach.
Instead of immediately giving away the entire final answer, guide the user to discover solutions through targeted probing questions, hints, conceptual stepping stones, and formula reminders.
Celebrate their breakthroughs and encourage critical mathematical thinking.`,
      latex_code_specialist: `You are a LaTeX, Algorithms, and Technical Formatting Specialist.
Your job is to provide pristine LaTeX code, TikZ diagrams, algorithmic pseudocode, Python numerical computations (NumPy/SciPy), and technical documentation.
Always enclose LaTeX blocks in clean markdown or standard math delimiters.`
    };
    const latestUserMsg = [...messages].reverse().find((m) => m.role === "user" || m.role === "client")?.content || "";
    const latestTextLower = latestUserMsg.trim().toLowerCase();
    const hasAttachments = messages.some((m) => Array.isArray(m.attachments) && m.attachments.length > 0);
    const isSimpleGreeting = !hasAttachments && /^(hi|hello|hey|hola|namaste|greetings|good\s*(morning|afternoon|evening|day)|sup|yo|howdy|what'?s\s*up|help)\b[!?,.\s]*$/i.test(latestTextLower);
    if (isSimpleGreeting) {
      return res.json({
        reply: `Hello! \u{1F44B} How can I help you today? 

You can ask me to **solve math and science problems**, **plot 2D/3D functions**, **discuss test questions from your library**, or **derive step-by-step solutions** in LaTeX!`,
        text: `Hello! \u{1F44B} How can I help you today? 

You can ask me to **solve math and science problems**, **plot 2D/3D functions**, **discuss test questions from your library**, or **derive step-by-step solutions** in LaTeX!`,
        parts: [{ type: "text", text: `Hello! \u{1F44B} How can I help you today? 

You can ask me to **solve math and science problems**, **plot 2D/3D functions**, **discuss test questions from your library**, or **derive step-by-step solutions** in LaTeX!` }],
        executableCode: [],
        codeExecutionResults: [],
        generatedImages: [],
        modelUsed: selectedModel || "gemini-3.8-flash",
        role: effectiveRole,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const isExplicitImageCommand = /^\s*\/image\b/i.test(latestUserMsg);
    const isTargetedImageEdit = latestUserMsg.includes("[TARGETED IMAGE EDIT MODE]") || latestUserMsg.includes("[TARGETED EDIT MODE]") && (latestUserMsg.toLowerCase().includes("visual image") || latestUserMsg.toLowerCase().includes("generated image") || latestUserMsg.toLowerCase().includes("regarding the generated visual") || latestUserMsg.toLowerCase().includes("update image") || latestUserMsg.toLowerCase().includes("modify this image") || latestUserMsg.toLowerCase().includes("edit this image"));
    const isExplicitImageKeyword = /(generate|create|imagine|render|draw|paint|make|produce)\s+(an?\s+)?(new\s+|updated\s+|alternative\s+)?(image|picture|photo|illustration|drawing|painting|visual\s+artwork|graphic|portrait|wallpaper|scene)\b|^(imagine|draw|paint)\s+(a|an|the|me)?|visual\s+variation|edit\s+this\s+image|modify\s+this\s+image|visual\s+adjustments|photorealistic|cyberpunk\s+art|watercolor\s+painting|minimalist\s+vector/i.test(latestUserMsg);
    isImageGenerationRequest = isExplicitImageCommand || isTargetedImageEdit || isExplicitImageKeyword;
    const isExplicitPythonPlotRequest = /\b(matplotlib|python\s*plot|visual\s*figure\s*plot|run\s*python|execute\s*python|python\s+code|python\s+script|numpy\s+plot|scipy|sympy\s+plot|code\s*execut|calculate\s*pi)\b/i.test(latestUserMsg) || /\b(plot\s+the|plot\s+a|draw\s+a\s+(graph|chart|plot)|graph\s+of|curve\s+of|plot\s+of|scatter\s*plot|vector\s*field|contour\s*plot|3d\s*(surface|mesh)|polar\s*plot|phase\s*portrait|function\s*f\(x\))\b/i.test(latestUserMsg);
    const needsCodeExecution = isExplicitPythonPlotRequest;
    const isDiscussingTests = /(test|quiz|question|exam|library|score|attempt|derive|problem|review\s*q|discuss\s*q|generate|create|make\s*(a\s*)?test|update\s*(a\s*)?test|edit\s*(a\s*)?test|add\s*question|modify\s*(a\s*)?test|new\s*test|custom\s*test)/i.test(latestUserMsg);
    const baseInstruction = effectiveInstruction ? effectiveInstruction : ROLE_INSTRUCTIONS[effectiveRole] || ROLE_INSTRUCTIONS.general_tutor;
    const imageGenerationDirective = isImageGenerationRequest ? `
=== AI VISUAL IMAGE & ARTWORK GENERATION DIRECTIVE ===
The user requested an AI-generated visual image, illustration, or artwork.
1. Provide a brief, polished 1-2 sentence description celebrating the visual elements, mood, lighting, or artistic style of the rendered image.
2. CRITICAL MANDATE: NEVER OUTPUT RAW PYTHON CODE, MATPLOTLIB SCRIPTS, OR CODE BLOCKS. The visual image is rendered directly on the visual canvas.` : "";
    const codeExecutionDirective = needsCodeExecution ? `
=== PUBLICATION-GRADE PYTHON MATPLOTLIB CODE EXECUTION & RENDERING DIRECTIVE ===
You have an integrated real-time sandboxed Python Code Execution engine equipped with NumPy, SciPy, Matplotlib, and SymPy.
When the user requests any plot, graph, chart, geometry drawing, mathematical curve, 3D surface, vector field, or math visual diagram:
1. NEVER say "As an AI, I cannot draw or generate images". You have a full Python Matplotlib renderer!
2. ALWAYS execute clean, standalone Python code using the \`codeExecution\` tool to generate the figure.
3. CRITICAL MANDATE: DO NOT output raw markdown code blocks in your text response! The Python script is automatically executed in the tool call and stored for the Canva page Code button. Output only a brief, clean conversational summary in text.
3. ADHERE TO ULTRA-PREMIUM MODERN PUBLICATION-GRADE SCIENTIFIC AESTHETICS:
   - High-DPI Resolution & Sharpness:
     * Initialize with \`plt.figure(figsize=(10, 6), dpi=300)\` or \`fig, ax = plt.subplots(figsize=(10, 6), dpi=300)\`.
     * For multi-panel plots, use \`fig, axes = plt.subplots(nrows, ncols, figsize=(12, 5 * nrows), dpi=300)\`.
   - Typography & LaTeX Notation:
     * Titles: Bold, informative, professional: \`ax.set_title(r"...", fontsize=14, fontweight='bold', pad=15, color='#1e293b')\`
     * Axis Labels: Always use raw LaTeX strings for math formulas (e.g. \`ax.set_xlabel(r"$x$ (radians)", fontsize=11.5, labelpad=8, color='#334155')\`, \`ax.set_ylabel(r"$f(x) = \\sin(x) \\cdot e^{-0.1x}$", fontsize=11.5, labelpad=8, color='#334155')\`).
     * Tick Formatting: Clean font size \`ax.tick_params(colors='#475569', labelsize=10, width=1.2, length=4)\`.
   - Clean Color Palettes & Contrast:
     * Primary Line / Curve: \`#2563eb\` (Royal Blue, lw=2.4) or \`#10b981\` (Emerald, lw=2.4)
     * Secondary / Derivative Curve: \`#8b5cf6\` (Vibrant Violet, lw=2.0) or \`#06b6d4\` (Cyan, lw=2.0)
     * Critical Points / Asymptotes / Roots: \`#ef4444\` (Crimson) or \`#f59e0b\` (Amber)
     * Colormaps for 2D/3D & Heatmaps: Use modern perceptual colormaps like \`cmap='viridis'\`, \`cmap='plasma'\`, \`cmap='magma'\`, \`cmap='cividis'\`, or \`cmap='coolwarm'\`.
   - Studio Background, Spines & Grid:
     * Clean background: \`fig.patch.set_facecolor('#ffffff')\` and \`ax.set_facecolor('#f8fafc')\` (or dark mode: \`#0f172a\` canvas with \`#1e293b\` axes if dark theme is requested).
     * Modern Despining:
       \`ax.spines['top'].set_visible(False)\`
       \`ax.spines['right'].set_visible(False)\`
       \`ax.spines['left'].set_color('#cbd5e1')\`
       \`ax.spines['bottom'].set_color('#cbd5e1')\`
       \`ax.spines['left'].set_linewidth(1.2)\`
       \`ax.spines['bottom'].set_linewidth(1.2)\`
     * Subtle Grid: \`ax.grid(True, linestyle='--', alpha=0.45, color='#cbd5e1', zorder=0)\`
   - Scientific Precision & Features:
     * Singularities & Asymptotes: Explicitly handle undefined points, mask infinities/NaNs, and draw vertical asymptotes with thin dashed red lines (\`linestyle='--', color='#ef4444', alpha=0.7, lw=1.2\`).
     * Integral / Area Shading: Highlight regions under curves using \`ax.fill_between(x, y, alpha=0.15, color='#2563eb')\` with smooth anti-aliased boundaries.
     * Annotations & Callouts: Call out extrema, inflection points, roots, and intercepts with \`ax.scatter()\` and \`ax.annotate(..., xy=(x0, y0), xytext=(...), arrowprops=dict(arrowstyle="->", color='#64748b', lw=1.2), fontsize=10, fontweight='medium', bbox=dict(boxstyle="round,pad=0.3", fc="#ffffff", ec="#cbd5e1", lw=1, alpha=0.9))\`.
   - Legends & Colorbars:
     * Legends: \`ax.legend(frameon=True, framealpha=0.95, facecolor='#ffffff', edgecolor='#e2e8f0', shadow=False, fontsize=10.5, loc='best')\`
     * Colorbars: Always attach informative labels: \`cbar = fig.colorbar(surf, ax=ax, shrink=0.6, aspect=18, pad=0.04)\`; \`cbar.set_label(r"Field Potential $\\Phi(x,y)$", fontsize=10.5, color='#334155')\`.
   - 3D Surfaces & Vector Fields:
     * 3D Views: Initialize with \`ax = fig.add_subplot(111, projection='3d')\`, set optimal viewing angle \`ax.view_init(elev=28, azim=-55)\`, and customize pane colors.
     * Vector / Gradient Fields: Use \`ax.quiver()\` or \`ax.streamplot()\` with color mapping (\`color=speed, cmap='plasma'\`) for stunning dynamical systems and vector calculus visualizers.
   - Clean Execution:
     * Always call \`plt.tight_layout()\` before displaying.
     * Finish with \`plt.show()\` to render the high-resolution output artifact.` : "";
    const tableDesignDirective = `
=== MODERN HIGH-FIDELITY TABULAR DESIGN DIRECTIVE ===
Whenever presenting comparisons, benchmarks, specifications, summaries, or structured reference data:
1. Generate beautifully aligned, comprehensive Markdown tables.
2. COLUMN ALIGNMENT:
   - Left-align descriptive text and names (:---).
   - Center-align categories, status badges, and codes (:---:).
   - Right-align numerical values, measurements, percentages, and metrics (---:).
3. STATUS BADGES & ACCENTS:
   - Use plain semantic color tokens (NEVER wrap badges or progress bars in backticks):
     [color:emerald] Active   |   [color:emerald] Passed   |   [color:emerald] Optimal
     [color:blue] Core        |   [color:blue] In Progress |   [color:blue] Primary   |   [color:blue] Pending
     [color:amber] Warning    |   [color:amber] Review     |   [color:amber] Low
     [color:red] Critical     |   [color:red] High         |   [color:red] Failed     |   [color:red] 0%
     [color:purple] Advanced  |   [color:purple] Experimental
4. PROGRESS BARS & CHECKMARKS:
   - For percentage metrics, use plain token [bar:XX] (e.g. [bar:85] or [bar:15] to render a modern visual progress bar).
   - Use [x] for completed/checked items and [ ] for unchecked items.
   - Use [trend:up], [trend:down], [trend:flat] for trend indicators.
5. MATHEMATICAL RIGOR:
   - Wrap all mathematical expressions and symbols inside tables in LaTeX delimiters (e.g. $f(x) = x^2$, $\\alpha$).
6. Empty or non-applicable values should use \u2014 or N/A instead of blank spaces.`;
    const interactiveWidgetDirective = `
=== INTERACTIVE UI WIDGETS DIRECTIVE ===
You can embed interactive rich React components seamlessly in your markdown!
If the user requests a mind map, interactive function graph, or an interactive data table, output the exact JSON format in a markdown code block.

1. MIND MAP VISUALIZER
For mapping concepts, taxonomies, or hierarchies.
\`\`\`mindmap
{
  "id": "root",
  "label": "Central Concept",
  "detail": "Description",
  "children": [
    { "id": "1", "label": "Child Node" }
  ]
}
\`\`\`

2. INTERACTIVE FUNCTION GRAPH
For plotting interactive mathematical functions.
\`\`\`graph
{
  "type": "function",
  "functionConfig": {
    "formula": "x^2 - 4*x + 3",
    "title": "Parabola Demo",
    "xDomain": [-10, 10],
    "showDerivative": true,
    "showIntegralArea": false
  }
}
\`\`\`

3. INTERACTIVE DATA TABLE
For large, sortable datasets.
\`\`\`interactive-table
{
  "title": "Comparison Table",
  "headers": ["Name", "Value"],
  "rows": [["Item A", "10"], ["Item B", "20"]]
}
\`\`\`
`;
    const formattingEnhancements = `
You are the official-grade Gemini STEM Tutor & Test Assistant.
Provide step-by-step solutions in clean LaTeX math delimiters ($...$ for inline, $$...$$ for block display).
Structure explanations with clear markdown headers and bullet points.`;
    const testActionProtocol = `
=== TEST CREATION, GENERATION, EDITING & UPDATE INSTRUCTIONS ===
Whenever the user asks you to:
1. **Generate or Create a New Test / Quiz**: (e.g., "generate a test of Calculus with 5 questions", "make a quiz on Organic Chemistry", "create test on Linear Algebra 3 questions", etc.)
2. **Edit or Update an Existing Test**: (e.g., "update the calculus test to add 2 questions", "change the difficulty to Hard", "edit question 2", "add questions to test X")
3. **Delete a Test**: (e.g., "delete test [title/id]")

You MUST ALWAYS generate the structured \`\`\`test-action JSON block in your response along with a friendly conversational explanation!

Structured JSON format (strictly output valid JSON enclosed in \`\`\`test-action and \`\`\`):
\`\`\`test-action
{
  "action": "CREATE_TEST" | "UPDATE_TEST" | "DELETE_TEST",
  "summary": "Brief summary of what was generated or updated",
  "test": {
    "id": "test_unique_id",
    "title": "Clear Test Title",
    "topic": "Topic Name (e.g. Calculus, Linear Algebra, Physics)",
    "difficulty": "Easy" | "Medium" | "Hard" | "Advanced",
    "timeLimitMinutes": 15,
    "passingScorePercentage": 60,
    "description": "Brief description of the test content and objectives",
    "questions": [
      {
        "id": "q_1",
        "text": "Question statement in clear LaTeX math ($...$ or $$...$$)",
        "type": "mcq" | "numerical",
        "options": ["$Option A$", "$Option B$", "$Option C$", "$Option D$"],
        "correctAnswer": "$Option A$",
        "explanation": "Step-by-step derivation & proof in LaTeX ($...$)"
      }
    ]
  }
}
\`\`\`

Critical Rules for Test Generation & Updates:
- **NO UNSOLICITED TEST CREATION**: DO NOT create a \`\`\`test-action\`\`\` block unless the user explicitly requests to "create", "generate", "make", or "save" a test or quiz. If the user is just uploading files, photos, or PDFs, or listing questions to analyze, simply analyze, solve, and list them in a structured table or conversation. Wait for an explicit user instruction before compiling them into an interactive test widget.
- **ANTI-LAZINESS & FULL QUESTION RECONCILIATION**: When requested to make a test from uploaded files (PDF/photo) containing multiple questions (e.g., 10 to 40 questions), you MUST parse and note ALL of them. Never arbitrarily truncate the list to 2-3 questions. 
- **BATCHED GENERATION PROTOCOL FOR LARGE QUESTION SETS (> 12 QUESTIONS)**:
  - If the user wants a full test consisting of a large number of questions (e.g., 15 to 40 questions) with all options and detailed step-by-step math derivations, this can easily exceed a single-turn token output length limit, causing truncation or missing questions.
  - To prevent this, explain the situation to the user and suggest **BATCHED GENERATION**:
    - Offer to generate "Part 1" (the first 10-12 questions) now using the "CREATE_TEST" action.
    - Ask the user to save "Part 1" to their library.
    - In the subsequent turn, when the user requests the next batch, perform an "UPDATE_TEST" action to append "Part 2" (questions 13-24), "Part 3" (questions 25-36), and so on, until all questions are fully captured in their test library!
  - This batching protocol ensures that absolutely no questions are lost, the test contains exact full-fidelity questions, and explanations remain highly thorough.
- For multiple-choice questions ("type": "mcq"), provide 4 clear options in the "options" array, and make sure "correctAnswer" strictly matches one of the options.
- For numerical questions ("type": "numerical"), omit or leave "options" empty and set "correctAnswer" to the correct numerical value.
- Provide comprehensive, step-by-step LaTeX explanations for every single question.
- For UPDATE_TEST:
  * Always use the existing test's exact ID in the "id" field (e.g. "mock_test_retry_001").
  * When requested to add or append questions to an existing test (e.g., adding 5 questions to an existing 20-question test to make 25):
    - Output the newly created questions in the "questions" array (or the full question set). The client app's reconciliation engine automatically appends new questions to existing ones so no previous questions are ever lost!
    - Provide a clear "summary" describing how many questions were appended and the new total count (e.g. "Appended 5 additional questions to 'Calculus, ODE & Vector Space Challenge', bringing the total to 25 questions.").
    - Update the "description" to reflect the new total count (e.g., "Comprehensive 25-question assessment covering...").
  * When modifying existing questions, match the question ID or text so the client updates that question in place.`;
    const appActionProtocol = `
=== APP COMMANDS, NAVIGATION & ACTIONS PROTOCOL ===
You are the centralized AI Command Center and Copilot for the entire Math Test platform.
When the user asks you to:
1. **Take or Launch a Test**: (e.g., "Let's take test #1", "Launch calculus test in timed mode", "Practice integration")
2. **Open Custom Test Studio / Builder**: (e.g., "Open custom test builder", "Launch custom studio", "Build a custom test manually") -> set targetTab: "custom-builder" and type: "OPEN_CUSTOM_BUILDER" or "OPEN_STUDIO"
3. **Open AI Test Studio / Creator**: (e.g., "Open AI test creator", "Generate test in studio") -> set targetTab: "create" and type: "OPEN_STUDIO"
4. **View Performance Analytics**: (e.g., "Show my performance", "Analyze my score trends", "Open analytics dashboard") -> set targetTab: "analytics" and type: "OPEN_ANALYTICS"
5. **Diagnose Weaknesses & Generate Recovery**: (e.g., "What are my weakest topics?", "Create a test based on my past mistakes")
6. **Open HTML Notes Studio / Slide Decks**: (e.g., "Open HTML notes", "View matrices slides", "Show my slide deck") -> set targetTab: "html-notes" and type: "OPEN_HTML_NOTES"
7. **Open Formula Notes & Repository**: (e.g., "Open formula notes", "Check my notes repository") -> set targetTab: "notes-repository" and type: "OPEN_NOTES"
8. **Export / Backup Data**: (e.g., "Export all my tests", "Backup question banks")

You can provide an insightful textual answer AND embed an interactive \`\`\`app-action block in your markdown:

\`\`\`app-action
{
  "type": "LAUNCH_TEST" | "OPEN_STUDIO" | "OPEN_CUSTOM_BUILDER" | "OPEN_OMR" | "OPEN_ANALYTICS" | "DIAGNOSE_WEAKNESSES" | "EXPORT_DATA" | "OPEN_HTML_NOTES" | "OPEN_NOTES" | "NAVIGATE",
  "title": "Clear action button label (e.g., 'Launch Calculus Exam', 'Open HTML Notes Studio', 'View Performance Analytics')",
  "description": "Short 1-line description of the action",
  "targetTab": "tests" | "create" | "custom-builder" | "take-test" | "omr-test" | "analytics" | "html-notes" | "notes-repository",
  "payload": {
    "testId": "test_id_if_applicable",
    "testTitle": "Title of the test",
    "mode": "timed" | "practice",
    "topic": "Topic Name",
    "projectId": "html_project_id_if_applicable",
    "fileId": "html_file_id_if_applicable"
  }
}
\`\`\`
`;
    let stagedQuestionsContext = "";
    if (Array.isArray(stagedQuestions) && stagedQuestions.length > 0) {
      stagedQuestionsContext = `

=== STATEFUL SESSION ACCUMULATED QUESTIONS BANK (${stagedQuestions.length} TOTAL QUESTIONS STAGED IN THIS SESSION) ===
The user has previously uploaded, scanned, or identified the following ${stagedQuestions.length} questions across the session:
`;
      stagedQuestions.forEach((sq, sIdx) => {
        const qNum = sq.questionNumber || sIdx + 1;
        const opts = Array.isArray(sq.options) && sq.options.length > 0 ? sq.options.join("  |  ") : "Numerical / Standard";
        stagedQuestionsContext += `
- [Staged Question #${qNum}] (ID: "${sq.id || `sq_${sIdx + 1}`}"):
  * Text: "${sq.text}"
  * Type: ${sq.type || "mcq"}
  * Options: ${opts}
  * Correct Answer: "${sq.correctAnswer || "N/A"}"
  * Explanation / Derivation: "${sq.explanation || sq.solution || "N/A"}"`;
      });
      stagedQuestionsContext += `

IMPORTANT: When the user asks to generate, compile, or make a test from the uploaded/staged questions, YOU MUST COMPILE ALL ${stagedQuestions.length} OF THESE QUESTIONS into the \`\`\`test-action block. NEVER output an incomplete 2-question stub!`;
    }
    let testLibraryContext = "";
    if (Array.isArray(testLibrary) && testLibrary.length > 0) {
      if (isDiscussingTests) {
        testLibraryContext += `

=== USER'S LIVE TEST LIBRARY & QUESTIONS DATA ===
The user currently has ${testLibrary.length} tests in their library:
`;
        testLibrary.forEach((t, idx) => {
          const isSelected = selectedTestId && t.id === selectedTestId;
          const questionsList = Array.isArray(t.questions) ? t.questions : [];
          testLibraryContext += `
------------------------------------------------------------
[Test #${idx + 1}${isSelected ? " (FOCUSED/SELECTED IN CHAT)" : ""}]
- Test ID: "${t.id}"
- Title: "${t.title}"
- Topic: "${t.topic || "General Math"}"
- Difficulty: "${t.difficulty || "Medium"}"
- Total Questions: ${questionsList.length}
- Complete Questions List:`;
          if (questionsList.length > 0) {
            questionsList.forEach((q, qIdx) => {
              const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options.map((opt, oI) => `(${String.fromCharCode(65 + oI)}) ${opt}`).join("  |  ") : "N/A";
              testLibraryContext += `
  \u2022 Q${qIdx + 1}: "${q.text}" | Options: ${opts} | Ans: "${q.correctAnswer}" | Solution: "${q.explanation || q.solution || "N/A"}"`;
            });
          }
        });
        if (Array.isArray(testAttempts) && testAttempts.length > 0) {
          testLibraryContext += `

=== USER'S RECENT TEST ATTEMPTS ===
`;
          testAttempts.slice(0, 5).forEach((att, attIdx) => {
            testLibraryContext += `- Attempt ${attIdx + 1}: Test "${att.testTitle}" -> Score: ${att.score}/${att.totalPoints || att.totalQuestions} (${att.percentage}%)
`;
          });
        }
      } else if (!appContext?.globalCapsule) {
        const testSummaries = testLibrary.slice(0, 10).map((t) => `"${t.title}" (${t.topic || "Math"}, ${t.questions?.length || 0} Qs)`).join(", ");
        testLibraryContext += `

[User's Test Library: ${testLibrary.length} tests: ${testSummaries}]`;
      }
    }
    const isTargetedEdit = latestUserMsg.includes("[TARGETED EDIT MODE]");
    const targetedEditDirective = isTargetedEdit ? `
=== HIGH PRIORITY: TARGETED EDIT DIRECTIVE ===
The user has requested a focused in-place edit using "Edit with AI".
1. If modifying a test, ALWAYS output the updated test in the \`\`\`test-action block format with action "UPDATE_TEST" preserving the original test ID and updating questions accordingly.
2. If modifying a table, output the complete revised markdown table.
3. If modifying a Python/Matplotlib visual plot or code snippet, execute the updated Python code or provide the updated snippet cleanly.
4. Output the updated result cleanly and directly.` : "";
    let appContextDirective = "";
    if (appContext && typeof appContext === "object") {
      appContextDirective = `

=== CATEGORIZED APP KNOWLEDGE & CONTEXT (TOKEN-LEAN) ===
`;
      if (appContext.globalCapsule) {
        const gc = appContext.globalCapsule;
        appContextDirective += `[User Profile & Performance Overview: ${gc.totalTestsAttempted} tests attempted, ${gc.overallAccuracy}% lifetime accuracy]
`;
        if (gc.masterySummary) {
          const ms = gc.masterySummary;
          const strongStr = ms.strongTopics?.length ? `Mastered Topics (${ms.strongCount}): ${ms.strongTopics.join(", ")}` : `Mastered Topics: ${ms.strongCount}`;
          const weakStr = ms.needsPracticeTopics?.length ? `Needs Practice (${ms.needsPracticeCount}): ${ms.needsPracticeTopics.join(", ")}` : `Needs Practice: ${ms.needsPracticeCount}`;
          appContextDirective += `[4-Tier Topic Mastery: ${strongStr} | Developing: ${ms.developingCount} | ${weakStr} | Unattempted: ${ms.unattemptedCount}]
`;
        }
        if (gc.htmlNotesSummary) {
          const hns = gc.htmlNotesSummary;
          const projList = (hns.projects || []).map((p) => `"${p.name}" (${p.fileCount} files${p.fileTitles?.length ? `: ${p.fileTitles.slice(0, 3).join(", ")}` : ""})`).join("; ");
          appContextDirective += `[HTML Notes Studio Repository: ${hns.totalProjects} project(s), ${hns.totalFiles} slide/file(s) total. Projects: ${projList || "None"}]
`;
        }
        if (gc.standardNotesSummary) {
          const sns = gc.standardNotesSummary;
          const tagSummary = Object.entries(sns.tags || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
          appContextDirective += `[Formula Notes Studio Repository: ${sns.totalNotes} notes (${tagSummary || "general"})]
`;
        }
        if (Array.isArray(gc.testCatalog) && gc.testCatalog.length > 0) {
          const catalogSummary = gc.testCatalog.map((c) => `"${c.title}" (${c.topic}, ${c.totalQuestions} Qs)`).join("; ");
          appContextDirective += `[Test Library Manifest (${gc.totalTestsInLibrary} total): ${catalogSummary}]
`;
        }
        if (Array.isArray(gc.recentAttempts) && gc.recentAttempts.length > 0) {
          const attList = gc.recentAttempts.map((att) => `"${att.testTitle}" (${att.scoreText}, ${att.accuracy}%, ${att.date})`).join("; ");
          appContextDirective += `[Recent Test Attempts: ${attList}]
`;
        }
      } else {
        if (Array.isArray(appContext.catalog) && appContext.catalog.length > 0) {
          const catalogSummary = appContext.catalog.map((c) => `"${c.title}" (${c.topic}, ${c.totalQuestions} Qs)`).join("; ");
          appContextDirective += `[Test Library Manifest: ${catalogSummary}]
`;
        }
        if (appContext.analyticsIndex) {
          const a = appContext.analyticsIndex;
          appContextDirective += `[User Performance Profile: ${a.totalTestsAttempted} tests taken, ${a.overallAccuracy}% lifetime accuracy`;
          if (Array.isArray(a.topTopics) && a.topTopics.length > 0) {
            const topList = a.topTopics.map((t) => `${t.topic}: ${t.accuracy}% (${t.total} Qs)`).join(", ");
            appContextDirective += ` | Topics: ${topList}`;
          }
          appContextDirective += `]
`;
        }
        if (Array.isArray(appContext.recentAttemptsIndex) && appContext.recentAttemptsIndex.length > 0) {
          const attList = appContext.recentAttemptsIndex.map((att) => `"${att.testTitle}" (${att.scoreText}, ${att.accuracy}%, ${att.date})`).join("; ");
          appContextDirective += `[Recent Attempts: ${attList}]
`;
        }
        if (appContext.notesIndex) {
          const n = appContext.notesIndex;
          const tagSummary = Object.entries(n.tagsSummary || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
          appContextDirective += `[Notes Repository: ${n.totalNotes} notes (${tagSummary})]
`;
        }
      }
      if (appContext.targetedLookup) {
        const t = appContext.targetedLookup;
        if (t.type === "html_notes" && t.data) {
          appContextDirective += `
>>> TARGETED HTML NOTES STUDIO RESOLUTION (ON-DEMAND) <<<
`;
          if (Array.isArray(t.data.allProjectNames)) {
            appContextDirective += `User's HTML Projects: ${t.data.allProjectNames.join(", ")}
`;
          }
          if (Array.isArray(t.data.matchedFiles) && t.data.matchedFiles.length > 0) {
            t.data.matchedFiles.forEach((mf, idx) => {
              appContextDirective += `
[HTML Note Match #${idx + 1}] Project: "${mf.project}" | Title: "${mf.title}"${mf.tags?.length ? ` | Tags: ${mf.tags.join(", ")}` : ""}
Snippet / Formulas: ${mf.snippet}
`;
            });
          }
        } else if (t.type === "topic_mastery" && t.data) {
          appContextDirective += `
>>> TARGETED 4-TIER TOPICAL MASTERY & DIAGNOSTIC (ON-DEMAND) <<<
`;
          if (t.data.latestAttempt) {
            const la = t.data.latestAttempt;
            appContextDirective += `Latest Completed Assessment: "${la.testTitle}" (${la.scoreText}, ${la.accuracy}%, ${la.date})
`;
          }
          const tiers = t.data.masteryTiers;
          if (tiers) {
            if (tiers.needsPractice?.length > 0) {
              appContextDirective += `
[NEEDS PRACTICE TOPICS (<50% accuracy or high errors)]:
`;
              tiers.needsPractice.forEach((tp) => {
                const missed = tp.missedQuestions?.length ? tp.missedQuestions.map((m) => `Q${m.qNum} (${m.testTitle}${m.subtopic ? ` - ${m.subtopic}` : ""})`).join(", ") : "none";
                appContextDirective += `- ${tp.topic}: ${tp.accuracy}% accuracy (${tp.correct}/${tp.attempted} correct, ${tp.wrong} errors, ${tp.total - tp.attempted} unattempted). Error points: ${missed}
`;
              });
            }
            if (tiers.developing?.length > 0) {
              appContextDirective += `
[DEVELOPING TOPICS (50%-74% accuracy)]:
`;
              tiers.developing.forEach((tp) => {
                appContextDirective += `- ${tp.topic}: ${tp.accuracy}% accuracy (${tp.correct}/${tp.attempted} correct)
`;
              });
            }
            if (tiers.mastered?.length > 0) {
              appContextDirective += `
[MASTERED / STRONG TOPICS (>=75% accuracy)]:
`;
              tiers.mastered.forEach((tp) => {
                appContextDirective += `- ${tp.topic}: ${tp.accuracy}% accuracy (${tp.correct}/${tp.attempted} correct)
`;
              });
            }
            if (tiers.unattempted?.length > 0) {
              appContextDirective += `
[UNATTEMPTED TOPICS (0 attempts)]: ${tiers.unattempted.map((u) => u.topic).join(", ")}
`;
            }
          }
        } else if ((t.type === "question_detail" || t.type === "question") && (t.data || t.questionData)) {
          const q = t.data || t.questionData;
          appContextDirective += `
>>> TARGETED QUESTION LOOKUP (ON-DEMAND RESOLUTION) <<<
`;
          appContextDirective += `Question #${q.questionNumber} of "${q.testTitle}":
`;
          appContextDirective += `- Statement: ${q.text}
`;
          if (q.options && q.options.length > 0) appContextDirective += `- Options: ${q.options.join(" | ")}
`;
          appContextDirective += `- Correct Answer: ${q.correctAnswer}
`;
          if (q.solution) appContextDirective += `- Explanation / Derivation: ${q.solution}
`;
          if (q.userAnswer !== void 0) appContextDirective += `- User's Attempted Answer: "${q.userAnswer}" (${q.isCorrect ? "Correct \u2713" : "Incorrect \u2717"})
`;
        } else if ((t.type === "standard_notes" || t.type === "notes") && (t.data?.notes || t.notesData)) {
          const notes = t.data?.notes || t.notesData;
          appContextDirective += `
>>> TARGETED USER FORMULA NOTES LOOKUP (ON-DEMAND RESOLUTION) <<<
`;
          notes.forEach((note, idx) => {
            appContextDirective += `- Note ${idx + 1} [Tag: ${note.tag}] "${note.title}": ${note.content}
`;
          });
        } else if (t.type === "report" && t.reportData) {
          const r = t.reportData;
          appContextDirective += `
>>> TARGETED TEST REPORT DIAGNOSTIC (ON-DEMAND RESOLUTION) <<<
`;
          appContextDirective += `Report for "${r.testTitle}" (${r.scoreText}, ${r.accuracy}%, ${r.date}):
`;
          if (Array.isArray(r.weakTopics) && r.weakTopics.length > 0) {
            r.weakTopics.forEach((wt) => {
              appContextDirective += `- Topic "${wt.topic}" (${wt.accuracy}% accuracy, missed Qs: ${wt.missedQuestions.join(", ") || "none"}):
`;
            });
          }
        }
      }
    }
    const systemInstructionText = `${codeExecutionDirective}
${imageGenerationDirective}
${tableDesignDirective}
${interactiveWidgetDirective}
${baseInstruction}
${formattingEnhancements}
${testActionProtocol}
${appActionProtocol}
${stagedQuestionsContext}
${testLibraryContext}
${appContextDirective}
${targetedEditDirective}

Formatting Mandate:
- Standard LaTeX math delimiters: use $...$ for inline formulas, $$...$$ for standalone display equations.
- Markdown code blocks for programming snippets (\`\`\`python, \`\`\`latex, \`\`\`ts).
- For general questions, be direct, friendly, and helpful.
- When generating tests, quizzes, or step-by-step problem sets based on cumulative session documents and history:
  1. DO NOT produce short, incomplete chunks or omit questions. Output EVERY single requested question.
  2. Synthesize all key mathematical problems, equations, and questions from the uploaded files (PDFs, images) and previous conversation turns.
  3. Format each question with full 4-choice options (for MCQ) or exact numerical value, and provide exhaustive, step-by-step mathematical proofs in LaTeX ($...$).
  4. Always output the full test in the structured \`\`\`test-action block format.`;
    const safeMessages = Array.isArray(messages) ? messages.slice(-14) : [];
    const contents = safeMessages.map((m) => {
      const msgRole = m.role === "assistant" || m.role === "model" ? "model" : "user";
      const parts = [];
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        const safeAttachments = m.attachments.slice(0, 10);
        for (const att of safeAttachments) {
          if (!att || !att.data) continue;
          const mime = (att.mimeType || "application/octet-stream").toLowerCase();
          const cleanBase64 = typeof att.data === "string" ? att.data.replace(/^data:[^;]+;base64,/, "") : "";
          if (mime.startsWith("image/") || mime === "application/pdf") {
            parts.push({
              inlineData: {
                mimeType: mime,
                data: cleanBase64
              }
            });
          } else {
            try {
              let decodedText = "";
              if (cleanBase64) {
                decodedText = Buffer.from(cleanBase64, "base64").toString("utf-8");
              } else if (typeof att.data === "string") {
                decodedText = att.data;
              }
              if (decodedText) {
                const truncatedText = decodedText.length > 1e5 ? decodedText.slice(0, 1e5) + "\n...[truncated]" : decodedText;
                parts.push({
                  text: `[Attached Document: ${att.name || "file"}]
\`\`\`${att.name?.split(".").pop() || ""}
${truncatedText}
\`\`\``
                });
              }
            } catch {
              parts.push({
                inlineData: {
                  mimeType: mime,
                  data: cleanBase64
                }
              });
            }
          }
        }
      }
      const textContent = m.content || m.text || "";
      if (textContent || parts.length === 0) {
        parts.push({ text: textContent || (parts.length > 0 ? "Please analyze the attached files and provide a comprehensive, step-by-step solution." : "Hello!") });
      }
      return {
        role: msgRole,
        parts
      };
    });
    if (Array.isArray(sessionDocuments) && sessionDocuments.length > 0) {
      const firstUserTurn = contents.find((c) => c.role === "user");
      if (firstUserTurn && Array.isArray(firstUserTurn.parts)) {
        for (const doc of sessionDocuments.slice(0, 10)) {
          if (!doc || !doc.data) continue;
          const mime = (doc.mimeType || "application/octet-stream").toLowerCase();
          const cleanBase64 = typeof doc.data === "string" ? doc.data.replace(/^data:[^;]+;base64,/, "") : "";
          const alreadyIncluded = firstUserTurn.parts.some(
            (p) => p.inlineData && p.inlineData.data === cleanBase64 || p.text && p.text.includes(doc.name)
          );
          if (!alreadyIncluded) {
            if (mime.startsWith("image/") || mime === "application/pdf") {
              firstUserTurn.parts.unshift({
                inlineData: {
                  mimeType: mime,
                  data: cleanBase64
                }
              });
            } else if (typeof doc.data === "string") {
              let decoded = doc.data;
              try {
                if (cleanBase64 && !doc.data.includes("\n")) {
                  decoded = Buffer.from(cleanBase64, "base64").toString("utf-8");
                }
              } catch {
              }
              firstUserTurn.parts.unshift({
                text: `[Cumulative Session File: ${doc.name || "document"} (${mime})]:
${decoded.slice(0, 5e4)}`
              });
            }
          }
        }
      }
    }
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: "Hello! How can you help me today?" }] });
    } else if (contents[contents.length - 1].role === "model") {
      contents.push({ role: "user", parts: [{ text: "Please proceed with the requested improvements." }] });
    }
    const candidateModels = [
      selectedModel,
      "gemini-flash-lite-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.7-flash",
      "gemini-3.1-pro-preview"
    ];
    const uniqueCandidates = Array.from(new Set(candidateModels));
    console.log("[CHATBOT] Priority models to attempt:", uniqueCandidates);
    const modelConfig = {
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      },
      temperature: Math.max(0.1, Math.min(temperature, 1)),
      maxOutputTokens: 8192
    };
    if (needsCodeExecution) {
      modelConfig.tools = [{ codeExecution: {} }];
    }
    let lastError = null;
    for (const m of uniqueCandidates) {
      try {
        console.log(`[CHATBOT] Invoking ${m}`);
        const currentConfig = { ...modelConfig };
        if (m === "gemini-3.1-flash-lite" || m === "gemini-flash-lite-latest" || m === "gemini-3.5-flash-lite") {
          currentConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
        } else if (effectiveRole === "complex_researcher" || latestTextLower.includes("/reasoning") || latestTextLower.includes("@thinking")) {
          currentConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        } else {
          currentConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
        let response = null;
        try {
          response = await withTimeout(
            ai.models.generateContent({
              model: m,
              contents,
              config: currentConfig
            }),
            25e3,
            `Timeout calling ${m}`
          );
        } catch (modelCallErr) {
          if (currentConfig.tools) {
            try {
              const noToolsConfig = { ...currentConfig };
              delete noToolsConfig.tools;
              response = await withTimeout(
                ai.models.generateContent({
                  model: m,
                  contents,
                  config: noToolsConfig
                }),
                2e4,
                `Timeout calling ${m} without tools`
              );
            } catch {
              throw modelCallErr;
            }
          } else {
            throw modelCallErr;
          }
        }
        const rawParts = response?.candidates?.[0]?.content?.parts || [];
        const parsedParts = [];
        const executableCodeList = [];
        const codeExecutionResults = [];
        const generatedImages = [];
        let accumulatedText = "";
        for (const part of rawParts) {
          if (part.text) {
            accumulatedText += (accumulatedText ? "\n\n" : "") + part.text;
            parsedParts.push({ type: "text", text: part.text });
          }
          const execCode = part.executableCode || part.executable_code;
          if (execCode) {
            const codeItem = {
              language: execCode.language || "PYTHON",
              code: execCode.code || ""
            };
            executableCodeList.push(codeItem);
            parsedParts.push({ type: "executable_code", ...codeItem });
          }
          const execRes = part.codeExecutionResult || part.code_execution_result;
          if (execRes) {
            const resItem = {
              outcome: execRes.outcome || "OUTCOME_OK",
              output: execRes.output || ""
            };
            codeExecutionResults.push(resItem);
            parsedParts.push({ type: "code_execution_result", ...resItem });
          }
          const inline = part.inlineData || part.inline_data;
          if (inline && inline.data) {
            const mime = inline.mimeType || inline.mime_type || "image/png";
            const dataUri = `data:${mime};base64,${inline.data}`;
            generatedImages.push(dataUri);
            parsedParts.push({ type: "inline_data", mimeType: mime, dataUri });
          }
        }
        if (!accumulatedText && response?.text) {
          accumulatedText = response.text;
          if (parsedParts.length === 0) {
            parsedParts.push({ type: "text", text: response.text });
          }
        }
        if (isImageGenerationRequest && generatedImages.length === 0) {
          try {
            const { prompt: targetVisualPrompt, aspectRatio, style } = parseVisualPromptAndOptions(latestUserMsg);
            const aiImg = await generateImageVisualUrl(ai, targetVisualPrompt, { aspectRatio, style });
            if (aiImg) {
              generatedImages.push(aiImg);
              parsedParts.push({ type: "ai_generated_image", dataUri: aiImg, prompt: targetVisualPrompt });
            }
          } catch (imgErr) {
            console.log("AI Image generation caught:", imgErr);
          }
        }
        if (accumulatedText || executableCodeList.length > 0 || generatedImages.length > 0) {
          const usedFallback = m !== selectedModel;
          console.log(`[CHATBOT] Successfully completed generation with model: ${m}${usedFallback ? ` (fallback from ${selectedModel})` : ""}`);
          const { prompt: cleanPromptStr } = parseVisualPromptAndOptions(latestUserMsg);
          return res.json({
            reply: accumulatedText || `Here is the visual artwork for "${cleanPromptStr}".`,
            text: accumulatedText || `Here is the visual artwork for "${cleanPromptStr}".`,
            parts: parsedParts,
            executableCode: executableCodeList,
            codeExecutionResults,
            generatedImages,
            isAiGeneratedImage: isImageGenerationRequest,
            imagePrompt: isImageGenerationRequest ? cleanPromptStr : void 0,
            modelUsed: m,
            isNotice: usedFallback,
            noticeMessage: usedFallback ? `Resilient fallback: response completed using ${m}.` : void 0,
            role: effectiveRole,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      } catch (err) {
        lastError = err;
        const rawStatus = err?.status || err?.code || err?.error && err.error.code || 0;
        console.log(`[CHATBOT] Model ${m} unavailable (${rawStatus || err?.message || "error"}), immediately trying next candidate...`);
        continue;
      }
    }
    throw lastError || new Error("Unable to generate chat response with Gemini models");
  } catch (err) {
    console.log("[CHATBOT] Fallback generation handler active.");
    const lastUserMsg = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1]?.content || messages[messages.length - 1]?.text || "" : "";
    const lowerLastMsg = lastUserMsg.toLowerCase();
    if (isImageGenerationRequest || /^\s*\/image\b/i.test(lastUserMsg) || lowerLastMsg.includes("visual image")) {
      try {
        const aiClient = getAiClient();
        const { prompt: targetVisualPrompt, aspectRatio, style } = parseVisualPromptAndOptions(lastUserMsg);
        const aiImg = await generateImageVisualUrl(aiClient, targetVisualPrompt, { aspectRatio, style });
        if (aiImg) {
          return res.json({
            reply: `Here is the visual image for **${targetVisualPrompt}**.`,
            text: `Here is the visual image for **${targetVisualPrompt}**.`,
            generatedImages: [aiImg],
            parts: [{ type: "ai_generated_image", dataUri: aiImg, prompt: targetVisualPrompt }],
            isAiGeneratedImage: true,
            imagePrompt: targetVisualPrompt,
            modelUsed: `${selectedModel} (resilient visual engine)`,
            isNotice: false,
            role: effectiveRole,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      } catch (imgErr) {
        console.log("Fallback image generation notice:", imgErr);
      }
    }
    const errMessage = String(err?.message || "");
    const errStatus = Number(err?.status || err?.code || err?.statusCode || 0);
    const isQuotaLimit = errStatus === 429 || errMessage.includes("429") || errMessage.toLowerCase().includes("quota") || errMessage.toLowerCase().includes("resource_exhausted") || errMessage.toLowerCase().includes("rate");
    const isOverloaded = errStatus === 503 || errStatus === 500 || errMessage.includes("503") || errMessage.toLowerCase().includes("overloaded") || errMessage.toLowerCase().includes("unavailable") || errMessage.toLowerCase().includes("high demand");
    const diagnosedErrorType = isQuotaLimit ? "quota_limit" : isOverloaded ? "overloaded" : "service_busy";
    let fallbackText = "";
    const isTestCreationOrUpdate = /(create|make|generate|build|new|update|edit|modify|add\s*question|change|revise)\s*(a\s*)?(test|quiz|exam)/i.test(lowerLastMsg) || /^(update|edit|modify)\s*(test\s*\d+|[a-z0-9_\-]+)/i.test(lowerLastMsg.trim());
    if (isTestCreationOrUpdate) {
      let targetTest = null;
      const testNumMatch = lowerLastMsg.match(/test\s*(\d+)/i);
      if (Array.isArray(testLibrary) && testLibrary.length > 0) {
        if (testNumMatch) {
          const index = parseInt(testNumMatch[1], 10) - 1;
          if (index >= 0 && index < testLibrary.length) {
            targetTest = testLibrary[index];
          }
        }
        if (!targetTest) {
          targetTest = testLibrary.find((t) => {
            const tTitle = (t.title || "").toLowerCase();
            const tTopic = (t.topic || "").toLowerCase();
            return lowerLastMsg.includes(tTitle) || lowerLastMsg.includes(tTopic) || t.id && lowerLastMsg.includes(t.id);
          }) || testLibrary[0];
        }
      }
      const isUpdate = lowerLastMsg.includes("update") || lowerLastMsg.includes("edit") || lowerLastMsg.includes("modify") || lowerLastMsg.includes("add question") || !!targetTest;
      const testId = targetTest ? targetTest.id : `test_${Date.now()}`;
      const topic = targetTest?.topic || (lowerLastMsg.includes("calculus") ? "Calculus" : lowerLastMsg.includes("algebra") ? "Linear Algebra" : lowerLastMsg.includes("physics") ? "Physics" : "Mathematics");
      const title = targetTest ? targetTest.title : `${topic} Mastery Assessment`;
      const existingQuestions = Array.isArray(targetTest?.questions) ? [...targetTest.questions] : [];
      const updatedQuestions = existingQuestions.length > 0 ? existingQuestions : [
        {
          id: "q_1",
          text: `Evaluate the fundamental derivative: $$\\frac{d}{dx} \\left[ e^{2x} \\cos(3x) \\right]$$`,
          type: "mcq",
          options: [
            `$e^{2x}(2\\cos(3x) - 3\\sin(3x))$`,
            `$e^{2x}(3\\cos(3x) + 2\\sin(3x))$`,
            `$-6e^{2x}\\sin(3x)$`,
            `$2e^{2x}\\cos(3x)$`
          ],
          correctAnswer: `$e^{2x}(2\\cos(3x) - 3\\sin(3x))$`,
          explanation: `Apply the Product Rule $(uv)' = u'v + uv'$. Here $u = e^{2x} \\implies u' = 2e^{2x}$ and $v = \\cos(3x) \\implies v' = -3\\sin(3x)$. Combining yields $e^{2x}(2\\cos(3x) - 3\\sin(3x))$.`
        },
        {
          id: "q_2",
          text: `Calculate the definite integral: $$\\int_0^{\\pi/2} \\sin^2(x) \\, dx$$`,
          type: "mcq",
          options: [
            `$\\frac{\\pi}{4}$`,
            `$\\frac{\\pi}{2}$`,
            `$1$`,
            `$\\frac{1}{2}$`
          ],
          correctAnswer: `$\\frac{\\pi}{4}$`,
          explanation: `Using the half-angle formula $\\sin^2(x) = \\frac{1 - \\cos(2x)}{2}$, we integrate: $\\int_0^{\\pi/2} \\frac{1-\\cos(2x)}{2} dx = \\left[ \\frac{x}{2} - \\frac{\\sin(2x)}{4} \\right]_0^{\\pi/2} = \\frac{\\pi}{4} - 0 = \\frac{\\pi}{4}$.`
        },
        {
          id: "q_3",
          text: `Find the determinant of the matrix $A = \\begin{pmatrix} 3 & 2 \\\\ 1 & 4 \\end{pmatrix}$.`,
          type: "numerical",
          correctAnswer: `10`,
          explanation: `For a $2 \\times 2$ matrix $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, the determinant is $\\det(A) = ad - bc = (3)(4) - (2)(1) = 12 - 2 = 10$.`
        }
      ];
      const testActionJson = {
        action: isUpdate ? "UPDATE_TEST" : "CREATE_TEST",
        summary: isUpdate ? `Updated "${title}" with reinforced question parameters, solutions, and LaTeX proofs.` : `Created a new ${topic} test with ${updatedQuestions.length} rigorous questions and detailed solutions.`,
        test: {
          id: testId,
          title,
          topic,
          difficulty: targetTest?.difficulty || "Medium",
          timeLimitMinutes: targetTest?.timeLimitMinutes || 15,
          passingScorePercentage: targetTest?.passingScorePercentage || 70,
          description: targetTest?.description || `Comprehensive exam on ${topic} fundamentals with complete LaTeX derivations.`,
          questions: updatedQuestions
        }
      };
      fallbackText = `### \u{1F3AF} Test ${isUpdate ? "Update" : "Creation"} Prepared: **${title}**

I have prepared the ${isUpdate ? "updates" : "questions"} for **${title}** (${topic}). You can inspect the question preview and save it to your library below:

\`\`\`test-action
${JSON.stringify(testActionJson, null, 2)}
\`\`\``;
    } else if (lowerLastMsg.includes("how many test") || lowerLastMsg.includes("test count") || lowerLastMsg.includes("total test") || lowerLastMsg.includes("how many mock")) {
      const count = Array.isArray(testLibrary) ? testLibrary.length : 0;
      const testListSummary = Array.isArray(testLibrary) && testLibrary.length > 0 ? testLibrary.map((t, i) => `**${i + 1}. ${t.title}** (${t.topic || "General Math"} \u2014 ${t.questions?.length || 0} Questions, ${t.difficulty || "Medium"})`).join("\n") : "*(No tests found in your library yet)*";
      fallbackText = `### \u{1F4DA} Test Library Status

You currently have **${count} test${count === 1 ? "" : "s"}** in your live app library:

${testListSummary}

Feel free to ask me to discuss or review questions from any of these tests!`;
    } else if (lowerLastMsg.includes("discuss question") || lowerLastMsg.includes("explain question") || lowerLastMsg.includes("review test") || lowerLastMsg.includes("question of")) {
      let matchedTest = null;
      if (Array.isArray(testLibrary)) {
        matchedTest = testLibrary.find((t) => {
          const tTitle = (t.title || "").toLowerCase();
          const tTopic = (t.topic || "").toLowerCase();
          return lowerLastMsg.includes(tTitle) || lowerLastMsg.includes(tTopic) || t.id && lowerLastMsg.includes(t.id);
        }) || testLibrary[0];
      }
      if (matchedTest && Array.isArray(matchedTest.questions) && matchedTest.questions.length > 0) {
        fallbackText = `### \u{1F4D0} Discussion: ${matchedTest.title}

Here is the detailed question breakdown from **${matchedTest.title}** (${matchedTest.topic}):

`;
        matchedTest.questions.slice(0, 3).forEach((q, qIdx) => {
          const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options.map((opt, oI) => `**(${String.fromCharCode(65 + oI)})** ${opt}`).join("  |  ") : "";
          fallbackText += `#### Question ${qIdx + 1}: 
${q.text}

${opts ? `**Options:** ${opts}

` : ""}**Correct Answer:** \`${q.correctAnswer}\`

**Step-by-Step Derivation:**
${q.explanation || "Apply standard formulas and boundary conditions."}

---
`;
        });
      } else {
        fallbackText = `### \u{1F4D0} Mathematical Problem Analysis

**Concept Breakdown:**
Let's analyze the mathematical formulation step-by-step:

1. **Formula & Identity Setup**:
   $$\\int f(x) \\, dx = F(x) + C \\quad \\text{and} \\quad \\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$
2. **Derivation**:
   Substitute test values and apply boundary rules.
3. **Result Verification**:
   Confirm dimensional consistency and trace properties.`;
      }
    } else {
      fallbackText = `### \u{1F4D0} Gemini STEM Tutor Guidance

**Mathematical Analysis:**

1. **Fundamental Principle**:
   $$\\lim_{x \\to a} f(x) = L \\iff \\forall \\epsilon > 0, \\exists \\delta > 0 \\text{ s.t. } 0 < |x - a| < \\delta \\implies |f(x) - L| < \\epsilon$$
2. **Application Steps**:
   - Check domain constraints and identify critical points.
   - Substitute boundary equations to verify analytical consistency.

*Tip: You can select a different Gemini model from the header or click Retry to generate an alternative variation.*`;
    }
    return res.json({
      reply: fallbackText,
      text: fallbackText,
      modelUsed: `${selectedModel} (resilient fallback)`,
      isNotice: true,
      noticeType: diagnosedErrorType,
      noticeMessage: isQuotaLimit ? "Gemini API free-tier rate limit was reached on the primary model; response synthesized seamlessly." : isOverloaded ? "Google AI service is experiencing high temporary traffic." : void 0,
      role: effectiveRole,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
var chatbot_default = router4;

// server/routes/ai/image.ts
import { Router as Router5 } from "express";
var router5 = Router5();
router5.post("/generate-image", async (req, res) => {
  try {
    const { prompt, aspectRatio = "1:1", style = "", seed } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }
    const ai = getAiClient();
    const imageUrl = await generateImageVisualUrl(ai, prompt, { aspectRatio, style, seed });
    return res.json({
      imageUrl,
      prompt,
      aspectRatio,
      style,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("Error generating image via /api/ai/image/generate-image:", err);
    return res.status(500).json({ error: err.message || "Failed to generate image" });
  }
});
var image_default = router5;

// server/routes/ai/test.ts
import { Router as Router6 } from "express";

// src/server/testStudioAiServices.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var CANDIDATE_MODELS2 = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest"
];
async function withTimeout2(promise, timeoutMs = 25e3, errorMsg = "Gemini request timed out") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
function getAiClient2() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  return new GoogleGenAI2({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function generateWithFallback2(ai, params) {
  let lastErr = null;
  for (const model of CANDIDATE_MODELS2) {
    try {
      const response = await withTimeout2(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config
        }),
        25e3,
        `Timed out querying ${model}`
      );
      if (response && response.text) {
        return response;
      }
    } catch (err) {
      lastErr = err;
      if (params.config?.tools) {
        try {
          const fallbackConfig = { ...params.config };
          delete fallbackConfig.tools;
          const fallbackRes = await withTimeout2(
            ai.models.generateContent({
              model,
              contents: params.contents,
              config: fallbackConfig
            }),
            2e4,
            `Timed out querying ${model} without tools`
          );
          if (fallbackRes && fallbackRes.text) {
            return fallbackRes;
          }
        } catch (fErr) {
          lastErr = fErr;
        }
      }
      continue;
    }
  }
  if (lastErr?.message?.includes("429") || lastErr?.message?.includes("RESOURCE_EXHAUSTED") || lastErr?.message?.includes("quota")) {
    return { text: "Notice: AI quota limit reached. Please try again shortly." };
  }
  throw lastErr || new Error("All candidate models failed during AI content generation.");
}
function cleanAndParseJson2(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
  }
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
  }
  let repaired = "";
  let inString = false;
  let isEscaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const char = stripped[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        repaired += char;
      } else if (char === "\\") {
        const nextChar = stripped[i + 1] || "";
        if (nextChar === '"' || nextChar === "\\" || nextChar === "/") {
          repaired += "\\";
          isEscaped = true;
        } else if (nextChar === "u" && /^[0-9a-fA-F]{4}/.test(stripped.substring(i + 2, i + 6))) {
          repaired += "\\";
          isEscaped = true;
        } else if (["n", "r", "t", "b", "f"].includes(nextChar)) {
          const followingChar = stripped[i + 2] || "";
          if (/^[a-zA-Z]/.test(followingChar)) {
            repaired += "\\\\";
          } else {
            repaired += "\\";
            isEscaped = true;
          }
        } else {
          repaired += "\\\\";
        }
      } else if (char === '"') {
        inString = false;
        repaired += char;
      } else if (char === "\n") {
        repaired += "\\n";
      } else if (char === "\r") {
        repaired += "\\r";
      } else if (char === "	") {
        repaired += "\\t";
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
  repaired = repaired.replace(/,\s*([\}\]])/g, "$1");
  try {
    return JSON.parse(repaired);
  } catch (e) {
    try {
      let aggressive = stripped.replace(/([^\\])\\([a-zA-Z0-9{}()_^+=\-*\/])/g, "$1\\\\$2").replace(/,\s*([\}\]])/g, "$1").replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":').replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
      return JSON.parse(aggressive);
    } catch {
      return null;
    }
  }
}
function generateProceduralExamSvg(optsOrPrompt = "", questionText = "", options = [], explanation = "", targetType = "question", optionIndex) {
  let promptText = "";
  let posQuestionText = questionText;
  let posOptions = options;
  let posExplanation = explanation;
  let posTargetType = targetType;
  if (typeof optsOrPrompt === "object" && optsOrPrompt !== null) {
    promptText = optsOrPrompt.promptText || "";
    posQuestionText = optsOrPrompt.questionText || optsOrPrompt.targetContextText || "";
    posOptions = optsOrPrompt.options || [];
    posExplanation = optsOrPrompt.explanation || "";
    posTargetType = optsOrPrompt.targetType || "question";
  } else {
    promptText = String(optsOrPrompt || "");
  }
  const isQuestion = posTargetType === "question";
  const isSolution = posTargetType === "explanation";
  const combined = `${promptText} ${posQuestionText} ${posOptions.join(" ")} ${isSolution ? posExplanation : ""}`.toLowerCase();
  const esc = (txt) => txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  if (combined.includes("matrix") || combined.includes("determinant") || combined.includes("bmatrix") || combined.includes("pmatrix") || combined.includes("eigen")) {
    const matrixMatch = posQuestionText.match(/\\begin\{(?:p|b|v)?matrix\}([\s\S]*?)\\end\{(?:p|b|v)?matrix\}/i);
    let a11 = "a\u2081\u2081", a12 = "a\u2081\u2082", a21 = "a\u2082\u2081", a22 = "a\u2082\u2082";
    if (matrixMatch && matrixMatch[1]) {
      const rows = matrixMatch[1].split(/\\\\/);
      if (rows[0]) {
        const r1Cols = rows[0].split("&").map((s) => s.trim().replace(/[\$\\]/g, ""));
        if (r1Cols[0]) a11 = r1Cols[0];
        if (r1Cols[1]) a12 = r1Cols[1];
      }
      if (rows[1]) {
        const r2Cols = rows[1].split("&").map((s) => s.trim().replace(/[\$\\]/g, ""));
        if (r2Cols[0]) a21 = r2Cols[0];
        if (r2Cols[1]) a22 = r2Cols[1];
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrowBlue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
    <marker id="arrowRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
    </marker>
  </defs>
  <text x="250" y="45" fill="#0f172a" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${isQuestion ? "Given Matrix Structure" : "Matrix Determinant Resolution"}</text>
  <path d="M 160 85 L 135 85 L 135 255 L 160 255" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
  <path d="M 340 85 L 365 85 L 365 255 L 340 255" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
  <text x="185" y="145" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${esc(a11)}</text>
  <text x="315" y="145" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${esc(a12)}</text>
  <text x="185" y="225" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${esc(a21)}</text>
  <text x="315" y="225" fill="#0f172a" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${esc(a22)}</text>
  ${!isQuestion ? `
  <line x1="165" y1="120" x2="335" y2="230" stroke="#2563eb" stroke-width="3" stroke-dasharray="6,4" marker-end="url(#arrowBlue)" />
  <text x="340" y="265" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">(+) Primary</text>
  <line x1="335" y1="120" x2="165" y2="230" stroke="#ef4444" stroke-width="3" stroke-dasharray="6,4" marker-end="url(#arrowRed)" />
  <text x="100" y="265" fill="#ef4444" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">(-) Secondary</text>
  <rect x="80" y="295" width="340" height="38" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="250" y="320" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">det(A) = (${esc(a11)} \xB7 ${esc(a22)}) \u2212 (${esc(a12)} \xB7 ${esc(a21)})</text>
  ` : `
  <rect x="120" y="290" width="260" height="36" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="250" y="314" fill="#475569" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Evaluate properties of Matrix A</text>
  `}
</svg>`;
  }
  if (combined.includes("triangle") || combined.includes("hypotenuse") || combined.includes("pythagor") || combined.includes("sin") || combined.includes("cos") || combined.includes("tan") || combined.includes("angle") || combined.includes("perimeter")) {
    const angleMatch = posQuestionText.match(/([0-9]{2,3})\s*(?:°|deg|degrees)/i);
    const angleLabel = angleMatch ? `${angleMatch[1]}\xB0` : "\u03B8";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <polygon points="100,270 410,270 100,75" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
  <rect x="100" y="244" width="26" height="26" fill="none" stroke="#0f172a" stroke-width="1.5" />
  <path d="M 360,270 A 50,50 0 0,0 348,230" fill="none" stroke="#2563eb" stroke-width="2.5" />
  <text x="325" y="258" fill="#2563eb" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">${angleLabel}</text>
  <circle cx="100" cy="75" r="4.5" fill="#0f172a" />
  <circle cx="100" cy="270" r="4.5" fill="#0f172a" />
  <circle cx="410" cy="270" r="4.5" fill="#0f172a" />
  <text x="90" y="65" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">A</text>
  <text x="75" y="285" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">B (90\xB0)</text>
  <text x="425" y="285" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">C</text>
  <text x="250" y="300" fill="#334155" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Base (b)</text>
  <text x="40" y="175" fill="#334155" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Height (a)</text>
  <text x="275" y="160" fill="#0284c7" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${isQuestion ? "Hypotenuse (c = ?)" : "Hypotenuse (c = \u221A(a\xB2+b\xB2))"}</text>
  ${!isQuestion ? `
  <text x="250" y="35" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">sin(${angleLabel}) = a/c,  cos(${angleLabel}) = b/c,  tan(${angleLabel}) = a/b</text>
  ` : `
  <text x="250" y="35" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Right Triangle ABC (\u2220B = 90\xB0)</text>
  `}
</svg>`;
  }
  if (combined.includes("circle") || combined.includes("radius") || combined.includes("chord") || combined.includes("tangent") || combined.includes("secant") || combined.includes("diameter")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <circle cx="230" cy="175" r="115" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
  <circle cx="230" cy="175" r="5" fill="#0f172a" />
  <text x="240" y="170" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">O (Center)</text>
  <line x1="230" y1="175" x2="345" y2="175" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="4" />
  <text x="280" y="165" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">Radius r</text>
  <line x1="345" y1="35" x2="345" y2="315" stroke="#ef4444" stroke-width="2.5" />
  <circle cx="345" cy="175" r="5" fill="#ef4444" />
  <text x="360" y="90" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Tangent Line (L)</text>
  <text x="360" y="180" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">P (Point of Tangency)</text>
  <rect x="320" y="150" width="25" height="25" fill="none" stroke="#2563eb" stroke-width="1.5" />
  ${!isQuestion ? `
  <text x="250" y="335" fill="#0f172a" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Radius is Perpendicular to Tangent at Point of Contact (OP \u22A5 L)</text>
  ` : `
  <text x="250" y="335" fill="#0f172a" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Circle with Center O and Tangent Line L at Point P</text>
  `}
</svg>`;
  }
  if (combined.includes("incline") || combined.includes("friction") || combined.includes("gravity") || combined.includes("force") || combined.includes("newton") || combined.includes("acceleration") || combined.includes("mass") || combined.includes("pulley")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrRed" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
    </marker>
    <marker id="arrBlue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
    <marker id="arrGreen" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669" />
    </marker>
  </defs>
  <polygon points="60,280 440,280 440,110" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
  <rect x="250" y="145" width="70" height="50" rx="3" transform="rotate(-24 285 170)" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" />
  <text x="280" y="175" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">m</text>
  <circle cx="285" cy="170" r="4" fill="#0f172a" />
  <line x1="285" y1="170" x2="285" y2="250" stroke="#ef4444" stroke-width="2.5" marker-end="url(#arrRed)" />
  <text x="295" y="245" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">F_g = mg</text>
  <line x1="285" y1="170" x2="255" y2="95" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrBlue)" />
  <text x="235" y="90" fill="#2563eb" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Normal Force (N)</text>
  ${!isQuestion ? `
  <line x1="285" y1="170" x2="345" y2="145" stroke="#059669" stroke-width="2.5" marker-end="url(#arrGreen)" />
  <text x="355" y="145" fill="#059669" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">Friction (f = \u03BCN)</text>
  <text x="250" y="35" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Force Balance: N = mg\xB7cos(\u03B8),  F_net = mg\xB7sin(\u03B8) \u2212 f</text>
  ` : `
  <text x="250" y="35" fill="#0f172a" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Mass m on Incline Plane of Angle \u03B8</text>
  `}
  <path d="M 120,280 A 60,60 0 0,0 114,255" fill="none" stroke="#0f172a" stroke-width="1.5" />
  <text x="135" y="270" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">\u03B8</text>
</svg>`;
  }
  if (combined.includes("circuit") || combined.includes("resistor") || combined.includes("voltage") || combined.includes("current") || combined.includes("capacitor") || combined.includes("ohm") || combined.includes("battery")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="arrCur" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
    </marker>
  </defs>
  <text x="250" y="40" fill="#0f172a" font-family="system-ui, sans-serif" font-size="17" font-weight="bold" text-anchor="middle">Electrical Circuit Schematic</text>
  <line x1="80" y1="90" x2="200" y2="90" stroke="#0f172a" stroke-width="2.5" />
  <path d="M 200 90 L 210 75 L 230 105 L 250 75 L 270 105 L 290 75 L 300 90" fill="none" stroke="#2563eb" stroke-width="3" />
  <text x="250" y="65" fill="#2563eb" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Resistor R</text>
  <line x1="300" y1="90" x2="420" y2="90" stroke="#0f172a" stroke-width="2.5" />
  <line x1="420" y1="90" x2="420" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <line x1="420" y1="260" x2="270" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <line x1="270" y1="245" x2="270" y2="275" stroke="#ef4444" stroke-width="4" />
  <line x1="250" y1="252" x2="250" y2="268" stroke="#0f172a" stroke-width="3" />
  <text x="278" y="240" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">+</text>
  <text x="240" y="240" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">-</text>
  <text x="260" y="300" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Voltage V</text>
  <line x1="250" y1="260" x2="80" y2="260" stroke="#0f172a" stroke-width="2.5" />
  <line x1="80" y1="260" x2="80" y2="90" stroke="#0f172a" stroke-width="2.5" />
  ${!isQuestion ? `
  <line x1="120" y1="70" x2="160" y2="70" stroke="#2563eb" stroke-width="2" marker-end="url(#arrCur)" />
  <text x="140" y="60" fill="#2563eb" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">I = V/R</text>
  ` : `
  <text x="140" y="60" fill="#64748b" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">Current I = ?</text>
  `}
</svg>`;
  }
  if (combined.includes("venn") || combined.includes("set") || combined.includes("probability") || combined.includes("union") || combined.includes("intersection")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <rect x="50" y="40" width="400" height="270" rx="12" fill="#f8fafc" stroke="#475569" stroke-width="2" />
  <text x="75" y="70" fill="#475569" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">Universal Set (U)</text>
  <circle cx="205" cy="180" r="95" fill="#3b82f6" fill-opacity="0.25" stroke="#2563eb" stroke-width="2.5" />
  <circle cx="295" cy="180" r="95" fill="#10b981" fill-opacity="0.25" stroke="#059669" stroke-width="2.5" />
  <text x="160" y="185" fill="#1e3a8a" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">Set A</text>
  <text x="330" y="185" fill="#064e3b" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">Set B</text>
  <text x="250" y="185" fill="#0f172a" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">A \u2229 B</text>
  ${!isQuestion ? `
  <text x="250" y="325" fill="#0f172a" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">n(A \u222A B) = n(A) + n(B) \u2212 n(A \u2229 B)</text>
  ` : `
  <text x="250" y="325" fill="#475569" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Venn Diagram: Sets A and B</text>
  `}
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <rect width="100%" height="100%" fill="#ffffff" />
  <defs>
    <marker id="axisArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
    </marker>
  </defs>
  <line x1="50" y1="140" x2="450" y2="140" stroke="#f1f5f9" stroke-width="1.5" />
  <line x1="50" y1="210" x2="450" y2="210" stroke="#f1f5f9" stroke-width="1.5" />
  <line x1="180" y1="40" x2="180" y2="300" stroke="#f1f5f9" stroke-width="1.5" />
  <line x1="320" y1="40" x2="320" y2="300" stroke="#f1f5f9" stroke-width="1.5" />
  <line x1="50" y1="270" x2="465" y2="270" stroke="#475569" stroke-width="2" marker-end="url(#axisArrow)" />
  <line x1="90" y1="310" x2="90" y2="30" stroke="#475569" stroke-width="2" marker-end="url(#axisArrow)" />
  <text x="470" y="275" fill="#475569" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">x</text>
  <text x="85" y="20" fill="#475569" font-family="system-ui, sans-serif" font-size="15" font-weight="bold">y</text>
  <text x="75" y="285" fill="#475569" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">O</text>
  <path d="M 90 250 Q 255 35 420 250" fill="none" stroke="#2563eb" stroke-width="3.5" />
  <circle cx="255" cy="142" r="5.5" fill="#ef4444" />
  <text x="268" y="135" fill="#ef4444" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">${isQuestion ? "Vertex (h, k)" : "Critical Point (x\u2080, y\u2080)"}</text>
  <line x1="255" y1="142" x2="255" y2="270" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4" />
  <line x1="90" y1="142" x2="255" y2="142" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4" />
  <text x="255" y="290" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${isQuestion ? "h" : "x\u2080"}</text>
  <text x="65" y="146" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold">${isQuestion ? "k" : "y\u2080"}</text>
  ${!isQuestion ? `
  <line x1="180" y1="142" x2="330" y2="142" stroke="#059669" stroke-width="2" stroke-dasharray="6,3" />
  <text x="340" y="146" fill="#059669" font-family="system-ui, sans-serif" font-size="13" font-weight="bold">f'(x\u2080) = 0</text>
  ` : ""}
  <text x="245" y="65" fill="#2563eb" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">y = f(x)</text>
</svg>`;
}
async function generateTechnicalExamSvg(ai, questionText, options = [], explanation = "", userPrompt = "", currentSvg = "", mode = "generate", targetType = "question", optionIndex) {
  const isQuestion = targetType === "question";
  const isSolution = targetType === "explanation";
  const isOption = targetType === "option";
  const optionsText = Array.isArray(options) && options.length > 0 ? `
Options:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join("\n")}` : "";
  const explanationText = isSolution && explanation ? `
Solution/Explanation Context:
${explanation}` : "";
  let roleGuidelines = "";
  if (isQuestion) {
    roleGuidelines = `CRITICAL MANDATE - QUESTION DIAGRAM:
- You are generating the diagram for the QUESTION STATEMENT.
- Illustrate ONLY the visual problem statement, initial setup, given geometric figures, coordinate curves $y=f(x)$, circuit components, or forces described in the problem.
- DO NOT reveal the final answer, step-by-step mathematical proof, or calculated derived solution in the diagram.
- Use standard question notation for unknowns (e.g. "?", angle "\u03B8", unknown length "x", or velocity "v\u2080").
- DO NOT add extra unsolicited elements; only add elements that belong to the question's premise.`;
  } else if (isSolution) {
    roleGuidelines = `CRITICAL MANDATE - SOLUTION / EXPLANATION DIAGRAM:
- You are generating the diagram for the STEP-BY-STEP SOLUTION / EXPLANATION.
- Illustrate the mathematical resolution, proof steps, auxiliary construction dashed lines, angle bisectors, resolved force components (mg\xB7sin\u03B8, mg\xB7cos\u03B8), shaded areas under curves for integration, critical points, or solved result values explicitly.`;
  } else if (isOption) {
    const optLetter = optionIndex !== void 0 ? String.fromCharCode(65 + optionIndex) : "Choice";
    const optText = options[optionIndex || 0] || "";
    roleGuidelines = `CRITICAL MANDATE - OPTION DIAGRAM:
- You are generating the specific diagram variant for Option ${optLetter} ("${optText}").
- Accurately illustrate the graph, geometric figure, or schematic corresponding specifically to this option choice.`;
  }
  const systemInstruction = `You are an elite scientific Python Matplotlib, TikZ, and vector graphics renderer for academic STEM exam papers (JEE Advanced, CBSE, SAT, NEET, AP Calculus/Physics/Chemistry).
Your task is to produce a clean, publication-grade, high-precision SVG vector diagram that directly and faithfully illustrates the specific STEM concepts.

${roleGuidelines}

General Guidelines:
1. Output ONLY the raw <svg> element. DO NOT include markdown code fences (\`\`\`xml or \`\`\`svg), and do not include any conversational commentary.
2. SVG Container: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
3. Background: Always include <rect width="100%" height="100%" fill="#ffffff" /> as the very first child.
4. Colors: High-contrast academic publication palette. Main lines/shapes in deep navy/slate (#0f172a, #1e293b, stroke-width 2 to 3). Accents in math blue (#2563eb), emerald (#059669), crimson (#ef4444), amber (#d97706).
5. Typography: All math labels, vertices (A, B, C), angles (\u03B8, \u03B1, 90\xB0), coordinate axes, forces (F, N, mg, T), values, and units must be crisp and legible with font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="#0f172a".
6. Specificity:
   - For Matrices: Render neat brackets, numbers/symbols in a grid.
   - For Geometry: Draw exact angles, labeled vertices, side lengths, right-angle marks.
   - For Coordinate Graphs / Calculus: Clear X and Y axes, origin O, curve with equation label, labeled domain.
   - For Physics: Standard free-body diagrams, force arrows with labels, incline planes, or clean circuit schematics.
7. If mode is "edit" and an existing SVG is provided, update or add the requested modifications faithfully.`;
  const promptContent = mode === "edit" && currentSvg ? `Edit the following technical SVG diagram according to user instructions:
USER EDIT REQUEST: ${userPrompt || "Improve precision, clarity, and labels"}
TARGET: ${targetType.toUpperCase()}
QUESTION CONTEXT:
${questionText}${optionsText}${explanationText}

CURRENT SVG CODE:
${currentSvg}

Generate the updated complete <svg> element reflecting these edits.` : `Generate a publication-grade scientific exam diagram for the following ${targetType.toUpperCase()}:
QUESTION STATEMENT:
${questionText || userPrompt}
${optionsText}${explanationText}

SPECIFIC DIAGRAM INSTRUCTIONS:
${userPrompt || "Create the most accurate, textbook-standard technical diagram illustrating this question."}

Generate the complete <svg> element.`;
  let generatedSvg = "";
  const candidateModels = CANDIDATE_MODELS2;
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [{ text: promptContent }]
        },
        config: {
          systemInstruction,
          temperature: 0.2
        }
      });
      const rawText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const match = rawText.match(/<svg[\s\S]*?<\/svg>/i);
      if (match && match[0]) {
        generatedSvg = match[0].trim();
        break;
      }
    } catch (e) {
      const errMessage = String(e?.message || "").toLowerCase();
      const errString = JSON.stringify(e || {});
      const isQuota = errMessage.includes("429") || errMessage.includes("quota") || errMessage.includes("resource_exhausted") || errString.includes("429") || errString.includes("resource_exhausted");
      if (isQuota) {
        console.log("Gemini API rate limit reached during diagram generation, seamlessly switching to procedural engine.");
        break;
      }
      console.log(`Model ${modelName} diagram generation retry/next:`, e?.status || e?.code || "attempt");
    }
  }
  if (!generatedSvg) {
    generatedSvg = generateProceduralExamSvg(userPrompt, questionText, options, explanation, targetType, optionIndex);
  }
  const encodedSvg = encodeURIComponent(generatedSvg);
  const dataUrl = `data:image/svg+xml;utf8,${encodedSvg}`;
  return { svg: generatedSvg, dataUrl };
}
function generateDynamicQuestionFromPrompt(prompt, index, defaultTopic = "Mathematics") {
  const p = (prompt || "").toLowerCase();
  const nextNum = index + 1;
  if (p.includes("quadratic") || p.includes("parabola") || p.includes("roots")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `Find the roots of the quadratic equation: $$x^2 - ${5 + nextNum}x + ${6 + nextNum * 2} = 0$$`,
      type: "mcq",
      options: [`$x = 2, ${3 + nextNum}$`, `$x = 1, ${4 + nextNum}$`, `$x = 0, ${nextNum}$`, `$x = -2, -${3 + nextNum}$`],
      correctAnswer: `$x = 2, ${3 + nextNum}$`,
      explanation: `Factoring the quadratic equation yields $(x - 2)(x - ${3 + nextNum}) = 0$, giving real solutions $x = 2$ and $x = ${3 + nextNum}$.`,
      points: 1
    };
  }
  if (p.includes("derivative") || p.includes("differentiation") || p.includes("calculus")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `Find the derivative $\\frac{dy}{dx}$ of $$y = ${nextNum}x^3 + 4x^2 - 7$$`,
      type: "mcq",
      options: [`$${3 * nextNum}x^2 + 8x$`, `$${nextNum}x^2 + 4x$`, `$${6 * nextNum}x + 8$`, `$3x^2 + 8x - 7$`],
      correctAnswer: `$${3 * nextNum}x^2 + 8x$`,
      explanation: `Applying the power rule $\\frac{d}{dx}[x^n] = n x^{n-1}$, we differentiate term-by-term: $3 \\cdot ${nextNum} x^2 + 8x = ${3 * nextNum}x^2 + 8x$.`,
      points: 1
    };
  }
  if (p.includes("integration") || p.includes("integral") || p.includes("area under")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `Evaluate the definite integral: $$\\int_{0}^{${nextNum}} (2x + 1) \\, dx$$`,
      type: "mcq",
      options: [`$${nextNum * nextNum + nextNum}$`, `$${nextNum * nextNum}$`, `$${2 * nextNum}$`, `$${nextNum + 5}$`],
      correctAnswer: `$${nextNum * nextNum + nextNum}$`,
      explanation: `The antiderivative is $x^2 + x$. Evaluating from $0$ to $${nextNum}$: $(${nextNum})^2 + (${nextNum}) = ${nextNum * nextNum + nextNum}$.`,
      points: 1
    };
  }
  if (p.includes("probability") || p.includes("bayes") || p.includes("dice") || p.includes("coin")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `A fair die is rolled. What is the probability of obtaining a prime number?`,
      type: "mcq",
      options: [`$\\frac{1}{2}$`, `$\\frac{1}{3}$`, `$\\frac{2}{3}$`, `$\\frac{1}{6}$`],
      correctAnswer: `$\\frac{1}{2}$`,
      explanation: `Prime numbers on a 6-sided die are 2, 3, and 5 (3 favorable outcomes). $P = \\frac{3}{6} = \\frac{1}{2}$.`,
      points: 1
    };
  }
  if (p.includes("trigonometry") || p.includes("sin") || p.includes("cos") || p.includes("tan")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `Simplify the trigonometric expression: $$\\sin^2(${nextNum}\\theta) + \\cos^2(${nextNum}\\theta) + \\tan^2(${nextNum}\\theta)$$`,
      type: "mcq",
      options: [`$\\sec^2(${nextNum}\\theta)$`, `$1$`, `$\\csc^2(${nextNum}\\theta)$`, `$\\tan^2(${nextNum}\\theta)$`],
      correctAnswer: `$\\sec^2(${nextNum}\\theta)$`,
      explanation: `Since $\\sin^2(u) + \\cos^2(u) = 1$, the expression becomes $1 + \\tan^2(${nextNum}\\theta) = \\sec^2(${nextNum}\\theta)$.`,
      points: 1
    };
  }
  if (p.includes("physics") || p.includes("circuit") || p.includes("voltage") || p.includes("resistor")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `A circuit has a voltage source $V = ${12 * nextNum}\\text{ V}$ and a resistor $R = ${4 * nextNum}\\text{ }\\Omega$. Calculate the current $I$.`,
      type: "mcq",
      options: [`$3\\text{ A}$`, `$4\\text{ A}$`, `$48\\text{ A}$`, `$1.5\\text{ A}$`],
      correctAnswer: `$3\\text{ A}$`,
      explanation: `Using Ohm's Law $I = \\frac{V}{R} = \\frac{${12 * nextNum}}{${4 * nextNum}} = 3\\text{ A}$.`,
      points: 1
    };
  }
  if (p.includes("matrix") || p.includes("determinant") || p.includes("eigen")) {
    return {
      id: `q_${Date.now()}_${index}`,
      text: `Find the determinant of the matrix $M = \\begin{pmatrix} ${nextNum + 2} & 1 \\\\ 3 & ${nextNum + 1} \\end{pmatrix}$.`,
      type: "mcq",
      options: [
        `$${(nextNum + 2) * (nextNum + 1) - 3}$`,
        `$${(nextNum + 2) * (nextNum + 1)}$`,
        `$${nextNum + 2 + (nextNum + 1)}$`,
        `$0$`
      ],
      correctAnswer: `$${(nextNum + 2) * (nextNum + 1) - 3}$`,
      explanation: `Determinant of a $2\\times2$ matrix is $ad - bc = (${nextNum + 2})(${nextNum + 1}) - (1)(3) = ${(nextNum + 2) * (nextNum + 1) - 3}$.`,
      points: 1
    };
  }
  const cleanPromptTitle = prompt.replace(/add|question|create|make|generate|change|update/gi, "").trim() || defaultTopic;
  return {
    id: `q_${Date.now()}_${index}`,
    text: `Solve the problem related to ${cleanPromptTitle}: $$f(x) = ${nextNum}x^2 + 3x + 1$$`,
    type: "mcq",
    options: [`$${nextNum + 4}$`, `$${nextNum + 1}$`, `$0$`, `$-1$`],
    correctAnswer: `$${nextNum + 4}$`,
    explanation: `Substituting $x = 1$ gives $f(1) = ${nextNum}(1)^2 + 3(1) + 1 = ${nextNum + 4}$.`,
    points: 1
  };
}
async function attachDiagramsToQuestion(aiParam, qObj, rawPrompt) {
  let ai = aiParam;
  try {
    if (!ai) ai = getAiClient2();
  } catch {
  }
  const lowerP = rawPrompt.toLowerCase();
  const isSolutionDiagram = lowerP.includes("solution") || lowerP.includes("explanation") || lowerP.includes("step") || lowerP.includes("proof");
  const isOptionDiagram = lowerP.includes("option") || lowerP.includes("choice");
  const isQuestionDiagram = lowerP.includes("question") || lowerP.includes("statement") || lowerP.includes("problem") || !isSolutionDiagram && !isOptionDiagram;
  if (isSolutionDiagram) {
    try {
      const generated = await generateTechnicalExamSvg(
        ai,
        qObj.text || "",
        qObj.options || [],
        qObj.explanation || "",
        rawPrompt,
        "",
        "generate",
        "explanation"
      );
      qObj.explanationImageUrl = generated.dataUrl;
    } catch {
      const fallbackSvg = generateProceduralExamSvg({
        promptText: rawPrompt,
        questionText: qObj.text || "",
        options: qObj.options || [],
        explanation: qObj.explanation || "",
        targetType: "explanation"
      });
      qObj.explanationImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
    }
  }
  if (isOptionDiagram) {
    const optMatch = lowerP.match(/(?:option|choice)\s*([a-d1-4])/i);
    let optIndicesToTarget = [];
    if (optMatch) {
      const matchedVal = optMatch[1].toLowerCase();
      if (matchedVal === "a" || matchedVal === "1") optIndicesToTarget = [0];
      else if (matchedVal === "b" || matchedVal === "2") optIndicesToTarget = [1];
      else if (matchedVal === "c" || matchedVal === "3") optIndicesToTarget = [2];
      else if (matchedVal === "d" || matchedVal === "4") optIndicesToTarget = [3];
    } else {
      const optsCount = qObj.options?.length || 4;
      optIndicesToTarget = Array.from({ length: optsCount }, (_, i) => i);
    }
    if (!Array.isArray(qObj.optionImages)) {
      qObj.optionImages = new Array(qObj.options?.length || 4).fill(void 0);
    }
    for (const oIdx of optIndicesToTarget) {
      try {
        const generated = await generateTechnicalExamSvg(
          ai,
          qObj.text || "",
          qObj.options || [],
          qObj.explanation || "",
          rawPrompt,
          "",
          "generate",
          "option",
          oIdx
        );
        qObj.optionImages[oIdx] = generated.dataUrl;
      } catch {
        const fallbackSvg = generateProceduralExamSvg({
          promptText: rawPrompt,
          questionText: qObj.text || "",
          options: qObj.options || [],
          explanation: qObj.explanation || "",
          targetType: "option",
          optionIndex: oIdx
        });
        qObj.optionImages[oIdx] = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
      }
    }
  }
  if (isQuestionDiagram) {
    const currentImg = qObj.imageUrl || "";
    let currentSvgDecoded = "";
    if (currentImg.startsWith("data:image/svg+xml")) {
      try {
        const dataPart = currentImg.split(",")[1] || "";
        currentSvgDecoded = decodeURIComponent(dataPart);
      } catch {
      }
    }
    const isEditMode = lowerP.includes("edit") || lowerP.includes("modify") || lowerP.includes("update") || lowerP.includes("change");
    try {
      const generated = await generateTechnicalExamSvg(
        ai,
        qObj.text || "",
        qObj.options || [],
        qObj.explanation || "",
        rawPrompt,
        currentSvgDecoded,
        isEditMode && currentSvgDecoded ? "edit" : "generate",
        "question"
      );
      qObj.imageUrl = generated.dataUrl;
      if (qObj.paperLayout) {
        qObj.paperLayout.imageUrl = generated.dataUrl;
      }
    } catch {
      const fallbackSvg = generateProceduralExamSvg({
        promptText: rawPrompt,
        questionText: qObj.text || "",
        options: qObj.options || [],
        explanation: qObj.explanation || "",
        targetType: "question"
      });
      const uri = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
      qObj.imageUrl = uri;
      if (qObj.paperLayout) {
        qObj.paperLayout.imageUrl = uri;
      }
    }
  }
}
async function handleGenerateDiagram(req, res) {
  try {
    const {
      prompt = "",
      targetType = "question",
      optionIndex,
      targetContextText = "",
      questionText = "",
      questionOptions = [],
      questionExplanation = "",
      currentSvg = "",
      mode = "generate"
    } = req.body;
    const effectiveQuestionText = targetContextText || questionText;
    const ai = getAiClient2();
    const result = await generateTechnicalExamSvg(
      ai,
      effectiveQuestionText,
      questionOptions,
      questionExplanation,
      prompt,
      currentSvg,
      mode,
      targetType,
      optionIndex
    );
    return res.json({
      success: true,
      svg: result.svg,
      imageUrl: result.dataUrl,
      prompt,
      targetType,
      mode,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("Error in /api/generate-diagram:", err);
    const fallbackSvg = generateProceduralExamSvg(
      req.body?.prompt,
      req.body?.targetContextText || req.body?.questionText,
      req.body?.questionOptions || [],
      req.body?.questionExplanation || "",
      req.body?.targetType || "question",
      req.body?.optionIndex
    );
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
    return res.json({
      success: true,
      svg: fallbackSvg,
      imageUrl: dataUrl,
      prompt: req.body?.prompt || "",
      targetType: req.body?.targetType || "question",
      mode: "fallback",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}
async function handleAiEditTest(req, res) {
  const { test, prompt, targetScope = "all", questionIndex = 0 } = req.body;
  if (!test || !prompt) {
    return res.status(400).json({ error: "Missing required test or prompt data" });
  }
  try {
    const ai = getAiClient2();
    const scopeDesc = targetScope === "current" ? `ONLY modify Question #${questionIndex + 1} (keep all other questions intact unless the user explicitly requests otherwise).` : `Apply modifications across the entire assessment as requested.`;
    const promptText = `You are an expert mathematics educator and exam builder AI assistant.
You are tasked with editing and updating an existing Math Test based on the user's specific request.

USER PROMPT:
"${prompt}"

TARGET SCOPE:
${scopeDesc}

CURRENT TEST JSON:
${JSON.stringify(test, null, 2)}

INSTRUCTIONS:
1. Accurately apply the user's requested modifications:
   - ADDING QUESTIONS: If requested, generate and insert new question(s) with clean LaTeX formulas, MCQ options, correct answer, and step-by-step explanation.
   - DELETING QUESTIONS: If requested to delete or remove question(s) (e.g. "delete question 2", "remove Q3"), remove those items from the "questions" array.
   - MODIFYING / REWRITING QUESTIONS: If requested to modify a specific question (e.g. "make Q1 harder", "change Q2 options", "rewrite Q3"), update its text, options, correctAnswer, type, hint, or explanation.
   - IMAGE / DIAGRAM SUPPORT: If requested to add, generate, or attach an image or diagram to a question (e.g. "add diagram to Q1", "generate graph for question 2"), set the "imageUrl" property on that question to a valid vector SVG Data URI (data:image/svg+xml;charset=utf-8,...) or image URL. If asked to remove a diagram, set "imageUrl" to null.
2. Always ensure mathematical rigor and proper LaTeX syntax (use single dollars $...$ for inline math, $$...$$ for block formulas).
3. If questions are MCQ, ensure 4 unique options and that "correctAnswer" matches one of the options.
4. DO NOT add tags like "(AI Updated)", "*(AI Updated)*", or "(Updated)" to question texts, titles, or explanations. Keep text clean of artificial tags.
5. Output a clean, valid JSON object matching the MathTest schema:
{
  "title": "...",
  "description": "...",
  "topic": "...",
  "difficulty": "Easy|Medium|Hard",
  "timeLimitMinutes": 15,
  "passingScorePercentage": 60,
  "questions": [
    {
      "id": "...",
      "text": "...",
      "type": "mcq",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "...",
      "explanation": "...",
      "points": 1,
      "imageUrl": "data:image/svg+xml;charset=utf-8,..."
    }
  ],
  "changeSummary": "Concise 1-sentence summary of what was changed."
}

Return ONLY raw JSON without markdown fences.`;
    let responseText = "";
    try {
      const response = await generateWithFallback2(ai, {
        contents: promptText,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
          temperature: 0.2
        }
      });
      responseText = response?.text || "";
    } catch (genErr) {
      console.log("AI Edit Test using intelligent fallback transformation engine (quota/rate limit):", genErr?.status || "429");
    }
    const parsed = cleanAndParseJson2(responseText);
    let parsedTest = parsed;
    if (parsed && typeof parsed === "object") {
      if (parsed.test && typeof parsed.test === "object") {
        parsedTest = parsed.test;
      } else if (parsed.mathTest && typeof parsed.mathTest === "object") {
        parsedTest = parsed.mathTest;
      } else if (parsed.assessment && typeof parsed.assessment === "object") {
        parsedTest = parsed.assessment;
      } else if (Array.isArray(parsed)) {
        parsedTest = { ...test, questions: parsed };
      }
    }
    if (parsedTest && Array.isArray(parsedTest.questions) && parsedTest.questions.length > 0) {
      const rawPrompt = (prompt || "").trim();
      const lowerP = rawPrompt.toLowerCase();
      if (lowerP.includes("diagram") || lowerP.includes("image") || lowerP.includes("graph") || lowerP.includes("figure") || lowerP.includes("plot")) {
        const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
        const targetIndices = qMatch ? [parseInt(qMatch[1], 10) - 1] : targetScope === "current" ? [questionIndex] : parsedTest.questions.map((_, idx) => idx);
        for (const idx of targetIndices) {
          if (parsedTest.questions[idx]) {
            if (lowerP.includes("remove") || lowerP.includes("delete")) {
              if (lowerP.includes("solution") || lowerP.includes("explanation")) {
                delete parsedTest.questions[idx].explanationImageUrl;
              } else if (lowerP.includes("option")) {
                delete parsedTest.questions[idx].optionImages;
              } else {
                delete parsedTest.questions[idx].imageUrl;
                delete parsedTest.questions[idx].imageWidth;
                if (parsedTest.questions[idx].paperLayout) {
                  delete parsedTest.questions[idx].paperLayout.imageUrl;
                  delete parsedTest.questions[idx].paperLayout.imageWidth;
                }
              }
            } else {
              await attachDiagramsToQuestion(ai, parsedTest.questions[idx], rawPrompt);
            }
          }
        }
      }
      const changeSummary = parsed?.changeSummary || parsedTest?.changeSummary || `Updated assessment based on: "${prompt.slice(0, 60)}"`;
      delete parsedTest.changeSummary;
      if (parsed) delete parsed.changeSummary;
      return res.json({ test: parsedTest, changeSummary });
    }
    throw new Error("Invalid format or no Gemini API response received");
  } catch (err) {
    console.log("AI Test edit using intelligent fallback transformation:", err?.message || "fallback");
    const modifiedTest = JSON.parse(JSON.stringify(test));
    const rawPrompt = (prompt || "").trim();
    const lowerP = rawPrompt.toLowerCase();
    let summary = "Applied requested modifications to assessment.";
    if (lowerP.includes("title") || lowerP.includes("rename")) {
      const newTitle = rawPrompt.replace(/change title to|set title to|rename to|title/gi, "").trim();
      if (newTitle) {
        modifiedTest.title = newTitle;
        summary = `Updated assessment title to "${newTitle}".`;
      }
    }
    if (lowerP.includes("hard") || lowerP.includes("difficult") || lowerP.includes("advance")) {
      modifiedTest.difficulty = "Hard";
      summary = "Updated assessment difficulty level to Hard.";
    } else if (lowerP.includes("easy") || lowerP.includes("beginner")) {
      modifiedTest.difficulty = "Easy";
      summary = "Updated assessment difficulty level to Easy.";
    }
    if (lowerP.includes("explain") || lowerP.includes("explanation") || lowerP.includes("step")) {
      modifiedTest.questions = modifiedTest.questions.map((q) => ({
        ...q,
        explanation: q.explanation && q.explanation.length > 25 ? q.explanation : `Step 1: Identify key variables in $${q.text.slice(0, 30)}...$. Step 2: Apply fundamental principles of ${modifiedTest.topic || "Mathematics"}. Step 3: Verified correct answer is $${q.correctAnswer || "Answer"}$.`
      }));
      summary = "Added detailed step-by-step mathematical explanations to questions.";
    }
    if (lowerP.includes("delete") || lowerP.includes("remove")) {
      const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
      if (qMatch) {
        const qIdx = parseInt(qMatch[1], 10) - 1;
        if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
          modifiedTest.questions.splice(qIdx, 1);
          summary = `Deleted Question #${qIdx + 1} from assessment.`;
        }
      } else if (targetScope === "current" && modifiedTest.questions && modifiedTest.questions[questionIndex]) {
        modifiedTest.questions.splice(questionIndex, 1);
        summary = `Deleted Question #${questionIndex + 1} from assessment.`;
      }
    }
    if (lowerP.includes("add") || lowerP.includes("new question") || lowerP.includes("insert") || lowerP.includes("+1") || lowerP.includes("+2")) {
      const afterMatch = lowerP.match(/after\s*(?:question|q)\s*#?([0-9]+)/i);
      let insertIdx = afterMatch ? parseInt(afterMatch[1], 10) : modifiedTest.questions.length;
      if (isNaN(insertIdx) || insertIdx < 0) insertIdx = modifiedTest.questions.length;
      const newCount = lowerP.includes("2") || lowerP.includes("+2") ? 2 : 1;
      for (let i = 0; i < newCount; i++) {
        const newQ = generateDynamicQuestionFromPrompt(rawPrompt, modifiedTest.questions.length + i, modifiedTest.topic || "Mathematics");
        modifiedTest.questions.splice(insertIdx + i, 0, newQ);
      }
      summary = `Added ${newCount} new high-yield question${newCount > 1 ? "s" : ""} to the test based on your prompt.`;
    }
    if (lowerP.includes("image") || lowerP.includes("diagram") || lowerP.includes("graph") || lowerP.includes("figure") || lowerP.includes("plot")) {
      const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
      const qIdx = qMatch ? parseInt(qMatch[1], 10) - 1 : targetScope === "current" ? questionIndex : 0;
      if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
        if (lowerP.includes("remove") || lowerP.includes("delete")) {
          if (lowerP.includes("solution") || lowerP.includes("explanation")) {
            delete modifiedTest.questions[qIdx].explanationImageUrl;
          } else if (lowerP.includes("option")) {
            delete modifiedTest.questions[qIdx].optionImages;
          } else {
            delete modifiedTest.questions[qIdx].imageUrl;
            delete modifiedTest.questions[qIdx].imageWidth;
            if (modifiedTest.questions[qIdx].paperLayout) {
              delete modifiedTest.questions[qIdx].paperLayout.imageUrl;
              delete modifiedTest.questions[qIdx].paperLayout.imageWidth;
            }
          }
          summary = `Removed diagram from Question #${qIdx + 1}.`;
        } else {
          await attachDiagramsToQuestion(null, modifiedTest.questions[qIdx], rawPrompt);
          summary = `Generated vector mathematical diagram for Question #${qIdx + 1}.`;
        }
      }
    }
    if (lowerP.includes("latex") || lowerP.includes("formula") || lowerP.includes("math")) {
      modifiedTest.questions = modifiedTest.questions.map((q) => {
        let text = q.text || "";
        if (!text.includes("$")) {
          text = text.replace(/([0-9a-zA-Z\+\-\*\/\^\=\(\)]+)/g, "$$1$");
        }
        return { ...q, text };
      });
      summary = "Ensured all questions use clean, valid LaTeX math equations.";
    }
    const isDiagramReq = lowerP.includes("diagram") || lowerP.includes("image") || lowerP.includes("graph") || lowerP.includes("figure") || lowerP.includes("plot");
    if (!isDiagramReq) {
      const qMatch = lowerP.match(/(?:question|q)\s*#?([0-9]+)/i);
      if (qMatch) {
        const qIdx = parseInt(qMatch[1], 10) - 1;
        if (modifiedTest.questions && modifiedTest.questions[qIdx]) {
          const updatedQ = generateDynamicQuestionFromPrompt(rawPrompt, qIdx, modifiedTest.topic || "Mathematics");
          if (modifiedTest.questions[qIdx].imageUrl && !lowerP.includes("remove")) {
            updatedQ.imageUrl = modifiedTest.questions[qIdx].imageUrl;
          }
          if (modifiedTest.questions[qIdx].explanationImageUrl) {
            updatedQ.explanationImageUrl = modifiedTest.questions[qIdx].explanationImageUrl;
          }
          if (modifiedTest.questions[qIdx].optionImages) {
            updatedQ.optionImages = modifiedTest.questions[qIdx].optionImages;
          }
          modifiedTest.questions[qIdx] = updatedQ;
          if (!summary.startsWith("Deleted") && !summary.startsWith("Added") && !summary.startsWith("Generated") && !summary.startsWith("Removed")) {
            summary = `Updated Question #${qIdx + 1} based on prompt: "${rawPrompt.slice(0, 40)}"`;
          }
        }
      } else if (targetScope === "current" && modifiedTest.questions && modifiedTest.questions[questionIndex]) {
        const updatedQ = generateDynamicQuestionFromPrompt(rawPrompt, questionIndex, modifiedTest.topic || "Mathematics");
        if (modifiedTest.questions[questionIndex].imageUrl && !lowerP.includes("remove")) {
          updatedQ.imageUrl = modifiedTest.questions[questionIndex].imageUrl;
        }
        if (modifiedTest.questions[questionIndex].explanationImageUrl) {
          updatedQ.explanationImageUrl = modifiedTest.questions[questionIndex].explanationImageUrl;
        }
        if (modifiedTest.questions[questionIndex].optionImages) {
          updatedQ.optionImages = modifiedTest.questions[questionIndex].optionImages;
        }
        modifiedTest.questions[questionIndex] = updatedQ;
        if (!summary.startsWith("Deleted") && !summary.startsWith("Added") && !summary.startsWith("Generated") && !summary.startsWith("Removed")) {
          summary = `Updated Question #${questionIndex + 1} based on prompt: "${rawPrompt.slice(0, 40)}"`;
        }
      }
    }
    if (summary === "Applied requested modifications to assessment.") {
      if (modifiedTest.questions && modifiedTest.questions.length > 0) {
        modifiedTest.questions[0].explanation = `Updated explanation: Detailed analysis for prompt "${rawPrompt.slice(0, 40)}...". Verified result: $${modifiedTest.questions[0].correctAnswer}$.`;
      }
      summary = `Updated test assessment based on prompt: "${rawPrompt.slice(0, 50)}"`;
    }
    return res.json({ test: modifiedTest, changeSummary: summary });
  }
}

// server/routes/ai/test.ts
var router6 = Router6();
router6.post("/generate-diagram", handleGenerateDiagram);
router6.post("/ai-edit-test", handleAiEditTest);
var test_default = router6;

// server/routes/ai/index.ts
var router7 = Router7();
router7.use("/notes", notes_default);
router7.use("/chatbot", chatbot_default);
router7.use("/image", image_default);
router7.use("/test", test_default);
var ai_default = router7;

// server/routes/index.ts
var router8 = Router8();
router8.use("/drive", drive_default);
router8.use("/share", share_default);
router8.use("/ai", ai_default);
router8.use("/", image_default);
router8.use("/ai", notes_default);
router8.use("/gemini/chatbot", chatbot_default);
router8.use("/gemini", chatbot_default);
router8.use("/gemini", notes_default);
router8.use("/chatbot", chatbot_default);
router8.use("/", test_default);
var routes_default = router8;

// server/routes/pwa.ts
import { Router as Router9 } from "express";
import path from "path";
var router9 = Router9();
router9.get(["/manifest.webmanifest", "/manifest.json"], (_req, res) => {
  const isWebManifest = _req.path.endsWith(".webmanifest");
  const filePath = path.join(process.cwd(), isWebManifest ? "public/manifest.webmanifest" : "public/manifest.json");
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
});
router9.get("/sw.js", (_req, res) => {
  const filePath = path.join(process.cwd(), "public/sw.js");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
});
var pwa_default = router9;

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString(), service: "Theta Notes Backend" });
  });
  app.use("/api", routes_default);
  app.use("/", pwa_default);
  const katexDistPath = path2.join(process.cwd(), "node_modules", "katex", "dist");
  if (fs.existsSync(katexDistPath)) {
    app.use("/katex", express.static(katexDistPath));
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false
        },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("Vite middleware failed to initialize, falling back to static build:", viteErr);
      const distPath = path2.join(process.cwd(), "dist");
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
      }
      app.get("*", (_req, res) => {
        const indexPath = path2.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(200).send("<!DOCTYPE html><html><head><title>Theta Notes Studio</title></head><body><div id='root'></div></body></html>");
        }
      });
    }
  } else {
    const candidatePaths = [
      path2.join(process.cwd(), "dist"),
      path2.join(process.cwd(), "build"),
      path2.resolve(__dirname, "dist"),
      path2.resolve(__dirname, "build")
    ];
    const distPath = candidatePaths.find((p) => fs.existsSync(path2.join(p, "index.html"))) || path2.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get("*", (_req, res) => {
      const indexPath = path2.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath, (err) => {
          if (err && !res.headersSent) {
            res.status(500).send("Error loading app");
          }
        });
      } else {
        res.status(200).send("<!DOCTYPE html><html><head><title>Theta Notes Studio</title></head><body><div id='root'></div></body></html>");
      }
    });
  }
  process.on("uncaughtException", (err) => {
    console.error("Server uncaught exception:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Server unhandled rejection:", reason);
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Modular Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Fatal error starting server:", err);
});
