import React, { useState, useRef, useLayoutEffect } from 'react';
import { 
  FileCheck2, 
  Printer, 
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type { MathTest } from '../types';
import { 
  exportOmrSheetToPng, 
  triggerOmrSheetPrint 
} from '../lib/omrPrintDownload';
import { OMR_GEOMETRY, generateOmrSheetBlueprint } from '../lib/omrGeometry';
import { APP_STYLES } from './ui/AppStyles';

interface OmrSheetGeneratorProps {
  test?: MathTest;
  questionCount?: number;
  title?: string;
  topic?: string;
  className?: string;
  hideHeaderContainer?: boolean;
}

export const OmrSheetGenerator: React.FC<OmrSheetGeneratorProps> = ({
  test,
  questionCount,
  title,
  topic,
  className = '',
  hideHeaderContainer = false,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isGeneratingPng, setIsGeneratingPng] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [sheetFormat, setSheetFormat] = useState<'a4' | 'compact'>('a4');

  const totalQs = Math.max(1, questionCount || test?.questions?.length || 50);
  const sheetTitle = title !== undefined ? title : (test?.title || 'OMR RESPONSE ANSWER SHEET');
  const sheetTopic = topic !== undefined ? topic : (test?.topic || 'Standard Assessment');
  const timeAllowed = test?.timeLimitMinutes && test.timeLimitMinutes > 0 ? test.timeLimitMinutes : (test?.time && test.time > 0 ? test.time : (totalQs || 60));
  const maxMarks = test?.questions?.length ? (test.questions || []).reduce((sum, q) => sum + (q.points || 1), 0) : (test?.totalMarks || totalQs);
  const cleanTitle = (sheetTitle || 'OMR_Sheet').replace(/[^a-zA-Z0-9_-]/g, '_');

  const blueprint = generateOmrSheetBlueprint(totalQs, undefined, sheetFormat);
  const layout = blueprint.layout;
  const columnCount = layout.columnCount;
  const questionsPerCol = layout.questionsPerColumn;
  const columnConfig = blueprint.columnConfig;

  const MM_TO_PX = 96 / 25.4;
  const pageWPx = (layout.pageWidthMm || 210) * MM_TO_PX;
  const pageHPx = (layout.pageHeightMm || 297) * MM_TO_PX;

  const containerRef = useRef<HTMLDivElement>(null);
  const [userZoom, setUserZoom] = useState<number>(1.0);
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const padding = window.innerWidth < 640 ? 24 : 32;
      const availableW = Math.max(200, Math.min(1400, window.innerWidth - padding));
      const targetW = (layout.pageWidthMm || 210) * (96 / 25.4);
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
  }, [layout.pageWidthMm, pageWPx]);

  const handlePrint = async () => {
    try {
      setDownloadError(null);
      setIsPrinting(true);
      await triggerOmrSheetPrint(totalQs, sheetTitle || test.title || '', sheetFormat);
      setDownloadSuccess('Printer interface opened! Choose "Save as PDF" or select physical printer.');
      setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error initiating print:', err);
      setDownloadError('Could not open printer interface. Please try again.');
      setTimeout(() => setDownloadError(null), 5000);
    } finally {
      setTimeout(() => setIsPrinting(false), 1200);
    }
  };

  const handleDownloadPng = async () => {
    try {
      setDownloadError(null);
      setIsGeneratingPng(true);
      await exportOmrSheetToPng(
        totalQs,
        sheetTitle || test.title || '',
        `${cleanTitle}_OMR_Sheet_${sheetFormat === 'a4' ? 'A4_210x297mm' : Math.round(layout.pageHeightMm) + 'mm'}.png`,
        sheetFormat
      );
      setDownloadSuccess('OMR Sheet PNG image downloaded successfully!');
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error downloading OMR sheet PNG:', err);
      setDownloadError(err?.message || 'Download failed. Please try again.');
      setTimeout(() => setDownloadError(null), 5000);
    } finally {
      setIsGeneratingPng(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Container: Test Details, Title, Portion, Time, Marks, and Contextual Buttons */}
      {!hideHeaderContainer && (
        <div className={`${APP_STYLES.card.base} p-4 sm:p-5 space-y-3.5 print:hidden`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/60">
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase font-mono block">
                OMR Answer Sheet
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate mt-0.5">
                {sheetTitle || 'OMR Bubble Sheet'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate">
                Portion: {sheetTopic || 'Mathematics Assessment'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
              <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                {maxMarks} Marks
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                {timeAllowed} Mins
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300">
                {totalQs} Questions
              </span>
            </div>
          </div>

          {/* Action Controls for OMR Sheet: Print Option & Download Image (PNG) */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Real-time OMR layout dimensions */}
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 text-xs font-bold border-0 ring-0 shadow-none select-none">
                  <span>Standard A4 Width: 210 mm</span>
                  <span className="text-slate-400 font-normal">•</span>
                  <span>Variable height for {totalQs} Qs ({Math.round(layout.pageHeightMm)} mm)</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Print Option Button (Opens Native Print / Save as PDF dialog) */}
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={isPrinting || isGeneratingPng}
                    className={`${APP_STYLES.button.primary} !bg-[#0b57d0] !border-[#0b57d0] !hover:bg-[#0842a0] dark:!bg-[#a8c7fa] dark:!text-[#041e49] dark:!border-[#a8c7fa]`}
                    title="Open default printer interface to print or save as PDF"
                  >
                    {isPrinting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    <span>{isPrinting ? 'Opening Printer...' : 'Print Option'}</span>
                  </button>

                  {/* Download Image Button (PNG) */}
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    disabled={isPrinting || isGeneratingPng}
                    className={`${APP_STYLES.button.primary} !bg-emerald-600 !border-emerald-600 !hover:bg-emerald-500`}
                    title="Export high-resolution OMR PNG image"
                  >
                    {isGeneratingPng ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    <span>{isGeneratingPng ? 'Exporting...' : 'Download Image'}</span>
                  </button>
                </div>
              </div>

              {downloadSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="flex-1 font-medium">{downloadSuccess}</span>
                </div>
              )}

              {downloadError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span className="flex-1">{downloadError}</span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Static Full-View Viewport for OMR Sheet fitted to dimension */}
      <div 
        ref={containerRef}
        className="w-full max-w-[1400px] mx-auto relative flex flex-col items-center justify-start pb-12 pt-4"
      >
        <div 
          className="relative mx-auto shrink-0"
          style={{
            width: `${pageWPx * scale}px`,
            height: `${pageHPx * scale}px`,
            maxWidth: '100%',
            transition: 'none',
          }}
        >
          <div
            id="omr-printable-sheet"
            data-total-questions={totalQs}
            data-exam-title={sheetTitle || test.title || ''}
            className="a4-page-item bg-white text-black shadow-2xl ring-1 ring-slate-900/10 select-none box-border rounded-xs"
            style={{
              width: `${layout.pageWidthMm}mm`,
              minWidth: `${layout.pageWidthMm}mm`,
              maxWidth: `${layout.pageWidthMm}mm`,
              height: `${layout.pageHeightMm}mm`,
              minHeight: `${layout.pageHeightMm}mm`,
              maxHeight: `${layout.pageHeightMm}mm`,
              boxSizing: 'border-box',
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              backgroundColor: '#ffffff',
              color: '#000000',
              overflow: 'hidden',
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              transition: 'none',
            }}
          >
            <div className="absolute inset-0 border-[1.5px] border-dashed border-neutral-800 pointer-events-none" />

            {/* 4 Corner Registration Fiducial Boxes */}
            {[
              blueprint.fiducials.topLeft,
              blueprint.fiducials.topRight,
              blueprint.fiducials.bottomLeft,
              blueprint.fiducials.bottomRight,
            ].map((f, i) => (
              <div
                key={`fiducial_${i}`}
                className="absolute border-[1.6px] border-black bg-white select-none pointer-events-none"
                style={{
                  top: `${f.y - OMR_GEOMETRY.fiducialSizeMm / 2}mm`,
                  left: `${f.x - OMR_GEOMETRY.fiducialSizeMm / 2}mm`,
                  width: `${OMR_GEOMETRY.fiducialSizeMm}mm`,
                  height: `${OMR_GEOMETRY.fiducialSizeMm}mm`,
                }}
              />
            ))}

            <div 
              className="absolute text-center border-b-2 border-black flex flex-col justify-center items-center select-none"
              style={{ 
                top: `${OMR_GEOMETRY.pagePaddingTopMm}mm`,
                left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                height: `${OMR_GEOMETRY.headerHeightMm}mm`, 
              }}
            >
              <div className="text-[11.5pt] font-semibold uppercase tracking-wider text-black leading-tight">
                OMR RESPONSE ANSWER SHEET
              </div>
              {(!sheetTitle || sheetTitle.toUpperCase().includes('UNIVERSAL') || sheetTitle.trim() === '' || sheetTitle.includes('_____') || sheetTitle.includes('-----')) ? (
                <div className="text-[8.5pt] font-bold text-black leading-tight mt-1 w-full flex items-end px-2">
                  <span className="shrink-0 text-[8.5pt] font-semibold pb-0.5">Test Name / Subject:</span>
                  <span className="flex-1 ml-2 border-b border-dashed border-black h-3.5 mb-0.5" />
                </div>
              ) : (
                <div className="text-[8.5pt] font-bold text-black uppercase leading-tight mt-1 truncate px-2">
                  {sheetTitle}
                </div>
              )}
            </div>

            <div 
              className="absolute grid grid-cols-2 gap-4 text-[8pt] border-b border-black text-black items-center select-none px-1"
              style={{ 
                top: `${OMR_GEOMETRY.pagePaddingTopMm + OMR_GEOMETRY.headerHeightMm + OMR_GEOMETRY.headerMarginBottomMm}mm`,
                left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                height: `${OMR_GEOMETRY.candidateBoxHeightMm}mm`, 
              }}
            >
              <div className="truncate">
                <strong>Candidate Name:</strong> ____________________________________
              </div>
              <div className="truncate">
                <strong>Roll No:</strong> ____________________________________
              </div>
            </div>

            <div 
              className="absolute text-[7.2pt] text-black flex items-center justify-between border-b border-black select-none px-1"
              style={{ 
                top: `${OMR_GEOMETRY.pagePaddingTopMm + OMR_GEOMETRY.headerHeightMm + OMR_GEOMETRY.headerMarginBottomMm + OMR_GEOMETRY.candidateBoxHeightMm + OMR_GEOMETRY.candidateMarginBottomMm}mm`,
                left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                height: `${OMR_GEOMETRY.instructionsHeightMm}mm`, 
              }}
            >
              <div>
                <strong>INSTRUCTIONS:</strong> Completely darken only one bubble per question with a black/blue ballpoint pen.
              </div>
              <div className="flex items-center gap-2 font-medium text-[7.2pt]">
                <span>Correct: <span className="font-bold">●</span></span>
                <span>Incorrect: <span>○</span> <span>✓</span> <span>✗</span></span>
              </div>
            </div>

            {Array.from({ length: columnCount }).map((_, colIdx) => {
              const colLeftMm = OMR_GEOMETRY.pagePaddingLeftMm + columnConfig.gridMarginXMm + colIdx * (columnConfig.columnWidthMm + columnConfig.columnGapMm);
              const headerTopMm = OMR_GEOMETRY.row0TopMm - OMR_GEOMETRY.columnHeaderMarginBottomMm - OMR_GEOMETRY.columnHeaderHeightMm;
              const options = ['A', 'B', 'C', 'D'];

              return (
                <div
                  key={`col_header_${colIdx}`}
                  className="absolute border-b border-black text-black select-none"
                  style={{
                    top: `${headerTopMm}mm`,
                    left: `${colLeftMm}mm`,
                    width: `${columnConfig.columnWidthMm}mm`,
                    height: `${OMR_GEOMETRY.columnHeaderHeightMm}mm`,
                  }}
                >
                  <span 
                    className="absolute text-right font-sans font-bold text-[7.5pt] text-black pr-1 flex items-center justify-end"
                    style={{ 
                      left: '0mm', 
                      top: '0mm', 
                      width: `${columnConfig.qNumWidthMm}mm`, 
                      height: `${OMR_GEOMETRY.columnHeaderHeightMm}mm` 
                    }}
                  >
                    Q.
                  </span>

                  {options.map((opt, optIdx) => {
                    const optCenterXMm = columnConfig.optionOffsetsMm[optIdx];
                    return (
                      <span 
                        key={opt} 
                        className="absolute text-center font-sans font-bold text-[7.5pt] text-black flex items-center justify-center"
                        style={{ 
                          left: `${optCenterXMm - OMR_GEOMETRY.bubbleRadiusMm}mm`,
                          top: '0mm',
                          width: `${OMR_GEOMETRY.bubbleDiameterMm}mm`,
                          height: `${OMR_GEOMETRY.columnHeaderHeightMm}mm`,
                        }}
                      >
                        {opt}
                      </span>
                    );
                  })}
                </div>
              );
            })}

            {Array.from({ length: totalQs }).map((_, qIdx) => {
              const colIdx = Math.min(columnCount - 1, Math.floor(qIdx / questionsPerCol));
              const rowIdx = qIdx % questionsPerCol;
              const colLeftMm = OMR_GEOMETRY.pagePaddingLeftMm + columnConfig.gridMarginXMm + colIdx * (columnConfig.columnWidthMm + columnConfig.columnGapMm);
              const rowTopMm = OMR_GEOMETRY.row0TopMm + rowIdx * OMR_GEOMETRY.rowHeightMm;

              return (
                <div
                  key={`q_num_${qIdx + 1}`}
                  className="absolute text-right font-sans font-bold text-black text-[7.5pt] pr-1 flex items-center justify-end select-none"
                  style={{
                    top: `${rowTopMm}mm`,
                    left: `${colLeftMm}mm`,
                    width: `${columnConfig.qNumWidthMm}mm`,
                    height: `${OMR_GEOMETRY.rowHeightMm}mm`,
                  }}
                >
                  {qIdx + 1}
                </div>
              );
            })}

            {blueprint.bubbleRecords.map((record) => (
              <div
                key={`bubble_${record.questionIndex}_${record.optionIndex}`}
                className="absolute rounded-full border-[1.4px] border-black bg-white select-none shrink-0"
                style={{
                  top: `${record.physYMm - OMR_GEOMETRY.bubbleRadiusMm}mm`,
                  left: `${record.physXMm - OMR_GEOMETRY.bubbleRadiusMm}mm`,
                  width: `${OMR_GEOMETRY.bubbleDiameterMm}mm`,
                  height: `${OMR_GEOMETRY.bubbleDiameterMm}mm`,
                }}
                aria-label={`Question ${record.questionNumber} Option ${record.optionLetter}`}
              />
            ))}

            {/* If Full ISO A4 (210 x 297 mm), render the dedicated lower sections */}
            {layout.isFullA4 && (
              <>
                {/* Bottom Section Divider Line */}
                <div
                  className="absolute border-b border-black select-none pointer-events-none"
                  style={{
                    top: `${Math.max(layout.gridBottomMm + 6, 175)}mm`,
                    left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                    width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                  }}
                />

                {/* Candidate & Invigilator Signatures */}
                <div
                  className="absolute grid grid-cols-2 gap-4 text-black select-none"
                  style={{
                    top: `${Math.max(layout.gridBottomMm + 10, 179)}mm`,
                    left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                    width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                    height: '22mm',
                  }}
                >
                  <div className="border border-black p-1.5 flex flex-col justify-between">
                    <span className="text-[7pt] font-bold uppercase tracking-wider">Candidate Signature</span>
                    <span className="text-[6.5pt] text-neutral-500 italic">Sign within the box in presence of Invigilator</span>
                  </div>
                  <div className="border border-black p-1.5 flex flex-col justify-between">
                    <span className="text-[7pt] font-bold uppercase tracking-wider">Invigilator Signature & Stamp</span>
                    <span className="text-[6.5pt] text-neutral-500 italic">Certified that candidate verified and bubbles checked</span>
                  </div>
                </div>

                {/* Space for Rough Work / Calculations */}
                <div
                  className="absolute border border-black p-2 text-black select-none"
                  style={{
                    top: `${Math.max(layout.gridBottomMm + 35, 205)}mm`,
                    left: `${OMR_GEOMETRY.pagePaddingLeftMm}mm`,
                    width: `${OMR_GEOMETRY.usableWidthMm}mm`,
                    height: '46mm',
                  }}
                >
                  <span className="text-[7pt] font-bold uppercase tracking-wider text-neutral-700">Rough Work / Calculations Area</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};