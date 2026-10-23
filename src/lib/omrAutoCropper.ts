/**
 * Intelligent OMR Geometry & Fiducial Auto-Cropper
 * 
 * Automatically detects the 4 printed corner fiducial boxes in camera captures
 * and validates their geometrical ratio and physical box dimensions against
 * the active OMR blueprint's expected dimensions.
 */

import { OMR_GEOMETRY, OmrLayoutConfig, getOmrLayoutConfig } from './omrGeometry';
import { warpPerspectiveCanvas, type QuadPoint } from './omrPerspectiveWarp';

export interface FiducialBoxCandidate {
  x: number;          // center X in image pixels
  y: number;          // center Y in image pixels
  size: number;       // estimated box size in pixels
  score: number;      // contrast/boxness score (0 to 1)
  darkness: number;   // average border darkness (0 to 255)
  isHollow: boolean;  // whether detected as hollow square or solid mark
}

export interface DetectedOmrResult {
  detected: boolean;
  confidence: number; // 0 to 1
  fiducials: {
    tl: QuadPoint;    // center of top-left fiducial box (0 to 100% of image)
    tr: QuadPoint;    // center of top-right fiducial box (0 to 100% of image)
    br: QuadPoint;    // center of bottom-right fiducial box (0 to 100% of image)
    bl: QuadPoint;    // center of bottom-left fiducial box (0 to 100% of image)
  };
  // Outer page boundary corners extrapolated from fiducials (0 to 100% of image)
  outerCorners: {
    tl: QuadPoint;
    tr: QuadPoint;
    br: QuadPoint;
    bl: QuadPoint;
  };
  expectedRatio: number;
  measuredRatio: number;
  ratioMatchPercentage: number;
  expectedBoxSizePx: number;
  measuredBoxSizePx: number;
  boxSizeMatchPercentage: number;
  suggestedRotation?: number; // 0, 90, 180, 270
  calibratedDataUrl?: string; // Pre-calibrated rectified image if generated
}

/**
 * Fast integral image computation for O(1) rectangle luminance queries.
 */
class IntegralImage {
  private sum: Float64Array;
  public readonly width: number;
  public readonly height: number;

  constructor(grayData: Uint8Array, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.sum = new Float64Array((width + 1) * (height + 1));

    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      const srcRowIdx = y * width;
      const dstRowIdx = (y + 1) * (width + 1);
      const prevDstRowIdx = y * (width + 1);

      for (let x = 0; x < width; x++) {
        rowSum += grayData[srcRowIdx + x];
        this.sum[dstRowIdx + (x + 1)] = this.sum[prevDstRowIdx + (x + 1)] + rowSum;
      }
    }
  }

  // Returns sum of pixel intensities in [x0, y0] to [x1, y1] inclusive
  public getRectSum(x0: number, y0: number, x1: number, y1: number): number {
    const rx0 = Math.max(0, Math.min(this.width - 1, x0));
    const ry0 = Math.max(0, Math.min(this.height - 1, y0));
    const rx1 = Math.max(0, Math.min(this.width - 1, x1));
    const ry1 = Math.max(0, Math.min(this.height - 1, y1));

    if (rx1 < rx0 || ry1 < ry0) return 0;

    const stride = this.width + 1;
    const a = this.sum[ry0 * stride + rx0];
    const b = this.sum[ry0 * stride + (rx1 + 1)];
    const c = this.sum[(ry1 + 1) * stride + rx0];
    const d = this.sum[(ry1 + 1) * stride + (rx1 + 1)];

    return d - b - c + a;
  }

  // Returns average pixel intensity in [x0, y0] to [x1, y1] inclusive
  public getRectMean(x0: number, y0: number, x1: number, y1: number): number {
    const rx0 = Math.max(0, Math.min(this.width - 1, x0));
    const ry0 = Math.max(0, Math.min(this.height - 1, y0));
    const rx1 = Math.max(0, Math.min(this.width - 1, x1));
    const ry1 = Math.max(0, Math.min(this.height - 1, y1));

    const area = (rx1 - rx0 + 1) * (ry1 - ry0 + 1);
    if (area <= 0) return 255;
    return this.getRectSum(rx0, ry0, rx1, ry1) / area;
  }
}

/**
 * Searches for square fiducial box candidates in the integral image.
 * Recognizes BOTH printed hollow square boxes (dark perimeter with white center)
 * AND solid registration square marks, surrounded by bright white paper margins.
 */
