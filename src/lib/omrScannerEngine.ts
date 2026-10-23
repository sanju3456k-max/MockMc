import { MathTest, checkIsOptionCorrect, OmrScanResult, OmrQuestionDetection, OmrBubbleReading } from '../types';
import { 
  OMR_GEOMETRY, 
  getOmrLayoutConfig, 
  generateOmrSheetBlueprint,
  OmrSheetBlueprint,
  OmrLayoutConfig, 
  OmrPoint 
} from './omrGeometry';

export type OmrSheetLayoutSpec = OmrLayoutConfig;

/**
 * Calculate the layout of the OMR sheet
 */
export function getOmrLayoutSpec(totalQuestions: number, forcedColumnsCount?: number): OmrLayoutConfig {
  return getOmrLayoutConfig(totalQuestions, forcedColumnsCount);
}

/**
 * Helper to compute grayscale pixel intensity (0 = pure black, 255 = pure white)
 */
function getGrayscale(data: Uint8ClampedArray, idx: number): number {
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}

type Point = OmrPoint;

/**
 * Detailed optical analysis of an individual bubble candidate.
 */
interface BubbleFillAnalysis {
  fillMetric: number;         // Continuous fill intensity (0.0 to 1.0)
  rawDarkRatio: number;       // Ratio of dark ink pixels in bubble disc (0.0 to 1.0)
  meanDarkness: number;       // Average relative darkness of inner disc (0.0 to 1.0)
  coreDarkRatio: number;      // Ratio of dark ink pixels in central core
  coreLuminance: number;      // Average luminance in core (0-255)
  paperLuminance: number;     // Local paper baseline luminance (0-255)
  score: number;              // Composite detection score
  activeQuadrants: number;    // Number of 2D quadrants (0-4) with substantial ink
  isLineArtifact: boolean;    // True if dark pixels are a 1D line/border crossing rather than a filled 2D bubble
}

/**
 * Automatically estimate document tilt angle in degrees using projection profile variance.
 * Uses a 2-stage coarse-to-fine search (up to ±12°) so real-world smartphone angles are corrected
 * without slowing down processing.
 */
function detectDocumentTiltAngle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): number {
  try {
    const sampleH = Math.min(height, Math.round(height * 0.70));
    const sampleW = width;
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    const numBins = Math.min(300, Math.round(sampleH * 0.6));
    const binHeight = sampleH / numBins;
    const stepX = Math.max(3, Math.floor(sampleW / 120));

    const cx = sampleW * 0.5;
    const cy = sampleH * 0.5;

    // Helper to evaluate variance at a given angle
    const evalAngleVariance = (angleDeg: number): number => {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);

      const rowSums = new Float64Array(numBins);
      const rowCounts = new Int32Array(numBins);

      for (let y = 15; y < sampleH - 15; y += 3) {
        const dy = y - cy;
        for (let x = 20; x < sampleW - 20; x += stepX) {
          const dx = x - cx;
          const rotY = -dx * sinA + dy * cosA + cy;
          const binIdx = Math.floor(rotY / binHeight);

          if (binIdx >= 0 && binIdx < numBins) {
            const idx = (y * sampleW + x) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            rowSums[binIdx] += gray;
            rowCounts[binIdx]++;
          }
        }
      }

      let sum = 0;
      let count = 0;
      const means: number[] = [];

      for (let b = 0; b < numBins; b++) {
        if (rowCounts[b] > 10) {
          const m = rowSums[b] / rowCounts[b];
          means.push(m);
          sum += m;
          count++;
        }
      }

      if (count <= 20) return 0;
      const avg = sum / count;
      let variance = 0;
      for (let i = 0; i < count; i++) {
        const diff = means[i] - avg;
        variance += diff * diff;
      }
      return variance;
    };

    const zeroVariance = evalAngleVariance(0);
    let bestAngle = 0;
    let maxVariance = zeroVariance;

    // Stage 1: Coarse search from -12.0° to +12.0° in 1.0° increments
    for (let a = -12.0; a <= 12.0; a += 1.0) {
      if (a === 0) continue;
      const v = evalAngleVariance(a);
      if (v > maxVariance) {
        maxVariance = v;
        bestAngle = a;
      }
    }

    // Stage 2: Fine search ±1.2° around best coarse candidate in 0.2° increments
    const coarseBest = bestAngle;
    for (let delta = -1.2; delta <= 1.2; delta += 0.2) {
      const fineAngle = Number((coarseBest + delta).toFixed(2));
      if (fineAngle < -15 || fineAngle > 15 || fineAngle === coarseBest) continue;
      const v = evalAngleVariance(fineAngle);
      if (v > maxVariance) {
        maxVariance = v;
        bestAngle = fineAngle;
      }
    }

    // Only apply rotation if the improvement over 0 degrees is noticeable (at least 15% higher variance)
    // and angle is at least 0.25 degrees.
    if (zeroVariance > 0 && maxVariance > zeroVariance * 1.15 && Math.abs(bestAngle) >= 0.25) {
      return bestAngle;
    }

    return 0;
  } catch (err) {
    console.warn('Tilt detection warning:', err);
    return 0;
  }
}

/**
 * Apply deskew rotation to the canvas if a noticeable physical tilt is detected.
 */
function deskewCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  tiltAngleDeg: number
): void {
  if (Math.abs(tiltAngleDeg) < 0.35) return;

  const w = canvas.width;
  const h = canvas.height;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  tempCtx.drawImage(canvas, 0, 0);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w * 0.5, h * 0.5);
  ctx.rotate((-tiltAngleDeg * Math.PI) / 180);
  ctx.drawImage(tempCanvas, -w * 0.5, -h * 0.5);
  ctx.restore();
}

/**
 * Accurately sample the baseline paper brightness across page margins.
 */
