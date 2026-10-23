/**
 * ============================================================================
 * GOOGLE DRIVE OFFLINE / EXPIRATION OUTBOX ENGINE
 * ============================================================================
 * 
 * Persistent IndexedDB Outbox for HTML Notes Studio.
 * Guarantees zero data loss when Google Drive access tokens expire (60-minute OAuth limit)
 * or when the user is editing offline.
 * 
 * Key Principles:
 * 1. ZERO Note Code in Firebase: Note code is stored only in Google Drive and local cache.
 * 2. Resilient Outbox: Queues uploads when Drive is unreachable or token is expired.
 * 3. Transparent Multi-Device Manifest: Marks files in the Firestore Manifest as
 *    `driveSyncStatus: 'pending_device_upload'` with `pendingDeviceId` so other devices know
 *    an upload is pending from Device A.
 * 4. Automatic & Manual Flushing: Drains the queue as soon as Google Drive is re-authenticated.
 */

import { auth } from './firebase';
import {
  getCachedGoogleAccessToken,
  setCachedGoogleAccessToken,
  isGoogleDriveTokenExpired,
  signInWithGoogle,
} from './firebase';

export type DriveTaskType = 'upload' | 'delete_file' | 'delete_project';

export interface DriveOutboxTask {
  id: string; // `${taskType}__${projectId}__${fileId || 'root'}`
  taskType?: DriveTaskType;
  projectId: string;
  fileId?: string;
  driveFileId?: string;
  driveFolderId?: string;
  title?: string;
  code?: string;
  updatedAt: number;
  deviceId: string;
  queuedAt: number;
  retryCount: number;
  lastAttempt?: number;
  error?: string;
}

const DB_NAME = 'MockMC_Drive_Outbox_DB';
const DB_VERSION = 1;
const STORE_NAME = 'drive_tasks';
const BACKUP_STORAGE_KEY = 'mockmc_drive_outbox_backup_v1';

let cachedDB: IDBDatabase | null = null;
let isOpening = false;
let openWaiters: Array<(db: IDBDatabase | null) => void> = [];

