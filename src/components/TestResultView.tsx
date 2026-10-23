import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RotateCcw, 
  ArrowLeft, 
  Sparkles, 
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BrainCircuit,
  Zap,
  Copy,
  Lightbulb,
  Check,
  X,
  LayoutGrid,
  CircleDot,
  AlertCircle,
  HelpCircle,
  Eye,
  Plus,
  BarChart2,
  TrendingUp,
  Target,
  LogOut,
  User as UserIcon,
  Sun,
  Moon,
  Trash2,
  Image as ImageIcon,
  FileUp,
  Paperclip,
  Maximize2,
  Download,
  Search,
  ExternalLink,
  Cloud,
  CloudOff,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Hand,
  Bookmark,
} from 'lucide-react';
import { loadScopedAttempts, saveScopedAttempts } from '../lib/storage';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { DriveFileManager } from './DriveFileManager';
import { UnifiedFileViewerModal, type PreviewableFile } from './UnifiedFileViewerModal';
import { saveAllNotesToIDB, getAllNotesFromIDB, deleteNoteFromIDB, saveSingleNoteToIDB, addDeletedTombstone } from '../lib/idbNotes';
import {
  getCachedGoogleAccessToken,
  setCachedGoogleAccessToken,
  isGoogleDriveTokenExpired,
  clearGoogleDriveAuth,
  signInWithGoogle,
} from '../lib/firebase';
import {
  saveNoteToGoogleDrive,
  syncNotesManifestToGoogleDrive,
  loadNotesManifestFromGoogleDrive,
  deleteGoogleDriveFile,
  getOrCreateNotesFolder,
  getOrCreateTestNotesFolder,
  fetchGoogleDrivePreviewBlob,
  uploadPendingNotesToGoogleDrive,
  getCleanFileName,
} from '../lib/googleWorkspace';
import { isMcqQuestion, checkIsOptionCorrect, checkIsOptionSelected, type MathTest, type TestAttempt, type MathQuestion, type UserCustomNote } from '../types';
export type { UserCustomNote };
import type { User } from 'firebase/auth';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { APP_STYLES } from './ui/AppStyles';
import { 
  androidDrawerRightVariants, 
  androidBackdropVariants, 
  androidFastTransition, 
  gpuAcceleratedStyle,
  gpuTransformStyle 
} from '../lib/animationConfig';

interface TestResultViewProps {
  test: MathTest;
  attempt: TestAttempt;
  currentUser?: User | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onRetakeTest: () => void;
  onBackToDashboard: () => void;
  onCreateNew?: () => void;
}

// Using UserCustomNote imported from ../types

type QuestionFilterTab = 'all' | 'attempted' | 'unattempted' | 'correct' | 'incorrect' | 'marked';

