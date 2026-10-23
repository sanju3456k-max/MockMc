import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Printer,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  MoveRight,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type { MathTest, MathQuestion, QuestionPaperLayout } from '../types';
import { triggerSystemPrint } from '../lib/omrPrintDownload';
import { MathRenderer } from './MathRenderer';
import { normalizeDiagramUrl } from '../lib/diagramPresets';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';

interface OmrQuestionPaperProps {
  test: MathTest;
  className?: string;
  hideHeaderContainer?: boolean;
  isEditableLayout?: boolean;
  showSolutions?: boolean;
  onUpdateQuestionLayout?: (qIndex: number, newLayout: QuestionPaperLayout) => void;
  onResetAllLayouts?: () => void;
  layoutDensity?: 'tight' | 'balanced' | 'relaxed';
  setLayoutDensity?: (density: 'tight' | 'balanced' | 'relaxed') => void;
  showBadges?: boolean;
  setShowBadges?: (show: boolean) => void;
  hideInlineDock?: boolean;
}

export interface OptionData {
  label: string;
  text: string;
  originalIndex: number;
  imageUrl?: string;
}

export type StreamItemType = 'statement' | 'options_row' | 'single_option';

export interface StreamFlowItem {
  id: string;
  questionNumber: number;
  questionIndex?: number;
  type: StreamItemType;
  statementText?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageWidths?: (number | undefined)[];
  optionsRow?: OptionData[];
  singleOption?: OptionData;
  gridCols?: 2 | 4;
  isFirstOptionOfQuestion?: boolean;
  isLastOptionOfQuestion?: boolean;
  estimatedHeight: number;
  paperLayout?: QuestionPaperLayout;
  breakBefore?: 'none' | 'column' | 'page';
  keepTogether?: boolean;
}

export interface PaperPageLayout {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  leftColumn: StreamFlowItem[];
  rightColumn: StreamFlowItem[];
}

/**
 * Standard A4 Constants (at 96 DPI: 1mm = 3.78px, 297mm = 1122.5px)
 * Calibrated Column Height Budgets to eliminate bottom whitespace:
 * - Page 1 Available Vertical Height: ~1040px (balanced) / ~1080px (tight)
 * - Subsequent Pages Available Vertical Height: ~1120px (balanced) / ~1160px (tight)
 */
const DEFAULT_PAGE_1_COL_HEIGHT_PX = 1040;
const DEFAULT_SUBSEQUENT_PAGE_COL_HEIGHT_PX = 1120;
/**
 * Extra bottom vertical height buffer (in pixels) added specifically to the in-app
 * preview canvas so that questions are never cut off at the bottom in the preview.
 * (Adjust this value anytime to increase/decrease bottom breathing room in the app preview).
 */
export const PREVIEW_BOTTOM_EXTRA_HEIGHT_PX = 0;
const ITEM_GAP_PX = 0;
const CHARS_PER_COL_LINE = 56;

export interface OptionDimensionAnalysis {
  effectiveWidthPx: number;
  isMultiLine: boolean;
  hasMatrix: boolean;
  isWideMatrix: boolean;
  isTallMatrix: boolean;
  hasFractions: boolean;
  hasIntegralOrSum: boolean;
  hasTrigOrLog: boolean;
  plainTextLength: number;
}

export function analyzeOptionDimensions(optText: string): OptionDimensionAnalysis {
  const text = (optText || '').trim();
  if (!text) {
    return {
      effectiveWidthPx: 10,
      isMultiLine: false,
      hasMatrix: false,
      isWideMatrix: false,
      isTallMatrix: false,
      hasFractions: false,
      hasIntegralOrSum: false,
      hasTrigOrLog: false,
      plainTextLength: 0,
    };
  }

  const isMultiLine = text.includes('\n');
  const hasMatrix = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}/.test(text);
  const hasIntegralOrSum = /\\(?:int|iint|iiint|oint|sum|prod|lim|bigcup|bigcap)\b/.test(text);
  const hasTrigOrLog = /\\(?:sin|cos|tan|cot|sec|csc|log|ln|arcsin|arccos|arctan|sinh|cosh|tanh)\b/.test(text);

  let matrixWidthPx = 0;
  let isWideMatrix = false;
  let isTallMatrix = false;

  if (hasMatrix) {
    const matrixBodyMatch = text.match(/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/);
    if (matrixBodyMatch) {
      const body = matrixBodyMatch[1];
      const rows = body.split('\\\\').filter((r) => r.trim().length > 0);
      let maxCols = 1;
      let maxCellLen = 1;

      rows.forEach((r) => {
        const cells = r.split('&');
        maxCols = Math.max(maxCols, cells.length);
        cells.forEach((c) => {
          maxCellLen = Math.max(maxCellLen, c.trim().length);
        });
      });

      if (rows.length >= 3) isTallMatrix = true;
      if (maxCols >= 3 || maxCellLen > 3 || rows.length >= 3) {
        isWideMatrix = true;
      }
      matrixWidthPx = 20 + maxCols * Math.max(22, maxCellLen * 8 + 12);
    } else {
      matrixWidthPx = 110;
      isWideMatrix = true;
    }
  }

  const fracMatches: string[] = text.match(/\\(?:frac|dfrac)\{([^{}]+)\}\{([^{}]+)\}/g) || [];
  const hasFractions = fracMatches.length > 0;
  let fracWidthPx = 0;
  fracMatches.forEach((f: string) => {
    const match = f.match(/\\(?:frac|dfrac)\{([^{}]+)\}\{([^{}]+)\}/);
    if (match) {
      const numLen = match[1].replace(/\\[a-zA-Z]+/g, 'xx').length;
      const denLen = match[2].replace(/\\[a-zA-Z]+/g, 'xx').length;
      fracWidthPx += Math.max(numLen, denLen) * 7.5 + 14;
    }
  });

  const sqrtMatches = (text.match(/\\sqrt(?:\[\d+\])?\{[^{}]+\}/g) || []).length;
  const sqrtExtraWidth = sqrtMatches * 18;

  const trigMatches = (text.match(/\\(?:sin|cos|tan|cot|sec|csc|log|ln|arcsin|arccos|arctan|sinh|cosh|tanh)\b/g) || []).length;
  const trigExtraWidth = trigMatches * 26;

  const intMatches = (text.match(/\\(?:int|iint|iiint|oint)\b/g) || []).length;
  const intExtraWidth = intMatches * 44;

  const bigOpMatches = (text.match(/\\(?:sum|prod|lim)\b/g) || []).length;
  const bigOpExtraWidth = bigOpMatches * 36;

  const opMatches = (text.match(/[+\-=]|\\(?:pm|mp|times|cdot|div|neq|leq|geq)\b/g) || []).length;
  const opExtraWidth = opMatches * 14;

  const cleanText = text
    .replace(/\$\$[\s\S]+?\$\$/g, ' ')
    .replace(/\\begin\{[\s\S]+?\\end\{[^\}]+\}/g, ' ')
    .replace(/\\(?:frac|dfrac)\{[^{}]+\}\{[^{}]+\}/g, ' ')
    .replace(/\\sqrt(?:\[\d+\])?\{[^{}]+\}/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[$_{}^()\[\]|]/g, '')
    .trim();

  const plainTextLength = cleanText.length;
  const baseLetterWidth = plainTextLength * 7.2;

  const totalCalculatedWidth = 
    baseLetterWidth + 
    fracWidthPx + 
    matrixWidthPx + 
    sqrtExtraWidth + 
    trigExtraWidth + 
    intExtraWidth + 
    bigOpExtraWidth + 
    opExtraWidth;

  return {
    effectiveWidthPx: Math.round(totalCalculatedWidth),
    isMultiLine,
    hasMatrix,
    isWideMatrix,
    isTallMatrix,
    hasFractions,
    hasIntegralOrSum,
    hasTrigOrLog,
    plainTextLength,
  };
}

