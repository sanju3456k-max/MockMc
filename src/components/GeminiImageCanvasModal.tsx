import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  X, 
  ArrowLeft,
  Sparkles, 
  Send, 
  Download, 
  Copy, 
  Check, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Code2, 
  Image as ImageIcon, 
  Sliders, 
  Edit3, 
  CheckCheck, 
  Play, 
  FileCode2
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { copyImageToClipboard } from '../lib/tableClipboard';

interface GeminiImageCanvasModalProps {
  imageUrl: string;
  index?: number;
  pythonCode?: string;
  messageText?: string;
  imagePrompt?: string;
  messageId?: string;
  onClose: () => void;
  onEditWithAi: (prompt: string, messageId?: string) => void;
  onRegenerateVariation?: () => void;
  isDarkMode?: boolean;
  isLoading?: boolean;
}

export const GeminiImageCanvasModal: React.FC<GeminiImageCanvasModalProps> = ({
  imageUrl,
  index = 0,
  pythonCode,
  messageText,
  imagePrompt,
  messageId,
  onClose,
  onEditWithAi,
  onRegenerateVariation,
  isDarkMode = false,
  isLoading = false
}) => {
  const [aiPrompt, setAiPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showCodeDrawer, setShowCodeDrawer] = useState(false);

  // Code formats & live editor state
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Back Navigation Handlers
  useBackHandler({
    isOpen: showCodeDrawer,
    onBack: () => setShowCodeDrawer(false),
    priority: 32,
    id: 'gemini_image_canvas_code_drawer'
  });

  useBackHandler({
    isOpen: true,
    onBack: onClose,
    priority: 30,
    id: 'gemini_image_canvas_modal'
  });

  const effectivePythonCode = (pythonCode && pythonCode.trim().length > 0)
    ? pythonCode
    : `# Python Matplotlib Script for Visual Plot Rendering
import matplotlib.pyplot as plt
import numpy as np

# Configure publication-grade styling
fig, ax = plt.subplots(figsize=(9, 6), dpi=150)
ax.set_title(${JSON.stringify(imagePrompt || messageText || 'Visual Plot Figure')}, fontsize=14, fontweight='bold', pad=15)
ax.set_xlabel('X Axis', fontsize=11)
ax.set_ylabel('Y Axis', fontsize=11)
ax.grid(True, linestyle='--', alpha=0.5)

plt.tight_layout()
plt.show()`;

  const activeCodeDisplay = useMemo(() => {
    return effectivePythonCode;
  }, [effectivePythonCode]);

  useEffect(() => {
    if (!isEditingCode) {
      setCustomCodeInput(activeCodeDisplay);
    }
  }, [activeCodeDisplay, isEditingCode]);

  const handleExecuteCustomCode = () => {
    if (!customCodeInput.trim() || isLoading) return;
    const promptToSend = `Please execute this modified Python Matplotlib script to re-render the plot:\n\`\`\`python\n${customCodeInput.trim()}\n\`\`\``;
    
    onEditWithAi(promptToSend, messageId);
    setShowCodeDrawer(false);
  };

  const isPlot = true;

  // Quick action prompt chips tailored specifically to whether it's a plot or image
  const quickPromptChips = isPlot ? [
    '✦ Switch to dark theme with glowing neon curves',
    '✦ Add 3D surface elevation mesh grid',
    '✦ Plot derivative & tangent lines',
    '✦ Highlight inflection & critical extrema points',
    '✦ Add colorbar & smooth contour gradient',
    '✦ Add comprehensive legend & scientific annotations',
    '✦ Increase plot resolution & font contrast'
  ] : [
    '✦ Enhance lighting & atmospheric golden hour glow',
    '✦ Switch to dark cyberpunk neon aesthetic',
    '✦ Change camera perspective to wide-angle aerial',
    '✦ Render as rich textured watercolor painting',
    '✦ Convert to clean modern minimalist vector',
    '✦ Add intricate photorealistic studio details',
    '✦ Change background setting & composition'
  ];

  const handleCopyImage = async () => {
    try {
      const success = await copyImageToClipboard(
        imageUrl, 
        isPlot ? `Figure ${index + 1}` : 'Visual Diagram', 
        messageText || imagePrompt
      );
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleSubmitAiPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || isLoading) return;
    const baseDesc = imagePrompt || messageText || 'this visual figure';
    const promptToSend = isPlot 
      ? `Regarding the Python Matplotlib plot for "${baseDesc}":\n${aiPrompt.trim()}\n\nPlease execute updated Python code using Matplotlib to render the improved plot.`
      : `Regarding the generated visual image for "${baseDesc}":\n${aiPrompt.trim()}\n\nPlease generate an updated image incorporating these visual adjustments.`;
    
    onEditWithAi(promptToSend, messageId);
    setAiPrompt('');
  };

  const handleChipClick = (chip: string) => {
    if (isLoading) return;
    const baseDesc = imagePrompt || messageText || 'this visual figure';
    const cleanRequest = chip.replace('✦ ', '');
    const promptToSend = isPlot
      ? `Regarding the Python Matplotlib plot for "${baseDesc}":\n${cleanRequest}\n\nPlease execute updated Python code using Matplotlib to render the improved plot.`
      : `Regarding the generated visual image for "${baseDesc}":\n${cleanRequest}\n\nPlease generate an updated image incorporating these visual adjustments.`;
    
    onEditWithAi(promptToSend, messageId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f8fafc] dark:bg-[#0c0d12] text-slate-900 dark:text-zinc-100 flex flex-col animate-in fade-in duration-150 select-none gpu-accelerated">
      {/* Top Header Bar - Zero Borders */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-[#13141a] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer active:scale-95 shrink-0 -ml-1 mr-0.5"
            title="Back to Chat (Esc)"
            aria-label="Back to Chat"
          >
            <ArrowLeft className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {isPlot ? `Figure ${index + 1} Plot` : 'Visual Canvas'}
              </h1>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] font-bold shrink-0 whitespace-nowrap">
                {isPlot ? 'Matplotlib' : 'AI Studio'}
              </span>
            </div>
            <p className="hidden xs:block text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate">
              {imagePrompt || messageText || 'Visual canvas with AI prompt editing'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopyImage}
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Copy image to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </button>

          {/* Python Code Drawer Toggle - Round & Shadowless */}
          <button
            type="button"
            onClick={() => setShowCodeDrawer(!showCodeDrawer)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showCodeDrawer
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200'
            }`}
            title="Toggle Python Code Inspector"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-500" />
            <span>Code</span>
          </button>

          {/* Zoom Controls - Zero Borders */}
          <div className="hidden md:flex items-center p-0.5 rounded-full bg-slate-100 dark:bg-zinc-800/80">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(2.5, Number((prev + 0.25).toFixed(2))))}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Retry / Regenerate Variation */}
          {onRegenerateVariation && (
            <button
              type="button"
              onClick={onRegenerateVariation}
              className="hidden xs:flex p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Regenerate alternative creative variation"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Presentation Body - Zero Borders */}
      <main className="flex-1 overflow-hidden relative flex bg-[#f1f5f9] dark:bg-[#090a0f]">
        {/* Visual Canvas Display Area */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-3 sm:p-8 select-none">
          <div 
            style={{ 
              transform: `scale(${zoomLevel})`, 
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out' 
            }}
            className="flex items-center justify-center rounded-3xl bg-white dark:bg-[#13141b] p-2 sm:p-3 shadow-sm transition-all"
          >
            {imageUrl && imageUrl.trim() ? (
              <img 
                src={imageUrl} 
                alt={imagePrompt || 'Visual Artifact'}
                onClick={() => setZoomLevel(prev => (prev === 1 ? 1.5 : 1))}
                className="max-h-[65vh] sm:max-h-[75vh] w-auto max-w-full object-contain rounded-2xl cursor-zoom-in"
                title="Click to toggle zoom"
              />
            ) : null}
          </div>
        </div>

        {/* Python Code Drawer Panel with Live Edit & Copy */}
        {showCodeDrawer && (
          <aside className="absolute inset-0 z-20 sm:static sm:w-[420px] lg:w-[480px] bg-white dark:bg-[#13141a] p-3.5 sm:p-4 border-l border-slate-200/80 dark:border-zinc-800/80 flex flex-col shrink-0 text-xs font-mono overflow-hidden animate-in slide-in-from-right duration-150 shadow-xl sm:shadow-none drawer-panel">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-zinc-800/60 text-slate-800 dark:text-zinc-300">
              <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Figure Code & Inspector</span>
                {isEditingCode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                    Editing
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowCodeDrawer(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 text-xs cursor-pointer transition-colors"
                title="Close Code Drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans">
                Python Matplotlib Script
              </span>

              {/* Action Buttons: Edit & Copy */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!isEditingCode) {
                      setCustomCodeInput(activeCodeDisplay);
                      setIsEditingCode(true);
                    } else {
                      setIsEditingCode(false);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                    isEditingCode
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-slate-100 dark:bg-[#1a1c24] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282b37]'
                  }`}
                  title="Edit script directly"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingCode ? 'Viewing' : 'Edit Script'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = isEditingCode ? customCodeInput : activeCodeDisplay;
                    navigator.clipboard.writeText(textToCopy);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1a1c24] hover:bg-slate-200 dark:hover:bg-[#282b37] text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-2xs text-xs font-semibold flex items-center gap-1.5"
                  title="Copy Python script"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Code Body Area */}
            <div className="flex-1 overflow-y-auto py-1 flex flex-col">
              {isEditingCode ? (
                <div className="flex-1 flex flex-col space-y-2">
                  <textarea
                    value={customCodeInput}
                    onChange={(e) => setCustomCodeInput(e.target.value)}
                    rows={14}
                    placeholder="Edit Python code..."
                    className="flex-1 w-full p-3.5 rounded-2xl bg-slate-900 text-slate-100 dark:bg-[#0c0d12] text-[11px] font-mono overflow-auto leading-relaxed shadow-inner border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none scrollbar-thin"
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                      Click Run to execute updated code in Python sandbox.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomCodeInput(activeCodeDisplay)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#1f212a] transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteCustomCode}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Run Code</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <pre className="flex-1 text-slate-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed text-[11px] p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 overflow-auto scrollbar-thin">
                  <code>{activeCodeDisplay}</code>
                </pre>
              )}
            </div>

            <div className="pt-2.5 text-[10px] text-slate-500 dark:text-zinc-500 flex items-center justify-between">
              <span>Executed in secure Google Gemini Python sandbox</span>
              <span>Matplotlib 3.8</span>
            </div>
          </aside>
        )}
      </main>

      {/* Bottom AI Edit Assistant Bar - Zero Borders */}
      <footer className="p-3 sm:p-4 bg-white dark:bg-[#13141a] shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Quick Action Chips - Thin Borders */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span className="hidden xs:inline">Edit with AI:</span>
            </span>
            {quickPromptChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => handleChipClick(chip)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-purple-50/80 dark:bg-zinc-800/80 dark:hover:bg-purple-950/60 text-slate-700 hover:text-purple-600 dark:text-zinc-300 dark:hover:text-purple-300 text-[11px] sm:text-xs font-medium border border-slate-200/80 dark:border-zinc-800 shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Custom Prompt Form - Thin Borders */}
          <form onSubmit={handleSubmitAiPrompt} className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={isLoading}
                placeholder={
                  isPlot 
                    ? "Ask Gemini to modify this plot (e.g. change color map, add grid, highlight peak)..."
                    : "Ask Gemini to modify this image (e.g. change lighting, add details)..."
                }
                className="w-full pl-4 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-2xl bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 border border-slate-200/80 dark:border-zinc-800 focus:outline-none focus:border-purple-500 shadow-xs transition-all disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!aiPrompt.trim() || isLoading}
              className="px-4 py-2.5 sm:py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-semibold border border-purple-500 shadow-xs flex items-center gap-1.5 transition-all text-xs sm:text-sm cursor-pointer active:scale-95 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{isLoading ? 'Updating...' : 'Apply Edit'}</span>
              <span className="xs:hidden">{isLoading ? '...' : 'Apply'}</span>
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
};
