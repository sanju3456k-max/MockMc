/**
 * ============================================================================
 * NOTES MANIFEST COORDINATOR / SMART CACHE-ASIDE ENGINE
 * ============================================================================
 * 
 * Top-level Firestore collection: `/notes_manifests/{userId}`
 * 
 * Authoritative, zero-cost cross-device synchronization engine for:
 * 1. HTML Notes Studio (Projects, Files, Drive Folders/Files, Tombstones)
 * 2. Revision Notes Studio (Simple Notes, Tags, Drive links, Tombstones)
 * 
 * Performance & Quota Optimization Guarantees:
 * - Single Real-Time Snapshot Listener per user session (0 duplicate listeners).
 * - Guarded by smartCoordinator.shouldAttachLiveListener() (0 reads when offline/quota capped).
 * - Checksum Fingerprint Verification (0 re-renders / 0 processing on identical payloads).
 * - Debounced Write Coalescing (1.2s batching, 0 redundant writes when content checksum matches).
 * - Multi-Device Tombstone Synchronization (Deleted projects/notes propagate instantly and never resurrect).
 */

import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db, isGlobalQuotaExceeded, setGlobalQuotaExceeded } from './firebase';
import { isOfflineLocalOnlyMode, safeSetItem } from './storage';
import { smartCoordinator, computeEntityChecksum } from './smartLocalCoordinator';
import { 
  type HtmlProject, 
  type HtmlNoteItem, 
  loadLocalProjects, 
  saveLocalProjects,
  sanitizeAndRepairCode 
} from './htmlNotesSync';
import { 
  getAllNotesFromIDB, 
  saveAllNotesToIDB, 
  getDeletedTombstones, 
  addDeletedTombstone 
} from './idbNotes';
import type { UserNoteItem } from '../components/DriveFileManager';

export interface ManifestHtmlFile {
  id: string;
  title: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveSyncStatus?: 'synced' | 'pending_device_upload' | 'local_only';
  pendingDeviceId?: string;
  updatedAt: number;
  createdAt?: number;
  tags?: string[];
  size?: number;
}

export interface ManifestHtmlProject {
  id: string;
  name: string;
  description?: string;
  driveFolderId?: string;
  createdAt: number;
  updatedAt: number;
  files: ManifestHtmlFile[];
}

export interface ManifestSimpleNote {
  id: string;
  testId: string;
  attemptId?: string;
  questionNumber?: number;
  content: string;
  tag: 'trick' | 'formula' | 'mistake' | 'general' | 'table';
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'file';
  createdAt: string;
  driveFileId?: string;
  driveWebViewLink?: string;
}

export interface UserNotesManifestDoc {
  userId: string;
  userEmail?: string;
  updatedAt: number;
  htmlNotes: {
    version: number;
    updatedAt: number;
    driveRootFolderId?: string;
    projects: ManifestHtmlProject[];
    deletedProjectIds: string[];
    deletedFileIds: string[];
  };
  simpleNotes: {
    version: number;
    updatedAt: number;
    notes: ManifestSimpleNote[];
    deletedNoteIds: string[];
  };
}

const LOCAL_STORAGE_MANIFEST_KEY = 'mockmc_notes_manifest_doc_v1';
const DELETED_PROJECTS_KEY = 'mockmc_deleted_projects_tombstones';
const DELETED_FILES_KEY = 'mockmc_deleted_files_tombstones';

// In-Memory L1 Cache
let cachedManifestDoc: UserNotesManifestDoc | null = null;
let lastKnownRemoteHash: string = '';
let lastSavedHash: string = '';
let activeSnapshotUnsubscribe: Unsubscribe | null = null;
let activeListeningUserId: string | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// UI Event Subscribers
type HtmlNotesListener = (projects: HtmlProject[], deletedProjectIds: string[], deletedFileIds: string[]) => void;
type SimpleNotesListener = (notes: UserNoteItem[], deletedNoteIds: string[]) => void;
type SyncStatusListener = (status: 'synced' | 'saving' | 'offline' | 'local_only') => void;

