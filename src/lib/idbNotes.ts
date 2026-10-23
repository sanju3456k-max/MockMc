// IndexedDB Helper for Notes and Attachments (PDFs & Images)
const DB_NAME = 'MockMC_Notes_DB';
const DB_VERSION = 2;
const STORE_NAME = 'user_notes';
const MEDIA_CACHE_STORE = 'notes_media_cache';
const TOMBSTONES_KEY = 'mockmc_deleted_notes_tombstones';

// Persistent tombstone helpers so deleted items are never resurrected across devices or on reload
export function getDeletedTombstones(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const stored = localStorage.getItem(TOMBSTONES_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function addDeletedTombstone(id: string | undefined | null): void {
  if (!id) return;
  try {
    const tombstones = getDeletedTombstones();
    tombstones.add(id);
    if (id.startsWith('drive_')) {
      tombstones.add(id.replace('drive_', ''));
    } else {
      tombstones.add(`drive_${id}`);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(Array.from(tombstones)));
    }
  } catch {
    // Ignore
  }
}

export function isTombstoned(id: string | undefined | null): boolean {
  if (!id) return false;
  const tombstones = getDeletedTombstones();
  return (
    tombstones.has(id) ||
    (id.startsWith('drive_') && tombstones.has(id.replace('drive_', ''))) ||
    tombstones.has(`drive_${id}`)
  );
}

export function removeTombstone(id: string | undefined | null): void {
  if (!id) return;
  try {
    const tombstones = getDeletedTombstones();
    tombstones.delete(id);
    tombstones.delete(id.replace('drive_', ''));
    tombstones.delete(`drive_${id}`);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(Array.from(tombstones)));
    }
  } catch {
    // Ignore
  }
}

export function removeMultipleTombstones(ids: (string | undefined | null)[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const tombstones = getDeletedTombstones();
    let hasChanges = false;
    ids.forEach((id) => {
      if (!id) return;
      if (tombstones.has(id)) {
        tombstones.delete(id);
        hasChanges = true;
      }
      const withoutDrive = id.replace('drive_', '');
      if (tombstones.has(withoutDrive)) {
        tombstones.delete(withoutDrive);
        hasChanges = true;
      }
      const withDrive = `drive_${id}`;
      if (tombstones.has(withDrive)) {
        tombstones.delete(withDrive);
        hasChanges = true;
      }
    });
    if (hasChanges && typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(Array.from(tombstones)));
    }
  } catch {
    // Ignore
  }
}

// Memory fallback storage if IndexedDB is blocked or closing/hidden
let memoryNotes: any[] = [];
let isIDBBlocked = false;
let cachedDB: IDBDatabase | null = null;
let isOpening = false;
let pendingOpenResolvers: Array<(db: IDBDatabase | null) => void> = [];

export interface CachedMediaItem {
  key: string;
  blob?: Blob;
  textContent?: string;
  mimeType?: string;
  fileName?: string;
  isPdf?: boolean;
  isImage?: boolean;
  isText?: boolean;
  timestamp: number;
}

const memoryMediaCache = new Map<string, CachedMediaItem>();

function isClosingError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('closing') ||
    msg.includes('hidden') ||
    msg.includes('invalidstateerror') ||
    msg.includes('database is closing')
  );
}

function closeCachedDB() {
  if (cachedDB) {
    try {
      cachedDB.close();
    } catch (e) {
      // Ignored
    }
    cachedDB = null;
  }
}

// Reset cached connection when document becomes hidden or is about to unload
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      closeCachedDB();
    }
  });
  window.addEventListener('pagehide', closeCachedDB);
}

