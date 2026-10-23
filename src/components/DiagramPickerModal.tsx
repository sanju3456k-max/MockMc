import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, 
  Upload, 
  Trash2, 
  Check, 
  AlertCircle, 
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  Pin,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Image as ImageIcon
} from 'lucide-react';
import { 
  compressImageToDataUrl,
  normalizeDiagramUrl,
} from '../lib/diagramPresets';
import { MathRenderer } from './MathRenderer';
import { generateProceduralExamSvg } from '../utils/diagramSynthesizer';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { APP_STYLES } from './ui/AppStyles';

export type DiagramTargetType = 'question' | 'option' | 'explanation';

export interface DiagramPickerModalProps {
  isOpen: boolean;
  initialImageUrl?: string;
  onClose: () => void;
  onApply: (imageUrl: string | undefined) => void;
  questionNumber?: number;
  targetType?: DiagramTargetType;
  targetTitle?: string;
  contextLabel?: string;
  targetContextText?: string;
  questionText?: string;
  questionOptions?: string[];
  questionExplanation?: string;
  optionIndex?: number;
}

export const DiagramPickerModal: React.FC<DiagramPickerModalProps> = ({
  isOpen,
  initialImageUrl,
  onClose,
  onApply,
  questionNumber,
  targetType = 'question',
  targetTitle,
  contextLabel,
  targetContextText,
  questionText,
  questionOptions = [],
  questionExplanation,
  optionIndex,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'upload'>('generate');
  const [currentUrl, setCurrentUrl] = useState<string>(initialImageUrl || '');
  const [currentSvg, setCurrentSvg] = useState<string>('');
  const [promptInput, setPromptInput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isExpandedPreview, setIsExpandedPreview] = useState(false);
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when modal is open
  useScrollLock(isOpen);

  // System gesture & back navigation handling to close Diagram Picker modal
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 45,
    id: 'diagram_picker_modal',
  });

  // Derive initial prompt suggestion or default
  const defaultPrompt = useMemo(() => {
    const rawText = targetContextText || questionText || '';
    if (!rawText) return '';
    
    // Clean out LaTeX math markers and commands
    const clean = rawText
      .replace(/\\begin\{[a-zA-Z*]+\}/g, '')
      .replace(/\\end\{[a-zA-Z*]+\}/g, '')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[$#*`&\\{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length > 90) {
      return clean.slice(0, 80) + '...';
    }
    return clean;
  }, [targetContextText, questionText]);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setCurrentUrl(initialImageUrl || '');
      setPromptInput('');
      setErrorMessage('');
      setIsExpandedPreview(false);
      setIsContextDrawerOpen(false);

      if (initialImageUrl && initialImageUrl.includes('data:image/svg+xml')) {
        try {
          if (initialImageUrl.includes('data:image/svg+xml;utf8,')) {
            const raw = decodeURIComponent(initialImageUrl.replace('data:image/svg+xml;utf8,', ''));
            setCurrentSvg(raw);
          } else if (initialImageUrl.includes('data:image/svg+xml;base64,')) {
            const b64 = initialImageUrl.replace('data:image/svg+xml;base64,', '');
            setCurrentSvg(atob(b64));
          } else {
            setCurrentSvg('');
          }
        } catch {
          setCurrentSvg('');
        }
      } else {
        setCurrentSvg('');
      }
    }
  }, [isOpen, initialImageUrl]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'upload') return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      // Avoid intercepting if user is inside an input/textarea
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        handleFileUpload(e.clipboardData.files[0]);
      } else if (e.clipboardData) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleFileUpload(file);
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessingUpload(true);
      setErrorMessage('');
      const compressedDataUrl = await compressImageToDataUrl(file);
      setCurrentUrl(compressedDataUrl);
      setCurrentSvg('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process image file');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleEditablePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      handleFileUpload(e.clipboardData.files[0]);
    } else if (e.clipboardData) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileUpload(file);
            break;
          }
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFileUpload(e.clipboardData.files[0]);
    } else if (e.clipboardData) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleFileUpload(file);
            break;
          }
        }
      }
    }
    // Clear any text if somehow entered
    e.currentTarget.value = '';
  };

  const generateProceduralFallbackSvg = (prompt: string): string => {
    return generateProceduralExamSvg({
      promptText: prompt,
      questionText: questionText || '',
      options: questionOptions || [],
      explanation: questionExplanation || '',
      targetType: (targetType as 'question' | 'option' | 'explanation') || 'question',
      optionIndex,
      targetContextText: targetContextText || ''
    });
  };

  const handleGenerate = async (customPrompt?: string) => {
    const effectivePrompt = (customPrompt !== undefined ? customPrompt : promptInput).trim();
    
    try {
      setIsGenerating(true);
      setErrorMessage('');

      const res = await fetch('/api/generate-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt || defaultPrompt || 'Scientific technical diagram',
          targetType,
          optionIndex,
          targetContextText: targetContextText || '',
          questionText: questionText || '',
          questionOptions: questionOptions || [],
          questionExplanation: questionExplanation || '',
          currentSvg: currentSvg || '',
          mode: currentUrl ? 'edit' : 'generate',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.imageUrl) {
          setCurrentUrl(data.imageUrl);
          if (data.svg) setCurrentSvg(data.svg);
          setPromptInput('');
          return;
        }
      }

      // Procedural fallback
      const fallbackSvg = generateProceduralFallbackSvg(effectivePrompt);
      setCurrentSvg(fallbackSvg);
      setCurrentUrl(`data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`);
      setPromptInput('');
    } catch (err: any) {
      console.warn('Diagram generator fallback invoked:', err);
      const fallbackSvg = generateProceduralFallbackSvg(effectivePrompt);
      setCurrentSvg(fallbackSvg);
      setCurrentUrl(`data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`);
      setPromptInput('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    const clean = currentUrl.trim();
    onApply(clean ? normalizeDiagramUrl(clean) : undefined);
    onClose();
  };

  const handleRemove = () => {
    setCurrentUrl('');
    setCurrentSvg('');
    onApply(undefined);
  };

  const headerTargetBadge = (
    <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#0084ff] dark:text-blue-300 shrink-0 whitespace-nowrap">
      {targetType === 'option'
        ? `Option ${optionIndex !== undefined ? String.fromCharCode(65 + optionIndex) : ''} • Q${questionNumber || 1}`
        : targetType === 'explanation'
        ? `Solution • Q${questionNumber || 1}`
        : `Q${questionNumber || 1}`}
    </span>
  );

  return (
    <div
      className={APP_STYLES.modal.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-black rounded-3xl w-full max-w-4xl h-[92vh] max-h-[820px] flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100 dark:border dark:border-[#1c1c1e]">
        
        {/* 1. MINIMAL TOP HEADER */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-1.5 sm:gap-3 shrink-0 border-b border-slate-100 dark:border-zinc-800/60 bg-white dark:bg-black">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 overflow-hidden">
            <h3 className="text-xs sm:text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight truncate shrink-0">
              <span className="hidden xs:inline">Generate </span>Diagram
            </h3>
            {headerTargetBadge}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Upper Two Mode Toggle Buttons */}
            <div className="flex items-center bg-slate-100 dark:bg-[#23252e] p-0.5 sm:p-1 rounded-full text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('generate')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'generate'
                    ? 'bg-white dark:bg-[#18191f] text-[#0084ff] font-extrabold shadow-2xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0084ff] shrink-0" />
                <span className="hidden sm:inline">Generate Image</span>
                <span className="sm:hidden text-[11px]">Generate</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white dark:bg-[#18191f] text-[#0084ff] font-extrabold shadow-2xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                <Upload className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs">Upload</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#23252e] dark:hover:bg-[#2e313d] text-slate-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* 2. BODY (DIAGRAM PREVIEW IN THE MIDDLE) */}
        <div className="flex-1 min-h-0 relative flex flex-col p-4 sm:p-5 bg-slate-50/60 dark:bg-[#121316] overflow-y-auto">
          
          {errorMessage && (
            <div className="mb-3 p-3 bg-rose-50 dark:bg-rose-950/60 rounded-2xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: GENERATE IMAGE - MAIN CENTRAL CANVAS */}
          {activeTab === 'generate' && (
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-[260px] w-full">
              {currentUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative p-3 bg-white dark:bg-black rounded-2xl dark:border dark:border-[#1c1c1e]">
                  {/* Floating Toolbar on top of diagram */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                    <button
                      type="button"
                      onClick={() => setIsExpandedPreview(!isExpandedPreview)}
                      className="p-1.5 rounded-full bg-slate-100/90 dark:bg-[#222634]/90 hover:bg-slate-200 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title={isExpandedPreview ? 'Fit to frame' : 'Expand full view'}
                    >
                      {isExpandedPreview ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Diagram Render */}
                  <div className="flex-1 w-full flex items-center justify-center overflow-hidden p-2">
                    {normalizeDiagramUrl(currentUrl) ? (
                      <img
                        src={normalizeDiagramUrl(currentUrl)}
                        alt="Generated Diagram"
                        className={`max-w-full object-contain transition-all rounded-lg ${
                          isExpandedPreview ? 'max-h-[460px]' : 'max-h-[300px] sm:max-h-[340px]'
                        }`}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-white dark:bg-[#050505] rounded-2xl text-center dark:border dark:border-[#1c1c1e]">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-[#0084ff] flex items-center justify-center mb-3">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Ready to Generate Diagram
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm leading-relaxed">
                    Question context is already pinned below. Click generate or type adjustments in the prompt bar to render your diagram.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGenerate(defaultPrompt || undefined)}
                    disabled={isGenerating}
                    className="mt-4 px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Generate from Question</span>
                  </button>
                </div>
              )}

              {/* Loading Overlay */}
              {isGenerating && (
                <div className="absolute inset-0 bg-white/80 dark:bg-black/90 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center z-20 gap-2.5">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0084ff]" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    {currentUrl ? 'Applying diagram adjustments...' : 'Generating high-precision diagram...'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UPLOAD */}
          {activeTab === 'upload' && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] w-full">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />

              {currentUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative p-3 bg-white dark:bg-black rounded-2xl dark:border dark:border-[#1c1c1e]">
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Change File
                    </button>
                  </div>

                  <div className="flex-1 w-full flex items-center justify-center overflow-hidden p-2">
                    {normalizeDiagramUrl(currentUrl) ? (
                      <img
                        src={normalizeDiagramUrl(currentUrl)}
                        alt="Uploaded Diagram"
                        className="max-h-[300px] max-w-full object-contain rounded-lg"
                      />
                    ) : null}
                  </div>

                  {/* Mobile Touch-and-Hold Paste Button */}
                  <div className="mt-2.5 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 dark:bg-[#20222b] dark:hover:bg-[#282a35] text-slate-700 dark:text-zinc-300 pointer-events-none transition-colors border-0 ring-0 outline-none shadow-none">
                      <Clipboard className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-semibold whitespace-nowrap">Tap & hold to paste image</span>
                    </div>
                    <input
                      type="text"
                      onPaste={handleInputPaste}
                      onChange={(e) => { e.target.value = ''; }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-center border-0 ring-0 outline-none shadow-none"
                      title="Tap & hold to paste image"
                      aria-label="Tap and hold to paste image"
                    />
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-[#18191f] rounded-2xl text-center cursor-pointer hover:bg-blue-50/20 transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-[#0084ff] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    {isProcessingUpload ? 'Processing file...' : 'Click to Upload, Drag & Drop or Paste Image'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xs">
                    Supports clipboard paste, PNG, JPG, WebP, or SVG format
                  </p>
 
                  {/* Focusable mobile paste target box */}
                  <div className="mt-5 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 dark:bg-[#20222b] dark:hover:bg-[#282a35] text-slate-700 dark:text-zinc-300 pointer-events-none transition-colors border-0 ring-0 outline-none shadow-none">
                      <Clipboard className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-semibold whitespace-nowrap">Tap & hold to paste image</span>
                    </div>
                    <input
                      type="text"
                      onPaste={handleInputPaste}
                      onChange={(e) => { e.target.value = ''; }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-center border-0 ring-0 outline-none shadow-none"
                      title="Tap & hold to paste image"
                      aria-label="Tap and hold to paste image"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. BOTTOM PROMPT BAR (GEMINI CHATBOT STYLE) */}
        {activeTab === 'generate' && (
          <div className="px-4 sm:px-6 pt-2 pb-3 bg-white dark:bg-black border-t border-slate-100 dark:border-zinc-800/60 shrink-0 space-y-2">
            
            {/* Pinned Question Context Badge (Expandable) */}
            {(targetContextText || questionText) && (
              <div className="flex flex-col">
                <div 
                  onClick={() => setIsContextDrawerOpen(!isContextDrawerOpen)}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-100 dark:bg-[#23252e] hover:bg-slate-200/70 dark:hover:bg-[#2b2e3a] rounded-xl cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Pin className="w-3.5 h-3.5 text-[#0084ff] shrink-0 rotate-45" />
                    <span className="text-[11px] font-bold text-[#0084ff] shrink-0">
                      Pinned Context:
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 truncate">
                      {contextLabel || `Question #${questionNumber || 1}`} — {defaultPrompt || 'Question & Formulas'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                    <span>{isContextDrawerOpen ? 'Hide' : 'View'}</span>
                    {isContextDrawerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </div>

                {/* Expanded Context Viewer with High-Fidelity MathRenderer */}
                {isContextDrawerOpen && (
                  <div className="mt-1.5 p-3 bg-slate-50 dark:bg-[#131418] rounded-xl text-xs leading-relaxed max-h-[110px] overflow-y-auto text-slate-800 dark:text-zinc-200">
                    <MathRenderer content={targetContextText || questionText || ''} />
                  </div>
                )}
              </div>
            )}

            {/* Prompt Input Form */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#23252e] px-3.5 py-1.5 rounded-2xl">
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={currentUrl ? "Describe modifications (e.g. 'Add angle θ=45°', 'Change vertex to (2,3)')..." : "Describe diagram (or leave blank to auto-generate from pinned context)..."}
                disabled={isGenerating}
                className="flex-1 bg-transparent py-1.5 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none"
              />

              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating}
                className="px-4 py-2 rounded-xl bg-[#0084ff] hover:bg-[#0073e6] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 active:scale-95"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{currentUrl ? 'Apply Edit' : 'Generate'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 4. MODAL ACTION FOOTER */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-black">
          <div>
            {currentUrl && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-full font-bold cursor-pointer transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Diagram</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#23252e] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!currentUrl && !initialImageUrl}
              className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Diagram</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiagramPickerModal;