export function determineOptionLayout(
  options: OptionData[],
  forcedLayout?: 'auto' | '4_across' | '2x2_grid' | 'stacked'
): '4_across' | '2x2_grid' | 'stacked' {
  if (forcedLayout && forcedLayout !== 'auto') {
    return forcedLayout;
  }

  if (!options || options.length !== 4) {
    return 'stacked';
  }

  const analyses = options.map((o) => analyzeOptionDimensions(o.text));

  const hasMultiLine = analyses.some((a) => a.isMultiLine);
  const hasLongSentence = analyses.some((a) => a.plainTextLength > 24);
  const hasWideMatrix = analyses.some((a) => a.isWideMatrix || a.isTallMatrix);
  
  const hasCompoundIntegral = analyses.some(
    (a) => a.hasIntegralOrSum && (a.effectiveWidthPx > 80 || a.hasFractions || a.hasTrigOrLog)
  );

  if (hasMultiLine || hasLongSentence || hasWideMatrix || hasCompoundIntegral) {
    return 'stacked';
  }

  const maxEffectiveWidth = Math.max(...analyses.map((a) => a.effectiveWidthPx));
  const hasAnyMatrix = analyses.some((a) => a.hasMatrix);
  const hasAnyIntegral = analyses.some((a) => a.hasIntegralOrSum);
  const hasComplexFraction = analyses.some((a) => a.hasFractions && a.effectiveWidthPx > 48);

  if (
    !hasAnyMatrix &&
    !hasAnyIntegral &&
    !hasComplexFraction &&
    maxEffectiveWidth <= 52 &&
    !analyses.some((a) => a.plainTextLength > 8)
  ) {
    return '4_across';
  }

  if (
    maxEffectiveWidth <= 135 &&
    !analyses.some((a) => a.plainTextLength > 18)
  ) {
    return '2x2_grid';
  }

  return 'stacked';
}

function estimateStatementHeight(text: string): number {
  if (!text) return 18;

  let matrixExtra = 0;
  const matrixMatches = text.match(/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}[\s\S]+?\\end\{(?:bmatrix|pmatrix|vmatrix|matrix|cases|aligned)\}/g);
  if (matrixMatches) {
    matrixMatches.forEach((m) => {
      const rows = (m.match(/\\\\/g) || []).length + 1;
      const isShortInlineMatrix = m.length < 65 && rows <= 2;
      if (isShortInlineMatrix) {
        matrixExtra += 10;
      } else {
        matrixExtra += Math.max(20, rows * 16);
      }
    });
  }

  const displayMathBlocks = (text.match(/\$\$[\s\S]+?\$\$/g) || []).length;
  const displayMathExtra = displayMathBlocks * 22;

  const fracMatches = (text.match(/\\(?:frac|dfrac)\{[^{}]+\}\{[^{}]+\}/g) || []).length;
  const fracExtra = fracMatches * 4;

  const cleanText = text
    .replace(/\$\$[\s\S]+?\$\$/g, ' ')
    .replace(/\\begin\{[\s\S]+?\\end\{[^\}]+\}/g, ' ')
    .replace(/\\(?:frac|dfrac|sqrt|left|right|text|times|cdot)/g, ' ');

  const paragraphs = cleanText.split('\n');
  let lineCount = 0;
  paragraphs.forEach((p) => {
    const trimmed = p.trim();
    if (!trimmed) {
      lineCount += 0.2;
    } else {
      lineCount += Math.max(1, Math.ceil(trimmed.length / CHARS_PER_COL_LINE));
    }
  });

  const baseHeight = lineCount * 14.5 + matrixExtra + displayMathExtra + fracExtra + 1;
  return Math.max(16, Math.min(420, Math.round(baseHeight)));
}

function estimateOptionRowHeight(opts: OptionData[]): number {
  let maxHeight = 16;
  opts.forEach((opt) => {
    const text = opt.text || '';
    const is3x3 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}(?:[^\\]*\\\\){2,}/.test(text);
    const is2x2 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/.test(text);
    const isFrac = /\\(?:frac|dfrac)\b/.test(text);
    const isIntOrSqrt = /\\(?:int|sqrt)\b/.test(text);

    if (is3x3) {
      maxHeight = Math.max(maxHeight, 42);
    } else if (is2x2) {
      maxHeight = Math.max(maxHeight, 28);
    } else if (isFrac || isIntOrSqrt) {
      maxHeight = Math.max(maxHeight, 20);
    } else {
      maxHeight = Math.max(maxHeight, 16);
    }
  });
  return maxHeight;
}

