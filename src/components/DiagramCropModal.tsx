import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  X, 
  RotateCw, 
  Crop as CropIcon, 
  Maximize2, 
  Square, 
  Loader2,
  Move
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { 
  studioModalVariants, 
  studioBackdropVariants, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface DiagramCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApplyCrop: (croppedDataUrl: string) => void;
}

interface CropRect {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

type DragHandle = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move' | null;

export const DiagramCropModal: React.FC<DiagramCropModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApplyCrop,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, width: 90, height: 90 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; initialCrop: CropRect }>({
    clientX: 0,
    clientY: 0,
    initialCrop: { x: 5, y: 5, width: 90, height: 90 },
  });

  const renderRotated = useCallback((img: HTMLImageElement, rotDeg: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isRot90or270 = rotDeg === 90 || rotDeg === 270;
    const naturalW = img.naturalWidth || 400;
    const naturalH = img.naturalHeight || 300;
    const rotW = isRot90or270 ? naturalH : naturalW;
    const rotH = isRot90or270 ? naturalW : naturalH;

    canvas.width = rotW;
    canvas.height = rotH;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, rotW, rotH);
      ctx.save();
      ctx.translate(rotW / 2, rotH / 2);
      ctx.rotate((rotDeg * Math.PI) / 180);
      ctx.drawImage(img, -naturalW / 2, -naturalH / 2);
      ctx.restore();
    }
  }, []);

  // Reset when opening or image changes
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setImageLoaded(false);
    setRotation(0);
    setCrop({ x: 5, y: 5, width: 90, height: 90 });
    setIsProcessing(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      sourceImgRef.current = img;
      setImageLoaded(true);
      requestAnimationFrame(() => {
        renderRotated(img, 0);
      });
    };
    img.onerror = () => {
      setImageLoaded(false);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl, renderRotated]);

  // Handle pointer down on handles or crop box
  const handlePointerDown = (handle: DragHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    setDragHandle(handle);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialCrop: { ...crop },
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const deltaXPercent = ((moveEvent.clientX - dragStartRef.current.clientX) / rect.width) * 100;
      const deltaYPercent = ((moveEvent.clientY - dragStartRef.current.clientY) / rect.height) * 100;
      const init = dragStartRef.current.initialCrop;

      setCrop(() => {
        let newX = init.x;
        let newY = init.y;
        let newW = init.width;
        let newH = init.height;

        const MIN_SIZE = 5;

        switch (handle) {
          case 'move':
            newX = Math.max(0, Math.min(100 - init.width, init.x + deltaXPercent));
            newY = Math.max(0, Math.min(100 - init.height, init.y + deltaYPercent));
            break;
          case 'tl':
            newX = Math.max(0, Math.min(init.x + init.width - MIN_SIZE, init.x + deltaXPercent));
            newY = Math.max(0, Math.min(init.y + init.height - MIN_SIZE, init.y + deltaYPercent));
            newW = init.width - (newX - init.x);
            newH = init.height - (newY - init.y);
            break;
          case 'tr':
            newY = Math.max(0, Math.min(init.y + init.height - MIN_SIZE, init.y + deltaYPercent));
            newW = Math.max(MIN_SIZE, Math.min(100 - init.x, init.width + deltaXPercent));
            newH = init.height - (newY - init.y);
            break;
          case 'bl':
            newX = Math.max(0, Math.min(init.x + init.width - MIN_SIZE, init.x + deltaXPercent));
            newW = init.width - (newX - init.x);
            newH = Math.max(MIN_SIZE, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          case 'br':
            newW = Math.max(MIN_SIZE, Math.min(100 - init.x, init.width + deltaXPercent));
            newH = Math.max(MIN_SIZE, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          case 'top':
            newY = Math.max(0, Math.min(init.y + init.height - MIN_SIZE, init.y + deltaYPercent));
            newH = init.height - (newY - init.y);
            break;
          case 'bottom':
            newH = Math.max(MIN_SIZE, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          case 'left':
            newX = Math.max(0, Math.min(init.x + init.width - MIN_SIZE, init.x + deltaXPercent));
            newW = init.width - (newX - init.x);
            break;
          case 'right':
            newW = Math.max(MIN_SIZE, Math.min(100 - init.x, init.width + deltaXPercent));
            break;
        }

        return {
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        };
      });
    };

    const handlePointerUp = () => {
      setDragHandle(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleResetFull = () => {
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
  };

  const handleSetSquare = () => {
    setCrop((prev) => {
      const size = Math.min(prev.width, prev.height, 80);
      return {
        x: Math.max(0, Math.min(100 - size, 50 - size / 2)),
        y: Math.max(0, Math.min(100 - size, 50 - size / 2)),
        width: size,
        height: size,
      };
    });
  };

  const handleRotate = () => {
    if (!sourceImgRef.current) return;
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    renderRotated(sourceImgRef.current, nextRot);
    setCrop({ x: 5, y: 5, width: 90, height: 90 });
  };

  const executeCrop = () => {
    if (isProcessing) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      onClose();
      return;
    }
    setIsProcessing(true);

    try {
      const cropX = Math.round((crop.x / 100) * canvas.width);
      const cropY = Math.round((crop.y / 100) * canvas.height);
      const cropW = Math.max(1, Math.round((crop.width / 100) * canvas.width));
      const cropH = Math.max(1, Math.round((crop.height / 100) * canvas.height));

      let finalW = cropW;
      let finalH = cropH;
      const maxDim = 1000;
      if (finalW > maxDim || finalH > maxDim) {
        if (finalW > finalH) {
          finalH = Math.round((finalH * maxDim) / finalW);
          finalW = maxDim;
        } else {
          finalW = Math.round((finalW * maxDim) / finalH);
          finalH = maxDim;
        }
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.max(1, finalW);
      outCanvas.height = Math.max(1, finalH);
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Output context unavailable');

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      // Fill clean white background so diagram lines and symbols stay crisp and high-contrast
      outCtx.fillStyle = '#ffffff';
      outCtx.fillRect(0, 0, finalW, finalH);
      outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

      let croppedDataUrl = outCanvas.toDataURL('image/webp', 0.85);
      if (!croppedDataUrl.startsWith('data:image/webp')) {
        croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.85);
      }
      onApplyCrop(croppedDataUrl);
      onClose();
    } catch (err) {
      console.error('Cropping error:', err);
      onApplyCrop(imageUrl);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="diagram-crop-modal-overlay" 
        className={APP_STYLES.cropTools.overlay}
      >
        <motion.div
          variants={studioBackdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0"
        />

        <motion.div
          variants={studioModalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={APP_STYLES.cropTools.modal}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 text-[#0084ff] flex items-center justify-center">
                <CropIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Crop & Resize Diagram</h3>
                <p className="text-[11px] text-zinc-400">Drag frame handles or rotate to adjust image framing</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close without saving"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Crop Body */}
          <div className={APP_STYLES.cropTools.body}>
            {!imageLoaded && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-[#0084ff]" />
                <span>Loading diagram for crop...</span>
              </div>
            )}

            <div 
              ref={containerRef}
              className={`relative max-w-full max-h-[52vh] flex items-center justify-center select-none ${
                imageLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[50vh] object-contain rounded-lg pointer-events-none select-none block"
                style={{
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: '50vh',
                }}
              />

              {imageLoaded && (
                <>
                  {/* Darkened outside overlay */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse at center, transparent 0%, transparent 100%)`,
                      boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.65)`,
                      clipPath: `polygon(
                        0% 0%, 0% 100%, 
                        ${crop.x}% 100%, 
                        ${crop.x}% ${crop.y}%, 
                        ${crop.x + crop.width}% ${crop.y}%, 
                        ${crop.x + crop.width}% ${crop.y + crop.height}%, 
                        ${crop.x}% ${crop.y + crop.height}%, 
                        ${crop.x}% 100%, 
                        100% 100%, 100% 0%
                      )`,
                    }}
                  />

                  {/* Crop Bounding Box */}
                  <div
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => handlePointerDown('move', e)}
                    className="absolute border-2 border-[#0084ff] bg-transparent cursor-move group z-20 shadow-sm"
                  >
                    {/* Grid lines */}
                    <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity">
                      <div className="border-r border-b border-[#0084ff]/40" />
                      <div className="border-r border-b border-[#0084ff]/40" />
                      <div className="border-b border-[#0084ff]/40" />
                      <div className="border-r border-b border-[#0084ff]/40" />
                      <div className="border-r border-b border-[#0084ff]/40" />
                      <div className="border-b border-[#0084ff]/40" />
                      <div className="border-r border-[#0084ff]/40" />
                      <div className="border-r border-[#0084ff]/40" />
                      <div />
                    </div>

                    {/* Move indicator */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
                      <Move className="w-3 h-3" />
                    </div>

                    {/* Corner Handles */}
                    <div
                      onPointerDown={(e) => handlePointerDown('tl', e)}
                      className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-[#0084ff] shadow-md cursor-nwse-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('tr', e)}
                      className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-[#0084ff] shadow-md cursor-nesw-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('bl', e)}
                      className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-[#0084ff] shadow-md cursor-nesw-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('br', e)}
                      className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-[#0084ff] shadow-md cursor-nwse-resize z-30"
                    />

                    {/* Edge Handles */}
                    <div
                      onPointerDown={(e) => handlePointerDown('top', e)}
                      className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-2 rounded-full bg-white border border-[#0084ff] cursor-ns-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('bottom', e)}
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-2 rounded-full bg-white border border-[#0084ff] cursor-ns-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('left', e)}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-6 rounded-full bg-white border border-[#0084ff] cursor-ew-resize z-30"
                    />
                    <div
                      onPointerDown={(e) => handlePointerDown('right', e)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-6 rounded-full bg-white border border-[#0084ff] cursor-ew-resize z-30"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Tools & Action Footer */}
          <div className={APP_STYLES.cropTools.footer}>
            {/* Aspect & Rotation Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleResetFull}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                title="Expand to full 100% image"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#0084ff]" />
                <span>Full Image</span>
              </button>

              <button
                type="button"
                onClick={handleSetSquare}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                title="Crop square 1:1"
              >
                <Square className="w-3.5 h-3.5 text-[#0084ff]" />
                <span>Square (1:1)</span>
              </button>

              <button
                type="button"
                onClick={handleRotate}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                title="Rotate 90 degrees clockwise"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#0084ff]" />
                <span>Rotate 90°</span>
              </button>
            </div>

            {/* Cancel & Apply */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={executeCrop}
                disabled={isProcessing}
                className="px-4 py-1.5 rounded-xl bg-[#0084ff] hover:bg-blue-600 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cropping...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Crop</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
