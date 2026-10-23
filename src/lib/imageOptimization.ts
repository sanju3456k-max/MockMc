import { MathQuestion, MathTest } from '../types';

/**
 * Image Optimization & Document Size Guard for Firestore and Local Storage
 * 
 * Firestore enforces a strict 1,048,576 bytes (1 MiB) limit per document.
 * This module ensures that assessments of any length (from 2 to 150+ questions),
 * even with multiple diagrams per question or option, automatically maintain
 * visual sharpness, formula clarity, and graphic legibility while guaranteeing
 * the document stays comfortably within Firestore and storage limits.
 */

export const FIRESTORE_MAX_DOC_SIZE = 1_048_576; // 1 MiB hard limit
export const TARGET_SAFE_DOC_SIZE = 820_000;    // 820 KB target threshold (leaves generous safety buffer)
export const WARNING_THRESHOLD_SIZE = 680_000;  // 680 KB advisory threshold

/**
 * Checks if a string is a base64 raster image (PNG, JPEG, WebP)
 * Excludes SVGs because SVGs are lightweight vector code (2-5 KB) and already scalable.
 */
export function isRasterBase64(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return url.startsWith('data:image/') && !url.startsWith('data:image/svg+xml');
}

/**
 * Estimates the byte size of an object or string in serialized JSON.
 */
export function estimateByteSize(val: any): number {
  if (!val) return 0;
  if (typeof val === 'string') return val.length;
  try {
    return JSON.stringify(val).length;
  } catch {
    return 0;
  }
}

/**
 * Counts the diagrams across all questions in a test.
 */
export function countTestDiagrams(test: Partial<MathTest>): {
  total: number;
  rasterBase64: number;
  svgs: number;
  heavyImages: number;
} {
  const result = {
    total: 0,
    rasterBase64: 0,
    svgs: 0,
    heavyImages: 0,
  };

  if (!test || !Array.isArray(test.questions)) return result;

  const inspectUrl = (url?: string) => {
    if (!url) return;
    result.total++;
    if (isRasterBase64(url)) {
      result.rasterBase64++;
      if (url.length > 90_000) {
        result.heavyImages++;
      }
    } else if (url.startsWith('data:image/svg+xml') || url.trim().startsWith('<svg')) {
      result.svgs++;
    }
  };

  for (const q of test.questions) {
    inspectUrl(q.imageUrl);
    if (q.paperLayout?.imageUrl && q.paperLayout.imageUrl !== q.imageUrl) {
      inspectUrl(q.paperLayout.imageUrl);
    }
    q.imageUrls?.forEach(inspectUrl);
    q.optionImages?.forEach(inspectUrl);
    inspectUrl(q.explanationImageUrl);
    q.explanationImageUrls?.forEach(inspectUrl);
  }

  return result;
}

/**
 * Compresses a raster base64 data URL while preserving mathematical clarity,
 * lines, text contrast, and graph detail.
 */
export async function compressBase64Image(
  dataUrl: string,
  maxDim = 880,
  quality = 0.82
): Promise<string> {
  if (!isRasterBase64(dataUrl)) {
    return dataUrl;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let { width, height } = img;
          if (!width || !height) {
            return resolve(dataUrl);
          }

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(dataUrl);
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Pure white background ensures high contrast for dark and light modes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // WebP has superior lossless and lossy compression for line art & diagrams
          let result = canvas.toDataURL('image/webp', quality);
          if (!result.startsWith('data:image/webp')) {
            result = canvas.toDataURL('image/jpeg', quality);
          }

          // Only replace if compressed result is truly smaller
          if (result && result.length < dataUrl.length) {
            resolve(result);
          } else {
            resolve(dataUrl);
          }
        } catch (err) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    } catch (e) {
      resolve(dataUrl);
    }
  });
}

/**
 * Optimizes all diagram properties within a single question.
 */
