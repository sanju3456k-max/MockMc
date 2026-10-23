import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X, Download, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { normalizeDiagramUrl } from '../lib/diagramPresets';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { APP_STYLES } from './ui/AppStyles';

interface QuestionDiagramViewerProps {
  imageUrl?: string;
  imageUrls?: string[];
  imageWidths?: (number | undefined)[];
  alt?: string;
  caption?: string;
  className?: string;
  maxHeightClass?: string;
  width?: number | string;
  allowZoom?: boolean;
  showSizeControls?: boolean;
  onUpdateWidth?: (photoIndex: number, newWidth: number | undefined) => void;
}

export const QuestionDiagramViewer: React.FC<QuestionDiagramViewerProps> = ({
  imageUrl,
  imageUrls,
  imageWidths,
  alt = 'Question Diagram',
  caption,
  className = '',
  maxHeightClass = 'max-h-72',
  width,
  allowZoom = true,
  showSizeControls = false,
  onUpdateWidth,
}) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const lightboxContainerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  useEffect(() => { panRef.current = pan; }, [pan]);
  const zoomRef = useRef(zoomLevel);
  useEffect(() => { zoomRef.current = zoomLevel; }, [zoomLevel]);
  const isDraggingRef = useRef(isDragging);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchStartDistRef = useRef(0);
  const touchStartZoomRef = useRef(1);

  const handleCloseLightbox = useCallback(() => {
    setLightboxUrl(null);
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Lock background scroll when diagram lightbox is open
  useScrollLock(!!lightboxUrl);

  // Capture back navigation / escape key to close lightbox rather than exiting the screen
  useBackHandler({
    isOpen: !!lightboxUrl,
    onBack: handleCloseLightbox,
    priority: 50,
    id: 'diagram_lightbox_modal',
  });

  // Reset zoom & pan when opening a new diagram or closing
  useEffect(() => {
    if (!lightboxUrl) {
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
      setIsFullscreen(false);
    }
  }, [lightboxUrl]);

  // Touch gesture and wheel zoom event listeners for lightbox
  useEffect(() => {
    const el = lightboxContainerRef.current;
    if (!el || !lightboxUrl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStartZoomRef.current = zoomRef.current;
      } else if (e.touches.length === 1 && zoomRef.current > 1.05) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - panRef.current.x,
          y: e.touches[0].clientY - panRef.current.y,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDistRef.current > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const factor = dist / touchStartDistRef.current;
        const nextZoom = Math.min(Math.max(Number((touchStartZoomRef.current * factor).toFixed(2)), 0.5), 3.5);
        setZoomLevel(nextZoom);
      } else if (e.touches.length === 1 && isDraggingRef.current) {
        e.preventDefault();
        setPan({
          x: e.touches[0].clientX - dragStartRef.current.x,
          y: e.touches[0].clientY - dragStartRef.current.y,
        });
      }
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      touchStartDistRef.current = 0;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoomLevel((prev) => {
        const next = Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.5), 3.5);
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [lightboxUrl]);

  // Ensure fullscreen is cleaned up on unmount
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  // Reset errors on imageUrl/imageUrls updates
  useEffect(() => {
    setFailedUrls({});
  }, [imageUrl, imageUrls]);

  useEffect(() => {
    if (!lightboxUrl) {
      setZoomLevel(1);
      setIsFullscreen(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseLightbox();
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((prev) => Math.min(prev + 0.25, 3));
      } else if (e.key === '-') {
        setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === '0') {
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxUrl, handleCloseLightbox]);

  // Combine legacy and multiple diagram sources
  const diagrams: { 
    url: string; 
    width?: number | string; 
    normUrl: string;
    photoIndex: number;
  }[] = [];
  
  if (imageUrl) {
    const norm = normalizeDiagramUrl(imageUrl);
    if (norm) {
      diagrams.push({ 
        url: imageUrl, 
        width, 
        normUrl: norm,
        photoIndex: 0,
      });
    }
  }

  if (Array.isArray(imageUrls)) {
    imageUrls.forEach((url, i) => {
      if (url) {
        const norm = normalizeDiagramUrl(url);
        if (norm) {
          const photoIndex = imageUrl ? i + 1 : i;
          diagrams.push({ 
            url, 
            width: imageWidths?.[i], 
            normUrl: norm,
            photoIndex,
          });
        }
      }
    });
  }

  if (diagrams.length === 0) return null;

  const isMulti = diagrams.length > 1;

  return (
    <>
      <div className={`${APP_STYLES.viewers.container} ${className}`}>
        <div
          className={
            !isMulti
              ? "w-full flex flex-col items-center"
              : "w-full flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-3.5 sm:gap-6"
          }
        >
          {diagrams.map((diag, index) => {
            const isFailed = failedUrls[diag.normUrl];
            const resolvedWidthStyle = diag.width
              ? typeof diag.width === 'number'
                ? `${diag.width}px`
                : diag.width
              : undefined;

            const itemResponsiveClass = resolvedWidthStyle
              ? ''
              : diagrams.length === 2
              ? 'sm:max-w-[48%] sm:flex-1 sm:min-w-[220px]'
              : 'sm:max-w-[48%] lg:max-w-[31.5%] sm:flex-1 sm:min-w-[180px]';

            const numericWidth = typeof diag.width === 'number'
              ? diag.width
              : (typeof diag.width === 'string' && /^\d+/.test(diag.width)
                  ? parseInt(diag.width, 10)
                  : undefined);

            return (
              <div
                key={index}
                style={{
                  width: resolvedWidthStyle || undefined,
                  maxWidth: resolvedWidthStyle ? resolvedWidthStyle : undefined,
                }}
                className={`w-full ${isMulti ? itemResponsiveClass : ''} flex flex-col items-center shrink-0`}
              >
                {isFailed ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs w-full max-w-md">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Unable to render diagram {diagrams.length > 1 ? index + 1 : ''}. Please check the image source.</span>
                  </div>
                ) : (
                  <div className="relative group w-full flex flex-col items-center">
                    <div
                      onClick={() => {
                        if (allowZoom) setLightboxUrl(diag.normUrl);
                      }}
                      className={`inline-flex items-center justify-center max-w-full relative ${
                        allowZoom ? 'cursor-zoom-in' : ''
                      }`}
                      title={allowZoom ? `Click to zoom diagram ${diagrams.length > 1 ? index + 1 : ''}` : undefined}
                    >
                      <img
                        src={diag.normUrl}
                        alt={`${alt} ${diagrams.length > 1 ? index + 1 : ''}`}
                        style={{
                          width: resolvedWidthStyle,
                          maxWidth: '100%',
                        }}
                        className={`${resolvedWidthStyle ? '' : maxHeightClass} h-auto max-w-full object-contain mx-auto block select-none`}
                        loading="eager"
                        onError={() => setFailedUrls((prev) => ({ ...prev, [diag.normUrl]: true }))}
                      />
                    </div>

                    {/* Individual Diagram Size Controls (Auto | 140 | 200 | 280) */}
                    {showSizeControls && onUpdateWidth && (
                      <div className="print:hidden mt-1 opacity-80 group-hover:opacity-100 hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs px-1.5 py-0.5 rounded-full border border-slate-300 dark:border-zinc-700 shadow-2xs text-[9px] select-none z-10 pointer-events-auto">
                        <span className="font-bold text-slate-500 dark:text-zinc-400 mr-0.5 text-[8.5px]">
                          Size:
                        </span>
                        {[
                          { label: 'Auto', val: undefined },
                          { label: '140', val: 140 },
                          { label: '200', val: 200 },
                          { label: '280', val: 280 },
                        ].map((opt) => {
                          const active = numericWidth !== undefined
                            ? numericWidth === opt.val
                            : (opt.val === undefined && (!diag.width || diag.width === 'auto'));
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateWidth(diag.photoIndex, opt.val);
                              }}
                              className={`px-1.5 py-0.2 rounded-full font-bold transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#0084ff] text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-800'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {caption && (
          <p className={APP_STYLES.widgets.caption}>
            {caption}
          </p>
        )}
      </div>

      {/* Interactive Lightbox Modal */}
      {lightboxUrl && (
        <div
          className={APP_STYLES.viewers.lightboxOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxUrl(null);
          }}
        >
          {/* Top Floating Control Bar */}
          <div className={APP_STYLES.viewers.lightboxToolbar}>
            <span className="text-xs font-bold truncate text-zinc-200 pl-1">{alt}</span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.5))}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono w-12 text-center text-zinc-300">
                {Math.round(zoomLevel * 100)}%
              </span>

              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoomLevel(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer ml-1"
                title="Reset Zoom (0)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                    setIsFullscreen(true);
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                    setIsFullscreen(false);
                  }
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <a
                href={lightboxUrl}
                download="diagram.svg"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Open or Save Original Diagram"
              >
                <Download className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={handleCloseLightbox}
                className="w-8 h-8 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer ml-2"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Diagram Canvas Container */}
          <div
            ref={lightboxContainerRef}
            className={`w-full h-full max-w-5xl flex items-center justify-center overflow-hidden p-4 pt-16 select-none ${
              zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseLightbox();
            }}
            onMouseDown={(e) => {
              if (zoomLevel > 1 && e.button === 0) {
                setIsDragging(true);
                dragStartRef.current = {
                  x: e.clientX - pan.x,
                  y: e.clientY - pan.y,
                };
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && zoomLevel > 1) {
                setPan({
                  x: e.clientX - dragStartRef.current.x,
                  y: e.clientY - dragStartRef.current.y,
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomLevel})`,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (zoomLevel > 1.05) {
                  setZoomLevel(1);
                  setPan({ x: 0, y: 0 });
                } else {
                  setZoomLevel(2);
                }
              }}
              className="transition-transform duration-100 ease-out origin-center inline-flex items-center justify-center max-w-full max-h-full rounded-2xl bg-white p-4 shadow-2xl border border-white/20 min-w-[300px] min-h-[200px]"
            >
              {lightboxUrl && lightboxUrl.trim() ? (
                <img
                  src={lightboxUrl}
                  alt={alt}
                  className="max-h-[75vh] max-w-[88vw] sm:max-w-[78vw] w-auto h-auto min-w-[260px] min-h-[160px] object-contain select-none pointer-events-none"
                  draggable={false}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
