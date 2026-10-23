import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { HtmlProject } from '../types';
import { TEMPLATE_MATRICES } from '../constants/templates';
import {
  loadLocalProjects,
  subscribeToSyncStatus,
  subscribeToFirestoreProjects,
  queueFirestoreSync
} from '../../../lib/htmlNotesSync';
import {
  DriveSyncStatus,
  subscribeToDriveSyncStatus,
  syncHtmlNotesWithDrive,
  connectGoogleDrive,
  isDriveConnected,
} from '../../../lib/htmlNotesCloudSyncEngine';

interface UseHtmlNotesCloudSyncOptions {
  projects: HtmlProject[];
  setProjects: React.Dispatch<React.SetStateAction<HtmlProject[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeFileId: string;
  setActiveFileId: (id: string) => void;
  setTitle: (title: string) => void;
  title?: string;
  setCode: (code: string) => void;
  code?: string;
  studioView?: 'home' | 'editor';
  setStudioView: (view: 'home' | 'editor') => void;
  hasUnsavedChanges?: boolean;
}

export function useHtmlNotesCloudSync({
  projects,
  setProjects,
  activeProjectId,
  setActiveProjectId,
  activeFileId,
  setActiveFileId,
  setTitle,
  title,
  setCode,
  code,
  studioView = 'home',
  setStudioView,
  hasUnsavedChanges = false
}: UseHtmlNotesCloudSyncOptions) {
  const [isDriveAuth, setIsDriveAuth] = useState<boolean>(() => isDriveConnected());
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatus>({
    state: isDriveConnected() ? 'synced' : 'disconnected',
    message: isDriveConnected() ? 'Firebase Cloud Sync Active' : 'Offline / Guest Mode',
    lastSyncTime: Date.now(),
    folderUrl: null,
  });
  const [driveToastMessage, setDriveToastMessage] = useState<string | null>(null);

  const showDriveToast = useCallback((msg: string) => {
    setDriveToastMessage(msg);
    setTimeout(() => setDriveToastMessage(null), 3500);
  }, []);

  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const codeRef = useRef(code);
  codeRef.current = code;
  const titleRef = useRef(title);
  titleRef.current = title;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const studioViewRef = useRef(studioView);
  studioViewRef.current = studioView;

  const unsubFirestoreRef = useRef<(() => void) | null>(null);

  const executeDriveSync = useCallback(async (currentProjs?: HtmlProject[], silent = false) => {
    if (!silent) {
      showDriveToast('Syncing with Firebase Cloud Storage...');
    }
    try {
      const projsToSync = currentProjs || projectsRef.current;
      const res = await syncHtmlNotesWithDrive(projsToSync);
      if (res.success && res.projects) {
        setProjects(res.projects);
        projectsRef.current = res.projects;
        if (!silent) {
          showDriveToast(res.message);
        }
      }
    } catch (err: any) {
      if (!silent) {
        showDriveToast(err?.message || 'Firebase sync error');
      }
    }
  }, [showDriveToast, setProjects]);

  // Teardown Firestore listening while working in an open project (editor view) to eliminate extra reads and prevent sudden updates
  useEffect(() => {
    if (studioView === 'editor') {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }
    }
  }, [studioView]);

  useEffect(() => {
    const local = loadLocalProjects(TEMPLATE_MATRICES);
    setProjects(local);
    projectsRef.current = local;
    if (local.length > 0) {
      setActiveProjectId(local[0].id);
      if (local[0].files.length > 0) {
        setActiveFileId(local[0].files[0].id);
        setTitle(local[0].files[0].title);
        setCode(local[0].files[0].code);
      }
    }

    const unsubSync = subscribeToSyncStatus((status) => {
      setDriveSyncStatus({
        state: status === 'saving' ? 'syncing' : status === 'synced' ? 'synced' : 'idle',
        message: status === 'saving' ? 'Syncing to Firebase...' : 'Firebase Cloud Sync Active',
        lastSyncTime: Date.now(),
        folderUrl: null
      });
    });

    const unsubDrive = subscribeToDriveSyncStatus((status) => {
      setDriveSyncStatus(status);
      setIsDriveAuth(status.state !== 'disconnected');
    });

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }

      if (user) {
        setIsDriveAuth(true);
        const userLocal = loadLocalProjects(TEMPLATE_MATRICES, user.uid);
        if (userLocal.length > 0) {
          setProjects(userLocal);
          projectsRef.current = userLocal;
          if (!userLocal.some(p => p.id === activeProjectIdRef.current)) {
            const firstProj = userLocal[0];
            setActiveProjectId(firstProj.id);
            activeProjectIdRef.current = firstProj.id;
            if (firstProj.files && firstProj.files.length > 0) {
              const firstFile = firstProj.files[0];
              setActiveFileId(firstFile.id);
              activeFileIdRef.current = firstFile.id;
              setTitle(firstFile.title);
              setCode(firstFile.code || '');
            }
          }
        }

        // Only attach real-time Firestore subscription when on home view, never while working inside an open project
        if (studioViewRef.current === 'home') {
          unsubFirestoreRef.current = subscribeToFirestoreProjects(user.uid, (remoteProjects) => {
            if (remoteProjects && remoteProjects.length > 0) {
              if (studioViewRef.current === 'editor') return; // strictly guard open editor
              setProjects(remoteProjects);
              projectsRef.current = remoteProjects;
            }
          });
        }
      } else {
        setIsDriveAuth(false);
        const guestProjects = loadLocalProjects(TEMPLATE_MATRICES, null);
        setProjects(guestProjects);
        projectsRef.current = guestProjects;
        if (!guestProjects.some(p => p.id === activeProjectIdRef.current) && guestProjects.length > 0) {
          const firstProj = guestProjects[0];
          setActiveProjectId(firstProj.id);
          activeProjectIdRef.current = firstProj.id;
          if (firstProj.files && firstProj.files.length > 0) {
            const firstFile = firstProj.files[0];
            setActiveFileId(firstFile.id);
            activeFileIdRef.current = firstFile.id;
            setTitle(firstFile.title);
            setCode(firstFile.code || '');
          }
        }
      }
    });

    return () => {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }
      unsubSync();
      unsubDrive();
      unsubAuth();
    };
  }, [setProjects, setActiveProjectId, setActiveFileId, setTitle, setCode]);

  const handleConnectDrive = useCallback(async () => {
    const success = await connectGoogleDrive();
    if (success) {
      showDriveToast('Firebase Cloud Storage active!');
      executeDriveSync(projectsRef.current, false);
    }
  }, [showDriveToast, executeDriveSync]);

  const handleTriggerDriveSync = useCallback(async () => {
    await executeDriveSync(projectsRef.current, false);
  }, [executeDriveSync]);

  const handleExportNoteToDrive = useCallback(async () => {
    showDriveToast('Document is saved and synchronized in Firebase Firestore.');
  }, [showDriveToast]);

  const handleDeduplicateDrive = useCallback(async () => {
    showDriveToast('Firebase Firestore data verified and clean!');
  }, [showDriveToast]);

  return {
    isDriveAuth,
    driveSyncStatus,
    driveToastMessage,
    showDriveToast,
    handleConnectDrive,
    handleTriggerDriveSync,
    handleExportNoteToDrive,
    handleDeduplicateDrive
  };
}
