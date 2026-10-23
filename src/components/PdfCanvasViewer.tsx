import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  X,
  Maximize2,
  RefreshCw,
  FileText,
  AlertTriangle,
  Hand,
} from 'lucide-react';
import { APP_STYLES } from './ui/AppStyles';

// Set up worker CDN URL compatible with pdfjs-dist version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

interface PdfCanvasViewerProps {
  url: string;
  fileName?: string;
  onClose?: () => void;
  hideTopToolbar?: boolean;
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  url,
  fileName,
  onClose,
  hideTopToolbar = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(0.8); // Fit scale loaded dynamically
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [pageHeight, setPageHeight] = useState<number>(0);

  // Compute PDF File Size if it is base64 Data URI
  const pdfSizeStr = useMemo(() => {
    if (!url || !url.startsWith('data:')) return '';
    try {
      const base64Str = url.split(',')[1] || '';
      const bytes = Math.round((base64Str.length * 3) / 4);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch (e) {
      return '';
    }
  }, [url]);

  // Drag / Hand Pan State (Always enabled by default, no toggle needed)
  const isPanMode = true;
  const [zoom, setZoom] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load PDF Document from base64 or URL
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      // Guard against empty, null, or whitespace URL parameters
      if (!url || typeof url !== 'string' || !url.trim()) {
        if (!isCancelled) {
          setError('No valid PDF document source provided.');
          setLoading(false);
        }
        return;
      }

      const cleanUrl = url.trim();

      try {
        let loadingTask: any;
        if (cleanUrl.startsWith('data:application/pdf') || cleanUrl.startsWith('data:')) {
          const base64Str = cleanUrl.includes(',') ? cleanUrl.split(',')[1] : cleanUrl;
          const binaryStr = atob(base64Str);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } else {
          loadingTask = pdfjsLib.getDocument({ url: cleanUrl });
        }

        const pdf = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setPageNum(1);

          // Auto-calculate scale to fit full page in single screen view
          try {
            const firstPage = await pdf.getPage(1);
            const unscaledViewport = firstPage.getViewport({ scale: 1 });
            const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 600;
            const containerHeight = (containerRef.current?.clientHeight || window.innerHeight || 800) - 100;

            const widthScale = (containerWidth - 32) / unscaledViewport.width;
            const heightScale = containerHeight / unscaledViewport.height;
            const autoScale = Math.min(widthScale, heightScale, 0.82); // Cap at 82% max so full page wraps cleanly
            setFitScale(Math.max(0.35, Number(autoScale.toFixed(2))));
          } catch (fitErr) {
            setFitScale(0.8);
          }

          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('PDF.js loading error:', err);
          setError(err?.message || 'Failed to parse PDF document.');
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [url]);

  // Active render task ref to prevent canvas overlap
  const activeRenderTaskRef = useRef<any>(null);

  // Render Current Page to Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let isCancelled = false;

    const renderPage = async () => {
      // Cancel any ongoing render task and wait for it to release the canvas
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
          await activeRenderTaskRef.current.promise;
        } catch {
          // Ignore cancellation errors
        }
      }

      if (isCancelled) return;

      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // layoutViewport defines the unzoomed, fit-to-screen layout size of the page
        const layoutViewport = page.getViewport({ scale: fitScale, rotation });
        
        // High-DPI crisp scale (at least 2x or screen resolution)
        const outputScale = Math.max(window.devicePixelRatio || 1, 2);
        
        // Ensure canvas dimensions match high-DPI resolution
        canvas.width = Math.floor(layoutViewport.width * outputScale);
        canvas.height = Math.floor(layoutViewport.height * outputScale);
        
        // Locking the CSS layout size to the fit-scale layout bounds
        canvas.style.width = `${Math.floor(layoutViewport.width)}px`;
        canvas.style.height = `${Math.floor(layoutViewport.height)}px`;

        setPageWidth(layoutViewport.width);
        setPageHeight(layoutViewport.height);

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext: any = {
          canvasContext: context,
          viewport: layoutViewport,
          transform: transform,
          canvas: canvas,
        };

        const renderTask = page.render(renderContext);
        activeRenderTaskRef.current = renderTask;

