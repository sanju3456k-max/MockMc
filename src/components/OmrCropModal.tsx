import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  X,
  RotateCcw, 
  RotateCw, 
  Move, 
  Maximize2,
  Loader2
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { warpPerspectiveCanvas, QuadPoint } from '../lib/omrPerspectiveWarp';
import { 
  studioModalVariants, 
  studioBackdropVariants, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface OmrCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApplyCrop: (croppedDataUrl: string) => void;
  targetWidthMm?: number;
  targetHeightMm?: number;
  bottomFiducialY_mm?: number;
  totalQuestions?: number;
}

type CornerId = 'tl' | 'tr' | 'br' | 'bl';
type EdgeId = 'edge-top' | 'edge-right' | 'edge-bottom' | 'edge-left';
type DragTarget = CornerId | EdgeId | 'move-all' | null;

interface QuadCorners {
  tl: QuadPoint; // Top-Left (0-100%)
  tr: QuadPoint; // Top-Right (0-100%)
  br: QuadPoint; // Bottom-Right (0-100%)
  bl: QuadPoint; // Bottom-Left (0-100%)
}

interface DisplayLayout {
  width: number;
  height: number;
  left: number;
  top: number;
}

const DEFAULT_CORNERS: QuadCorners = {
  tl: { x: 5, y: 5 },
  tr: { x: 95, y: 5 },
  br: { x: 95, y: 95 },
  bl: { x: 5, y: 95 },
};

