import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
  RefreshCw,
  Layers,
  Sparkles,
  AlertCircle,
  Zap,
  Table,
  Printer,
  Sun,
  Moon,
  Columns,
  Square,
  Pencil,
  MoreVertical,
} from 'lucide-react';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import { GoogleDocsNoteViewer } from './GoogleDocsNoteViewer';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { getCachedGoogleAccessToken, signInWithGoogle } from '../lib/firebase';
import {
  fetchGoogleDrivePreviewBlob,
  getCleanFileName,
  exportNoteToVisibleGoogleDrive,
} from '../lib/googleWorkspace';
import {
  isImageFile,
  isPdfFile,
  getDriveImageCandidates,
  getDriveEmbedPreviewUrl,
  getDriveDirectDownloadUrl,
  extractAttachmentFileName,
} from '../lib/filePreviewUtils';
import {
  getCachedMedia,
  saveCachedMedia,
  removeCachedMedia,
} from '../lib/idbNotes';
import {
  studioFadeVariants,
  gpuAcceleratedStyle,
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

export interface PreviewableFile {
  id?: string;
  url?: string;
  fileUrl?: string;
  name?: string;
  fileName?: string;
  type?: 'image' | 'pdf' | 'file';
  fileType?: 'image' | 'pdf' | 'file';
  mimeType?: string;
  content?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  noteId?: string;
  testTitle?: string;
  questionNumber?: number;
  tag?: string;
  createdAt?: string;
}

interface UnifiedFileViewerModalProps {
  file: PreviewableFile | null;
  onClose: () => void;
}

export const UnifiedFileViewerModal: React.FC<UnifiedFileViewerModalProps> = ({ file, onClose }) => {
  // Lock background scroll when open
  useScrollLock(Boolean(file));

  // Handle hardware / browser back button to close modal
  useBackHandler({
    isOpen: Boolean(file),
    onBack: onClose,
    priority: 50,
    id: 'unified_file_viewer_modal',
  });

  // Core Viewer State
  const [resolvedType, setResolvedType] = useState<'image' | 'pdf' | 'file'>('file');
  const [activeMediaUrl, setActiveMediaUrl] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Local Cache & Sync State
  const [isFromLocalCache, setIsFromLocalCache] = useState<boolean>(false);
  const [isSyncingFresh, setIsSyncingFresh] = useState<boolean>(false);

  // View Mode: 'direct' (in-app renderer) or 'drive-embed' (Google Drive native iframe)
  const [viewMode, setViewMode] = useState<'direct' | 'drive-embed'>('direct');

  // Candidate index for image CDN fallback
  const [imageCandidateIndex, setImageCandidateIndex] = useState<number>(0);
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);

  // Image Transformations
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement | null>(null);

  // Document Display Settings
  const [docViewLayout, setDocViewLayout] = useState<'page' | 'wide'>('page');
  const [paperTheme, setPaperTheme] = useState<'classic-light' | 'dark-canvas'>(() => {
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
  const [docZoom, setDocZoom] = useState<number>(1.0);
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState<boolean>(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setIsOptionsMenuOpen(false);
      }
    };
    if (isOptionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOptionsMenuOpen]);

  // Sync theme with document dark mode on file open
  useEffect(() => {
    if (file) {
      const isDark = document.documentElement.classList.contains('dark');
      setPaperTheme(isDark ? 'dark-canvas' : 'classic-light');
      setIsEditingNote(false);
      setIsOptionsMenuOpen(false);
    }
  }, [file]);

  // Clean title for display
  const rawFileName = file?.fileName || file?.name || extractAttachmentFileName(file?.content) || '';
  const displayTitle = getCleanFileName(rawFileName, file?.content);

  // Detect if file represents a structured table note
  const isTableNote = useMemo(() => {
    if (!file) return false;
    if (file.tag === 'table') return true;
    if (file.fileName && /table/i.test(file.fileName)) return true;
    const body = textContent || file.content || '';
    if (body.includes('<table')) return true;
    return body.split('\n').some((l) => {
      const tr = l.trim();
      return (tr.startsWith('|') && tr.includes('|', 1)) || (tr.includes('|') && tr.split('|').length >= 3);
    });
  }, [file, textContent]);

  // Unique key used to identify and cache this file locally in IndexedDB
  const cacheKey = file?.driveFileId || file?.noteId || file?.url || file?.name || '';

  // Object URL lifecycle manager to prevent browser memory leaks
  const activeObjectUrlsRef = useRef<Set<string>>(new Set());

  const registerObjectUrl = useCallback((url: string) => {
    if (url && url.startsWith('blob:')) {
      activeObjectUrlsRef.current.add(url);
    }
  }, []);

  // Revoke all created blob URLs on unmount
  useEffect(() => {
    return () => {
      activeObjectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignored
        }
      });
      activeObjectUrlsRef.current.clear();
    };
  }, []);

  // Resolve Initial Type & URLs whenever file changes
  useEffect(() => {
    if (!file) {
      setActiveMediaUrl('');
      setTextContent('');
      setLoadError(null);
      setIsLoading(false);
      setIsFromLocalCache(false);
      setZoom(1.0);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setDocZoom(1.0);
      setViewMode('direct');
      setImageCandidateIndex(0);
      setImageCandidates([]);
      return;
    }

    let isCancelled = false;

    // Detect file type
    const isPdf = isPdfFile(file) || Boolean(rawFileName && /\.pdf$/i.test(rawFileName));
    const isImg = !isPdf && (isImageFile(file) || Boolean(rawFileName && /\.(jpe?g|png|gif|webp|svg|bmp|ico|heic|hdr)$/i.test(rawFileName)));
    const rawContent = (file.content || '').trim();
    const isTitleOnly = Boolean(
      rawFileName && (
        rawContent === rawFileName.trim() ||
        rawContent === `# ${rawFileName.trim()}` ||
        rawContent === (displayTitle || '').trim() ||
        rawContent === `# ${displayTitle || ''}`.trim() ||
        rawContent.toLowerCase().startsWith('attachment:')
      )
    );
    const hasRichText = rawContent.length > 0 && !rawContent.startsWith('data:image/') && rawContent !== (file.url || '').trim() && !isTitleOnly;
    const isPureImageOnly = isImg && !hasRichText;
    const finalType: 'image' | 'pdf' | 'file' = isPdf ? 'pdf' : isPureImageOnly ? 'image' : 'file';
    setResolvedType(finalType);

    // Initial content setup
    setTextContent(file.content || '');

    // Reset transformations
    setZoom(1.0);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setDocZoom(1.0);
    setViewMode('direct');
    setLoadError(null);
    setIsFromLocalCache(false);

    // Build image candidate URLs if Drive ID exists or fileUrl exists
    const token = getCachedGoogleAccessToken();
    let candidates: string[] = [];
    if (file.driveFileId) {
      candidates = getDriveImageCandidates(file.driveFileId, token);
    }

    const initialUrl = (
      file.fileUrl ||
      file.url ||
      (file.driveFileId ? `https://lh3.googleusercontent.com/d/${file.driveFileId}` : '')
    ).trim();

    if (initialUrl && !candidates.includes(initialUrl)) {
      candidates.unshift(initialUrl);
    }

    setImageCandidates(candidates);
    setImageCandidateIndex(0);

    const primaryUrl = candidates[0] || initialUrl;
    if (primaryUrl) {
      setActiveMediaUrl(primaryUrl);
    }

    const isDataUri = primaryUrl.startsWith('data:');

    // CHECK LOCAL INDEXEDDB CACHE FIRST (Instant 0ms preview without loading from Drive)
    async function loadWithLocalCachePriority() {
      if (cacheKey) {
        try {
          const cached = await getCachedMedia(cacheKey);
          if (cached && !isCancelled) {
            setIsFromLocalCache(true);
            setIsLoading(false);

            if (cached.blob) {
              const objUrl = URL.createObjectURL(cached.blob);
              registerObjectUrl(objUrl);
              setActiveMediaUrl(objUrl);
              if (cached.isPdf) {
                setResolvedType('pdf');
              } else if (cached.isImage && !hasRichText) {
                setResolvedType('image');
              } else {
                setResolvedType('file');
              }
            } else if (cached.textContent) {
              setTextContent(cached.textContent);
              if (!cached.isPdf && (!cached.isImage || hasRichText)) {
                setResolvedType('file');
              }
            }

            if (cached.textContent && !textContent) {
              setTextContent(cached.textContent);
            }
            return;
          }
        } catch (e) {
          console.warn('Media cache lookup fallback:', e);
        }
      }

      // If not cached, handle local data URLs or start Drive download
      if (isDataUri) {
        setActiveMediaUrl(initialUrl);
        setIsLoading(false);
        if (cacheKey) {
          fetch(initialUrl)
            .then((r) => r.blob())
            .then((blob) => {
              saveCachedMedia({
                key: cacheKey,
                blob,
                textContent: file.content,
                mimeType: isPdf ? 'application/pdf' : isImg ? 'image/png' : 'text/plain',
                fileName: displayTitle,
                isPdf,
                isImage: isImg,
                isText: !isPdf && !isImg,
              }).catch(() => {});
            })
            .catch(() => {});
        }
        return;
      }

      // If note has text content, set textContent immediately
      if (file.content) {
        setTextContent(file.content);
        if (!isPdf && !isImg) {
          setResolvedType('file');
        }
      }

      if (primaryUrl) {
        setActiveMediaUrl(primaryUrl);
        setIsLoading(false);
      }

      // Handle Drive background download
      if (file.driveFileId) {
        const currentToken = getCachedGoogleAccessToken();

        if (currentToken) {
          try {
            const res = await fetchGoogleDrivePreviewBlob(currentToken, file.driveFileId, file.mimeType);
            if (!isCancelled) {
              if (res.objectUrl) registerObjectUrl(res.objectUrl);
              if (res.isPdf) {
                setResolvedType('pdf');
                setActiveMediaUrl(res.objectUrl);
              } else if (res.isImage && !hasRichText) {
                setResolvedType('image');
                setActiveMediaUrl(res.objectUrl);
              } else if (res.isText || hasRichText) {
                if (res.textContent) setTextContent(res.textContent);
                setResolvedType('file');
                if (res.objectUrl) setActiveMediaUrl(res.objectUrl);
              } else if (res.objectUrl) {
                setActiveMediaUrl(res.objectUrl);
              }

              setIsLoading(false);

              if (cacheKey && (res.blob || res.textContent)) {
                saveCachedMedia({
                  key: cacheKey,
                  blob: res.blob,
                  textContent: res.textContent || file.content,
                  mimeType: res.realMimeType || file.mimeType,
                  fileName: displayTitle,
                  isPdf: res.isPdf,
                  isImage: res.isImage,
                  isText: res.isText,
                }).then(() => {
                  if (!isCancelled) setIsFromLocalCache(true);
                }).catch(() => {});
              }
            }
            return;
          } catch {
            // Silently fallback to candidate URLs
          }
        }

        // Fallback candidate URLs for images
        if (isImg && candidates.length > 0) {
          setActiveMediaUrl(candidates[0]);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(false);
    }

    loadWithLocalCachePriority();

    return () => {
      isCancelled = true;
    };
  }, [file, rawFileName, displayTitle, cacheKey, registerObjectUrl]);

  // Smooth mouse wheel zoom for images
  useEffect(() => {
    const el = imgContainerRef.current;
    if (!el || resolvedType !== 'image') return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom((prev) => Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.3), 5.0));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [resolvedType, activeMediaUrl]);

  // Handle Manual Force Re-Sync from Google Drive
  const handleForceResyncFromDrive = async () => {
    if (!file?.driveFileId) return;
    setIsSyncingFresh(true);
    try {
      if (cacheKey) {
        await removeCachedMedia(cacheKey);
      }
      setIsFromLocalCache(false);

      const token = getCachedGoogleAccessToken();
      if (token) {
        const res = await fetchGoogleDrivePreviewBlob(token, file.driveFileId, file.mimeType);
        if (res.objectUrl) registerObjectUrl(res.objectUrl);
        if (res.isPdf) {
          setResolvedType('pdf');
          setActiveMediaUrl(res.objectUrl);
        } else if (res.isImage) {
          setResolvedType('image');
          setActiveMediaUrl(res.objectUrl);
        } else if (res.isText) {
          if (res.textContent) {
            setTextContent(res.textContent);
          }
          setResolvedType('file');
        } else if (res.objectUrl) {
          setActiveMediaUrl(res.objectUrl);
        }

        if (cacheKey) {
          await saveCachedMedia({
            key: cacheKey,
            blob: res.blob,
            textContent: res.textContent || file.content,
            mimeType: res.realMimeType || file.mimeType,
            fileName: displayTitle,
            isPdf: res.isPdf,
            isImage: res.isImage,
            isText: res.isText,
          });
          setIsFromLocalCache(true);
        }
      }
    } catch (err) {
      console.warn('Manual resync error:', err);
    } finally {
      setIsSyncingFresh(false);
    }
  };

  // Handle Image CDN fallback on error
  const handleImageError = () => {
    if (imageCandidates.length > 0 && imageCandidateIndex < imageCandidates.length - 1) {
      const nextIndex = imageCandidateIndex + 1;
      setImageCandidateIndex(nextIndex);
      setActiveMediaUrl(imageCandidates[nextIndex]);
    } else {
      setLoadError('Image preview could not be loaded directly. Authorization may be required.');
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!file) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (resolvedType === 'image' && viewMode === 'direct') {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoom((prev) => Math.min(prev + 0.25, 5.0));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom((prev) => Math.max(prev - 0.25, 0.3));
        } else if (e.key === '0') {
          e.preventDefault();
          setZoom(1.0);
          setPan({ x: 0, y: 0 });
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          setRotation((prev) => (prev + 90) % 360);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, resolvedType, viewMode, onClose]);

  // Print Document Page
  const handlePrint = () => {
    window.print();
  };

  // Download Note or Media
  const handleDownload = () => {
    if (resolvedType === 'file') {
      const textToDownload = textContent || file?.content || '';
      const blob = new Blob([textToDownload], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${displayTitle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = rawFileName || displayTitle || 'downloaded-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const [isExportingToDrive, setIsExportingToDrive] = useState<boolean>(false);

  const handleOpenInDocsOrDrive = async () => {
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

    setIsExportingToDrive(true);
    try {
      const res = await exportNoteToVisibleGoogleDrive(token, {
        id: file?.noteId || file?.driveFileId || 'note',
        content: textContent || file?.content || '',
        fileName: displayTitle,
        tag: file?.tag,
      });
      if (res.webViewLink) {
        window.open(res.webViewLink, '_blank');
      }
    } catch (err: any) {
      console.warn('Failed to export to Google Drive / Docs:', err);
    } finally {
      setIsExportingToDrive(false);
    }
  };

  if (!file) return null;

  const driveEmbedUrl = file.driveFileId ? getDriveEmbedPreviewUrl(file.driveFileId) : '';
  const downloadUrl =
    activeMediaUrl ||
    (file.driveFileId ? getDriveDirectDownloadUrl(file.driveFileId) : file.url || '');

  const externalDriveUrl =
    file.driveWebViewLink ||
    (file.driveFileId ? `https://drive.google.com/file/d/${file.driveFileId}/view` : '');

  return (
    <AnimatePresence>
      <motion.div
        variants={studioFadeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={gpuAcceleratedStyle}
        className={`fixed inset-0 z-50 w-screen h-screen flex flex-col ${APP_STYLES.page} overflow-hidden`}
      >
        {/* Sleek Minimal Unified Top Header Bar */}
        <header className="h-13 px-3 sm:px-5 py-2 bg-white/95 dark:bg-[#21222e]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-zinc-800/80 shrink-0 flex items-center justify-between gap-3 select-none z-20">
            {/* Left Group: Close/Back, Icon, Title, and Badges */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer active:scale-95"
                title="Close Preview (Esc)"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800" />

              <div className="flex items-center gap-2 min-w-0">
                <div className="shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/50">
                  {resolvedType === 'pdf' ? (
                    <Paperclip className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                  ) : resolvedType === 'image' ? (
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  ) : isTableNote ? (
                    <Table className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  ) : file.tag === 'formula' ? (
                    <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  ) : file.tag === 'trick' ? (
                    <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                  )}
                </div>

                <div className="flex items-center min-w-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[170px] sm:max-w-xs md:max-w-md lg:max-w-lg">
                    {displayTitle}
                  </h3>
                </div>
              </div>
            </div>

            {/* Center Group: Contextual Compact Floating Controls Pill */}
            {resolvedType === 'file' ? (
              <div className="hidden md:flex items-center bg-slate-100 dark:bg-[#21222e]/90 border border-slate-200 dark:border-zinc-700/60 rounded-full px-2 py-1 gap-1 text-xs shadow-xs text-slate-700 dark:text-zinc-300">
                {/* Document Layout Toggle: Page View vs Wide View */}
                <button
                  type="button"
                  onClick={() => setDocViewLayout((prev) => (prev === 'page' ? 'wide' : 'page'))}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-[11px] font-medium"
                  title={docViewLayout === 'page' ? 'Switch to Wide Full-Width View' : 'Switch to Centered Page View'}
                >
                  {docViewLayout === 'page' ? <Columns className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span>{docViewLayout === 'page' ? 'Page' : 'Wide'}</span>
                </button>

                <div className="w-px h-3 bg-slate-300 dark:bg-zinc-700/80 mx-0.5" />

                {/* Paper Theme Toggle: Light vs Dark */}
                <button
                  type="button"
                  onClick={() => setPaperTheme((prev) => (prev === 'classic-light' ? 'dark-canvas' : 'classic-light'))}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title={paperTheme === 'classic-light' ? 'Switch to Dark Canvas' : 'Switch to White Paper'}
                >
                  {paperTheme === 'classic-light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                </button>

                <div className="w-px h-3 bg-slate-300 dark:bg-zinc-700/80 mx-0.5" />

                {/* Document Zoom Controls */}
                <button
                  type="button"
                  onClick={() => setDocZoom((prev) => Math.max(0.7, Number((prev - 0.1).toFixed(1))))}
                  disabled={docZoom <= 0.7}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDocZoom(1.0)}
                  className="text-[11px] font-bold text-[#0084ff] hover:underline px-1 cursor-pointer"
                  title="Reset Zoom to 100%"
                >
                  {Math.round(docZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setDocZoom((prev) => Math.min(1.5, Number((prev + 0.1).toFixed(1))))}
                  disabled={docZoom >= 1.5}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : resolvedType === 'image' && viewMode === 'direct' ? (
              <div className="hidden md:flex items-center bg-slate-100 dark:bg-[#21222e]/90 border border-slate-200 dark:border-zinc-700/60 rounded-full px-2 py-1 gap-1 text-xs shadow-xs text-slate-700 dark:text-zinc-300">
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(prev - 0.25, 0.3))}
                  disabled={zoom <= 0.3}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1.0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="text-[11px] font-bold text-[#0084ff] hover:underline px-1 cursor-pointer"
                  title="Reset Zoom to 100% (0)"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(prev + 0.25, 5.0))}
                  disabled={zoom >= 5.0}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 disabled:opacity-30 cursor-pointer"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-3 bg-slate-300 dark:bg-zinc-700/80 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-1 rounded-full hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Rotate 90° Clockwise (R)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : null}

            {/* Right Group: Pencil Icon (Edit Note) + Options Menu */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Edit Note Button: Icon only with Pencil */}
              {resolvedType === 'file' && (
                <button
                  type="button"
                  onClick={() => setIsEditingNote((prev) => !prev)}
                  className={`w-8.5 h-8.5 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 border-0 outline-none ${
                    isEditingNote
                      ? 'bg-[#0084ff] text-white hover:bg-[#0073e6]'
                      : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-[#0084ff] dark:text-blue-300'
                  }`}
                  title={isEditingNote ? 'Switch to View Mode' : 'Edit Note'}
                >
                  <Pencil className="w-4 h-4 stroke-[2.2]" />
                </button>
              )}

              {/* Options Menu Button (Print, Download, Sync, Open in Docs) */}
              <div className="relative" ref={optionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                  className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border-0 active:scale-95 outline-none"
                  title="More Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isOptionsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200/90 dark:border-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.15)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] p-1.5 z-50 text-xs text-slate-700 dark:text-zinc-200 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                    {/* Print Document */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        handlePrint();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 font-medium"
                    >
                      <Printer className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Print Document</span>
                    </button>

                    {/* Download File / Markdown */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsOptionsMenuOpen(false);
                        handleDownload();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 font-medium"
                    >
                      <Download className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Download {resolvedType === 'file' ? 'Markdown (.md)' : 'File'}</span>
                    </button>

                    {/* Force Re-Sync from Drive */}
                    {file.driveFileId && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOptionsMenuOpen(false);
                          handleForceResyncFromDrive();
                        }}
                        disabled={isSyncingFresh}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 font-medium disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 text-emerald-500 ${isSyncingFresh ? 'animate-spin' : ''}`} />
                        <span>Sync from Google Drive</span>
                      </button>
                    )}

                    {/* Open in Google Docs */}
                    {resolvedType === 'file' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOptionsMenuOpen(false);
                          handleOpenInDocsOrDrive();
                        }}
                        disabled={isExportingToDrive}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 font-medium disabled:opacity-50"
                      >
                        {isExportingToDrive ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-[#0084ff]" />
                        ) : (
                          <ExternalLink className="w-4 h-4 text-[#0084ff]" />
                        )}
                        <span>Open in Google Docs</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

        {/* Viewer Main Viewport */}
        <main className="flex-1 w-full h-full overflow-hidden relative flex items-center justify-center bg-[#f1f5f9] dark:bg-[#090a0f]">
          {/* Loading Overlay */}
          {isLoading && !activeMediaUrl && !textContent && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f8fafc]/90 dark:bg-[#090a0f]/90 backdrop-blur-xs gap-3">
              <div className="w-8 h-8 rounded-full border-3 border-[#0084ff] border-t-transparent animate-spin" />
              <p className="text-xs text-slate-600 dark:text-zinc-400 font-medium">Opening document preview...</p>
            </div>
          )}

          {/* Error Overlay */}
          {loadError && !activeMediaUrl && !textContent && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-[#f8fafc] dark:bg-[#090a0f]">
              <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Unable to Load Preview</h4>
              <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-md mb-4">{loadError}</p>
              {externalDriveUrl && (
                <a
                  href={externalDriveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0084ff] hover:bg-[#0073e6] text-white text-xs font-bold transition-all cursor-pointer shadow-xs border-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google Drive</span>
                </a>
              )}
            </div>
          )}

          {/* Content Display: Direct vs Drive Embed */}
          {viewMode === 'drive-embed' && driveEmbedUrl ? (
            /* Native Google Drive Embedded Iframe */
            <div className="w-full h-full bg-[#14161f] flex flex-col">
              <iframe
                src={driveEmbedUrl}
                title={displayTitle}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            </div>
          ) : resolvedType === 'image' && activeMediaUrl ? (
            /* High-Resolution Pan & Zoom Image Viewer */
            <div
              ref={imgContainerRef}
              onMouseDown={(e) => {
                setIsDragging(true);
                dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                setPan({
                  x: e.clientX - dragStartRef.current.x,
                  y: e.clientY - dragStartRef.current.y,
                });
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onDoubleClick={() => {
                if (zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                } else {
                  setZoom(2.0);
                }
              }}
              className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
            >
              <img
                src={activeMediaUrl}
                alt={displayTitle}
                referrerPolicy="no-referrer"
                onError={handleImageError}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.12s ease-out',
                  maxHeight: '94vh',
                  maxWidth: '94vw',
                }}
                className="object-contain pointer-events-none rounded-lg shadow-2xl"
              />
            </div>
          ) : resolvedType === 'pdf' && (activeMediaUrl?.trim() || file.url?.trim()) ? (
            /* Canvas-Based PDF Viewer with Integrated Bottom Dock */
            <div className="w-full h-full overflow-hidden bg-slate-950 flex flex-col">
              <PdfCanvasViewer
                url={activeMediaUrl?.trim() || file.url?.trim() || ''}
                fileName={rawFileName || displayTitle}
                onClose={onClose}
                hideTopToolbar={true}
              />
            </div>
          ) : resolvedType === 'pdf' && driveEmbedUrl ? (
            /* PDF Fallback to Embedded Drive Viewer */
            <div className="w-full h-full overflow-hidden bg-[#14161f] flex flex-col">
              <iframe
                src={driveEmbedUrl}
                title={displayTitle}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            </div>
          ) : (
            /* Minimal Full-Screen Formatted Document & Note Viewer */
            <GoogleDocsNoteViewer
              noteId={file.noteId || (file as any).id}
              title={displayTitle}
              content={textContent || file.content || ''}
              tag={file.tag}
              questionNumber={file.questionNumber}
              testTitle={file.testTitle}
              testId={(file as any).testId}
              createdAt={file.createdAt}
              driveFileId={file.driveFileId}
              driveWebViewLink={file.driveWebViewLink}
              fileUrl={activeMediaUrl || file.fileUrl || file.url}
              fileType={file.fileType}
              isFromLocalCache={isFromLocalCache}
              isSyncingFresh={isSyncingFresh}
              onResyncFromDrive={file.driveFileId ? handleForceResyncFromDrive : undefined}
              hideHeaderToolbar={true}
              viewLayout={docViewLayout}
              paperTheme={paperTheme}
              onTogglePaperTheme={() => setPaperTheme((prev) => (prev === 'classic-light' ? 'dark-canvas' : 'classic-light'))}
              docZoom={docZoom}
              onZoomChange={setDocZoom}
              isEditing={isEditingNote}
              onIsEditingChange={setIsEditingNote}
              onSaveNote={(updated) => {
                setTextContent(updated.content);
              }}
            />
          )}
        </main>
      </motion.div>
    </AnimatePresence>
  );
};
