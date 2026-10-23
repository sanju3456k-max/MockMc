import { Router } from "express";
import notesRouter from "./notes.js";
import chatbotRouter from "./chatbot.js";
import imageRouter from "./image.js";
import testRouter from "./test.js";

const router = Router();

router.use("/notes", notesRouter);
router.use("/chatbot", chatbotRouter);
router.use("/image", imageRouter);
router.use("/test", testRouter);

export default router;