export const TestResultView: React.FC<TestResultViewProps> = ({
  test,
  attempt,
  currentUser,
  onSignIn,
  onSignOut,
  isDarkMode,
  onToggleTheme,
  onRetakeTest,
  onBackToDashboard,
  onCreateNew,
}) => {
  // Mode: 'notes' (short tricks & notes page), 'test-review' (interactive solution review mode)
  const [viewMode, setViewMode] = useState<'test-review' | 'notes'>('test-review');
  const [reviewIndex, setReviewIndex] = useState<number>(0);
  const [isQuestionPanelOpen, setIsQuestionPanelOpen] = useState<boolean>(false);
  const [panelFilter, setPanelFilter] = useState<QuestionFilterTab>('all');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);

  // User flag/review marks for questions during review
  const [flaggedMap, setFlaggedMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (attempt?.answers) {
      Object.entries(attempt.answers).forEach(([key, val]: [string, any]) => {
        if (val && typeof val === 'object' && val.flagged) {
          map[key] = true;
        }
      });
    }
    return map;
  });

  const handleToggleFlagReview = useCallback(() => {
    const curQ = test.questions[reviewIndex] || test.questions[0];
    if (!curQ) return;
    const targetId = curQ.id || `q-${reviewIndex}`;
    const willBeFlagged = !flaggedMap[targetId];
    setFlaggedMap((prev) => ({
      ...prev,
      [targetId]: willBeFlagged,
    }));
    if (attempt && attempt.answers) {
      const existing =
        attempt.answers[targetId] ||
        attempt.answers[`q-${reviewIndex}`] ||
        (curQ.id ? attempt.answers[curQ.id] : null);
      if (existing) {
        existing.flagged = willBeFlagged;
      } else {
        (attempt.answers as any)[targetId] = {
          questionId: targetId,
          selectedOption: '',
          isCorrect: false,
          timeSpentSeconds: 0,
          flagged: willBeFlagged,
        };
      }
      try {
        const allAttempts = loadScopedAttempts(currentUser?.uid);
        const matchIdx = allAttempts.findIndex((a) => a.id === attempt.id);
        if (matchIdx !== -1) {
          allAttempts[matchIdx] = { ...attempt };
          saveScopedAttempts(currentUser?.uid, allAttempts);
        }
      } catch {}
    }
  }, [test.questions, reviewIndex, flaggedMap, attempt, currentUser]);

  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);

  // Custom Personal Notes State
  const [userNotes, setUserNotes] = useState<UserCustomNote[]>([]);
  const [driveToken, setDriveToken] = useState<string | null>(getCachedGoogleAccessToken());
  const [driveSyncState, setDriveSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState<boolean>(false);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [newNoteTag, setNewNoteTag] = useState<'trick' | 'formula' | 'mistake' | 'general'>('general');
  const [newNoteQNum, setNewNoteQNum] = useState<number>(0);
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; type: 'image' | 'pdf' | 'file' } | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);

  const [isTokenExpired, setIsTokenExpired] = useState<boolean>(() => isGoogleDriveTokenExpired());

  // Guarantee clean scroll reset on mount and mode switch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [viewMode]);

  // Listen for Google Drive token changes across applet
  useEffect(() => {
    const onTokenChange = (e: any) => {
      const updated = e.detail || getCachedGoogleAccessToken();
      setDriveToken(updated);
      setIsTokenExpired(isGoogleDriveTokenExpired());
    };
    const interval = setInterval(() => {
      setIsTokenExpired(isGoogleDriveTokenExpired());
      setDriveToken(getCachedGoogleAccessToken());
    }, 15000);
    window.addEventListener('mockmc-drive-token-changed', onTokenChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mockmc-drive-token-changed', onTokenChange);
    };
  }, []);

  // Connect or Reconnect Google Drive
  const handleReconnectDrive = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        const token = getCachedGoogleAccessToken();
        setDriveToken(token);
        setIsTokenExpired(false);
        if (token) {
          setDriveSyncState('syncing');
          const { updatedNotes } = await uploadPendingNotesToGoogleDrive(token, userNotes, test.title);
          setUserNotes(updatedNotes);
          saveAllNotesToIDB(updatedNotes);
          setDriveSyncState('synced');
        }
      }
    } catch (err) {
      console.warn('Google Drive reconnect error:', err);
    }
  };

  const handleSignOutDrive = () => {
    clearGoogleDriveAuth();
    setDriveToken(null);
    setIsTokenExpired(false);
  };

  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState<string>('');
  const [noteTypeFilter, setNoteTypeFilter] = useState<'all' | 'images' | 'pdfs'>('all');

  // Lock body scroll when question panel drawer, popups, or modals are open
  useScrollLock(isQuestionPanelOpen || isAddNoteModalOpen || !!previewFile);

  // Status bar theme color synchronization for Solution / Test Review screen (#e5e9f0 light / #0b0c10 dark)
  useEffect(() => {
    const solutionHeaderStatusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
    const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
    if (metaThemeColors.length > 0) {
      metaThemeColors.forEach((el) => {
        el.removeAttribute('media');
        el.setAttribute('content', solutionHeaderStatusBarColor);
      });
    } else {
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = solutionHeaderStatusBarColor;
      document.head.appendChild(newMeta);
    }

    const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatusBar) {
      appleStatusBar.setAttribute('content', isDarkMode ? 'black-translucent' : 'default');
    }

    return () => {
      // Revert back to default app status bar color on exit
      const defaultStatusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
      const currentMetas = document.querySelectorAll('meta[name="theme-color"]');
      currentMetas.forEach((el) => {
        el.removeAttribute('media');
        el.setAttribute('content', defaultStatusBarColor);
      });
    };
  }, [isDarkMode, viewMode]);

  // System navigation back gesture & button handling
  useBackHandler({
    isOpen: !!previewFile,
    onBack: () => setPreviewFile(null),
    priority: 45,
    id: 'results_preview_file',
  });

  useBackHandler({
    isOpen: isAddNoteModalOpen,
    onBack: () => setIsAddNoteModalOpen(false),
    priority: 40,
    id: 'results_add_note_modal',
  });

  useBackHandler({
    isOpen: isQuestionPanelOpen,
    onBack: () => setIsQuestionPanelOpen(false),
    priority: 35,
    id: 'results_question_panel',
  });

  useBackHandler({
    isOpen: isProfileMenuOpen,
    onBack: () => setIsProfileMenuOpen(false),
    priority: 30,
    id: 'results_profile_menu',
  });

  useBackHandler({
    isOpen: isFilterOpen,
    onBack: () => setIsFilterOpen(false),
    priority: 25,
    id: 'results_filter_dropdown',
  });

  const isAnyResultOverlayOpen = isQuestionPanelOpen || isProfileMenuOpen || isFilterOpen || isAddNoteModalOpen || !!previewFile;

  const handleSafeBackToDashboard = useCallback(() => {
    setIsQuestionPanelOpen(false);
    setPreviewFile(null);
    setIsProfileMenuOpen(false);
    setIsAddNoteModalOpen(false);
    onBackToDashboard();
  }, [onBackToDashboard]);

  const handleSyncWithDrive = useCallback(async () => {
    const gToken = getCachedGoogleAccessToken();
    if (!gToken) {
      handleReconnectDrive();
      return;
    }
    setDriveSyncState('syncing');
    try {
      const remoteNotes = await loadNotesManifestFromGoogleDrive(gToken, test.title);
      let currentWorkingNotes: UserCustomNote[] = [...userNotes];
      if (remoteNotes && remoteNotes.length > 0) {
        const matchingRemote = remoteNotes.filter(
          (n: any) =>
            !n.id?.startsWith('seed') &&
            !n.id?.startsWith('auto') &&
            (!n.testId || n.testId === test.id || !n.attemptId || n.attemptId === attempt.id || n.testId === 'notes_repository')
        );
        if (matchingRemote.length > 0) {
          const map = new Map<string, UserCustomNote>(currentWorkingNotes.map((n) => [n.id, n]));
          matchingRemote.forEach((rn: any) => {
            if (!map.has(rn.id)) {
              map.set(rn.id, rn as UserCustomNote);
            } else {
              const existing = map.get(rn.id);
              if (existing) {
                map.set(rn.id, {
                  ...existing,
                  driveFileId: rn.driveFileId || existing.driveFileId,
                  driveWebViewLink: rn.driveWebViewLink || rn.webViewLink || existing.driveWebViewLink,
                });
              }
            }
          });
          currentWorkingNotes = Array.from(map.values());
          saveAllNotesToIDB(currentWorkingNotes);
          setUserNotes(currentWorkingNotes);
        }
      }

      const unuploaded = currentWorkingNotes.filter(
        (n) => !n.driveFileId && (n.content?.trim() || n.fileUrl) && !n.id?.startsWith('seed') && !n.id?.startsWith('auto')
      );
      if (unuploaded.length > 0) {
        const { updatedNotes } = await uploadPendingNotesToGoogleDrive(gToken, currentWorkingNotes, test.title);
        setUserNotes(updatedNotes);
        saveAllNotesToIDB(updatedNotes);
      }
      setDriveSyncState('synced');
    } catch (err) {
      console.warn('Drive sync failed:', err);
      setDriveSyncState('idle');
    }
  }, [test.title, test.id, attempt.id, userNotes, handleReconnectDrive]);

  // Clean up all overlay states when component unmounts
  useEffect(() => {
    return () => {
      setIsQuestionPanelOpen(false);
      setPreviewFile(null);
      setIsProfileMenuOpen(false);
      setIsAddNoteModalOpen(false);
    };
  }, []);

  useBackHandler({
    isOpen: viewMode === 'notes' && !isAnyResultOverlayOpen,
    onBack: () => setViewMode('test-review'),
    priority: 20,
    id: 'results_notes_back_to_review',
  });

  useBackHandler({
    isOpen: viewMode === 'test-review' && !isAnyResultOverlayOpen,
    onBack: handleSafeBackToDashboard,
    priority: 15,
    id: 'results_base_back',
  });

  // Load & sync user personal notes (IndexedDB + Google Drive "Mock MC App/Notes")
  useEffect(() => {
    let isMounted = true;

    async function loadInitialNotes() {
      // Helper to identify and purge mock/preloaded/seed review notes
      const isPreloadedOrSeedNote = (n: any) =>
        !n ||
        n.id?.startsWith('seed_') ||
        n.id?.startsWith('seed') ||
        n.id?.startsWith('auto_') ||
        (typeof n.content === 'string' &&
          (n.content.includes('Review Note:') ||
            n.content.toLowerCase().includes('portion to review note') ||
            n.content.toLowerCase().includes('review question')) &&
          (!n.testId || n.id?.startsWith('seed') || n.id?.startsWith('auto')));

      // 1. Check IndexedDB
      const idbNotes = await getAllNotesFromIDB();
      const sanitizedIdbNotes = (idbNotes || []).filter((n: any) => !isPreloadedOrSeedNote(n));

      // If preloaded notes were found in IDB, overwrite IDB with the cleaned list
      if (idbNotes && idbNotes.length !== sanitizedIdbNotes.length) {
        saveAllNotesToIDB(sanitizedIdbNotes);
      }

      const attemptNotes = sanitizedIdbNotes.filter(
        (n: any) =>
          !n.testId ||
          n.testId === test.id ||
          !n.attemptId ||
          n.attemptId === attempt.id ||
          n.testId === 'notes_repository'
      );

      if (attemptNotes && attemptNotes.length > 0) {
        if (isMounted) setUserNotes(attemptNotes);
      } else {
        // 2. Check localStorage (attempt-specific and permanent store)
        const saved =
          localStorage.getItem(`mockmc_user_notes_${attempt.id}`) ||
          localStorage.getItem('mockmc_saved_notes_permanent') ||
          localStorage.getItem(`mockmc_user_notes_global`);

        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const sanitizedParsed = parsed.filter((n: any) => !isPreloadedOrSeedNote(n));
              const matching = sanitizedParsed.filter(
                (n: any) =>
                  !n.testId ||
                  n.testId === test.id ||
                  !n.attemptId ||
                  n.attemptId === attempt.id ||
                  n.testId === 'notes_repository'
              );
              if (matching.length > 0) {
                if (isMounted) setUserNotes(matching);
                saveAllNotesToIDB(sanitizedParsed);
              }
            }
          } catch (e) {
            console.error('Failed to parse user notes:', e);
          }
        }
      }

      // 4. Sync from Google Drive test folder if authenticated (zero Firestore reads!)
      const gToken = getCachedGoogleAccessToken();
      if (gToken) {
        setDriveSyncState('syncing');
        loadNotesManifestFromGoogleDrive(gToken, test.title)
          .then(async (remoteNotes) => {
            if (!isMounted) return;
            let currentWorkingNotes: UserCustomNote[] = [];
            setUserNotes((curr) => {
              currentWorkingNotes = [...curr];
              return curr;
            });

            if (remoteNotes && remoteNotes.length > 0) {
              const matchingRemote = remoteNotes.filter(
                (n: any) =>
                  !isPreloadedOrSeedNote(n) &&
                  (!n.testId ||
                    n.testId === test.id ||
                    !n.attemptId ||
                    n.attemptId === attempt.id ||
                    n.testId === 'notes_repository')
              );
              if (matchingRemote.length > 0) {
                const map = new Map<string, UserCustomNote>(currentWorkingNotes.map((n) => [n.id, n]));
                matchingRemote.forEach((rn: any) => {
                  if (!map.has(rn.id)) {
                    map.set(rn.id, rn as UserCustomNote);
                  } else {
                    const existing = map.get(rn.id);
                    if (existing) {
                      map.set(rn.id, {
                        ...existing,
                        driveFileId: rn.driveFileId || existing.driveFileId,
                        driveWebViewLink: rn.driveWebViewLink || rn.webViewLink || existing.driveWebViewLink,
                      });
                    }
                  }
                });
                currentWorkingNotes = Array.from(map.values()).filter((n) => !isPreloadedOrSeedNote(n));
                saveAllNotesToIDB(currentWorkingNotes);
                if (isMounted) setUserNotes(currentWorkingNotes);
              }
            }

            // Automatically upload any notes/files that haven't been uploaded to Drive yet
            const unuploaded = currentWorkingNotes.filter(
              (n) => !n.driveFileId && (n.content?.trim() || n.fileUrl) && !isPreloadedOrSeedNote(n)
            );
            if (unuploaded.length > 0) {
              try {
                const { updatedNotes } = await uploadPendingNotesToGoogleDrive(gToken, currentWorkingNotes, test.title);
                if (isMounted) {
                  const sanitizedUploaded = updatedNotes.filter((n) => !isPreloadedOrSeedNote(n));
                  setUserNotes(sanitizedUploaded);
                  saveAllNotesToIDB(sanitizedUploaded);
                }
              } catch (uploadErr) {
                console.warn('Pending notes auto-upload failed:', uploadErr);
              }
            }

            if (isMounted) setDriveSyncState('synced');
          })
          .catch((err) => {
            console.warn('Google Drive notes manifest check failed:', err);
            if (isMounted) setDriveSyncState('idle');
          });
      }
    }

    loadInitialNotes();

    return () => {
      isMounted = false;
    };
  }, [attempt.id, test?.id]);

  const handleSaveNewNote = async () => {
    if (!newNoteContent.trim() && !attachedFile) return;

    const isImg =
      attachedFile?.type === 'image' ||
      (attachedFile?.name && /\.(jpg|jpeg|png)$/i.test(attachedFile.name));
    const isPdf =
      attachedFile?.type === 'pdf' ||
      (attachedFile?.name && /\.pdf$/i.test(attachedFile.name)) ||
      attachedFile?.url.startsWith('data:application/pdf');

    const calculatedFileType: 'image' | 'pdf' | 'file' | undefined = attachedFile
      ? isImg
        ? 'image'
        : isPdf
        ? 'pdf'
        : 'file'
      : undefined;

    const noteItem: UserCustomNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      testId: test.id,
      attemptId: attempt.id,
      questionNumber: newNoteQNum,
      content: newNoteContent.trim() || (attachedFile ? `Attachment: ${attachedFile.name}` : 'Personal Note'),
      tag: newNoteTag || 'general',
      fileUrl: attachedFile?.url,
      fileName: attachedFile?.name,
      fileType: calculatedFileType,
      createdAt: new Date().toISOString(),
    };

    const updated = [noteItem, ...userNotes];
    setUserNotes(updated);

    // 1. Immediately save to IndexedDB (local durable cache)
    saveAllNotesToIDB(updated);

    // 2. Backup to LocalStorage (sanitizing large data urls to avoid quota issues)
    try {
      const sanitizedForLocalStorage = updated.map((n) => {
        if (n.fileUrl && n.fileUrl.length > 2000) {
          const copy = { ...n };
          copy.isLocalAttachmentOnly = true;
          delete copy.fileUrl;
          return copy;
        }
        return n;
      });
      localStorage.setItem(`mockmc_user_notes_${attempt.id}`, JSON.stringify(sanitizedForLocalStorage));
    } catch (e) {
      // IndexedDB handles full attachments
    }

    // 3. Save to Google Drive in folder: Mock MC App > Notes > [Test Name]
    const gToken = getCachedGoogleAccessToken();
    if (gToken) {
      setDriveSyncState('syncing');
      saveNoteToGoogleDrive(gToken, noteItem, test.title)
        .then(({ driveFileId, webViewLink }) => {
          const syncedNote = { ...noteItem, driveFileId, driveWebViewLink: webViewLink };
          saveSingleNoteToIDB(syncedNote);
          setUserNotes((current) =>
            current.map((n) => (n.id === noteItem.id ? syncedNote : n))
          );
          syncNotesManifestToGoogleDrive(gToken, [syncedNote, ...userNotes.filter(n => n.id !== noteItem.id)], test.title);
          setDriveSyncState('synced');
        })
        .catch((err) => {
          console.warn('Google Drive note save error:', err);
          setDriveSyncState('error');
        });
    }

    setNewNoteContent('');
    setAttachedFile(null);
    setNewNoteQNum(0);
    setNoteSearchQuery('');
    setNoteTypeFilter('all');
    setIsAddNoteModalOpen(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    let driveFileIdToDelete: string | undefined = undefined;
    const targetNote = userNotes.find(
      (n) => n.id === noteId || n.driveFileId === noteId || (n.driveFileId && `drive_${n.driveFileId}` === noteId)
    );

    if (targetNote?.driveFileId) {
      driveFileIdToDelete = targetNote.driveFileId;
    } else if (noteId.startsWith('drive_')) {
      driveFileIdToDelete = noteId.replace('drive_', '');
    }

    addDeletedTombstone(noteId);
    if (driveFileIdToDelete) {
      addDeletedTombstone(driveFileIdToDelete);
      addDeletedTombstone(`drive_${driveFileIdToDelete}`);
    }
    if (targetNote?.id) {
      addDeletedTombstone(targetNote.id);
    }

    const updated = userNotes.filter(
      (n) =>
        n.id !== noteId &&
        n.id !== `drive_${driveFileIdToDelete}` &&
        (driveFileIdToDelete ? n.driveFileId !== driveFileIdToDelete : true) &&
        (targetNote ? n.id !== targetNote.id : true)
    );
    setUserNotes(updated);
    await deleteNoteFromIDB(noteId);
    if (targetNote) {
      await deleteNoteFromIDB(targetNote.id);
    }

    try {
      const sanitized = updated.map((n) => {
        if (n.fileUrl && n.fileUrl.length > 2000) {
          const copy = { ...n };
          copy.isLocalAttachmentOnly = true;
          delete copy.fileUrl;
          return copy;
        }
        return n;
      });
      localStorage.setItem(`mockmc_user_notes_${attempt.id}`, JSON.stringify(sanitized));
    } catch (e) {}

    // Delete from Google Drive if synced
    const gToken = getCachedGoogleAccessToken();
    if (gToken) {
      if (driveFileIdToDelete) {
        deleteGoogleDriveFile(gToken, driveFileIdToDelete).catch((err) => {
          console.warn('Failed to delete note file from Google Drive:', err);
        });
      }
      syncNotesManifestToGoogleDrive(gToken, updated, test.title);
    }
  };

  const handleRenameNote = (noteId: string, newName: string) => {
    const updated = userNotes.map((n) => {
      if (n.id === noteId) {
        return {
          ...n,
          fileName: n.fileUrl ? newName : (n.fileName || newName),
          content: !n.fileUrl || !n.content ? newName : n.content,
        };
      }
      return n;
    });
    setUserNotes(updated);
    saveAllNotesToIDB(updated);

    try {
      const sanitized = updated.map((n) => {
        if (n.fileUrl && n.fileUrl.length > 2000) {
          const copy = { ...n };
          copy.isLocalAttachmentOnly = true;
          delete copy.fileUrl;
          return copy;
        }
        return n;
      });
      localStorage.setItem(`mockmc_user_notes_${attempt.id}`, JSON.stringify(sanitized));
    } catch (e) {}

    const gToken = getCachedGoogleAccessToken();
    if (gToken) {
      syncNotesManifestToGoogleDrive(gToken, updated, test.title);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileNameLower = file.name.toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
    const isAllowed =
      allowedExtensions.some((ext) => fileNameLower.endsWith(ext)) ||
      ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(file.type);

    if (!isAllowed) {
      alert('Invalid file type. Supported formats are JPG, PNG, and PDF only.');
      return;
    }

    // Check maximum local storage size limit (25MB)
    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds the 25 MB limit. Please select a smaller file.');
      return;
    }

    const isImg =
      file.type.startsWith('image/') ||
      fileNameLower.endsWith('.jpg') ||
      fileNameLower.endsWith('.jpeg') ||
      fileNameLower.endsWith('.png');

    const isPdf =
      file.type === 'application/pdf' ||
      fileNameLower.endsWith('.pdf');

    // Read full uncompressed file data URL to preserve 100% original quality
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAttachedFile({
        url: result,
        name: file.name,
        type: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      });
    };
    reader.readAsDataURL(file);
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    if (attempt.passed) {
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
      });
    }
  }, [attempt.passed, test]);

  // Keyboard navigation for review mode
  useEffect(() => {
    if (viewMode !== 'test-review') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      const code = e.code;

      if (key === 'p' || code === 'KeyP') {
        e.preventDefault();
        setIsQuestionPanelOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (isQuestionPanelOpen) {
          e.preventDefault();
          setIsQuestionPanelOpen(false);
        }
        return;
      }

      if (isQuestionPanelOpen) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setReviewIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setReviewIndex((prev) => Math.min(test.questions.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isQuestionPanelOpen, test.questions.length]);

  const handleAskAiTutor = async (questionId: string) => {
    const q = test.questions.find((x) => x.id === questionId);
    if (!q) return;

    setLoadingAi((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await fetch('/api/explain-math-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: q.text,
          options: q.options,
          userAnswer: attempt.answers[q.id]?.selectedOption || 'Unattempted',
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        }),
      });
      const data = await res.json();
      if (data.explanation) {
        setAiExplanations((prev) => ({ ...prev, [questionId]: data.explanation }));
      } else {
        setAiExplanations((prev) => ({ ...prev, [questionId]: "⚠️ **AI explanation is temporarily unavailable.** Daily Gemini API free-tier quota limits have been reached. Please try again after a brief moment (usually resets in a minute)." }));
      }
    } catch (err: any) {
      console.warn('Failed to get AI explanation gracefully:', err.message || err);
      setAiExplanations((prev) => ({ ...prev, [questionId]: "⚠️ **AI explanation is temporarily unavailable.** Daily Gemini API free-tier quota limits have been reached. Please try again after a brief moment (usually resets in a minute)." }));
    } finally {
      setLoadingAi((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s}s`;
  };

  const answersList = Object.values(attempt.answers) as { selectedOption: string; isCorrect: boolean; flagged?: boolean }[];
  const correctCount = answersList.filter((a) => a.isCorrect).length;
  const incorrectCount = answersList.filter((a) => a.selectedOption && !a.isCorrect).length;
  const unattemptedCount = test.questions.length - (correctCount + incorrectCount);
  const markedCount = test.questions.filter((q, idx) => {
    const key = q.id || `q-${idx}`;
    const ans = attempt.answers[key] || (q.id ? attempt.answers[q.id] : null) || attempt.answers[`q-${idx}`] || Object.values(attempt.answers)[idx];
    return !!(flaggedMap[key] ?? ans?.flagged);
  }).length;
  const attemptedCount = correctCount + incorrectCount;

  const currentQ = test.questions[reviewIndex] || test.questions[0];
  const qId = currentQ?.id || `q-${reviewIndex}`;
  const currentUserAns = currentQ 
    ? (attempt.answers[qId] || (currentQ.id ? attempt.answers[currentQ.id] : null) || attempt.answers[`q-${reviewIndex}`] || Object.values(attempt.answers)[reviewIndex]) 
    : null;
  const isCurrentCorrect = currentUserAns ? (
    currentUserAns.isCorrect || 
    (isMcqQuestion(currentQ) && currentQ.options 
      ? currentQ.options.some((opt, idx) => checkIsOptionSelected(opt, idx, currentUserAns.selectedOption) && checkIsOptionCorrect(opt, idx, currentQ))
      : checkIsOptionCorrect(currentUserAns.selectedOption, -1, currentQ))
  ) : false;
  const isCurrentAttempted = !!currentUserAns?.selectedOption;
  const isCurrentMarked = !!(flaggedMap[qId] ?? currentUserAns?.flagged);

  // Next incorrect question shortcut
  const handleJumpNextIncorrect = () => {
    const nextIncorrectIdx = test.questions.findIndex((q, i) => {
      if (i <= reviewIndex) return false;
      const key = q.id || `q-${i}`;
      const ans = attempt.answers[key] || (q.id ? attempt.answers[q.id] : null) || attempt.answers[`q-${i}`] || Object.values(attempt.answers)[i];
      if (!ans) return true;
      return !ans.isCorrect;
    });

    if (nextIncorrectIdx !== -1) {
      setReviewIndex(nextIncorrectIdx);
    } else {
      const firstIncorrect = test.questions.findIndex((q, i) => {
        const key = q.id || `q-${i}`;
        const ans = attempt.answers[key] || (q.id ? attempt.answers[q.id] : null) || attempt.answers[`q-${i}`] || Object.values(attempt.answers)[i];
        if (!ans) return true;
        return !ans.isCorrect;
      });
      if (firstIncorrect !== -1) setReviewIndex(firstIncorrect);
    }
  };

  // Filter questions for the drawer panel
  const filteredDrawerQuestions = test.questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q, idx }) => {
      const key = q.id || `q-${idx}`;
      const ans = attempt.answers[key] || (q.id ? attempt.answers[q.id] : null) || attempt.answers[`q-${idx}`] || Object.values(attempt.answers)[idx];
      const isAttempted = !!ans?.selectedOption;
      const isCorrect = !!ans?.isCorrect;
      const isIncorrect = ans && ans.selectedOption && !ans.isCorrect;
      const isMarked = !!(flaggedMap[key] ?? ans?.flagged);

      if (panelFilter === 'attempted') return isAttempted;
      if (panelFilter === 'unattempted') return !isAttempted;
      if (panelFilter === 'correct') return isCorrect;
      if (panelFilter === 'incorrect') return isIncorrect;
      if (panelFilter === 'marked') return isMarked;
      return true; // 'all'
    });

  // Drawer Question Panel Component with Filter Dropdown
  const renderQuestionPanel = () => {
    const progressPercentage = test.questions.length > 0 
      ? Math.round((attemptedCount / test.questions.length) * 100) 
      : 0;

    return typeof document !== 'undefined' ? createPortal(
      <AnimatePresence>
        {isQuestionPanelOpen && (
          <motion.div 
            variants={androidBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={androidFastTransition}
            style={gpuAcceleratedStyle}
            className="fixed inset-0 bg-black/40 flex justify-end z-50 cursor-pointer"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsQuestionPanelOpen(false);
                setIsFilterOpen(false);
              }
            }}
          >
            <motion.div 
              variants={androidDrawerRightVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={androidFastTransition}
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] w-[88vw] max-w-[340px] sm:max-w-sm h-full flex flex-col justify-between shadow-2xl border-0 ring-0 rounded-l-[24px] overflow-hidden touch-pan-y cursor-default drawer-panel"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Section */}
              <div className="p-4 sm:p-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] shrink-0 space-y-3.5 border-b border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                      Solution Palette
                    </h3>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] border-0 ring-0 shadow-xs">
                      {progressPercentage}%
                    </span>
                  </div>
                  <button
                    id="drawer-close-review-btn"
                    onClick={() => {
                      setIsQuestionPanelOpen(false);
                      setIsFilterOpen(false);
                    }}
                    title="Close Palette"
                    className="w-8 h-8 rounded-full bg-[#f0f4f9] hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#343740] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-colors shadow-xs border-0 ring-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">
                  <span>Attempt Progress</span>
                  <span className="font-mono text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{attemptedCount}/{test.questions.length} Answered</span>
                </div>

                {/* COLLAPSIBLE FILTER DROPDOWN */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="w-full py-2 px-3.5 rounded-full bg-[#f0f4f9] hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#343740] border-0 ring-0 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between shadow-xs cursor-pointer transition-colors"
                  >
                    <span>Filter: <strong className="capitalize text-[#0b57d0] dark:text-[#a8c7fa] font-extrabold">{panelFilter}</strong></span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                  </button>

                  {isFilterOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#21222e] rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-700/60 ring-0 p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      {(['all', 'attempted', 'unattempted', 'correct', 'incorrect', 'marked'] as QuestionFilterTab[]).map((tab) => {
                        const countMap = {
                          all: test.questions.length,
                          attempted: attemptedCount,
                          unattempted: unattemptedCount,
                          correct: correctCount,
                          incorrect: incorrectCount,
                          marked: markedCount,
                        };
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => {
                              setPanelFilter(tab);
                              setIsFilterOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-xs text-left rounded-xl flex items-center justify-between font-medium capitalize transition-colors cursor-pointer border-0 ring-0 outline-none ${
                              panelFilter === tab 
                                ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-extrabold shadow-xs' 
                                : 'text-slate-700 dark:text-zinc-300 hover:bg-[#e2e5ec] dark:hover:bg-[#282a39]'
                            }`}
                          >
                            <span>{tab}</span>
                            <span className="font-mono text-[10px] opacity-70">({countMap[tab]})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Status Legend */}
                <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-zinc-400 px-1 pt-1">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] inline-block" /> Correct</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f05252] inline-block" /> Incorrect</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500 inline-block" /> Skipped</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Marked</span>
                </div>
              </div>

              {/* Middle Section: Questions Grid directly in white card paper */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 bg-white dark:bg-[#1e2024]">
                {filteredDrawerQuestions.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      No questions in the "{panelFilter}" filter.
                    </p>
                    <button
                      onClick={() => setPanelFilter('all')}
                      className="px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:text-[#062e6f] text-xs font-bold rounded-full shadow-xs border-0 ring-0 outline-none cursor-pointer"
                    >
                      Show All Questions
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2.5 sm:gap-3 justify-items-center py-1">
                    {filteredDrawerQuestions.map(({ q, idx }) => {
                      const ans = attempt.answers[q.id || `q-${idx}`] || (q.id ? attempt.answers[q.id] : null) || attempt.answers[`q-${idx}`] || Object.values(attempt.answers)[idx];
                      const isCorrect = !!ans?.isCorrect;
                      const isAttempted = !!ans?.selectedOption;
                      const isMarked = !!ans?.flagged;
                      const isCurrent = idx === reviewIndex;

                      let circleColor = 'bg-slate-400 dark:bg-zinc-600 text-white';
                      if (isCorrect) {
                        circleColor = 'bg-[#0b57d0] text-white';
                      } else if (isAttempted && !isCorrect) {
                        circleColor = 'bg-[#f05252] text-white';
                      } else if (isMarked) {
                        circleColor = 'bg-amber-500 text-white';
                      }

                      return (
                        <button
                          key={`drawer-bubble-${q.id || 'idx'}-${idx}`}
                          id={`drawer-bubble-${idx + 1}`}
                          onClick={() => {
                            setReviewIndex(idx);
                            setIsQuestionPanelOpen(false);
                            setIsFilterOpen(false);
                          }}
                          title={`Question ${idx + 1}`}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center transition-all cursor-pointer border-0 ring-0 outline-none ${circleColor} ${
                            isCurrent 
                              ? 'shadow-md font-extrabold scale-110 ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] ring-offset-2 ring-offset-white dark:ring-offset-[#1e2024]' 
                              : 'hover:scale-105 shadow-xs'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Resume Action */}
              <div className="p-4 sm:p-5 pt-3 pb-[calc(max(1rem,env(safe-area-inset-bottom,0px))+0.5rem)] shrink-0 border-t border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-[#1e2024]">
                <button
                  onClick={() => {
                    setIsQuestionPanelOpen(false);
                    setIsFilterOpen(false);
                  }}
                  className="w-full py-3.5 bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#041e49] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#062e6f] font-bold text-sm rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.12)] border-0 ring-0 outline-none transition-all active:scale-98 text-center cursor-pointer"
                >
                  Resume Review
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    ) : null;
  };

  // 1. INTERACTIVE TEST-ATTEMPT STYLE REVIEW
  if (viewMode === 'test-review') {
    const aiExp = currentQ ? aiExplanations[currentQ.id] : null;
    const isAiLoading = currentQ ? loadingAi[currentQ.id] : false;

    return (
      <div className="fixed inset-0 z-30 bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col h-[100dvh] max-h-screen overflow-hidden transition-colors duration-200">
        <header className="shrink-0 z-30 bg-[#e5e9f0] dark:bg-[#0b0c10] px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-2 transition-colors border-0">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                id="review-back-btn"
                onClick={handleSafeBackToDashboard}
                title="Back to Previous Screen"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold transition-colors cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="hidden md:flex items-center gap-1.5 pl-1 border-l border-[#e1e3e1]/60 dark:border-[#44474f]/40">
                <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate max-w-[180px]">
                  {test.title}
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-[28px] bg-transparent text-[#0b57d0] dark:text-[#a8c7fa] font-bold border-0">
                  {test.topic}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-[28px] text-xs font-bold font-mono border-0 bg-transparent ${
                attempt.passed 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                Score: {attempt.percentage}%
              </span>
              <span className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-medium hidden sm:inline">
                ({correctCount}/{test.questions.length} Correct)
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                id="review-split-toggle-btn"
                onClick={() => setIsSplitView(!isSplitView)}
                title={isSplitView ? "Switch to Single Column View" : "Switch to Split Page Review Mode"}
                className={`hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-[28px] text-xs font-semibold transition-all border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ${
                  isSplitView 
                    ? 'bg-[#0b57d0] text-white' 
                    : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{isSplitView ? 'Split View' : 'Single View'}</span>
              </button>

              <button
                id="switch-to-notes-btn"
                onClick={() => setViewMode('notes')}
                title="View Short Tricks & Notes"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold transition-colors cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
              >
                <FileText className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span className="hidden sm:inline">Notes</span>
              </button>

              <button
                id="review-palette-btn"
                onClick={() => setIsQuestionPanelOpen(true)}
                title="Open Question Drawer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold transition-colors cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span className="font-mono">{reviewIndex + 1}/{test.questions.length}</span>
              </button>

              {currentUser ? (
                <div className="relative">
                  <button
                    id="review-profile-menu-trigger"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="flex items-center gap-1.5 p-0.5 sm:pr-2 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] transition-all shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] border-0"
                  >
                    {currentUser.photoURL && currentUser.photoURL.trim() ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.displayName || 'Google User'}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full border-0 object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[#0084ff] text-white font-bold text-xs flex items-center justify-center">
                        {currentUser.displayName?.[0]?.toUpperCase() || currentUser.email?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 hidden lg:inline max-w-[80px] truncate">
                      {currentUser.displayName?.split(' ')[0] || currentUser.email?.split('@')[0]}
                    </span>
                  </button>

                  {isProfileMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsProfileMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#1e2024] rounded-2xl shadow-xl border-0 ring-0 overflow-hidden pt-0 pb-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-3.5 py-3 bg-slate-100/90 dark:bg-[#16181d] border-b border-slate-200/80 dark:border-zinc-800">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 truncate">
                            {currentUser.displayName || 'Google User'}
                          </div>
                          <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 truncate">
                            {currentUser.email}
                          </div>
                        </div>
                        {onSignOut && (
                          <button
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              onSignOut();
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors font-semibold"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign Out</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : onSignIn ? (
                <button
                  id="review-google-login-btn"
                  onClick={onSignIn}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#21222e] hover:bg-slate-100 dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 rounded-full text-xs font-semibold transition-all shadow-xs border-0 ring-0"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Main Question Display Area */}
        <main className={`${isSplitView ? 'max-w-7xl' : 'max-w-3xl'} w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-6 flex-1 overflow-y-auto min-h-0 flex flex-col justify-start`}>
          {currentQ && (
            isSplitView ? (
              /* SPLIT SCREEN VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                {/* LEFT COLUMN: Question & Options */}
                <div className="bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] p-3.5 sm:p-5 space-y-3">
                  <div className="flex flex-col gap-2 pb-3 border-b border-[#e1e3e1]/60 dark:border-[#44474f]/40">
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-[#f0f4f9] dark:bg-[#141619] rounded-[28px] border-0 shadow-none">
                      <div className="flex items-center gap-2 text-[13.5px] sm:text-sm font-mono font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        <Clock className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                        <span>Time: {formatDuration(currentUserAns?.timeSpentSeconds || 0)}</span>
                      </div>
                      {isCurrentAttempted ? (
                        isCurrentCorrect ? (
                          <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-transparent px-2.5 py-0.5 rounded-[28px] border-0 flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Correct (+{currentQ.points || 1} pt)
                          </span>
                        ) : (
                          <span className="font-bold text-rose-600 dark:text-rose-400 bg-transparent px-2.5 py-0.5 rounded-[28px] border-0 flex items-center gap-1 text-[11px]">
                            <XCircle className="w-3.5 h-3.5 shrink-0" /> Incorrect (0 pt)
                          </span>
                        )
                      ) : (
                        <span className="font-bold text-[#5e5e5e] dark:text-[#9aa0a6] bg-transparent px-2.5 py-0.5 rounded-[28px] border-0 flex items-center gap-1 text-[11px]">
                          <CircleDot className="w-3.5 h-3.5 shrink-0 text-[#5e5e5e] dark:text-[#9aa0a6]" /> Unattempted
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[#1f1f1f] dark:text-[#e3e3e3] text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full">
                    <div className="flex items-start gap-1 sm:gap-1.5 max-w-full">
                      <span className="font-bold shrink-0 text-[18px] sm:text-[19px] pt-0.5 select-none text-[#0b57d0] dark:text-[#a8c7fa]">
                        {reviewIndex + 1}.
                      </span>
                      <div className="flex-1 min-w-0 max-w-full text-[18px] sm:text-[19px] font-medium leading-relaxed overflow-x-auto overflow-y-hidden">
                        <MathRenderer content={currentQ.text} />
                      </div>
                    </div>

                    {/* Question Diagram / Image */}
                    {(currentQ.imageUrl || (Array.isArray(currentQ.imageUrls) && currentQ.imageUrls.some(Boolean))) && (
                      <QuestionDiagramViewer
                        imageUrl={currentQ.imageUrl}
                        imageUrls={currentQ.imageUrls}
                        imageWidths={currentQ.imageWidths}
                        alt={`Question ${reviewIndex + 1} Diagram`}
                        width={currentQ.imageWidth}
                      />
                    )}
                  </div>

                  {/* MCQ Options Rendering matching Active Test with Blue/Red Highlight */}
                  {isMcqQuestion(currentQ) && currentQ.options && currentQ.options.length > 0 && (
                    <div className="space-y-2 pt-1 max-w-full">
                      {currentQ.options.map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isCorrectOption = checkIsOptionCorrect(opt, optIdx, currentQ);
                        const isUserOption = checkIsOptionSelected(opt, optIdx, currentUserAns?.selectedOption, currentQ.options);

                        let optionStyle = 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border border-slate-300 dark:border-zinc-700 shadow-none';
                        let badgeStyle = 'bg-white dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-extrabold border border-slate-300 dark:border-zinc-700';

                        if (isCorrectOption) {
                          optionStyle = 'bg-[#d3e3fd]/80 dark:bg-[#004a77]/60 text-[#041e49] dark:text-[#c2e7ff] font-bold border border-[#0b57d0] dark:border-[#a8c7fa] shadow-none';
                          badgeStyle = 'bg-[#0b57d0] text-white font-black border-0 ring-0';
                        } else if (isUserOption && !isCorrectOption) {
                          optionStyle = 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-bold border border-rose-600 dark:border-rose-400 shadow-none';
                          badgeStyle = 'bg-rose-600 dark:bg-rose-500 text-white font-black border-0 ring-0';
                        }

                        return (
                          <div
                            key={`split-opt-${currentQ.id || reviewIndex}-${optIdx}`}
                            style={{ borderWidth: '1px' }}
                            className={`w-full max-w-full box-border text-left px-3.5 py-2.5 sm:px-4 sm:py-3 min-h-[42px] rounded-[28px] transition-all duration-100 flex items-start gap-2.5 sm:gap-3 select-none ${optionStyle}`}
                          >
                            <div className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 font-extrabold text-xs sm:text-xs mt-0.5 transition-none ${badgeStyle}`}>
                              {letter}
                            </div>
                            <div className="text-[17px] sm:text-[18px] font-medium leading-snug flex-1 min-w-0 max-w-full text-[#1f1f1f] dark:text-[#e3e3e3] py-0.5">
                              <MathRenderer content={opt} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Numerical fallback if question has no MCQ options */}
                  {!isMcqQuestion(currentQ) && (
                    <div className="grid grid-cols-1 gap-2.5 pt-2">
                      <div className="p-4 rounded-[28px] bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 border-0 space-y-1 shadow-none">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider">Correct Value</span>
                          <span className="w-5 h-5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-bold text-[10px]">✓</span>
                        </div>
                        <div className="text-[18px] sm:text-[19px] font-medium text-[#041e49] dark:text-[#c2e7ff]">
                          <MathRenderer content={currentQ.correctAnswer} />
                        </div>
                      </div>
                      <div className={`p-4 rounded-[28px] border-0 space-y-1 shadow-none ${isCurrentCorrect ? 'bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff]' : 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-80">Your Submitted Value</span>
                          <span className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px] ${isCurrentCorrect ? 'bg-[#0b57d0]' : 'bg-rose-600'}`}>
                            {isCurrentCorrect ? '✓' : '✗'}
                          </span>
                        </div>
                        <div className="text-[18px] sm:text-[19px] font-medium">
                          {currentUserAns?.selectedOption ? (
                            <MathRenderer content={currentUserAns.selectedOption} />
                          ) : (
                            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-sans italic text-sm font-medium">Unattempted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step-by-Step Derivation & Solution */}
                  {(currentQ.explanation || currentQ.solution || currentQ.explanationImageUrl || (Array.isArray(currentQ.explanationImageUrls) && currentQ.explanationImageUrls.some(Boolean))) && (
                    <div className="pt-3 mt-2 border-t border-[#e1e3e1]/60 dark:border-[#44474f]/40 space-y-2">
                      <div className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-2 text-xs sm:text-sm">
                        <div className="w-6 h-6 rounded-full bg-[#0b57d0]/10 dark:bg-[#004a77]/30 flex items-center justify-center shrink-0">
                          <Lightbulb className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                        </div>
                        <span>Step-by-Step Derivation & Solution:</span>
                      </div>
                      {currentQ.explanation && (
                        <div className="pt-0.5 text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full overflow-x-auto overflow-y-hidden text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <MathRenderer content={currentQ.explanation || currentQ.solution || ''} />
                        </div>
                      )}
                      {(currentQ.explanationImageUrl || (Array.isArray(currentQ.explanationImageUrls) && currentQ.explanationImageUrls.some(Boolean))) && (
                        <QuestionDiagramViewer
                          imageUrl={currentQ.explanationImageUrl}
                          imageUrls={currentQ.explanationImageUrls}
                          imageWidths={currentQ.explanationImageWidths}
                          alt={`Solution Explanation Diagram`}
                          width={currentQ.explanationImageWidth}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: Derivation & Explanation */}
                <div className="bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] p-3.5 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800/60">
                    <div className="w-7 h-7 rounded-full bg-[#0084ff]/15 flex items-center justify-center shrink-0 shadow-xs">
                      <Lightbulb className="w-4 h-4 text-[#0084ff]" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      Step-by-Step Derivation & Solution
                    </h3>
                  </div>

                  {(currentQ.explanation || currentQ.solution) ? (
                    <div className="py-1 text-[18px] sm:text-[19px] font-medium leading-relaxed text-slate-800 dark:text-zinc-200">
                      <MathRenderer content={currentQ.explanation || currentQ.solution || ''} />
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-50 dark:bg-[#202330] rounded-[18px] text-xs text-slate-400 dark:text-zinc-500 text-center border-0 ring-0 shadow-xs">
                      No detailed derivation provided for this question.
                    </div>
                  )}

                  {currentQ.hint && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-[18px] border border-amber-200 dark:border-amber-800/60 text-[18px] sm:text-[19px] font-medium text-amber-900 dark:text-amber-200 space-y-1 shadow-xs">
                      <span className="font-bold block text-xs">💡 Solution Hint:</span>
                      <MathRenderer content={currentQ.hint} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* SINGLE COLUMN VIEW */
              <div className="bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] p-3.5 sm:p-5 space-y-3">
                {/* TOP HEADER CONTAINER WITH TITLE ABOVE */}
                <div className="flex flex-col gap-2.5 pb-3 border-b border-[#e1e3e1]/60 dark:border-[#44474f]/40 shrink-0">
                  <div className="px-0.5">
                    <h3 className="text-sm sm:text-base font-medium text-[#1f1f1f] dark:text-[#e3e3e3] truncate" title={test.title}>
                      {test.title}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-[#f0f4f9] dark:bg-[#141619] rounded-[28px] border-0 shadow-none">
                    <div className="flex items-center gap-2 text-[13.5px] sm:text-sm font-mono font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      <Clock className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      <span>Time: {formatDuration(currentUserAns?.timeSpentSeconds || 0)}</span>
                    </div>

                    <div>
                      {isCurrentAttempted ? (
                        isCurrentCorrect ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] bg-transparent px-2.5 py-0.5 rounded-[28px] border-0">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Correct (+{currentQ.points || 1} pt)</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-transparent px-2.5 py-0.5 rounded-[28px] border-0">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Incorrect (0 pt)</span>
                          </span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] bg-transparent px-2.5 py-0.5 rounded-[28px] border-0">
                          <CircleDot className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" />
                          <span>Unattempted (0 pt)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Question Statement with Full Width */}
                <div className="text-[#1f1f1f] dark:text-[#e3e3e3] text-[18px] sm:text-[19px] font-medium leading-relaxed pt-1 max-w-full">
                  <div className="flex items-start gap-1 sm:gap-1.5 max-w-full">
                    <span className="font-bold shrink-0 text-[18px] sm:text-[19px] pt-0.5 select-none text-[#0b57d0] dark:text-[#a8c7fa]">
                      {reviewIndex + 1}.
                    </span>
                    <div className="flex-1 min-w-0 max-w-full text-[18px] sm:text-[19px] font-medium leading-relaxed overflow-x-auto overflow-y-hidden">
                      <MathRenderer content={currentQ.text} />
                    </div>
                  </div>

                  {/* Question Diagram / Image */}
                  {(currentQ.imageUrl || (Array.isArray(currentQ.imageUrls) && currentQ.imageUrls.some(Boolean))) && (
                    <QuestionDiagramViewer
                      imageUrl={currentQ.imageUrl}
                      imageUrls={currentQ.imageUrls}
                      imageWidths={currentQ.imageWidths}
                      alt={`Question ${reviewIndex + 1} Diagram`}
                      width={currentQ.imageWidth}
                    />
                  )}
                </div>

                {/* MCQ Options Rendering matching Active Test with Blue/Red Highlight */}
                {isMcqQuestion(currentQ) && currentQ.options && currentQ.options.length > 0 && (
                  <div className="space-y-2 pt-1 max-w-full">
                    {currentQ.options.map((opt, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isCorrectOption = checkIsOptionCorrect(opt, optIdx, currentQ);
                      const isUserOption = checkIsOptionSelected(opt, optIdx, currentUserAns?.selectedOption, currentQ.options);

                      let optionStyle = 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border border-slate-300 dark:border-zinc-700 shadow-none';
                      let badgeStyle = 'bg-white dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-extrabold border border-slate-300 dark:border-zinc-700';

                      if (isCorrectOption) {
                        optionStyle = 'bg-[#d3e3fd]/80 dark:bg-[#004a77]/60 text-[#041e49] dark:text-[#c2e7ff] font-bold border border-[#0b57d0] dark:border-[#a8c7fa] shadow-none';
                        badgeStyle = 'bg-[#0b57d0] text-white font-black border-0 ring-0';
                      } else if (isUserOption && !isCorrectOption) {
                        optionStyle = 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-bold border border-rose-600 dark:border-rose-400 shadow-none';
                        badgeStyle = 'bg-rose-600 dark:bg-rose-500 text-white font-black border-0 ring-0';
                      }

                      return (
                        <div
                          key={`single-opt-${currentQ.id || reviewIndex}-${optIdx}`}
                          style={{ borderWidth: '1px' }}
                          className={`w-full max-w-full box-border text-left px-3.5 py-2.5 sm:px-4 sm:py-3 min-h-[42px] rounded-[28px] transition-all duration-100 flex items-start gap-2.5 sm:gap-3 select-none ${optionStyle}`}
                        >
                          <div className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 font-extrabold text-xs sm:text-xs mt-0.5 transition-none ${badgeStyle}`}>
                            {letter}
                          </div>
                          <div className="text-[17px] sm:text-[18px] font-medium leading-snug flex-1 min-w-0 max-w-full text-[#1f1f1f] dark:text-[#e3e3e3] py-0.5">
                            <MathRenderer content={opt} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numerical Answer Review Block fallback if no MCQ options */}
                {!isMcqQuestion(currentQ) && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className="p-4 rounded-[28px] bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 border-0 space-y-1.5 shadow-none">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider">Correct Value</span>
                          <span className="w-6 h-6 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-bold text-xs">✓</span>
                        </div>
                        <div className="text-[18px] sm:text-[19px] font-medium text-[#041e49] dark:text-[#c2e7ff]">
                          <MathRenderer content={currentQ.correctAnswer} />
                        </div>
                      </div>
                      <div className={`p-4 rounded-[28px] border-0 space-y-1.5 shadow-none ${
                        isCurrentCorrect 
                          ? 'bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff]' 
                          : 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-80">Your Submitted Value</span>
                          <span className={`w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-xs ${
                            isCurrentCorrect ? 'bg-[#0b57d0]' : 'bg-rose-600'
                          }`}>
                            {isCurrentCorrect ? '✓' : '✗'}
                          </span>
                        </div>
                        <div className="text-[18px] sm:text-[19px] font-medium">
                          {currentUserAns?.selectedOption ? (
                            <MathRenderer content={currentUserAns.selectedOption} />
                          ) : (
                            <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-sans italic text-sm font-medium">Unattempted</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step-by-Step Derivation & Solution */}
                {(currentQ.explanation || currentQ.solution || currentQ.explanationImageUrl || (Array.isArray(currentQ.explanationImageUrls) && currentQ.explanationImageUrls.some(Boolean))) && (
                  <div className="pt-3 mt-2 border-t border-[#e1e3e1]/60 dark:border-[#44474f]/40 space-y-2">
                    <div className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-2 text-xs sm:text-sm">
                      <div className="w-6 h-6 rounded-full bg-[#0b57d0]/10 dark:bg-[#004a77]/30 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      </div>
                      <span>Step-by-Step Derivation & Solution:</span>
                    </div>
                    {currentQ.explanation && (
                      <div className="pt-0.5 text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full overflow-x-auto overflow-y-hidden text-[#1f1f1f] dark:text-[#e3e3e3]">
                        <MathRenderer content={currentQ.explanation || currentQ.solution || ''} />
                      </div>
                    )}
                    {(currentQ.explanationImageUrl || (Array.isArray(currentQ.explanationImageUrls) && currentQ.explanationImageUrls.some(Boolean))) && (
                      <QuestionDiagramViewer
                        imageUrl={currentQ.explanationImageUrl}
                        imageUrls={currentQ.explanationImageUrls}
                        imageWidths={currentQ.explanationImageWidths}
                        alt={`Solution Explanation Diagram`}
                        width={currentQ.explanationImageWidth}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </main>

        {/* Fixed Non-Scrollable Bottom Navigation Bar for Review Mode (matches TestRunner) */}
        <footer className="shrink-0 z-40 py-2.5 px-3 pb-[calc(max(0.75rem,env(safe-area-inset-bottom,0px))+0.25rem)] sm:pb-3 sm:px-4 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 shadow-none">
          <div className="w-full max-w-md mx-auto flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Previous Button */}
            <button
              type="button"
              id="review-prev-btn"
              onClick={() => setReviewIndex((prev) => Math.max(0, prev - 1))}
              disabled={reviewIndex === 0}
              className="w-[110px] sm:w-[130px] h-10 px-3 sm:px-4 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span>Previous</span>
            </button>

            {/* Center-Left: Mark for Review Button */}
            <button
              type="button"
              id="review-mark-btn"
              onClick={handleToggleFlagReview}
              title={isCurrentMarked ? "Marked for Review (Click to Unmark)" : "Mark for Review"}
              aria-label={isCurrentMarked ? "Marked for Review" : "Mark for Review"}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer select-none border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:scale-92 ${
                isCurrentMarked
                  ? 'bg-[#ffe088] text-[#241a00] dark:bg-[#5b4300] dark:text-[#ffe088]'
                  : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
              }`}
            >
              <Bookmark className={`w-4 h-4 shrink-0 ${isCurrentMarked ? 'fill-current stroke-[2.2]' : 'stroke-[2.2]'}`} />
            </button>

            {/* Center-Right: Retake Test Button */}
            <button
              type="button"
              id="review-retake-btn"
              onClick={onRetakeTest}
              title="Retake Test"
              className="w-10 h-10 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]"
            >
              <RotateCcw className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
            </button>

            {/* Right: Next / View Notes Button */}
            {reviewIndex < test.questions.length - 1 ? (
              <button
                type="button"
                id="review-next-btn"
                onClick={() => setReviewIndex((prev) => prev + 1)}
                className="w-[110px] sm:w-[130px] h-10 px-3 sm:px-4 rounded-full bg-[#0b57d0] hover:bg-[#0b57d0]/90 text-white flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                id="review-finish-btn"
                onClick={() => setViewMode('notes')}
                className="w-[110px] sm:w-[130px] h-10 px-3 sm:px-4 rounded-full bg-[#0b57d0] hover:bg-[#0b57d0]/90 text-white flex items-center justify-center gap-1.5 font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>Notes</span>
              </button>
            )}
          </div>
        </footer>

        {renderQuestionPanel()}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 bg-[#e5e9f0] dark:bg-[#0b0c10] overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-36 sm:pb-32">
      {/* Header Bar with Clean Icon Badge matching CustomTestBuilder */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3">
          <button
            id="back-to-library-btn"
            onClick={() => setViewMode('test-review')}
            title="Back to Solution Review"
            className="w-9 h-9 rounded-full bg-[#f8fafc] hover:bg-slate-200 dark:bg-[#21222e] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 hover:text-[#0084ff] dark:hover:text-blue-400 flex items-center justify-center transition-all cursor-pointer shrink-0 border-0 ring-0 shadow-2xs active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#0084ff] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <FileText className="w-4 h-4" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Notes & Repository
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Personal notes and study materials ({userNotes.length} saved)
            </p>
          </div>
        </div>

        {/* Action Header Button Group */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Google Drive Status & Connect / Sign Out Button */}
          {driveSyncState === 'syncing' ? (
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#21222e] text-xs font-medium text-slate-500 dark:text-zinc-400 shadow-xs border-0 ring-0 shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0084ff]" />
              <span className="text-[11px] font-bold">Syncing...</span>
            </div>
          ) : (driveToken || getCachedGoogleAccessToken()) ? (
            <div className="flex items-center gap-2 text-xs font-medium px-3.5 py-1.5 rounded-full bg-white dark:bg-[#21222e] border-0 ring-0 shadow-xs shrink-0">
              <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-100">Drive Connected</span>
              <button
                type="button"
                onClick={handleSignOutDrive}
                className="text-[10px] font-bold text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 cursor-pointer border-l border-slate-200 dark:border-zinc-700 pl-2 transition-colors"
                title="Sign out of Google Drive"
              >
                Sign Out
              </button>
            </div>
          ) : isTokenExpired ? (
            <button
              type="button"
              onClick={handleReconnectDrive}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs border-0 ring-0 shrink-0"
              title="Google Drive session expired. Click to reconnect."
            >
              <span>Reconnect Drive</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReconnectDrive}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0084ff] hover:bg-[#0073e6] active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs border-0 ring-0 shrink-0"
              title="Connect to Google Drive"
            >
              <span>Connect Drive</span>
            </button>
          )}

          {/* Sync Button */}
          {(driveToken || getCachedGoogleAccessToken()) && (
            <button
              type="button"
              onClick={handleSyncWithDrive}
              disabled={driveSyncState === 'syncing'}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-100 dark:bg-[#21222e] dark:hover:bg-[#282a39] text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 border-0 ring-0 shadow-xs active:scale-95"
              title="Sync with Google Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#0084ff] ${driveSyncState === 'syncing' ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          )}

          <button
            id="open-solution-mode-btn"
            onClick={() => setViewMode('test-review')}
            className="flex items-center gap-2 px-4 py-1.5 sm:py-2 bg-[#0084ff] hover:bg-[#0073e6] active:scale-95 text-white text-xs font-bold rounded-full transition-all cursor-pointer border-0 ring-0 shadow-xs"
          >
            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
              <Eye className="w-3 h-3 text-white" />
            </div>
            <span>Solution Mode</span>
          </button>
        </div>
      </div>

      {/* Main Drive File Manager Workspace */}
      <DriveFileManager
        notes={userNotes}
        testTitle={test.title}
        testId={test.id}
        currentUser={currentUser}
        onAddNote={() => setIsAddNoteModalOpen(true)}
        onDeleteNote={handleDeleteNote}
        onRenameNote={handleRenameNote}
        onEditNote={(updatedNote) => {
          setUserNotes((prev) => {
            const filtered = prev.filter((n) => n.id !== updatedNote.id);
            const updated = [updatedNote, ...filtered] as UserCustomNote[];
            saveAllNotesToIDB(updated);
            return updated;
          });
        }}
        onPreviewFile={(file) => setPreviewFile(file)}
        onAddNewFileNote={(newNote) => {
          setUserNotes((prev) => {
            const updated = [newNote, ...prev] as UserCustomNote[];
            saveAllNotesToIDB(updated);
            return updated;
          });
        }}
        onNoteDriveSynced={(noteId, driveFileId, webViewLink) => {
          setUserNotes((prev) => {
            const updated = prev.map((n) =>
              n.id === noteId ? { ...n, driveFileId, driveWebViewLink: webViewLink } : n
            );
            saveAllNotesToIDB(updated);
            return updated;
          });
        }}
        onImportDriveNotes={(importedNotes) => {
          setUserNotes((prev) => {
            const map = new Map<string, UserCustomNote>(prev.map((n) => [n.id, n]));
            importedNotes.forEach((inNote) => {
              const existing = map.get(inNote.id);
              map.set(inNote.id, {
                ...existing,
                ...inNote,
                fileUrl: existing?.fileUrl || inNote.fileUrl,
                fileType: inNote.fileType || existing?.fileType,
                fileName: inNote.fileName || existing?.fileName,
              });
            });
            const updated = Array.from(map.values());
            saveAllNotesToIDB(updated);
            return updated;
          });
        }}
      />

      {/* ADD NOTE / FILE ATTACHMENT MODAL */}
      <AnimatePresence>
        {isAddNoteModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 select-none cursor-pointer"
            onClick={() => setIsAddNoteModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              style={{ willChange: 'transform, opacity' }}
              className="bg-white dark:bg-[#21222e] w-full max-w-lg rounded-3xl border-0 ring-0 p-6 space-y-4 relative cursor-default modal-content-smooth shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#e2e5ec] dark:border-zinc-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/70 text-[#0084ff] flex items-center justify-center font-bold shadow-xs">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Add Personal Note & File</h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">Save custom notes or attach image and PDF documents</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-[#c4c4cc] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Question Selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">Question Tag (Optional)</label>
                <select
                  value={newNoteQNum}
                  onChange={(e) => setNewNoteQNum(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-100 dark:bg-[#252838] border-0 ring-0 text-slate-800 dark:text-zinc-100 focus:outline-none shadow-xs"
                >
                  <option value={0}>General Test Note</option>
                  {test.questions.map((_, idx) => (
                    <option key={idx} value={idx + 1}>
                      Question {idx + 1}
                    </option>
                  ))}
                </select>
              </div>

              {/* Note Textarea */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">Note Content</label>
                <textarea
                  rows={3}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="e.g. Remember to check boundary conditions for $x \ge 0$..."
                  className="w-full p-3 text-xs bg-slate-100 dark:bg-[#252838] border-0 ring-0 rounded-xl text-slate-800 dark:text-zinc-100 focus:outline-none leading-relaxed shadow-xs"
                />
              </div>

              {/* File / Image Upload Box */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Attachment File (Optional)</span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">JPG, PNG, or PDF</span>
                </label>

                {attachedFile ? (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-[#0084ff]/40 flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2 truncate text-xs font-semibold text-slate-800 dark:text-zinc-100">
                      {attachedFile.type === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-[#0084ff] shrink-0" />
                      ) : (
                        <Paperclip className="w-4 h-4 text-[#0084ff] shrink-0" />
                      )}
                      <span className="truncate">{attachedFile.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const isPdf =
                            attachedFile.name.toLowerCase().endsWith('.pdf') ||
                            attachedFile.url.startsWith('data:application/pdf');
                          setPreviewFile({
                            url: attachedFile.url,
                            name: attachedFile.name,
                            type: attachedFile.type === 'image' ? 'image' : isPdf ? 'pdf' : 'file',
                          });
                        }}
                        className="px-2.5 py-1 rounded-full bg-[#0084ff]/10 text-[#0084ff] text-[11px] font-bold hover:bg-[#0084ff]/20 transition-colors flex items-center gap-1 cursor-pointer border-0 ring-0 shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        title="Remove attachment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#252838]/50 hover:bg-slate-100 dark:hover:bg-[#282a39] cursor-pointer transition-colors group shadow-xs">
                    <FileUp className="w-6 h-6 text-slate-400 group-hover:text-[#0084ff] transition-colors mb-1" />
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Upload Image or PDF</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">JPG, PNG, PDF only</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}

                {/* Firebase & Local Storage Size Limit Notice */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#252838] border-0 ring-0 text-[11px] text-slate-600 dark:text-zinc-400 space-y-1 shadow-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200 text-[11px]">
                    <Cloud className="w-3.5 h-3.5 text-[#0084ff]" />
                    <span>Firebase Storage Limits & Format Support</span>
                  </div>
                  <ul className="text-[10px] leading-relaxed space-y-0.5 list-disc pl-4 text-slate-500 dark:text-zinc-400">
                    <li><strong>Formats:</strong> JPG, PNG, and PDF preserved at full original resolution.</li>
                    <li><strong>Firebase Cloud Sync:</strong> Supports attachments up to <strong>~750 KB - 1 MB</strong> for instant multi-device synchronization.</li>
                    <li><strong>Local Storage (IndexedDB):</strong> Large documents & full-resolution files supported up to <strong>25 MB</strong>.</li>
                  </ul>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-[#252838] hover:bg-slate-200 dark:hover:bg-[#282a39] transition-colors cursor-pointer border-0 ring-0 shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewNote}
                  disabled={!newNoteContent.trim() && !attachedFile}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0084ff] hover:bg-[#0073e6] active:scale-95 text-white disabled:opacity-40 transition-all border-0 ring-0 shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* IN-APP FILE & DOCUMENT PREVIEW MODAL */}
      <UnifiedFileViewerModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  </div>
  );
};