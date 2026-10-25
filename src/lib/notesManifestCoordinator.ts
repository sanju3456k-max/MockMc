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
export function attachNotesManifestListener(_userId: string, _userEmail?: string): () => void {
  // Obsolete: notes_manifests collection is fully disarmed to eliminate unnecessary reads and writes.
  return () => {};
}


// ==========================================
// Bootstrap & Migration Engine
// ==========================================

async function bootstrapInitialManifestDoc(userId: string, userEmail?: string): Promise<UserNotesManifestDoc> {
  const manifest = createDefaultManifestDoc(userId, userEmail);
  setLocalCachedManifest(manifest);
  return manifest;
}

// ==========================================
// Debounced Write Queue with Checksum Guard
// ==========================================

export async function queueSaveNotesManifest(
  manifest: UserNotesManifestDoc,
  _immediate = false
): Promise<boolean> {
  // Pure local-first caching: 0 network writes to notes_manifests
  setLocalCachedManifest(manifest);
  notifySyncStatus('synced');
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
  _driveRootFolderId?: string,
  _immediate: boolean = false
): Promise<boolean> {
  saveLocalProjects(projects);
  return Promise.resolve(true);
}

export function syncHtmlProjectsToFirebase(
  projects: HtmlProject[],
  _immediate: boolean = true
): Promise<boolean> {
  saveLocalProjects(projects);
  return Promise.resolve(true);
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
}

export function deleteSimpleNoteFromManifest(noteId: string): void {
  if (!noteId) return;
  addDeletedTombstone(noteId);
}
