/**
 * Unified OMR Geometry and Coordinate System
 * Standard A4 Sheet: 210mm x 297mm
 * 
 * Shared between the Sheet Generator (OmrSheetGenerator) and 
 * the Optical Scanner Engine (omrScannerEngine) to guarantee 
 * 100% pixel-perfect coordinate alignment and zero bubble misplacement.
 */

export interface OmrPoint {
  x: number;
  y: number;
}

export interface OmrCorners {
  topLeft: OmrPoint;
  topRight: OmrPoint;
  bottomLeft: OmrPoint;
  bottomRight: OmrPoint;
}

export interface OmrLayoutConfig {
  totalQuestions: number;
  columnCount: number;
  questionsPerColumn: number;
  pageWidthMm: number;
  pageHeightMm: number;
  bottomFiducialY_mm: number;
  fiducialSpanX_mm: number;
  fiducialSpanY_mm: number;
  gridBottomMm: number;
  row0TopMm: number;
  row0CenterMm: number;
  isFullA4: boolean;
  sheetFormat: 'a4' | 'compact';
}

export const ISO_A4_STANDARDS = {
  name: 'ISO 216 A4',
  widthMm: 210,
  heightMm: 297,
  aspectRatio: 210 / 297, // ~0.70707
  inverseAspectRatio: 297 / 210, // ~1.41421
  widthInches: 8.27,
  heightInches: 11.69,
  fiducialTopY: 10,
  fiducialBottomY: 287,
  fiducialLeftX: 10,
  fiducialRightX: 200,
  fiducialSpanX: 190,
  fiducialSpanY: 277,
};

export const OMR_GEOMETRY = {
  // Physical width in mm (standard width 210mm)
  pageWidthMm: 210,
  // Standard full A4 height for multi-page documents or fallback
  maxPageHeightMm: 297,

  // 4 Corner Registration Fiducials (5.5mm x 5.5mm hollow squares at corner margin)
  fiducialMarginMm: 7.25,
  fiducialSizeMm: 5.5,
  
  // Top Fiducial Centers: 7.25 + 5.5/2 = 10mm
  fiducialTopLeft: { x: 10, y: 10 },
  fiducialTopRight: { x: 200, y: 10 },
  fiducialSpanX_mm: 190, // 200 - 10

  // Margins and paddings
  pagePaddingTopMm: 6.0,
  pagePaddingLeftMm: 12.0,
  pagePaddingRightMm: 12.0,
  pagePaddingBottomMm: 6.0,
  usableWidthMm: 186.0, // 210 - 24

  // Explicit vertical header blocks (in mm)
  headerHeightMm: 11.0,
  headerMarginBottomMm: 2.0,
  candidateBoxHeightMm: 7.5,
  candidateMarginBottomMm: 2.0,
  instructionsHeightMm: 6.0,
  instructionsMarginBottomMm: 2.0,
  columnHeaderHeightMm: 5.0,
  columnHeaderMarginBottomMm: 1.5,

  // Total height from top of page to Row 0 top:
  // 6.0 (pad) + 11.0 + 2.0 + 7.5 + 2.0 + 6.0 + 2.0 + 5.0 + 1.5 = 43.0mm
  row0TopMm: 43.0,
  rowHeightMm: 5.8,
  // Row 0 Center Y = 43.0 + 5.8 / 2 = 45.9mm (exact vertical center of Row 0)
  row0CenterMm: 45.9,

  // Spacing between bottom of active question bubble rows and top of bottom fiducial markers
  gapBelowGridToFiducialMm: 4.5,

  // Bubble circle metrics
  bubbleDiameterMm: 4.0,
  bubbleRadiusMm: 2.0,

  // 5-Column Grid Configuration (Fits up to 50 questions with high density):
  fiveColumns: {
    columnCount: 5,
    gridMarginXMm: 1.0,
    columnGapMm: 3.5,
    columnWidthMm: 34.0, // (186 - 2.0 - 4 * 3.5) / 5 = 34.0mm
    qNumWidthMm: 5.0,
    gapToFirstBubbleMm: 1.0,
    bubblePitchMm: 5.6,
    // Exact mathematical centers of A, B, C, D from column left edge in mm:
    // A: 5.0 + 1.0 + 2.0 = 8.0mm
    // B: 8.0 + 5.6 = 13.6mm
    // C: 13.6 + 5.6 = 19.2mm
    // D: 19.2 + 5.6 = 24.8mm
    optionOffsetsMm: [8.0, 13.6, 19.2, 24.8],
  },

  // 4-Column Grid Configuration:
  fourColumns: {
    columnCount: 4,
    gridMarginXMm: 1.0,
    columnGapMm: 4.5,
    columnWidthMm: 42.625, // (186 - 2.0 - 3 * 4.5) / 4 = 42.625mm
    qNumWidthMm: 6.0,
    gapToFirstBubbleMm: 1.5,
    bubblePitchMm: 6.6,
    // Exact mathematical centers of A, B, C, D from column left edge in mm:
    // A: 6.0 + 1.5 + 2.0 = 9.5mm
    // B: 9.5 + 6.6 = 16.1mm
    // C: 16.1 + 6.6 = 22.7mm
    // D: 22.7 + 6.6 = 29.3mm
    optionOffsetsMm: [9.5, 16.1, 22.7, 29.3],
  },
};