function openNotesDB(): Promise<IDBDatabase | null> {
  if (isIDBBlocked) {
    return Promise.resolve(null);
  }

  // If already open and active, reuse it
  if (cachedDB) {
    return Promise.resolve(cachedDB);
  }

  // If document is currently hidden, do not open new IDB connections; fall back to memory
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return Promise.resolve(null);
  }

  if (isOpening) {
    return new Promise((resolve) => {
      pendingOpenResolvers.push(resolve);
    });
  }

  isOpening = true;

  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        isIDBBlocked = true;
        isOpening = false;
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(MEDIA_CACHE_STORE)) {
            db.createObjectStore(MEDIA_CACHE_STORE, { keyPath: 'key' });
          }
        } catch (e) {
          // Graceful fallback
        }
      };

      request.onsuccess = () => {
        isOpening = false;
        const db = request.result;
        cachedDB = db;

        db.onversionchange = () => {
          closeCachedDB();
        };

        db.onclose = () => {
          if (cachedDB === db) {
            cachedDB = null;
          }
        };

        resolve(db);
        pendingOpenResolvers.forEach((res) => res(db));
        pendingOpenResolvers = [];
      };

      request.onerror = () => {
        isOpening = false;
        const err = request.error;
        if (isClosingError(err)) {
          closeCachedDB();
        } else {
          isIDBBlocked = true;
        }
        resolve(null);
        pendingOpenResolvers.forEach((res) => res(null));
        pendingOpenResolvers = [];
      };

      request.onblocked = () => {
        isOpening = false;
        closeCachedDB();
        resolve(null);
        pendingOpenResolvers.forEach((res) => res(null));
        pendingOpenResolvers = [];
      };
    } catch (err) {
      isOpening = false;
      if (isClosingError(err)) {
        closeCachedDB();
      } else {
        isIDBBlocked = true;
      }
      resolve(null);
      pendingOpenResolvers.forEach((res) => res(null));
      pendingOpenResolvers = [];
    }
  });
}

export async function saveAllNotesToIDB(notes: any[], allowEmpty: boolean = false): Promise<void> {
  if (!allowEmpty && (!notes || notes.length === 0)) {
    // Protect against accidental wipes from empty remote snapshots
    return;
  }
  memoryNotes = [...notes];

  // Permanent localStorage backup (sanitizing large data urls)
  try {
    const backupList = notes.map((n) => {
      const copy = { ...n };
      if (copy.fileUrl && copy.fileUrl.length > 2000) {
        copy.isLocalAttachmentOnly = true;
        delete copy.fileUrl;
      }
      return copy;
    });
    localStorage.setItem('mockmc_saved_notes_permanent', JSON.stringify(backupList));
  } catch (err) {
    // Ignore
  }

  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const note of notes) {
      store.put(note);
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve(); // resolve gracefully, data is in memoryNotes
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    } else {
      console.warn('Saving notes to IndexedDB fell back to memory cache:', e);
    }
  }
}

export async function getAllNotesFromIDB(): Promise<any[]> {
  let result: any[] = [];
  if (!isIDBBlocked) {
    try {
      const db = await openNotesDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        result = await new Promise((resolve) => {
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => {
            if (isClosingError(request.error)) {
              closeCachedDB();
            }
            resolve([]);
          };
        });
      }
    } catch (e) {
      if (isClosingError(e)) {
        closeCachedDB();
      }
    }
  }

  const tombstones = getDeletedTombstones();
  const filterTombstones = (list: any[]) =>
    list.filter((n) => n && !tombstones.has(n.id) && (!n.driveFileId || (!tombstones.has(n.driveFileId) && !tombstones.has(`drive_${n.driveFileId}`))));

  if (result.length > 0) {
    const clean = filterTombstones(result);
    memoryNotes = clean;
    return clean;
  }

  if (memoryNotes.length > 0) {
    const clean = filterTombstones(memoryNotes);
    memoryNotes = clean;
    return clean;
  }

  // Indestructible permanent backup recovery from localStorage
  try {
    const raw = localStorage.getItem('mockmc_saved_notes_permanent');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = filterTombstones(parsed);
        memoryNotes = clean;
        return clean;
      }
    }
  } catch (err) {
    // Ignore
  }

  return [];
}

