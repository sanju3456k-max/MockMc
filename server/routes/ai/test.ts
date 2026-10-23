import { Router } from "express";
import { handleGenerateDiagram, handleAiEditTest } from "../../../src/server/testStudioAiServices.ts";

const router = Router();

router.post("/generate-diagram", handleGenerateDiagram);
router.post("/ai-edit-test", handleAiEditTest);

export default router;