let htmlSubscribers: HtmlNotesListener[] = [];
let simpleSubscribers: SimpleNotesListener[] = [];
let statusSubscribers: SyncStatusListener[] = [];

function notifySyncStatus(status: 'synced' | 'saving' | 'offline' | 'local_only') {
  statusSubscribers.forEach((fn) => {
    try {
      fn(status);
    } catch {}
  });
}

export function subscribeNotesSyncStatus(listener: SyncStatusListener): () => void {
  statusSubscribers.push(listener);
  return () => {
    statusSubscribers = statusSubscribers.filter((l) => l !== listener);
  };
}

export function subscribeHtmlNotesUpdates(listener: HtmlNotesListener): () => void {
  htmlSubscribers.push(listener);
  return () => {
    htmlSubscribers = htmlSubscribers.filter((l) => l !== listener);
  };
}

export function subscribeSimpleNotesUpdates(listener: SimpleNotesListener): () => void {
  simpleSubscribers.push(listener);
  return () => {
    simpleSubscribers = simpleSubscribers.filter((l) => l !== listener);
  };
}

// ==========================================
// Persistent Tombstone Storage Helpers
// ==========================================

export function getDeletedProjectTombstones(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const stored = localStorage.getItem(DELETED_PROJECTS_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function addDeletedProjectTombstone(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedProjectTombstones();
    set.add(id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DELETED_PROJECTS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

export function getDeletedFileTombstones(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const stored = localStorage.getItem(DELETED_FILES_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function addDeletedFileTombstone(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedFileTombstones();
    set.add(id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DELETED_FILES_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

// ==========================================
// L1/L2 Cache Helpers
// ==========================================

function getLocalCachedManifest(): UserNotesManifestDoc | null {
  if (cachedManifestDoc) return cachedManifestDoc;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_MANIFEST_KEY);
      if (stored) {
        cachedManifestDoc = JSON.parse(stored);
        return cachedManifestDoc;
      }
    }
  } catch {}
  return null;
}

function setLocalCachedManifest(docData: UserNotesManifestDoc): void {
  cachedManifestDoc = docData;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_MANIFEST_KEY, JSON.stringify(docData));
    }
  } catch {
    safeSetItem(LOCAL_STORAGE_MANIFEST_KEY, JSON.stringify(docData), docData.userId);
  }
}

/**
 * Recursively strips undefined fields to prevent Firestore setDoc invalid data errors
 */
function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = removeUndefinedFields(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Fast deterministic FNV-1a checksum of the manifest document
 */
export function computeManifestDocChecksum(docData: UserNotesManifestDoc): string {
  try {
    return computeEntityChecksum({
      u: docData.userId,
      hp: (docData.htmlNotes?.projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        up: p.updatedAt,
        df: p.driveFolderId || '',
        f: (p.files || []).map((f) => `${f.id}:${f.title}:${f.updatedAt}:${f.driveFileId || ''}:${f.driveSyncStatus || ''}`).join(','),
      })),
      hdp: docData.htmlNotes?.deletedProjectIds || [],
      hdf: docData.htmlNotes?.deletedFileIds || [],
      sn: (docData.simpleNotes?.notes || []).map((n) => `${n.id}:${n.createdAt}:${n.tag}:${n.driveFileId || ''}:${computeEntityChecksum(n.content || '')}`),
      sdn: docData.simpleNotes?.deletedNoteIds || [],
    });
  } catch {
    return String(Date.now());
  }
}

/**
 * Builds a default empty manifest doc for a user
 */
function createDefaultManifestDoc(userId: string, userEmail?: string): UserNotesManifestDoc {
  return {
    userId,
    userEmail: userEmail || '',
    updatedAt: Date.now(),
    htmlNotes: {
      version: 1,
      updatedAt: Date.now(),
      projects: [],
      deletedProjectIds: Array.from(getDeletedProjectTombstones()),
      deletedFileIds: Array.from(getDeletedFileTombstones()),
    },
    simpleNotes: {
      version: 1,
      updatedAt: Date.now(),
      notes: [],
      deletedNoteIds: Array.from(getDeletedTombstones()),
    },
  };
}

// ==========================================
// Real-Time Snapshot Synchronization Engine
// ==========================================

/**
 * Attaches the single optimized Firestore onSnapshot listener to `/notes_manifests/{userId}`.
 * Only attaches if smartCoordinator confirms network and quota readiness.
 */
export function attachNotesManifestListener(userId: string, userEmail?: string): () => void {
  if (!userId || userId === 'anonymous' || userId === 'guest-user') {
    return () => {};
  }

  // If already listening to this exact user, don't duplicate listener
  if (activeListeningUserId === userId && activeSnapshotUnsubscribe) {
    return () => {};
  }

  // Detach any previous user's listener
  if (activeSnapshotUnsubscribe) {
    activeSnapshotUnsubscribe();
    activeSnapshotUnsubscribe = null;
    activeListeningUserId = null;
  }

  // Pre-hydrate immediately from L1/L2 local cache (0ms UI latency)
  const cached = getLocalCachedManifest();
  if (cached && cached.userId === userId) {
    lastKnownRemoteHash = computeManifestDocChecksum(cached);
  }

  // Check quota / offline mode gatekeeper
  if (!smartCoordinator.shouldAttachLiveListener() || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) {
    notifySyncStatus('local_only');
    return () => {};
  }

  try {
    const docRef = doc(db, 'notes_manifests', userId);
    activeListeningUserId = userId;

    const unsub = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      async (snapshot) => {
        // If snapshot originated from local write and is pending commit, skip duplicate reprocessing
        if (snapshot.metadata.hasPendingWrites) {
          notifySyncStatus('saving');
          return;
        }

        if (!snapshot.exists()) {
          // Document does not exist yet on remote Firestore: perform initial migration from local storage
          await bootstrapInitialManifestDoc(userId, userEmail);
          notifySyncStatus('synced');
          return;
        }

        const remoteData = snapshot.data() as UserNotesManifestDoc;
        if (!remoteData) return;

        const remoteChecksum = computeManifestDocChecksum(remoteData);

        // Smart Checksum Guard: If identical to local, discard with 0 UI re-renders
        if (remoteChecksum === lastKnownRemoteHash) {
          notifySyncStatus('synced');
          return;
        }

        lastKnownRemoteHash = remoteChecksum;
        lastSavedHash = remoteChecksum;
        setLocalCachedManifest(remoteData);

        // Ingest Tomstones from Remote into Local Persistent Storage
        if (Array.isArray(remoteData.htmlNotes?.deletedProjectIds)) {
          remoteData.htmlNotes.deletedProjectIds.forEach((pid) => addDeletedProjectTombstone(pid));
        }
        if (Array.isArray(remoteData.htmlNotes?.deletedFileIds)) {
          remoteData.htmlNotes.deletedFileIds.forEach((fid) => addDeletedFileTombstone(fid));
        }
        if (Array.isArray(remoteData.simpleNotes?.deletedNoteIds)) {
          remoteData.simpleNotes.deletedNoteIds.forEach((nid) => addDeletedTombstone(nid));
        }

        // 1. Reconcile HTML Notes Projects with Local Storage
        const localProjects = loadLocalProjects();
        const deletedProjects = getDeletedProjectTombstones();
        const deletedFiles = getDeletedFileTombstones();

        const remoteHtmlProjects = (remoteData.htmlNotes?.projects || []).filter(
          (rp) => rp && !deletedProjects.has(rp.id)
        );

        // Merge remote projects with local project file codes so typing code is not lost
        const mergedHtmlProjects: HtmlProject[] = remoteHtmlProjects.map((rp) => {
          const localProj = localProjects.find((lp) => lp.id === rp.id);
          const filteredFiles = (rp.files || []).filter((rf) => !deletedFiles.has(rf.id));

          const projectFiles = filteredFiles.map((rf) => {
            const localFile = localProj?.files.find((lf) => lf.id === rf.id);
            return {
              id: rf.id,
              title: rf.title,
              code: localFile?.code || '',
              createdAt: rf.createdAt || Date.now(),
              updatedAt: rf.updatedAt || Date.now(),
              tags: rf.tags || [],
              driveFileId: rf.driveFileId,
              driveWebViewLink: rf.driveWebViewLink,
              driveSyncStatus: rf.driveSyncStatus || (rf.driveFileId ? 'synced' : 'local_only'),
              pendingDeviceId: rf.pendingDeviceId,
            };
          });

          // Retain local-only files inside this project that are absent on remote and not deleted
          if (localProj && Array.isArray(localProj.files)) {
            localProj.files.forEach((lf) => {
              if (!deletedFiles.has(lf.id) && !projectFiles.some((pf) => pf.id === lf.id)) {
                projectFiles.push({
                  id: lf.id,
                  title: lf.title,
                  code: lf.code || '',
                  createdAt: lf.createdAt || Date.now(),
                  updatedAt: lf.updatedAt || Date.now(),
                  tags: lf.tags || [],
                  driveFileId: lf.driveFileId,
                  driveWebViewLink: lf.driveWebViewLink,
                  driveSyncStatus: lf.driveSyncStatus || (lf.driveFileId ? 'synced' : 'local_only'),
                  pendingDeviceId: lf.pendingDeviceId,
                });
              }
            });
          }

          return {
            id: rp.id,
            name: rp.name,
            description: rp.description || localProj?.description || '',
            createdAt: rp.createdAt || localProj?.createdAt || Date.now(),
            updatedAt: rp.updatedAt || localProj?.updatedAt || Date.now(),
            files: projectFiles,
          };
        });

        // Add any strictly local-only projects that have not been deleted
        localProjects.forEach((lp) => {
          if (!deletedProjects.has(lp.id) && !mergedHtmlProjects.some((mp) => mp.id === lp.id)) {
            mergedHtmlProjects.push(lp);
          }
        });

        saveLocalProjects(mergedHtmlProjects);

        // 2. Reconcile Simple Notes with Local IndexedDB
        let mergedSimpleNotes: UserNoteItem[] = [];
        try {
          const localNotes = await getAllNotesFromIDB();
          const deletedSimple = getDeletedTombstones();

          const remoteSimpleNotes: UserNoteItem[] = (remoteData.simpleNotes?.notes || [])
            .filter((rn) => rn && !deletedSimple.has(rn.id))
            .map((rn) => {
              const localMatch = localNotes.find((ln) => ln.id === rn.id);
              return {
                ...localMatch,
                id: rn.id,
                testId: rn.testId,
                attemptId: rn.attemptId,
                questionNumber: rn.questionNumber,
                content: rn.content,
                tag: rn.tag,
                fileName: rn.fileName || localMatch?.fileName,
                fileType: rn.fileType || localMatch?.fileType,
                fileUrl: localMatch?.fileUrl,
                createdAt: rn.createdAt,
                driveFileId: rn.driveFileId || localMatch?.driveFileId,
                driveWebViewLink: rn.driveWebViewLink || localMatch?.driveWebViewLink,
              };
            });

          // Retain local notes not on remote and not deleted
          localNotes.forEach((ln) => {
            if (!deletedSimple.has(ln.id) && !remoteSimpleNotes.some((rn) => rn.id === ln.id)) {
              remoteSimpleNotes.push(ln);
            }
          });

          mergedSimpleNotes = remoteSimpleNotes;
          saveAllNotesToIDB(mergedSimpleNotes, true);
        } catch (e) {
          console.warn('Simple notes reconciliation warning:', e);
        }

        // Notify UI subscribers
        htmlSubscribers.forEach((fn) => {
          try {
            fn(mergedHtmlProjects, Array.from(deletedProjects), Array.from(deletedFiles));
          } catch {}
        });

        if (mergedSimpleNotes.length > 0) {
          simpleSubscribers.forEach((fn) => {
            try {
              fn(mergedSimpleNotes, Array.from(getDeletedTombstones()));
            } catch {}
          });
        }

        notifySyncStatus('synced');
      },
      (err) => {
        console.warn('Notes manifest listener warning:', err);
        notifySyncStatus('offline');
      }
    );

    activeSnapshotUnsubscribe = unsub;
    return () => {
      if (activeSnapshotUnsubscribe === unsub) {
        unsub();
        activeSnapshotUnsubscribe = null;
        activeListeningUserId = null;
      }
    };
  } catch (err) {
    console.warn('Failed to attach notes manifest listener:', err);
    notifySyncStatus('local_only');
    return () => {};
  }
}