/**
 * Get layout configuration for a given question count.
 * Defaults to Full ISO A4 Sheet (210mm x 297mm) with corner fiducials anchored at 10mm margins,
 * with optional support for compact slips.
 */
export function getOmrLayoutConfig(
  totalQuestions: number,
  forcedColumnCount?: number,
  sheetFormat: 'a4' | 'compact' = 'a4'
): OmrLayoutConfig {
  const total = Math.max(1, totalQuestions);
  // Default view is always 5 columns
  const columnCount = forcedColumnCount || 5;
  const questionsPerColumn = Math.max(1, Math.ceil(total / columnCount));
  
  // Height from top to the bottom edge of the last question row
  const gridBottomMm = OMR_GEOMETRY.row0TopMm + questionsPerColumn * OMR_GEOMETRY.rowHeightMm;

  // Dynamic variable height based on question count, matching standard A4 width (210mm)
  const bottomFiducialTopMm = gridBottomMm + OMR_GEOMETRY.gapBelowGridToFiducialMm;
  const bottomFiducialY_mm = bottomFiducialTopMm + OMR_GEOMETRY.fiducialSizeMm / 2; // Center Y

  const calculatedPageHeightMm = bottomFiducialTopMm + OMR_GEOMETRY.fiducialSizeMm + OMR_GEOMETRY.fiducialMarginMm;
  const pageHeightMm = Math.max(85, Math.min(OMR_GEOMETRY.maxPageHeightMm, calculatedPageHeightMm));

  const adjustedBottomFiducialY_mm = calculatedPageHeightMm < 85
    ? (pageHeightMm - OMR_GEOMETRY.fiducialMarginMm - OMR_GEOMETRY.fiducialSizeMm / 2)
    : bottomFiducialY_mm;

  const fiducialSpanX_mm = OMR_GEOMETRY.fiducialSpanX_mm;
  const fiducialSpanY_mm = adjustedBottomFiducialY_mm - OMR_GEOMETRY.fiducialTopLeft.y;

  return {
    totalQuestions: total,
    columnCount,
    questionsPerColumn,
    pageWidthMm: OMR_GEOMETRY.pageWidthMm, // Always standard A4 width (210mm)
    pageHeightMm,
    bottomFiducialY_mm: adjustedBottomFiducialY_mm,
    fiducialSpanX_mm,
    fiducialSpanY_mm,
    gridBottomMm,
    row0TopMm: OMR_GEOMETRY.row0TopMm,
    row0CenterMm: OMR_GEOMETRY.row0CenterMm,
    isFullA4: false, // Variable height, no signatures or rough work boxes
    sheetFormat,
  };
}

/**
 * Get exact normalized coordinates [0..1, 0..1] relative to the 4 fiducials
 * for a specific question and option index (0 = A, 1 = B, 2 = C, 3 = D)
 */
