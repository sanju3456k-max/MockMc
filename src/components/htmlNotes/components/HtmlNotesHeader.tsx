import React from 'react';
import {
  ArrowLeft,
  Save,
  Check,
  MoreVertical,
  ListTree,
  Undo2,
  Redo2,
  Search,
  Code,
  Eye,
  Columns,
  FileCode,
  Edit2,
  Plus,
  Cloud,
  RefreshCw,
  Sparkles,
  History,
  Maximize2,
  Minimize2,
  Database,
  AlertTriangle,
  Printer
} from 'lucide-react';
import { type HtmlNoteItem, type HtmlProject } from '../../../lib/htmlNotesSync';
import { type DriveSyncStatus } from '../../../lib/htmlNotesDriveSync';
import { checkFirestoreDocSize, type DocSizeCheckResult } from '../../../lib/firestoreDocSizeValidator';
import { type ViewMode, type ViewportMode } from '../types';

interface HtmlNotesHeaderProps {
  onBack: () => void;
  onGoHome: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  viewportMode: ViewportMode;
  setViewportMode: (mode: ViewportMode) => void;
  onSaveCurrentFile: () => void;
  savedSuccess: boolean;
  hasUnsavedChanges?: boolean;
  onToggleMobileMore: () => void;
  // Google Drive
  isDriveConnected?: boolean;
  driveSyncStatus?: DriveSyncStatus;
  onTriggerDriveSync?: () => void;
  onConnectDrive?: () => void;
  // Row 2 actions
  onToggleOutline: () => void;
  headingsCount: number;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onToggleSearch: () => void;
  isSearchActive: boolean;
  onTriggerInsertImage: () => void;
  onOpenVersionHistory?: () => void;
  // AI Assistant
  onToggleAiAssistant?: () => void;
  isAiAssistantOpen?: boolean;
  activeProject?: HtmlProject | null;
  // Row 3: Files tabs
  activeProjectId: string;
  activeFileId: string;
  activeProjectFiles: HtmlNoteItem[];
  onOpenFile: (projectId: string, file: HtmlNoteItem, mode: ViewMode) => void;
  onAddFile: (projectId: string) => void;
  onDeleteFile: (e: React.MouseEvent, projectId: string, fileId: string) => void;
  // File rename
  renamingFileId: string | null;
  renamingFileTitle: string;
  setRenamingFileTitle: (val: string) => void;
  onStartRenameFile: (file: HtmlNoteItem) => void;
  onCommitRenameFile: (fileId: string) => void;
  onOpenMathEditor?: () => void;
  hideTopBar?: boolean;
  isFullScreenPreview?: boolean;
  onToggleFullScreenPreview?: () => void;
  isVisualEditActive?: boolean;
  onToggleVisualEdit?: () => void;
  onPrintDocument?: () => void;
  isPrinting?: boolean;
}

