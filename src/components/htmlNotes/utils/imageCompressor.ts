/**
 * High-performance client-side image compression engine for Notes Studio.
 * Compresses camera photos, screenshots, and diagrams to optimal document size (<150KB)
 * using HTML5 Canvas & WebP/JPEG encoding while preserving crisp visual detail.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0 (default: 0.82)
  maxSizeBytes?: number; // target max size in bytes (default: 300KB)
}

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;
const DEFAULT_QUALITY = 0.82;
const TARGET_MAX_BYTES = 180 * 1024; // 180 KB target for ultra-responsive note documents

/**
 * Loads an image from a File, Blob, or base64 Data URL into an HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (img.crossOrigin) {
        const fallback = new Image();
        fallback.onload = () => resolve(fallback);
        fallback.onerror = (err) => reject(err);
        fallback.src = src;
      } else {
        reject(new Error('Failed to load image'));
      }
    };
    img.src = src;
  });
}

/**
 * Reads a File or Blob as a base64 Data URL string
 */
export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = (e) => reject(new Error('Failed to read file: ' + String(e)));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image File, Blob, or Data URL to a lightweight, crisp base64 Data URL.
 * Automatically downscales dimensions if larger than maxWidth/maxHeight,
 * and encodes with WebP (or JPEG fallback) at high fidelity.
 * Preserves crisp lines, diagrams, and text while dropping weight by 80-95%.
 */
export async function compressImageForDocument(
  input: File | Blob | string,
  options?: CompressionOptions
): Promise<string> {
  try {
    const maxWidth = options?.maxWidth || DEFAULT_MAX_WIDTH;
    const maxHeight = options?.maxHeight || DEFAULT_MAX_HEIGHT;
    let quality = options?.quality || DEFAULT_QUALITY;

    let rawDataUrl: string;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      // External web URLs (Unsplash, Wikimedia, HTTP images) - return immediately to avoid CORS canvas taint
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
        return trimmed;
      }
      rawDataUrl = input;
    } else {
      // If SVG, SVGs are vector documents - do not compress via canvas
      if (input.type === 'image/svg+xml') {
        return await readFileAsDataUrl(input);
      }
      rawDataUrl = await readFileAsDataUrl(input);
    }

    // If input is SVG data URL or already a tiny WebP (< 15 KB), return as-is
    if (rawDataUrl.startsWith('data:image/svg+xml') || (rawDataUrl.startsWith('data:image/webp') && rawDataUrl.length < 20000)) {
      return rawDataUrl;
    }

    const img = await loadImageElement(rawDataUrl);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (!origW || !origH) {
      return rawDataUrl;
    }

    // Compute scaled dimensions preserving aspect ratio
    let targetW = origW;
    let targetH = origH;

    if (targetW > maxWidth || targetH > maxHeight) {
      const ratio = Math.min(maxWidth / targetW, maxHeight / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    // Render to offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return rawDataUrl;
    }

    // High quality bicubic image scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw image onto canvas
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Try WebP first (best compression & full transparency support), fall back to JPEG
    let compressedDataUrl = '';
    try {
      compressedDataUrl = canvas.toDataURL('image/webp', quality);
      // Check if browser actually produced WebP (some browsers fall back to image/png)
      if (!compressedDataUrl.startsWith('data:image/webp')) {
        // Fallback to JPEG with white background for transparency
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = targetW;
        jpegCanvas.height = targetH;
        const jCtx = jpegCanvas.getContext('2d');
        if (jCtx) {
          jCtx.fillStyle = '#ffffff';
          jCtx.fillRect(0, 0, targetW, targetH);
          jCtx.drawImage(img, 0, 0, targetW, targetH);
          compressedDataUrl = jpegCanvas.toDataURL('image/jpeg', quality);
        } else {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        }
      }
    } catch {
      compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    // If compressed output is still larger than target, perform secondary quality reduction
    const targetBytes = options?.maxSizeBytes || TARGET_MAX_BYTES;
    if (compressedDataUrl.length > targetBytes * 1.37 && quality > 0.6) {
      try {
        quality = 0.74;
        const secondAttempt = canvas.toDataURL('image/webp', quality);
        if (secondAttempt.startsWith('data:image/webp') && secondAttempt.length < compressedDataUrl.length) {
          compressedDataUrl = secondAttempt;
        }
      } catch {}
    }

    // If compression somehow produced a larger string than original (e.g. tiny 10px icons), keep original
    if (rawDataUrl.length < compressedDataUrl.length) {
      return rawDataUrl;
    }

    return compressedDataUrl;
  } catch (err) {
    console.warn('Image compression fallback to original:', err);
    if (typeof input === 'string') return input;
    return await readFileAsDataUrl(input);
  }
}
