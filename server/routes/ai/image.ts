import { Router } from "express";
import { getAiClient, generateImageVisualUrl } from "../../lib/ai.js";

const router = Router();

// Dedicated Image Generation API endpoint for Gemini Chatbot Canvas
router.post("/generate-image", async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1', style = '', seed } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }
    const ai = getAiClient();
    const imageUrl = await generateImageVisualUrl(ai, prompt, { aspectRatio, style, seed });
    return res.json({
      imageUrl,
      prompt,
      aspectRatio,
      style,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("Error generating image via /api/ai/image/generate-image:", err);
    return res.status(500).json({ error: err.message || "Failed to generate image" });
  }
});

export default router;