function samplePaperBaselineBrightness(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): number {
  try {
    const samples: number[] = [];
    const collectFromBox = (bx: number, by: number, bw: number, bh: number, step = 4) => {
      const data = ctx.getImageData(bx, by, bw, bh).data;
      for (let i = 0; i < data.length; i += step * 4) {
        samples.push(getGrayscale(data, i));
      }
    };

    // Top paper margin
    collectFromBox(Math.floor(width * 0.15), Math.max(2, Math.floor(height * 0.01)), Math.floor(width * 0.70), Math.max(4, Math.floor(height * 0.025)));
    // Bottom paper margin
    collectFromBox(Math.floor(width * 0.15), Math.max(2, Math.floor(height * 0.965)), Math.floor(width * 0.70), Math.max(4, Math.floor(height * 0.025)));
    // Left paper margin
    collectFromBox(Math.max(2, Math.floor(width * 0.01)), Math.floor(height * 0.20), Math.max(4, Math.floor(width * 0.03)), Math.floor(height * 0.60));
    // Right paper margin
    collectFromBox(Math.max(2, Math.floor(width * 0.96)), Math.floor(height * 0.20), Math.max(4, Math.floor(width * 0.03)), Math.floor(height * 0.60));

    if (samples.length > 50) {
      samples.sort((a, b) => a - b);
      // 85th percentile is immune to black registration dots or text lines
      const p85Idx = Math.floor(samples.length * 0.85);
      return Math.max(170, Math.min(255, samples[p85Idx]));
    }
    return 230;
  } catch {
    return 230;
  }
}

/**
 * Corner Fiducials structure detected from scanned OMR sheet
 */
interface DetectedFiducials {
  topLeft: OmrPoint;
  topRight: OmrPoint;
  bottomLeft: OmrPoint;
  bottomRight: OmrPoint;
}

/**
 * Searches the 4 corner regions of the image to locate the 4 printed fiducial boxes.
 * When found, this enables millimeter-accurate bilinear mapping across the entire question grid,
 * compensating for slight crop margin asymmetry or perspective tilt.
 */