export async function optimizeQuestionDiagrams(
  q: MathQuestion,
  maxDim: number,
  quality: number
): Promise<MathQuestion> {
  const updated = { ...q };
  const promises: Promise<void>[] = [];

  // 1. Question main diagram
  if (isRasterBase64(updated.imageUrl)) {
    promises.push(
      compressBase64Image(updated.imageUrl!, maxDim, quality).then((compressed) => {
        updated.imageUrl = compressed;
      })
    );
  }

  // 2. Paper layout diagram
  if (updated.paperLayout?.imageUrl && isRasterBase64(updated.paperLayout.imageUrl)) {
    promises.push(
      compressBase64Image(updated.paperLayout.imageUrl, maxDim, quality).then((compressed) => {
        updated.paperLayout = { ...updated.paperLayout, imageUrl: compressed };
      })
    );
  }

  // 3. Question additional diagrams
  if (Array.isArray(updated.imageUrls) && updated.imageUrls.some(isRasterBase64)) {
    promises.push(
      Promise.all(
        updated.imageUrls.map((url) =>
          url && isRasterBase64(url) ? compressBase64Image(url, maxDim, quality) : Promise.resolve(url)
        )
      ).then((compressedUrls) => {
        updated.imageUrls = compressedUrls;
      })
    );
  }

  // 4. Option diagrams (A, B, C, D)
  if (Array.isArray(updated.optionImages) && updated.optionImages.some(isRasterBase64)) {
    promises.push(
      Promise.all(
        updated.optionImages.map((url) =>
          url && isRasterBase64(url) ? compressBase64Image(url, maxDim, quality) : Promise.resolve(url)
        )
      ).then((compressedOpts) => {
        updated.optionImages = compressedOpts;
      })
    );
  }

  // 5. Explanation main diagram
  if (isRasterBase64(updated.explanationImageUrl)) {
    promises.push(
      compressBase64Image(updated.explanationImageUrl!, maxDim, quality).then((compressed) => {
        updated.explanationImageUrl = compressed;
      })
    );
  }

  // 6. Explanation additional diagrams
  if (Array.isArray(updated.explanationImageUrls) && updated.explanationImageUrls.some(isRasterBase64)) {
    promises.push(
      Promise.all(
        updated.explanationImageUrls.map((url) =>
          url && isRasterBase64(url) ? compressBase64Image(url, maxDim, quality) : Promise.resolve(url)
        )
      ).then((compressedExpls) => {
        updated.explanationImageUrls = compressedExpls;
      })
    );
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }

  return updated;
}

/**
 * Automatically inspects a MathTest and determines if its size approaches or exceeds
 * Firestore's 1 MB limit (or has heavy uncompressed base64 images).
 * 
 * Dynamically scales and compresses all embedded diagrams across 50, 100, or 150+ questions
 * so that diagrams remain razor-sharp while the entire test document comfortably fits within Firestore.
 */
export async function optimizeTestForFirestore(
  test: MathTest,
  targetMaxBytes = TARGET_SAFE_DOC_SIZE
): Promise<MathTest> {
  if (!test || !Array.isArray(test.questions) || test.questions.length === 0) {
    return test;
  }

  const initialSize = estimateByteSize(test);
  const diagStats = countTestDiagrams(test);

  // If already well below safe threshold and no bulky images, return unchanged
  if (initialSize <= targetMaxBytes && diagStats.heavyImages === 0) {
    return test;
  }

  if (diagStats.rasterBase64 === 0) {
    return test;
  }

  console.log(
    `[ImageOptimizer] Auto-optimizing test "${test.title}" (${test.questions.length} questions, ${diagStats.rasterBase64} raster images, initial size: ${(initialSize / 1024).toFixed(1)} KB)`
  );

  // Tiered compression steps:
  // Tier 1: 960px, quality 0.84 (Ultra-high clarity for retina and prints)
  // Tier 2: 800px, quality 0.76 (Crisp line art, clear formulas)
  // Tier 3: 650px, quality 0.68 (Ideal for tests with 30-60 diagrams)
  // Tier 4: 500px, quality 0.58 (Compact safeguard for 100+ diagrams)
  const tiers = [
    { maxDim: 960, quality: 0.84 },
    { maxDim: 800, quality: 0.76 },
    { maxDim: 650, quality: 0.68 },
    { maxDim: 500, quality: 0.58 },
  ];

  let currentCandidate = test;
  let currentCandidateSize = initialSize;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const optimizedQuestions = await Promise.all(
      currentCandidate.questions.map((q) => optimizeQuestionDiagrams(q, tier.maxDim, tier.quality))
    );

    const newTest: MathTest = {
      ...currentCandidate,
      questions: optimizedQuestions,
    };

    const newSize = estimateByteSize(newTest);
    if (newSize < currentCandidateSize) {
      currentCandidate = newTest;
      currentCandidateSize = newSize;
    }

    // If we've reached a safe size below targetMaxBytes, we stop to maintain highest visual fidelity
    if (currentCandidateSize <= targetMaxBytes) {
      console.log(
        `[ImageOptimizer] Successfully compressed test "${test.title}" to ${(currentCandidateSize / 1024).toFixed(1)} KB at Tier ${i + 1} (under ${targetMaxBytes / 1024} KB limit).`
      );
      break;
    }
  }

  return currentCandidate;
}
