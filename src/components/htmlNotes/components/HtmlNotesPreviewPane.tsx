import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, ImagePlus, Code, Table, Sparkles } from 'lucide-react';
import { getDomSelectionBoundingRect, type SelectionRect } from '../utils/selectionPositionUtils';
import { HtmlNotesSlantEditPopover } from './HtmlNotesSlantEditPopover';
import { HtmlNotesZoomControls } from './HtmlNotesZoomControls';
import { compressImageForDocument } from '../utils/imageCompressor';

import { type ViewportMode } from '../types';

export interface HtmlNotesPreviewPaneHandle {
  scrollToHeading: (headingText: string, headingIndex?: number) => void;
  insertSnippetAtCaret: (snippet: string) => void;
  insertImage: (dataUrl: string, fileName?: string) => void;
}

interface HtmlNotesPreviewPaneProps {
  viewMode: 'split' | 'editor' | 'preview';
  viewportMode: ViewportMode;
  splitRatio: number;
  isDark: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  srcDoc: string;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  applyIframeZoom?: (zoom: number) => void;
  // Search state
  isPreviewSearchOpen: boolean;
  previewSearchTerm: string;
  previewMatchCount: number;
  currentPreviewMatchIdx: number;
  previewSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onPreviewSearchChange: (val: string) => void;
  onPrevPreviewMatch: () => void;
  onNextPreviewMatch: () => void;
  onClosePreviewSearch: () => void;
  code: string;
  onCodeChange?: (newCode: string) => void;
  sideMarginMm?: number;
  verticalMarginMm?: number;
  totalLeftMarginMm?: number;
  fontSizePx?: number;
  // Image Insertion
  onTriggerInsertImage: () => void;
  onInsertImageSnippet?: (dataUrl: string, fileName?: string) => void;
  onInsertDropdown?: () => void;
  onRefineSelection?: (selectedText: string) => void;
  onPromptAiTopicHere?: (promptText: string, charIndex?: number) => void;
  onInsertSnippetHere?: (snippet: string, charIndex?: number) => void;
  onPreviewTextSelected?: (selectedText: string) => void;
  activeSelectionPane?: 'editor' | 'preview' | null;
  isSelectRefiningModeEnabled?: boolean;
  onToggleSelectRefiningMode?: () => void;
  onSubmitSlantEdit?: (prompt: string, selectedText: string) => Promise<void>;
  isSlantLoading?: boolean;
  onOpenFullAiPanel?: (selectedText: string) => void;
  isResizing?: boolean;
  isVisualEditActive?: boolean;
  onToggleVisualEdit?: () => void;
}