// ==========================================
// Bootstrap & Migration Engine
// ==========================================

async function bootstrapInitialManifestDoc(userId: string, userEmail?: string): Promise<UserNotesManifestDoc> {
  const localProjects = loadLocalProjects();
  let localNotes: UserNoteItem[] = [];
  try {
    localNotes = await getAllNotesFromIDB();
  } catch {}

  const deletedProjects = Array.from(getDeletedProjectTombstones());
  const deletedFiles = Array.from(getDeletedFileTombstones());
  const deletedNotes = Array.from(getDeletedTombstones());

  // Check legacy docs for seamless backward migration
  let legacyProjects = localProjects;
  try {
    const legacyDocRef = doc(db, 'users', userId, 'notes_data', 'projects');
    const legacySnap = await getDoc(legacyDocRef);
    if (legacySnap.exists()) {
      const data = legacySnap.data();
      if (data && Array.isArray(data.projects) && data.projects.length > 0) {
        legacyProjects = data.projects;
      }
    }
  } catch {}

  const manifest: UserNotesManifestDoc = {
    userId,
    userEmail: userEmail || auth.currentUser?.email || '',
    updatedAt: Date.now(),
    htmlNotes: {
      version: 1,
      updatedAt: Date.now(),
      projects: legacyProjects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now(),
        files: (p.files || []).map((f) => ({
          id: f.id,
          title: f.title,
          createdAt: f.createdAt || Date.now(),
          updatedAt: f.updatedAt || Date.now(),
          tags: f.tags || [],
          driveFileId: f.driveFileId,
          driveWebViewLink: f.driveWebViewLink,
          driveSyncStatus: f.driveSyncStatus || (f.driveFileId ? 'synced' : 'local_only'),
          pendingDeviceId: f.pendingDeviceId,
        })),
      })),
      deletedProjectIds: deletedProjects,
      deletedFileIds: deletedFiles,
    },
    simpleNotes: {
      version: 1,
      updatedAt: Date.now(),
      notes: localNotes.map((n) => ({
        id: n.id,
        testId: n.testId,
        attemptId: n.attemptId,
        questionNumber: n.questionNumber,
        content: n.content,
        tag: n.tag,
        fileName: n.fileName,
        fileType: n.fileType,
        createdAt: n.createdAt,
        driveFileId: n.driveFileId,
        driveWebViewLink: n.driveWebViewLink,
      })),
      deletedNoteIds: deletedNotes,
    },
  };

  setLocalCachedManifest(manifest);
  queueSaveNotesManifest(manifest, true);
  return manifest;
}