function estimateSingleOptionHeight(opt: OptionData): number {
  const text = opt.text || '';
  const is3x3 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}(?:[^\\]*\\\\){2,}/.test(text);
  const is2x2 = /\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/.test(text);
  const isFrac = /\\(?:frac|dfrac)\b/.test(text);
  const isInt = /\\(?:int|iint|iiint)\b/.test(text);

  if (is3x3) return 42;
  if (is2x2) return 28;

  const analysis = analyzeOptionDimensions(text);
  const lines = Math.max(1, Math.ceil(analysis.effectiveWidthPx / 315));

  let baseH = lines * 15;
  if (isFrac || isInt) baseH += 3;
  return Math.max(15, baseH);
}

export function cleanBlankLines(text: string): string {
  if (!text) return '';
  let res = text.replace(/(?:\\_)+/g, (match) => '_'.repeat(Math.max(4, Math.floor(match.length / 2) * 2)));
  res = res.replace(/\\_/g, '_');
  res = res.replace(/(?:[_\-–—]\s+){2,}[_\-–—]/g, '________');
  return res;
}

function buildLinearStreamItems(questions: MathQuestion[]): StreamFlowItem[] {
  const stream: StreamFlowItem[] = [];

  questions.forEach((q, idx) => {
    const qNumber = idx + 1;
    const qId = q.id || `q_${qNumber}`;
    const statementText = cleanBlankLines(q.text || '');
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const formattedOptions: OptionData[] = rawOptions.map((opt, oIdx) => ({
      label: String.fromCharCode(97 + oIdx),
      text: cleanBlankLines(opt || ''),
      originalIndex: oIdx,
      imageUrl: q.optionImages?.[oIdx],
    }));

    const effectiveImageUrl = q.imageUrl || q.paperLayout?.imageUrl;
    const effectiveImageWidth = q.imageWidth || q.paperLayout?.imageWidth;
    const effectiveImageWidths = q.paperLayout?.imageWidths || q.imageWidths;

    const paperLayout: QuestionPaperLayout = {
      ...q.paperLayout,
      imageUrl: effectiveImageUrl,
      imageWidth: effectiveImageWidth,
      imageWidths: effectiveImageWidths,
      keepTogether: q.paperLayout?.keepTogether ?? true,
    };
    const breakBefore = paperLayout.breakBefore || 'none';
    const keepTogether = paperLayout.keepTogether ?? true;

    const imgWidth = paperLayout.imageWidth;
    let imgExtra = effectiveImageUrl
      ? (imgWidth ? Math.min(115, Math.max(50, Math.round(imgWidth * 0.45))) : 95)
      : 0;
    if (Array.isArray(q.imageUrls)) {
      q.imageUrls.forEach((url, uIdx) => {
        if (url) {
          const uWidth = effectiveImageWidths?.[uIdx];
          imgExtra += uWidth ? Math.min(115, Math.max(50, Math.round(uWidth * 0.45))) : 95;
        }
      });
    }
    const statementHeight = estimateStatementHeight(statementText) + imgExtra;

    stream.push({
      id: `${qId}_stmt`,
      questionNumber: qNumber,
      questionIndex: idx,
      type: 'statement',
      statementText,
      imageUrl: effectiveImageUrl,
      imageUrls: q.imageUrls,
      imageWidths: effectiveImageWidths,
      estimatedHeight: statementHeight,
      paperLayout,
      breakBefore,
      keepTogether,
    });

    if (formattedOptions.length === 0) return;

    const layout = determineOptionLayout(formattedOptions, paperLayout.optionLayout);

    if (layout === '4_across') {
      stream.push({
        id: `${qId}_opts_row_4`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: formattedOptions,
        gridCols: 4,
        isFirstOptionOfQuestion: true,
        isLastOptionOfQuestion: true,
        estimatedHeight: 20,
        paperLayout,
      });
    } else if (layout === '2x2_grid') {
      const row1Opts = [formattedOptions[0], formattedOptions[1]];
      const row2Opts = [formattedOptions[2], formattedOptions[3]];

      stream.push({
        id: `${qId}_opts_row_2_1`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: row1Opts,
        gridCols: 2,
        isFirstOptionOfQuestion: true,
        isLastOptionOfQuestion: false,
        estimatedHeight: estimateOptionRowHeight(row1Opts),
        paperLayout,
      });

      stream.push({
        id: `${qId}_opts_row_2_2`,
        questionNumber: qNumber,
        questionIndex: idx,
        type: 'options_row',
        optionsRow: row2Opts,
        gridCols: 2,
        isFirstOptionOfQuestion: false,
        isLastOptionOfQuestion: true,
        estimatedHeight: estimateOptionRowHeight(row2Opts),
        paperLayout,
      });
    } else {
      formattedOptions.forEach((opt, oIdx) => {
        stream.push({
          id: `${qId}_opt_${opt.label}`,
          questionNumber: qNumber,
          questionIndex: idx,
          type: 'single_option',
          singleOption: opt,
          isFirstOptionOfQuestion: oIdx === 0,
          isLastOptionOfQuestion: oIdx === formattedOptions.length - 1,
          estimatedHeight: estimateSingleOptionHeight(opt),
          paperLayout,
        });
      });
    }
  });

  return stream;
}

interface TwoColumnSplit {
  splitIndex: number;
  leftHeight: number;
  rightHeight: number;
  diff: number;
}

