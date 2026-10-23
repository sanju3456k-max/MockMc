import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MoveHorizontal, 
  Image as ImageIcon, 
  Trash2,
  Crop as CropIcon
} from 'lucide-react';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { DiagramCropModal } from './DiagramCropModal';

interface EditorDiagramResizableProps {
  imageUrl: string;
  alt?: string;
  width?: number;
  onChangeWidth: (width: number | undefined) => void;
  onChangeDiagram: () => void;
  onRemoveDiagram: () => void;
  onApplyCrop?: (croppedDataUrl: string) => void;
}

export const EditorDiagramResizable: React.FC<EditorDiagramResizableProps> = ({
  imageUrl,
  alt = 'Question Diagram',
  width,
  onChangeWidth,
  onChangeDiagram,
  onRemoveDiagram,
  onApplyCrop,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [localWidth, setLocalWidth] = useState<number | undefined>(width);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(width || 360);
  const currentDragWidthRef = useRef<number>(width || 360);
  const rafIdRef = useRef<number | null>(null);

  // Sync external width prop
  useEffect(() => {
    setLocalWidth(width);
    if (containerRef.current && width !== undefined) {
      containerRef.current.style.width = `${width}px`;
    }
  }, [width]);

  // High performance pointer drag to resize using pointer capture & requestAnimationFrame
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails in special environments
    }

    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    const currentRenderedWidth = containerRef.current?.offsetWidth || width || 360;
    startWidthRef.current = currentRenderedWidth;
    currentDragWidthRef.current = currentRenderedWidth;

    if (tooltipRef.current) {
      tooltipRef.current.innerText = `${currentRenderedWidth}px`;
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - dragStartXRef.current;
      const newWidth = Math.max(120, Math.min(840, Math.round(startWidthRef.current + deltaX)));
      currentDragWidthRef.current = newWidth;

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.width = `${newWidth}px`;
        }
        if (tooltipRef.current) {
          tooltipRef.current.innerText = `${newWidth}px`;
        }
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {
        // Ignore
      }

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      setIsDragging(false);

      const deltaX = upEvent.clientX - dragStartXRef.current;
      const finalWidth = Math.max(120, Math.min(840, Math.round(startWidthRef.current + deltaX)));
      setLocalWidth(finalWidth);
      onChangeWidth(finalWidth);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [width, onChangeWidth]);

  const activeWidth = localWidth ?? width;

  return (
    <div className="mt-3 w-full flex flex-col items-center">
      {/* Resizable image container without card borders */}
      <div 
        ref={containerRef}
        className="relative group flex items-center justify-center max-w-full transition-none will-change-[width]"
        style={{ width: activeWidth ? `${activeWidth}px` : undefined }}
      >
        {/* The clean image - clicks open the zoom pop-up */}
        <QuestionDiagramViewer
          imageUrl={imageUrl}
          alt={alt}
          width={activeWidth}
          allowZoom={!isDragging}
          className="my-0! select-none pointer-events-auto"
        />

        {/* Interactive Drag-to-Resize Handle at Right Edge */}
        <div
          onPointerDown={handlePointerDown}
          style={{ touchAction: 'none' }}
          className={`absolute -right-3.5 top-1/2 -translate-y-1/2 z-20 w-7 h-14 flex items-center justify-center rounded-full bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-300/90 dark:border-zinc-600 shadow-md cursor-ew-resize select-none transition-all active:scale-105 ${
            isDragging 
              ? 'opacity-100 ring-2 ring-[#0084ff] bg-[#0084ff] text-white' 
              : 'opacity-85 hover:opacity-100 hover:ring-2 hover:ring-[#0084ff]/50'
          }`}
          title="Drag horizontally to smoothly resize image width"
        >
          <MoveHorizontal className={`w-4 h-4 ${isDragging ? 'text-white' : 'text-slate-700 dark:text-zinc-200'}`} />
        </div>

        {/* Live Smooth Dragging Tooltip */}
        <div 
          ref={tooltipRef}
          className={`absolute -top-8 px-3 py-1 rounded-full bg-slate-900 text-white text-[11px] font-mono font-bold shadow-xl pointer-events-none z-30 transition-opacity duration-100 ${
            isDragging ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {activeWidth || 360}px
        </div>
      </div>

      {/* Editor Resizing & Diagram Controls Bar */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {/* Quick Size Presets: Original, Small, Medium, Large */}
        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-[#252834] p-1 rounded-full border border-slate-200/90 dark:border-zinc-700/60 shadow-2xs text-[11px] font-bold select-none">
          <button
            type="button"
            onClick={() => {
              setLocalWidth(undefined);
              if (containerRef.current) containerRef.current.style.width = '';
              onChangeWidth(undefined);
            }}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              !activeWidth
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
            title="Show diagram in original natural dimensions"
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalWidth(180);
              if (containerRef.current) containerRef.current.style.width = '180px';
              onChangeWidth(180);
            }}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              activeWidth === 180
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
            title="Small size (180px)"
          >
            Small
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalWidth(320);
              if (containerRef.current) containerRef.current.style.width = '320px';
              onChangeWidth(320);
            }}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              activeWidth === 320
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
            title="Medium size (320px)"
          >
            Medium
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalWidth(480);
              if (containerRef.current) containerRef.current.style.width = '480px';
              onChangeWidth(480);
            }}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              activeWidth === 480
                ? 'bg-[#0084ff] text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
            title="Large size (480px)"
          >
            Large
          </button>
        </div>

        {/* Crop Diagram Button */}
        <button
          type="button"
          onClick={() => setIsCropOpen(true)}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#222634] hover:bg-slate-200 dark:hover:bg-[#353948] text-slate-700 dark:text-zinc-200 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          title="Crop, trim margins, or rotate diagram"
        >
          <CropIcon className="w-3.5 h-3.5 text-[#0084ff]" />
          <span>Crop</span>
        </button>

        {/* Change Diagram Button */}
        <button
          type="button"
          onClick={onChangeDiagram}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#222634] hover:bg-slate-200 dark:hover:bg-[#353948] text-slate-700 dark:text-zinc-200 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          title="Change diagram preset or upload new"
        >
          <ImageIcon className="w-3.5 h-3.5 text-[#0084ff]" />
          <span>Change</span>
        </button>

        {/* Remove Diagram Button */}
        <button
          type="button"
          onClick={onRemoveDiagram}
          className="text-xs px-2.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
          title="Remove diagram from question"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove</span>
        </button>
      </div>

      {/* Interactive Crop Modal */}
      {isCropOpen && (
        <DiagramCropModal
          isOpen={isCropOpen}
          imageUrl={imageUrl}
          onClose={() => setIsCropOpen(false)}
          onApplyCrop={(croppedUrl) => {
            if (onApplyCrop) {
              onApplyCrop(croppedUrl);
            } else {
              onChangeDiagram(); // Fallback if no crop handler provided
            }
            setIsCropOpen(false);
          }}
        />
      )}
    </div>
  );
};