function detectCornerFiducials(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  layout: OmrLayoutConfig,
  paperBaseline: number
): DetectedFiducials | null {
  try {
    const normTL = { x: 10 / layout.pageWidthMm, y: 10 / layout.pageHeightMm };
    const normTR = { x: 200 / layout.pageWidthMm, y: 10 / layout.pageHeightMm };
    const normBL = { x: 10 / layout.pageWidthMm, y: layout.bottomFiducialY_mm / layout.pageHeightMm };
    const normBR = { x: 200 / layout.pageWidthMm, y: layout.bottomFiducialY_mm / layout.pageHeightMm };

    const boxSizePx = Math.round((OMR_GEOMETRY.fiducialSizeMm / layout.pageWidthMm) * width);
    const halfBox = Math.max(5, Math.round(boxSizePx / 2));

    const getGray = (x: number, y: number): number => {
      const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
      const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
      const idx = (cy * width + cx) * 4;
      return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };

    const findBoxCenter = (expectedX: number, expectedY: number): OmrPoint | null => {
      // Search window: expanded to 12% of dimension so tighter or wider crops still locate fiducials reliably
      const searchW = Math.round(width * 0.12);
      const searchH = Math.round(height * 0.12);
      let bestX = expectedX;
      let bestY = expectedY;
      let maxScore = -9999;

      const darkThreshold = Math.min(paperBaseline - 25, paperBaseline * 0.82);

      for (let dy = -searchH; dy <= searchH; dy += 2) {
        for (let dx = -searchW; dx <= searchW; dx += 2) {
          const cx = expectedX + dx;
          const cy = expectedY + dy;

          if (cx - halfBox < 2 || cx + halfBox >= width - 2 || cy - halfBox < 2 || cy + halfBox >= height - 2) {
            continue;
          }

          let perimeterDark = 0;
          let totalSamples = 0;
          const numSamples = 6;
          for (let s = 0; s < numSamples; s++) {
            const frac = (s / (numSamples - 1)) * 2 - 1;
            const gxTop = getGray(cx + frac * halfBox, cy - halfBox);
            const gxBot = getGray(cx + frac * halfBox, cy + halfBox);
            const gyLeft = getGray(cx - halfBox, cy + frac * halfBox);
            const gyRight = getGray(cx + halfBox, cy + frac * halfBox);

            if (gxTop < darkThreshold) perimeterDark++;
            if (gxBot < darkThreshold) perimeterDark++;
            if (gyLeft < darkThreshold) perimeterDark++;
            if (gyRight < darkThreshold) perimeterDark++;
            totalSamples += 4;
          }

          const centerGray = getGray(cx, cy);
          const centerPenalty = Math.max(0, paperBaseline - centerGray);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const score = (perimeterDark / totalSamples) * 100 - centerPenalty * 0.4 - dist * 0.4;

          if (score > maxScore) {
            maxScore = score;
            bestX = cx;
            bestY = cy;
          }
        }
      }

      if (maxScore > 18) {
        return { x: bestX, y: bestY };
      }
      return null;
    };

    const tl = findBoxCenter(normTL.x * width, normTL.y * height);
    const tr = findBoxCenter(normTR.x * width, normTR.y * height);
    const bl = findBoxCenter(normBL.x * width, normBL.y * height);
    const br = findBoxCenter(normBR.x * width, normBR.y * height);

    let foundCount = 0;
    if (tl) foundCount++;
    if (tr) foundCount++;
    if (bl) foundCount++;
    if (br) foundCount++;

    let finalTl = tl;
    let finalTr = tr;
    let finalBl = bl;
    let finalBr = br;

    if (foundCount === 3) {
      if (!finalTl && finalTr && finalBl && finalBr) {
        finalTl = {
          x: finalTr.x + finalBl.x - finalBr.x,
          y: finalTr.y + finalBl.y - finalBr.y
        };
      } else if (!finalTr && finalTl && finalBl && finalBr) {
        finalTr = {
          x: finalTl.x + finalBr.x - finalBl.x,
          y: finalTl.y + finalBr.y - finalBl.y
        };
      } else if (!finalBl && finalTl && finalTr && finalBr) {
        finalBl = {
          x: finalTl.x + finalBr.x - finalTr.x,
          y: finalTl.y + finalBr.y - finalTr.y
        };
      } else if (!finalBr && finalTl && finalTr && finalBl) {
        finalBr = {
          x: finalTr.x + finalBl.x - finalTl.x,
          y: finalTr.y + finalBl.y - finalTl.y
        };
      }
      foundCount = 4;
    }

    if (foundCount === 2) {
      const aspect = layout.fiducialSpanY_mm / layout.fiducialSpanX_mm;
      if (finalTl && finalTr) {
        const vx = finalTr.x - finalTl.x;
        const vy = finalTr.y - finalTl.y;
        const px = -vy;
        const py = vx;
        finalBl = {
          x: finalTl.x + px * aspect,
          y: finalTl.y + py * aspect
        };
        finalBr = {
          x: finalTr.x + px * aspect,
          y: finalTr.y + py * aspect
        };
        foundCount = 4;
      }
      else if (finalBl && finalBr) {
        const vx = finalBr.x - finalBl.x;
        const vy = finalBr.y - finalBl.y;
        const px = vy;
        const py = -vx;
        finalTl = {
          x: finalBl.x + px * aspect,
          y: finalBl.y + py * aspect
        };
        finalTr = {
          x: finalBr.x + px * aspect,
          y: finalBr.y + py * aspect
        };
        foundCount = 4;
      }
      else if (finalTl && finalBl) {
        const vx = finalBl.x - finalTl.x;
        const vy = finalBl.y - finalTl.y;
        const px = vy / aspect;
        const py = -vx / aspect;
        finalTr = {
          x: finalTl.x + px,
          y: finalTl.y + py
        };
        finalBr = {
          x: finalBl.x + px,
          y: finalBl.y + py
        };
        foundCount = 4;
      }
      else if (finalTr && finalBr) {
        const vx = finalBr.x - finalTr.x;
        const vy = finalBr.y - finalTr.y;
        const px = -vy / aspect;
        const py = vx / aspect;
        finalTl = {
          x: finalTr.x + px,
          y: finalTr.y + py
        };
        finalBl = {
          x: finalBr.x + px,
          y: finalBr.y + py
        };
        foundCount = 4;
      }
    }

    if (finalTl && finalTr && finalBl && finalBr) {
      return { topLeft: finalTl, topRight: finalTr, bottomLeft: finalBl, bottomRight: finalBr };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sub-pixel local circle center refinement:
 * Searches a small local window (±6px) around expected bubble coordinates to lock
 * onto the physical printed circle perimeter on the paper.
 * This guarantees the sampling core sits directly in the center of the bubble,
 * preventing any perimeter line crossing into empty bubbles.
 */
function refineCircleCenter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
  radiusPx: number,
  paperBaseline: number
): { x: number; y: number } {
  const r = Math.round(radiusPx);
  if (r < 3) return { x: expectedX, y: expectedY };

  const getGray = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (cy * width + cx) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  const darkThreshold = Math.min(paperBaseline - 25, paperBaseline * 0.85);

  let bestDx = 0;
  let bestDy = 0;
  let maxScore = -9999;

  const searchRange = Math.min(8, Math.max(4, Math.round(r * 0.55)));
  const numAngles = 12;
  const angles: { cos: number; sin: number }[] = [];
  for (let i = 0; i < numAngles; i++) {
    const th = (i * 2 * Math.PI) / numAngles;
    angles.push({ cos: Math.cos(th), sin: Math.sin(th) });
  }

  for (let dy = -searchRange; dy <= searchRange; dy += 1) {
    for (let dx = -searchRange; dx <= searchRange; dx += 1) {
      const cx = expectedX + dx;
      const cy = expectedY + dy;

      if (cx - r < 2 || cx + r >= width - 2 || cy - r < 2 || cy + r >= height - 2) {
        continue;
      }

      // 1. Perimeter ring darkness at radius r (where the printed circular border is)
      let ringDarkness = 0;
      let darkPerimeterPoints = 0;
      for (let i = 0; i < numAngles; i++) {
        const px = cx + r * angles[i].cos;
        const py = cy + r * angles[i].sin;
        const g = getGray(px, py);
        const d = Math.max(0, paperBaseline - g);
        ringDarkness += d;
        if (g < darkThreshold) {
          darkPerimeterPoints++;
        }
      }
      ringDarkness /= numAngles;

      // 2. Outside margin darkness at radius 1.35 * r (should be clear white paper)
      let outsideDarkness = 0;
      for (let i = 0; i < 4; i++) {
        const th = i * (Math.PI / 2);
        const ox = cx + (r * 1.35) * Math.cos(th);
        const oy = cy + (r * 1.35) * Math.sin(th);
        const g = getGray(ox, oy);
        outsideDarkness += Math.max(0, paperBaseline - g);
      }
      outsideDarkness /= 4;

      const dist = Math.sqrt(dx * dx + dy * dy);
      const score = ringDarkness * 1.2 + (darkPerimeterPoints * 4) - outsideDarkness * 1.5 - dist * 1.5;

      if (score > maxScore) {
        maxScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  if (maxScore > 0) {
    return { x: expectedX + bestDx, y: expectedY + bestDy };
  }

  return { x: expectedX, y: expectedY };
}

/**
 * Wide-range circle center refinement:
 * Searches a larger local window to lock onto physical printed circles, returning
 * the maximum score achieved so we can verify if a printed bubble is actually located there.
 */
function refineCircleCenterWithRange(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
  radiusPx: number,
  paperBaseline: number,
  searchRange: number
): { x: number; y: number; score: number } {
  const r = Math.round(radiusPx);
  if (r < 3) return { x: expectedX, y: expectedY, score: -999 };

  const getGray = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (cy * width + cx) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  const darkThreshold = Math.min(paperBaseline - 25, paperBaseline * 0.85);

  let bestDx = 0;
  let bestDy = 0;
  let maxScore = -9999;

  const numAngles = 12;
  const angles: { cos: number; sin: number }[] = [];
  for (let i = 0; i < numAngles; i++) {
    const th = (i * 2 * Math.PI) / numAngles;
    angles.push({ cos: Math.cos(th), sin: Math.sin(th) });
  }

  for (let dy = -searchRange; dy <= searchRange; dy += 1) {
    for (let dx = -searchRange; dx <= searchRange; dx += 1) {
      const cx = expectedX + dx;
      const cy = expectedY + dy;

      if (cx - r < 2 || cx + r >= width - 2 || cy - r < 2 || cy + r >= height - 2) {
        continue;
      }

      let ringDarkness = 0;
      let darkPerimeterPoints = 0;
      for (let i = 0; i < numAngles; i++) {
        const px = cx + r * angles[i].cos;
        const py = cy + r * angles[i].sin;
        const g = getGray(px, py);
        const d = Math.max(0, paperBaseline - g);
        ringDarkness += d;
        if (g < darkThreshold) {
          darkPerimeterPoints++;
        }
      }
      ringDarkness /= numAngles;

      let outsideDarkness = 0;
      for (let i = 0; i < 4; i++) {
        const th = i * (Math.PI / 2);
        const ox = cx + (r * 1.35) * Math.cos(th);
        const oy = cy + (r * 1.35) * Math.sin(th);
        const g = getGray(ox, oy);
        outsideDarkness += Math.max(0, paperBaseline - g);
      }
      outsideDarkness /= 4;

      const dist = Math.sqrt(dx * dx + dy * dy);
      const score = ringDarkness * 1.2 + (darkPerimeterPoints * 4) - outsideDarkness * 1.5 - dist * 0.4;

      if (score > maxScore) {
        maxScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  if (maxScore > 0) {
    return { x: expectedX + bestDx, y: expectedY + bestDy, score: maxScore };
  }

  return { x: expectedX, y: expectedY, score: -999 };
}

/**
 * Accurately analyzes the optical density of a bubble at the exact OMR generated sheet coordinates.
 * - Evaluates strictly inside the inner disc (radius 0.52 * R) to maintain a wide safety buffer from printed borders.
 * - Performs a 4-quadrant area distribution test to detect and reject 1D lines, borders, and tangent arcs.
 * - Requires central core ink presence (inner 28% radius) so edge crossings cannot register as marks.
 */
function sampleBubbleOpticalDensity(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  bubbleRadiusPx: number,
  paperBaseline: number
): BubbleFillAnalysis {
  const r = Math.max(3, Math.floor(bubbleRadiusPx));
  // Safe inner sampling radius: 0.52 * r leaves a 48% whitespace gap from the printed border outline
  const innerR = Math.max(2, Math.floor(r * 0.52));
  const innerRSq = innerR * innerR;
  const coreR = Math.max(1, Math.floor(r * 0.28));
  const coreRSq = coreR * coreR;

  const getGray = (x: number, y: number): number => {
    const px = Math.max(0, Math.min(width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (py * width + px) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  // Sample local paper background in 4 surrounding cardinal positions outside the bubble
  // This accurately adapts to shadows and uneven phone lighting without bleeding across rows
  const vOffset = Math.round(r * 1.45);
  const hOffset = Math.round(r * 1.45);
  const pAbove = getGray(cx, cy - vOffset);
  const pBelow = getGray(cx, cy + vOffset);
  const pLeft = getGray(cx - hOffset, cy);
  const pRight = getGray(cx + hOffset, cy);

  // Take the 2 brightest surrounding points (avoids sampling question numbers or adjacent bubble rims)
  const ambientSamples = [pAbove, pBelow, pLeft, pRight].sort((a, b) => b - a);
  const localAmbient = (ambientSamples[0] + ambientSamples[1]) * 0.5;

  // True local illumination: if this section is in shadow (e.g. 150-180), track localAmbient closely
  // instead of forcing bright global paper margins which causes false-positives
  const localPaper = Math.max(120, Math.min(255, localAmbient * 0.85 + Math.min(localAmbient, paperBaseline) * 0.15));
  // Meaningful ink threshold: ink must be distinctly darker than true local paper background
  const darkThreshold = Math.min(localPaper - 25, localPaper * 0.80);

  let darkCount = 0;
  let innerCount = 0;
  let sumDarkness = 0;
  let coreDark = 0;
  let coreCount = 0;
  const qDark = [0, 0, 0, 0];
  const qCount = [0, 0, 0, 0];

  for (let dy = -innerR; dy <= innerR; dy++) {
    for (let dx = -innerR; dx <= innerR; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq <= innerRSq) {
        innerCount++;
        // Quadrant assignment (0=TR, 1=TL, 2=BL, 3=BR)
        const qIdx = dx >= 0 ? (dy < 0 ? 0 : 3) : (dy < 0 ? 1 : 2);
        qCount[qIdx]++;

        const g = getGray(cx + dx, cy + dy);
        const relDarkness = Math.max(0, (localPaper - g) / localPaper);
        sumDarkness += relDarkness;

        if (g < darkThreshold) {
          darkCount++;
          qDark[qIdx]++;
        }

        if (distSq <= coreRSq) {
          coreCount++;
          if (g < darkThreshold) {
            coreDark++;
          }
        }
      }
    }
  }

  const rawDarkRatio = innerCount > 0 ? darkCount / innerCount : 0;
  const meanDarkness = innerCount > 0 ? sumDarkness / innerCount : 0;
  const coreDarkRatio = coreCount > 0 ? coreDark / coreCount : 0;

  // 4-Quadrant 2D Area Verification:
  // A single line or circular border only intersects 1 or 2 quadrants.
  // A true student-filled bubble covers at least 3 quadrants with meaningful ink!
  const minQuadrantPixels = Math.max(2, Math.round(innerCount * 0.05));
  let activeQuadrants = 0;
  for (let i = 0; i < 4; i++) {
    if (qDark[i] >= minQuadrantPixels && (qCount[i] > 0 && qDark[i] / qCount[i] >= 0.18)) {
      activeQuadrants++;
    }
  }

  // A candidate is a line / border artifact if:
  // - It does not spread across at least 3 quadrants, OR
  // - The central core has less than 20% dark pixels
  const isLineArtifact = activeQuadrants < 3 || coreDarkRatio < 0.20;

  let score = 0;
  // Compute continuous score whenever ink spreads across >= 3 quadrants and core is touched
  if (!isLineArtifact && rawDarkRatio >= 0.22 && coreDarkRatio >= 0.20) {
    const fillMetric = rawDarkRatio * 0.60 + meanDarkness * 0.40;
    const coreBonus = coreDarkRatio >= 0.42 ? 1.25 : (coreDarkRatio >= 0.32 ? 1.05 : 0.90);
    score = fillMetric * coreBonus;
  } else {
    // Empty bubble or edge touching returns clean 0 score
    score = 0;
  }

  const fillMetric = rawDarkRatio * 0.60 + meanDarkness * 0.40;

  return {
    fillMetric,
    rawDarkRatio,
    meanDarkness,
    coreDarkRatio,
    coreLuminance: localPaper,
    paperLuminance: localPaper,
    score,
    activeQuadrants,
    isLineArtifact,
  };
}

/**
 * Robust Answer Key Resolver:
 * Extracts the single canonical option letter ('A' | 'B' | 'C' | 'D') for any question format.
 */
export function resolveActualCorrectOption(q: any, qIdx: number): string {
  const optionsLetters = ['A', 'B', 'C', 'D'];
  if (!q) return 'A';

  // 1. Try matching with standard checkIsOptionCorrect against question options
  if (Array.isArray(q.options) && q.options.length > 0) {
    for (let i = 0; i < q.options.length && i < 4; i++) {
      if (checkIsOptionCorrect(q.options[i], i, q)) {
        return optionsLetters[i] || 'A';
      }
    }
  }

  // 2. Direct clean examination of correctAnswer / solution / answer fields
  const rawAns = String(q.correctAnswer || q.answer || q.solution || q.correct_answer || q.correctOption || '').trim();
  if (rawAns) {
    const clean = rawAns.replace(/[*_`"'()[\]]/g, ' ').trim();

    // Direct single letter match: "A", "B", "C", "D"
    const singleLetter = clean.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(singleLetter)) {
      return singleLetter;
    }

    // Match "Option A", "Option B", "A.", "B)" etc.
    const letterMatch = clean.match(/\b([A-Da-d])\b/) || clean.match(/^([A-Da-d])[.:)\s]/);
    if (letterMatch && letterMatch[1]) {
      return letterMatch[1].toUpperCase();
    }

    // Option 1-4 (1-based) or 0-3 (0-based)
    const numMatch = clean.match(/\b([0-4])\b/);
    if (numMatch && numMatch[1]) {
      const val = parseInt(numMatch[1], 10);
      if (val >= 1 && val <= 4) return optionsLetters[val - 1];
      if (val === 0) return 'A';
    }

    // Direct string comparison against options text
    if (Array.isArray(q.options) && q.options.length > 0) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/^\$+|\$+$/g, '').replace(/\s+/g, '');
      const cleanNorm = norm(clean);
      for (let i = 0; i < q.options.length && i < 4; i++) {
        if (norm(String(q.options[i])) === cleanNorm) {
          return optionsLetters[i];
        }
      }
    }
  }

  return 'A';
}

/**
 * Draw visual evaluation overlay circles onto the canvas according to the Answer Key:
 * - Yellow color for the correct answer key.
 * - If a question is not marked on OMR, the yellow answer key circle shows the correct answer.
 * - If a question is marked and correct, it shows a green circle.
 * - If a question is marked and wrong, it shows a red circle on the marked option and a yellow circle on the correct answer.
 * - In the circles, no cross or tick mark icons are shown.
 * - All circles align accurately to the OMR sheet generated coordinates.
 */
export function drawOmrEvaluationOverlays(
  ctx: CanvasRenderingContext2D,
  questionDetections: OmrQuestionDetection[],
  blueprint: OmrSheetBlueprint,
  bubbleRadiusPx: number,
  targetW: number,
  targetH: number,
  refinedCenters?: { [key: string]: OmrPoint }
): void {
  const strokeWidth = Math.max(2.2, Math.min(3.6, bubbleRadiusPx * 0.26));
  const optionsLetters = ['A', 'B', 'C', 'D'];

  // Clean circle renderer: purely draws the accurate circle ring with subtle fill (no cross or tick marks)
  const drawCircle = (
    x: number,
    y: number,
    strokeColor: string,
    fillColor: string,
    width: number
  ) => {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = width;

    ctx.beginPath();
    ctx.arc(x, y, bubbleRadiusPx + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  for (let qIdx = 0; qIdx < questionDetections.length; qIdx++) {
    const det = questionDetections[qIdx];
    if (!det) continue;

    optionsLetters.forEach((optLetter, optIdx) => {
      // Use exact coordinates generated for this OMR sheet bubble
      const refined = refinedCenters?.[`${qIdx}_${optIdx}`];
      let ptX: number;
      let ptY: number;

      if (refined) {
        ptX = refined.x;
        ptY = refined.y;
      } else {
        const record = blueprint.bubbleMap[`${qIdx}_${optIdx}`];
        const normX = record ? record.pageNormX : 0.5;
        const normY = record ? record.pageNormY : 0.5;
        ptX = normX * targetW;
        ptY = normY * targetH;
      }

      const isUserChoice = det.detectedOption === optLetter && det.detectedOption !== '';
      const isActualCorrect = det.actualCorrectOption === optLetter;
      const reading = det.bubbleReadings?.[optIdx];
      const isMarkedBubble = reading ? reading.isMarked : isUserChoice;

      if (det.isMultipleMarked) {
        // Multiple marks: Correct answer key option always shows YELLOW circle to highlight the solution.
        // Incorrectly marked extra bubbles show RED circle. No marks are awarded (0 points).
        if (isActualCorrect) {
          drawCircle(ptX, ptY, '#ca8a04', 'rgba(234, 179, 8, 0.28)', strokeWidth + 0.2);
        } else if (isMarkedBubble) {
          drawCircle(ptX, ptY, '#dc2626', 'rgba(220, 38, 38, 0.22)', strokeWidth + 0.4);
        }
      } else if (det.detectedOption === '') {
        // Unattempted / Not marked on OMR: Yellow answer key shows the correct answer
        if (isActualCorrect) {
          drawCircle(ptX, ptY, '#ca8a04', 'rgba(234, 179, 8, 0.28)', strokeWidth);
        }
      } else if (det.isCorrect) {
        // Marked on OMR and correct: Shows green circle
        if (isUserChoice) {
          drawCircle(ptX, ptY, '#16a34a', 'rgba(22, 163, 74, 0.22)', strokeWidth + 0.4);
        }
      } else {
        // Marked on OMR and NOT correct:
        // Shows a red circle for wrong and a yellow circle for the correct answer
        if (isUserChoice) {
          drawCircle(ptX, ptY, '#dc2626', 'rgba(220, 38, 38, 0.22)', strokeWidth + 0.4);
        }
        if (isActualCorrect) {
          drawCircle(ptX, ptY, '#ca8a04', 'rgba(234, 179, 8, 0.28)', strokeWidth);
        }
      }
    });
  }

  // Draw clear calibration status in bottom-right corner of overlay (no ISO A4 dimension tags)
  ctx.save();
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.70)';
  ctx.textAlign = 'right';
  ctx.fillText('OMR EVALUATION • CALIBRATED', targetW - 14, targetH - 12);
  ctx.restore();
}

/**
 * Re-renders the OMR evaluation diagnostic overlays on a base image whenever
 * detections or answers are adjusted manually.
 */
export function redrawOmrOverlay(
  baseImage: HTMLImageElement | HTMLCanvasElement,
  questionDetections: OmrQuestionDetection[],
  totalQuestions: number,
  refinedCenters?: { [key: string]: OmrPoint }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = baseImage.width;
  canvas.height = baseImage.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(baseImage, 0, 0);

  const blueprint = generateOmrSheetBlueprint(totalQuestions);
  const layout = blueprint.layout;
  const bubbleRadiusPx = Math.max(4, Math.min(20, (canvas.width * OMR_GEOMETRY.bubbleRadiusMm) / layout.pageWidthMm));

  drawOmrEvaluationOverlays(ctx, questionDetections, blueprint, bubbleRadiusPx, canvas.width, canvas.height, refinedCenters);

  return canvas.toDataURL('image/png');
}

/**
 * Comprehensive OMR Evaluation Engine:
 * 1. Straightens any document tilt.
 * 2. Samples local paper baseline brightness.
 * 3. Scans each question's bubble options at the exact coordinates generated for this OMR sheet.
 * 4. Compares relative contrast across options in each row to detect filled options accurately.
 * 5. Draws clean color-coded circles (Green for correct, Red for wrong, Yellow for correct answer key)
 *    without cross or tick mark icons inside.
 */
export async function evaluateScannedOmrImage(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  test: MathTest,
  totalQuestionsToEvaluate?: number
): Promise<OmrScanResult> {
  const totalQs = totalQuestionsToEvaluate && totalQuestionsToEvaluate > 0
    ? totalQuestionsToEvaluate
    : (test.questions?.length || 50);

  // 1. Prepare target canvas
  const canvas = document.createElement('canvas');
  const maxDim = 1800;
  let targetW = imageSource.width || 1200;
  let targetH = imageSource.height || 1600;

  if (targetW > maxDim || targetH > maxDim) {
    if (targetW > targetH) {
      targetH = Math.round((targetH / targetW) * maxDim);
      targetW = maxDim;
    } else {
      targetW = Math.round((targetW / targetH) * maxDim);
      targetH = maxDim;
    }
  }

  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to initialize canvas 2D context for OMR processing');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageSource, 0, 0, targetW, targetH);

  // 2. Document Tilt Deskewing (only if noticeable tilt)
  const tiltAngle = detectDocumentTiltAngle(ctx, targetW, targetH);
  if (Math.abs(tiltAngle) >= 0.35) {
    deskewCanvas(canvas, ctx, tiltAngle);
  }

  // Retain clean deskewed image before drawing overlays
  const cleanImageDataUrl = canvas.toDataURL('image/png');

  // 3. Compute baseline paper background brightness from margins
  const paperLuminance = samplePaperBaselineBrightness(ctx, targetW, targetH);

  // Extract full image pixel buffer once for ultra-fast vectorised sampling
  const fullImageData = ctx.getImageData(0, 0, targetW, targetH);
  const pixelData = fullImageData.data;

  // 4. Multi-Hypothesis Coordinate Calibration:
  // Check Full ISO A4 (210 x 297 mm), Compact format, and Fiducial-Cropped coordinates
  const blueprintA4 = generateOmrSheetBlueprint(totalQs, undefined, 'a4');
  const fiducialsA4 = detectCornerFiducials(pixelData, targetW, targetH, blueprintA4.layout, paperLuminance);

  const blueprintCompact = generateOmrSheetBlueprint(totalQs, undefined, 'compact');
  const fiducialsCompact = detectCornerFiducials(pixelData, targetW, targetH, blueprintCompact.layout, paperLuminance);

  let blueprint = blueprintA4;
  let fiducials = fiducialsA4;
  let detectedFormat: 'a4' | 'compact' = 'a4';

  if (!fiducialsA4 && fiducialsCompact) {
    blueprint = blueprintCompact;
    fiducials = fiducialsCompact;
    detectedFormat = 'compact';
  }

  let isTightFiducialCrop = false;

  // If corner fiducials were not detected at standard page margins (e.g., user cropped between the fiducials):
  // We test whether the image is a Tight Fiducial Crop (where fiducials are at the 4 image boundaries)
  // vs a Full Page Crop (where fiducials are at the standard page ratio).
  if (!fiducials) {
    const layout = blueprint.layout;
    const testBubbleRadius = Math.max(4, Math.min(22, (targetW * OMR_GEOMETRY.bubbleRadiusMm) / layout.fiducialSpanX_mm));
    
    let tightCropScore = 0;
    let fullPageScore = 0;
    const sampleIndices = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44].filter(idx => idx < totalQs);

    sampleIndices.forEach(qIdx => {
      const record = blueprint.bubbleMap[`${qIdx}_0`]; // Option A
      if (record) {
        // Hypothesis 1: Tight Fiducial Crop (mapped from fiducial TL (0,0) to fiducial BR (1,1))
        const h1X = record.normX * targetW;
        const h1Y = record.normY * targetH;
        const s1 = refineCircleCenterWithRange(pixelData, targetW, targetH, h1X, h1Y, testBubbleRadius, paperLuminance, 14);
        if (s1.score > 2) tightCropScore += s1.score;

        // Hypothesis 2: Full Page Crop (mapped from page TL (0,0) to page BR (1,1))
        const h2X = record.pageNormX * targetW;
        const h2Y = record.pageNormY * targetH;
        const s2 = refineCircleCenterWithRange(pixelData, targetW, targetH, h2X, h2Y, testBubbleRadius, paperLuminance, 14);
        if (s2.score > 2) fullPageScore += s2.score;
      }
    });

    if (tightCropScore >= fullPageScore || (tightCropScore > 8 && fullPageScore <= 8)) {
      isTightFiducialCrop = true;
      fiducials = {
        topLeft: { x: 0, y: 0 },
        topRight: { x: targetW, y: 0 },
        bottomLeft: { x: 0, y: targetH },
        bottomRight: { x: targetW, y: targetH },
      };
      console.log(`[OMR Engine] Calibrated as Tight Fiducial Crop (tightScore: ${tightCropScore.toFixed(1)} vs fullPageScore: ${fullPageScore.toFixed(1)})`);
    }
  }

  const layout = blueprint.layout;

  // Physical Bubble Radius in Pixels based on calibrated coordinate span
  const effectiveSpanMm = isTightFiducialCrop ? layout.fiducialSpanX_mm : layout.pageWidthMm;
  const bubbleRadiusPx = Math.max(4, Math.min(22, (targetW * OMR_GEOMETRY.bubbleRadiusMm) / effectiveSpanMm));

  const questionDetections: OmrQuestionDetection[] = [];
  const optionsLetters = ['A', 'B', 'C', 'D'];
  const questionsList = test.questions || [];

  // Track exact bubble coordinates and fill analyses matching the OMR sheet
  const bubbleCenters: { [key: string]: Point } = {};
  const bubbleAnalyses: { [key: string]: BubbleFillAnalysis } = {};

  // -------------------------------------------------------------
  // STAGE 2: GLOBAL GRID SHIFT OPTIMIZATION & AUTO-CORRECTION
  // -------------------------------------------------------------
  let globalDx = 0;
  let globalDy = 0;

  try {
    // We will sample up to 16 bubbles across the layout to measure coordinate shifts
    const sampleKeys: { qIdx: number; optIdx: number }[] = [];
    const stepQ = Math.max(1, Math.floor(totalQs / 4));
    for (let q = 0; q < totalQs; q += stepQ) {
      for (let opt = 0; opt < 4; opt += 2) { // Sample Options A and C
        sampleKeys.push({ qIdx: q, optIdx: opt });
      }
    }

    const dxSamples: number[] = [];
    const dySamples: number[] = [];

    sampleKeys.forEach(({ qIdx, optIdx }) => {
      const record = blueprint.bubbleMap[`${qIdx}_${optIdx}`];
      let initialX: number;
      let initialY: number;

      if (fiducials) {
        const normX = record ? record.normX : 0.5;
        const normY = record ? record.normY : 0.5;
        const topX = fiducials.topLeft.x + (fiducials.topRight.x - fiducials.topLeft.x) * normX;
        const topY = fiducials.topLeft.y + (fiducials.topRight.y - fiducials.topLeft.y) * normX;
        const botX = fiducials.bottomLeft.x + (fiducials.bottomRight.x - fiducials.bottomLeft.x) * normX;
        const botY = fiducials.bottomLeft.y + (fiducials.bottomRight.y - fiducials.bottomLeft.y) * normX;
        initialX = topX + (botX - topX) * normY;
        initialY = topY + (botY - topY) * normY;
      } else {
        const normX = record ? record.pageNormX : 0.5;
        const normY = record ? record.pageNormY : 0.5;
        initialX = normX * targetW;
        initialY = normY * targetH;
      }

      // We run refineCircleCenter with a wider search range (e.g., ±25 pixels) to snap onto shifted bubbles
      const snapped = refineCircleCenterWithRange(
        pixelData,
        targetW,
        targetH,
        initialX,
        initialY,
        bubbleRadiusPx,
        paperLuminance,
        Math.max(16, Math.round(bubbleRadiusPx * 2.2)) // Wide search window
      );

      // If the snapped score is strong (meaning a real printed circle was found)
      if (snapped.score > 5) {
        dxSamples.push(snapped.x - initialX);
        dySamples.push(snapped.y - initialY);
      }
    });

    // Determine the consensus offset (using median of the tightly clustered samples)
    if (dxSamples.length >= 3) {
      dxSamples.sort((a, b) => a - b);
      dySamples.sort((a, b) => a - b);
      
      const midIdx = Math.floor(dxSamples.length / 2);
      globalDx = dxSamples[midIdx];
      globalDy = dySamples[midIdx];

      console.log(`[OMR Engine] Global Auto-Correction applied: dx=${globalDx.toFixed(1)}px, dy=${globalDy.toFixed(1)}px based on ${dxSamples.length} samples`);
    }
  } catch (err) {
    console.warn('[OMR Engine] Global shift optimization bypassed:', err);
  }

  for (let qIdx = 0; qIdx < totalQs; qIdx++) {
    const bubbleReadings: OmrBubbleReading[] = [];

    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const optLetter = optionsLetters[optIdx];
      const record = blueprint.bubbleMap[`${qIdx}_${optIdx}`];

      let initialX: number;
      let initialY: number;

      if (fiducials) {
        // Bilinear interpolation from the 4 corner registration fiducials
        const normX = record ? record.normX : 0.5;
        const normY = record ? record.normY : 0.5;

        const topX = fiducials.topLeft.x + (fiducials.topRight.x - fiducials.topLeft.x) * normX;
        const topY = fiducials.topLeft.y + (fiducials.topRight.y - fiducials.topLeft.y) * normX;
        const botX = fiducials.bottomLeft.x + (fiducials.bottomRight.x - fiducials.bottomLeft.x) * normX;
        const botY = fiducials.bottomLeft.y + (fiducials.bottomRight.y - fiducials.bottomLeft.y) * normX;

        initialX = topX + (botX - topX) * normY;
        initialY = topY + (botY - topY) * normY;
      } else {
        // Exact OMR generated sheet coordinates
        const normX = record ? record.pageNormX : (blueprint.bubbleRecords[qIdx * 4 + optIdx]?.pageNormX ?? 0.5);
        const normY = record ? record.pageNormY : (blueprint.bubbleRecords[qIdx * 4 + optIdx]?.pageNormY ?? 0.5);
        initialX = normX * targetW;
        initialY = normY * targetH;
      }

      // Apply global grid alignment auto-correcting shifts!
      const correctedX = initialX + globalDx;
      const correctedY = initialY + globalDy;

      // Sub-pixel circle snapping: lock directly onto the physical printed circle
      const snapped = refineCircleCenter(
        pixelData,
        targetW,
        targetH,
        correctedX,
        correctedY,
        bubbleRadiusPx,
        paperLuminance
      );
      const bubbleX = snapped.x;
      const bubbleY = snapped.y;

      const analysis = sampleBubbleOpticalDensity(
        pixelData,
        targetW,
        targetH,
        bubbleX,
        bubbleY,
        bubbleRadiusPx,
        paperLuminance
      );

      bubbleCenters[`${qIdx}_${optIdx}`] = { x: bubbleX, y: bubbleY };
      bubbleAnalyses[`${qIdx}_${optIdx}`] = analysis;

      bubbleReadings.push({
        option: optLetter,
        optionIndex: optIdx,
        fillRatio: analysis.fillMetric,
        isMarked: false,
      });
    }

    // 5. Adaptive Relative Contrast Decision Engine:
    // Sort options by darkness score to compare candidate fills against baseline empty bubbles in this row
    const sortedCandidates = [...bubbleReadings]
      .map((b) => ({
        ...b,
        analysis: bubbleAnalyses[`${qIdx}_${b.optionIndex}`],
        score: bubbleAnalyses[`${qIdx}_${b.optionIndex}`]?.score || 0,
      }))
      .sort((a, b) => b.score - a.score);

    const topCandidate = sortedCandidates[0];
    const runnerUp = sortedCandidates[1];
    const third = sortedCandidates[2];
    const fourth = sortedCandidates[3];

    // Average baseline of empty options in this question
    const baselineOtherScore = (runnerUp.score + third.score + fourth.score) / 3;
    const contrastDiff = topCandidate.score - baselineOtherScore;
    const contrastRatio = topCandidate.score / Math.max(0.015, baselineOtherScore);

    let isTopMarked = false;
    let isRunnerUpMarked = false;

    // Dual-Tier Adaptive Mark Verification:
    // Tier 1: Solid ink / standard pencil filling
    const isSolidMark = Boolean(
      topCandidate.analysis &&
      topCandidate.score >= 0.30 &&
      topCandidate.analysis.rawDarkRatio >= 0.32 &&
      topCandidate.analysis.coreDarkRatio >= 0.30 &&
      topCandidate.analysis.activeQuadrants >= 3 &&
      !topCandidate.analysis.isLineArtifact &&
      (contrastDiff >= 0.12 || topCandidate.analysis.rawDarkRatio >= 0.50) &&
      topCandidate.score > baselineOtherScore + 0.10
    );

    // Tier 2: Faint pencil / light shading (accepted when isolated with high contrast over 3 blank bubbles)
    const isFaintPencilMark = Boolean(
      !isSolidMark &&
      topCandidate.analysis &&
      topCandidate.score >= 0.20 &&
      topCandidate.analysis.rawDarkRatio >= 0.24 &&
      topCandidate.analysis.coreDarkRatio >= 0.22 &&
      topCandidate.analysis.activeQuadrants >= 3 &&
      !topCandidate.analysis.isLineArtifact &&
      contrastDiff >= 0.16 &&
      contrastRatio >= 2.5 &&
      baselineOtherScore < 0.10
    );

    if (isSolidMark || isFaintPencilMark) {
      isTopMarked = true;
    }

    // Check for multiple marks (e.g. student filled two options) vs erased smudge
    // True double-marking requires runnerUp to also have strong core dark ratio and high score
    if (
      isTopMarked &&
      runnerUp.analysis &&
      runnerUp.score >= 0.28 &&
      runnerUp.analysis.rawDarkRatio >= 0.30 &&
      runnerUp.analysis.coreDarkRatio >= 0.28 &&
      runnerUp.analysis.activeQuadrants >= 3 &&
      !runnerUp.analysis.isLineArtifact &&
      (runnerUp.score >= topCandidate.score - 0.14 || runnerUp.score >= baselineOtherScore + 0.18)
    ) {
      isRunnerUpMarked = true;
    }

    // Assign isMarked flags
    bubbleReadings.forEach((b) => {
      if (topCandidate && b.option === topCandidate.option) {
        b.isMarked = isTopMarked;
      } else if (runnerUp && b.option === runnerUp.option) {
        b.isMarked = isRunnerUpMarked;
      } else {
        b.isMarked = false;
      }
    });

    let detectedOption = '';
    let isAmbiguous = false;
    let isMultipleMarked = false;
    let confidence = 0;

    if (isTopMarked && isRunnerUpMarked) {
      isMultipleMarked = true;
      isAmbiguous = true;
      detectedOption = '';
      confidence = 0;
    } else if (isTopMarked && topCandidate) {
      detectedOption = topCandidate.option;
      confidence = Math.min(1.0, topCandidate.score * 1.5);
    }

    // Determine actual correct answer for this question using robust resolver
    const q = questionsList[qIdx] || { text: `Question ${qIdx + 1}`, correctAnswer: 'A' };
    const actualCorrectOption = resolveActualCorrectOption(q, qIdx);

    // Determine correctness according to Answer Key
    let isCorrect = false;
    if (!isMultipleMarked && detectedOption) {
      if (detectedOption === actualCorrectOption) {
        isCorrect = true;
      } else if (Array.isArray(q.options)) {
        const selectedIdx = optionsLetters.indexOf(detectedOption);
        if (selectedIdx >= 0 && q.options[selectedIdx]) {
          isCorrect = checkIsOptionCorrect(q.options[selectedIdx], selectedIdx, q);
        }
      }
    }

    questionDetections.push({
      questionNumber: qIdx + 1,
      questionId: q.id || `q_${qIdx + 1}`,
      detectedOption,
      confidence,
      isAmbiguous,
      isMultipleMarked,
      bubbleReadings,
      actualCorrectOption,
      isCorrect,
    });
  }

  // 6. Draw visual diagnostic overlays onto canvas (Yellow, Red, Green according to Answer Key)
  drawOmrEvaluationOverlays(ctx, questionDetections, blueprint, bubbleRadiusPx, targetW, targetH, bubbleCenters);

  const processedImageDataUrl = canvas.toDataURL('image/png');

  // 7. Aggregate scorecard metrics
  let totalPoints = 0;
  let score = 0;

  for (let qIdx = 0; qIdx < totalQs; qIdx++) {
    const q = questionsList[qIdx];
    const qPoints = (q && q.points) ? q.points : 1;
    totalPoints += qPoints;

    const det = questionDetections[qIdx];
    if (det && det.isCorrect && !det.isMultipleMarked) {
      score += qPoints;
    }
  }

  const attemptedCount = questionDetections.filter((d) => d.detectedOption !== '' || d.isMultipleMarked).length;
  const correctCount = questionDetections.filter((d) => d.isCorrect && !d.isMultipleMarked).length;
  const incorrectCount = questionDetections.filter((d) => (d.detectedOption !== '' || d.isMultipleMarked) && !d.isCorrect).length;
  const unattemptedCount = Math.max(0, totalQs - attemptedCount);

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  const passingScore = test.passingScorePercentage || 60;
  const passed = percentage >= passingScore;

  // Compute aspect ratio match with ISO A4 (297 / 210 ≈ 1.4142)
  const actualRatio = targetH / targetW;
  const targetA4Ratio = 297 / 210;
  const a4RatioMatch = Math.abs(actualRatio - targetA4Ratio) / targetA4Ratio < 0.15;

  return {
    totalQuestions: totalQs,
    attemptedCount,
    correctCount,
    incorrectCount,
    unattemptedCount,
    score,
    totalPoints,
    percentage,
    passed,
    questionDetections,
    processedImageDataUrl,
    cleanImageDataUrl,
    refinedCenters: bubbleCenters,
    sheetFormat: detectedFormat,
    detectedDimensions: '210 × 297 mm (ISO A4)',
    a4RatioMatch,
  };
}
