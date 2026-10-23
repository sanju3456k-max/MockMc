import { Router } from "express";

const router = Router();

// Shared Test Short Store
const SHARED_TESTS_CACHE = new Map<string, any>();

router.post("/", (req, res) => {
  try {
    const testData = req.body;
    if (!testData || !testData.title || !Array.isArray(testData.questions)) {
      return res.status(400).json({ error: "Invalid test payload" });
    }
    const shortId = Math.random().toString(36).substring(2, 9);
    SHARED_TESTS_CACHE.set(shortId, testData);
    return res.json({ shareId: shortId });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create share ID" });
  }
});

router.get("/:shareId", (req, res) => {
  const { shareId } = req.params;
  const testData = SHARED_TESTS_CACHE.get(shareId);
  if (!testData) {
    return res.status(404).json({ error: "Shared test not found or expired" });
  }
  return res.json(testData);
});

export default router;