export const OmrCropModal: React.FC<OmrCropModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApplyCrop,
  targetWidthMm = 210,
  targetHeightMm = 297,
  bottomFiducialY_mm,
  totalQuestions,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

  const stageRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imgDisplayLayout, setImgDisplayLayout] = useState<DisplayLayout>({ width: 0, height: 0, left: 0, top: 0 });

  // 4 Corner fiducial markers (percentage 0 to 100 within current rotated orientation)
  const [corners, setCorners] = useState<QuadCorners>(DEFAULT_CORNERS);
  const cornersRef = useRef<QuadCorners>(corners);
  useEffect(() => {
    cornersRef.current = corners;
  }, [corners]);

  // Drag interaction state
  const [activeDragTarget, setActiveDragTarget] = useState<DragTarget>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
  const [isProcessingCrop, setIsProcessingCrop] = useState<boolean>(false);

  const activeLayoutRef = useRef<DisplayLayout>({ width: 0, height: 0, left: 0, top: 0 });
  useEffect(() => {
    activeLayoutRef.current = imgDisplayLayout;
  }, [imgDisplayLayout]);

  const dragCleanupRef = useRef<(() => void) | null>(null);

  const cleanupActiveDrag = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
    setActiveDragTarget(null);
    setLoupePos(null);
  }, []);

  // Prepare rotated source canvas cache
  const updateRotatedCanvasCache = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const nw = img.naturalWidth || img.width || 800;
    const nh = img.naturalHeight || img.height || 1100;

    const isRot90or270 = rotationDeg === 90 || rotationDeg === 270;
    const rw = isRot90or270 ? nh : nw;
    const rh = isRot90or270 ? nw : nh;

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);

    rotCanvasRef.current = canvas;
  }, [rotationDeg]);

  // Measure stage and calculate image display dimensions to fill maximum viewport
  const updateDisplayLayout = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || imgNaturalSize.width === 0 || imgNaturalSize.height === 0) return;

    // Full available viewport stage width and height with small padding
    const stageWidth = Math.max(10, stage.clientWidth - 16);
    const stageHeight = Math.max(10, stage.clientHeight - 16);

    if (stageWidth <= 10 || stageHeight <= 10) return;

    const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
    const effectiveNatWidth = isRotated90or270 ? imgNaturalSize.height : imgNaturalSize.width;
    const effectiveNatHeight = isRotated90or270 ? imgNaturalSize.width : imgNaturalSize.height;

    const imgAspect = effectiveNatWidth / effectiveNatHeight;
    const stageAspect = stageWidth / stageHeight;

    let dispW = 0;
    let dispH = 0;

    if (imgAspect > stageAspect) {
      dispW = stageWidth;
      dispH = stageWidth / imgAspect;
    } else {
      dispH = stageHeight;
      dispW = stageHeight * imgAspect;
    }

    const dispLeft = Math.max(0, (stage.clientWidth - dispW) / 2);
    const dispTop = Math.max(0, (stage.clientHeight - dispH) / 2);

    const layout = {
      width: Math.max(20, Math.round(dispW)),
      height: Math.max(20, Math.round(dispH)),
      left: Math.round(dispLeft),
      top: Math.round(dispTop),
    };

    setImgDisplayLayout(layout);
    activeLayoutRef.current = layout;
  }, [imgNaturalSize, rotationDeg]);

  useEffect(() => {
    if (!isOpen) {
      cleanupActiveDrag();
      setIsProcessingCrop(false);
    } else {
      setIsProcessingCrop(false);
      updateDisplayLayout();
    }
    return () => {
      cleanupActiveDrag();
    };
  }, [isOpen, cleanupActiveDrag, updateDisplayLayout]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanupActiveDrag();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, cleanupActiveDrag]);

  // Load source image
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    cleanupActiveDrag();
    setImageLoaded(false);
    setRotationDeg(0);

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoaded = () => {
      if (isCancelled) return;
      imgRef.current = img;
      const nw = img.naturalWidth || img.width || 800;
      const nh = img.naturalHeight || img.height || 1100;
      setImgNaturalSize({ width: nw, height: nh });
      setImageLoaded(true);
      setCorners(DEFAULT_CORNERS);
    };

    img.onload = handleLoaded;
    img.onerror = () => {
      if (isCancelled) return;
      setImgNaturalSize({ width: 800, height: 1100 });
      setImageLoaded(true);
    };

    img.src = imageUrl;
    if (img.complete && img.naturalWidth > 0) {
      handleLoaded();
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, imageUrl, cleanupActiveDrag]);

  // Sync rotated canvas when image or rotation changes
  useEffect(() => {
    if (imageLoaded) {
      updateRotatedCanvasCache();
    }
  }, [imageLoaded, rotationDeg, updateRotatedCanvasCache]);

  // ResizeObserver for dynamic fullscreen responsiveness
  useEffect(() => {
    if (!isOpen || !stageRef.current) return;

    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      updateDisplayLayout();
    });
    ro.observe(el);

    updateDisplayLayout();

    const raf = requestAnimationFrame(() => {
      updateDisplayLayout();
    });

    const timer = setTimeout(() => {
      updateDisplayLayout();
    }, 100);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isOpen, imageLoaded, updateDisplayLayout]);

  // Rotate 90 degrees clockwise and reset corner box positions
  const handleRotate = () => {
    cleanupActiveDrag();
    setRotationDeg((prev) => (prev + 90) % 360);
    setCorners(DEFAULT_CORNERS);
  };

  // Reset corner boxes to default balanced positions
  const handleResetCorners = () => {
    cleanupActiveDrag();
    setCorners(DEFAULT_CORNERS);
  };

  // Snap crop frame to absolute 100% full image dimensions
  const handleSnapFullImage = () => {
    cleanupActiveDrag();
    setCorners({
      tl: { x: 0, y: 0 },
      tr: { x: 100, y: 0 },
      br: { x: 100, y: 100 },
      bl: { x: 0, y: 100 },
    });
  };

  // Extend right edge dragger all the way to 100% image width
  const handleSnapRightEdge = () => {
    cleanupActiveDrag();
    setCorners((prev) => ({
      ...prev,
      tr: { ...prev.tr, x: 100 },
      br: { ...prev.br, x: 100 },
    }));
  };

  // Update magnifier loupe canvas
  const updateLoupe = useCallback((cornerXPercent: number, cornerYPercent: number, clientX: number, clientY: number) => {
    const rotCanvas = rotCanvasRef.current;
    const loupeCanvas = loupeCanvasRef.current;
    if (!rotCanvas || !loupeCanvas) return;

    const loupeCtx = loupeCanvas.getContext('2d');
    if (!loupeCtx) return;

    const srcW = rotCanvas.width;
    const srcH = rotCanvas.height;
    const srcCenterX = (cornerXPercent / 100) * srcW;
    const srcCenterY = (cornerYPercent / 100) * srcH;

    const loupeSize = 110;
    const zoomFactor = 2.4;
    const sliceSize = loupeSize / zoomFactor;

    loupeCtx.clearRect(0, 0, loupeSize, loupeSize);

    // Render zoomed source region
    loupeCtx.drawImage(
      rotCanvas,
      srcCenterX - sliceSize / 2,
      srcCenterY - sliceSize / 2,
      sliceSize,
      sliceSize,
      0,
      0,
      loupeSize,
      loupeSize
    );

    // Crosshair target circle & lines (thin 1px precision)
    loupeCtx.strokeStyle = '#10b981';
    loupeCtx.lineWidth = 1.0;

    loupeCtx.beginPath();
    loupeCtx.arc(loupeSize / 2, loupeSize / 2, 7, 0, Math.PI * 2);
    loupeCtx.stroke();

    loupeCtx.beginPath();
    loupeCtx.moveTo(loupeSize / 2 - 12, loupeSize / 2);
    loupeCtx.lineTo(loupeSize / 2 + 12, loupeSize / 2);
    loupeCtx.moveTo(loupeSize / 2, loupeSize / 2 - 12);
    loupeCtx.lineTo(loupeSize / 2, loupeSize / 2 + 12);
    loupeCtx.stroke();

    // Center point indicator
    loupeCtx.fillStyle = '#34d399';
    loupeCtx.beginPath();
    loupeCtx.arc(loupeSize / 2, loupeSize / 2, 1.5, 0, Math.PI * 2);
    loupeCtx.fill();

    setLoupePos({ x: clientX, y: clientY - 80 });
  }, []);

  // Pointer drag start handler
  const handlePointerDown = (e: React.PointerEvent, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();

    cleanupActiveDrag();

    const pointerId = e.pointerId;
    const targetEl = e.currentTarget as HTMLElement;
    if (targetEl && typeof targetEl.setPointerCapture === 'function') {
      try {
        targetEl.setPointerCapture(pointerId);
      } catch (err) {
        // Safe fallback if setPointerCapture is unsupported
      }
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startCorners = { ...cornersRef.current };
    
    const containerRect = imageContainerRef.current?.getBoundingClientRect();
    const layoutWidth = containerRect?.width || activeLayoutRef.current.width || 320;
    const layoutHeight = containerRect?.height || activeLayoutRef.current.height || 420;

    if (layoutWidth <= 0 || layoutHeight <= 0) return;

    setActiveDragTarget(target);

    // Initial loupe positioning
    if (target && target !== 'move-all') {
      let focusX = 50;
      let focusY = 50;
      if (target === 'edge-right') {
        focusX = (startCorners.tr.x + startCorners.br.x) / 2;
        focusY = (startCorners.tr.y + startCorners.br.y) / 2;
      } else if (target === 'edge-left') {
        focusX = (startCorners.tl.x + startCorners.bl.x) / 2;
        focusY = (startCorners.tl.y + startCorners.bl.y) / 2;
      } else if (target === 'edge-top') {
        focusX = (startCorners.tl.x + startCorners.tr.x) / 2;
        focusY = (startCorners.tl.y + startCorners.tr.y) / 2;
      } else if (target === 'edge-bottom') {
        focusX = (startCorners.bl.x + startCorners.br.x) / 2;
        focusY = (startCorners.bl.y + startCorners.br.y) / 2;
      } else {
        const cornerPt = startCorners[target];
        focusX = cornerPt.x;
        focusY = cornerPt.y;
      }
      updateLoupe(focusX, focusY, startX, startY);
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();

      const currentRect = imageContainerRef.current?.getBoundingClientRect();
      const currentWidth = currentRect?.width || layoutWidth;
      const currentHeight = currentRect?.height || layoutHeight;
      if (currentWidth <= 0 || currentHeight <= 0) return;

      const deltaXPx = moveEvt.clientX - startX;
      const deltaYPx = moveEvt.clientY - startY;

      const deltaXPercent = (deltaXPx / currentWidth) * 100;
      const deltaYPercent = (deltaYPx / currentHeight) * 100;

      // Pointer direct percentage relative to container boundary
      let pointerXPercent = 50;
      let pointerYPercent = 50;
      if (currentRect && currentRect.width > 0 && currentRect.height > 0) {
        pointerXPercent = ((moveEvt.clientX - currentRect.left) / currentRect.width) * 100;
        pointerYPercent = ((moveEvt.clientY - currentRect.top) / currentRect.height) * 100;
      }

      if (target === 'move-all') {
        // Translate all four corners in unison
        const minX = Math.min(startCorners.tl.x, startCorners.tr.x, startCorners.br.x, startCorners.bl.x);
        const maxX = Math.max(startCorners.tl.x, startCorners.tr.x, startCorners.br.x, startCorners.bl.x);
        const minY = Math.min(startCorners.tl.y, startCorners.tr.y, startCorners.br.y, startCorners.bl.y);
        const maxY = Math.max(startCorners.tl.y, startCorners.tr.y, startCorners.br.y, startCorners.bl.y);

        const clampDeltaX = Math.max(-minX, Math.min(100 - maxX, deltaXPercent));
        const clampDeltaY = Math.max(-minY, Math.min(100 - maxY, deltaYPercent));

        const nextCorners: QuadCorners = {
          tl: { x: Number((startCorners.tl.x + clampDeltaX).toFixed(2)), y: Number((startCorners.tl.y + clampDeltaY).toFixed(2)) },
          tr: { x: Number((startCorners.tr.x + clampDeltaX).toFixed(2)), y: Number((startCorners.tr.y + clampDeltaY).toFixed(2)) },
          br: { x: Number((startCorners.br.x + clampDeltaX).toFixed(2)), y: Number((startCorners.br.y + clampDeltaY).toFixed(2)) },
          bl: { x: Number((startCorners.bl.x + clampDeltaX).toFixed(2)), y: Number((startCorners.bl.y + clampDeltaY).toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
      } else if (target === 'edge-right') {
        // Right edge dragger: smoothly moves TR and BR up to 100% of the image dimension
        const minRightX = Math.max(startCorners.tl.x + 1, startCorners.bl.x + 1);
        let newRightX = Math.max(minRightX, Math.min(100, Math.max(startCorners.tr.x, startCorners.br.x) + deltaXPercent));

        // Magnetic snap: if dragged close to the right edge or pointer is near edge, snap to exact 100%
        if (newRightX >= 97.5 || pointerXPercent >= 97.5) {
          newRightX = 100.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tr: { ...startCorners.tr, x: Number(newRightX.toFixed(2)) },
          br: { ...startCorners.br, x: Number(newRightX.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe(newRightX, (startCorners.tr.y + startCorners.br.y) / 2, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-left') {
        // Left edge dragger: moves TL and BL down to 0%
        const maxLeftX = Math.min(startCorners.tr.x - 1, startCorners.br.x - 1);
        let newLeftX = Math.max(0, Math.min(maxLeftX, Math.min(startCorners.tl.x, startCorners.bl.x) + deltaXPercent));

        if (newLeftX <= 2.5 || pointerXPercent <= 2.5) {
          newLeftX = 0.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tl: { ...startCorners.tl, x: Number(newLeftX.toFixed(2)) },
          bl: { ...startCorners.bl, x: Number(newLeftX.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe(newLeftX, (startCorners.tl.y + startCorners.bl.y) / 2, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-top') {
        // Top edge dragger: moves TL and TR up to 0%
        const maxTopY = Math.min(startCorners.bl.y - 1, startCorners.br.y - 1);
        let newTopY = Math.max(0, Math.min(maxTopY, Math.min(startCorners.tl.y, startCorners.tr.y) + deltaYPercent));

        if (newTopY <= 2.5 || pointerYPercent <= 2.5) {
          newTopY = 0.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          tl: { ...startCorners.tl, y: Number(newTopY.toFixed(2)) },
          tr: { ...startCorners.tr, y: Number(newTopY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe((startCorners.tl.x + startCorners.tr.x) / 2, newTopY, moveEvt.clientX, moveEvt.clientY);
      } else if (target === 'edge-bottom') {
        // Bottom edge dragger: moves BL and BR down to 100%
        const minBottomY = Math.max(startCorners.tl.y + 1, startCorners.tr.y + 1);
        let newBottomY = Math.max(minBottomY, Math.min(100, Math.max(startCorners.bl.y, startCorners.br.y) + deltaYPercent));

        if (newBottomY >= 97.5 || pointerYPercent >= 97.5) {
          newBottomY = 100.0;
        }

        const nextCorners: QuadCorners = {
          ...startCorners,
          bl: { ...startCorners.bl, y: Number(newBottomY.toFixed(2)) },
          br: { ...startCorners.br, y: Number(newBottomY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);
        updateLoupe((startCorners.bl.x + startCorners.br.x) / 2, newBottomY, moveEvt.clientX, moveEvt.clientY);
      } else if (target) {
        // Move single corner independently (TL, TR, BR, BL)
        const origPt = startCorners[target];
        let newX = Math.max(0, Math.min(100, origPt.x + deltaXPercent));
        let newY = Math.max(0, Math.min(100, origPt.y + deltaYPercent));

        // Magnetic snap to edges
        if (newX >= 97.5 || (target.includes('r') && pointerXPercent >= 97.5)) newX = 100.0;
        if (newX <= 2.5 || (target.includes('l') && pointerXPercent <= 2.5)) newX = 0.0;
        if (newY >= 97.5 || (target.includes('b') && pointerYPercent >= 97.5)) newY = 100.0;
        if (newY <= 2.5 || (target.includes('t') && pointerYPercent <= 2.5)) newY = 0.0;

        const nextCorners: QuadCorners = {
          ...startCorners,
          [target]: { x: Number(newX.toFixed(2)), y: Number(newY.toFixed(2)) },
        };

        cornersRef.current = nextCorners;
        setCorners(nextCorners);

        updateLoupe(newX, newY, moveEvt.clientX, moveEvt.clientY);
      }
    };

    const onPointerEnd = () => {
      if (targetEl && typeof targetEl.releasePointerCapture === 'function') {
        try {
          if (targetEl.hasPointerCapture(pointerId)) {
            targetEl.releasePointerCapture(pointerId);
          }
        } catch (err) {
          // Safe fallback
        }
      }
      cleanupActiveDrag();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onPointerEnd);

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', onPointerEnd);
    };
  };

  // Execute 4-point homography and rectify OMR image:
  // EXACT 1:1 CROP POSITION WITH ZERO EXTRA MARGINS
  const executeApplyPerspectiveCrop = () => {
    cleanupActiveDrag();

    try {
      let rotCanvas = rotCanvasRef.current;
      if (!rotCanvas && imgRef.current) {
        updateRotatedCanvasCache();
        rotCanvas = rotCanvasRef.current;
      }

      if (!rotCanvas) {
        // Emergency canvas creation if cache missed
        const fallbackCanvas = document.createElement('canvas');
        if (imgRef.current) {
          fallbackCanvas.width = imgRef.current.naturalWidth || 800;
          fallbackCanvas.height = imgRef.current.naturalHeight || 1100;
          const ctx = fallbackCanvas.getContext('2d');
          if (ctx) ctx.drawImage(imgRef.current, 0, 0);
        }
        rotCanvas = fallbackCanvas;
      }

      const rotW = rotCanvas.width || 800;
      const rotH = rotCanvas.height || 1100;

      // 1. Source points in pixels on rotated image
      const srcQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: (corners.tl.x / 100) * rotW, y: (corners.tl.y / 100) * rotH }, // Top-Left
        { x: (corners.tr.x / 100) * rotW, y: (corners.tr.y / 100) * rotH }, // Top-Right
        { x: (corners.br.x / 100) * rotW, y: (corners.br.y / 100) * rotH }, // Bottom-Right
        { x: (corners.bl.x / 100) * rotW, y: (corners.bl.y / 100) * rotH }, // Bottom-Left
      ];

      // 2. Compute exact span of the selected quadrilateral in source pixels
      const topW = Math.hypot(srcQuad[1].x - srcQuad[0].x, srcQuad[1].y - srcQuad[0].y);
      const botW = Math.hypot(srcQuad[2].x - srcQuad[3].x, srcQuad[2].y - srcQuad[3].y);
      const leftH = Math.hypot(srcQuad[3].x - srcQuad[0].x, srcQuad[3].y - srcQuad[0].y);
      const rightH = Math.hypot(srcQuad[2].x - srcQuad[1].x, srcQuad[2].y - srcQuad[1].y);

      const quadAvgW = Math.max(1, (topW + botW) / 2);
      const quadAvgH = Math.max(1, (leftH + rightH) / 2);

      // High resolution output width (at least 1260px for high OCR quality, or original pixel span)
      const dstWidth = Math.max(1260, Math.round(Math.max(topW, botW)));
      const dstHeight = Math.max(600, Math.round(dstWidth * (quadAvgH / quadAvgW)));

      // 3. Destination Quad: EXACTLY FILLS THE BOUNDARIES [0, 0] -> [dstWidth, dstHeight]!
      const dstQuad: [QuadPoint, QuadPoint, QuadPoint, QuadPoint] = [
        { x: 0, y: 0 },
        { x: dstWidth, y: 0 },
        { x: dstWidth, y: dstHeight },
        { x: 0, y: dstHeight },
      ];

      // Check if nearly axis-aligned rectangle for direct 2D context crop
      const isNearRect =
        Math.abs(corners.tl.x - corners.bl.x) < 0.25 &&
        Math.abs(corners.tr.x - corners.br.x) < 0.25 &&
        Math.abs(corners.tl.y - corners.tr.y) < 0.25 &&
        Math.abs(corners.bl.y - corners.br.y) < 0.25;

      let croppedDataUrl: string | null = null;

      if (isNearRect) {
        const sx = Math.max(0, Math.min(rotW - 1, Math.min(srcQuad[0].x, srcQuad[3].x)));
        const sy = Math.max(0, Math.min(rotH - 1, Math.min(srcQuad[0].y, srcQuad[1].y)));
        const sw = Math.max(1, Math.min(rotW - sx, Math.max(srcQuad[1].x, srcQuad[2].x) - sx));
        const sh = Math.max(1, Math.min(rotH - sy, Math.max(srcQuad[2].y, srcQuad[3].y) - sy));

        const outCanvas = document.createElement('canvas');
        outCanvas.width = dstWidth;
        outCanvas.height = dstHeight;
        const outCtx = outCanvas.getContext('2d');
        if (outCtx) {
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = 'high';
          outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, dstWidth, dstHeight);
          croppedDataUrl = outCanvas.toDataURL('image/png', 1.0);
        }
      }

      if (!croppedDataUrl) {
        // Perspective homography transformation for tilted or skewed sheets
        const rectifiedCanvas = warpPerspectiveCanvas(rotCanvas, srcQuad, dstWidth, dstHeight, dstQuad);
        if (rectifiedCanvas) {
          croppedDataUrl = rectifiedCanvas.toDataURL('image/png', 1.0);
        } else {
          console.warn('Perspective homography fallback to raw canvas');
          croppedDataUrl = rotCanvas.toDataURL('image/png', 1.0);
        }
      }

      onApplyCrop(croppedDataUrl || imageUrl);
      onClose();
    } catch (err) {
      console.error('Cropping error:', err);
      // Fallback: apply raw imageUrl and close gracefully
      onApplyCrop(imageUrl);
      onClose();
    } finally {
      setIsProcessingCrop(false);
    }
  };

  const handleApplyClick = () => {
    if (isProcessingCrop) return;
    setIsProcessingCrop(true);
    // Let browser render the loading state on screen before executing heavy canvas warp
    setTimeout(() => {
      executeApplyPerspectiveCrop();
    }, 40);
  };

  if (!isOpen) return null;

  // Geometry calculations for on-screen SVG quad and centroid
  const isRotated90or270 = rotationDeg === 90 || rotationDeg === 270;
  const imgWidth = isRotated90or270 ? (imgDisplayLayout.height || 420) : (imgDisplayLayout.width || 320);
  const imgHeight = isRotated90or270 ? (imgDisplayLayout.width || 320) : (imgDisplayLayout.height || 420);
  const imgLeft = (imgDisplayLayout.width - imgWidth) / 2;
  const imgTop = (imgDisplayLayout.height - imgHeight) / 2;

  const centroidX = (corners.tl.x + corners.tr.x + corners.br.x + corners.bl.x) / 4;
  const centroidY = (corners.tl.y + corners.tr.y + corners.br.y + corners.bl.y) / 4;

  const quadPolygonPoints = `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={APP_STYLES.modal.backdrop}
        >
          <motion.div
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 w-full h-full max-h-[100dvh] rounded-none flex flex-col shadow-none overflow-hidden select-none"
          >
            {/* Minimal Header: 'Crop OMR' on Left, User Instruction badge, 'Close (X)' on Right */}
            <header className="px-4 py-2 sm:px-6 sm:py-2.5 bg-transparent flex items-center justify-between gap-2 shrink-0 z-30 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-zinc-100 tracking-tight select-none">
                  Crop OMR
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-[#222634] text-slate-700 dark:text-zinc-300 text-[10px] sm:text-[11px] font-medium select-none">
                  <span>Drag corners to fit OMR sheet</span>
                </span>
              </div>

              <button
                id="close-omr-crop-modal-btn"
                type="button"
                onClick={() => {
                  cleanupActiveDrag();
                  onClose();
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200/80 dark:bg-[#222634] hover:bg-slate-300 dark:hover:bg-[#282a39] text-slate-800 dark:text-zinc-100 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 border-0 ring-0 shadow-none"
                title="Close"
              >
                <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>
            </header>

            {/* ========================================================
                FULL VIEWPORT WORKSPACE STAGE (Maximum image visibility)
                ======================================================== */}
            <main
              ref={stageRef}
              className="relative flex-1 min-h-0 w-full bg-[#d0d7de]/50 dark:bg-[#06070a] flex items-center justify-center overflow-hidden p-2 sm:p-4 select-none"
              style={{ touchAction: 'none' }}
            >
        {imageLoaded && (
          <div
            ref={imageContainerRef}
            className="relative shadow-2xl"
            style={{
              width: `${imgDisplayLayout.width || 320}px`,
              height: `${imgDisplayLayout.height || 420}px`,
            }}
          >
            {/* Rendered Source Image with optional 90° rotation */}
            {imageUrl && imageUrl.trim() ? (
              <img
                src={imageUrl}
                alt="Scanned OMR Sheet"
                draggable={false}
                className="absolute pointer-events-none select-none rounded-none"
                style={{
                  width: `${imgWidth}px`,
                  height: `${imgHeight}px`,
                  left: `${imgLeft}px`,
                  top: `${imgTop}px`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `rotate(${rotationDeg}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            ) : null}

            {/* SVG Perspective Quadrilateral Overlay */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Mask to darken areas outside the 4 corner quad */}
                <mask id="quadMask">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <polygon points={quadPolygonPoints} fill="black" />
                </mask>
              </defs>

              {/* Outside Dark Scrim */}
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="rgba(0, 0, 0, 0.52)"
                mask="url(#quadMask)"
              />

              {/* Inside Subtle Royal Blue Highlight */}
              <polygon
                points={quadPolygonPoints}
                fill="rgba(37, 99, 235, 0.10)"
              />

              {/* 3x3 Perspective Interior Grid Lines */}
              {[0.25, 0.5, 0.75].map((t) => {
                const topX = corners.tl.x + (corners.tr.x - corners.tl.x) * t;
                const topY = corners.tl.y + (corners.tr.y - corners.tl.y) * t;
                const botX = corners.bl.x + (corners.br.x - corners.bl.x) * t;
                const botY = corners.bl.y + (corners.br.y - corners.bl.y) * t;

                const leftX = corners.tl.x + (corners.bl.x - corners.tl.x) * t;
                const leftY = corners.tl.y + (corners.bl.y - corners.tl.y) * t;
                const rightX = corners.tr.x + (corners.br.x - corners.tr.x) * t;
                const rightY = corners.tr.y + (corners.br.y - corners.tr.y) * t;

                return (
                  <g key={`guide-${t}`}>
                    <line
                      x1={topX}
                      y1={topY}
                      x2={botX}
                      y2={botY}
                      stroke="rgba(37, 99, 235, 0.25)"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={leftX}
                      y1={leftY}
                      x2={rightX}
                      y2={rightY}
                      stroke="rgba(37, 99, 235, 0.25)"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {/* Quad Boundary Lines - Thin Precision 1.25px hairline */}
              <line
                x1={corners.tl.x}
                y1={corners.tl.y}
                x2={corners.tr.x}
                y2={corners.tr.y}
                stroke="#2563eb"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.tr.x}
                y1={corners.tr.y}
                x2={corners.br.x}
                y2={corners.br.y}
                stroke="#2563eb"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.br.x}
                y1={corners.br.y}
                x2={corners.bl.x}
                y2={corners.bl.y}
                stroke="#2563eb"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={corners.bl.x}
                y1={corners.bl.y}
                x2={corners.tl.x}
                y2={corners.tl.y}
                stroke="#2563eb"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Centroid Move-All Handle */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'move-all')}
              style={{
                left: `${centroidX}%`,
                top: `${centroidY}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/85 border border-blue-400/70 shadow-md flex items-center justify-center cursor-move z-20 hover:scale-110 active:scale-95 transition-transform"
              title="Drag to reposition all 4 corners"
            >
              <Move className="w-3.5 h-3.5 text-blue-400" />
            </div>

            {/* ========================================================
                EDGE MIDPOINT DRAGGERS (RIGHT, LEFT, TOP, BOTTOM) - SLENDER THIN DESIGN
                ======================================================== */}
            {/* 1. RIGHT Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-right')}
              onDoubleClick={handleSnapRightEdge}
              style={{
                left: `${(corners.tr.x + corners.br.x) / 2}%`,
                top: `${(corners.tr.y + corners.br.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ew-resize z-25 group py-2 px-1"
              title="Drag right border to image boundary (Double-click to snap 100%)"
            >
              <div
                className={`w-2 h-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-right'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 2. LEFT Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-left')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  tl: { ...prev.tl, x: 0 },
                  bl: { ...prev.bl, x: 0 },
                }));
              }}
              style={{
                left: `${(corners.tl.x + corners.bl.x) / 2}%`,
                top: `${(corners.tl.y + corners.bl.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ew-resize z-25 group py-2 px-1"
              title="Drag left border (Double-click to snap 0%)"
            >
              <div
                className={`w-2 h-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-left'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
                <div className="w-1 h-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 3. TOP Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-top')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  tl: { ...prev.tl, y: 0 },
                  tr: { ...prev.tr, y: 0 },
                }));
              }}
              style={{
                left: `${(corners.tl.x + corners.tr.x) / 2}%`,
                top: `${(corners.tl.y + corners.tr.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ns-resize z-25 group px-2 py-1"
              title="Drag top border (Double-click to snap 0%)"
            >
              <div
                className={`h-2 w-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-top'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* 4. BOTTOM Edge Dragger */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'edge-bottom')}
              onDoubleClick={() => {
                cleanupActiveDrag();
                setCorners((prev) => ({
                  ...prev,
                  bl: { ...prev.bl, y: 100 },
                  br: { ...prev.br, y: 100 },
                }));
              }}
              style={{
                left: `${(corners.bl.x + corners.br.x) / 2}%`,
                top: `${(corners.bl.y + corners.br.y) / 2}%`,
                touchAction: 'none',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-ns-resize z-25 group px-2 py-1"
              title="Drag bottom border (Double-click to snap 100%)"
            >
              <div
                className={`h-2 w-7 rounded-full border border-blue-400/80 bg-slate-950/90 flex items-center justify-center gap-0.5 shadow-md transition-all ${
                  activeDragTarget === 'edge-bottom'
                    ? 'scale-125 bg-blue-600 border-white shadow-blue-500/60'
                    : 'group-hover:scale-110 group-hover:border-blue-300 group-hover:bg-slate-900'
                }`}
              >
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
                <div className="h-1 w-0.5 bg-blue-400/90 rounded-full" />
              </div>
            </div>

            {/* ========================================================
                4 INDEPENDENTLY DRAGGABLE CORNER SQUARE BOXES (MINOR THIN)
                ======================================================== */}
            {[
              { id: 'tl' as CornerId, label: 'TL', fullLabel: 'Top-Left', pt: corners.tl, align: 'bottom' },
              { id: 'tr' as CornerId, label: 'TR', fullLabel: 'Top-Right', pt: corners.tr, align: 'bottom' },
              { id: 'br' as CornerId, label: 'BR', fullLabel: 'Bottom-Right', pt: corners.br, align: 'top' },
              { id: 'bl' as CornerId, label: 'BL', fullLabel: 'Bottom-Left', pt: corners.bl, align: 'top' },
            ].map(({ id, label, fullLabel, pt, align }) => {
              const isActive = activeDragTarget === id;
              return (
                <div
                  key={id}
                  onPointerDown={(e) => handlePointerDown(e, id)}
                  style={{
                    left: `${pt.x}%`,
                    top: `${pt.y}%`,
                    touchAction: 'none',
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 group"
                  title={`${fullLabel} - drag to align with sheet corner`}
                >
                  {/* Minor Thin Square Corner Box */}
                  <div
                    className={`relative w-5.5 h-5.5 rounded-[2px] border transition-all flex items-center justify-center shadow-md ${
                      isActive
                        ? 'border-blue-300 bg-blue-600/35 scale-120 shadow-blue-500/50'
                        : 'border-blue-400/90 bg-slate-950/65 group-hover:scale-110 group-hover:border-blue-300'
                    }`}
                  >
                    {/* Precise Center Hairline Crosshair */}
                    <div className="absolute w-2 h-px bg-blue-400/80 pointer-events-none" />
                    <div className="absolute h-2 w-px bg-blue-400/80 pointer-events-none" />
                    <div className="w-1 h-1 bg-blue-300 rounded-full pointer-events-none" />
                  </div>

                  {/* Corner Label Badge (Crisp & Compact) */}
                  <div
                    className={`absolute pointer-events-none select-none px-1.5 py-0.2 rounded text-[9px] font-bold tracking-tight whitespace-nowrap shadow-xs transition-opacity ${
                      align === 'top' ? '-top-5' : '-bottom-5'
                    } ${
                      isActive
                        ? 'bg-blue-600 text-white font-extrabold opacity-100'
                        : 'bg-black/75 text-blue-300 border border-blue-500/30 opacity-70 group-hover:opacity-100'
                    }`}
                  >
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Zoom Loupe Lens */}
        {activeDragTarget && activeDragTarget !== 'move-all' && loupePos && (
          <div
            style={{
              left: `${loupePos.x}px`,
              top: `${loupePos.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
            className="fixed pointer-events-none z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="w-[110px] h-[110px] rounded-full border-2 border-blue-500 bg-slate-950 shadow-2xl overflow-hidden ring-4 ring-black/60 relative">
              <canvas
                ref={loupeCanvasRef}
                width={110}
                height={110}
                className="w-full h-full block"
              />
            </div>
            <div className="mt-1 px-2 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold shadow-md">
              Position on printed square
            </div>
          </div>
        )}
      </main>

      {/* ========================================================
          FULL-SCREEN FOOTER CONTROLS (Responsive & Safe Bottom Area)
          ======================================================== */}
      <footer className="px-3 sm:px-6 py-2.5 sm:py-3 border-0 bg-transparent flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 z-30 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center sm:justify-start">
          {/* Rotate 90° Button */}
          <button
            type="button"
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-800 dark:text-zinc-200 text-xs font-semibold border-0 ring-0 shadow-none transition-all cursor-pointer active:scale-95"
            title="Rotate sheet 90° clockwise"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Rotate 90°</span>
          </button>

          {/* Reset Corners */}
          <button
            type="button"
            onClick={handleResetCorners}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-800 dark:text-zinc-200 text-xs font-semibold border-0 ring-0 shadow-none transition-all cursor-pointer active:scale-95"
            title="Reset corner boxes to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Reset</span>
          </button>

          {/* Full Image (100%) */}
          <button
            type="button"
            onClick={handleSnapFullImage}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-800 dark:text-zinc-200 text-xs font-semibold border-0 ring-0 shadow-none transition-all cursor-pointer active:scale-95"
            title="Expand crop frame to 100% full image"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Full Image (100%)</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              cleanupActiveDrag();
              onClose();
            }}
            className="flex-1 sm:flex-none px-4 py-2 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-800 dark:text-zinc-200 text-xs font-semibold border-0 ring-0 shadow-none transition-all cursor-pointer text-center active:scale-95"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isProcessingCrop}
            onClick={handleApplyClick}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-[#0b57d0] hover:bg-blue-600 text-white text-xs font-bold border-0 ring-0 shadow-none transition-all cursor-pointer ${
              isProcessingCrop ? 'opacity-80 cursor-wait' : 'active:scale-95'
            }`}
          >
            {isProcessingCrop ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Cropping...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Apply & Scan</span>
              </>
            )}
          </button>
        </div>
      </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