function findFiducialCandidates(
  integral: IntegralImage,
  width: number,
  height: number,
  paperLuminance: number
): FiducialBoxCandidate[] {
  const candidates: FiducialBoxCandidate[] = [];

  // Expected fiducial box size across common image scales (typically 8px to 55px)
  const baseDim = Math.min(width, height);
  const minBox = Math.max(7, Math.round(baseDim * 0.010));
  const maxBox = Math.max(16, Math.round(baseDim * 0.065));
  const stepBox = Math.max(2, Math.round((maxBox - minBox) / 6));

  const testSizes: number[] = [];
  for (let s = minBox; s <= maxBox; s += stepBox) {
    testSizes.push(s);
  }

  // Grid step: 2 to 4 pixels for high-speed scanning
  const gridStep = Math.max(2, Math.round(baseDim / 220));

  for (const boxSize of testSizes) {
    const halfBox = Math.round(boxSize / 2);
    // Outer surrounding margin that should be bright white paper
    const ringMargin = Math.max(3, Math.round(boxSize * 0.55));
    // Border thickness for hollow fiducials
    const borderWidth = Math.max(1, Math.round(boxSize * 0.22));

    const minX = halfBox + ringMargin;
    const maxX = width - 1 - halfBox - ringMargin;
    const minY = halfBox + ringMargin;
    const maxY = height - 1 - halfBox - ringMargin;

    for (let cy = minY; cy <= maxY; cy += gridStep) {
      for (let cx = minX; cx <= maxX; cx += gridStep) {
        // 1. Total box mean
        const boxMean = integral.getRectMean(cx - halfBox, cy - halfBox, cx + halfBox, cy + halfBox);

        // 2. Outer ring margin intensity (should be bright white paper)
        const outerMean = integral.getRectMean(
          cx - halfBox - ringMargin,
          cy - halfBox - ringMargin,
          cx + halfBox + ringMargin,
          cy + halfBox + ringMargin
        );

        const outerArea = (boxSize + 2 * ringMargin) * (boxSize + 2 * ringMargin);
        const innerArea = boxSize * boxSize;
        const ringSum = outerMean * outerArea - boxMean * innerArea;
        const ringArea = outerArea - innerArea;
        const ringMean = ringSum / Math.max(1, ringArea);

        // Paper margin must be reasonably bright
        if (ringMean < paperLuminance * 0.65 && ringMean < 130) {
          continue;
        }

        // 3. Hollow vs Solid box evaluation:
        // Inner core of the box (for hollow boxes, inner core is bright paper)
        const coreHalf = Math.max(1, halfBox - borderWidth);
        const innerCoreMean = integral.getRectMean(cx - coreHalf, cy - coreHalf, cx + coreHalf, cy + coreHalf);
        const coreArea = (2 * coreHalf + 1) * (2 * coreHalf + 1);

        // Perimeter border of the box
        const borderSum = boxMean * innerArea - innerCoreMean * coreArea;
        const borderArea = innerArea - coreArea;
        const borderMean = borderArea > 0 ? borderSum / borderArea : boxMean;

        // Condition A: Hollow square box (dark border, bright center, bright outer ring)
        const isHollowBox =
          borderMean < ringMean - 22 &&
          borderMean < paperLuminance * 0.82 &&
          innerCoreMean >= borderMean + 12 &&
          ringMean >= borderMean + 25;

        // Condition B: Solid square box (uniformly dark core, bright outer ring)
        const isSolidBox =
          boxMean < ringMean - 28 &&
          boxMean < paperLuminance * 0.76;

        if (!isHollowBox && !isSolidBox) {
          continue;
        }

        const effectiveBorderDarkness = isHollowBox ? borderMean : boxMean;
        const contrast = ringMean - effectiveBorderDarkness;

        // Score based on contrast, paper clarity, and box geometry
        let score = Math.min(1.0, (contrast / 115) * (1.0 - effectiveBorderDarkness / 255));
        if (isHollowBox) {
          // Bonus for hollow fiducials matching standard OMR print
          const hollowShapeRatio = (innerCoreMean - borderMean) / Math.max(1, ringMean - borderMean);
          score = Math.min(1.0, score * 1.15 + Math.min(0.2, hollowShapeRatio * 0.2));
        }

        if (score > 0.20) {
          candidates.push({
            x: cx,
            y: cy,
            size: boxSize,
            score,
            darkness: effectiveBorderDarkness,
            isHollow: isHollowBox,
          });
        }
      }
    }
  }

  // Non-maximum suppression: merge overlapping candidates within spatial radius
  candidates.sort((a, b) => b.score - a.score);
  const suppressed: FiducialBoxCandidate[] = [];
  const distThresholdSq = Math.pow(Math.max(7, baseDim * 0.022), 2);

  for (const cand of candidates) {
    let tooClose = false;
    for (const kept of suppressed) {
      const dx = cand.x - kept.x;
      const dy = cand.y - kept.y;
      if (dx * dx + dy * dy < distThresholdSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      suppressed.push(cand);
      if (suppressed.length >= 45) break; // Limit candidate pool for combinatorial speed
    }
  }

  return suppressed;
}

/**
 * Evaluates whether 4 fiducial box candidates match the active OMR blueprint's
 * expected geometrical ratio and expected box size dimensions.
 */
function evaluateQuadRatioAndDimensions(
  tl: FiducialBoxCandidate,
  tr: FiducialBoxCandidate,
  br: FiducialBoxCandidate,
  bl: FiducialBoxCandidate,
  expectedRatio: number,
  expectedBoxToSpanX: number,
  imgWidth: number,
  imgHeight: number
): {
  valid: boolean;
  score: number;
  measuredRatio: number;
  ratioMatch: number;
  expectedBoxSizePx: number;
  measuredBoxSizePx: number;
  boxSizeMatch: number;
} {
  // Vector spans
  const topDx = tr.x - tl.x;
  const topDy = tr.y - tl.y;
  const botDx = br.x - bl.x;
  const botDy = br.y - bl.y;

  const leftDx = bl.x - tl.x;
  const leftDy = bl.y - tl.y;
  const rightDx = br.x - tr.x;
  const rightDy = br.y - tr.y;

  // Topological orientation: TR must be right of TL, BL below TL, BR below TR
  if (topDx <= 12 || botDx <= 12) return invalidEvalResult();
  if (leftDy <= 12 || rightDy <= 12) return invalidEvalResult();

  // Top angle check: top edge should be reasonably horizontal (within 35 deg for portrait)
  const topAngleDeg = Math.abs((Math.atan2(topDy, topDx) * 180) / Math.PI);
  if (topAngleDeg > 35) return invalidEvalResult();

  // Edge lengths
  const topLen = Math.hypot(topDx, topDy);
  const botLen = Math.hypot(botDx, botDy);
  const leftLen = Math.hypot(leftDx, leftDy);
  const rightLen = Math.hypot(rightDx, rightDy);

  // Minimum size: Sheet must occupy at least 15% of frame
  if (topLen < imgWidth * 0.15 || leftLen < imgHeight * 0.15) {
    return invalidEvalResult();
  }

  // Parallelism check: opposite sides shouldn't diverge drastically (allow realistic camera perspective)
  const widthRatioOpposite = Math.min(topLen, botLen) / Math.max(topLen, botLen);
  const heightRatioOpposite = Math.min(leftLen, rightLen) / Math.max(leftLen, rightLen);
  if (widthRatioOpposite < 0.62 || heightRatioOpposite < 0.62) {
    return invalidEvalResult();
  }

  // Measured average geometric dimensions
  const avgW = (topLen + botLen) / 2;
  const avgH = (leftLen + rightLen) / 2;
  const measuredRatio = avgW / avgH;

  // 1. Geometric Ratio Match against blueprint dimensions
  const ratioDiff = Math.abs(measuredRatio - expectedRatio);
  const ratioTolerance = 0.18; // Allow up to 18% variance for angled camera perspective
  if (ratioDiff > expectedRatio * ratioTolerance) {
    return invalidEvalResult();
  }

  const ratioMatch = Math.max(0, 1.0 - ratioDiff / (expectedRatio * ratioTolerance));

  // 2. Expected Box Size Match:
  // For measured fiducial span avgW, the physical box size (5.5mm) corresponds to:
  const expectedBoxSizePx = avgW * expectedBoxToSpanX;
  const measuredBoxSizePx = (tl.size + tr.size + br.size + bl.size) / 4;

  const boxSizeDiff = Math.abs(measuredBoxSizePx - expectedBoxSizePx);
  const boxSizeTolerance = expectedBoxSizePx * 0.55;
  const boxSizeMatch = Math.max(0, 1.0 - boxSizeDiff / Math.max(4, boxSizeTolerance));

  // 3. Mutual Box Size Consistency:
  // All 4 corner boxes on the same sheet must have similar pixel dimensions
  const maxCandSize = Math.max(tl.size, tr.size, br.size, bl.size);
  const minCandSize = Math.min(tl.size, tr.size, br.size, bl.size);
  const sizeConsistency = minCandSize / Math.max(1, maxCandSize);
  if (sizeConsistency < 0.45) {
    return invalidEvalResult();
  }

  // 4. Combined Confidence Score
  const avgBoxScore = (tl.score + tr.score + br.score + bl.score) / 4;
  const parallelismScore = (widthRatioOpposite + heightRatioOpposite) / 2;
  const coverageScore = Math.min(1.0, (avgW * avgH) / (imgWidth * imgHeight * 0.40));

  const totalScore =
    ratioMatch * 0.38 +
    boxSizeMatch * 0.22 +
    avgBoxScore * 0.20 +
    parallelismScore * 0.12 +
    sizeConsistency * 0.05 +
    coverageScore * 0.03;

  return {
    valid: true,
    score: totalScore,
    measuredRatio,
    ratioMatch,
    expectedBoxSizePx,
    measuredBoxSizePx,
    boxSizeMatch,
  };
}

function invalidEvalResult() {
  return {
    valid: false,
    score: 0,
    measuredRatio: 0,
    ratioMatch: 0,
    expectedBoxSizePx: 0,
    measuredBoxSizePx: 0,
    boxSizeMatch: 0,
  };
}

/**
 * Searches the image for 4 corner fiducials matching the expected geometric ratio
 * and physical box dimensions of the active OMR blueprint.
 */
export function autoDetectOmrFiducials(
  canvasOrImage: HTMLCanvasElement | HTMLImageElement | ImageData,
  layoutConfig?: OmrLayoutConfig
): DetectedOmrResult {
  const layout = layoutConfig || getOmrLayoutConfig(50);
  const expectedRatio = layout.fiducialSpanX_mm / layout.fiducialSpanY_mm;
  const expectedBoxToSpanX = OMR_GEOMETRY.fiducialSizeMm / layout.fiducialSpanX_mm;

  // 1. Prepare image on processing canvas (scaled to max 900px for sub-50ms execution)
  const srcW = 'naturalWidth' in canvasOrImage ? canvasOrImage.naturalWidth || canvasOrImage.width : canvasOrImage.width;
  const srcH = 'naturalHeight' in canvasOrImage ? canvasOrImage.naturalHeight || canvasOrImage.height : canvasOrImage.height;

  if (srcW <= 0 || srcH <= 0) {
    return fallbackDefaultResult(expectedRatio);
  }

  const targetMaxDim = 880;
  const scale = Math.min(1.0, targetMaxDim / Math.max(srcW, srcH));
  const workW = Math.max(100, Math.round(srcW * scale));
  const workH = Math.max(100, Math.round(srcH * scale));

  const procCanvas = document.createElement('canvas');
  procCanvas.width = workW;
  procCanvas.height = workH;
  const procCtx = procCanvas.getContext('2d');
  if (!procCtx) {
    return fallbackDefaultResult(expectedRatio);
  }

  procCtx.drawImage(canvasOrImage as any, 0, 0, workW, workH);
  const imgData = procCtx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  // 2. Grayscale conversion and paper background estimation
  const gray = new Uint8Array(workW * workH);
  let totalLuma = 0;
  for (let i = 0; i < workW * workH; i++) {
    const idx = i * 4;
    const g = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    gray[i] = g;
    totalLuma += g;
  }
  const avgLuma = totalLuma / (workW * workH);
  const paperLumaEstimate = Math.min(252, Math.max(155, avgLuma * 1.15));

  // 3. Integral image & candidate box extraction
  const integral = new IntegralImage(gray, workW, workH);
  const candidates = findFiducialCandidates(integral, workW, workH, paperLumaEstimate);

  if (candidates.length < 3) {
    return fallbackDefaultResult(expectedRatio);
  }

  // 4. Quad search: Find best 4 candidates matching expected geometrical ratio and box size
  let bestQuad: {
    tl: FiducialBoxCandidate;
    tr: FiducialBoxCandidate;
    br: FiducialBoxCandidate;
    bl: FiducialBoxCandidate;
    score: number;
    measuredRatio: number;
    ratioMatch: number;
    expectedBoxSizePx: number;
    measuredBoxSizePx: number;
    boxSizeMatch: number;
    rotation?: number;
  } | null = null;

  // Search 4-candidate combinations
  for (let i = 0; i < candidates.length; i++) {
    const tl = candidates[i];
    for (let j = 0; j < candidates.length; j++) {
      if (j === i) continue;
      const tr = candidates[j];
      if (tr.x <= tl.x + 18) continue; // TR must be to the right of TL

      for (let k = 0; k < candidates.length; k++) {
        if (k === i || k === j) continue;
        const br = candidates[k];
        if (br.y <= tr.y + 18 || br.x <= tl.x + 18) continue; // BR must be below TR and right of TL

        for (let l = 0; l < candidates.length; l++) {
          if (l === i || l === j || l === k) continue;
          const bl = candidates[l];
          if (bl.y <= tl.y + 18 || br.x <= bl.x + 18) continue; // BL must be below TL and left of BR

          const evalRes = evaluateQuadRatioAndDimensions(
            tl,
            tr,
            br,
            bl,
            expectedRatio,
            expectedBoxToSpanX,
            workW,
            workH
          );

          if (evalRes.valid && (!bestQuad || evalRes.score > bestQuad.score)) {
            bestQuad = {
              tl,
              tr,
              br,
              bl,
              score: evalRes.score,
              measuredRatio: evalRes.measuredRatio,
              ratioMatch: evalRes.ratioMatch,
              expectedBoxSizePx: evalRes.expectedBoxSizePx / scale,
              measuredBoxSizePx: evalRes.measuredBoxSizePx / scale,
              boxSizeMatch: evalRes.boxSizeMatch,
              rotation: 0,
            };
          }
        }
      }
    }
  }

  // 5. 3-Candidate Recovery: If only 3 boxes found with strong ratio match, extrapolate 4th box
  if (!bestQuad || bestQuad.score < 0.42) {
    const recoveredQuad = attemptThreeCandidateRecovery(
      candidates,
      expectedRatio,
      expectedBoxToSpanX,
      workW,
      workH,
      integral,
      paperLumaEstimate
    );
    if (recoveredQuad && (!bestQuad || recoveredQuad.score > bestQuad.score)) {
      bestQuad = {
        ...recoveredQuad,
        expectedBoxSizePx: recoveredQuad.expectedBoxSizePx / scale,
        measuredBoxSizePx: recoveredQuad.measuredBoxSizePx / scale,
      };
    }
  }

  if (!bestQuad || bestQuad.score < 0.35) {
    return fallbackDefaultResult(expectedRatio);
  }

  // 6. Convert coordinates back to original image percentage space [0..100]
  const tlPercent = { x: (bestQuad.tl.x / workW) * 100, y: (bestQuad.tl.y / workH) * 100 };
  const trPercent = { x: (bestQuad.tr.x / workW) * 100, y: (bestQuad.tr.y / workH) * 100 };
  const brPercent = { x: (bestQuad.br.x / workW) * 100, y: (bestQuad.br.y / workH) * 100 };
  const blPercent = { x: (bestQuad.bl.x / workW) * 100, y: (bestQuad.bl.y / workH) * 100 };

  // 7. Extrapolate from the 4 Fiducial centers to the actual outer page edges
  // Margins in Blueprint:
  // Left/Right margin = 10mm out of 190mm span = 5.263%
  // Top margin = 10mm out of fiducialSpanY_mm
  // Bottom margin = (pageHeightMm - bottomFiducialY_mm) out of fiducialSpanY_mm
  const marginRatioX = 10 / layout.fiducialSpanX_mm;
  const marginRatioTop = 10 / layout.fiducialSpanY_mm;
  const marginRatioBottom = (layout.pageHeightMm - layout.bottomFiducialY_mm) / layout.fiducialSpanY_mm;

  const topVecX = trPercent.x - tlPercent.x;
  const topVecY = trPercent.y - tlPercent.y;
  const botVecX = brPercent.x - blPercent.x;
  const botVecY = brPercent.y - blPercent.y;

  const leftVecX = blPercent.x - tlPercent.x;
  const leftVecY = blPercent.y - tlPercent.y;
  const rightVecX = brPercent.x - trPercent.x;
  const rightVecY = brPercent.y - trPercent.y;

  // Outer Page Corners:
  const outerTL = {
    x: Math.max(0, Math.min(100, tlPercent.x - marginRatioX * topVecX - marginRatioTop * leftVecX)),
    y: Math.max(0, Math.min(100, tlPercent.y - marginRatioX * topVecY - marginRatioTop * leftVecY)),
  };
  const outerTR = {
    x: Math.max(0, Math.min(100, trPercent.x + marginRatioX * topVecX - marginRatioTop * rightVecX)),
    y: Math.max(0, Math.min(100, trPercent.y + marginRatioX * topVecY - marginRatioTop * rightVecY)),
  };
  const outerBR = {
    x: Math.max(0, Math.min(100, brPercent.x + marginRatioX * botVecX + marginRatioBottom * rightVecX)),
    y: Math.max(0, Math.min(100, brPercent.y + marginRatioX * botVecY + marginRatioBottom * rightVecY)),
  };
  const outerBL = {
    x: Math.max(0, Math.min(100, blPercent.x - marginRatioX * botVecX + marginRatioBottom * leftVecX)),
    y: Math.max(0, Math.min(100, blPercent.y - marginRatioX * botVecY + marginRatioBottom * leftVecY)),
  };

  return {
    detected: true,
    confidence: Number(bestQuad.score.toFixed(3)),
    fiducials: {
      tl: roundPt(tlPercent),
      tr: roundPt(trPercent),
      br: roundPt(brPercent),
      bl: roundPt(blPercent),
    },
    outerCorners: {
      tl: roundPt(outerTL),
      tr: roundPt(outerTR),
      br: roundPt(outerBR),
      bl: roundPt(outerBL),
    },
    expectedRatio: Number(expectedRatio.toFixed(3)),
    measuredRatio: Number(bestQuad.measuredRatio.toFixed(3)),
    ratioMatchPercentage: Math.round(bestQuad.ratioMatch * 100),
    expectedBoxSizePx: Number(bestQuad.expectedBoxSizePx.toFixed(1)),
    measuredBoxSizePx: Number(bestQuad.measuredBoxSizePx.toFixed(1)),
    boxSizeMatchPercentage: Math.round(bestQuad.boxSizeMatch * 100),
    suggestedRotation: bestQuad.rotation || 0,
  };
}

/**
 * Recovers 4th box position if 3 valid corner boxes were identified
 * and the 4th box can be predicted via parallelogram geometry.
 */
function attemptThreeCandidateRecovery(
  candidates: FiducialBoxCandidate[],
  expectedRatio: number,
  expectedBoxToSpanX: number,
  imgWidth: number,
  imgHeight: number,
  integral: IntegralImage,
  paperBaseline: number
): {
  tl: FiducialBoxCandidate;
  tr: FiducialBoxCandidate;
  br: FiducialBoxCandidate;
  bl: FiducialBoxCandidate;
  score: number;
  measuredRatio: number;
  ratioMatch: number;
  expectedBoxSizePx: number;
  measuredBoxSizePx: number;
  boxSizeMatch: number;
} | null {
  if (candidates.length < 3) return null;

  for (let i = 0; i < candidates.length; i++) {
    const c1 = candidates[i];
    for (let j = 0; j < candidates.length; j++) {
      if (j === i) continue;
      const c2 = candidates[j];
      for (let k = 0; k < candidates.length; k++) {
        if (k === i || k === j) continue;
        const c3 = candidates[k];

        // Scenario 1: c1=TL, c2=TR, c3=BL => predict c4=BR
        if (c2.x > c1.x + 18 && c3.y > c1.y + 18 && Math.abs(c3.x - c1.x) < imgWidth * 0.15) {
          const predX = Math.round(c2.x + c3.x - c1.x);
          const predY = Math.round(c2.y + c3.y - c1.y);
          if (predX > 0 && predX < imgWidth && predY > 0 && predY < imgHeight) {
            const predBoxSize = Math.round((c1.size + c2.size + c3.size) / 3);
            const half = Math.round(predBoxSize / 2);
            const mean = integral.getRectMean(predX - half, predY - half, predX + half, predY + half);
            // Confirm there is contrast at predicted position
            if (mean < paperBaseline - 10) {
              const c4: FiducialBoxCandidate = {
                x: predX,
                y: predY,
                size: predBoxSize,
                score: 0.5,
                darkness: mean,
                isHollow: true,
              };
              const evalRes = evaluateQuadRatioAndDimensions(c1, c2, c4, c3, expectedRatio, expectedBoxToSpanX, imgWidth, imgHeight);
              if (evalRes.valid && evalRes.score > 0.40) {
                return {
                  tl: c1,
                  tr: c2,
                  br: c4,
                  bl: c3,
                  score: evalRes.score * 0.90, // slight penalty for extrapolation
                  measuredRatio: evalRes.measuredRatio,
                  ratioMatch: evalRes.ratioMatch,
                  expectedBoxSizePx: evalRes.expectedBoxSizePx,
                  measuredBoxSizePx: evalRes.measuredBoxSizePx,
                  boxSizeMatch: evalRes.boxSizeMatch,
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * High-Precision Perspective Calibration & Rectification
 * 
 * Maps the 4 detected corner fiducials directly into the exact canonical blueprint coordinates
 * with zero margin skew, creating a pixel-perfect, ready-to-scan rectified OMR sheet.
 */
export function calibrateAndRectifyOmrImage(
  source: HTMLCanvasElement | HTMLImageElement,
  result: DetectedOmrResult,
  layout: OmrLayoutConfig
): string | null {
  if (!result.detected) return null;

  const srcW = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const srcH = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height;
  if (srcW <= 0 || srcH <= 0) return null;

  // Destination canonical A4/compact resolution:
  // 1260px width matches standard 6px/mm for 210mm A4 sheet
  const dstWidth = 1260;
  const dstHeight = Math.max(600, Math.round(dstWidth * (layout.pageHeightMm / layout.pageWidthMm)));

  // Destination fiducial centers in pixels on canonical canvas:
  const dstTL: QuadPoint = {
    x: (10 / layout.pageWidthMm) * dstWidth,
    y: (10 / layout.pageHeightMm) * dstHeight,
  };
  const dstTR: QuadPoint = {
    x: (200 / layout.pageWidthMm) * dstWidth,
    y: (10 / layout.pageHeightMm) * dstHeight,
  };
  const dstBR: QuadPoint = {
    x: (200 / layout.pageWidthMm) * dstWidth,
    y: (layout.bottomFiducialY_mm / layout.pageHeightMm) * dstHeight,
  };
  const dstBL: QuadPoint = {
    x: (10 / layout.pageWidthMm) * dstWidth,
    y: (layout.bottomFiducialY_mm / layout.pageHeightMm) * dstHeight,
  };

  // Source fiducial centers in image pixels:
  const srcTL: QuadPoint = {
    x: (result.fiducials.tl.x / 100) * srcW,
    y: (result.fiducials.tl.y / 100) * srcH,
  };
  const srcTR: QuadPoint = {
    x: (result.fiducials.tr.x / 100) * srcW,
    y: (result.fiducials.tr.y / 100) * srcH,
  };
  const srcBR: QuadPoint = {
    x: (result.fiducials.br.x / 100) * srcW,
    y: (result.fiducials.br.y / 100) * srcH,
  };
  const srcBL: QuadPoint = {
    x: (result.fiducials.bl.x / 100) * srcW,
    y: (result.fiducials.bl.y / 100) * srcH,
  };

  const rectifiedCanvas = warpPerspectiveCanvas(
    source,
    [srcTL, srcTR, srcBR, srcBL],
    dstWidth,
    dstHeight,
    [dstTL, dstTR, dstBR, dstBL]
  );

  if (rectifiedCanvas) {
    return rectifiedCanvas.toDataURL('image/png', 1.0);
  }
  return null;
}

function roundPt(p: QuadPoint): QuadPoint {
  return {
    x: Number(p.x.toFixed(2)),
    y: Number(p.y.toFixed(2)),
  };
}

function fallbackDefaultResult(expectedRatio: number): DetectedOmrResult {
  return {
    detected: false,
    confidence: 0,
    fiducials: {
      tl: { x: 10, y: 8 },
      tr: { x: 90, y: 8 },
      br: { x: 90, y: 92 },
      bl: { x: 10, y: 92 },
    },
    outerCorners: {
      tl: { x: 5, y: 4 },
      tr: { x: 95, y: 4 },
      br: { x: 95, y: 96 },
      bl: { x: 5, y: 96 },
    },
    expectedRatio: Number(expectedRatio.toFixed(3)),
    measuredRatio: 0,
    ratioMatchPercentage: 0,
    expectedBoxSizePx: 0,
    measuredBoxSizePx: 0,
    boxSizeMatchPercentage: 0,
  };
}