export const HtmlNotesHeader: React.FC<HtmlNotesHeaderProps> = ({
  onBack,
  onGoHome,
  viewMode,
  setViewMode,
  viewportMode,
  setViewportMode,
  onSaveCurrentFile,
  savedSuccess,
  hasUnsavedChanges = false,
  onToggleMobileMore,
  isDriveConnected = false,
  driveSyncStatus,
  onTriggerDriveSync,
  onConnectDrive,
  onToggleOutline,
  headingsCount,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onToggleSearch,
  isSearchActive,
  onTriggerInsertImage,
  onOpenVersionHistory,
  onToggleAiAssistant,
  isAiAssistantOpen = false,
  activeProject,
  activeProjectId,
  activeFileId,
  activeProjectFiles,
  onOpenFile,
  onAddFile,
  onDeleteFile,
  renamingFileId,
  renamingFileTitle,
  setRenamingFileTitle,
  onStartRenameFile,
  onCommitRenameFile,
  hideTopBar = false,
  onToggleFullScreenPreview,
  isFullScreenPreview = false,
  isVisualEditActive = false,
  onToggleVisualEdit,
  onPrintDocument,
  isPrinting = false
}) => {
  const tabsScrollRef = React.useRef<HTMLDivElement>(null);
  const activeTabRef = React.useRef<HTMLButtonElement>(null);

  const docSizeResult: DocSizeCheckResult | null = React.useMemo(() => {
    if (!activeProject) return null;
    return checkFirestoreDocSize(activeProject);
  }, [activeProject]);

  React.useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [activeFileId]);

  return (
    <>
      {/* COMPACT TOPBAR (Header Row 1: Back, Title, Viewport switcher, Save, Menu) */}
      {!hideTopBar && (
        <header className="topbar sticky top-0 z-30 bg-white dark:bg-[#0b0c10] border-b border-slate-200 dark:border-zinc-800/80 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-2.5 px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0">
          {/* Left: Clean Back Arrow & Brand Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onGoHome || onBack}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
              title="Back to Projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="brand cursor-pointer truncate font-semibold text-[17px]" onClick={onGoHome}>
              <span className="text-[#0b57d0] dark:text-[#a8c7fa]">Notes</span> Studio
            </div>
          </div>

          {/* Middle: Shifted Actions (Tablet & Desktop Only) - Undo/Redo, Search, Mode Switcher */}
          <div className="hidden md:flex items-center gap-2.5 mx-auto">
            {/* Combined Undo / Redo Single Pill Control */}
            <div className="flex items-center bg-slate-100 dark:bg-[#32353c] p-0.5 rounded-full shrink-0 border-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onUndo}
                disabled={!canUndo}
                className="w-8 h-8 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 disabled:active:scale-100 outline-none"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>

              <div className="w-[1px] h-4 bg-slate-300 dark:bg-zinc-600 my-auto shrink-0" />

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onRedo}
                disabled={!canRedo}
                className="w-8 h-8 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 disabled:active:scale-100 outline-none"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Find / Search Button */}
            <button
              type="button"
              onClick={onToggleSearch}
              className={`w-9 h-9 rounded-full border-0 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 outline-none ${
                isSearchActive
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#1f1f1f] dark:text-[#e3e3e3]'
              }`}
              title="Find text (Ctrl+F)"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* View Mode Toggle (Editor / Split / Preview) */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-[#32353c] rounded-full shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={`px-3 py-1 rounded-full text-xs font-medium border-0 flex items-center gap-1 cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] ${
                  viewMode === 'editor'
                    ? 'bg-[#0b57d0] text-white shadow-xs font-semibold'
                    : 'text-slate-700 dark:text-[#c4c7c5] hover:text-black dark:hover:text-white font-medium'
                }`}
                title="Code Editor Mode"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 rounded-full text-xs font-medium border-0 flex items-center gap-1 cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] ${
                  viewMode === 'split'
                    ? 'bg-[#0b57d0] text-white shadow-xs font-semibold'
                    : 'text-slate-700 dark:text-[#c4c7c5] hover:text-black dark:hover:text-white font-medium'
                }`}
                title="Split Code & Preview Mode"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded-full text-xs font-medium border-0 flex items-center gap-1 cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] ${
                  viewMode === 'preview'
                    ? 'bg-[#0b57d0] text-white shadow-xs font-semibold'
                    : 'text-slate-700 dark:text-[#c4c7c5] hover:text-black dark:hover:text-white font-medium'
                }`}
                title="Live Preview Mode"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>

            {/* Visual Edit Mode Toggle Button */}
            {(viewMode === 'preview' || viewMode === 'split') && onToggleVisualEdit && (
              <button
                type="button"
                onClick={onToggleVisualEdit}
                className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 outline-none border-0 shrink-0 ${
                  isVisualEditActive
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/50'
                    : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}
                title="Toggle Edit Mode: Click text in preview to edit strings, insert images, and adjust elements directly"
              >
                {isVisualEditActive ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Edit Mode: ON</span>
                  </>
                ) : (
                  <>
                    <Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Edit Mode</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Right: Save, Menu actions */}
          <nav className="actions flex items-center gap-1.5 sm:gap-2 font-semibold">

            {/* Document Size Validator Guardrail Badge */}
            {docSizeResult && (
              <div 
                className={`hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-mono font-medium transition-all select-none border-0 shrink-0 ${
                  docSizeResult.isExceeded
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 animate-pulse'
                    : docSizeResult.isApproachingLimit
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-[#32353c] dark:text-zinc-400'
                }`}
                title={`Firestore Project Document Size: ${docSizeResult.formattedSize} / 1 MB limit (${docSizeResult.percentageUsed}%). ${docSizeResult.warningMessage || 'Safe within limits.'}`}
              >
                {docSizeResult.isApproachingLimit || docSizeResult.isExceeded ? (
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${docSizeResult.isExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`} />
                ) : (
                  <Database className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 shrink-0" />
                )}
                <span>{docSizeResult.formattedSize}</span>
              </div>
            )}

            {/* Save Button - appears in vibrant orange when edited (saved locally, pending Firebase sync) */}
            {hasUnsavedChanges ? (
              <button
                type="button"
                onClick={onSaveCurrentFile}
                className="h-9 px-3 sm:px-3.5 rounded-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/25 border-0 cursor-pointer transition-all outline-none shrink-0"
                title="Data saved at local level. Click to sync to Firebase / Cloud"
              >
                <Save className="w-4 h-4 text-white shrink-0" />
                <span className="text-[12px] font-semibold">Save</span>
              </button>
            ) : savedSuccess ? (
              <button
                type="button"
                onClick={onSaveCurrentFile}
                className="h-9 px-3 sm:px-3.5 rounded-full bg-emerald-600 active:scale-95 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs border-0 cursor-pointer transition-all outline-none shrink-0"
                title="Saved to Firebase & Cloud"
              >
                <Check className="w-4 h-4 text-white stroke-[2.5] shrink-0" />
                <span className="text-[12px] font-semibold">Saved</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSaveCurrentFile}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-slate-500 dark:text-zinc-400 border-0 flex items-center justify-center cursor-pointer active:scale-95 transition-all outline-none shrink-0"
                title="All changes synced to Firebase"
              >
                <Save className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
              </button>
            )}

            {/* AI Assistant Button in Topbar */}
            {onToggleAiAssistant && (
              <button
                type="button"
                onClick={onToggleAiAssistant}
                className={`h-9 px-3 sm:px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 outline-none border-0 shrink-0 ${
                  isAiAssistantOpen
                    ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-slate-700 dark:text-zinc-200'
                }`}
                title="AI Studio Project Assistant (Co-Developer & File Maintainer)"
              >
                <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isAiAssistantOpen ? 'text-white' : 'text-[#0b57d0] dark:text-[#a8c7fa]'}`} />
                <span className="hidden sm:inline">AI Studio</span>
              </button>
            )}

            {/* Quick Print Document Button (Desktop & Tablet) */}
            {onPrintDocument && (
              <button
                type="button"
                onClick={onPrintDocument}
                disabled={isPrinting}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#444746] dark:text-[#c4c7c5] border-0 hidden sm:flex items-center justify-center cursor-pointer active:scale-95 transition-all outline-none shrink-0 disabled:opacity-50"
                title="Print Document (Native Print, Ctrl+P)"
              >
                {isPrinting ? (
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
              </button>
            )}

            {/* Studio Options Menu Button (3 dots) */}
            <button
              onClick={onToggleMobileMore}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#444746] dark:text-[#c4c7c5] border-0 flex items-center justify-center cursor-pointer active:scale-95 transition-all outline-none shrink-0"
              title="Studio Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </nav>
        </header>
      )}

      {/* ROW 2: Global Actions Row (Mobile Only - Hidden on Tablet & Desktop) */}
      <div className={`sticky ${hideTopBar ? 'top-0' : 'top-[48px] sm:top-[52px]'} z-25 flex md:hidden items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-[#0b0c10] border-b border-slate-200 dark:border-zinc-800/80 shrink-0`}>
        {/* Left: Outline (mobile only), Undo, Redo, Find/Search Buttons, AI Button */}
        <div className="flex items-center gap-2">
          {/* Outline / Drawer button: Shown ONLY on mobile when side 3-button activity rail is hidden */}
          <button
            type="button"
            onClick={onToggleOutline}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#0b57d0] dark:text-[#a8c7fa] border-0 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 outline-none"
            title={`Document Headings Outline (${headingsCount})`}
          >
            <ListTree className="w-4 h-4" />
          </button>

          {/* Combined Undo / Redo Single Pill Control */}
          <div className="flex items-center bg-slate-100 dark:bg-[#32353c] p-0.5 rounded-full shrink-0 border-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onUndo}
              disabled={!canUndo}
              className="w-8 h-8 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 disabled:active:scale-100 outline-none"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-slate-300 dark:bg-zinc-600 my-auto shrink-0" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRedo}
              disabled={!canRedo}
              className="w-8 h-8 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 disabled:active:scale-100 outline-none"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleSearch}
            className={`w-9 h-9 rounded-full border-0 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 outline-none ${
              isSearchActive
                ? 'bg-[#0b57d0] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#32353c] dark:hover:bg-[#3f424c] text-[#1f1f1f] dark:text-[#e3e3e3]'
            }`}
            title="Find text (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>

        </div>

        {/* Right: Edit Button & View Mode Toggle (Editor / Preview) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Visual Edit Mode Toggle Button - Left of Editor and Preview */}
          {onToggleVisualEdit && (
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'editor') {
                  setViewMode('preview');
                  if (!isVisualEditActive) {
                    onToggleVisualEdit();
                  }
                } else {
                  onToggleVisualEdit();
                }
              }}
              className={`h-7 px-2 sm:px-2.5 rounded-full text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95 outline-none border-0 shrink-0 ${
                isVisualEditActive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/50'
                  : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
              title="Toggle Edit Mode: Click text in preview to edit strings, insert images, and adjust elements directly"
            >
              {isVisualEditActive ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Edit: ON</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Edit<span className="hidden xs:inline"> Mode</span></span>
                </>
              )}
            </button>
          )}

          {/* View Mode Toggle (Editor / Preview) */}
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-[#32353c] rounded-full shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium border-0 flex items-center gap-1 cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] ${
                viewMode === 'editor'
                  ? 'bg-[#0b57d0] text-white shadow-xs font-semibold'
                  : 'text-slate-700 dark:text-[#c4c7c5] hover:text-black dark:hover:text-white font-medium'
              }`}
              title="Code Editor Mode"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium border-0 flex items-center gap-1 cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] ${
                viewMode === 'preview'
                  ? 'bg-[#0b57d0] text-white shadow-xs font-semibold'
                  : 'text-slate-700 dark:text-[#c4c7c5] hover:text-black dark:hover:text-white font-medium'
              }`}
              title="Live Preview Mode"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* FILES ROW (Header Row 3: File tabs) */}
      <div className="sticky top-[86px] sm:top-[90px] md:top-[48px] sm:md:top-[52px] z-20 flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-[#0b0c10] border-b border-slate-200 dark:border-zinc-800/80 shrink-0 min-h-[38px]">
        {/* Left: Scrollable file tabs (in-line according to available space) */}
        <div ref={tabsScrollRef} className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] py-0.5">
          {activeProjectFiles.map((file) => {
            const isActive = file.id === activeFileId;
            const isRenaming = renamingFileId === file.id;

            return (
              <div key={file.id} className="inline-flex items-center shrink-0">
                {isRenaming ? (
                  <input
                    type="text"
                    value={renamingFileTitle}
                    onChange={(e) => setRenamingFileTitle(e.target.value)}
                    onBlur={() => onCommitRenameFile(file.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onCommitRenameFile(file.id)}
                    autoFocus
                    className="px-2.5 py-1 text-[11px] font-bold rounded-full border border-[#0b57d0] bg-white dark:bg-zinc-900 max-w-[140px] outline-none"
                  />
                ) : (
                  <button
                    ref={isActive ? activeTabRef : undefined}
                    className={`h-7 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold cursor-pointer border-0 transition-all ${
                      isActive
                        ? 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] font-bold shadow-xs'
                        : 'bg-slate-100 hover:bg-[#e2e8f0] text-[#1f1f1f] dark:bg-[#282a30] dark:hover:bg-[#32353c] dark:text-[#e3e3e3]'
                    }`}
                    onClick={() => onOpenFile(activeProjectId, file, viewMode)}
                    onDoubleClick={() => onStartRenameFile(file)}
                    title="Click to open, double-click to rename"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-[200px] font-medium">{file.title || 'Untitled'}</span>
                    
                    {isActive && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartRenameFile(file);
                        }}
                        className="hover:text-blue-600 opacity-60 hover:opacity-100 ml-0.5"
                        title="Rename file"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                      </span>
                    )}

                    <span
                      onClick={(e) => onDeleteFile(e, activeProjectId, file.id)}
                      style={{ marginLeft: '3px', opacity: 0.6 }}
                      className="hover:opacity-100 hover:text-red-500 font-bold p-0.5 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
                      title="Close Tab (Delete Confirmation)"
                    >
                      ✕
                    </span>
                  </button>
                )}
              </div>
            );
          })}

        </div>

        {/* Right: Fixed Action Buttons (Never hidden when there are more file names) */}
        <div className="shrink-0 flex items-center gap-1.5 pl-1 bg-white dark:bg-[#0b0c10] border-l border-slate-200/60 dark:border-zinc-800/60">
          <button
            type="button"
            onClick={() => onAddFile(activeProjectId)}
            className="h-7 px-2.5 rounded-full bg-[#0b57d0]/10 hover:bg-[#0b57d0] text-[#0b57d0] hover:text-white dark:bg-[#a8c7fa]/20 dark:hover:bg-[#a8c7fa] dark:text-[#a8c7fa] dark:hover:text-[#041e49] text-xs font-bold border-0 flex items-center gap-1 shrink-0 cursor-pointer transition-all active:scale-95 shadow-xs"
            title="Add new file to current project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add File</span>
          </button>

          {onToggleFullScreenPreview && (
            <button
              type="button"
              onClick={onToggleFullScreenPreview}
              className={`h-7 px-2.5 rounded-full text-xs font-semibold border-0 flex items-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95 shadow-xs ${
                isFullScreenPreview
                  ? 'bg-[#0b57d0] text-white font-bold'
                  : 'bg-slate-100 hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#32353c] text-[#1f1f1f] dark:text-[#e3e3e3] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]'
              }`}
              title={isFullScreenPreview ? "Exit Full Screen Preview (Esc)" : "Show Preview in Full Screen"}
            >
              {isFullScreenPreview ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Exit Full Screen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Full Screen</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