// ==========================================
// Debounced Write Queue with Checksum Guard
// ==========================================

export async function queueSaveNotesManifest(
  manifest: UserNotesManifestDoc,
  immediate = false
): Promise<boolean> {
  setLocalCachedManifest(manifest);

  const userId = manifest.userId || auth.currentUser?.uid;
  if (!userId || userId === 'anonymous' || userId === 'guest-user') {
    return true; // Local only
  }

  const currentChecksum = computeManifestDocChecksum(manifest);
  if (currentChecksum === lastSavedHash) {
    // 0 Redundant Writes!
    notifySyncStatus('synced');
    return true;
  }

  notifySyncStatus('saving');

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  const executeWrite = async () => {
    if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) {
      notifySyncStatus('local_only');
      return;
    }

    try {
      const docRef = doc(db, 'notes_manifests', userId);
      const cleanedManifest = removeUndefinedFields(manifest);
      await setDoc(docRef, cleanedManifest, { merge: true });
      lastSavedHash = currentChecksum;
      lastKnownRemoteHash = currentChecksum;
      notifySyncStatus('synced');
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('quota') || err?.message?.includes('EXCEEDED')) {
        setGlobalQuotaExceeded(true);
        console.warn('Firestore quota exhausted; operating in persistent local-first storage mode.');
      } else if (err?.code === 'permission-denied' || err?.message?.includes('permissions')) {
        console.debug('Notes manifest saved locally (Firestore remote sync unauthenticated)');
      } else {
        console.warn('Firestore notes manifest sync notice (persisted locally):', err);
      }
      notifySyncStatus('local_only');
    }
  };

  if (immediate) {
    await executeWrite();
    return true;
  }

  saveDebounceTimer = setTimeout(() => {
    executeWrite();
  }, 1200);

  return true;
}

