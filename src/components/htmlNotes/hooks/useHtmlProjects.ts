import React, { useState, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { HtmlProject, HtmlNoteItem, ViewMode } from '../types';
import { TEMPLATE_MATRICES, createNewNoteTemplate } from '../constants/templates';
import {
  saveLocalProjects,
  loadLocalProjects,
  queueFirestoreSync,
  sanitizeAndRepairCode
} from '../../../lib/htmlNotesSync';
import {
  recordHtmlProjectsUpdate,
  deleteHtmlProjectFromManifest,
  deleteHtmlFileFromManifest
} from '../../../lib/notesManifestCoordinator';
import {
  deleteNoteFromCloud,
  deleteProjectFromCloud
} from '../../../lib/htmlNotesCloudSyncEngine';
import {
  saveFileVersionSnapshot,
  clearFileVersionHistory
} from '../utils/versionHistory';
import { ensureStableBlockIds } from '../utils/docStructureMap';

interface UseHtmlProjectsOptions {
  onShowDriveToast?: (msg: string) => void;
  onSetStudioView: (view: 'home' | 'editor') => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function useHtmlProjects({
  onShowDriveToast,
  onSetStudioView,
  viewMode,
  setViewMode
}: UseHtmlProjectsOptions) {
  const [projects, setProjects] = useState<HtmlProject[]>(() => {
    return loadLocalProjects(TEMPLATE_MATRICES);
  });
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return initial.length > 0 ? initial[0].id : '';
  });
  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return (initial.length > 0 && initial[0].files.length > 0) ? initial[0].files[0].id : '';
  });
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const [code, setCode] = useState<string>(() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return (initial.length > 0 && initial[0].files.length > 0) ? (initial[0].files[0].code || TEMPLATE_MATRICES) : TEMPLATE_MATRICES;
  });
  const [title, setTitle] = useState<string>(() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return (initial.length > 0 && initial[0].files.length > 0) ? (initial[0].files[0].title || 'Notes') : 'Notes';
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Per-file isolated history map & file loading guard
  const loadedFileIdRef = useRef<string>((() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return (initial.length > 0 && initial[0].files.length > 0) ? initial[0].files[0].id : '';
  })());
  const fileHistoryMapRef = useRef<Record<string, { stack: string[]; index: number }>>((() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    if (initial.length > 0 && initial[0].files.length > 0) {
      const f = initial[0].files[0];
      return { [f.id]: { stack: [f.code || TEMPLATE_MATRICES], index: 0 } };
    }
    return {};
  })());
  const [historyStack, setHistoryStack] = useState<string[]>(() => {
    const initial = loadLocalProjects(TEMPLATE_MATRICES);
    return (initial.length > 0 && initial[0].files.length > 0) ? [initial[0].files[0].code || TEMPLATE_MATRICES] : [TEMPLATE_MATRICES];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Rename states
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState<string>('');
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFileTitle, setRenamingFileTitle] = useState<string>('');

  // Delete modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'project' | 'file';
    projectId: string;
    fileId?: string;
    title: string;
  } | null>(null);

  // Active state synchronization refs to ensure atomic exit/unmount commits with zero stale closures
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const codeRef = useRef(code);
  codeRef.current = code;
  const titleRef = useRef(title);
  titleRef.current = title;
  const hasUnsavedChangesRef = useRef(false);

  // Guarded real-time active file code & title binding to local storage
  useEffect(() => {
    if (!activeProjectId || !activeFileId) return;
    // Guard against race conditions during tab switching: do NOT save if activeFileId has not been loaded into code yet
    if (loadedFileIdRef.current !== activeFileId) return;

    const currentProj = projectsRef.current.find(p => p.id === activeProjectId);
    const currentFile = currentProj?.files.find(f => f.id === activeFileId);

    if (currentFile && currentFile.code === code && currentFile.title === title) {
      return;
    }

    setProjects((prev) => {
      const updated = prev.map((p) => {
        if (p.id === activeProjectId) {
          const fileExists = p.files.some((f) => f.id === activeFileId);
          let newFiles = p.files;
          if (fileExists) {
            newFiles = p.files.map((f) => (f.id === activeFileId ? { ...f, code, title, updatedAt: Date.now() } : f));
          } else {
            const refProj = projectsRef.current.find((rp) => rp.id === activeProjectId);
            const refFile = refProj?.files.find((rf) => rf.id === activeFileId);
            if (refFile) {
              newFiles = [...p.files, { ...refFile, code, title, updatedAt: Date.now() }];
            }
          }
          return {
            ...p,
            updatedAt: Date.now(),
            files: newFiles,
          };
        }
        return p;
      });
      saveLocalProjects(updated);
      projectsRef.current = updated;
      return updated;
    });

    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
  }, [code, title, activeProjectId, activeFileId]);

  const lastEditTimeRef = useRef<number>(0);

  // Granular update that groups typing bursts and records atomic changes cleanly
  const updateCodeWithHistory = useCallback((newCode: string, isAtomicAction: boolean = false) => {
    const fId = activeFileIdRef.current;
    if (!fId) return;

    loadedFileIdRef.current = fId;

    const hist = fileHistoryMapRef.current[fId] || { stack: [codeRef.current || ''], index: 0 };
    const currentTopCode = hist.stack[hist.index] ?? '';

    // If identical to current top code for this file, no-op
    if (newCode === currentTopCode) return;

    setCode(newCode);
    codeRef.current = newCode;

    const now = Date.now();
    // Group rapid continuous typing within 800ms into the active snapshot
    const isTypingBurst = !isAtomicAction && (now - lastEditTimeRef.current < 800);
    lastEditTimeRef.current = now;

    let nextStack: string[];
    let nextIdx: number;

    if (isTypingBurst && hist.index > 0 && hist.index === hist.stack.length - 1) {
      // Replace top of stack with latest progress of this typing burst
      nextStack = [...hist.stack.slice(0, hist.index), newCode];
      nextIdx = hist.index;
    } else {
      // New distinct edit action (pause, paste, or atomic action like AI patch)
      nextStack = hist.stack.slice(0, hist.index + 1);
      nextStack.push(newCode);
      if (nextStack.length > 200) {
        nextStack.shift();
      }
      nextIdx = nextStack.length - 1;
    }

    fileHistoryMapRef.current[fId] = {
      stack: nextStack,
      index: nextIdx
    };

    setHistoryStack(nextStack);
    setHistoryIndex(nextIdx);

    const pId = activeProjectIdRef.current;
    if (pId) {
      setProjects((prev) => {
        const updated = prev.map((p) => {
          if (p.id === pId) {
            return {
              ...p,
              updatedAt: Date.now(),
              files: p.files.map((f) => (f.id === fId ? { ...f, code: newCode, updatedAt: Date.now() } : f)),
            };
          }
          return p;
        });
        saveLocalProjects(updated);
        projectsRef.current = updated;
        return updated;
      });
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
    }
  }, []);

  // Per-file isolated Undo: CANNOT ever touch or overwrite another file
  const handleUndo = useCallback(() => {
    lastEditTimeRef.current = 0;
    const fId = activeFileIdRef.current;
    if (!fId) return;

    const hist = fileHistoryMapRef.current[fId];
    if (!hist || hist.index <= 0) return;

    const nextIdx = hist.index - 1;
    const targetCode = hist.stack[nextIdx];

    fileHistoryMapRef.current[fId] = {
      stack: hist.stack,
      index: nextIdx
    };

    setHistoryIndex(nextIdx);
    setHistoryStack(hist.stack);

    setCode(targetCode);
    codeRef.current = targetCode;

    const pId = activeProjectIdRef.current;
    if (pId) {
      setProjects((prev) => {
        const updated = prev.map((p) => {
          if (p.id === pId) {
            return {
              ...p,
              updatedAt: Date.now(),
              files: p.files.map((f) => (f.id === fId ? { ...f, code: targetCode, updatedAt: Date.now() } : f)),
            };
          }
          return p;
        });
        saveLocalProjects(updated);
        projectsRef.current = updated;
        return updated;
      });
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
    }
  }, []);

  // Per-file isolated Redo: CANNOT ever touch or overwrite another file
  const handleRedo = useCallback(() => {
    lastEditTimeRef.current = 0;
    const fId = activeFileIdRef.current;
    if (!fId) return;

    const hist = fileHistoryMapRef.current[fId];
    if (!hist || hist.index >= hist.stack.length - 1) return;

    const nextIdx = hist.index + 1;
    const targetCode = hist.stack[nextIdx];

    fileHistoryMapRef.current[fId] = {
      stack: hist.stack,
      index: nextIdx
    };

    setHistoryIndex(nextIdx);
    setHistoryStack(hist.stack);

    setCode(targetCode);
    codeRef.current = targetCode;

    const pId = activeProjectIdRef.current;
    if (pId) {
      setProjects((prev) => {
        const updated = prev.map((p) => {
          if (p.id === pId) {
            return {
              ...p,
              updatedAt: Date.now(),
              files: p.files.map((f) => (f.id === fId ? { ...f, code: targetCode, updatedAt: Date.now() } : f)),
            };
          }
          return p;
        });
        saveLocalProjects(updated);
        projectsRef.current = updated;
        return updated;
      });
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
    }
  }, []);

  const canUndo = Boolean(
    activeFileId && fileHistoryMapRef.current[activeFileId]
      ? fileHistoryMapRef.current[activeFileId].index > 0
      : historyIndex > 0
  );
  const canRedo = Boolean(
    activeFileId && fileHistoryMapRef.current[activeFileId]
      ? fileHistoryMapRef.current[activeFileId].index < fileHistoryMapRef.current[activeFileId].stack.length - 1
      : historyIndex < historyStack.length - 1
  );

  // Commits local changes to Firebase (only called when clicking Save or exiting editor/tab)
  const commitPendingChangesToFirebase = useCallback(() => {
    if (!hasUnsavedChangesRef.current) return;

    const pId = activeProjectIdRef.current;
    const fId = activeFileIdRef.current;
    const currentTitle = titleRef.current;
    const currentCode = codeRef.current;
    const sanitizedCode = sanitizeAndRepairCode(currentCode);
    const identifiedCode = ensureStableBlockIds(sanitizedCode);
    const now = Date.now();

    const updated = projectsRef.current.map(p => {
      if (p.id === pId) {
        return {
          ...p,
          updatedAt: now,
          files: p.files.map(f => f.id === fId ? { ...f, code: identifiedCode, title: currentTitle, updatedAt: now } : f)
        };
      }
      return p;
    });

    if (identifiedCode !== currentCode) {
      setCode(identifiedCode);
      codeRef.current = identifiedCode;
    }
    setProjects(updated);
    projectsRef.current = updated;
    saveLocalProjects(updated, undefined, true);

    // Write to Firebase Firestore immediately at exit or manual save
    recordHtmlProjectsUpdate(updated, undefined, true);
    queueFirestoreSync(updated, true);

    if (pId && fId) {
      saveFileVersionSnapshot(pId, fId, currentTitle, identifiedCode);
      const targetProj = updated.find(p => p.id === pId);
      const targetFile = targetProj?.files.find(f => f.id === fId);
      if (targetProj && targetFile) {
        import('../../../lib/htmlNotesCloudSyncEngine').then(({ recordNoteSaveWithDriveOutbox }) => {
          recordNoteSaveWithDriveOutbox(pId, targetFile);
        });
      }
    }

    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
  }, []);

  // Save current file manually when clicking the Save button in the editor
  const handleSaveCurrentFile = useCallback(() => {
    if (!activeProjectId || !activeFileId) return;

    commitPendingChangesToFirebase();

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  }, [activeProjectId, activeFileId, commitPendingChangesToFirebase]);

  const checkAndSaveBeforeAction = useCallback(() => {
    commitPendingChangesToFirebase();
  }, [commitPendingChangesToFirebase]);

  // Auto-commit unsaved edits to Firebase when leaving Notes Studio tab, unmounting, or closing browser tab
  useEffect(() => {
    const handleExit = () => {
      if (hasUnsavedChangesRef.current) {
        commitPendingChangesToFirebase();
      }
    };

    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChangesRef.current) {
        commitPendingChangesToFirebase();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      // Unmount: user leaves Notes Studio project tab or navigates away
      if (hasUnsavedChangesRef.current) {
        commitPendingChangesToFirebase();
      }
      window.removeEventListener('beforeunload', handleExit);
      window.removeEventListener('pagehide', handleExit);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [commitPendingChangesToFirebase]);

  const handleOpenProject = useCallback((proj: HtmlProject) => {
    checkAndSaveBeforeAction();
    setActiveProjectId(proj.id);
    activeProjectIdRef.current = proj.id;
    if (proj.files && proj.files.length > 0) {
      const file = proj.files[0];
      setActiveFileId(file.id);
      activeFileIdRef.current = file.id;
      setTitle(file.title);
      titleRef.current = file.title;
      const fileCode = file.code || '';
      setCode(fileCode);
      codeRef.current = fileCode;
      loadedFileIdRef.current = file.id;

      if (!fileHistoryMapRef.current[file.id]) {
        fileHistoryMapRef.current[file.id] = { stack: [fileCode], index: 0 };
      }
      const hist = fileHistoryMapRef.current[file.id];
      setHistoryStack(hist.stack);
      setHistoryIndex(hist.index);
    } else {
      // Empty project: auto-create the first note
      const title = 'Note 1';
      const newFileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newFileCode = createNewNoteTemplate(title);
      const newFile: HtmlNoteItem = {
        id: newFileId,
        title,
        code: newFileCode,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const currentProjects = (projectsRef.current && projectsRef.current.length > 0) ? projectsRef.current : projects;
      const updated = currentProjects.map(p => {
        if (p.id === proj.id) {
          return { ...p, updatedAt: Date.now(), files: [newFile] };
        }
        return p;
      });
      projectsRef.current = updated;
      setProjects(updated);
      saveLocalProjects(updated, undefined, true);
      recordHtmlProjectsUpdate(updated, undefined, true);
      queueFirestoreSync(updated, true);

      setActiveFileId(newFile.id);
      activeFileIdRef.current = newFile.id;
      setTitle(title);
      titleRef.current = title;
      setCode(newFileCode);
      codeRef.current = newFileCode;
      loadedFileIdRef.current = newFile.id;
      fileHistoryMapRef.current[newFile.id] = { stack: [newFileCode], index: 0 };
      setHistoryStack([newFileCode]);
      setHistoryIndex(0);
    }
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    onSetStudioView('editor');
  }, [projects, checkAndSaveBeforeAction, onSetStudioView]);

  const handleOpenFile = useCallback((projectId: string, file: HtmlNoteItem, mode: ViewMode = 'preview') => {
    checkAndSaveBeforeAction();
    setActiveProjectId(projectId);
    activeProjectIdRef.current = projectId;
    setActiveFileId(file.id);
    activeFileIdRef.current = file.id;
    setTitle(file.title);
    titleRef.current = file.title;
    const fileCode = file.code || '';
    setCode(fileCode);
    codeRef.current = fileCode;
    loadedFileIdRef.current = file.id;

    if (!fileHistoryMapRef.current[file.id]) {
      fileHistoryMapRef.current[file.id] = { stack: [fileCode], index: 0 };
    }
    const hist = fileHistoryMapRef.current[file.id];
    setHistoryStack(hist.stack);
    setHistoryIndex(hist.index);

    setViewMode(mode);
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    onSetStudioView('editor');

    if (!fileCode) {
      import('../../../lib/htmlNotesCloudSyncEngine').then(async ({ fetchNoteContentFromDrive, isDriveConnected }) => {
        if (isDriveConnected()) {
          onShowDriveToast?.(`Fetching "${file.title}" from Google Drive...`);
          const fetched = await fetchNoteContentFromDrive(file.id);
          if (fetched) {
            setCode(fetched);
            codeRef.current = fetched;
            fileHistoryMapRef.current[file.id] = { stack: [fetched], index: 0 };
            setHistoryStack([fetched]);
            setHistoryIndex(0);
            setProjects((prev) => {
              const next = prev.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      files: p.files.map((f) => (f.id === file.id ? { ...f, code: fetched } : f)),
                    }
                  : p
              );
              saveLocalProjects(next);
              return next;
            });
            onShowDriveToast?.(`Loaded "${file.title}" from Google Drive`);
          }
        } else {
          onShowDriveToast?.('Connect Google Drive to load and edit this cloud note.');
        }
      });
    }
  }, [checkAndSaveBeforeAction, setViewMode, onSetStudioView, onShowDriveToast]);

  const handleCreateNewProject = useCallback(() => {
    const newProj: HtmlProject = {
      id: `proj_${Date.now()}`,
      name: `New Chapter ${projects.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [
        {
          id: `file_${Date.now()}`,
          title: 'Notes',
          code: createNewNoteTemplate('Notes'),
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    };
    const updated = [newProj, ...projects];
    projectsRef.current = updated;
    setProjects(updated);
    saveLocalProjects(updated);
    recordHtmlProjectsUpdate(updated);
    queueFirestoreSync(updated);

    import('../../../lib/htmlNotesCloudSyncEngine').then(({ recordNoteSaveWithDriveOutbox }) => {
      recordNoteSaveWithDriveOutbox(newProj.id, newProj.files[0]);
    });

    handleOpenProject(newProj);
  }, [projects, handleOpenProject]);

  const handleAddFileToProject = useCallback((projectId?: string) => {
    // 1. Commit and save any pending changes on the currently open file FIRST
    checkAndSaveBeforeAction();

    // 2. Fetch the most up-to-date projects list from projectsRef.current, state, or storage
    let currentProjects = (projectsRef.current && projectsRef.current.length > 0) ? projectsRef.current : projects;
    if (!currentProjects || currentProjects.length === 0) {
      currentProjects = loadLocalProjects(TEMPLATE_MATRICES);
    }

    const resolvedTargetId = (typeof projectId === 'string' && projectId.trim() !== '')
      ? projectId.trim()
      : (activeProjectIdRef.current || activeProjectId || (currentProjects.length > 0 ? currentProjects[0].id : ''));
    
    // If no project exists at all, create a new project first
    if (!resolvedTargetId || currentProjects.length === 0) {
      handleCreateNewProject();
      return;
    }

    let targetProj = currentProjects.find(p => p.id === resolvedTargetId);
    if (!targetProj && currentProjects.length > 0) {
      targetProj = currentProjects[0];
    }
    if (!targetProj) return;

    const actualProjId = targetProj.id;

    // 3. Compute unique note name & ID
    const nextNum = (targetProj.files || []).length + 1;
    const title = `Note ${nextNum}`;
    const newFileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newFileCode = createNewNoteTemplate(title);

    const newFile: HtmlNoteItem = {
      id: newFileId,
      title,
      code: newFileCode,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 4. Synchronously update BOTH ref and state with functional updater so subsequent hooks and actions see the new file
    setProjects((prevProjects) => {
      const base = (projectsRef.current && projectsRef.current.length > 0)
        ? projectsRef.current
        : ((prevProjects && prevProjects.length > 0) ? prevProjects : currentProjects);

      const next = base.map((p) => {
        if (p.id === actualProjId) {
          const files = p.files || [];
          if (files.some((f) => f.id === newFile.id)) return p;
          return {
            ...p,
            updatedAt: Date.now(),
            files: [...files, newFile]
          };
        }
        return p;
      });

      projectsRef.current = next;
      saveLocalProjects(next, undefined, true);
      recordHtmlProjectsUpdate(next, undefined, true);
      queueFirestoreSync(next, true);
      return next;
    });

    // 5. Initialize file history stack for this new file
    fileHistoryMapRef.current[newFile.id] = { stack: [newFileCode], index: 0 };
    setHistoryStack([newFileCode]);
    setHistoryIndex(0);

    // 6. Record note in cloud outbox
    import('../../../lib/htmlNotesCloudSyncEngine').then(({ recordNoteSaveWithDriveOutbox }) => {
      recordNoteSaveWithDriveOutbox(actualProjId, newFile);
    });

    // 7. Activate and switch to the newly created file directly without wiping it out
    setActiveProjectId(actualProjId);
    activeProjectIdRef.current = actualProjId;
    setActiveFileId(newFile.id);
    activeFileIdRef.current = newFile.id;
    setTitle(newFile.title);
    titleRef.current = newFile.title;
    setCode(newFileCode);
    codeRef.current = newFileCode;
    loadedFileIdRef.current = newFile.id;

    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    onSetStudioView('editor');
    onShowDriveToast?.(`Created "${title}"`);
  }, [projects, activeProjectId, checkAndSaveBeforeAction, handleCreateNewProject, onSetStudioView, onShowDriveToast]);

  const handleCreateFileFromAi = useCallback((fileTitle: string, initialCode?: string) => {
    // 1. Commit and save any pending changes on currently open file
    checkAndSaveBeforeAction();

    let currentProjects = (projectsRef.current && projectsRef.current.length > 0) ? projectsRef.current : projects;
    if (!currentProjects || currentProjects.length === 0) {
      currentProjects = loadLocalProjects(TEMPLATE_MATRICES);
    }

    const targetProjId = activeProjectIdRef.current || activeProjectId || (currentProjects.length > 0 ? currentProjects[0].id : '');
    if (!targetProjId || currentProjects.length === 0) return;

    let targetProj = currentProjects.find(p => p.id === targetProjId);
    if (!targetProj && currentProjects.length > 0) {
      targetProj = currentProjects[0];
    }
    if (!targetProj) return;

    const actualProjId = targetProj.id;
    const uniqueId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const title = fileTitle || `Note ${(targetProj.files || []).length + 1}`;
    const newCode = initialCode || createNewNoteTemplate(title);

    const newFile: HtmlNoteItem = {
      id: uniqueId,
      title,
      code: newCode,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const updated = currentProjects.map(p => {
      if (p.id === actualProjId) {
        return {
          ...p,
          updatedAt: Date.now(),
          files: [...(p.files || []), newFile]
        };
      }
      return p;
    });

    projectsRef.current = updated;
    setProjects(updated);
    saveLocalProjects(updated, undefined, true);
    recordHtmlProjectsUpdate(updated, undefined, true);
    queueFirestoreSync(updated, true);

    fileHistoryMapRef.current[newFile.id] = { stack: [newCode], index: 0 };
    setHistoryStack([newCode]);
    setHistoryIndex(0);

    import('../../../lib/htmlNotesCloudSyncEngine').then(({ recordNoteSaveWithDriveOutbox }) => {
      recordNoteSaveWithDriveOutbox(actualProjId, newFile);
    });

    setActiveProjectId(actualProjId);
    activeProjectIdRef.current = actualProjId;
    setActiveFileId(newFile.id);
    activeFileIdRef.current = newFile.id;
    setTitle(newFile.title);
    titleRef.current = newFile.title;
    setCode(newCode);
    codeRef.current = newCode;
    loadedFileIdRef.current = newFile.id;

    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    onSetStudioView('editor');
    onShowDriveToast?.(`Created "${title}"`);
  }, [projects, activeProjectId, checkAndSaveBeforeAction, onSetStudioView, onShowDriveToast]);

  const handleUpdateFileFromAi = useCallback((fileIdOrTitle: string, newContent: string) => {
    const targetProjId = activeProjectId || (projects.length > 0 ? projects[0].id : '');
    if (!targetProjId) return;

    if (activeFileId && (fileIdOrTitle === activeFileId || fileIdOrTitle.toLowerCase() === title.toLowerCase())) {
      setCode(newContent);
      setHasUnsavedChanges(true);
      return;
    }

    setProjects(prevProjects => {
      const updated = prevProjects.map(p => {
        if (p.id === targetProjId) {
          const files = p.files.map(f => {
            if (f.id === fileIdOrTitle || f.title.toLowerCase() === fileIdOrTitle.toLowerCase()) {
              return { ...f, code: newContent, updatedAt: Date.now() };
            }
            return f;
          });
          return { ...p, updatedAt: Date.now(), files };
        }
        return p;
      });
      saveLocalProjects(updated);
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
      return updated;
    });
  }, [activeProjectId, activeFileId, title, projects]);

  const handleDeleteFile = useCallback((e: React.MouseEvent, projectId: string, fileId: string) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === projectId);
    const file = proj?.files.find(f => f.id === fileId);
    setDeleteTarget({
      type: 'file',
      projectId,
      fileId,
      title: file?.title || 'this note',
    });
    setShowDeleteConfirmModal(true);
  }, [projects]);

  const handleExecuteDeleteFile = useCallback((projectId: string, fileId: string) => {
    const proj = projects.find(p => p.id === projectId);
    const file = proj?.files.find(f => f.id === fileId);
    const fileTitle = file?.title || 'Note';

    const updated = projects.map(p => {
      if (p.id === projectId) {
        const remaining = p.files.filter(f => f.id !== fileId);
        return { ...p, updatedAt: Date.now(), files: remaining };
      }
      return p;
    });
    projectsRef.current = updated;
    setProjects(updated);
    saveLocalProjects(updated);
    recordHtmlProjectsUpdate(updated);
    deleteHtmlFileFromManifest(projectId, fileId);
    queueFirestoreSync(updated);
    deleteNoteFromCloud(projectId, fileId);

    if (activeFileId === fileId) {
      const remainingProj = updated.find(p => p.id === projectId);
      if (remainingProj && remainingProj.files.length > 0) {
        handleOpenFile(projectId, remainingProj.files[0], viewMode);
      } else {
        onSetStudioView('home');
      }
    }
    onShowDriveToast?.(`Deleted note "${fileTitle}"`);
  }, [projects, activeFileId, viewMode, handleOpenFile, onSetStudioView, onShowDriveToast]);

  const handleDeleteProject = useCallback((e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    const projToDelete = projects.find(p => p.id === projectId);
    const projName = projToDelete?.name || 'this project';
    setDeleteTarget({
      type: 'project',
      projectId,
      title: projName,
    });
    setShowDeleteConfirmModal(true);
  }, [projects]);

  const handleExecuteDeleteProject = useCallback((projectId: string) => {
    const projToDelete = projects.find(p => p.id === projectId);
    const projName = projToDelete?.name || 'this project';
    const updated = projects.filter(p => p.id !== projectId);
    setProjects(updated);
    saveLocalProjects(updated);
    recordHtmlProjectsUpdate(updated);
    deleteHtmlProjectFromManifest(projectId);
    queueFirestoreSync(updated);
    deleteProjectFromCloud(projectId);

    if (activeProjectId === projectId) {
      if (updated.length > 0 && updated[0].files.length > 0) {
        handleOpenFile(updated[0].id, updated[0].files[0], viewMode);
      } else {
        onSetStudioView('home');
      }
    }
    onShowDriveToast?.(`Deleted project "${projName}"`);
  }, [projects, activeProjectId, viewMode, handleOpenFile, onSetStudioView, onShowDriveToast]);

  const toggleExpandProject = useCallback((e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  }, []);

  const handleCommitRenameProject = useCallback((projectId: string) => {
    if (!renamingProjectName.trim()) {
      setRenamingProjectId(null);
      return;
    }
    const updated = projects.map(p => p.id === projectId ? { ...p, name: renamingProjectName.trim(), updatedAt: Date.now() } : p);
    setProjects(updated);
    saveLocalProjects(updated);
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
    setRenamingProjectId(null);
  }, [renamingProjectName, projects]);

  const handleStartRenameFile = useCallback((file: HtmlNoteItem) => {
    setRenamingFileId(file.id);
    setRenamingFileTitle(file.title);
  }, []);

  const handleCommitRenameFile = useCallback((fileId: string) => {
    if (!renamingFileTitle.trim()) {
      setRenamingFileId(null);
      return;
    }
    const updated = projects.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          files: p.files.map(f => f.id === fileId ? { ...f, title: renamingFileTitle.trim() } : f)
        };
      }
      return p;
    });
    setProjects(updated);
    saveLocalProjects(updated);
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
    if (activeFileId === fileId) {
      setTitle(renamingFileTitle.trim());
    }
    setRenamingFileId(null);
  }, [renamingFileTitle, projects, activeProjectId, activeFileId]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const fileTitle = file.name.replace(/\.[^/.]+$/, '');
        setTitle(fileTitle);
        setCode(content);
        updateCodeWithHistory(content);
        onSetStudioView('editor');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [updateCodeWithHistory, onSetStudioView]);

  const handleExportHtml = useCallback(() => {
    const safeName = (title || 'note').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [title, code]);

  const handleExportFullProject = useCallback(async (targetProjectId?: string) => {
    const projId = targetProjectId || activeProjectIdRef.current;
    const project = projectsRef.current.find(p => p.id === projId) || projectsRef.current[0];
    if (!project) {
      if (onShowDriveToast) onShowDriveToast('No active project found to download');
      return;
    }

    try {
      const zip = new JSZip();
      const folderName = (project.name || 'project').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'project';
      const rootFolder = zip.folder(folderName) || zip;

      const nameCounts: Record<string, number> = {};
      const filesToExport = project.files.length > 0 ? project.files : [
        {
          id: 'default',
          title: titleRef.current || 'index',
          code: codeRef.current || '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      filesToExport.forEach((file) => {
        let baseName = (file.title || 'untitled').replace(/[/\\?%*:|"<>]/g, '_').trim();
        if (!baseName) baseName = 'note';

        if (nameCounts[baseName] !== undefined) {
          nameCounts[baseName]++;
          baseName = `${baseName}_(${nameCounts[baseName]})`;
        } else {
          nameCounts[baseName] = 1;
        }

        const fileName = `${baseName}.html`;
        // If this is currently active file being edited, use freshest in-memory code
        const fileContent = (file.id === activeFileIdRef.current) ? codeRef.current : (file.code || '');
        rootFolder.file(fileName, fileContent);
      });

      // Include a README.md summary in the project root
      const fileList = filesToExport.map((f, i) => `${i + 1}. ${f.title}.html`).join('\n');
      const readme = `# ${project.name}\n\nExported from Notes Studio on ${new Date().toLocaleString()}\nTotal Files: ${filesToExport.length}\n\n## Included Files:\n${fileList}\n`;
      rootFolder.file('README.md', readme);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (onShowDriveToast) {
        onShowDriveToast(`Downloaded full project "${project.name}" (${filesToExport.length} files)`);
      }
    } catch (err) {
      console.error('Error generating full project zip:', err);
      if (onShowDriveToast) {
        onShowDriveToast('Failed to download project zip');
      }
    }
  }, [onShowDriveToast]);

  return {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    activeFileId,
    setActiveFileId,
    expandedProjects,
    toggleExpandProject,
    code,
    setCode,
    title,
    setTitle,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    savedSuccess,
    historyStack,
    historyIndex,
    canUndo,
    canRedo,
    updateCodeWithHistory,
    handleUndo,
    handleRedo,
    handleSaveCurrentFile,
    checkAndSaveBeforeAction,
    handleOpenProject,
    handleOpenFile,
    handleCreateNewProject,
    handleAddFileToProject,
    handleCreateFileFromAi,
    handleUpdateFileFromAi,
    handleDeleteFile,
    handleExecuteDeleteFile,
    handleDeleteProject,
    handleExecuteDeleteProject,
    renamingProjectId,
    setRenamingProjectId,
    renamingProjectName,
    setRenamingProjectName,
    handleCommitRenameProject,
    renamingFileId,
    setRenamingFileId,
    renamingFileTitle,
    setRenamingFileTitle,
    handleStartRenameFile,
    handleCommitRenameFile,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    deleteTarget,
    setDeleteTarget,
    handleImportFile,
    handleExportHtml,
    handleExportFullProject
  };
}