        await renderTask.promise;
        if (!isCancelled) {
          setRendering(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !err?.message?.includes('cancelled')) {
          console.error('PDF canvas render error:', err);
        }
        if (!isCancelled) {
          setRendering(false);
        }
      } finally {
        if (activeRenderTaskRef.current?.promise) {
          activeRenderTaskRef.current = null;
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNum, fitScale, rotation]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 4.0));
  };
  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.4));
  };
  const handleResetZoom = () => {
    setZoom(1.0);
    setPanPosition({ x: 0, y: 0 });
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handlePrevPage = () => {
    setPageNum((prev) => Math.max(prev - 1, 1));
    setPanPosition({ x: 0, y: 0 });
    setZoom(1.0);
  };
  const handleNextPage = () => {
    setPageNum((prev) => Math.min(prev + 1, totalPages));
    setPanPosition({ x: 0, y: 0 });
    setZoom(1.0);
  };

  // Hand Drag Handlers ("Throw a hand")
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panPosition.x, y: e.clientY - panPosition.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Keep refs in sync so imperative listeners don't need to rebuild constantly
  const fitScaleRef = useRef<number>(fitScale);
  useEffect(() => { fitScaleRef.current = fitScale; }, [fitScale]);

  const zoomRef = useRef<number>(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const panPositionRef = useRef<{ x: number; y: number }>(panPosition);
  useEffect(() => { panPositionRef.current = panPosition; }, [panPosition]);

  const isDraggingRef = useRef<boolean>(isDragging);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // Touch Gesture Handlers (Pinch to zoom, drag to pan with native zoom block)
  const touchStartDistRef = useRef<number>(0);
  const touchStartScaleRef = useRef<number>(1.0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStartDistRef.current = dist;
        touchStartScaleRef.current = zoomRef.current;
      } else if (e.touches.length === 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - panPositionRef.current.x,
          y: e.touches[0].clientY - panPositionRef.current.y,
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
        const newZoom = Math.min(Math.max(touchStartScaleRef.current * factor, 0.4), 4.0);
        setZoom(Number(newZoom.toFixed(2)));
      } else if (e.touches.length === 1 && isDraggingRef.current) {
        e.preventDefault();
        setPanPosition({
          x: e.touches[0].clientX - dragStartRef.current.x,
          y: e.touches[0].clientY - dragStartRef.current.y,
        });
      }
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      if (touchStartDistRef.current > 0) {
        const finalZoom = zoomRef.current;
        setZoom(Number(Math.min(Math.max(finalZoom, 0.4), 4.0).toFixed(2)));
        touchStartDistRef.current = 0;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Keyboard navigation for PDF pages
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages, pageNum]);

  return (
    <div className="flex flex-col flex-1 w-full h-full bg-slate-950 text-slate-100 font-sans relative overflow-hidden">
      {/* Top Controls Toolbar - only shown if not hidden by parent unified modal */}
      {!hideTopToolbar && (
        <div className={APP_STYLES.viewers.lightboxToolbar}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-full bg-rose-500/10 text-rose-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-slate-200 truncate max-w-[120px] sm:max-w-[240px]">
                {fileName || 'PDF Document'}
              </span>
              {pageWidth > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  PDF • {Math.round(pageWidth)} × {Math.round(pageHeight)} px {pdfSizeStr ? `• ${pdfSizeStr}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Page & Zoom Controls (Centered and non-wrapping) */}
          <div className="flex items-center gap-1 bg-slate-950/80 px-2.5 py-1 rounded-full border border-slate-850 text-xs font-mono shadow-inner">
            <button
              onClick={handlePrevPage}
              disabled={pageNum <= 1 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300 font-semibold px-0.5">
              {pageNum}/{totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={pageNum >= totalPages || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-3 bg-slate-800 mx-0.5" />

            {/* Zoom Out */}
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.4 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-0.5 cursor-pointer"
              title="Reset Zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            {/* Zoom In */}
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 4.0 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3 bg-slate-800 mx-0.5" />

            <button
              onClick={handleRotate}
              disabled={loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 cursor-pointer"
              title="Rotate 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Canvas Container with Hand Pan/Drag & Touch Pinch Support */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: 'none' }}
        className={`flex-1 overflow-hidden p-3 sm:p-6 bg-slate-950 flex justify-center items-center relative select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Floating Minimal Bottom Controls Dock (Used when top toolbar is hidden for full screen) */}
        {hideTopToolbar && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md text-xs select-none">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={pageNum <= 1 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-200 font-mono font-medium px-1.5">
              {pageNum} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={pageNum >= totalPages || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-px h-3.5 bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.4 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-1 cursor-pointer"
              title="Reset Zoom to 100% (0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 4.0 || loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 disabled:opacity-20 cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={handleRotate}
              disabled={loading}
              className="p-1 hover:bg-slate-800 rounded-full text-slate-300 cursor-pointer"
              title="Rotate 90° (R)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xs flex flex-col items-center justify-center gap-3 z-10 text-slate-300">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
            <span className="text-xs font-semibold">Fitting PDF Page to Screen Resolution...</span>
          </div>
        )}

        {error ? (
          <div className="m-auto text-center p-6 bg-rose-950/40 border border-rose-800/60 rounded-2xl max-w-md space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <h4 className="text-sm font-bold text-rose-200">Unable to Render PDF</h4>
            <p className="text-xs text-rose-300/80">{error}</p>
            <a
              href={url}
              download={fileName || 'document.pdf'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download Raw PDF File</span>
            </a>
          </div>
        ) : (
          <div
            className="relative shadow-2xl rounded-sm overflow-hidden bg-[#f8fafc] transition-transform duration-75 shrink-0"
            style={{
              width: pageWidth ? `${pageWidth}px` : 'auto',
              height: pageHeight ? `${pageHeight}px` : 'auto',
              transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <canvas ref={canvasRef} className="block max-w-none" />
            {rendering && (
              <div className="absolute top-2 right-2 bg-slate-900/80 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-mono flex items-center gap-1.5 shadow-md">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Updating Page...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
