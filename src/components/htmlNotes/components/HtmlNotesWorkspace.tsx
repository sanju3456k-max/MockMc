import React from 'react';
import { ViewMode, ViewportMode, EditorSearchMatch, HtmlNoteItem } from '../types';
import { HtmlNotesEditorPane } from './HtmlNotesEditorPane';
import { HtmlNotesSplitDivider } from './HtmlNotesSplitDivider';
import { HtmlNotesPreviewPane, HtmlNotesPreviewPaneHandle } from './HtmlNotesPreviewPane';
import { DriveSyncBanner } from './DriveSyncBanner';

interface HtmlNotesWorkspaceProps {
  viewMode: ViewMode;
  viewportMode: ViewportMode;
  splitRatio: number;
  splitContainerRef: React.RefObject<HTMLDivElement | null>;
  isResizing: boolean;
  onStartResize: (e: React.MouseEvent | React.TouchEvent) => void;
  isDark: boolean;

  // Editor Pane Props
  lineCount: number;
  isEditorWordWrap: boolean;
  onToggleWordWrap: () => void;
  isEditorSearchOpen: boolean;
  editorSearchTerm: string;
  editorMatches: EditorSearchMatch[];
  currentMatchIdx: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onEditorSearchChange: (val: string) => void;
  onPrevSearchMatch: () => void;
  onNextSearchMatch: () => void;
  onCloseEditorSearch: () => void;
  lineNumbersRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  code: string;
  onCodeChange: (newCode: string) => void;
  onScrollTextarea: () => void;
  lineNumbers: number[];
  isBlinking: boolean;
  highlightedLineIdx: number | null;
  highlightedLineRange: { start: number; end: number } | null;
  highlightedCharRange?: { start: number; end: number } | null;
  onInsertImageSnippet: (dataUrl: string, fileName?: string) => void;
  activeSelectionPane: 'editor' | 'preview' | null;
  isSelectRefiningModeEnabled?: boolean;
  onToggleSelectRefiningMode?: () => void;
  onEditorTextSelected: (selText: string) => void;
  onRefineSelection: (selText: string) => void;
  onPromptAiTopicHere?: (promptText: string, charIndex?: number) => void;
  onInsertSnippetHere?: (snippet: string, charIndex?: number) => void;
  onOpenMathEditor?: () => void;

  // Preview Pane Props
  previewPaneRef: React.RefObject<HtmlNotesPreviewPaneHandle | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeSrcDoc: string;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  applyIframeZoom?: (zoom: number) => void;
  isPreviewSearchOpen: boolean;
  previewSearchTerm: string;
  previewMatchCount: number;
  currentPreviewMatchIdx: number;
  previewSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onPreviewSearchChange: (val: string) => void;
  onPrevPreviewMatch: () => void;
  onNextPreviewMatch: () => void;
  onClosePreviewSearch: () => void;
  sideMarginMm: number;
  verticalMarginMm: number;
  totalLeftMarginMm: number;
  fontSizePx: number;
  onTriggerInsertImage: () => void;
  onPreviewTextSelected: (selText: string) => void;

  // Footer / Status
  title: string;

  // Slant Inline AI Editing
  onSubmitSlantEdit?: (prompt: string, selectedText: string) => Promise<void>;
  isSlantLoading?: boolean;
  onOpenFullAiPanel?: (selectedText: string) => void;

  // Cloud & Drive Sync Status
  activeNote?: HtmlNoteItem;
  isDriveConnected?: boolean;
  onConnectDrive?: () => void;
  showToast?: (msg: string) => void;

  // Visual Canvas Edit Mode
  isVisualEditActive?: boolean;
  onToggleVisualEdit?: () => void;
}