// ==========================================
// High-Level Domain Mutation Methods
// ==========================================

/**
 * Records an update to HTML notes projects, updating the manifest and queuing write
 */
export function recordHtmlProjectsUpdate(
  projects: HtmlProject[],
  driveRootFolderId?: string,
  immediate: boolean = false
): Promise<boolean> {
  saveLocalProjects(projects);

  const currentDoc = getLocalCachedManifest() || createDefaultManifestDoc(auth.currentUser?.uid || 'guest');
  const deletedProjects = Array.from(getDeletedProjectTombstones());
  const deletedFiles = Array.from(getDeletedFileTombstones());

  const updatedDoc: UserNotesManifestDoc = {
    ...currentDoc,
    userId: auth.currentUser?.uid || currentDoc.userId,
    userEmail: auth.currentUser?.email || currentDoc.userEmail,
    updatedAt: Date.now(),
    htmlNotes: {
      ...currentDoc.htmlNotes,
      updatedAt: Date.now(),
      driveRootFolderId: driveRootFolderId || currentDoc.htmlNotes?.driveRootFolderId || '',
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        files: p.files.map((f) => ({
          id: f.id,
          title: f.title,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          tags: f.tags || [],
          driveFileId: f.driveFileId,
          driveWebViewLink: f.driveWebViewLink,
          driveSyncStatus: f.driveSyncStatus || (f.driveFileId ? 'synced' : 'local_only'),
          pendingDeviceId: f.pendingDeviceId,
        })),
      })),
      deletedProjectIds: deletedProjects,
      deletedFileIds: deletedFiles,
    },
  };

  return queueSaveNotesManifest(updatedDoc, immediate);
}

