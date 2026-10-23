import { OMR_GEOMETRY, generateOmrSheetBlueprint, OmrSheetBlueprint } from './omrGeometry';

const MM_TO_PX_BASE = 3.779527559; // 96 DPI CSS pixels per millimeter

/**
 * Directly renders an OMR Sheet Blueprint to a high-resolution HTML5 Canvas
 * in less than 5 milliseconds. Eliminates DOM capture timeouts, font race conditions,
 * and ensures 100% mathematical vector alignment.
 */
export function renderOmrSheetToCanvas(
  totalQuestions: number,
  examTitle = '',
  scale = 3,
  sheetFormat: 'a4' | 'compact' = 'a4'
): HTMLCanvasElement {
  const safeQs = Math.max(1, totalQuestions || 50);
  const blueprint: OmrSheetBlueprint = generateOmrSheetBlueprint(safeQs, undefined, sheetFormat);
  const { layout, fiducials, columnConfig, bubbleRecords } = blueprint;

  const pxPerMm = MM_TO_PX_BASE * scale;
  const canvasWidth = Math.round(layout.pageWidthMm * pxPerMm);
  const canvasHeight = Math.round(layout.pageHeightMm * pxPerMm);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not obtain 2D canvas context');
  }

  // 1. Fill crisp pure white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Perimeter cut-style dashed boundary line
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, 1.2 * (scale / 2));
  ctx.setLineDash([4 * scale, 3 * scale]);
  ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
  ctx.setLineDash([]); // Reset dash pattern for subsequent solid lines

  // 3. Draw 4 Corner Registration Fiducials (square outline boxes)
  const fiducialSizePx = OMR_GEOMETRY.fiducialSizeMm * pxPerMm;
  const fiducialStrokePx = Math.max(1.4, 0.45 * pxPerMm);
  const fiducialsList = [
    fiducials.topLeft,
    fiducials.topRight,
    fiducials.bottomLeft,
    fiducials.bottomRight,
  ];
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = fiducialStrokePx;
  for (const f of fiducialsList) {
    const fx = (f.x - OMR_GEOMETRY.fiducialSizeMm / 2) * pxPerMm;
    const fy = (f.y - OMR_GEOMETRY.fiducialSizeMm / 2) * pxPerMm;
    ctx.strokeRect(fx, fy, fiducialSizePx, fiducialSizePx);
  }

  const paddingLeftPx = OMR_GEOMETRY.pagePaddingLeftMm * pxPerMm;
  const usableWidthPx = OMR_GEOMETRY.usableWidthMm * pxPerMm;
  const paddingTopPx = OMR_GEOMETRY.pagePaddingTopMm * pxPerMm;

  // 4. Header Title Block
  const headerHeightPx = OMR_GEOMETRY.headerHeightMm * pxPerMm;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title: "OMR RESPONSE ANSWER SHEET" (11.5pt semi-bold)
  const titleFontSize = Math.round(11.5 * (4 / 3) * scale);
  ctx.font = `600 ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('OMR RESPONSE ANSWER SHEET', paddingLeftPx + usableWidthPx / 2, paddingTopPx + headerHeightPx * 0.32);

  // Subtitle: Exam Title / Chapter Name (8.5pt)
  const subFontSize = Math.round(8.5 * (4 / 3) * scale);
  ctx.font = `700 ${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

  const isUniversalMaster = !examTitle || 
    examTitle.toUpperCase().includes('UNIVERSAL') || 
    examTitle.trim() === '' || 
    examTitle.includes('_____') || 
    examTitle.includes('-----');

  if (isUniversalMaster) {
    ctx.textAlign = 'left';
    const label = 'Test Name / Subject:';
    const labelX = paddingLeftPx + 6 * pxPerMm;
    const labelY = paddingTopPx + headerHeightPx * 0.78;
    ctx.fillText(label, labelX, labelY);
    const labelWidth = ctx.measureText(label).width;
    
    // Position the dashed line lower with generous writing space across the width
    const dashLineY = paddingTopPx + headerHeightPx * 0.88;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, 0.45 * pxPerMm);
    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.moveTo(labelX + labelWidth + 4 * pxPerMm, dashLineY);
    ctx.lineTo(paddingLeftPx + usableWidthPx - 6 * pxPerMm, dashLineY);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.textAlign = 'center';
    const displayTitle = examTitle.toUpperCase();
    ctx.fillText(displayTitle, paddingLeftPx + usableWidthPx / 2, paddingTopPx + headerHeightPx * 0.78);
  }

  // Header bottom border (0.55mm thick)
  ctx.beginPath();
  ctx.lineWidth = Math.max(1.5, 0.55 * pxPerMm);
  ctx.moveTo(paddingLeftPx, paddingTopPx + headerHeightPx);
  ctx.lineTo(paddingLeftPx + usableWidthPx, paddingTopPx + headerHeightPx);
  ctx.stroke();

  // 5. Candidate Info Box (8pt)
  const candTopPx = (OMR_GEOMETRY.pagePaddingTopMm + OMR_GEOMETRY.headerHeightMm + OMR_GEOMETRY.headerMarginBottomMm) * pxPerMm;
  const candHeightPx = OMR_GEOMETRY.candidateBoxHeightMm * pxPerMm;

  const infoFontSize = Math.round(8.0 * (4 / 3) * scale);
  ctx.font = `600 ${infoFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Candidate Name: ____________________________________', paddingLeftPx + 2.5 * pxPerMm, candTopPx + candHeightPx * 0.5);
  ctx.fillText('Roll No: ____________________________________', paddingLeftPx + usableWidthPx / 2 + 4.0 * pxPerMm, candTopPx + candHeightPx * 0.5);

  // Candidate box bottom border (0.35mm thick)
  ctx.beginPath();
  ctx.lineWidth = Math.max(1, 0.35 * pxPerMm);
  ctx.moveTo(paddingLeftPx, candTopPx + candHeightPx);
  ctx.lineTo(paddingLeftPx + usableWidthPx, candTopPx + candHeightPx);
  ctx.stroke();

  // 6. Instructions Box (7.2pt)
  const instTopPx = (OMR_GEOMETRY.pagePaddingTopMm + OMR_GEOMETRY.headerHeightMm + OMR_GEOMETRY.headerMarginBottomMm + OMR_GEOMETRY.candidateBoxHeightMm + OMR_GEOMETRY.candidateMarginBottomMm) * pxPerMm;
  const instHeightPx = OMR_GEOMETRY.instructionsHeightMm * pxPerMm;

  const instFontSize = Math.round(7.2 * (4 / 3) * scale);
  ctx.font = `500 ${instFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('INSTRUCTIONS: Completely darken only one bubble per question with a black/blue ballpoint pen.', paddingLeftPx + 2.5 * pxPerMm, instTopPx + instHeightPx * 0.5);

  ctx.textAlign = 'right';
  ctx.font = `600 ${instFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('Correct: ●   Incorrect: ○  ✓  ✗', paddingLeftPx + usableWidthPx - 2.5 * pxPerMm, instTopPx + instHeightPx * 0.5);

  // Instructions bottom border (0.35mm thick)
  ctx.beginPath();
  ctx.lineWidth = Math.max(1, 0.35 * pxPerMm);
  ctx.moveTo(paddingLeftPx, instTopPx + instHeightPx);
  ctx.lineTo(paddingLeftPx + usableWidthPx, instTopPx + instHeightPx);
  ctx.stroke();

  // 7. Column Headers ("Q.", "A", "B", "C", "D" - 7.5pt)
  const columnCount = layout.columnCount;
  const questionsPerCol = layout.questionsPerColumn;
  const headerTopMm = OMR_GEOMETRY.row0TopMm - OMR_GEOMETRY.columnHeaderMarginBottomMm - OMR_GEOMETRY.columnHeaderHeightMm;
  const headerTopPx = headerTopMm * pxPerMm;
  const colHeaderHeightPx = OMR_GEOMETRY.columnHeaderHeightMm * pxPerMm;
  const options = ['A', 'B', 'C', 'D'];

  const colLabelSize = Math.round(7.5 * (4 / 3) * scale);
  for (let colIdx = 0; colIdx < columnCount; colIdx++) {
    const colLeftMm = OMR_GEOMETRY.pagePaddingLeftMm + columnConfig.gridMarginXMm + colIdx * (columnConfig.columnWidthMm + columnConfig.columnGapMm);
    const colLeftPx = colLeftMm * pxPerMm;
    const colWidthPx = columnConfig.columnWidthMm * pxPerMm;

    // "Q." Label
    ctx.font = `700 ${colLabelSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Q.', (colLeftMm + columnConfig.qNumWidthMm - 0.8) * pxPerMm, headerTopPx + colHeaderHeightPx * 0.5);

    // Options "A", "B", "C", "D"
    ctx.font = `700 ${colLabelSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const optCenterMm = colLeftMm + columnConfig.optionOffsetsMm[optIdx];
      ctx.fillText(options[optIdx], optCenterMm * pxPerMm, headerTopPx + colHeaderHeightPx * 0.5);
    }

    // Column header bottom line
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, 0.35 * pxPerMm);
    ctx.moveTo(colLeftPx, headerTopPx + colHeaderHeightPx);
    ctx.lineTo(colLeftPx + colWidthPx, headerTopPx + colHeaderHeightPx);
    ctx.stroke();
  }

  // 8. Question Numbers (1..totalQuestions - 7.5pt)
  const qNumSize = Math.round(7.5 * (4 / 3) * scale);
  ctx.font = `700 ${qNumSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let qIdx = 0; qIdx < safeQs; qIdx++) {
    const colIdx = Math.min(columnCount - 1, Math.floor(qIdx / questionsPerCol));
    const rowIdx = qIdx % questionsPerCol;
    const colLeftMm = OMR_GEOMETRY.pagePaddingLeftMm + columnConfig.gridMarginXMm + colIdx * (columnConfig.columnWidthMm + columnConfig.columnGapMm);
    const rowCenterYMm = layout.row0CenterMm + rowIdx * OMR_GEOMETRY.rowHeightMm;

    ctx.fillText(
      `${qIdx + 1}`,
      (colLeftMm + columnConfig.qNumWidthMm - 0.8) * pxPerMm,
      rowCenterYMm * pxPerMm
    );
  }

  // 10. Blank Bubble Circles
  const bubbleRadiusPx = OMR_GEOMETRY.bubbleRadiusMm * pxPerMm;
  ctx.lineWidth = Math.max(1.2, 0.38 * pxPerMm);
  ctx.strokeStyle = '#000000';

  for (const bubble of bubbleRecords) {
    const bx = bubble.physXMm * pxPerMm;
    const by = bubble.physYMm * pxPerMm;

    ctx.beginPath();
    ctx.arc(bx, by, bubbleRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  }

  return canvas;
}

/**
 * Direct export of OMR sheet to PNG or JPEG data URL without DOM capturing
 */
export function renderOmrSheetToDataUrl(
  totalQuestions: number,
  examTitle = '',
  format: 'png' | 'jpeg' = 'png',
  scale = 3,
  sheetFormat: 'a4' | 'compact' = 'a4'
): string {
  const canvas = renderOmrSheetToCanvas(totalQuestions, examTitle, scale, sheetFormat);
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return canvas.toDataURL(mime, 0.98);
}