export const HtmlNotesPreviewPane = React.forwardRef<HtmlNotesPreviewPaneHandle, HtmlNotesPreviewPaneProps>(({
  viewMode,
  viewportMode,
  splitRatio,
  isDark,
  iframeRef,
  srcDoc,
  zoomLevel,
  isResizing = false,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  applyIframeZoom,
  isPreviewSearchOpen,
  previewSearchTerm,
  previewMatchCount,
  currentPreviewMatchIdx,
  previewSearchInputRef,
  onPreviewSearchChange,
  onPrevPreviewMatch,
  onNextPreviewMatch,
  onClosePreviewSearch,
  code,
  onCodeChange,
  sideMarginMm = 5,
  verticalMarginMm = 8,
  totalLeftMarginMm = 5,
  fontSizePx = 15,
  onTriggerInsertImage,
  onInsertImageSnippet,
  onInsertDropdown,
  onRefineSelection,
  onPromptAiTopicHere,
  onInsertSnippetHere,
  onPreviewTextSelected,
  activeSelectionPane,
  isSelectRefiningModeEnabled = true,
  onToggleSelectRefiningMode = () => {},
  onSubmitSlantEdit,
  isSlantLoading,
  onOpenFullAiPanel,
  isVisualEditActive = false,
  onToggleVisualEdit,
}, ref) => {
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [previewSelection, setPreviewSelection] = useState<string>('');
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  useEffect(() => {
    if (activeSelectionPane !== 'preview') {
      setPreviewSelection('');
      setSelectionRect(null);
    }
  }, [activeSelectionPane]);

  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const syncKaTeX = () => {
      try {
        if (iframe.contentWindow) {
          (iframe.contentWindow as any).katex = (window as any).katex;
          (iframe.contentWindow as any).renderMathInElement = (window as any).renderMathInElement;
          if (typeof (iframe.contentWindow as any).renderKaTeXMathInDocument === 'function') {
            (iframe.contentWindow as any).renderKaTeXMathInDocument();
          }
        }
      } catch (e) {}
    };
    iframe.addEventListener('load', syncKaTeX);
    syncKaTeX();
    return () => iframe.removeEventListener('load', syncKaTeX);
  }, [srcDoc, iframeRef]);


  const handleSelectionCheck = useCallback(() => {
    let selText = '';

    // Helper to check if active focus is inside AI Assistant panel or input controls
    const isFocusInAiPanel = () => {
      if (typeof document === 'undefined') return false;
      const activeEl = document.activeElement;
      if (!activeEl) return false;
      return Boolean(
        activeEl.closest?.('aside') ||
        activeEl.closest?.('.studio-ai-panel') ||
        activeEl.closest?.('[role="dialog"]') ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'BUTTON'
      );
    };

    // 1. Check window selection (canvas mode or preview stage within preview canvas)
    try {
      const sel = window.getSelection();
      const winSel = sel?.toString().trim();
      if (winSel && winSel.length > 1) {
        const node = sel?.anchorNode ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
        if (previewCanvasRef.current && node && previewCanvasRef.current.contains(node)) {
          selText = winSel;
        }
      }
    } catch (e) {}

    // 2. Check iframe selection (A4 paper mode)
    if (!selText && iframeRef.current) {
      try {
        const iframeWin = iframeRef.current.contentWindow;
        const iframeDoc = iframeRef.current.contentDocument || iframeWin?.document;
        if (iframeWin && iframeDoc) {
          const frameSel = iframeWin.getSelection();
          const text = frameSel?.toString().trim();
          if (text && text.length > 1) {
            selText = text;
            if (frameSel && frameSel.rangeCount > 0 && !frameSel.isCollapsed) {
              const r = frameSel.getRangeAt(0).getBoundingClientRect();
              const iframeRect = iframeRef.current.getBoundingClientRect();
              const containerRect = previewCanvasRef.current?.getBoundingClientRect() || iframeRect;

              const selTop = (iframeRect.top - containerRect.top) + r.top;
              const selBottom = (iframeRect.top - containerRect.top) + (r.bottom || (r.top + (r.height || 20)));
              const selRight = r.right || (r.left + (r.width || 100));
              const selCenterX = (iframeRect.left - containerRect.left) + (r.left + selRight) / 2;

              // Place immediately bottomwards of selection, or flip above if near bottom edge
              let top = selBottom + 8;
              if (top + 45 > containerRect.height - 16) {
                top = Math.max(16, selTop - 42);
              }
              const left = Math.max(16, Math.min(containerRect.width - 160, selCenterX - 75));

              setSelectionRect({
                top,
                left,
                width: r.width,
                height: r.height
              });
            }
          }
        }
      } catch (e) {}
    }

    if (selText) {
      setPreviewSelection(selText);
      if (!selectionRect) {
        const rect = getDomSelectionBoundingRect(previewCanvasRef.current);
        if (rect) setSelectionRect(rect);
      }
      if (onPreviewTextSelected) {
        onPreviewTextSelected(selText);
      }
    } else {
      setPreviewSelection('');
      setSelectionRect(null);
      // ONLY clear selection if focus did not shift into the AI Assistant panel or input bar
      if (!isFocusInAiPanel() && onPreviewTextSelected) {
        onPreviewTextSelected('');
      }
    }
  }, [iframeRef, onPreviewTextSelected, selectionRect]);

  const handleMouseUp = useCallback(() => {
    setTimeout(handleSelectionCheck, 60);
  }, [handleSelectionCheck]);

  useEffect(() => {
    const handleSelectionChange = () => {
      setTimeout(handleSelectionCheck, 60);
    };

    const handlePostMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'STUDIO_PREVIEW_SELECTION' && typeof e.data.text === 'string') {
        const sel = e.data.text.trim();
        if (sel) {
          setPreviewSelection(sel);
          if (e.data.rect && iframeRef.current && previewCanvasRef.current) {
            const iframeRect = iframeRef.current.getBoundingClientRect();
            const containerRect = previewCanvasRef.current.getBoundingClientRect();
            const r = e.data.rect;
            const selTop = (iframeRect.top - containerRect.top) + r.top;
            const selBottom = (iframeRect.top - containerRect.top) + (r.bottom || (r.top + (r.height || 20)));
            const selRight = r.right || (r.left + (r.width || 100));
            const selCenterX = (iframeRect.left - containerRect.left) + (r.left + selRight) / 2;

            let top = selBottom + 8;
            if (top + 45 > containerRect.height - 16) {
              top = Math.max(16, selTop - 42);
            }
            const left = Math.max(16, Math.min(containerRect.width - 160, selCenterX - 75));

            setSelectionRect({
              top,
              left,
              width: e.data.rect.width,
              height: e.data.rect.height
            });
          } else {
            const rect = getDomSelectionBoundingRect(previewCanvasRef.current);
            setSelectionRect(rect);
          }
          if (onPreviewTextSelected) {
            onPreviewTextSelected(sel);
          }
        } else {
          setPreviewSelection('');
          setSelectionRect(null);
          // Only wipe selection if focus is NOT inside AI Assistant panel/inputs
          const activeEl = document.activeElement;
          const isFocusInAiPanel = activeEl && (
            activeEl.closest?.('aside') ||
            activeEl.closest?.('.studio-ai-panel') ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'INPUT'
          );
          if (!isFocusInAiPanel && onPreviewTextSelected) {
            onPreviewTextSelected('');
          }
        }
      }
    };
    window.addEventListener('message', handlePostMessage);

    // Attach listeners on main document
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);

    // Attach listeners on iframe document
    let activeIframeDoc: Document | null = null;
    const attachIframeListeners = () => {
      if (iframeRef.current) {
        try {
          const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
          if (doc) {
            activeIframeDoc = doc;
            doc.addEventListener('mouseup', handleMouseUp);
            doc.addEventListener('selectionchange', handleSelectionChange);
          }
        } catch (e) {}
      }
    };

    attachIframeListeners();

    const currentIframe = iframeRef.current;
    if (currentIframe) {
      currentIframe.addEventListener('load', attachIframeListeners);
    }

    return () => {
      window.removeEventListener('message', handlePostMessage);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (activeIframeDoc) {
        try {
          activeIframeDoc.removeEventListener('mouseup', handleMouseUp);
          activeIframeDoc.removeEventListener('selectionchange', handleSelectionChange);
        } catch (e) {}
      }
      if (currentIframe) {
        currentIframe.removeEventListener('load', attachIframeListeners);
      }
    };
  }, [iframeRef, srcDoc, viewportMode, handleMouseUp, handleSelectionCheck, onPreviewTextSelected]);

  const [isDragOverDropzone, setIsDragOverDropzone] = useState<boolean>(false);

  const isImageUrlString = (str: string): boolean => {
    if (!str) return false;
    const trimmed = str.trim();
    if (trimmed.startsWith('data:image/')) return true;
    if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|svg|avif)(\?.*)?$/i.test(trimmed)) return true;
    if (/^https?:\/\/images\.unsplash\.com\/.+/i.test(trimmed)) return true;
    if (/^https?:\/\/.*googleusercontent\.com\/.+/i.test(trimmed)) return true;
    return false;
  };

  const handleDirectInsertImage = useCallback(async (dataUrl: string, fileName?: string, clientX?: number, clientY?: number) => {
    const compressed = await compressImageForDocument(dataUrl);
    if (iframeRef.current?.contentWindow) {
      try {
        let x = clientX;
        let y = clientY;
        if (clientX !== undefined && clientY !== undefined && iframeRef.current) {
          const rect = iframeRef.current.getBoundingClientRect();
          x = clientX - rect.left;
          y = clientY - rect.top;
        }
        iframeRef.current.contentWindow.postMessage({
          type: 'STUDIO_INSERT_IMAGE_CANVAS',
          dataUrl: compressed,
          fileName: fileName || 'Diagram',
          x,
          y
        }, '*');
        return;
      } catch (err) {}
    }
    if (onInsertImageSnippet) {
      onInsertImageSnippet(compressed, fileName);
    }
  }, [iframeRef, onInsertImageSnippet]);

  React.useImperativeHandle(ref, () => ({
    scrollToHeading: (headingText: string, headingIndex?: number) => {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({ type: 'SCROLL_TO_HEADING', headingText, headingIndex }, '*');
        } catch (e) {}
      }
    },
    insertSnippetAtCaret: (snippet: string) => {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({ type: 'STUDIO_INSERT_SNIPPET', snippet }, '*');
        } catch (e) {}
      }
    },
    insertImage: (dataUrl: string, fileName?: string) => {
      handleDirectInsertImage(dataUrl, fileName);
    }
  }), [iframeRef, handleDirectInsertImage]);

  const lastMouseCoordsRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const handleContainerPaste = async (e: React.ClipboardEvent | ClipboardEvent) => {
    const clipboardData = (e as any).clipboardData;
    if (!clipboardData) return;

    const coords = lastMouseCoordsRef.current;

    // 1. Check for binary image files in clipboard
    const items = clipboardData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            try {
              const compressed = await compressImageForDocument(file);
              handleDirectInsertImage(compressed, file.name || 'Pasted Image', coords?.clientX, coords?.clientY);
            } catch {
              const reader = new FileReader();
              reader.onload = (evt) => {
                const base64 = evt.target?.result as string;
                if (base64) handleDirectInsertImage(base64, file.name || 'Pasted Image', coords?.clientX, coords?.clientY);
              };
              reader.readAsDataURL(file);
            }
          }
          return;
        }
      }
    }

    // 2. Check for copied HTML with <img src="...">
    const htmlText = clipboardData.getData('text/html');
    if (htmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const pastedImg = doc.querySelector('img');
      if (pastedImg && pastedImg.src) {
        e.preventDefault();
        handleDirectInsertImage(pastedImg.src, pastedImg.alt || 'Pasted Image', coords?.clientX, coords?.clientY);
        return;
      }
    }

    // 3. Check for direct image URL in plain text
    const plainText = clipboardData.getData('text/plain');
    if (plainText && isImageUrlString(plainText)) {
      e.preventDefault();
      handleDirectInsertImage(plainText.trim(), 'Pasted Image URL', coords?.clientX, coords?.clientY);
      return;
    }
  };

  // Global window paste when preview pane has mouse focus or is active
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      // Do not steal paste when user is typing in code editor, textarea, or input
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.closest?.('.code-container'))) {
        return;
      }
      if (previewCanvasRef.current && (previewCanvasRef.current.matches(':hover') || previewCanvasRef.current.contains(activeEl))) {
        handleContainerPaste(e);
      }
    };

    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [handleDirectInsertImage]);

  const handleContainerDragOver = (e: React.DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const types = Array.from(dt.types || []);
    if (types.includes('Files') || types.includes('text/html') || types.includes('text/uri-list')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverDropzone(true);
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only deactivate if leaving the container boundary
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverDropzone(false);
    }
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    setIsDragOverDropzone(false);
    const dt = e.dataTransfer;
    if (!dt) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    // 1. Files drop
    if (dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      if (file && file.type.indexOf('image') !== -1) {
        e.preventDefault();
        e.stopPropagation();
        try {
          compressImageForDocument(file).then((compressed) => {
            handleDirectInsertImage(compressed, file.name, clientX, clientY);
          }).catch(() => {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const base64 = evt.target?.result as string;
              if (base64) handleDirectInsertImage(base64, file.name, clientX, clientY);
            };
            reader.readAsDataURL(file);
          });
        } catch {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const base64 = evt.target?.result as string;
            if (base64) handleDirectInsertImage(base64, file.name, clientX, clientY);
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }

    // 2. Dragged web image (HTML)
    const htmlText = dt.getData('text/html');
    if (htmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const draggedImg = doc.querySelector('img');
      if (draggedImg && draggedImg.src) {
        e.preventDefault();
        e.stopPropagation();
        handleDirectInsertImage(draggedImg.src, draggedImg.alt || 'Dragged Image', clientX, clientY);
        return;
      }
    }

    // 3. Dragged URI / link
    const uriList = dt.getData('text/uri-list') || dt.getData('URL');
    if (uriList && isImageUrlString(uriList)) {
      e.preventDefault();
      e.stopPropagation();
      handleDirectInsertImage(uriList.trim(), 'Dragged Web Image', clientX, clientY);
      return;
    }

    // 4. Plain text URL
    const plainText = dt.getData('text/plain');
    if (plainText && isImageUrlString(plainText)) {
      e.preventDefault();
      e.stopPropagation();
      handleDirectInsertImage(plainText.trim(), 'Dragged Image URL', clientX, clientY);
      return;
    }
  };

  return (
    <section 
      className="pane preview-pane"
      style={{ 
        display: 'flex',
        flexDirection: 'column',
        width: viewMode === 'split' ? `calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        flex: viewMode === 'split' ? `0 0 calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '1 1 0%',
        maxWidth: viewMode === 'split' ? `calc(100% - var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Visual Canvas Edit Mode Active Top Banner */}
      {isVisualEditActive && (
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white text-xs font-medium z-30 shadow-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse shrink-0" />
            <span className="truncate">
              <strong>Visual Edit Active:</strong> Click text to type inline, insert images directly, drag & stretch images
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onTriggerInsertImage}
              className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold flex items-center gap-1 border-0 cursor-pointer transition-all active:scale-95"
              title="Insert Image into Preview Canvas"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>+ Image</span>
            </button>
            {onToggleVisualEdit && (
              <button
                type="button"
                onClick={onToggleVisualEdit}
                className="px-3 py-1 rounded-full bg-white text-emerald-900 hover:bg-emerald-50 text-[11px] font-bold border-0 cursor-pointer shadow-xs transition-all active:scale-95"
                title="Finish Visual Editing"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dedicated Preview Search Bar */}
      {isPreviewSearchOpen && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800/95 border-b border-slate-200 dark:border-zinc-700 text-xs shrink-0 z-20 shadow-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={previewSearchInputRef}
            type="text"
            value={previewSearchTerm}
            onChange={(e) => onPreviewSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) onPrevPreviewMatch();
                else onNextPreviewMatch();
              } else if (e.key === 'Escape') {
                onClosePreviewSearch();
              }
            }}
            placeholder="Find text in preview..."
            className="flex-1 min-w-[120px] px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-blue-500 text-slate-900 dark:text-white"
            autoFocus
          />
          <span className="text-[10px] text-slate-500 font-medium px-1 whitespace-nowrap">
            {previewMatchCount > 0 ? `${currentPreviewMatchIdx + 1}/${previewMatchCount}` : (previewSearchTerm ? '0/0' : '')}
          </span>
          <button
            onClick={onPrevPreviewMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Previous Match (Shift+Enter)"
            disabled={previewMatchCount === 0}
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={onNextPreviewMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Next Match (Enter)"
            disabled={previewMatchCount === 0}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={onClosePreviewSearch}
            className="round-icon"
            style={{ width: '20px', height: '20px', border: 0 }}
            title="Close Preview Search"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Canvas Container with Centered Stage */}
      <div 
        ref={previewCanvasRef}
        onMouseMove={(e) => {
          lastMouseCoordsRef.current = { clientX: e.clientX, clientY: e.clientY };
        }}
        onMouseUp={handleMouseUp}
        onKeyUp={handleMouseUp}
        onPaste={handleContainerPaste}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
        className="preview-canvas-wrapper"
        data-scrollable="true"
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          flex: '1 1 0%',
          minHeight: 0,
          overflow: 'hidden',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Visual Dropzone Overlay when Dragging Image from Desktop or Web */}
        {isDragOverDropzone && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-500/10 dark:bg-blue-600/15 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-lg pointer-events-none transition-all duration-200">
            <div className="flex flex-col items-center gap-3 p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-800 animate-in fade-in zoom-in-95">
              <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <ImagePlus className="w-7 h-7 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Drop image here to insert</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Supports PNG, JPG, WebP, SVG, and web images</p>
              </div>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title="Notes Studio Preview Engine"
          srcDoc={srcDoc}
          className="w-full h-full border-0 block bg-white dark:bg-[#14161d]"
          style={{ width: '100%', height: '100%', border: 0, display: 'block', pointerEvents: isResizing ? 'none' : 'auto', touchAction: 'pan-x pan-y' }}
        />

        {/* Floating Zoom Controls Pill */}
        <HtmlNotesZoomControls
          zoomLevel={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
        />

        {/* Floating Slant AI Edit Popover for Preview Canvas */}
        {previewSelection && selectionRect && onSubmitSlantEdit && (
          <HtmlNotesSlantEditPopover
            selectedText={previewSelection}
            position={{ top: selectionRect.top, left: selectionRect.left }}
            onClose={() => {
              setPreviewSelection('');
              setSelectionRect(null);
              if (onPreviewTextSelected) onPreviewTextSelected('');
            }}
            onSubmitEdit={onSubmitSlantEdit}
            isLoading={Boolean(isSlantLoading)}
            onOpenFullAiPanel={onOpenFullAiPanel}
            paneMode="preview"
          />
        )}
      </div>
    </section>
  );
});

