import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Code, Search, ChevronUp, ChevronDown, X, Sparkles, Table, Info
} from 'lucide-react';
import { HtmlNotesSlantEditPopover } from './HtmlNotesSlantEditPopover';

interface HtmlNotesEditorPaneProps {
  viewMode: 'split' | 'editor' | 'preview';
  splitRatio: number;
  lineCount: number;
  isEditorWordWrap: boolean;
  onToggleWordWrap: () => void;
  // Search
  isEditorSearchOpen: boolean;
  editorSearchTerm: string;
  editorMatchesCount: number;
  currentMatchIdx: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onEditorSearchChange: (val: string) => void;
  onPrevSearchMatch: () => void;
  onNextSearchMatch: () => void;
  onCloseEditorSearch: () => void;
  // Editor & line numbers
  lineNumbersRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  code: string;
  onCodeChange: (newCode: string) => void;
  onScrollTextarea: () => void;
  lineNumbers: number[];
  isBlinking: boolean;
  highlightedLineIdx: number | null;
  highlightedLineRange?: { start: number; end: number } | null;
  highlightedCharRange?: { start: number; end: number } | null;
  onInsertImageSnippet?: (dataUrl: string, fileName?: string) => void;
  onRefineSelection?: (selectedText: string) => void;
  onPromptAiTopicHere?: (promptText: string, charIndex?: number) => void;
  onInsertSnippetHere?: (snippet: string, charIndex?: number) => void;
  onTriggerImageUpload?: () => void;
  activeSelectionPane?: 'editor' | 'preview' | null;
  onEditorTextSelected?: (selectedText: string) => void;
  isSelectRefiningModeEnabled?: boolean;
  onToggleSelectRefiningMode?: () => void;
  onSubmitSlantEdit?: (prompt: string, selectedText: string) => Promise<void>;
  isSlantLoading?: boolean;
  onOpenFullAiPanel?: (selectedText: string) => void;
}

