import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { NotesStudioProps, NotesStudioMode } from './types';
import type { UserNoteItem } from '../DriveFileManager';
import { NotesStudioHeader } from './components/NotesStudioHeader';
import { RevisionNotesView } from './components/revisionNotes/RevisionNotesView';
import { CreateRevisionNoteModal } from './components/revisionNotes/CreateRevisionNoteModal';
import { RepositoryFilesView } from './components/repository/RepositoryFilesView';
import { HtmlNotesStudio } from '../htmlNotes/HtmlNotesStudio';
import { UnifiedFileViewerModal, type PreviewableFile } from '../UnifiedFileViewerModal';
import {
  getAllNotesFromIDB,
  saveAllNotesToIDB,
  deleteNoteFromIDB,
  saveSingleNoteToIDB,
  addDeletedTombstone,
  isTombstoned,
  getDeletedTombstones,
} from '../../lib/idbNotes';
import {
  getCachedGoogleAccessToken,
  setCachedGoogleAccessToken,
  isGoogleDriveTokenExpired,
  clearGoogleDriveAuth,
  signInWithGoogle,
} from '../../lib/firebase';
import {
  loadAllNotesManifestsFromGoogleDrive,
  syncNotesManifestToGoogleDrive,
  deleteGoogleDriveFile,
} from '../../lib/googleWorkspace';
import {
  attachNotesManifestListener,
  subscribeSimpleNotesUpdates,
  recordSimpleNotesUpdate,
  deleteSimpleNoteFromManifest,
} from '../../lib/notesManifestCoordinator';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useBackHandler } from '../../hooks/useBackNavigation';
import { studioTabVariants } from '../../lib/animationConfig';
import { APP_STYLES } from '../ui/AppStyles';

const NOTES_STUDIO_MODE_STORAGE_KEY = 'mockmc_notes_studio_active_mode_v2';