/**
 * Flush and synchronize HTML notes projects to Firebase immediately (used on manual save or exit)
 */
export function syncHtmlProjectsToFirebase(
  projects: HtmlProject[],
  immediate: boolean = true
): Promise<boolean> {
  return recordHtmlProjectsUpdate(projects, undefined, immediate);
}

/**
 * Safely deletes an HTML project across devices:
 * Adds tombstone, updates local storage, and pushes to Firestore manifest
 */
export function deleteHtmlProjectFromManifest(projectId: string): void {
  if (!projectId) return;

  addDeletedProjectTombstone(projectId);
  const currentProjects = loadLocalProjects().filter((p) => p.id !== projectId);
  saveLocalProjects(currentProjects);

  const currentDoc = getLocalCachedManifest() || createDefaultManifestDoc(auth.currentUser?.uid || 'guest');
  const deletedProjects = Array.from(getDeletedProjectTombstones());
  const existingProjects = currentDoc.htmlNotes?.projects || [];

  const updatedDoc: UserNotesManifestDoc = {
    ...currentDoc,
    updatedAt: Date.now(),
    htmlNotes: {
      version: 1,
      ...currentDoc.htmlNotes,
      updatedAt: Date.now(),
      projects: existingProjects.filter((p) => p.id !== projectId),
      deletedProjectIds: deletedProjects,
    },
  };

  queueSaveNotesManifest(updatedDoc, true);
}

