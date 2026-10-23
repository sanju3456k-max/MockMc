/**
 * Perspective Warping & Homography Transformation Utility
 * 
 * Provides true 4-point perspective rectification for tilted, rotated,
 * or angled camera captures of OMR sheets. Maps the 4 user-dragged corner
 * fiducial boxes to the canonical rectangular OMR blueprint coordinates.
 */

export interface QuadPoint {
  x: number;
  y: number;
}

/**
 * Solve an 8x8 linear equation system A * x = b using Gaussian elimination with partial pivoting.
 */
function solve8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      const val = Math.abs(M[k][i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      return null; // Singular matrix
    }

    // Swap rows
    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }

    // Eliminate column below
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  // Back substitution
  const result = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * result[j];
    }
    result[i] = sum / M[i][i];
  }

  return result;
}

/**
 * Computes the 3x3 homography matrix mapping destination coordinates (u, v) 
 * to source coordinates (x, y).
 */
export function computeBackwardHomography(
  srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint], // TL, TR, BR, BL
  dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint]  // TL, TR, BR, BL
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dstQuad[i].x;
    const v = dstQuad[i].y;
    const x = srcQuad[i].x;
    const y = srcQuad[i].y;

    // Row 2*i: u*h00 + v*h01 + h02 - u*x*h20 - v*x*h21 = x
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);

    // Row 2*i + 1: u*h10 + v*h11 + h12 - u*y*h20 - v*y*h21 = y
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const sol = solve8x8(A, b);
  if (!sol) return null;

  // [h00, h01, h02, h10, h11, h12, h20, h21, 1.0]
  return [...sol, 1.0];
}

/**
 * Perform perspective warp from source image/canvas to a rectified output canvas.
 */
export function warpPerspectiveCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint],
  dstWidth: number,
  dstHeight: number,
  dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint]
): HTMLCanvasElement | null {
  // Obtain source image data
  const srcW = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const srcH = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height;

  if (srcW <= 0 || srcH <= 0 || dstWidth <= 0 || dstHeight <= 0) return null;

  let srcCanvas: HTMLCanvasElement;
  let srcCtx: CanvasRenderingContext2D | null;

  if (source instanceof HTMLCanvasElement) {
    srcCanvas = source;
    srcCtx = srcCanvas.getContext('2d');
  } else {
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return null;
    srcCtx.drawImage(source, 0, 0);
  }

  if (!srcCtx) return null;
  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImgData.data;

  // Compute Homography H (dst -> src)
  const H = computeBackwardHomography(srcQuad, dstQuad);
  if (!H) return null;

  const [h00, h01, h02, h10, h11, h12, h20, h21] = H;

  // Prepare destination canvas and buffer
  const outCanvas = document.createElement('canvas');
  outCanvas.width = dstWidth;
  outCanvas.height = dstHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return null;

  const outImgData = outCtx.createImageData(dstWidth, dstHeight);
  const outData = outImgData.data;

  const maxSrcX = srcW - 1;
  const maxSrcY = srcH - 1;

  // Warp pixel by pixel with bilinear interpolation
  for (let v = 0; v < dstHeight; v++) {
    let xNum = h01 * v + h02;
    let yNum = h11 * v + h12;
    let denom = h21 * v + 1;

    let outIdx = v * dstWidth * 4;

    for (let u = 0; u < dstWidth; u++) {
      const invW = 1 / denom;
      const xs = xNum * invW;
      const ys = yNum * invW;

      xNum += h00;
      yNum += h10;
      denom += h20;

      if (xs >= 0 && xs <= maxSrcX && ys >= 0 && ys <= maxSrcY) {
        const x0 = Math.floor(xs);
        const y0 = Math.floor(ys);
        const x1 = Math.min(maxSrcX, x0 + 1);
        const y1 = Math.min(maxSrcY, y0 + 1);

        const fx = xs - x0;
        const fy = ys - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        outData[outIdx] = Math.round(
          w00 * srcData[idx00] + w10 * srcData[idx10] + w01 * srcData[idx01] + w11 * srcData[idx11]
        );
        outData[outIdx + 1] = Math.round(
          w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]
        );
        outData[outIdx + 2] = Math.round(
          w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]
        );
        outData[outIdx + 3] = 255;
      } else {
        // Outside sheet boundary: fill white
        outData[outIdx] = 255;
        outData[outIdx + 1] = 255;
        outData[outIdx + 2] = 255;
        outData[outIdx + 3] = 255;
      }

      outIdx += 4;
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}