export const HtmlNotesEditorPane: React.FC<HtmlNotesEditorPaneProps> = ({
  viewMode,
  splitRatio,
  lineCount,
  isEditorWordWrap,
  onToggleWordWrap,
  isEditorSearchOpen,
  editorSearchTerm,
  editorMatchesCount,
  currentMatchIdx,
  searchInputRef,
  onEditorSearchChange,
  onPrevSearchMatch,
  onNextSearchMatch,
  onCloseEditorSearch,
  lineNumbersRef,
  textareaRef,
  code,
  onCodeChange,
  onScrollTextarea,
  lineNumbers,
  isBlinking,
  highlightedLineIdx,
  highlightedLineRange,
  highlightedCharRange,
  onInsertImageSnippet,
  onRefineSelection,
  onPromptAiTopicHere,
  onInsertSnippetHere,
  onTriggerImageUpload,
  activeSelectionPane,
  onEditorTextSelected,
  onSubmitSlantEdit,
  isSlantLoading,
  onOpenFullAiPanel,
  isSelectRefiningModeEnabled = false,
  onToggleSelectRefiningMode = () => {},
}) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPos, setSelectionPos] = useState<{ top: number; right: number } | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState<boolean>(false);
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number }>({ top: 40, left: 60 });
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const [editorFontSize, setEditorFontSize] = useState<number>(13);


  // Synchronize line height map for pre-wrapped lines in word-wrap mode
  useEffect(() => {
    if (!isEditorWordWrap || !textareaRef.current) {
      setLineHeights([]);
      return;
    }

    const textarea = textareaRef.current;
    // Available width inside textarea excluding 24px padding (12px left + 12px right)
    const availableWidth = Math.max(80, textarea.clientWidth - 24);
    
    // Accurate character width measurement for JetBrains Mono 13px
    let charWidth = 7.82;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = "13px 'JetBrains Mono', monospace";
        const measured = ctx.measureText("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ").width / 52;
        if (measured > 5 && measured < 15) {
          charWidth = measured;
        }
      }
    } catch (e) {}

    const maxChars = Math.max(10, Math.floor(availableWidth / charWidth));

    const lines = (code || '').split('\n');
    const heights = lines.map((lineText) => {
      if (!lineText) return 22;
      const visualSubLines = Math.max(1, Math.ceil(lineText.length / maxChars));
      return visualSubLines * 22;
    });

    setLineHeights(heights);
  }, [code, isEditorWordWrap, splitRatio, viewMode]);

  // Calculate cumulative top pixel offset of line lineIdx in the editor textarea
  const getLineTopOffset = useCallback((lineIdx: number) => {
    if (!isEditorWordWrap || lineHeights.length === 0) {
      return lineIdx * 22;
    }
    let top = 0;
    const limit = Math.min(lineIdx, lineHeights.length);
    for (let i = 0; i < limit; i++) {
      top += lineHeights[i] || 22;
    }
    return top;
  }, [isEditorWordWrap, lineHeights]);

  const getLineHeight = useCallback((lineIdx: number) => {
    if (!isEditorWordWrap || lineHeights.length === 0) {
      return 22;
    }
    return lineHeights[lineIdx] || 22;
  }, [isEditorWordWrap, lineHeights]);

  const handleTextareaSelect = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      if (start !== end) {
        const sel = code.substring(start, end).trim();
        setSelectedText(sel);
        if (onEditorTextSelected) onEditorTextSelected(sel);

        const textBeforeEnd = code.substring(0, end);
        const lineIdx = textBeforeEnd.split('\n').length - 1;
        const scrollTop = textareaRef.current.scrollTop || 0;
        const editorHeight = textareaRef.current.clientHeight || 300;

        const lineTop = getLineTopOffset(lineIdx);
        const lineHeight = getLineHeight(lineIdx);
        const headerOffset = (isEditorSearchOpen ? 32 : 0) + 12;
        const calculatedTop = Math.max(
          12,
          Math.min(editorHeight - 45, headerOffset + lineTop + lineHeight - scrollTop + 6)
        );
        setSelectionPos({ top: calculatedTop, right: 24 });
      } else {
        setSelectedText('');
        setSelectionPos(null);
        if (onEditorTextSelected) onEditorTextSelected('');
      }
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onCodeChange(val);

    // Detect Slash Commands (/ai, /katex, /table, /callout, /)
    if (textareaRef.current) {
      const cursorStart = textareaRef.current.selectionStart || 0;
      const textBeforeCursor = val.substring(0, cursorStart);
      const lastLine = textBeforeCursor.split('\n').pop() || '';

      if (lastLine.trim().endsWith('/ai') || lastLine.trim() === '/' || lastLine.trim().endsWith('/katex') || lastLine.trim().endsWith('/table')) {
        setSlashMenuOpen(true);
        const lineCountBefore = textBeforeCursor.split('\n').length;
        setSlashMenuPos({
          top: Math.min(300, Math.max(30, lineCountBefore * 22)),
          left: 60,
        });
      } else {
        if (slashMenuOpen) setSlashMenuOpen(false);
      }
    }
  };

  const handleApplySlashSnippet = (snippetType: 'katex' | 'callout' | 'table' | 'ai') => {
    setSlashMenuOpen(false);
    if (!textareaRef.current) return;

    const start = textareaRef.current.selectionStart || 0;
    const end = textareaRef.current.selectionEnd || 0;
    const textBefore = code.substring(0, start);
    const lastLineStart = textBefore.lastIndexOf('\n') + 1;
    const linePrefix = code.substring(0, lastLineStart);
    const afterCursor = code.substring(end);

    if (snippetType === 'ai') {
      if (onRefineSelection) onRefineSelection('Generate AI Note Content');
      return;
    }

    let insertText = '';
    if (snippetType === 'katex') {
      insertText = '\n$$\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)$$\n';
    } else if (snippetType === 'callout') {
      insertText = '\n<div style="background:#f0f4f9; border-left:4px solid #0b57d0; padding:12px 16px; border-radius:0 8px 8px 0; margin:1rem 0;">\n  <strong style="color:#0b57d0;">Important Theorem:</strong>\n  <p style="margin:4px 0 0 0;">Enter explanation here...</p>\n</div>\n';
    } else if (snippetType === 'table') {
      insertText = '\n<table style="width:100%; border-collapse:collapse; margin:1rem 0;">\n  <thead>\n    <tr style="background:#f1f5f9;"><th style="padding:8px; border:1px solid #cbd5e1;">Topic</th><th style="padding:8px; border:1px solid #cbd5e1;">Formula</th></tr>\n  </thead>\n  <tbody>\n    <tr><td style="padding:8px; border:1px solid #cbd5e1;">Property 1</td><td style="padding:8px; border:1px solid #cbd5e1;">$e^{i\\pi} + 1 = 0$</td></tr>\n  </tbody>\n</table>\n';
    }

    const newCode = linePrefix + insertText + afterCursor;
    onCodeChange(newCode);
  };

  // Handle clipboard paste of image files directly into editor
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!e.clipboardData || !e.clipboardData.items) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target?.result as string;
            if (dataUrl) {
              insertImageAtTextareaCursor(dataUrl, file.name || 'Pasted Image');
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  };

  // Handle drag and drop of image files into editor
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      if (file.type.indexOf('image') !== -1) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target?.result as string;
          if (dataUrl) {
            insertImageAtTextareaCursor(dataUrl, file.name || 'Dropped Image');
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const insertImageAtTextareaCursor = (dataUrl: string, fileName: string) => {
    if (onInsertImageSnippet) {
      onInsertImageSnippet(dataUrl, fileName);
      return;
    }

    const snippet = `\n<figure style="text-align: center; margin: 1.5rem auto;">\n  <img src="${dataUrl}" alt="${fileName || 'Note Diagram'}" style="width: 420px; max-width: 100%; height: auto; border-radius: 8px; display: inline-block;" />\n  <figcaption style="font-size: 0.85rem; color: #64748b; margin-top: 0.4rem;">${fileName || 'Figure'}</figcaption>\n</figure>\n`;
    
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      const newCode = code.substring(0, start) + snippet + code.substring(end);
      onCodeChange(newCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + snippet.length;
          textareaRef.current.selectionEnd = start + snippet.length;
          textareaRef.current.focus();
        }
      }, 50);
    } else {
      onCodeChange(code + snippet);
    }
  };

  const bannerRef = useRef<HTMLDivElement>(null);

  const handleTextareaScroll = () => {
    if (textareaRef.current) {
      const top = textareaRef.current.scrollTop;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = top;
      }
      if (bannerRef.current && highlightedLineIdx !== null) {
        bannerRef.current.style.top = `${12 + getLineTopOffset(highlightedLineIdx) - top}px`;
      }
    }
    if (onScrollTextarea) {
      onScrollTextarea();
    }
  };



  // When preview or search highlights a line, smoothly scroll and select the code text
  React.useEffect(() => {
    // If user is actively typing in the textarea, do not disrupt their caret or selection
    if (textareaRef.current && document.activeElement === textareaRef.current) {
      return;
    }

    if (highlightedLineIdx === null) {
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        try {
          const currentPos = textareaRef.current.selectionStart;
          textareaRef.current.setSelectionRange(currentPos, currentPos);
        } catch (e) {}
      }
      return;
    }

    if (isBlinking && highlightedLineIdx !== null && textareaRef.current) {
      const lineTop = getLineTopOffset(highlightedLineIdx);
      const targetScroll = Math.max(0, lineTop - 120);
      textareaRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });

      // Highlight the exact text inside the textarea
      try {
        if (highlightedCharRange) {
          textareaRef.current.setSelectionRange(highlightedCharRange.start, highlightedCharRange.end);
        } else {
          const lines = (code || '').split('\n');
          let charStart = 0;
          for (let i = 0; i < highlightedLineIdx && i < lines.length; i++) {
            charStart += lines[i].length + 1;
          }
          let charEnd = charStart + (lines[highlightedLineIdx]?.length || 0);
          if (highlightedLineRange && highlightedLineRange.end > highlightedLineIdx) {
            let rangeEnd = charStart;
            for (let i = highlightedLineIdx; i <= highlightedLineRange.end && i < lines.length; i++) {
              rangeEnd += lines[i].length + (i < lines.length - 1 ? 1 : 0);
            }
            charEnd = rangeEnd;
          }
          textareaRef.current.setSelectionRange(charStart, charEnd);
        }
      } catch (e) {}
    }
  }, [isBlinking, highlightedLineIdx, highlightedLineRange, highlightedCharRange, getLineTopOffset, code]);

  // Keep line numbers scroll synced when code changes or window resizes
  React.useEffect(() => {
    handleTextareaScroll();
  }, [code, isEditorWordWrap]);

  return (
    <section 
      className="pane editor-pane"
      style={{ 
        display: 'flex',
        flexDirection: 'column',
        width: viewMode === 'split' ? `calc(var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        flex: viewMode === 'split' ? `0 0 calc(var(--split-ratio, ${splitRatio}%) - 4px)` : '1 1 0%',
        maxWidth: viewMode === 'split' ? `calc(var(--split-ratio, ${splitRatio}%) - 4px)` : '100%',
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Inline Slash Commands Popover Bar */}
      {slashMenuOpen && (
        <div
          style={{ top: `${slashMenuPos.top}px`, left: `${slashMenuPos.left}px` }}
          className="absolute z-50 w-60 bg-white dark:bg-[#1a1c22] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 py-1.5 text-xs text-slate-800 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider uppercase">
            AI & HTML Slash Commands
          </div>

          <button
            type="button"
            onClick={() => handleApplySlashSnippet('ai')}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-purple-50 dark:hover:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold cursor-pointer border-0 bg-transparent"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>/ai - Prompt AI Assistant Here</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplySlashSnippet('katex')}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
          >
            <Code className="w-3.5 h-3.5 text-blue-500" />
            <span>/katex - Insert LaTeX Math Formula</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplySlashSnippet('callout')}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
          >
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            <span>/callout - Insert Theorem Callout Box</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplySlashSnippet('table')}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer border-0 bg-transparent"
          >
            <Table className="w-3.5 h-3.5 text-amber-500" />
            <span>/table - Insert HTML Summary Table</span>
          </button>
        </div>
      )}


      {/* Inline Code Search Bar */}
      {isEditorSearchOpen && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800/90 border-b border-slate-200 dark:border-zinc-700 text-xs shrink-0 z-20">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={editorSearchTerm}
            onChange={(e) => onEditorSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) onPrevSearchMatch();
                else onNextSearchMatch();
              } else if (e.key === 'Escape') {
                onCloseEditorSearch();
              }
            }}
            placeholder="Find in code..."
            className="flex-1 min-w-[100px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-blue-500 text-slate-900 dark:text-white"
          />
          <span className="text-[10px] text-slate-500 font-medium px-1 whitespace-nowrap">
            {editorMatchesCount > 0 ? `${currentMatchIdx + 1}/${editorMatchesCount}` : (editorSearchTerm ? '0/0' : '')}
          </span>
          <button
            onClick={onPrevSearchMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Previous Match (Shift+Enter)"
            disabled={editorMatchesCount === 0}
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={onNextSearchMatch}
            className="round-icon"
            style={{ width: '20px', height: '20px' }}
            title="Next Match (Enter)"
            disabled={editorMatchesCount === 0}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={onCloseEditorSearch}
            className="round-icon"
            style={{ width: '20px', height: '20px', border: 0 }}
            title="Close Search"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div 
        className="editor-container"
        style={{
          display: 'flex',
          flex: '1 1 0%',
          minHeight: 0,
          minWidth: 0,
          height: '100%',
          width: '100%',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Line Numbers Column */}
        <div 
          ref={lineNumbersRef} 
          className="line-numbers select-none"
          style={{
            width: '46px',
            height: '100%',
            flexShrink: 0,
            overflowY: 'hidden',
            overflowX: 'hidden',
            pointerEvents: 'none',
            textAlign: 'right',
            paddingRight: '10px',
            paddingTop: '12px',
            paddingBottom: '12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            lineHeight: '22px',
            boxSizing: 'border-box'
          }}
        >
          {lineNumbers.map((num) => {
            const isHighlighted = (
              highlightedLineRange
                ? (num - 1 >= highlightedLineRange.start && num - 1 <= highlightedLineRange.end)
                : (highlightedLineIdx === num - 1)
            );
            const h = lineHeights[num - 1] || 22;
            return (
              <div
                key={num}
                style={{
                  height: `${h}px`,
                  lineHeight: '22px',
                  fontWeight: isHighlighted ? '700' : '500',
                  color: isHighlighted ? '#2563eb' : undefined
                }}
              >
                {num}
              </div>
            );
          })}
        </div>

        {/* Preview selection line highlight banner in editor */}
        {highlightedLineIdx !== null && (
          <div
            ref={bannerRef}
            className={`section-code-blink-banner ${isBlinking ? 'ring-2 ring-blue-500/50 shadow-md animate-pulse' : ''}`}
            style={{
              top: `${12 + getLineTopOffset(highlightedLineIdx) - (textareaRef.current?.scrollTop || 0)}px`,
              height: `${
                highlightedLineRange && highlightedLineRange.end > highlightedLineIdx
                  ? Math.max(22, getLineTopOffset(highlightedLineRange.end + 1) - getLineTopOffset(highlightedLineIdx))
                  : getLineHeight(highlightedLineIdx)
              }px`
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563eb', display: 'inline-block', marginRight: '6px' }} />
            <span>
              {highlightedLineRange && highlightedLineRange.end > highlightedLineIdx
                ? `Lines ${highlightedLineIdx + 1}–${highlightedLineRange.end + 1}`
                : `Line ${highlightedLineIdx + 1}`}
            </span>
          </div>
        )}

        {/* Code Textarea */}
        <textarea
          ref={textareaRef}
          className="code-editor scrollbar-thin"
          value={code}
          onChange={handleTextareaChange}
          onScroll={handleTextareaScroll}
          onSelect={handleTextareaSelect}
          onMouseUp={handleTextareaSelect}
          onKeyUp={handleTextareaSelect}
          onPaste={handlePaste}
          onDrop={handleDrop}
          spellCheck={false}
          placeholder="<!-- Type, paste, or type / to use AI inline assistant -->"
          style={{
            flex: '1 1 0%',
            minWidth: 0,
            height: '100%',
            paddingTop: '12px',
            paddingBottom: '12px',
            paddingLeft: '12px',
            paddingRight: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: `${editorFontSize}px`,
            fontWeight: 500,
            lineHeight: '22px',
            whiteSpace: isEditorWordWrap ? 'pre-wrap' : 'pre',
            overflowX: isEditorWordWrap ? 'hidden' : 'auto',
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
            wordBreak: 'break-word',
            boxSizing: 'border-box',
            outline: 'none',
            border: 0,
            resize: 'none'
          }}
          data-scrollable="true"
        />

        {/* Floating Slant AI Edit Popover */}
        {selectedText && selectionPos && onSubmitSlantEdit && (
          <HtmlNotesSlantEditPopover
            selectedText={selectedText}
            position={{ top: selectionPos.top, left: 80 }}
            onClose={() => {
              setSelectedText('');
              setSelectionPos(null);
              if (onEditorTextSelected) onEditorTextSelected('');
            }}
            onSubmitEdit={onSubmitSlantEdit}
            isLoading={Boolean(isSlantLoading)}
            onOpenFullAiPanel={onOpenFullAiPanel}
            paneMode="editor"
          />
        )}
      </div>
    </section>
  );
};