export const NotesStudio: React.FC<NotesStudioProps> = ({
  tests,
  currentUser,
  initialMode,
  onBack,
  onStartTest,
  isDarkMode = false,
  toggleTheme: toggleThemeProp,
}) => {
  // 1. Studio Active Mode: 'repository' | 'html'
  const [activeMode, setActiveMode] = useState<NotesStudioMode>(() => {
    if (initialMode === 'html') return 'html';
    if (initialMode === 'repository') return 'repository';
    try {
      const saved = localStorage.getItem(NOTES_STUDIO_MODE_STORAGE_KEY) as NotesStudioMode | null;
      if (saved === 'repository' || saved === 'html') {
        return saved;
      }
    } catch (e) {}
    return 'repository';
  });

  const handleModeChange = useCallback((mode: NotesStudioMode) => {
    setActiveMode(mode);
    try {
      localStorage.setItem(NOTES_STUDIO_MODE_STORAGE_KEY, mode);
    } catch (e) {}
  }, []);

  // Update mode if initialMode changes externally (e.g., from deep link in Navbar)
  useEffect(() => {
    if (initialMode && initialMode !== activeMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

  // Html Notes Studio View State ('home' | 'editor')
  const [htmlStudioView, setHtmlStudioView] = useState<'home' | 'editor'>('home');

  // Synchronize status bar theme-color for PWA web app in both light (#ffffff in editor / #e5e9f0 in home) and dark (#0b0c10) modes
  useEffect(() => {
    const updateThemeColor = () => {
      try {
        const isDocDark = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : isDarkMode;
        const targetHeaderColor = isDocDark ? '#0b0c10' : (activeMode === 'html' && htmlStudioView === 'editor' ? '#ffffff' : '#e5e9f0');
        const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
        if (metaThemeColors.length > 0) {
          metaThemeColors.forEach((el) => {
            el.removeAttribute('media');
            el.setAttribute('content', targetHeaderColor);
          });
        } else {
          const newMeta = document.createElement('meta');
          newMeta.name = 'theme-color';
          newMeta.content = targetHeaderColor;
          document.head.appendChild(newMeta);
        }
        const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (appleStatusBar) {
          appleStatusBar.setAttribute('content', isDocDark ? 'black-translucent' : 'default');
        }
      } catch {
        // Ignore
      }
    };

    updateThemeColor();

    window.addEventListener('theme-changed', updateThemeColor);
    let observer: MutationObserver | null = null;
    if (typeof document !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(updateThemeColor);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      window.removeEventListener('theme-changed', updateThemeColor);
      if (observer) observer.disconnect();
    };
  }, [isDarkMode, activeMode, htmlStudioView]);

  // 2. User Revision Notes State
  const [userNotes, setUserNotes] = useState<UserNoteItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 3. Note Modal States
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState<boolean>(false);
  const [editingNoteTarget, setEditingNoteTarget] = useState<UserNoteItem | null>(null);

  // 4. File Preview Modal State
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);

  // 5. Google Drive Auth & Sync State
  const [googleToken, setGoogleToken] = useState<string | null>(getCachedGoogleAccessToken());
  const [isTokenExpired, setIsTokenExpired] = useState<boolean>(() => isGoogleDriveTokenExpired());
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);

  // Html Notes Studio Actions Ref
  const htmlStudioActionsRef = useRef<{ 
    onCreateNewProject: () => void; 
    onImportClick: () => void; 
    onAddFileToProject?: (projectId?: string) => void;
  } | null>(null);

  // Scroll to top on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  // Google Drive token monitoring
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

  // Scroll lock & Back navigation handlers
  useScrollLock(isAddNoteModalOpen || !!editingNoteTarget || !!previewFile);

  useBackHandler({
    isOpen: !!previewFile,
    onBack: () => setPreviewFile(null),
    priority: 50,
    id: 'notes_studio_preview_modal_back',
  });

  useBackHandler({
    isOpen: isAddNoteModalOpen || !!editingNoteTarget,
    onBack: () => {
      setIsAddNoteModalOpen(false);
      setEditingNoteTarget(null);
    },
    priority: 40,
    id: 'notes_studio_add_note_modal_back',
  });

  useBackHandler({
    isOpen: !previewFile && !isAddNoteModalOpen && !editingNoteTarget && (activeMode !== 'html' || htmlStudioView === 'home'),
    onBack: onBack,
    priority: 20,
    id: 'notes_studio_root_back',
  });

  // Handle Import Remote Drive Notes with multi-device reconciliation
  const handleImportDriveNotes = useCallback(async (importedNotes: any[]) => {
    if (!importedNotes) return;
    const tombstones = getDeletedTombstones();
    const remoteIdSet = new Set(
      importedNotes
        .filter((n) => n && !tombstones.has(n.id) && (!n.driveFileId || !tombstones.has(n.driveFileId)))
        .map((n) => n.id)
    );

    setUserNotes((prev) => {
      const localUnsynced = prev.filter(
        (n) =>
          !n.driveFileId &&
          !n.isDriveDirectFile &&
          !remoteIdSet.has(n.id) &&
          !tombstones.has(n.id)
      );

      const remoteMap = new Map<string, UserNoteItem>();
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

  // Load all user notes strictly scoped by active user account or guest mode
  const loadAllNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = await getAllNotesFromIDB();
      const tombstones = getDeletedTombstones();
      const activeUid = currentUser?.uid;

      const scoped = stored.filter((n: any) => {
        if (n.id?.startsWith('seed_') || n.id?.startsWith('seed') || n.id?.startsWith('auto_')) return false;
        if (tombstones.has(n.id)) return false;
        if (n.driveFileId && (tombstones.has(n.driveFileId) || tombstones.has(`drive_${n.driveFileId}`))) return false;

        if (activeUid) {
          // Logged-in mode: match notes for this user or unassigned legacy notes
          return !n.userId || n.userId === activeUid;
        } else {
          // Signed-out mode: strictly guest notes only
          return n.userId === 'guest-user' || n.userId === 'anonymous';
        }
      });

      setUserNotes(scoped);
    } catch (e) {
      console.error('Failed to load notes from IDB:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUserNotes([]);
    }

    const unsub = subscribeSimpleNotesUpdates((remoteNotes) => {
      if (remoteNotes) {
        if (currentUser?.uid) {
          setUserNotes(remoteNotes);
        } else {
          setUserNotes([]);
        }
      }
    });

    return () => {
      unsub();
    };
  }, [currentUser]);

  useEffect(() => {
    loadAllNotes();
  }, [loadAllNotes]);

  // Note Handlers
  const handleDeleteNote = useCallback(
    async (id: string) => {
      addDeletedTombstone(id);
      deleteSimpleNoteFromManifest(id);
      const noteToDelete = userNotes.find((n) => n.id === id);
      const driveFileIdToDelete = noteToDelete?.driveFileId;
      if (driveFileIdToDelete) {
        addDeletedTombstone(driveFileIdToDelete);
        addDeletedTombstone(`drive_${driveFileIdToDelete}`);
      }
      const remainingNotes = userNotes.filter(
        (n) => n.id !== id && (!driveFileIdToDelete || n.driveFileId !== driveFileIdToDelete)
      );
      setUserNotes(remainingNotes);
      await saveAllNotesToIDB(remainingNotes, true);
      recordSimpleNotesUpdate(remainingNotes);

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
    },
    [userNotes]
  );

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
      recordSimpleNotesUpdate(updated);
      return updated;
    });
  }, []);

  const handleEditNote = useCallback((note: UserNoteItem) => {
    setEditingNoteTarget(note);
  }, []);

  const handleSaveModalNote = useCallback(
    async (noteData: {
      id?: string;
      content: string;
      tag: 'formula' | 'trick' | 'mistake' | 'general' | 'table';
      testId: string;
      attachedFile: {
        url: string;
        name: string;
        type: 'image' | 'pdf' | 'file';
      } | null;
    }) => {
      if (noteData.id) {
        // Edit existing note
        setUserNotes((prev) => {
          const updated = prev.map((n) => {
            if (n.id === noteData.id) {
              return {
                ...n,
                content: noteData.content,
                tag: noteData.tag,
                testId: noteData.testId,
                fileName: noteData.attachedFile?.name || n.fileName,
                fileType: noteData.attachedFile?.type || n.fileType,
                fileUrl: noteData.attachedFile?.url || n.fileUrl,
              };
            }
            return n;
          });
          saveAllNotesToIDB(updated);
          recordSimpleNotesUpdate(updated);
          const token = getCachedGoogleAccessToken();
          if (token) {
            syncNotesManifestToGoogleDrive(token, updated).catch(() => {});
          }
          return updated;
        });
      } else {
        // Create new note
        const newNote: UserNoteItem = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          userId: currentUser?.uid || 'guest-user',
          testId: noteData.testId === 'all' ? 'global_repo' : noteData.testId,
          attemptId: 'studio_manual',
          questionNumber: 0,
          content: noteData.content || noteData.attachedFile?.name || 'Untitled Note',
          tag: noteData.tag,
          createdAt: new Date().toISOString(),
          fileName: noteData.attachedFile?.name,
          fileType: noteData.attachedFile?.type || 'file',
          fileUrl: noteData.attachedFile?.url,
        };

        await saveSingleNoteToIDB(newNote);
        const updatedList = [newNote, ...userNotes];
        setUserNotes(updatedList);
        recordSimpleNotesUpdate(updatedList);

        const token = getCachedGoogleAccessToken();
        if (token) {
          syncNotesManifestToGoogleDrive(token, updatedList).catch(() => {});
        }
      }
      setEditingNoteTarget(null);
    },
    [userNotes]
  );

  const handleAddNewFileNote = useCallback(
    async (newNote: UserNoteItem) => {
      setUserNotes((prev) => [newNote, ...prev]);
      await saveSingleNoteToIDB(newNote);
      const token = getCachedGoogleAccessToken();
      if (token) {
        syncNotesManifestToGoogleDrive(token, [newNote, ...userNotes]).catch(() => {});
      }
    },
    [userNotes]
  );

  const handleNoteDriveSynced = useCallback(
    async (noteId: string, driveFileId: string, webViewLink: string) => {
      setUserNotes((prev) => {
        const updated = prev.map((n) => {
          if (n.id === noteId) {
            return {
              ...n,
              driveFileId,
              driveWebViewLink: webViewLink,
            };
          }
          return n;
        });
        saveAllNotesToIDB(updated);
        return updated;
      });
    },
    []
  );

  const handlePreviewAttachment = useCallback((note: UserNoteItem) => {
    if (note.fileUrl) {
      setPreviewFile({
        url: note.fileUrl,
        name: note.fileName || 'Attachment',
        type: note.fileType || 'file',
        content: note.content,
      });
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    if (toggleThemeProp) {
      toggleThemeProp();
    } else if (typeof window !== 'undefined') {
      const root = document.documentElement;
      const currentDark = root.classList.contains('dark');
      if (currentDark) {
        root.classList.remove('dark');
        localStorage.setItem('math_mock_theme_v1', 'light');
      } else {
        root.classList.add('dark');
        localStorage.setItem('math_mock_theme_v1', 'dark');
      }
      window.dispatchEvent(new Event('theme-changed'));
    }
  }, [toggleThemeProp]);

  return (
    <div
      className={`min-h-screen h-full w-full ${APP_STYLES.page} flex flex-col ${
        activeMode === 'html' ? 'overflow-hidden' : 'overflow-y-auto'
      }`}
    >
      {/* 1. TOP HEADER WITH 2-WAY TOGGLE (Only on home dashboard, NOT in HTML editor mode) */}
      {(activeMode === 'repository' || (activeMode === 'html' && htmlStudioView === 'home')) && (
        <NotesStudioHeader
          currentMode={activeMode}
          onModeChange={handleModeChange}
          onBack={onBack}
          onAddNewNote={() => setIsAddNoteModalOpen(true)}
          googleToken={googleToken}
          isTokenExpired={isTokenExpired}
          isConnectingDrive={isConnectingDrive}
          onConnectDrive={handleConnectDrive}
          onSignOutDrive={handleSignOutDrive}
          onCreateNewProject={() => htmlStudioActionsRef.current?.onCreateNewProject()}
          onAddFileToProject={() => htmlStudioActionsRef.current?.onAddFileToProject?.()}
          onImportClick={() => htmlStudioActionsRef.current?.onImportClick()}
          isDark={isDarkMode}
          toggleTheme={handleToggleTheme}
        />
      )}

      {/* 2. MODE CONTENT RENDERING */}
      {activeMode === 'repository' && (
        <main className="flex-1 w-full">
          <RepositoryFilesView
            notes={userNotes}
            tests={tests}
            currentUser={currentUser}
            onAddNote={() => setIsAddNoteModalOpen(true)}
            onDeleteNote={handleDeleteNote}
            onRenameNote={handleRenameNote}
            onEditNote={handleEditNote}
            onPreviewFile={(f) => setPreviewFile(f)}
            onNoteDriveSynced={handleNoteDriveSynced}
            onAddNewFileNote={handleAddNewFileNote}
            onImportDriveNotes={handleImportDriveNotes}
            onStartTest={onStartTest}
          />
        </main>
      )}

      {activeMode === 'html' && (
        <div className="flex-1 w-full flex flex-col h-full overflow-hidden">
          <HtmlNotesStudio
            onBack={onBack}
            isDarkMode={isDarkMode}
            toggleTheme={handleToggleTheme}
            activeStudioMode={activeMode}
            onSwitchStudioMode={handleModeChange}
            onViewChange={setHtmlStudioView}
            onRegisterActions={(actions) => {
              htmlStudioActionsRef.current = actions;
            }}
          />
        </div>
      )}

      {/* 3. CREATE / EDIT REVISION NOTE MODAL */}
      <CreateRevisionNoteModal
        isOpen={isAddNoteModalOpen || !!editingNoteTarget}
        onClose={() => {
          setIsAddNoteModalOpen(false);
          setEditingNoteTarget(null);
        }}
        tests={tests}
        editingNote={editingNoteTarget}
        onSave={handleSaveModalNote}
      />

      {/* 4. FILE & DOCUMENT PREVIEW MODAL */}
      <UnifiedFileViewerModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};
