import { Router } from "express";
import { 
  getAiClient, 
  generateWithFallback, 
  extractSectionByHeading,
  analyzeDocumentStructure 
} from "../../lib/ai.js";
import { buildDocumentOutline, isFullDocumentRequest } from "../../../src/components/htmlNotes/utils/docStructureMap.ts";

const router = Router();

// Dedicated AI Generation Endpoint for HTML Notes & Text Assistance
router.post(["/generate", "/notes-assistant"], async (req, res) => {
  try {
    const { contents, systemInstruction, prompt, currentCode, currentTitle, selectedText } = req.body;
    const ai = getAiClient();
    
    const docOutline = buildDocumentOutline(currentCode || '', currentTitle || 'Untitled Note');
    const analysis = await analyzeDocumentStructure(ai, {
      prompt: prompt || '',
      outline: docOutline.outlineText,
      currentTitle: currentTitle || 'Untitled Note'
    });

    const isFullReadRequested = analysis.isFullRewrite || isFullDocumentRequest(prompt || '');

    let targetSectionCodeBlock = '';
    if (!isFullReadRequested && analysis.targetHeadings.length > 0) {
      for (const heading of analysis.targetHeadings) {
        const code = extractSectionByHeading(currentCode || '', heading);
        if (code) {
          targetSectionCodeBlock += `\nSection: "${heading}"\n\`\`\`html\n${code}\n\`\`\`\n`;
        }
      }
    }

    let finalContents = contents;
    let finalInstruction = systemInstruction || `You are an expert AI Note Assistant. Generate clean HTML5 and KaTeX math. 
${!isFullReadRequested ? `Focus ONLY on patching the relevant sections: ${analysis.targetHeadings.join(', ')}.` : 'Rewrite the full document as requested.'}`;

    if (!finalContents && prompt) {
      let promptText = `DOCUMENT TITLE: "${currentTitle || 'Untitled Note'}"\n`;
      if (selectedText) {
        promptText += `TARGET SELECTED TEXT:\n"""\n${selectedText}\n"""\n\n`;
      }
      promptText += `USER PROMPT:\n${prompt}\n\n`;
      
      if (isFullReadRequested) {
        promptText += `FULL DOCUMENT CONTEXT:\n\`\`\`html\n${(currentCode || '').slice(0, 15000)}\n\`\`\``;
      } else {
        promptText += `PATCH CONTEXT:${targetSectionCodeBlock || `\n\`\`\`html\n${(currentCode || '').slice(-2000)}\n\`\`\``}`;
      }
      finalContents = [{ role: 'user', parts: [{ text: promptText }] }];
    }

    const response = await generateWithFallback(ai, {
      contents: finalContents,
      config: {
        systemInstruction: { parts: [{ text: finalInstruction }] },
        temperature: 0.7,
      }
    });

    const responseText = response.text || "";
    const codeMatch = responseText.match(/```(?:html|xml)?\n([\s\S]*?)```/i);
    const suggestedCode = codeMatch ? codeMatch[1].trim() : null;
    const cleanReplyText = responseText.replace(/```html[\s\S]*?```/gi, '').trim() || "Here is your updated note content:";

    const isTargetedEdit = Boolean(selectedText && suggestedCode && !suggestedCode.toLowerCase().startsWith('<!doctype'));

    return res.json({
      replyText: cleanReplyText,
      suggestedCode,
      hasCodeChange: Boolean(suggestedCode),
      isTargetedEdit,
      selectedText: selectedText || null
    });
  } catch (err: any) {
    console.warn("Notes AI Assistant endpoint error:", err?.message);
    return res.status(500).json({ error: "Failed to process AI request." });
  }
});

// Overhauled AI Assistant with Tool-Calling (Function Calling) for high accuracy
router.post(["/chat-stream", "/notes-assistant-stream"], async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { prompt, currentCode, currentTitle, selectedText, activeProjectFiles, fileSummaries, attachments, activeFileId } = req.body;

  if ((!prompt || typeof prompt !== 'string') && (!attachments || !attachments.length)) {
    res.write(`data: ${JSON.stringify({ error: "Prompt or file attachment is required" })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    return res.end();
  }

  try {
    const ai = getAiClient();

    // 1. SYSTEM INSTRUCTIONS & TOOLS DEFINITION
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

    const projectManifest = (activeProjectFiles || []).map((f: any) => ({
      id: f.id,
      title: f.title,
      summary: (fileSummaries || {})[f.id] || "No summary available."
    }));

    const systemInstruction = `You are Theta Notes Assistant, a project-aware AI expert for HTML/KaTeX note-taking.
You help users brainstorm, study, answer math questions, and manage a workspace of notes. 

CURRENT WORKSPACE CONTEXT:
- Active Note: "${currentTitle || 'Untitled'}" (ID: ${activeFileId || 'unknown'})
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

    const userParts: any[] = [];
    if (selectedText) userParts.push({ text: `SELECTED TEXT IN ACTIVE NOTE:\n"""\n${selectedText}\n"""\n\n` });
    userParts.push({ text: `USER REQUEST: ${prompt}\n\nACTIVE NOTE CONTENT:\n\`\`\`html\n${(currentCode || '').slice(0, 100000)}\n\`\`\`` });

    // Process attachments...
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments.slice(0, 5)) {
        const mime = (att.mimeType || 'application/octet-stream').toLowerCase();
        const cleanBase64 = typeof att.data === 'string' ? att.data.replace(/^data:[^;]+;base64,/, '') : '';
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
    let chat: any = null;
    let responseStream: any = null;
    let activeModelUsed = "";

    // Phase 1: Try with function calling tools
    for (const modelName of chatModels) {
      try {
        chat = ai.chats.create({
          model: modelName,
          config: {
            systemInstruction,
            tools: tools as any,
          }
        });
        responseStream = await chat.sendMessageStream({ message: userParts });
        activeModelUsed = modelName;
        break;
      } catch (err: any) {
        const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
        if (isQuota) {
          console.warn(`Chat model ${modelName} rate limit reached (429), trying fallback model...`);
        } else {
          console.warn(`Chat model ${modelName} with tools failed:`, err.message?.slice(0, 100));
        }
      }
    }

    // Phase 2: If tools were blocked or high-demand (503/429), retry cleanly without tools
    if (!responseStream) {
      const enhancedInstruction = `${systemInstruction}\n\nNOTE ACTIONS: If the user explicitly asks to create or update notes, format the action at the end in a json block like:\n\`\`\`json\n{"action": "create_note", "title": "Note Title", "content": "HTML content"}\n\`\`\` or \`\`\`json\n{"action": "patch_current_note", "action": "APPEND_TO_SECTION", "targetId": "Section", "content": "HTML content"}\n\`\`\``;
      for (const modelName of chatModels) {
        try {
          chat = ai.chats.create({
            model: modelName,
            config: {
              systemInstruction: enhancedInstruction,
            }
          });
          responseStream = await chat.sendMessageStream({ message: userParts });
          activeModelUsed = modelName;
          break;
        } catch (err: any) {
          console.warn(`Chat model ${modelName} without tools failed:`, err.message?.slice(0, 100));
        }
      }
    }

    if (!responseStream) {
      res.write(`data: ${JSON.stringify({ text: "Hello! I am Theta Notes Assistant. I am ready to help you write notes, format equations with LaTeX, and review your mathematical concepts." })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }

      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        for (const call of chunk.functionCalls) {
          const cleanName = (call.name || "").replace(/^default_api:/, "");
          const clientCall = { ...call, name: cleanName };
          res.write(`data: ${JSON.stringify({ toolCall: clientCall })}\n\n`);

          // ONLY query follow-up data if it's a server-side data reading function (read_note_content)
          if (cleanName === "read_note_content") {
            const target = String((call.args as any)?.fileIdOrTitle || "").trim().toLowerCase();
            const file = activeProjectFiles?.find((f: any) => f.id === target || String(f.title || "").trim().toLowerCase() === target);
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
                  res.write(`data: ${JSON.stringify({ text: followChunk.text })}\n\n`);
                }
                if (followChunk.functionCalls) {
                  for (const nextCall of followChunk.functionCalls) {
                    const nextCleanName = (nextCall.name || "").replace(/^default_api:/, "");
                    res.write(`data: ${JSON.stringify({ toolCall: { ...nextCall, name: nextCleanName } })}\n\n`);
                  }
                }
              }
            } catch (e: any) {
              console.warn("Follow-up function response error:", e?.message);
            }
          }
        }
      }
    }

    res.write(`data: [DONE]\n\n`);
    return res.end();
  } catch (err: any) {
    console.error("Error in chat-stream:", err);
    res.write(`data: ${JSON.stringify({ error: err?.message || "Internal error" })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    return res.end();
  }
});

// Endpoint to generate a brief semantic summary of a note
router.post("/summarize-note", async (req, res) => {
  let code = '';
  try {
    const body = req.body || {};
    const title = body.title;
    code = body.code;
    if (!code) return res.json({ summary: "Empty note." });

    const ai = getAiClient();
    const prompt = `Provide a concise 1-2 sentence semantic summary of this HTML note titled "${title || 'Untitled'}". 
Focus on the main topics and concepts covered.
Note Code:
${code.slice(0, 5000)}`;

    const response = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.2 }
    });

    return res.json({ summary: response.text || "Summary unavailable." });
  } catch (err: any) {
    const plainText = (code || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const fallbackSummary = plainText.length > 0 
      ? plainText.slice(0, 160) + '...' 
      : 'Notes document summary unavailable.';
    return res.json({ summary: fallbackSummary });
  }
});

export default router;
