import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  GripVertical, 
  ZoomIn, 
  ZoomOut, 
  ChevronDown,
  ChevronUp,
  ImagePlus
} from 'lucide-react';

interface HtmlNotesDraggableToolbarProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  isSelectRefiningModeEnabled?: boolean;
  onToggleSelectRefiningMode?: () => void;
  onTriggerInsertImage?: () => void;
  onInsertImageDirect?: (dataUrl: string, fileName?: string) => void;
  containerRef?: React.RefObject<HTMLElement | null>;
  viewMode?: 'split' | 'editor' | 'preview';
}

export const HtmlNotesDraggableToolbar: React.FC<HtmlNotesDraggableToolbarProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onTriggerInsertImage,
  containerRef,
  viewMode
}) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0
  });

  // Clamping and responsive observer: keeps the floating toolbar within view across preview and split modes
  useEffect(() => {
    const parent = containerRef?.current || toolbarRef.current?.parentElement;
    if (!parent) return;

    const clampWithinParent = () => {
      const parentRect = parent.getBoundingClientRect();
      if (!parentRect.width || !parentRect.height) return;

      const toolbarW = toolbarRef.current?.offsetWidth || 38;
      const toolbarH = toolbarRef.current?.offsetHeight || 180;

      setPosition((prev) => {
        if (!prev) return null; // keeps natural top-right alignment
        const maxX = Math.max(8, parentRect.width - toolbarW - 8);
        const maxY = Math.max(8, parentRect.height - toolbarH - 8);
        const clampedX = Math.max(8, Math.min(maxX, prev.x));
        const clampedY = Math.max(8, Math.min(maxY, prev.y));
        if (clampedX !== prev.x || clampedY !== prev.y) {
          return { x: clampedX, y: clampedY };
        }
        return prev;
      });
    };

    clampWithinParent();

    const ro = new ResizeObserver(() => {
      clampWithinParent();
    });
    ro.observe(parent);

    window.addEventListener('resize', clampWithinParent);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', clampWithinParent);
    };
  }, [containerRef, viewMode]);

  // Pointer drag handling with boundary clamping
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag when clicking the grip handle
    const target = e.target as HTMLElement;
    if (!target.closest('.toolbar-drag-handle')) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    const parent = containerRef?.current || toolbarRef.current?.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();

    const currentX = position?.x ?? (toolbarRect && parentRect ? Math.max(8, toolbarRect.left - parentRect.left) : (toolbarRef.current ? toolbarRef.current.offsetLeft : 16));
    const currentY = position?.y ?? (toolbarRect && parentRect ? Math.max(8, toolbarRect.top - parentRect.top) : (toolbarRef.current ? toolbarRef.current.offsetTop : 56));

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY
    };

    setIsDragging(true);
  }, [position, containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    const parent = containerRef?.current || toolbarRef.current?.parentElement;
    const parentWidth = parent ? parent.clientWidth : window.innerWidth;
    const parentHeight = parent ? parent.clientHeight : window.innerHeight;

    const toolbarW = toolbarRef.current?.offsetWidth || 38;
    const toolbarH = toolbarRef.current?.offsetHeight || 180;

    // Clamp coordinates within container bounds
    const nextX = Math.max(8, Math.min(parentWidth - toolbarW - 8, dragStartRef.current.posX + dx));
    const nextY = Math.max(8, Math.min(parentHeight - toolbarH - 8, dragStartRef.current.posY + dy));

    // Update position directly on the DOM node for 60fps butter-smooth drag
    if (toolbarRef.current) {
      toolbarRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    }
  }, [isDragging, containerRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const parent = containerRef?.current || toolbarRef.current?.parentElement;
    const parentWidth = parent ? parent.clientWidth : window.innerWidth;
    const parentHeight = parent ? parent.clientHeight : window.innerHeight;
    const toolbarW = toolbarRef.current?.offsetWidth || 38;
    const toolbarH = toolbarRef.current?.offsetHeight || 180;

    const finalX = Math.max(8, Math.min(parentWidth - toolbarW - 8, dragStartRef.current.posX + dx));
    const finalY = Math.max(8, Math.min(parentHeight - toolbarH - 8, dragStartRef.current.posY + dy));
    setPosition({ x: finalX, y: finalY });
  }, [isDragging, containerRef]);

  return (
    <div
      ref={toolbarRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: position ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined,
        top: position ? 0 : '3.5rem',
        left: position ? 0 : undefined,
        right: position ? undefined : '1rem',
        touchAction: 'none',
        willChange: 'transform'
      }}
      className={`absolute z-40 flex flex-col items-center gap-1 p-1 rounded-full bg-white/98 dark:bg-[#18191c]/98 shadow-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 select-none ${
        isDragging
          ? 'shadow-2xl cursor-grabbing ring-2 ring-blue-500/50 transition-none'
          : 'transition-shadow duration-100'
      }`}
    >
      {/* 1. Drag Grip Handle */}
      <div 
        className="toolbar-drag-handle w-7 h-5 flex items-center justify-center cursor-grab hover:bg-slate-100 dark:hover:bg-zinc-800/80 rounded-full text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
        title="Drag tool dock to move anywhere"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Dock Expand / Collapse Toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsCollapsed(prev => !prev);
        }}
        className="w-7 h-5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer text-slate-500 dark:text-zinc-400 transition-colors"
        title={isCollapsed ? "Expand Toolbar Dock" : "Collapse Toolbar Dock"}
      >
        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {/* Expanded Tools Container */}
      {!isCollapsed && (
        <>
          <div className="w-5 h-[1px] bg-slate-200 dark:bg-zinc-700/80 my-0.5" />

          {/* Zoom In Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomIn();
            }}
            className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* 5. Zoom Percentage / Reset Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomReset();
            }}
            className="px-0.5 py-0.5 font-bold text-[9px] tracking-tight hover:text-blue-600 dark:hover:text-blue-400 bg-transparent border-0 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            title="Reset Zoom (Fit to Screen)"
          >
            {zoomLevel}%
          </button>

          {/* 6. Zoom Out Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomOut();
            }}
            className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Insert Image Button */}
          {onTriggerInsertImage && (
            <>
              <div className="w-5 h-[1px] bg-slate-200 dark:bg-zinc-700/80 my-0.5" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerInsertImage();
                }}
                className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer text-[#0b57d0] dark:text-[#a8c7fa] transition-colors"
                title="Insert Image (Upload, Web URL, or Stock Photos)"
              >
                <ImagePlus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};
