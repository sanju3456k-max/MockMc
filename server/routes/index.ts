import { Router } from "express";
import driveRouter from "./drive.js";
import shareRouter from "./share.js";
import aiRootRouter from "./ai/index.js";
import notesRouter from "./ai/notes.js";
import chatbotRouter from "./ai/chatbot.js";
import imageRouter from "./ai/image.js";
import testRouter from "./ai/test.js";

const router = Router();

// Modular Routes
router.use("/drive", driveRouter);
router.use("/share", shareRouter);
router.use("/ai", aiRootRouter);

// Flat Routes (Backward Compatibility with existing frontend API calls)
// These ensure /api/generate-image, /api/ai/chat-stream, /api/gemini/chatbot etc continue to work
router.use("/", imageRouter);                 // /api/generate-image
router.use("/ai", notesRouter);               // /api/ai/chat-stream, /api/ai/notes-assistant-stream
router.use("/gemini/chatbot", chatbotRouter); // /api/gemini/chatbot
router.use("/gemini", chatbotRouter);         // /api/gemini, /api/gemini/chatbot
router.use("/gemini", notesRouter);           // /api/gemini/generate
router.use("/chatbot", chatbotRouter);        // /api/chatbot
router.use("/", testRouter);                  // /api/generate-diagram, /api/ai-edit-test

export default router;
