import { Router } from "express";
import path from "path";

const router = Router();

// Explicit PWA and Service Worker header routes
router.get(["/manifest.webmanifest", "/manifest.json"], (_req, res) => {
  const isWebManifest = _req.path.endsWith('.webmanifest');
  const filePath = path.join(process.cwd(), isWebManifest ? "public/manifest.webmanifest" : "public/manifest.json");
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
});

router.get("/sw.js", (_req, res) => {
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

export default router;