/**
 * Safely deletes an HTML note file across devices:
 * Adds tombstone, updates project in local storage, and pushes to Firestore manifest
 */
export function deleteHtmlFileFromManifest(projectId: string, fileId: string): void {
  if (!fileId) return;

  addDeletedFileTombstone(fileId);
  const currentProjects = loadLocalProjects().map((p) => {
    if (p.id === projectId) {
      return {
        ...p,
        updatedAt: Date.now(),
        files: p.files.filter((f) => f.id !== fileId),
      };
    }
    return p;
  });
  saveLocalProjects(currentProjects);

  const currentDoc = getLocalCachedManifest() || createDefaultManifestDoc(auth.currentUser?.uid || 'guest');
  const deletedFiles = Array.from(getDeletedFileTombstones());
  const existingProjects = currentDoc.htmlNotes?.projects || [];

  const updatedDoc: UserNotesManifestDoc = {
    ...currentDoc,
    updatedAt: Date.now(),
    htmlNotes: {
      version: 1,
      ...currentDoc.htmlNotes,
      updatedAt: Date.now(),
      projects: existingProjects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            updatedAt: Date.now(),
            files: (p.files || []).filter((f) => f.id !== fileId),
          };
        }
        return p;
      }),
      deletedFileIds: deletedFiles,
    },
  };

  queueSaveNotesManifest(updatedDoc, true);
}

/**
 * Records an update to Simple Revision Notes, updating the manifest and queuing write
 */
export function recordSimpleNotesUpdate(notes: UserNoteItem[]): void {
  saveAllNotesToIDB(notes, true);

  const currentDoc = getLocalCachedManifest() || createDefaultManifestDoc(auth.currentUser?.uid || 'guest');
  const deletedNotes = Array.from(getDeletedTombstones());

  const updatedDoc: UserNotesManifestDoc = {
    ...currentDoc,
    userId: auth.currentUser?.uid || currentDoc.userId,
    userEmail: auth.currentUser?.email || currentDoc.userEmail,
    updatedAt: Date.now(),
    simpleNotes: {
      version: 1,
      ...currentDoc.simpleNotes,
      updatedAt: Date.now(),
      notes: notes.map((n) => ({
        id: n.id,
        testId: n.testId,
        attemptId: n.attemptId,
        questionNumber: n.questionNumber,
        content: n.content,
        tag: n.tag,
        fileName: n.fileName,
        fileType: n.fileType,
        createdAt: n.createdAt,
        driveFileId: n.driveFileId,
        driveWebViewLink: n.driveWebViewLink,
      })),
      deletedNoteIds: deletedNotes,
    },
  };

  queueSaveNotesManifest(updatedDoc);
}

/**
 * Safely deletes a simple revision note across devices:
 * Adds tombstone, removes from IndexedDB, and pushes to Firestore manifest
 */
export function deleteSimpleNoteFromManifest(noteId: string): void {
  if (!noteId) return;

  addDeletedTombstone(noteId);
  const currentDoc = getLocalCachedManifest() || createDefaultManifestDoc(auth.currentUser?.uid || 'guest');
  const deletedNotes = Array.from(getDeletedTombstones());
  const existingNotes = currentDoc.simpleNotes?.notes || [];

  const updatedDoc: UserNotesManifestDoc = {
    ...currentDoc,
    updatedAt: Date.now(),
    simpleNotes: {
      version: 1,
      ...currentDoc.simpleNotes,
      updatedAt: Date.now(),
      notes: existingNotes.filter((n) => n.id !== noteId),
      deletedNoteIds: deletedNotes,
    },
  };

  queueSaveNotesManifest(updatedDoc, true);
}
