import React, { useState } from 'react';
import { Code, Table, Info, X, Sigma, Layers, Sparkles } from 'lucide-react';

export interface ContextMenuPosition {
  x: number;
  y: number;
  charIndex?: number;
  selectedText?: string;
  sourcePane: 'editor' | 'preview';
}

interface HtmlNotesContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onRefineSelection?: (selectedText: string) => void;
  onInsertSnippetHere?: (snippet: string, charIndex?: number) => void;
  onPromptAiTopicHere?: (promptText: string, charIndex?: number) => void;
  onTriggerImageUpload?: () => void;
  onOpenMathEditor?: () => void;
}

export const HtmlNotesContextMenu: React.FC<HtmlNotesContextMenuProps> = ({
  position,
  onClose,
  onRefineSelection,
  onInsertSnippetHere,
  onPromptAiTopicHere,
  onTriggerImageUpload,
  onOpenMathEditor,
}) => {
  if (!position) return null;

  const handleApplySnippet = (snippetType: 'katex' | 'katex-matrix' | 'katex-system' | 'callout' | 'table') => {
    onClose();
    let insertText = '';
    if (snippetType === 'katex') {
      insertText = '\n$$\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)$$\n';
    } else if (snippetType === 'katex-matrix') {
      insertText = '\n$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$\n';
    } else if (snippetType === 'katex-system') {
      insertText = '\n$$\\begin{cases} 2x + 3y = 7 \\\\ x - y = 1 \\end{cases}$$\n';
    } else if (snippetType === 'callout') {
      insertText = '\n<div style="background:#f0f4f9; border-left:4px solid #0b57d0; padding:12px 16px; border-radius:0 8px 8px 0; margin:1rem 0;">\n  <strong style="color:#0b57d0;">Important Theorem:</strong>\n  <p style="margin:4px 0 0 0;">Enter explanation or formula here: $E = mc^2$</p>\n</div>\n';
    } else if (snippetType === 'table') {
      insertText = '\n<table style="width:100%; border-collapse:collapse; margin:1rem 0;">\n  <thead>\n    <tr style="background:#f1f5f9;"><th style="padding:8px; border:1px solid #cbd5e1;">Topic</th><th style="padding:8px; border:1px solid #cbd5e1;">Formula</th></tr>\n  </thead>\n  <tbody>\n    <tr><td style="padding:8px; border:1px solid #cbd5e1;">Property 1</td><td style="padding:8px; border:1px solid #cbd5e1;">$e^{i\\pi} + 1 = 0$</td></tr>\n  </tbody>\n</table>\n';
    }

    if (onInsertSnippetHere) {
      onInsertSnippetHere(insertText, position.charIndex);
    }
  };

  // Keep menu within viewport bounds with a slight offset for touch convenience
  const menuWidth = 260;
  const menuHeight = 280;
  // Offset slightly to avoid being directly under the finger on mobile
  const left = typeof window !== 'undefined' 
    ? Math.max(12, Math.min(position.x - 10, window.innerWidth - menuWidth - 12)) 
    : position.x;
  const top = typeof window !== 'undefined' 
    ? Math.max(12, Math.min(position.y - 10, window.innerHeight - menuHeight - 12)) 
    : position.y;

  return (
    <>
      {/* Invisible backdrop to dismiss menu on click outside */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="fixed inset-0 z-50 bg-transparent cursor-default select-none"
      />

      <aside
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{ top: `${top}px`, left: `${left}px` }}
        className="fixed z-[100] w-64 bg-white dark:bg-[#1a1c22] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 py-1.5 text-xs text-slate-800 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
      >
        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1 mb-1">
          <span>{position.sourcePane === 'editor' ? 'Editor Options' : 'Preview Options'}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 rounded cursor-pointer border-0 bg-transparent"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Option: Refine Selection with AI */}
        {position.selectedText && onRefineSelection && (
          <button
            type="button"
            onClick={() => {
              const text = position.selectedText!;
              onClose();
              onRefineSelection(text);
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2 bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-purple-500/15 hover:from-blue-500/25 hover:to-purple-500/25 text-[#0b57d0] dark:text-[#a8c7fa] font-bold cursor-pointer border-0 mb-1 border-b border-blue-100 dark:border-blue-900/40"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">Refine Selection with AI ✨</span>
          </button>
        )}

        {/* Option 0: Open Full Math & KaTeX Studio Modal */}
        {onOpenMathEditor && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMathEditor();
            }}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold cursor-pointer border-0"
          >
            <Sigma className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Open Math & KaTeX Studio</span>
          </button>
        )}

        {/* Option 1: Insert KaTeX Math Integral */}
        <button
          type="button"
          onClick={() => handleApplySnippet('katex')}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
        >
          <Code className="w-3.5 h-3.5 text-blue-500" />
          <span>Insert KaTeX Integral Formula</span>
        </button>

        {/* Option 2: Insert KaTeX Matrix */}
        <button
          type="button"
          onClick={() => handleApplySnippet('katex-matrix')}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
        >
          <Layers className="w-3.5 h-3.5 text-purple-500" />
          <span>Insert KaTeX Matrix</span>
        </button>

        {/* Option 3: Insert System of Equations */}
        <button
          type="button"
          onClick={() => handleApplySnippet('katex-system')}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
        >
          <Sigma className="w-3.5 h-3.5 text-emerald-500" />
          <span>Insert Equation System</span>
        </button>

        {/* Option 5: Insert Table */}
        <button
          type="button"
          onClick={() => handleApplySnippet('table')}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
        >
          <Table className="w-3.5 h-3.5 text-amber-500" />
          <span>Insert Table / Matrix</span>
        </button>

        {/* Option 6: Insert Callout Box */}
        <button
          type="button"
          onClick={() => handleApplySnippet('callout')}
          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
        >
          <Info className="w-3.5 h-3.5 text-indigo-500" />
          <span>Insert Theorem Callout Box</span>
        </button>
      </aside>
    </>
  );
};
