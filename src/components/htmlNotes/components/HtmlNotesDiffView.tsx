import React, { useState, useMemo } from 'react';
import { Check, X, FileDiff, Columns, AlignJustify, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

interface HtmlNotesDiffViewProps {
  isOpen: boolean;
  onClose: () => void;
  originalCode: string;
  proposedCode: string;
  fileTitle?: string;
  onApply: (appliedCode: string) => void;
  isSelectionOnly?: boolean;
  selectedText?: string | null;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// Compute clean line-by-line diff using longest common subsequence algorithm
function computeLineDiff(originalText: string, proposedText: string): {
  lines: DiffLine[];
  additions: number;
  deletions: number;
} {
  const origLines = originalText.split('\n');
  const propLines = proposedText.split('\n');

  // Simple and fast LCS for diffing code files
  const m = origLines.length;
  const n = propLines.length;

  // For very large documents, optimize if too large (> 1500 lines)
  if (m > 1500 || n > 1500) {
    const lines: DiffLine[] = [];
    let additions = 0;
    let deletions = 0;
    const maxLen = Math.max(m, n);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = origLines[i];
      const newLine = propLines[i];
      if (oldLine === newLine) {
        lines.push({ type: 'unchanged', text: oldLine || '', oldLineNumber: i + 1, newLineNumber: i + 1 });
      } else {
        if (oldLine !== undefined) {
          lines.push({ type: 'removed', text: oldLine, oldLineNumber: i + 1 });
          deletions++;
        }
        if (newLine !== undefined) {
          lines.push({ type: 'added', text: newLine, newLineNumber: i + 1 });
          additions++;
        }
      }
    }
    return { lines, additions, deletions };
  }

  // DP Matrix for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (origLines[i] === propLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to assemble diff
  const lines: DiffLine[] = [];
  let i = m;
  let j = n;
  let additions = 0;
  let deletions = 0;

  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === propLines[j - 1]) {
      stack.push({
        type: 'unchanged',
        text: origLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'added',
        text: propLines[j - 1],
        newLineNumber: j,
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      stack.push({
        type: 'removed',
        text: origLines[i - 1],
        oldLineNumber: i,
      });
      deletions++;
      i--;
    }
  }

  while (stack.length > 0) {
    lines.push(stack.pop()!);
  }

  return { lines, additions, deletions };
}

export const HtmlNotesDiffView: React.FC<HtmlNotesDiffViewProps> = ({
  isOpen,
  onClose,
  originalCode,
  proposedCode,
  fileTitle = 'Active Note',
  onApply,
  isSelectionOnly = false,
  selectedText = null,
}) => {
  const [viewStyle, setViewStyle] = useState<'unified' | 'split'>('unified');

  const { lines, additions, deletions } = useMemo(() => {
    if (!isOpen) return { lines: [], additions: 0, deletions: 0 };
    return computeLineDiff(originalCode, proposedCode);
  }, [isOpen, originalCode, proposedCode]);

  if (!isOpen) return null;

  const handleConfirmApply = () => {
    onApply(proposedCode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl h-[88vh] max-h-[920px] rounded-[24px] bg-white dark:bg-[#161a23] border-0 shadow-[0_8px_32px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_44px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden text-slate-800 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <header className="px-5 py-3.5 bg-slate-50 dark:bg-[#1c2230] border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
              <FileDiff className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold truncate text-slate-900 dark:text-zinc-100">
                  Review Proposed AI Changes
                </h3>
                {isSelectionOnly && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300">
                    Surgical Selection
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                File: <strong className="text-slate-700 dark:text-zinc-200">{fileTitle}</strong> · Inspect differences before saving
              </p>
            </div>
          </div>

          {/* Center Stats Badges */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono font-bold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              +{additions} added
            </span>
            <span className="px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
              -{deletions} removed
            </span>
          </div>

          {/* Right View Modes & Close */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-200/80 dark:bg-zinc-800 rounded-full">
              <button
                type="button"
                onClick={() => setViewStyle('unified')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-0 cursor-pointer ${
                  viewStyle === 'unified'
                    ? 'bg-[#0b57d0] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-zinc-400 bg-transparent'
                }`}
                title="Unified Diff View"
              >
                Unified
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('split')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-0 cursor-pointer ${
                  viewStyle === 'split'
                    ? 'bg-[#0b57d0] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-zinc-400 bg-transparent'
                }`}
                title="Split Side-by-Side Diff View"
              >
                Side-by-Side
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 flex items-center justify-center cursor-pointer transition-colors border-0"
              title="Close without applying"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Selected snippet context notice (if surgical selection edit) */}
        {isSelectionOnly && selectedText && (
          <div className="px-5 py-2 bg-purple-50/70 dark:bg-purple-950/30 border-b border-purple-200/50 dark:border-purple-900/50 flex items-center gap-2 text-xs text-purple-900 dark:text-purple-200 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="truncate">
              Targeted Selection: <code className="bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.5 rounded-md font-mono text-[11px]">{selectedText.length > 80 ? selectedText.slice(0, 80) + '...' : selectedText}</code>
            </span>
          </div>
        )}

        {/* Diff Content Body */}
        <div className="flex-1 overflow-auto bg-[#fafbfc] dark:bg-[#0e1219] font-mono text-[12.5px] leading-5 [scrollbar-width:thin]">
          {viewStyle === 'unified' ? (
            <div className="divide-y divide-slate-100 dark:divide-zinc-900 min-w-full inline-block">
              {lines.map((line, idx) => {
                const isAdd = line.type === 'added';
                const isRem = line.type === 'removed';

                return (
                  <div
                    key={idx}
                    className={`flex items-start px-3 py-0.5 select-text hover:bg-black/5 dark:hover:bg-white/5 ${
                      isAdd
                        ? 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
                        : isRem
                        ? 'bg-rose-500/15 text-rose-900 dark:text-rose-200 line-through opacity-85'
                        : 'text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    {/* Line Numbers */}
                    <div className="w-16 shrink-0 flex justify-between pr-3 select-none text-[10.5px] text-slate-400 dark:text-zinc-600 tabular-nums">
                      <span className="w-7 text-right">{line.oldLineNumber || ''}</span>
                      <span className="w-7 text-right">{line.newLineNumber || ''}</span>
                    </div>

                    {/* Diff Marker Sign */}
                    <span className="w-4 select-none shrink-0 font-bold text-center">
                      {isAdd ? '+' : isRem ? '-' : ' '}
                    </span>

                    {/* Line Text */}
                    <pre className="flex-1 whitespace-pre-wrap break-all font-mono font-normal m-0 text-[12px]">
                      {line.text}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Side-by-Side Split View */
            <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-zinc-800 min-w-full h-full">
              {/* Left Column: Original */}
              <div className="overflow-auto p-3">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Original
                </div>
                <pre className="whitespace-pre-wrap break-all text-[12px] text-slate-700 dark:text-zinc-300 m-0">
                  {originalCode}
                </pre>
              </div>

              {/* Right Column: Proposed */}
              <div className="overflow-auto p-3 bg-emerald-500/5 dark:bg-emerald-500/5">
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
                  Proposed Changes
                </div>
                <pre className="whitespace-pre-wrap break-all text-[12px] text-emerald-950 dark:text-emerald-100 m-0">
                  {proposedCode}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-5 py-3.5 bg-slate-50 dark:bg-[#1c2230] border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Automatic safety snapshot taken. You can always Undo with Ctrl+Z.</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold cursor-pointer transition-colors border-0"
            >
              Discard Changes
            </button>

            <button
              type="button"
              onClick={handleConfirmApply}
              className="px-5 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:scale-95 text-white text-xs font-bold shadow-[0_2px_6px_rgba(11,87,208,0.25)] flex items-center gap-1.5 cursor-pointer transition-all border-0"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Apply Changes</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