function findBestTwoColumnSplit(
  items: StreamFlowItem[],
  colBudget: number,
  measuredHeightsMap?: Record<string, number>
): TwoColumnSplit | null {
  if (items.length === 0) {
    return { splitIndex: 0, leftHeight: 0, rightHeight: 0, diff: 0 };
  }

  const heights = items.map((it) => measuredHeightsMap?.[it.id] ?? it.estimatedHeight);
  const totalH = heights.reduce((sum, h) => sum + h + ITEM_GAP_PX, 0);
  const targetH = totalH / 2;

  let bestSplit: TwoColumnSplit | null = null;
  let minDiff = Infinity;
  let accumH = 0;

  for (let i = 0; i < items.length; i++) {
    accumH += heights[i] + ITEM_GAP_PX;
    const currentItem = items[i];
    const nextItem = items[i + 1];

    const isQuestionBoundary = !nextItem || nextItem.questionNumber !== currentItem.questionNumber;
    const allowsMidQuestionSplit = currentItem.paperLayout?.keepTogether === false;
    const forcesColBreak = nextItem?.breakBefore === 'column';

    if (isQuestionBoundary || allowsMidQuestionSplit || forcesColBreak) {
      const leftH = accumH;
      const rightH = totalH - leftH;

      if (leftH <= colBudget && rightH <= colBudget) {
        const diff = Math.abs(leftH - targetH);
        if (diff < minDiff) {
          minDiff = diff;
          bestSplit = {
            splitIndex: i + 1,
            leftHeight: leftH,
            rightHeight: rightH,
            diff,
          };
        }
      }
    }
  }

  return bestSplit;
}

function paginateLinearStream(
  streamItems: StreamFlowItem[],
  measuredHeightsMap?: Record<string, number>,
  layoutDensity: 'tight' | 'balanced' | 'relaxed' = 'balanced'
): PaperPageLayout[] {
  if (!streamItems || streamItems.length === 0) {
    return [
      {
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        leftColumn: [],
        rightColumn: [],
      },
    ];
  }

  const getColBudget = (pageIdx: number) => {
    if (layoutDensity === 'tight') {
      return pageIdx === 0 ? 1160 : 1220;
    }
    if (layoutDensity === 'relaxed') {
      return pageIdx === 0 ? 1040 : 1100;
    }
    return pageIdx === 0 ? DEFAULT_PAGE_1_COL_HEIGHT_PX : DEFAULT_SUBSEQUENT_PAGE_COL_HEIGHT_PX;
  };

  const questionUnits: { questionNumber: number; items: StreamFlowItem[]; breakBefore?: 'none' | 'column' | 'page' }[] = [];
  let currentGroup: StreamFlowItem[] = [];
  let currentQNum: number | null = null;

  for (const item of streamItems) {
    if (currentQNum !== null && item.questionNumber !== currentQNum) {
      questionUnits.push({
        questionNumber: currentQNum,
        items: currentGroup,
        breakBefore: currentGroup[0]?.breakBefore,
      });
      currentGroup = [];
    }
    currentQNum = item.questionNumber;
    currentGroup.push(item);
  }
  if (currentGroup.length > 0 && currentQNum !== null) {
    questionUnits.push({
      questionNumber: currentQNum,
      items: currentGroup,
      breakBefore: currentGroup[0]?.breakBefore,
    });
  }

  const pages: PaperPageLayout[] = [];
  let unplacedUnits = [...questionUnits];
  let pageNumber = 1;

  while (unplacedUnits.length > 0) {
    const pageIdx = pageNumber - 1;
    const colBudget = getColBudget(pageIdx);

    let currentUnitsForPage: typeof questionUnits = [];
    let bestSplitForPage: TwoColumnSplit | null = null;
    let unitsToIncludeCount = 0;

    for (let i = 0; i < unplacedUnits.length; i++) {
      const candidateUnit = unplacedUnits[i];

      if (i > 0 && candidateUnit.breakBefore === 'page') {
        break;
      }

      const testUnits = [...currentUnitsForPage, candidateUnit];
      const testItems = testUnits.flatMap((u) => u.items);

      const split = findBestTwoColumnSplit(testItems, colBudget, measuredHeightsMap);

      if (split !== null) {
        currentUnitsForPage = testUnits;
        bestSplitForPage = split;
        unitsToIncludeCount = i + 1;
      } else {
        if (currentUnitsForPage.length === 0) {
          currentUnitsForPage = [candidateUnit];
          const fallbackItems = candidateUnit.items;
          bestSplitForPage = {
            splitIndex: Math.max(1, Math.floor(fallbackItems.length / 2)),
            leftHeight: colBudget,
            rightHeight: colBudget,
            diff: 0,
          };
          unitsToIncludeCount = 1;
        }
        break;
      }
    }

    const pageItems = currentUnitsForPage.flatMap((u) => u.items);
    const splitIndex = bestSplitForPage
      ? bestSplitForPage.splitIndex
      : Math.max(1, Math.floor(pageItems.length / 2));

    const leftColumn = pageItems.slice(0, splitIndex);
    const rightColumn = pageItems.slice(splitIndex);

    pages.push({
      pageNumber,
      totalPages: 1,
      isFirstPage: pageNumber === 1,
      leftColumn,
      rightColumn,
    });

    unplacedUnits = unplacedUnits.slice(unitsToIncludeCount);
    pageNumber++;
  }

  const totalPages = pages.length;
  pages.forEach((p) => {
    p.totalPages = totalPages;
  });

  return pages;
}

