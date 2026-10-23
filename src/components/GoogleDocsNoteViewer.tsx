import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  ExternalLink,
  Copy,
  Check,
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  RefreshCw,
  Zap,
  Pencil,
  X,
  Save,
  Tag as TagIcon,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { getCachedGoogleAccessToken, signInWithGoogle } from '../lib/firebase';
import { exportNoteToVisibleGoogleDrive, saveNoteToGoogleDrive } from '../lib/googleWorkspace';
import { copyFormattedTextToClipboard } from '../lib/tableClipboard';
import { saveSingleNoteToIDB } from '../lib/idbNotes';
import { APP_STYLES } from './ui/AppStyles';

export interface GoogleDocsNoteViewerProps {
  noteId?: string;
  title: string;
  content: string;
  tag?: string;
  questionNumber?: number;
  testTitle?: string;
  testId?: string;
  createdAt?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  fileUrl?: string;
  fileType?: string;
  isFromLocalCache?: boolean;
  isSyncingFresh?: boolean;
  onResyncFromDrive?: () => void;
  hideHeaderToolbar?: boolean;
  viewLayout?: 'page' | 'wide';
  paperTheme?: 'classic-light' | 'dark-canvas';
  onTogglePaperTheme?: () => void;
  docZoom?: number;
  onZoomChange?: (newZoom: number) => void;
  isEditing?: boolean;
  onIsEditingChange?: (isEditing: boolean) => void;
  onSaveNote?: (updated: {
    noteId?: string;
    title: string;
    content: string;
    tag: string;
    testId?: string;
    fileName?: string;
  }) => void;
}

