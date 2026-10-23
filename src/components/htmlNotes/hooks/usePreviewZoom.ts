import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePreviewZoomOptions {
  viewportMode: string;
  viewMode: string;
  isSidebarOpen: boolean;
  splitRatio: number;
  isResizingRef: React.MutableRefObject<boolean>;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  fullScreenIframeRef?: React.RefObject<HTMLIFrameElement | null>;
  setFontSizePx?: React.Dispatch<React.SetStateAction<number>>;
}

export function usePreviewZoom(options: UsePreviewZoomOptions) {
  const { viewportMode, viewMode, isSidebarOpen, splitRatio, isResizingRef, iframeRef, fullScreenIframeRef, setFontSizePx } = options;
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isManualZoom, setIsManualZoom] = useState<boolean>(false);
  const measuredWidthRef = useRef<number>(1200);

  // Directly update CSS custom property inside both standard and full screen iframes for instant, 0ms lag-free zoom
  const applyIframeZoom = useCallback((zoom: number) => {
    const targets = [iframeRef?.current, fullScreenIframeRef?.current];
    targets.forEach((frame) => {
      if (!frame) return;
      try {
        const doc = frame.contentDocument;
        if (doc) {
          const factor = zoom / 100;
          doc.documentElement.style.setProperty('--paper-zoom', `${factor}`);
          if (doc.body) {
            doc.body.style.setProperty('--paper-zoom', `${factor}`);
            (doc.body.style as any).zoom = `${factor}`;
          }
          const container = doc.querySelector('.a4-container') as HTMLElement | null;
          if (container) {
            container.style.setProperty('--paper-zoom', `${factor}`);
            (container.style as any).zoom = `${factor}`;
            container.style.transform = '';
          }
          const pageList = doc.querySelectorAll('.a4-page') as NodeListOf<HTMLElement>;
          pageList.forEach((pg) => {
            pg.style.setProperty('--paper-zoom', `${factor}`);
            (pg.style as any).zoom = `${factor}`;
            pg.style.transform = '';
          });
        }
      } catch (_) {}
    });
  }, [iframeRef, fullScreenIframeRef]);

  // Calculate the ideal zoom level to center and fit the A4 page within the available frame
  const calculateFitZoom = useCallback((containerWidth: number) => {
    const targetWidth = viewportMode === 'slide' ? 960 : 794;
    // If available width is spacious enough for 100% paper with comfortable margins on left and right
    if (containerWidth >= targetWidth + 48) {
      return 100;
    }
    // In narrower preview frames (e.g. split mode, smaller screens), fit with 24px comfortable side gutter
    const availablePaperWidth = Math.max(120, containerWidth - 24);
    const fitPercentage = Math.floor((availablePaperWidth / targetWidth) * 100);
    return Math.min(100, Math.max(25, fitPercentage));
  }, [viewportMode]);

  const handleZoomIn = useCallback(() => {
    setIsManualZoom(true);
    if (setFontSizePx) {
      setFontSizePx((prev) => Math.min(32, prev + 1.5));
    }
    setZoomLevel((prev) => {
      const next = Math.min(250, prev + 10);
      applyIframeZoom(next);
      return next;
    });
  }, [applyIframeZoom, setFontSizePx]);

  const handleZoomOut = useCallback(() => {
    setIsManualZoom(true);
    if (setFontSizePx) {
      setFontSizePx((prev) => Math.max(10, prev - 1.5));
    }
    setZoomLevel((prev) => {
      const next = Math.max(25, prev - 10);
      applyIframeZoom(next);
      return next;
    });
  }, [applyIframeZoom, setFontSizePx]);

  const handleZoomReset = useCallback(() => {
    setIsManualZoom(false);
    if (setFontSizePx) {
      setFontSizePx(15);
    }
    const previewElement = document.querySelector('.preview-canvas-wrapper');
    const width = previewElement ? previewElement.getBoundingClientRect().width : (measuredWidthRef.current || 794);
    const fitZoom = calculateFitZoom(width);
    setZoomLevel(fitZoom);
    applyIframeZoom(fitZoom);
  }, [calculateFitZoom, applyIframeZoom, setFontSizePx]);

  // Automatically reset zoom when switching viewportMode (Paper <-> Fluid) or viewMode
  useEffect(() => {
    setIsManualZoom(false);
    if (viewportMode !== 'a4') {
      setZoomLevel(100);
      applyIframeZoom(100);
    }
  }, [viewportMode, viewMode, applyIframeZoom]);

  // Dynamic ResizeObserver to guarantee the A4 Paper is center-aligned and fitted to the available frame
  useEffect(() => {
    if (viewportMode !== 'a4' || typeof window === 'undefined') return;

    let resizeObserver: ResizeObserver | null = null;
    let rafId: number | null = null;

    const updateZoomForWidth = (width: number) => {
      if (width <= 0) return;
      measuredWidthRef.current = width;
      if (isManualZoom) return;
      const fitZoom = calculateFitZoom(width);
      setZoomLevel((prev) => {
        if (prev !== fitZoom) {
          applyIframeZoom(fitZoom);
          return fitZoom;
        }
        return prev;
      });
    };

    const handleMeasure = () => {
      const previewElement = document.querySelector('.preview-canvas-wrapper');
      if (previewElement) {
        const rect = previewElement.getBoundingClientRect();
        updateZoomForWidth(rect.width);
      }
    };

    // Immediate calculation on layout shift
    handleMeasure();

    // Attach ResizeObserver to the preview container to detect split drags, sidebar toggles, and screen changes
    const previewElement = document.querySelector('.preview-canvas-wrapper');
    if (previewElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (entries.length > 0) {
          const entry = entries[0];
          const newWidth = entry.contentRect.width;
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            updateZoomForWidth(newWidth);
          });
        }
      });
      resizeObserver.observe(previewElement);
    }

    const onWindowResize = () => {
      handleMeasure();
    };

    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [viewportMode, viewMode, isSidebarOpen, splitRatio, isManualZoom, isResizingRef, calculateFitZoom, applyIframeZoom]);

  return {
    zoomLevel,
    setZoomLevel,
    isManualZoom,
    setIsManualZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    applyIframeZoom
  };
}
