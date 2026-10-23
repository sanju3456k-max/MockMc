import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Sparkles, ArrowRight, X, Loader2, MessageSquare, Wand2, Table, HelpCircle, AlignLeft } from 'lucide-react';

interface HtmlNotesSlantEditPopoverProps {
  selectedText: string;
  position: { top: number; left: number } | null;
  onClose: () => void;
  onSubmitEdit: (prompt: string, selectedText: string) => Promise<void>;
  isLoading: boolean;
  onOpenFullAiPanel?: (selectedText: string) => void;
  paneMode?: 'editor' | 'preview';
}

const QUICK_ACTIONS = [
  { label: 'Format as KaTeX Table', prompt: 'Convert this selection into a clean responsive HTML table with KaTeX math formulas' },
  { label: 'Explain & Simplify', prompt: 'Simplify and explain this selection with clearer wording and bullet points' },
  { label: 'Theorem Callout Box', prompt: 'Wrap this selection into a beautiful theorem callout box with a prominent header' },
  { label: 'Add Math Derivation', prompt: 'Expand this selection with step-by-step mathematical derivation using KaTeX ($$)' },
  { label: 'Fix Formatting & Typos', prompt: 'Fix any formatting issues, grammatical errors, and HTML/KaTeX syntax' },
];

export const HtmlNotesSlantEditPopover: React.FC<HtmlNotesSlantEditPopoverProps> = ({
  selectedText,
  position,
  onClose,
  onSubmitEdit,
  isLoading,
  onOpenFullAiPanel,
  paneMode = 'preview',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [computedPos, setComputedPos] = useState<{ top: number; left: number }>({
    top: position?.top ?? 20,
    left: position?.left ?? 20,
  });

  useLayoutEffect(() => {
    if (!position || !containerRef.current) return;
    const parent = containerRef.current.parentElement;
    const parentW = parent ? parent.clientWidth : window.innerWidth;
    const parentH = parent ? parent.clientHeight : window.innerHeight;

    // Use full 380px width & 160px height for clamping so coordinates never shift when expanding
    const popoverW = Math.min(380, parentW - 32);
    const popoverH = 160;

    // Horizontal clamping: keep at least 16px away from left and right boundaries
    const maxLeft = Math.max(16, parentW - popoverW - 16);
    const left = Math.max(16, Math.min(maxLeft, position.left));

    // Vertical placement: keep at least 16px away from top and bottom boundaries
    let top = position.top;
    const maxTop = Math.max(16, parentH - popoverH - 16);
    if (top > maxTop) {
      if (position.top > popoverH + 20) {
        top = Math.max(16, position.top - popoverH - 12);
      } else {
        top = maxTop;
      }
    } else {
      top = Math.max(16, top);
    }

    setComputedPos({ top, left });
  }, [position?.top, position?.left]);

  // Synchronous auto-focus when expanding without sluggish timeout delay
  useLayoutEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!position || !selectedText) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmitEdit(prompt.trim(), selectedText);
  };

  const handleSelectQuickAction = (actionPrompt: string) => {
    setPrompt(actionPrompt);
    onSubmitEdit(actionPrompt, selectedText);
  };

  const cleanSnippetPreview = selectedText.length > 70
    ? selectedText.slice(0, 70) + '...'
    : selectedText;

  // 1. Google Docs / Canva Style Floating "✨ Refine it" Action Pill
  if (!isExpanded) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: `${computedPos.top}px`,
          left: `${computedPos.left}px`,
          zIndex: 60,
        }}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsExpanded(true);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#1a1e29]/95 backdrop-blur-md border border-blue-400/30 dark:border-blue-500/30 shadow-[0_4px_20px_rgba(11,87,208,0.25)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.7)] text-[#0b57d0] dark:text-[#a8c7fa] font-bold text-xs cursor-pointer select-none"
        title="Refine selected snippet with AI"
      >
        <Sparkles className="w-3.5 h-3.5 stroke-[2.2]" />
        <span>Refine it ✨</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-0.5 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border-0 transition-colors"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // 2. Expanded Slant Prompt Input & Quick Action Chips
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: `${computedPos.top}px`,
        left: `${computedPos.left}px`,
        zIndex: 60,
      }}
      className="w-[calc(100%-32px)] sm:w-[380px] max-w-[380px] rounded-[22px] bg-white dark:bg-[#1a1e29] border border-slate-200/80 dark:border-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] p-3 text-slate-800 dark:text-zinc-100 select-none box-border"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Top Header: Selected snippet summary & Dismiss */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-full bg-blue-500/15 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 stroke-[2.2]" />
          </div>
          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 truncate">
            Edit Selection ({paneMode === 'editor' ? 'Code' : 'Canvas'})
          </span>
          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]" title={selectedText}>
            "{cleanSnippetPreview}"
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onOpenFullAiPanel && (
            <button
              type="button"
              onClick={() => onOpenFullAiPanel(selectedText)}
              className="p-1 rounded-full text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 transition-colors"
              title="Open full project chat with this selection"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Input Prompt Box */}
      <form onSubmit={handleSubmit} className="pt-2">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="Ask AI to modify, reformat, or rewrite this part..."
            className="w-full h-9 pl-3.5 pr-10 text-xs rounded-full bg-[#f0f4f9] dark:bg-[#12151c] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 border-0 outline-none focus:ring-2 focus:ring-[#0b57d0]/30 transition-all font-normal"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="absolute right-1 w-7 h-7 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-all border-0 shadow-xs"
            title="Generate AI Edit"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
            )}
          </button>
        </div>
      </form>

      {/* Quick Action Suggestion Chips */}
      <div className="pt-2 flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto [scrollbar-width:none]">
        {QUICK_ACTIONS.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelectQuickAction(action.prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/90 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer border-0 active:scale-95 disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