const RenderStreamItem: React.FC<{
  item: StreamFlowItem;
  isEditableLayout?: boolean;
  showBadges?: boolean;
  onUpdateQuestionLayout?: (qIndex: number, newLayout: QuestionPaperLayout) => void;
}> = React.memo(({ item, isEditableLayout, showBadges = true, onUpdateQuestionLayout }) => {
  if (item.type === 'statement') {
    return (
      <div 
        data-stream-id={item.id} 
        className="pt-1.5 first:pt-0 text-black text-[10.5pt] leading-[1.32] relative group print:pt-0.5"
      >
        {isEditableLayout && showBadges && onUpdateQuestionLayout && typeof item.questionIndex === 'number' && (
          <div className="print:hidden pointer-events-auto absolute -top-3.5 right-0 z-30 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2 py-1 rounded-full shadow-md border border-slate-200/80 select-none transition-colors max-w-full overflow-x-auto">
            <span className="text-slate-600 font-extrabold px-1 text-[11px] uppercase tracking-wider shrink-0 whitespace-nowrap">
              Q{item.questionNumber}:
            </span>

            {/* Grid Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextGridMap: Record<string, 'auto' | '4_across' | '2x2_grid' | 'stacked'> = {
                  auto: '4_across',
                  '4_across': '2x2_grid',
                  '2x2_grid': 'stacked',
                  stacked: 'auto',
                };
                const currentGrid = item.paperLayout?.optionLayout || 'auto';
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  optionLayout: nextGridMap[currentGrid] || 'auto',
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                item.paperLayout?.optionLayout && item.paperLayout.optionLayout !== 'auto'
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
              }`}
              title="Toggle option layout grid (Auto -> 4 Across -> 2x2 Grid -> Stacked)"
            >
              <LayoutGrid className={`w-3 h-3 shrink-0 ${item.paperLayout?.optionLayout && item.paperLayout.optionLayout !== 'auto' ? 'text-slate-900' : 'text-slate-600'}`} />
              <span className="leading-none whitespace-nowrap">
                {item.paperLayout?.optionLayout === '4_across'
                  ? '4 Across'
                  : item.paperLayout?.optionLayout === '2x2_grid'
                  ? '2x2 Grid'
                  : item.paperLayout?.optionLayout === 'stacked'
                  ? 'Stacked'
                  : 'Auto Grid'}
              </span>
            </button>

            {/* Break Before Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextBreakMap: Record<string, 'none' | 'column' | 'page'> = {
                  none: 'column',
                  column: 'page',
                  page: 'none',
                };
                const currentBreak = item.paperLayout?.breakBefore || 'none';
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  breakBefore: nextBreakMap[currentBreak] || 'none',
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                item.paperLayout?.breakBefore && item.paperLayout.breakBefore !== 'none'
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
              }`}
              title="Force break before this question (None -> Push Col -> Push Page)"
            >
              <MoveRight className={`w-3 h-3 shrink-0 ${item.paperLayout?.breakBefore && item.paperLayout.breakBefore !== 'none' ? 'text-slate-900' : 'text-slate-600'}`} />
              <span className="leading-none whitespace-nowrap">
                {item.paperLayout?.breakBefore === 'column'
                  ? 'Push Col'
                  : item.paperLayout?.breakBefore === 'page'
                  ? 'Push Page'
                  : 'No Break'}
              </span>
            </button>

            {/* Keep Together / Split Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const currentKeep = item.paperLayout?.keepTogether ?? true;
                onUpdateQuestionLayout(item.questionIndex!, {
                  ...item.paperLayout,
                  keepTogether: !currentKeep,
                });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                (item.paperLayout?.keepTogether ?? true)
                  ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                  : 'bg-amber-100/90 text-amber-800 font-bold border border-amber-300 hover:bg-amber-200/80'
              }`}
              title="Lock question statement and options together in one column (No Break / Keep Together)"
            >
              {(item.paperLayout?.keepTogether ?? true) ? (
                <Lock className="w-3 h-3 shrink-0 text-slate-900" />
              ) : (
                <Unlock className="w-3 h-3 shrink-0 text-amber-700" />
              )}
              <span className="leading-none whitespace-nowrap">
                {(item.paperLayout?.keepTogether ?? true) ? 'No Break' : 'Allow Split'}
              </span>
            </button>

            {/* Diagram Resize Button in Paper Toolbar */}
            {(item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls.some(Boolean))) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextSizes: (number | undefined)[] = [undefined, 140, 200, 280];
                  const currentSize = item.paperLayout?.imageWidth;
                  const currentIdx = nextSizes.indexOf(currentSize);
                  const nextSize = nextSizes[(currentIdx + 1) % nextSizes.length];

                  const numExtras = Array.isArray(item.imageUrls) ? item.imageUrls.filter(Boolean).length : 0;
                  const nextWidths = numExtras > 0 ? Array(numExtras).fill(nextSize) : undefined;

                  onUpdateQuestionLayout(item.questionIndex!, {
                    ...item.paperLayout,
                    imageWidth: nextSize,
                    imageWidths: nextWidths,
                  });
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 select-none [-webkit-tap-highlight-color:transparent] ${
                  item.paperLayout?.imageWidth
                    ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300/90 shadow-2xs hover:bg-slate-300/80'
                    : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                }`}
                title="Toggle diagram size in question paper (Auto -> 140px -> 200px -> 280px)"
              >
                <ImageIcon className="w-3 h-3 shrink-0 text-slate-700" />
                <span className="leading-none whitespace-nowrap">
                  {item.paperLayout?.imageWidth ? `${item.paperLayout.imageWidth}px` : 'Img: Auto'}
                </span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-start gap-1.5">
          <span className="font-semibold text-[10.5pt] shrink-0 select-none">
            {item.questionNumber}.
          </span>
          <div className="flex-1 min-w-0 font-normal text-black text-[10.5pt] tracking-tight">
            <MathRenderer 
              text={item.statementText || ''} 
              className="text-black font-normal text-[10.5pt] leading-[1.32]" 
            />
          </div>
        </div>

        {(item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls.some(Boolean))) && (
          <div className="relative group/diagram my-1 flex flex-col items-center justify-center w-full">
            <QuestionDiagramViewer
              imageUrl={item.imageUrl}
              imageUrls={item.imageUrls}
              imageWidths={item.paperLayout?.imageWidths || item.imageWidths}
              alt={`Diagram Q${item.questionNumber}`}
              width={item.paperLayout?.imageWidth}
              maxHeightClass="max-h-28"
              allowZoom={true}
              className="!my-0 print:!my-0"
              showSizeControls={Boolean(isEditableLayout && showBadges && onUpdateQuestionLayout && typeof item.questionIndex === 'number')}
              onUpdateWidth={(photoIndex, newWidth) => {
                if (!onUpdateQuestionLayout || typeof item.questionIndex !== 'number') return;
                if (photoIndex === 0) {
                  onUpdateQuestionLayout(item.questionIndex, {
                    ...item.paperLayout,
                    imageWidth: newWidth,
                  });
                } else {
                  const extraIdx = photoIndex - 1;
                  const currentWidths = Array.isArray(item.paperLayout?.imageWidths)
                    ? [...item.paperLayout.imageWidths]
                    : (Array.isArray(item.imageWidths) ? [...item.imageWidths] : []);
                  while (currentWidths.length <= extraIdx) {
                    currentWidths.push(undefined);
                  }
                  currentWidths[extraIdx] = newWidth;
                  onUpdateQuestionLayout(item.questionIndex, {
                    ...item.paperLayout,
                    imageWidths: currentWidths,
                  });
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'options_row') {
    const opts = item.optionsRow || [];
    const colsClass = item.gridCols === 4 ? 'grid-cols-4' : 'grid-cols-2';
    const topPaddingClass = item.isFirstOptionOfQuestion ? 'pt-0.5' : 'pt-0';
    const bottomPaddingClass = item.isLastOptionOfQuestion ? 'pb-1' : 'pb-0.5';

    return (
      <div data-stream-id={item.id} className={`pl-4 ${topPaddingClass} ${bottomPaddingClass}`}>
        <div className={`grid ${colsClass} gap-x-3 gap-y-1 text-[10pt]`}>
          {opts.map((opt) => (
            <div key={opt.originalIndex} className="flex flex-col gap-1 min-w-0 overflow-visible select-none">
              <div className="flex items-start gap-1 min-w-0 overflow-visible select-none">
                <span className="font-semibold text-[10pt] shrink-0 select-none pt-[1px]">({opt.label})</span>
                <span className="text-black inline-block break-words overflow-visible">
                  <MathRenderer text={opt.text} className="inline-block text-[10pt] break-words" />
                </span>
              </div>
              {opt.imageUrl && normalizeDiagramUrl(opt.imageUrl) ? (
                <div className="pl-4 pt-0.5">
                  <img
                    src={normalizeDiagramUrl(opt.imageUrl)}
                    alt={`Option (${opt.label}) diagram`}
                    className="max-h-[60px] max-w-full object-contain rounded"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (item.type === 'single_option' && item.singleOption) {
    const opt = item.singleOption;
    const topPaddingClass = item.isFirstOptionOfQuestion ? 'pt-0.5' : 'pt-0';
    const bottomPaddingClass = item.isLastOptionOfQuestion ? 'pb-1' : 'pb-0.5';

    return (
      <div data-stream-id={item.id} className={`pl-4 ${topPaddingClass} ${bottomPaddingClass} text-[10pt]`}>
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="font-semibold text-[10pt] shrink-0 select-none pt-[1px]">({opt.label})</span>
          <div className="flex-1 min-w-0">
            <span className="text-black inline-block leading-normal">
              <MathRenderer text={opt.text} className="inline-block text-[10pt] leading-normal" />
            </span>
            {opt.imageUrl && normalizeDiagramUrl(opt.imageUrl) ? (
              <div className="pt-1">
                <img
                  src={normalizeDiagramUrl(opt.imageUrl)}
                  alt={`Option (${opt.label}) diagram`}
                  className="max-h-[60px] max-w-full object-contain rounded"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
});

export const OmrQuestionPaper: React.FC<OmrQuestionPaperProps> = ({
  test,
  className = '',
  hideHeaderContainer = false,
  isEditableLayout = false,
  onUpdateQuestionLayout,
  onResetAllLayouts,
  layoutDensity: propLayoutDensity,
  setLayoutDensity: propSetLayoutDensity,
  showBadges: propShowBadges,
  setShowBadges: propSetShowBadges,
  hideInlineDock = false,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [localShowBadges, setLocalShowBadges] = useState<boolean>(true);
  const [localLayoutDensity, setLocalLayoutDensity] = useState<'tight' | 'balanced' | 'relaxed'>('balanced');
  const [isDockExpanded, setIsDockExpanded] = useState<boolean>(false);

  const showBadges = propShowBadges !== undefined ? propShowBadges : localShowBadges;
  const setShowBadges = propSetShowBadges !== undefined ? propSetShowBadges : setLocalShowBadges;
  const layoutDensity = propLayoutDensity !== undefined ? propLayoutDensity : localLayoutDensity;
  const setLayoutDensity = propSetLayoutDensity !== undefined ? propSetLayoutDensity : setLocalLayoutDensity;

  const cleanTitle = (test.title || 'Question_Paper').replace(/[^a-zA-Z0-9_-]/g, '_');
  const totalQuestions = test.questions?.length || 0;
  const timeAllowed = test.timeLimitMinutes > 0 ? test.timeLimitMinutes : (test.time > 0 ? test.time : (totalQuestions || 60));
  const maxMarks = test.questions?.length ? test.questions.reduce((acc, q) => acc + (q.points || 1), 0) : (test.totalMarks || totalQuestions);

  const MM_TO_PX = 96 / 25.4;
  const pageWPx = 210 * MM_TO_PX;
  const pageHPx = 297 * MM_TO_PX;

  const containerRef = useRef<HTMLDivElement>(null);
  const [userZoom, setUserZoom] = useState<number>(1.0);
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const padding = window.innerWidth < 640 ? 24 : 32;
      const availableW = Math.max(200, Math.min(1400, window.innerWidth - padding));
      const targetW = 210 * (96 / 25.4);
      if (availableW < targetW) {
        return availableW / targetW;
      }
    }
    return 1;
  });

  const effectiveScale = scale * userZoom;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measureAndSetScale = () => {
      const availableWidth = el.clientWidth;
      if (availableWidth > 50) {
        const targetW = pageWPx;
        const nextScale = availableWidth < targetW ? availableWidth / targetW : 1;
        setScale((prev) => (Math.abs(prev - nextScale) > 0.002 ? nextScale : prev));
      }
    };

    measureAndSetScale();

    const ro = new ResizeObserver(() => {
      measureAndSetScale();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [pageWPx]);

  const streamItems = useMemo(() => {
    return buildLinearStreamItems(test.questions || []);
  }, [test.questions]);

  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const root = document.getElementById('question-paper-printable-root');
    if (!root) return;

    const elements = root.querySelectorAll<HTMLElement>('[data-stream-id]');
    if (elements.length === 0) return;

    let hasDiff = false;
    const newHeights: Record<string, number> = {};

    elements.forEach((el) => {
      const id = el.getAttribute('data-stream-id');
      if (id) {
        const h = el.offsetHeight;
        if (h > 0) {
          newHeights[id] = h;
          const oldH = measuredHeights[id];
          if (oldH === undefined || Math.abs(oldH - h) > 3) {
            hasDiff = true;
          }
        }
      }
    });

    if (hasDiff) {
      setMeasuredHeights(newHeights);
    }
  }, [streamItems, layoutDensity]);

  const activePageLayouts = useMemo(() => {
    return paginateLinearStream(streamItems, measuredHeights, layoutDensity);
  }, [streamItems, measuredHeights, layoutDensity]);

  const getPagePreviewHeightPx = (page: PaperPageLayout) => {
    const leftColH = page.leftColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const rightColH = page.rightColumn.reduce(
      (sum, item) => sum + (measuredHeights[item.id] ?? item.estimatedHeight) + ITEM_GAP_PX,
      0
    );
    const maxColH = Math.max(leftColH, rightColH);

    const headerOverheadPx = page.isFirstPage ? 185 : 55;
    const pagePaddingOverheadPx = 60; // 10mm top (38px) + preview bottom clearance (~57px)
    const footerOverheadPx = 40; // footer border + margins

    const calculatedContentHeight = Math.ceil(
      headerOverheadPx + maxColH + pagePaddingOverheadPx + footerOverheadPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX
    );

    const baseMinHeight = Math.ceil(pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX);
    return Math.max(baseMinHeight, calculatedContentHeight);
  };

  const handlePrint = async () => {
    try {
      setDownloadError(null);
      setIsPrinting(true);

      await new Promise((resolve) => setTimeout(resolve, 60));

      await triggerSystemPrint(
        'question-paper-printable-root',
        `${cleanTitle}_Question_Paper_A4`,
        210,
        297
      );
      setDownloadSuccess('Print dialog opened. Select physical printer or "Save as PDF".');
      setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err: any) {
      console.error('System print error:', err);
      setDownloadError(err?.message || 'Failed to open printer interface.');
      setTimeout(() => setDownloadError(null), 5000);
    } finally {
      setTimeout(() => setIsPrinting(false), 1200);
    }
  };

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      {!hideHeaderContainer && (
        <div className="w-full max-w-[1400px] mx-auto mb-2.5 bg-white dark:bg-[#21222e] rounded-3xl p-3.5 sm:p-5 shadow-none border-0 ring-0 print:hidden space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/60">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold tracking-widest text-[#0b57d0] dark:text-[#a8c7fa] uppercase font-mono block">
                Question Paper
              </span>
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                {test.title || 'Question Paper'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate">
                Portion: {test.topic || 'Mathematics Assessment'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
              <span className="px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold">
                {maxMarks} Marks
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                {timeAllowed} Mins
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300">
                {totalQuestions} Questions
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300">
                {activePageLayouts.length} {activePageLayouts.length === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 flex-wrap pt-1">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#222634] p-1 rounded-full text-xs font-semibold border-0 ring-0 shadow-none">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-bold px-2.5 shrink-0 select-none">
                Page Usage:
              </span>
              <button
                type="button"
                onClick={() => setLayoutDensity('tight')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'tight'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Tight Fit: Maximizes space utilization per column so questions fit comfortably in Column 1"
              >
                Max Fit
              </button>
              <button
                type="button"
                onClick={() => setLayoutDensity('balanced')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'balanced'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Balanced Fit: Calibrated standard A4 layout"
              >
                Balanced
              </button>
              <button
                type="button"
                onClick={() => setLayoutDensity('relaxed')}
                className={`px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border-0 ring-0 shadow-none ${
                  layoutDensity === 'relaxed'
                    ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-bold'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Relaxed Fit: Adds extra vertical padding"
              >
                Spacious
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] active:scale-95 transition-all shadow-none border-0 ring-0 cursor-pointer disabled:opacity-50"
                title="Open system print dialog"
              >
                {isPrinting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}
                <span>{isPrinting ? 'Printing...' : 'Print'}</span>
              </button>
            </div>
          </div>

          {downloadSuccess && (
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 border-0 ring-0 shadow-none">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{downloadSuccess}</span>
            </div>
          )}

          {downloadError && (
            <div className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 border-0 ring-0 shadow-none">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>
      )}

      <div 
        ref={containerRef}
        className="w-full max-w-[1400px] mx-auto relative flex flex-col items-center justify-start pb-12 pt-2"
      >
        {isEditableLayout && !hideInlineDock && (
          <motion.div 
            drag
            dragMomentum={false}
            className="print:hidden absolute right-3 top-[32px] sm:top-[38px] z-[150] flex flex-col items-end select-none cursor-grab active:cursor-grabbing"
          >
            <div className="bg-white/95 dark:bg-[#21222e]/95 backdrop-blur-md p-1 rounded-full shadow-none flex flex-col gap-1.5 items-center border border-slate-200/80 dark:border-zinc-800/60 ring-0">
              <button
                type="button"
                onClick={() => setUserZoom((prev) => Math.max(0.6, Number((prev - 0.2).toFixed(1))))}
                disabled={userZoom <= 0.6}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
                title="Zoom Out Question Paper (-20%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setUserZoom(1.0)}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] transition-colors cursor-pointer flex items-center justify-center"
                title="Reset Zoom to 100% Fit Width"
              >
                {Math.round(userZoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setUserZoom((prev) => Math.min(2.5, Number((prev + 0.2).toFixed(1))))}
                disabled={userZoom >= 2.5}
                className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40"
                title="Zoom In Question Paper (+20%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-5 h-px bg-slate-200 dark:bg-zinc-700 my-0.5" />

              <button
                type="button"
                onClick={() => setIsDockExpanded(!isDockExpanded)}
                className={`w-9 h-9 rounded-full transition-all cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                  isDockExpanded
                    ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200'
                }`}
                title={isDockExpanded ? "Collapse layout options" : "Expand layout options"}
              >
                {isDockExpanded ? (
                  <ChevronUp className="w-4 h-4 animate-bounce" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {isDockExpanded && (
                <div className="flex flex-col gap-1.5 items-center mt-0.5 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMap: Record<string, 'tight' | 'balanced' | 'relaxed'> = {
                        balanced: 'tight',
                        tight: 'relaxed',
                        relaxed: 'balanced',
                      };
                      setLayoutDensity(nextMap[layoutDensity] || 'balanced');
                    }}
                    className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center text-[9px] font-extrabold border-0 ring-0 outline-none shadow-none ${
                      layoutDensity === 'tight'
                        ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                        : layoutDensity === 'relaxed'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                    }`}
                    title={`Page Density: ${layoutDensity.toUpperCase()} (Click to toggle Tight -> Relaxed -> Balanced)`}
                  >
                    {layoutDensity === 'tight' ? 'MAX' : layoutDensity === 'relaxed' ? 'PAD' : 'BAL'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBadges(!showBadges)}
                    className={`w-8.5 h-8.5 rounded-full transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none ${
                      showBadges
                        ? 'bg-slate-200 dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 font-bold'
                        : 'bg-slate-100 dark:bg-[#222634] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282a39]'
                    }`}
                    title={showBadges ? 'Hide Edit Badges (Clean Preview)' : 'Show Edit Badges'}
                  >
                    {showBadges ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />}
                  </button>

                  {onResetAllLayouts && (
                    <button
                      type="button"
                      onClick={onResetAllLayouts}
                      className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                      title="Reset all question paper layout overrides to Auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300 group-hover:-rotate-45 transition-transform" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={isPrinting}
                    className="w-8.5 h-8.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] transition-colors cursor-pointer flex items-center justify-center border-0 ring-0 outline-none shadow-none group"
                    title="Print A4 / Save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5 text-white dark:text-[#041e49] group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div id="question-paper-printable-root" className="w-full flex flex-col gap-8 print:gap-0 items-center mx-auto py-2 px-0 touch-auto [webkit-overflow-scrolling:touch]">
          {activePageLayouts.map((page) => {
            const isLastPage = page.pageNumber === page.totalPages;
            const currentPageHPx = getPagePreviewHeightPx(page);

            return (
              <div
                key={`page_wrap_${page.pageNumber}`}
                data-page-wrapper="true"
                className="relative mx-auto shrink-0 print:p-0 print:m-0 print:w-[210mm] print:h-[297mm] print:pb-0 transition-all duration-150 ease-out"
                style={{
                  width: `${pageWPx * effectiveScale}px`,
                  maxWidth: '100%',
                  height: `${currentPageHPx * effectiveScale}px`,
                  minHeight: `${(pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX) * effectiveScale}px`,
                  transition: 'width 0.15s ease-out, height 0.15s ease-out',
                }}
              >
                <div
                  key={`page_${page.pageNumber}`}
                  className="a4-page-item bg-white text-black shadow-2xl print:shadow-none select-text box-border flex flex-col justify-start rounded-xs ring-1 ring-slate-900/10 print:ring-0 print:border-none print:transform-none print:relative print:left-auto print:top-auto print:w-[210mm] print:h-[297mm] print:min-h-[297mm] print:max-h-[297mm] touch-auto"
                  style={{
                    width: '210mm',
                    minWidth: '210mm',
                    maxWidth: '210mm',
                    height: `${currentPageHPx}px`,
                    minHeight: `${pageHPx + PREVIEW_BOTTOM_EXTRA_HEIGHT_PX}px`,
                    padding: '10mm 12mm 16mm 12mm',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    boxSizing: 'border-box',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    transform: `translateX(-50%) scale(${effectiveScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.15s ease-out, height 0.15s ease-out',
                  }}
                >
                  <div className="shrink-0 mb-2">
                    {page.isFirstPage ? (
                      <div className="border-b-2 border-black pb-1.5">
                        <h1 className="text-center font-semibold text-[14pt] tracking-wide uppercase text-black leading-tight mb-1">
                          {test.title || 'MIX ASSESSMENT TEST'}
                        </h1>

                        <div className="flex justify-between items-center text-[8.5pt] font-bold border-y border-black py-0.5 px-1 mb-1">
                          <span>TIME ALLOWED: {timeAllowed} MINUTES</span>
                          <span>TOTAL QUESTIONS: {totalQuestions}</span>
                          <span>MAXIMUM MARKS: {maxMarks}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-[8.5pt] font-semibold mb-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="shrink-0">Candidate Name:</span>
                            <div className="flex-1 border-b border-black border-dotted h-3.5" />
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="shrink-0">Roll No:</span>
                            <div className="flex-1 border-b border-black border-dotted h-3.5" />
                          </div>
                        </div>

                        <div className="border border-black p-1 text-[7.5pt] leading-tight font-medium bg-neutral-50/50">
                          <span className="font-bold">INSTRUCTIONS:</span> Darken only ONE bubble per question on your OMR answer sheet using blue or black ballpoint pen. Each question carries equal marks. Choose the most appropriate single option (A, B, C, or D).
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pt-0.5 pb-1 border-b-2 border-black text-[8.5pt] font-bold text-black uppercase tracking-wide leading-normal">
                        <span className="truncate max-w-[70%]">{test.title || 'MATHEMATICS EXAMINATION'}</span>
                        <span className="shrink-0 font-extrabold">PAGE {page.pageNumber} OF {page.totalPages}</span>
                      </div>
                    )}
                  </div>

                  <div className={`relative mb-2 flex flex-col justify-start ${isLastPage ? 'flex-none' : 'flex-1'}`}>
                    <div className={`grid grid-cols-2 gap-x-5 text-black relative ${isLastPage ? '' : 'flex-1'}`}>
                      <div className="flex flex-col justify-start pr-2">
                        {page.leftColumn.map((item) => (
                          <RenderStreamItem
                            key={item.id}
                            item={item}
                            isEditableLayout={isEditableLayout}
                            showBadges={showBadges}
                            onUpdateQuestionLayout={onUpdateQuestionLayout}
                          />
                        ))}
                      </div>

                      {page.rightColumn.length > 0 && (
                        <div className="absolute top-0 bottom-0 left-1/2 w-[0.75pt] bg-black -translate-x-1/2 pointer-events-none" />
                      )}

                      <div className="flex flex-col justify-start pl-2">
                        {page.rightColumn.map((item) => (
                          <RenderStreamItem
                            key={item.id}
                            item={item}
                            isEditableLayout={isEditableLayout}
                            showBadges={showBadges}
                            onUpdateQuestionLayout={onUpdateQuestionLayout}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {isLastPage ? (
                    <div className="shrink-0 border-t-[1.5pt] border-black mt-3 mb-1" />
                  ) : (
                    <div className="shrink-0 border-t-[1.5pt] border-black mt-auto" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};