export const HtmlNotesWorkspace: React.FC<HtmlNotesWorkspaceProps> = ({
  viewMode,
  viewportMode,
  splitRatio,
  splitContainerRef,
  isResizing,
  onStartResize,
  isDark,
  lineCount,
  isEditorWordWrap,
  onToggleWordWrap,
  isEditorSearchOpen,
  editorSearchTerm,
  editorMatches,
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
  activeSelectionPane,
  isSelectRefiningModeEnabled,
  onToggleSelectRefiningMode,
  onEditorTextSelected,
  onRefineSelection,
  onPromptAiTopicHere,
  onInsertSnippetHere,
  previewPaneRef,
  iframeRef,
  iframeSrcDoc,
  zoomLevel,
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
  sideMarginMm,
  verticalMarginMm,
  totalLeftMarginMm,
  fontSizePx,
  onTriggerInsertImage,
  onPreviewTextSelected,
  title,
  onSubmitSlantEdit,
  isSlantLoading,
  onOpenFullAiPanel,
  activeNote,
  isDriveConnected = false,
  onConnectDrive,
  showToast,
  isVisualEditActive = false,
  onToggleVisualEdit,
}) => {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden relative">
      <div 
        ref={splitContainerRef}
        className="split-workspace-container"
        style={{
          ['--split-ratio' as any]: `${splitRatio}%`
        }}
      >
        {/* EDITOR PANE */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <HtmlNotesEditorPane
            viewMode={viewMode}
            splitRatio={splitRatio}
            lineCount={lineCount}
            isEditorWordWrap={isEditorWordWrap}
            onToggleWordWrap={onToggleWordWrap}
            isEditorSearchOpen={isEditorSearchOpen}
            editorSearchTerm={editorSearchTerm}
            editorMatchesCount={editorMatches.length}
            currentMatchIdx={currentMatchIdx}
            searchInputRef={searchInputRef}
            onEditorSearchChange={onEditorSearchChange}
            onPrevSearchMatch={onPrevSearchMatch}
            onNextSearchMatch={onNextSearchMatch}
            onCloseEditorSearch={onCloseEditorSearch}
            lineNumbersRef={lineNumbersRef}
            textareaRef={textareaRef}
            code={code}
            onCodeChange={onCodeChange}
            onScrollTextarea={onScrollTextarea}
            lineNumbers={lineNumbers}
            isBlinking={isBlinking}
            highlightedLineIdx={highlightedLineIdx}
            highlightedLineRange={highlightedLineRange}
            highlightedCharRange={highlightedCharRange}
            onInsertImageSnippet={onInsertImageSnippet}
            activeSelectionPane={activeSelectionPane}
            isSelectRefiningModeEnabled={isSelectRefiningModeEnabled}
            onToggleSelectRefiningMode={onToggleSelectRefiningMode}
            onEditorTextSelected={onEditorTextSelected}
            onRefineSelection={onRefineSelection}
            onPromptAiTopicHere={onPromptAiTopicHere}
            onInsertSnippetHere={onInsertSnippetHere}
            onTriggerImageUpload={onTriggerInsertImage}
            onSubmitSlantEdit={onSubmitSlantEdit}
            isSlantLoading={isSlantLoading}
            onOpenFullAiPanel={onOpenFullAiPanel}
          />
        )}

        {/* SPLIT RESIZE DIVIDER */}
        {viewMode === 'split' && (
          <HtmlNotesSplitDivider
            isResizing={isResizing}
            onStartResize={onStartResize}
          />
        )}

        {/* PREVIEW PANE */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <HtmlNotesPreviewPane
            ref={previewPaneRef}
            viewMode={viewMode}
            viewportMode={viewportMode}
            splitRatio={splitRatio}
            isDark={isDark}
            iframeRef={iframeRef}
            srcDoc={iframeSrcDoc}
            zoomLevel={zoomLevel}
            isResizing={isResizing}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
            applyIframeZoom={applyIframeZoom}
            isPreviewSearchOpen={isPreviewSearchOpen}
            previewSearchTerm={previewSearchTerm}
            previewMatchCount={previewMatchCount}
            currentPreviewMatchIdx={currentPreviewMatchIdx}
            previewSearchInputRef={previewSearchInputRef}
            onPreviewSearchChange={onPreviewSearchChange}
            onPrevPreviewMatch={onPrevPreviewMatch}
            onNextPreviewMatch={onNextPreviewMatch}
            onClosePreviewSearch={onClosePreviewSearch}
            code={code}
            onCodeChange={onCodeChange}
            sideMarginMm={sideMarginMm}
            verticalMarginMm={verticalMarginMm}
            totalLeftMarginMm={totalLeftMarginMm}
            fontSizePx={fontSizePx}
            onTriggerInsertImage={onTriggerInsertImage}
            onInsertImageSnippet={onInsertImageSnippet}
            activeSelectionPane={activeSelectionPane}
            isSelectRefiningModeEnabled={isSelectRefiningModeEnabled}
            onToggleSelectRefiningMode={onToggleSelectRefiningMode}
            onRefineSelection={onRefineSelection}
            onPromptAiTopicHere={onPromptAiTopicHere}
            onInsertSnippetHere={onInsertSnippetHere}
            onPreviewTextSelected={onPreviewTextSelected}
            onSubmitSlantEdit={onSubmitSlantEdit}
            isSlantLoading={isSlantLoading}
            onOpenFullAiPanel={onOpenFullAiPanel}
            isVisualEditActive={isVisualEditActive}
            onToggleVisualEdit={onToggleVisualEdit}
          />
        )}
      </div>

      {/* Bottom Footer Status Bar in Editor mode */}
      {viewMode === 'editor' && (
        <footer className="h-6 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 px-3.5 flex items-center justify-between text-[10px] text-slate-600 dark:text-zinc-400 shrink-0 select-none z-20">
          <div className="flex items-center gap-1.5 font-medium truncate max-w-[70%]">
            <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] truncate">{title || 'Untitled Note'}</span>
            <span className="opacity-30">•</span>
            <span>{lineCount} lines</span>
          </div>
          <div className="flex items-center gap-2">
            <span>HTML5 / KaTeX</span>
          </div>
        </footer>
      )}

      {/* IFRAME DRAG SHIELD OVERLAY */}
      {isResizing && (
        <div 
          className="fixed inset-0 z-[99999] cursor-col-resize select-none bg-transparent"
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />
      )}
    </div>
  );
};