// Stable persistent Device ID per browser profile
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'device_server';
  try {
    let id = localStorage.getItem('mockmc_device_id_v1');
    if (!id) {
      id = `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
      localStorage.setItem('mockmc_device_id_v1', id);
    }
    return id;
  } catch {
    return 'device_local';
  }
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (cachedDB) return Promise.resolve(cachedDB);

  if (isOpening) {
    return new Promise((resolve) => openWaiters.push(resolve));
  }

  isOpening = true;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e: any) => {
        cachedDB = e.target.result;
        isOpening = false;
        resolve(cachedDB);
        openWaiters.forEach((w) => w(cachedDB));
        openWaiters = [];
      };

      req.onerror = () => {
        isOpening = false;
        resolve(null);
        openWaiters.forEach((w) => w(null));
        openWaiters = [];
      };
    } catch {
      isOpening = false;
      resolve(null);
      openWaiters.forEach((w) => w(null));
      openWaiters = [];
    }
  });
}

function getBackupTasks(): DriveOutboxTask[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBackupTasks(tasks: DriveOutboxTask[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(tasks));
    }
  } catch {}
}

// UI Subscribers
type OutboxCountListener = (count: number) => void;
let countListeners: OutboxCountListener[] = [];

function notifyCount(count: number) {
  countListeners.forEach((fn) => {
    try {
      fn(count);
    } catch {}
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mockmc-drive-outbox-changed', { detail: { count } }));
  }
}

export function subscribeDriveOutboxCount(listener: OutboxCountListener): () => void {
  countListeners.push(listener);
  getPendingOutboxCount().then(listener).catch(() => {});
  return () => {
    countListeners = countListeners.filter((l) => l !== listener);
  };
}

export async function getDriveOutboxTasks(): Promise<DriveOutboxTask[]> {
  const db = await openDB();
  if (!db) return getBackupTasks();

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(getBackupTasks());
    } catch {
      resolve(getBackupTasks());
    }
  });
}

export async function getPendingOutboxCount(): Promise<number> {
  const tasks = await getDriveOutboxTasks();
  return tasks.length;
}

export async function enqueueDriveOutboxTask(
  params: Omit<DriveOutboxTask, 'id' | 'queuedAt' | 'retryCount' | 'deviceId'> & { id?: string }
): Promise<void> {
  const taskType = params.taskType || 'upload';
  const taskId =
    params.id ||
    (taskType === 'delete_file'
      ? `delete_file__${params.projectId}__${params.fileId}`
      : taskType === 'delete_project'
      ? `delete_project__${params.projectId}`
      : `${params.projectId}__${params.fileId}`);

  const task: DriveOutboxTask = {
    ...params,
    taskType,
    id: taskId,
    deviceId: getDeviceId(),
    queuedAt: Date.now(),
    retryCount: 0,
  };

  const db = await openDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(task);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Also update fallback backup
  const existing = getBackupTasks().filter((t) => t.id !== taskId);
  existing.push(task);
  saveBackupTasks(existing);

  const count = await getPendingOutboxCount();
  notifyCount(count);
}

export async function enqueueDriveDeleteFileTask(
  projectId: string,
  fileId: string,
  driveFileId?: string
): Promise<void> {
  // Cancel any pending upload for this same note
  await removeDriveOutboxTask(`${projectId}__${fileId}`);

  await enqueueDriveOutboxTask({
    taskType: 'delete_file',
    projectId,
    fileId,
    driveFileId,
    updatedAt: Date.now(),
  });
}

export async function enqueueDriveDeleteProjectTask(
  projectId: string,
  driveFolderId?: string
): Promise<void> {
  // Cancel any pending tasks for this project
  const tasks = await getDriveOutboxTasks();
  for (const t of tasks) {
    if (t.projectId === projectId) {
      await removeDriveOutboxTask(t.id);
    }
  }

  await enqueueDriveOutboxTask({
    taskType: 'delete_project',
    projectId,
    driveFolderId,
    updatedAt: Date.now(),
  });
}

export async function removeDriveOutboxTask(taskId: string): Promise<void> {
  const db = await openDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(taskId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  const existing = getBackupTasks().filter((t) => t.id !== taskId);
  saveBackupTasks(existing);

  const count = await getPendingOutboxCount();
  notifyCount(count);
}

export async function clearDriveOutbox(): Promise<void> {
  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch {}
  }
  saveBackupTasks([]);
  notifyCount(0);
}

// Processing Lock
let isProcessingOutbox = false;

/**
 * Drains all queued tasks from the persistent outbox by uploading/patching them to Google Drive.
 * Once uploaded, updates the Firestore Manifest with `driveFileId` and `driveSyncStatus: 'synced'`.
 */
export async function processDriveOutbox(): Promise<{
  processed: number;
  failed: number;
  remaining: number;
  authRequired: boolean;
}> {
  if (isProcessingOutbox) {
    const current = await getPendingOutboxCount();
    return { processed: 0, failed: 0, remaining: current, authRequired: false };
  }

  const tasks = await getDriveOutboxTasks();
  if (tasks.length === 0) {
    return { processed: 0, failed: 0, remaining: 0, authRequired: false };
  }

  const token = getCachedGoogleAccessToken();
  if (!token || isGoogleDriveTokenExpired()) {
    return { processed: 0, failed: 0, remaining: tasks.length, authRequired: true };
  }

  isProcessingOutbox = true;
  let processed = 0;
  let failed = 0;

  try {
    const {
      uploadNoteTaskToDrive,
      deleteNoteTaskFromDrive,
      deleteProjectTaskFromDrive,
    } = await import('./htmlNotesCloudSyncEngine');

    for (const task of tasks) {
      const delay = Math.min(30000, 1000 * Math.pow(2, task.retryCount || 0));
      if (task.retryCount > 0 && task.lastAttempt && (Date.now() - task.lastAttempt < delay)) {
        // Back off until exponential window passes
        continue;
      }

      try {
        let res: { success: boolean; authExpired?: boolean; message?: string };

        if (task.taskType === 'delete_file') {
          res = await deleteNoteTaskFromDrive(task);
        } else if (task.taskType === 'delete_project') {
          res = await deleteProjectTaskFromDrive(task);
        } else {
          res = await uploadNoteTaskToDrive(task);
        }

        if (res.success) {
          await removeDriveOutboxTask(task.id);
          processed++;
        } else {
          if (res.authExpired) {
            // Token expired mid-stream
            setCachedGoogleAccessToken(null);
            failed++;
            break;
          }
          task.retryCount = (task.retryCount || 0) + 1;
          task.lastAttempt = Date.now();
          task.error = res.message || 'Operation failed';
          await enqueueDriveOutboxTask(task);
          failed++;
        }
      } catch (err: any) {
        console.warn('Failed to process outbox task:', task.id, err);
        task.retryCount = (task.retryCount || 0) + 1;
        task.lastAttempt = Date.now();
        task.error = err?.message || 'Network error';
        await enqueueDriveOutboxTask(task);
        failed++;
      }
    }
  } finally {
    isProcessingOutbox = false;
  }

  const remaining = await getPendingOutboxCount();
  notifyCount(remaining);

  return {
    processed,
    failed,
    remaining,
    authRequired: Boolean(failed > 0 && (!getCachedGoogleAccessToken() || isGoogleDriveTokenExpired())),
  };
}