export async function saveSingleNoteToIDB(note: any): Promise<void> {
  if (note?.id) {
    removeTombstone(note.id);
    if (note.driveFileId) {
      removeTombstone(note.driveFileId);
    }
  }
  const idx = memoryNotes.findIndex((n) => n.id === note.id);
  if (idx >= 0) {
    memoryNotes[idx] = note;
  } else {
    memoryNotes.push(note);
  }

  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(note);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

export async function deleteNoteFromIDB(id: string): Promise<void> {
  addDeletedTombstone(id);
  // Also clean up local media cache
  removeCachedMedia(id);
  removeCachedMedia(`drive_${id}`);
  removeCachedMedia(id.replace('drive_', ''));

  memoryNotes = memoryNotes.filter((n) => {
    if (n.id === id || n.driveFileId === id || `drive_${n.driveFileId}` === id) {
      if (n.driveFileId) {
        removeCachedMedia(n.driveFileId);
        removeCachedMedia(`drive_${n.driveFileId}`);
      }
      return false;
    }
    return true;
  });

  try {
    localStorage.setItem('mockmc_saved_notes_permanent', JSON.stringify(memoryNotes));
  } catch (err) {
    // Ignore
  }
  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db) return;

    const tx = db.transaction([STORE_NAME, MEDIA_CACHE_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const mediaStore = tx.objectStore(MEDIA_CACHE_STORE);
    store.delete(id);
    store.delete(id.replace('drive_', ''));
    store.delete(`drive_${id}`);
    mediaStore.delete(id);
    mediaStore.delete(id.replace('drive_', ''));
    mediaStore.delete(`drive_${id}`);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

export async function deleteNotesForTestFromIDB(testId: string): Promise<void> {
  if (!testId) return;
  memoryNotes = memoryNotes.filter((n) => n.testId !== testId);
  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.getAll();

    return new Promise((resolve) => {
      getAllReq.onsuccess = () => {
        const all = getAllReq.result || [];
        all.forEach((item: any) => {
          if (item && item.testId === testId) {
            store.delete(item.id);
          }
        });
        resolve();
      };
      getAllReq.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

export async function clearAllNotesFromIDB(): Promise<void> {
  memoryNotes = [];
  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

/**
 * Retrieves a cached binary media file (image, PDF) or text content from local IndexedDB cache.
 * Provides instant 0ms offline preview without loading from Google Drive every time.
 */
export async function getCachedMedia(key: string): Promise<CachedMediaItem | null> {
  if (!key) return null;

  // 1. Fast in-memory cache check
  if (memoryMediaCache.has(key)) {
    return memoryMediaCache.get(key) || null;
  }

  if (isIDBBlocked) return null;

  try {
    const db = await openNotesDB();
    if (!db || !db.objectStoreNames.contains(MEDIA_CACHE_STORE)) return null;

    const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const req = store.get(key);

    return new Promise((resolve) => {
      req.onsuccess = () => {
        const item = req.result as CachedMediaItem | undefined;
        if (item) {
          memoryMediaCache.set(key, item);
          resolve(item);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        if (isClosingError(req.error)) {
          closeCachedDB();
        }
        resolve(null);
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
    return null;
  }
}

/**
 * Saves a binary media blob or text content to the persistent local media cache.
 */
export async function saveCachedMedia(item: {
  key: string;
  blob?: Blob;
  textContent?: string;
  mimeType?: string;
  fileName?: string;
  isPdf?: boolean;
  isImage?: boolean;
  isText?: boolean;
}): Promise<void> {
  if (!item || !item.key) return;

  const fullItem: CachedMediaItem = {
    ...item,
    timestamp: Date.now(),
  };

  memoryMediaCache.set(item.key, fullItem);

  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db || !db.objectStoreNames.contains(MEDIA_CACHE_STORE)) return;

    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    store.put(fullItem);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

/**
 * Deletes a specific media item from the local cache (e.g., when forced to re-sync from Google Drive).
 */
export async function removeCachedMedia(key: string): Promise<void> {
  if (!key) return;
  memoryMediaCache.delete(key);

  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db || !db.objectStoreNames.contains(MEDIA_CACHE_STORE)) return;

    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    store.delete(key);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

/**
 * Clears all cached media files.
 */
export async function clearAllCachedMedia(): Promise<void> {
  memoryMediaCache.clear();

  if (isIDBBlocked) return;

  try {
    const db = await openNotesDB();
    if (!db || !db.objectStoreNames.contains(MEDIA_CACHE_STORE)) return;

    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    store.clear();

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (isClosingError(tx.error)) {
          closeCachedDB();
        }
        resolve();
      };
    });
  } catch (e) {
    if (isClosingError(e)) {
      closeCachedDB();
    }
  }
}

/**
 * Returns statistics about the persistent media cache.
 */
export async function getCacheStats(): Promise<{ count: number; isReady: boolean }> {
  if (isIDBBlocked) {
    return { count: memoryMediaCache.size, isReady: true };
  }

  try {
    const db = await openNotesDB();
    if (!db || !db.objectStoreNames.contains(MEDIA_CACHE_STORE)) {
      return { count: memoryMediaCache.size, isReady: false };
    }

    const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const countReq = store.count();

    return new Promise((resolve) => {
      countReq.onsuccess = () => {
        resolve({ count: countReq.result || 0, isReady: true });
      };
      countReq.onerror = () => {
        resolve({ count: memoryMediaCache.size, isReady: false });
      };
    });
  } catch {
    return { count: memoryMediaCache.size, isReady: false };
  }
}