export const GoogleDocsNoteViewer: React.FC<GoogleDocsNoteViewerProps> = ({
  noteId,
  title,
  content,
  tag = 'general',
  questionNumber,
  testTitle,
  testId,
  createdAt,
  driveFileId,
  driveWebViewLink,
  fileUrl,
  fileType,
  isFromLocalCache = false,
  isSyncingFresh = false,
  onResyncFromDrive,
  hideHeaderToolbar = true,
  viewLayout = 'page',
  paperTheme: controlledPaperTheme,
  onTogglePaperTheme,
  docZoom: controlledDocZoom,
  onZoomChange,
  isEditing: controlledIsEditing,
  onIsEditingChange,
  onSaveNote,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [internalDocZoom, setInternalDocZoom] = useState<number>(1.0);
  const [internalPaperTheme, setInternalPaperTheme] = useState<'classic-light' | 'dark-canvas'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark-canvas';
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('math_mock_theme_v1') : null;
    if (saved === 'dark') return 'dark-canvas';
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark-canvas';
    }
    return 'classic-light';
  });

  const docZoom = controlledDocZoom ?? internalDocZoom;
  const paperTheme = controlledPaperTheme ?? internalPaperTheme;

  // Local override states for live content updates after edit
  const [currentTitle, setCurrentTitle] = useState<string>(title);
  const [currentContent, setCurrentContent] = useState<string>(content);
  const [currentTag, setCurrentTag] = useState<string>(tag);

  useEffect(() => {
    setCurrentTitle(title);
    setCurrentContent(content);
    setCurrentTag(tag);
  }, [title, content, tag]);

  // Edit Mode States (supports both controlled and internal state)
  const [internalIsEditing, setInternalIsEditing] = useState<boolean>(false);
  const isEditing = controlledIsEditing !== undefined ? controlledIsEditing : internalIsEditing;

  const handleSetIsEditing = (val: boolean) => {
    setInternalIsEditing(val);
    onIsEditingChange?.(val);
  };

  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editTag, setEditTag] = useState<'general' | 'formula' | 'trick' | 'mistake' | 'table'>('general');
  const [editModeTab, setEditModeTab] = useState<'editor' | 'canvas'>('editor');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Sync edit buffer when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditTitle((prev) => prev || title.replace(/\.(md|txt|docx?)$/i, '').trim() || 'Untitled Study Document');
      setEditContent((prev) => prev || content || '');
      const validTags = ['general', 'formula', 'trick', 'mistake', 'table'];
      setEditTag((prev) => (validTags.includes(prev) ? prev : validTags.includes(tag) ? (tag as any) : 'general'));
    }
  }, [isEditing, title, content, tag]);

  const handleToggleTheme = () => {
    if (onTogglePaperTheme) {
      onTogglePaperTheme();
    } else {
      setInternalPaperTheme((prev) => (prev === 'classic-light' ? 'dark-canvas' : 'classic-light'));
    }
  };

  const handleUpdateZoom = (newZoom: number) => {
    const clamped = Math.max(0.7, Math.min(1.5, Number(newZoom.toFixed(1))));
    if (onZoomChange) {
      onZoomChange(clamped);
    } else {
      setInternalDocZoom(clamped);
    }
  };

  // Format creation timestamp
  const formattedDate = useMemo(() => {
    if (!createdAt) return 'Recent';
    try {
      const d = new Date(createdAt);
      return isNaN(d.getTime()) ? 'Recent' : d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recent';
    }
  }, [createdAt]);

  // Clean title
  const cleanTitle = useMemo(() => {
    return currentTitle.replace(/\.(md|txt|docx?)$/i, '').trim() || 'Untitled Study Document';
  }, [currentTitle]);

  // Clean note body content: strip leading redundant filename header and any Python plotting code blocks
  const cleanBody = useMemo(() => {
    if (!currentContent) return '';
    let body = currentContent;
    try {
      // Escape special characters in cleanTitle so regex never throws
      const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleRegex = new RegExp(`^#*\\s*${escapedTitle}\\s*\\n+`, 'i');
      body = body.replace(titleRegex, '').trim();
    } catch {
      // Keep original body
    }

    const hasImage = Boolean(
      (fileUrl && fileUrl.trim()) ||
      driveFileId ||
      fileType === 'image' ||
      currentTag === 'image' ||
      /!\[.*?\]\([^)]+\)|<img\s+[^>]*src=|data:image\//i.test(body)
    );

    // If an image is present or python plotting code exists, strip raw Python plotting scripts so only clean details & explanations are shown
    if (hasImage || /```(?:python|py)?[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/i.test(body)) {
      const strippedBody = body
        .replace(/```(?:python|py)?\s*[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (strippedBody.length > 0) {
        body = strippedBody;
      } else if (hasImage) {
        body = '';
      }
    }

    // Strip stale/broken blob: URLs or empty image markdown
    body = body.replace(/!\[.*?\]\((?:blob:[^)]+|data:image\/[^;]+;base64,\s*|\s*)\)/gi, '');

    return body;
  }, [currentContent, cleanTitle, fileUrl, driveFileId, fileType, currentTag]);

  // Tag styling configurations
  const tagConfig = useMemo(() => {
    const t = (currentTag || 'general').toLowerCase();
    switch (t) {
      case 'table':
        return {
          label: 'Data Table',
          bg: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
          dot: 'bg-cyan-500',
        };
      case 'formula':
        return {
          label: 'Mathematical Formula',
          bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
          dot: 'bg-blue-500',
        };
      case 'trick':
        return {
          label: 'Shortcut & Trick',
          bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
          dot: 'bg-purple-500',
        };
      case 'mistake':
        return {
          label: 'Mistake Analysis',
          bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: 'Study Note',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
          dot: 'bg-emerald-500',
        };
    }
  }, [currentTag]);

  // Start Editing Note
  const handleStartEdit = () => {
    setEditTitle(cleanTitle);
    setEditContent(cleanBody || currentContent || '');
    const validTags = ['general', 'formula', 'trick', 'mistake', 'table'];
    setEditTag(validTags.includes(currentTag) ? (currentTag as any) : 'general');
    setEditModeTab('editor');
    handleSetIsEditing(true);
  };

  // Cancel Editing
  const handleCancelEdit = () => {
    handleSetIsEditing(false);
  };

  // Save Note Changes
  const handleSaveEdit = async () => {
    const trimmedTitle = editTitle.trim() || 'Untitled Note';
    const trimmedContent = editContent.trim();
    setIsSaving(true);

    try {
      const resolvedNoteId = noteId || `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const updatedNoteItem = {
        id: resolvedNoteId,
        testId: testId || 'global_repo',
        attemptId: 'repo_manual',
        questionNumber: questionNumber || 0,
        content: trimmedContent,
        tag: editTag,
        createdAt: createdAt || new Date().toISOString(),
        fileName: trimmedTitle,
        fileType: fileType || 'file',
        fileUrl: fileUrl,
        driveFileId: driveFileId,
        driveWebViewLink: driveWebViewLink,
      };

      // 1. Save to local IndexedDB
      await saveSingleNoteToIDB(updatedNoteItem as any);

      // 2. Sync to Google Drive if connected
      const token = getCachedGoogleAccessToken();
      if (token) {
        saveNoteToGoogleDrive(token, updatedNoteItem as any, testTitle).catch(() => {});
      }

      // 3. Notify parent components
      if (onSaveNote) {
        onSaveNote({
          noteId: resolvedNoteId,
          title: trimmedTitle,
          content: trimmedContent,
          tag: editTag,
          testId: testId || 'global_repo',
          fileName: trimmedTitle,
        });
      }

      // 4. Update local state
      setCurrentTitle(trimmedTitle);
      setCurrentContent(trimmedContent);
      setCurrentTag(editTag);

      // 5. Dispatch global notes updated event
      window.dispatchEvent(new CustomEvent('notes-updated', { detail: updatedNoteItem }));

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        handleSetIsEditing(false);
      }, 500);
    } catch (err) {
      console.warn('Failed to save edited note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Determine if this note is purely a standalone table or a complete multi-section response
  const isStandaloneTable = useMemo(() => {
    if (currentTag === 'table') return true;
    if (!cleanBody) return false;
    const trimmed = cleanBody.trim();
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (
      lines.length > 0 &&
      lines.every(
        (l) =>
          (l.startsWith('|') && l.endsWith('|')) ||
          l.startsWith('<table') ||
          l.endsWith('</table>') ||
          l.startsWith('<tr>') ||
          l.startsWith('<td>') ||
          l.startsWith('</th>')
      )
    ) {
      return true;
    }
    const nonTable = trimmed
      .replace(/\|[^\n]+\|/g, '')
      .replace(/<table[\s\S]*?<\/table>/gi, '')
      .trim();
    return nonTable.length < 15;
  }, [cleanBody, currentTag]);

  const [imgLoadFailed, setImgLoadFailed] = useState<boolean>(false);

  // Derive effective file URL for attachments or Google Drive files
  const effectiveFileUrl = useMemo(() => {
    if (fileUrl && fileUrl.trim()) {
      const trimmed = fileUrl.trim();
      // Expired blob: URLs from previous sessions cannot be rendered
      if (trimmed.startsWith('blob:') && !driveFileId) {
        return undefined;
      }
      return trimmed;
    }
    if (driveFileId) {
      return `https://lh3.googleusercontent.com/d/${driveFileId}`;
    }
    return undefined;
  }, [fileUrl, driveFileId]);

  useEffect(() => {
    setImgLoadFailed(false);
  }, [effectiveFileUrl]);

  // Check if cleanBody already contains an embedded image tag
  const hasImageInCleanBody = useMemo(() => {
    if (!cleanBody) return false;
    return /!\[.*?\]\([^)]+\)|<img\s+[^>]*src=|data:image\//i.test(cleanBody);
  }, [cleanBody]);

  // Handle Copy text with rich table structure and visual image preservation
  const handleCopy = async () => {
    try {
      const textToCopy = cleanBody || currentContent || (effectiveFileUrl ? `[Attached Visual: ${cleanTitle}]` : '');
      const success = await copyFormattedTextToClipboard(textToCopy, {
        generatedImages: effectiveFileUrl && !hasImageInCleanBody ? [effectiveFileUrl] : undefined,
        title: cleanTitle
      });
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.warn('Failed to copy note response:', e);
    }
  };

  // Export and Open in Google Docs
  const [isOpeningInDocs, setIsOpeningInDocs] = useState<boolean>(false);

  const handleOpenInDocs = async () => {
    let token = getCachedGoogleAccessToken();
    if (!token) {
      try {
        await signInWithGoogle();
        token = getCachedGoogleAccessToken();
      } catch (err) {
        console.warn('Google sign-in error:', err);
      }
    }
    if (!token) {
      return;
    }

    setIsOpeningInDocs(true);
    try {
      const res = await exportNoteToVisibleGoogleDrive(token, {
        id: driveFileId || 'note',
        content: cleanBody || currentContent,
        fileName: cleanTitle,
        tag: currentTag,
      }, testTitle);
      if (res.webViewLink) {
        window.open(res.webViewLink, '_blank');
      }
    } catch (err: any) {
      console.warn('Failed to export to Google Docs:', err);
    } finally {
      setIsOpeningInDocs(false);
    }
  };

  // Print Document Page
  const handlePrint = () => {
    window.print();
  };

  // Download Note as Markdown
  const handleDownloadMarkdown = () => {
    const markdownContent = cleanBody || currentContent;
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full flex flex-col bg-black text-slate-100 overflow-hidden font-sans">
      {/* Top Document Toolbar */}
      {!hideHeaderToolbar && (
        <div className={`${APP_STYLES.surface.header} flex flex-wrap items-center justify-between px-3 sm:px-6 py-2 sm:py-2.5 gap-2 shrink-0 select-none`}>
          {/* Left: Document Info & Cache Indicator */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-[#0084ff] border border-blue-500/20 text-xs font-semibold">
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google Docs Format</span>
              <span className="sm:hidden">Docs</span>
            </div>

            {/* Local Cache Status Badge */}
            {isFromLocalCache && (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium"
                title="Rendered directly from local IndexedDB cache with 0ms delay"
              >
                <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                <span className="hidden md:inline">Instant Local Cache</span>
                <span className="md:hidden">Cached</span>
              </div>
            )}

            {/* Re-sync button if file is from Drive */}
            {driveFileId && onResyncFromDrive && (
              <button
                type="button"
                onClick={onResyncFromDrive}
                disabled={isSyncingFresh}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#202330] hover:bg-[#2a2e40] text-zinc-300 text-xs font-medium border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                title="Force reload latest version from Google Drive"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingFresh ? 'animate-spin text-[#0084ff]' : ''}`} />
                <span className="hidden lg:inline">{isSyncingFresh ? 'Syncing...' : 'Re-sync from Drive'}</span>
              </button>
            )}
          </div>

          {/* Right: Document Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Edit Note Button */}
            {!isEditing ? (
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-[#0084ff] border border-blue-500/30 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                title="Edit note title, tag, and content"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Note</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Note'}</span>
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="flex items-center bg-[#1e212d] rounded-lg p-0.5 border border-zinc-700/60">
              <button
                type="button"
                onClick={() => handleUpdateZoom(docZoom - 0.1)}
                disabled={docZoom <= 0.7}
                className="p-1 hover:bg-[#2b2f42] rounded text-zinc-300 disabled:opacity-30 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleUpdateZoom(1.0)}
                className="text-[11px] font-semibold text-zinc-300 hover:text-white px-1.5 cursor-pointer"
                title="Reset Zoom to 100%"
              >
                {Math.round(docZoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() => handleUpdateZoom(docZoom + 0.1)}
                disabled={docZoom >= 1.4}
                className="p-1 hover:bg-[#2b2f42] rounded text-zinc-300 disabled:opacity-30 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Paper Theme Toggle */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="p-1.5 rounded-lg bg-[#1e212d] hover:bg-[#2b2f42] text-zinc-300 border border-zinc-700/60 transition-colors cursor-pointer"
              title={paperTheme === 'classic-light' ? 'Switch to Dark Document Canvas' : 'Switch to Google Docs White Paper'}
            >
              {paperTheme === 'classic-light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            </button>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="p-1.5 rounded-lg bg-[#1e212d] hover:bg-[#2b2f42] text-zinc-300 border border-zinc-700/60 transition-colors cursor-pointer"
              title="Download as Markdown (.md)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg bg-[#1e212d] hover:bg-[#2b2f42] text-zinc-300 border border-zinc-700/60 transition-colors cursor-pointer"
              title="Print Document Sheet"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>

            {/* Open in Google Docs Button */}
            <button
              type="button"
              onClick={handleOpenInDocs}
              disabled={isOpeningInDocs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 border-0 disabled:opacity-50"
              title="Export and open directly in Google Docs"
            >
              {isOpeningInDocs ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{isOpeningInDocs ? 'Opening...' : 'Open in Docs'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Document Workspace / Canvas */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 md:p-12 flex justify-center items-start ${
          paperTheme === 'classic-light'
            ? 'bg-white text-slate-900'
            : 'bg-black text-zinc-100'
        }`}
      >
        <div
          style={{
            transform: `scale(${docZoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className={`w-full ${
            viewLayout === 'wide' ? 'max-w-5xl lg:max-w-6xl' : 'max-w-[850px]'
          } py-2 sm:py-4`}
        >
          {/* If In Editing Mode */}
          {isEditing ? (
            <div className="space-y-4">
              <div className={`${APP_STYLES.widgets.container} p-4 sm:p-6 shadow-xl space-y-4`}>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/15 text-[#0084ff] flex items-center justify-center font-bold">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Edit Saved Note</h3>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Update title, category tag, and LaTeX/Markdown explanation
                      </p>
                    </div>
                  </div>

                  {/* Mode Tabs */}
                  <div className="flex items-center bg-slate-200 dark:bg-zinc-800 p-0.5 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setEditModeTab('editor')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        editModeTab === 'editor'
                          ? 'bg-white dark:bg-[#1f222e] text-[#0084ff] shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditModeTab('canvas')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        editModeTab === 'canvas'
                          ? 'bg-white dark:bg-[#1f222e] text-[#0084ff] shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      Canvas
                    </button>
                  </div>
                </div>

                {/* Title Input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Document Title:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Enter document title..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#202330] border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-[#0084ff]"
                  />
                </div>

                {/* Classification Tag Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Classification Tag:</label>
                  <div className="flex flex-wrap gap-2">
                    {(['general', 'formula', 'trick', 'mistake', 'table'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditTag(t)}
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                          editTag === t
                            ? t === 'formula'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : t === 'trick'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : t === 'mistake'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : t === 'table'
                              ? 'bg-cyan-600 text-white shadow-xs'
                              : 'bg-[#0084ff] text-white shadow-xs'
                            : 'bg-slate-200/80 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editor / Canvas Viewport */}
                {editModeTab === 'editor' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Content (Markdown & LaTeX Math):
                    </label>
                    <textarea
                      rows={14}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Write math explanation, formula derivation, key properties..."
                      className="w-full p-4 rounded-xl bg-white dark:bg-[#202330] border border-slate-300 dark:border-zinc-700 text-xs sm:text-sm font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#0084ff] leading-relaxed resize-y"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 px-0.5">
                      <label className="font-bold text-slate-700 dark:text-zinc-300">Canvas Live Document</label>
                      <span className="text-[11px] text-[#0084ff] font-semibold">
                        Drag table grid lines to resize rows & columns
                      </span>
                    </div>
                    <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#10121a] border border-slate-300 dark:border-zinc-800 min-h-[300px] text-sm sm:text-base prose dark:prose-invert max-w-none shadow-2xs">
                      <MathRenderer content={editContent || '*No content to preview*'} />
                    </div>
                  </div>
                )}

                {/* Save and Cancel Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer border-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0084ff] hover:bg-[#0073e6] active:scale-95 text-white transition-all border-0 shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isSaving ? 'Saving Changes...' : saveSuccess ? 'Saved!' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Document Body in Read Mode */
            <div className="space-y-6 select-text" style={{ WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default' }}>
              {/* Clean Document Title in Read Mode (Study note and repository badges removed) */}
              <div className="pb-4 sm:pb-5 border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight leading-snug">
                  <MathRenderer content={cleanTitle} />
                </h1>
                {formattedDate && (
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono shrink-0">
                    {formattedDate}
                  </span>
                )}
              </div>

              {/* Render attached file image or PDF if provided and not already embedded in cleanBody */}
              {effectiveFileUrl && !hasImageInCleanBody && !imgLoadFailed && (
                <div className="my-4 text-center select-none">
                  {fileType === 'pdf' ? (
                    <div className="p-4 rounded-2xl bg-slate-100 dark:bg-[#21222e] border border-slate-200 dark:border-zinc-800 text-left max-w-md mx-auto">
                      <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6 text-rose-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">{cleanTitle || 'PDF Document'}</p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400">Attached PDF Document</p>
                        </div>
                        <a
                          href={effectiveFileUrl}
                          download={cleanTitle || 'document.pdf'}
                          className="px-3 py-1.5 rounded-lg bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold shrink-0"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={effectiveFileUrl}
                      alt={cleanTitle || 'Attached Visual'}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (driveFileId) {
                          if (!img.dataset.fallbackAttempt) {
                            img.dataset.fallbackAttempt = '1';
                            img.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600`;
                            return;
                          } else if (img.dataset.fallbackAttempt === '1') {
                            img.dataset.fallbackAttempt = '2';
                            img.src = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveFileId)}`;
                            return;
                          } else if (img.dataset.fallbackAttempt === '2') {
                            const token = getCachedGoogleAccessToken();
                            if (token) {
                              img.dataset.fallbackAttempt = '3';
                              img.src = `/api/drive/media/${encodeURIComponent(driveFileId)}?token=${encodeURIComponent(token)}`;
                              return;
                            }
                          }
                        }
                        // Hide element completely if load fails to prevent corrupted image placeholder
                        img.style.display = 'none';
                        setImgLoadFailed(true);
                      }}
                      className="max-h-[550px] max-w-full object-contain rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-md mx-auto my-2"
                      loading="lazy"
                    />
                  )}
                </div>
              )}

              {cleanBody ? (
                <>
                  <div
                    className={`prose max-w-none text-sm sm:text-base leading-relaxed select-text ${
                      paperTheme === 'classic-light'
                        ? 'prose-slate text-slate-800'
                        : 'prose-invert text-zinc-200'
                    }`}
                    style={{ WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default' }}
                  >
                    <MathRenderer content={cleanBody} tableActions={isStandaloneTable ? 'none' : 'copyOnly'} />
                  </div>

                  {/* Actions Under Response: Round Copy Button (Duplicate Edit Button Removed) */}
                  <div className="pt-4 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-start gap-2.5 select-none flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 border ${
                        copied
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-500/20'
                          : paperTheme === 'classic-light'
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200/90 shadow-2xs'
                          : 'bg-[#181a24] hover:bg-[#222533] text-zinc-200 border-zinc-700/60 shadow-2xs'
                      }`}
                      title="Copy complete note response to clipboard"
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${copied ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>
                        {copied ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3 text-[#0084ff]" />}
                      </div>
                      <span>{copied ? 'Copied to Clipboard' : 'Copy Response'}</span>
                    </button>
                  </div>
                </>
              ) : fileUrl ? (
                <div className="pt-4 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-start gap-2.5 select-none flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 border ${
                      copied
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-500/20'
                        : paperTheme === 'classic-light'
                        ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200/90 shadow-2xs'
                        : 'bg-[#181a24] hover:bg-[#222533] text-zinc-200 border-zinc-700/60 shadow-2xs'
                    }`}
                    title="Copy complete note response to clipboard"
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${copied ? 'bg-white/20' : 'bg-slate-100 dark:bg-zinc-800'}`}>
                      {copied ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3 text-[#0084ff]" />}
                    </div>
                    <span>{copied ? 'Copied to Clipboard' : 'Copy Response'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-20 space-y-3">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                  <p className="text-slate-500 text-sm italic">
                    This note has no text content.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0084ff] text-white text-xs font-bold cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Add Content Now</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