export function getBubbleNormalizedCoordinates(
  questionIndex: number, // 0-based question index (0 to totalQuestions - 1)
  optionIndex: number,   // 0 to 3
  layout: OmrLayoutConfig
): { normX: number; normY: number; colIndex: number; rowIndex: number; physXMm: number; physYMm: number } {
  const colIndex = Math.min(
    layout.columnCount - 1,
    Math.floor(questionIndex / layout.questionsPerColumn)
  );
  const rowIndex = questionIndex % layout.questionsPerColumn;

  const colConfig = layout.columnCount === 4 ? OMR_GEOMETRY.fourColumns : OMR_GEOMETRY.fiveColumns;

  // Column left edge in mm from page left
  const colLeftMm =
    OMR_GEOMETRY.pagePaddingLeftMm +
    colConfig.gridMarginXMm +
    colIndex * (colConfig.columnWidthMm + colConfig.columnGapMm);

  // Bubble physical center X in mm
  const physXMm = colLeftMm + colConfig.optionOffsetsMm[optionIndex];

  // Bubble physical center Y in mm
  const physYMm = layout.row0CenterMm + rowIndex * OMR_GEOMETRY.rowHeightMm;

  // Normalized to fiducial centers:
  // normX = 0 at left fiducials (x = 10mm), 1 at right fiducials (x = 200mm)
  // normY = 0 at top fiducials (y = 10mm), 1 at bottom fiducials (y = layout.bottomFiducialY_mm)
  const normX = (physXMm - OMR_GEOMETRY.fiducialTopLeft.x) / layout.fiducialSpanX_mm;
  const normY = (physYMm - OMR_GEOMETRY.fiducialTopLeft.y) / layout.fiducialSpanY_mm;

  return { normX, normY, colIndex, rowIndex, physXMm, physYMm };
}

export interface OmrBubbleCoordinateRecord {
  questionIndex: number;      // 0-based
  questionNumber: number;     // 1-based (e.g. 1 to 50)
  optionIndex: number;        // 0 to 3
  optionLetter: string;       // 'A', 'B', 'C', 'D'
  colIndex: number;           // 0 to 4
  rowIndex: number;           // 0 to N-1
  physXMm: number;            // mm from page left
  physYMm: number;            // mm from page top
  normX: number;              // normalized to fiducial span [0..1]
  normY: number;              // normalized to fiducial span [0..1]
  pageNormX: number;          // normalized to full cropped sheet width [0..1]
  pageNormY: number;          // normalized to full cropped sheet height [0..1]
}

export interface OmrSheetBlueprint {
  totalQuestions: number;
  layout: OmrLayoutConfig;
  fiducials: OmrCorners;
  columnConfig: typeof OMR_GEOMETRY.fiveColumns | typeof OMR_GEOMETRY.fourColumns;
  bubbleRecords: OmrBubbleCoordinateRecord[];
  bubbleMap: Record<string, OmrBubbleCoordinateRecord>; // key: `${qIndex}_${optIndex}`
}

/**
 * Generates the immutable ground-truth blueprint containing the exact coordinate record
 * of all fiducials and bubble circles for any OMR sheet.
 */
export function generateOmrSheetBlueprint(
  totalQuestions: number,
  forcedColumnCount?: number,
  sheetFormat: 'a4' | 'compact' = 'a4'
): OmrSheetBlueprint {
  const layout = getOmrLayoutConfig(totalQuestions, forcedColumnCount, sheetFormat);
  const columnConfig = layout.columnCount === 4 ? OMR_GEOMETRY.fourColumns : OMR_GEOMETRY.fiveColumns;
  const options = ['A', 'B', 'C', 'D'];
  const bubbleRecords: OmrBubbleCoordinateRecord[] = [];
  const bubbleMap: Record<string, OmrBubbleCoordinateRecord> = {};

  for (let qIdx = 0; qIdx < layout.totalQuestions; qIdx++) {
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const { normX, normY, colIndex, rowIndex, physXMm, physYMm } = getBubbleNormalizedCoordinates(qIdx, optIdx, layout);
      const pageNormX = physXMm / layout.pageWidthMm;
      const pageNormY = physYMm / layout.pageHeightMm;

      const record: OmrBubbleCoordinateRecord = {
        questionIndex: qIdx,
        questionNumber: qIdx + 1,
        optionIndex: optIdx,
        optionLetter: options[optIdx],
        colIndex,
        rowIndex,
        physXMm,
        physYMm,
        normX,
        normY,
        pageNormX,
        pageNormY,
      };
      bubbleRecords.push(record);
      bubbleMap[`${qIdx}_${optIdx}`] = record;
    }
  }

  return {
    totalQuestions: layout.totalQuestions,
    layout,
    fiducials: {
      topLeft: OMR_GEOMETRY.fiducialTopLeft,
      topRight: OMR_GEOMETRY.fiducialTopRight,
      bottomLeft: { x: OMR_GEOMETRY.fiducialTopLeft.x, y: layout.bottomFiducialY_mm },
      bottomRight: { x: OMR_GEOMETRY.fiducialTopRight.x, y: layout.bottomFiducialY_mm },
    },
    columnConfig,
    bubbleRecords,
    bubbleMap,
  };
}
