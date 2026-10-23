import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Paperclip,
  ImageIcon,
  Plus,
  ArrowLeft,
  X,
  Check,
  Tag,
  Download,
  ExternalLink,
  Cloud,
  CloudOff,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Sparkles,
  FileCode,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { DriveFileManager } from './DriveFileManager';
import { UnifiedFileViewerModal, type PreviewableFile } from './UnifiedFileViewerModal';
import {
  getAllNotesFromIDB,
  saveAllNotesToIDB,
  deleteNoteFromIDB,
  saveSingleNoteToIDB,
  addDeletedTombstone,
  isTombstoned,
  getDeletedTombstones,
} from '../lib/idbNotes';
import {
  getCachedGoogleAccessToken,
  setCachedGoogleAccessToken,
  isGoogleDriveTokenExpired,
  clearGoogleDriveAuth,
  signInWithGoogle,
} from '../lib/firebase';
import {
  loadNotesManifestFromGoogleDrive,
  loadAllNotesManifestsFromGoogleDrive,
  syncNotesManifestToGoogleDrive,
  deleteGoogleDriveFile,
  fetchGoogleDrivePreviewBlob,
  uploadPendingNotesToGoogleDrive,
  getCleanFileName,
  createGoogleDoc,
  getOrCreateTestNotesFolder,
} from '../lib/googleWorkspace';
import type { MathTest } from '../types';
import type { User } from 'firebase/auth';
import type { UserCustomNote } from './TestResultView';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import {
  studioTabVariants,
  studioModalVariants,
  studioBackdropVariants,
  gpuAcceleratedStyle,
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface NotesRepositoryViewProps {
  tests: MathTest[];
  currentUser?: User | null;
  onBack: () => void;
  onStartTest?: (test: MathTest) => void;
  onNavigateTab?: (tab: string) => void;
}

export const NotesRepositoryView: React.FC<NotesRepositoryViewProps> = ({
  tests,
  currentUser,
  onBack,
  onStartTest,
  onNavigateTab,
}) => {
  const [userNotes, setUserNotes] = useState<UserCustomNote[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Note Creation Modal State
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState<boolean>(false);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [newNoteTag, setNewNoteTag] = useState<'general' | 'formula' | 'trick' | 'mistake'>('general');
  const [newNoteTestId, setNewNoteTestId] = useState<string>('all');
  const [attachedFile, setAttachedFile] = useState<{
    url: string;
    name: string;
    type: 'image' | 'pdf' | 'file';
  } | null>(null);

  // In-App File & Document Preview Modal
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const [googleToken, setGoogleToken] = useState<string | null>(getCachedGoogleAccessToken());
  const [isTokenExpired, setIsTokenExpired] = useState<boolean>(() => isGoogleDriveTokenExpired());
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    const handleTokenChanged = (e: any) => {
      const updatedToken = e.detail || getCachedGoogleAccessToken();
      setGoogleToken(updatedToken);
      setIsTokenExpired(isGoogleDriveTokenExpired());
    };
    const interval = setInterval(() => {
      setIsTokenExpired(isGoogleDriveTokenExpired());
      setGoogleToken(getCachedGoogleAccessToken());
    }, 15000);
    window.addEventListener('mockmc-drive-token-changed', handleTokenChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mockmc-drive-token-changed', handleTokenChanged);
    };
  }, []);

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const token = getCachedGoogleAccessToken();
        setGoogleToken(token);
        setIsTokenExpired(false);
        if (token) {
          loadAllNotesManifestsFromGoogleDrive(token)
            .then((remoteNotes) => {
              if (remoteNotes !== null && Array.isArray(remoteNotes)) {
                handleImportDriveNotes(remoteNotes);
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Google connection error:', err);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleSignOutDrive = () => {
    clearGoogleDriveAuth();
    setGoogleToken(null);
    setIsTokenExpired(false);
  };

  // Scroll lock & Back handler
  useScrollLock(isAddNoteModalOpen || !!previewFile);

  useBackHandler({
    isOpen: !!previewFile,
    onBack: () => setPreviewFile(null),
    priority: 50,
    id: 'repo_preview_modal_back',
  });

  useBackHandler({
    isOpen: isAddNoteModalOpen,
    onBack: () => setIsAddNoteModalOpen(false),
    priority: 40,
    id: 'repo_add_note_modal_back',
  });

  useBackHandler({
    isOpen: !previewFile && !isAddNoteModalOpen,
    onBack: onBack,
    priority: 20,
    id: 'repo_root_back',
  });

  // Handle Import Remote Drive Notes with complete multi-device bidirectional reconciliation
  const handleImportDriveNotes = useCallback(async (importedNotes: any[]) => {
    if (!importedNotes) return;
    const tombstones = getDeletedTombstones();
    const remoteIdSet = new Set(
      importedNotes
        .filter((n) => n && !tombstones.has(n.id) && (!n.driveFileId || !tombstones.has(n.driveFileId)))
        .map((n) => n.id)
    );
    const remoteDriveIdSet = new Set(
      importedNotes
        .filter((n) => n && n.driveFileId && !tombstones.has(n.driveFileId))
        .map((n) => n.driveFileId)
    );

    setUserNotes((prev) => {
      // 1. Keep purely local notes that have not yet been synced to Drive
      const localUnsynced = prev.filter(
        (n) =>
          !n.driveFileId &&
          !n.isDriveDirectFile &&
          !remoteIdSet.has(n.id) &&
          !tombstones.has(n.id)
      );

      // 2. Map remote authoritative notes
      const remoteMap = new Map<string, UserCustomNote>();
      importedNotes.forEach((rn) => {
        if (!rn || !rn.id) return;
        if (
          tombstones.has(rn.id) ||
          (rn.driveFileId &&
            (tombstones.has(rn.driveFileId) || tombstones.has(`drive_${rn.driveFileId}`)))
        ) {
          return;
        }
        const existing = prev.find((p) => p.id === rn.id || (rn.driveFileId && p.driveFileId === rn.driveFileId));
        remoteMap.set(rn.id, {
          ...existing,
          ...rn,
          driveFileId: rn.driveFileId || existing?.driveFileId,
          driveWebViewLink: rn.driveWebViewLink || rn.webViewLink || existing?.driveWebViewLink,
          content: rn.content || existing?.content || '',
          fileName: rn.fileName || existing?.fileName,
          fileType: rn.fileType || existing?.fileType,
          fileUrl: existing?.fileUrl || rn.fileUrl,
        });
      });

      const merged = [...Array.from(remoteMap.values()), ...localUnsynced];
      saveAllNotesToIDB(merged, true);
      return merged;
    });
  }, []);

  // Load all user notes strictly from IndexedDB and sync with Google Drive manifests
  const loadAllNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = await getAllNotesFromIDB();
      const tombstones = getDeletedTombstones();
      const userCreated = stored.filter(
        (n: any) =>
          !n.id?.startsWith('seed_') &&
          !n.id?.startsWith('seed') &&
          !n.id?.startsWith('auto_') &&
          !tombstones.has(n.id) &&
          (!n.driveFileId || (!tombstones.has(n.driveFileId) && !tombstones.has(`drive_${n.driveFileId}`)))
      );
      setUserNotes(userCreated);

      const token = getCachedGoogleAccessToken();
      if (token) {
        loadAllNotesManifestsFromGoogleDrive(token)
          .then((remoteNotes) => {
            if (remoteNotes !== null && Array.isArray(remoteNotes)) {
              handleImportDriveNotes(remoteNotes);
            }
          })
          .catch((e) => console.warn('Aggregated drive notes sync warning:', e));
      }
    } catch (err) {
      console.warn('Failed to load notes from IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  }, [handleImportDriveNotes]);

  useEffect(() => {
    loadAllNotes();
    const handleFocus = () => {
      const token = getCachedGoogleAccessToken();
      if (token) {
        loadAllNotesManifestsFromGoogleDrive(token)
          .then((remoteNotes) => {
            if (remoteNotes !== null && Array.isArray(remoteNotes)) {
              handleImportDriveNotes(remoteNotes);
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('notes-updated', loadAllNotes);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('notes-updated', loadAllNotes);
    };
  }, [loadAllNotes, handleImportDriveNotes]);

  const handleNoteDriveSynced = useCallback((noteId: string, driveFileId: string, webViewLink: string) => {
    setUserNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === noteId ? { ...n, driveFileId, driveWebViewLink: webViewLink } : n
      );
      saveAllNotesToIDB(updated);
      return updated;
    });
  }, []);

  const handleAddNewFileNote = useCallback(async (newNote: any) => {
    await saveSingleNoteToIDB(newNote);
    setUserNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== newNote.id);
      return [newNote, ...filtered];
    });
  }, []);

  const handleEditNote = useCallback(async (updatedNote: any) => {
    await saveSingleNoteToIDB(updatedNote);
    setUserNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== updatedNote.id);
      return [updatedNote, ...filtered];
    });
  }, []);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    let driveFileIdToDelete: string | undefined = undefined;
    const target = userNotes.find(
      (n) => n.id === noteId || n.driveFileId === noteId || (n.driveFileId && `drive_${n.driveFileId}` === noteId)
    );

    if (target?.driveFileId) {
      driveFileIdToDelete = target.driveFileId;
    } else if (noteId.startsWith('drive_')) {
      driveFileIdToDelete = noteId.replace('drive_', '');
    }

    addDeletedTombstone(noteId);
    if (driveFileIdToDelete) {
      addDeletedTombstone(driveFileIdToDelete);
      addDeletedTombstone(`drive_${driveFileIdToDelete}`);
    }
    if (target?.id) {
      addDeletedTombstone(target.id);
    }

    await deleteNoteFromIDB(noteId);
    if (target) {
      await deleteNoteFromIDB(target.id);
    }

    const remainingNotes = userNotes.filter(
      (n) =>
        n.id !== noteId &&
        n.id !== `drive_${driveFileIdToDelete}` &&
        (driveFileIdToDelete ? n.driveFileId !== driveFileIdToDelete : true) &&
        (target ? n.id !== target.id : true)
    );
    setUserNotes(remainingNotes);
    await saveAllNotesToIDB(remainingNotes, true);

    const token = getCachedGoogleAccessToken();
    if (token) {
      if (driveFileIdToDelete) {
        try {
          await deleteGoogleDriveFile(token, driveFileIdToDelete);
        } catch (err) {
          console.warn('Failed to delete from Google Drive:', err);
        }
      }
      syncNotesManifestToGoogleDrive(token, remainingNotes).catch(() => {});
    }
  }, [userNotes]);

  const handleRenameNote = useCallback((noteId: string, newName: string) => {
    setUserNotes((prev) => {
      const updated = prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            fileName: newName,
            content: n.fileUrl ? n.content : newName,
          };
        }
        return n;
      });
      saveAllNotesToIDB(updated);
      return updated;
    });
  }, []);

  const handleSaveNewNote = async () => {
    if (!newNoteContent.trim() && !attachedFile) return;

    let noteBody = newNoteContent.trim();
    if (attachedFile) {
      if (attachedFile.type === 'image') {
        const imgMd = `![${attachedFile.name}](${attachedFile.url})`;
        noteBody = noteBody ? `${noteBody}\n\n${imgMd}` : `# ${attachedFile.name}\n\n${imgMd}`;
      } else if (attachedFile.type === 'pdf') {
        const pdfMd = `📄 **PDF Attachment:** ${attachedFile.name}`;
        noteBody = noteBody ? `${noteBody}\n\n${pdfMd}` : `# ${attachedFile.name}\n\n${pdfMd}`;
      }
    }

    const newNote: UserCustomNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      testId: newNoteTestId === 'all' ? 'global_repo' : newNoteTestId,
      attemptId: 'repo_manual',
      questionNumber: 0,
      content: noteBody || attachedFile?.name || 'Untitled Note',
      tag: newNoteTag,
      createdAt: new Date().toISOString(),
      fileName: attachedFile?.name,
      fileType: attachedFile?.type || 'file',
      fileUrl: attachedFile?.url,
    };

    await saveSingleNoteToIDB(newNote);
    setUserNotes((prev) => [newNote, ...prev]);

    setNewNoteContent('');
    setAttachedFile(null);
    setNewNoteTag('general');
    setIsAddNoteModalOpen(false);
  };

  const handleModalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        url: reader.result as string,
        name: file.name,
        type: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePreviewFile = useCallback((file: PreviewableFile) => {
    setPreviewFile(file);
  }, []);

  return (
    <div
      className={`min-h-screen h-full w-full ${APP_STYLES.page} flex flex-col overflow-y-auto`}
    >
      {/* Minimal Top Header - Perfectly Centered & Aligned */}
      <header className={`sticky top-0 z-30 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3.5 flex items-center justify-between gap-3 ${APP_STYLES.surface.header} shrink-0 border-0 shadow-none`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-zinc-100 tracking-tight leading-none">
              Notes & Repository
            </h1>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="shrink-0 flex items-center gap-2">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('html-notes')}
              className="h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center gap-1.5 font-bold text-xs cursor-pointer active:scale-95 transition-all outline-none shrink-0"
              title="Open HTML Notes Studio Editor"
            >
              <FileCode className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span className="hidden sm:inline">HTML Editor</span>
            </button>
          )}

          {isConnectingDrive ? (
            <div className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] border-0 text-xs font-semibold text-slate-500 dark:text-zinc-400 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0b57d0]" />
              <span className="text-[11px] font-semibold">Connecting...</span>
            </div>
          ) : googleToken ? (
            <div className="flex items-center gap-2 h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] border-0 text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-200">Drive Connected</span>
              <button
                type="button"
                onClick={handleSignOutDrive}
                className="text-[10px] font-semibold text-slate-400 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 cursor-pointer border-0 ml-1.5 pl-2 opacity-80 hover:opacity-100 transition-colors"
                title="Sign out of Google Drive"
              >
                Sign Out
              </button>
            </div>
          ) : isTokenExpired ? (
            <button
              type="button"
              onClick={handleConnectDrive}
              className="h-9 px-4 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-[0_2px_6px_rgba(245,158,11,0.25)] border-0 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none shrink-0"
              title="Google Drive session expired. Click to reconnect."
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>Reconnect Drive</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectDrive}
              className="h-9 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-[0_2px_6px_rgba(11,87,208,0.25)] border-0 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none shrink-0"
              title="Connect to Google Drive"
            >
              <span>Connect Drive</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 w-full max-w-[1500px] mx-auto px-3 sm:px-6 py-4">
        <DriveFileManager
          notes={userNotes as any}
          testTitle="Global Repository"
          testId="global_repo"
          allTests={tests.map((t) => ({ id: t.id, title: t.title, topic: t.topic }))}
          isGlobalPage={true}
          currentUser={currentUser}
          onAddNote={() => setIsAddNoteModalOpen(true)}
          onDeleteNote={handleDeleteNote}
          onRenameNote={handleRenameNote}
          onEditNote={handleEditNote}
          onPreviewFile={handlePreviewFile}
          onNoteDriveSynced={handleNoteDriveSynced}
          onAddNewFileNote={handleAddNewFileNote}
          onImportDriveNotes={handleImportDriveNotes}
        />
      </main>

      {/* ADD / CREATE NOTE MODAL */}
      <AnimatePresence>
        {isAddNoteModalOpen && (
          <motion.div
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={APP_STYLES.modal.backdrop}
            onClick={() => setIsAddNoteModalOpen(false)}
          >
            <motion.div
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              onClick={(e) => e.stopPropagation()}
              className={`${APP_STYLES.modal.dialog} mx-4 sm:mx-auto`}
            >
              <div className={APP_STYLES.modal.header}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 border-0 shadow-sm">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Create Revision Note</h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Save formulas, tricks, solutions, and upload diagrams or study sheets
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className={APP_STYLES.button.iconSmall}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 px-4 sm:px-6 py-2">
                {/* Scope & Test Association */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Associate with Test / Category:
                  </label>
                  <select
                    value={newNoteTestId}
                    onChange={(e) => setNewNoteTestId(e.target.value)}
                    className={APP_STYLES.input.text}
                  >
                    <option value="all">General Repository (All Tests)</option>
                    {tests.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tag Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Classification Tag:</label>
                  <div className="flex flex-wrap gap-2">
                    {(['general', 'formula', 'trick', 'mistake'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNewNoteTag(tag)}
                        className={newNoteTag === tag ? APP_STYLES.button.chipActive : APP_STYLES.button.chip}
                      >
                        {tag.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note Content Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Note Content (Markdown & LaTeX Math Supported):
                  </label>
                  <textarea
                    rows={4}
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Enter study note, formula derivation, key shortcut, or concept summary..."
                    className={`${APP_STYLES.input.text} resize-none py-3`}
                  />
                </div>

                {/* File Attachment Box */}
                <div className="space-y-1.5">
                  <input
                    type="file"
                    ref={modalFileInputRef}
                    onChange={handleModalFileChange}
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    className="hidden"
                  />

                  {attachedFile ? (
                    <div className="p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border-0 shadow-sm flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        {attachedFile.type === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        ) : (
                          <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate">
                          {attachedFile.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      className="w-full py-3 px-4 rounded-2xl border-0 shadow-sm bg-slate-100/50 dark:bg-[#18181c] hover:bg-slate-200/60 dark:hover:bg-[#22222a] text-slate-600 dark:text-zinc-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Attach Diagram, Photo, or PDF Document</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className={APP_STYLES.modal.footer}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddNoteModalOpen(false)}
                    className={APP_STYLES.button.secondary}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewNote}
                    disabled={!newNoteContent.trim() && !attachedFile}
                    className={APP_STYLES.button.primary}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save to Repository</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL IN-APP DOCUMENT & FILE PREVIEW MODAL */}
      <UnifiedFileViewerModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};