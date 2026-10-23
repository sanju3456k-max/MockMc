/**
 * ============================================================================
 * INDEXEDDB PERSISTENT STORAGE ENGINE FOR ALL APP FEATURES
 * ============================================================================
 * 
 * Provides high-capacity, persistent client-side database backing for:
 * 1. Math Tests Catalog & Authored Tests (LaTeX, SVG diagrams, question banks)
 * 2. Exam Attempts & Submissions (including high-resolution OMR scanned sheets)
 * 3. Active In-Progress Test Sessions & Timer states
 * 4. Smart Local Coordinator Outbox & Mutation Write Queue
 * 5. Gemini AI Chat Sessions & Mathematical Solver histories
 * 6. User Study Notes, Documents & Deleted Items tombstones
 * 7. PWA Persistent Storage (navigator.storage.persist())
 * 
 * Benefits over 5MB localStorage:
 * - 100s of Megabytes to Gigabytes of quota (~60% of available disk space)
 * - Zero QuotaExceededError crashes
 * - No stripping of OMR sheet images or test diagrams
 * - 0ms UI latency via synchronous L1 In-Memory Mirror
 * - Complete automatic migration from legacy localStorage
 */

import type { MathTest, TestAttempt, ActiveTestSession } from '../types';

export const DB_NAME = 'MathMockPwaDB';
export const DB_VERSION = 2;

export const STORE_CHAT_SESSIONS = 'chatSessions';
export const STORE_GENERIC = 'appStore';
export const STORE_TESTS = 'tests';
export const STORE_ATTEMPTS = 'attempts';
export const STORE_ACTIVE_SESSIONS = 'activeSessions';

let dbInstancePromise: Promise<IDBDatabase | null> | null = null;

// Synchronous L1 memory mirrors for immediate 0ms UI rendering
const memorySessionsCache: Map<string, any[]> = new Map();
const memoryGenericCache: Map<string, any> = new Map();
const memoryTestsCache: Map<string, MathTest[]> = new Map();
const memoryAttemptsCache: Map<string, TestAttempt[]> = new Map();
const memoryActiveSessionsCache: Map<string, Record<string, ActiveTestSession>> = new Map();
const memoryDeletedTestsCache: Map<string, Set<string>> = new Map();

/**
 * Normalizes user ID for composite storage partitioning
 */
export function normalizeStorageUid(userId?: string | null): string {
  if (!userId || typeof userId !== 'string' || userId.trim() === '' || userId === 'guest-user' || userId === 'anonymous') {
    return 'guest';
  }
  return userId.trim();
}

/**
 * Requests persistent storage from the browser (protects from OS low-memory sweeps)
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        return granted;
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Returns estimated storage quota and usage from the browser's StorageManager API
 */
export async function getStorageUsageEstimate(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
  isIndexedDbSupported: boolean;
}> {
  const defaultRes = {
    usedBytes: 0,
    quotaBytes: 0,
    percentage: 0,
    isIndexedDbSupported: typeof indexedDB !== 'undefined',
  };

  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      const used = est.usage || 0;
      const quota = est.quota || 0;
      const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
      return {
        usedBytes: used,
        quotaBytes: quota,
        percentage: pct,
        isIndexedDbSupported: true,
      };
    } catch {
      return defaultRes;
    }
  }
  return defaultRes;
}

/**
 * Opens / initializes the IndexedDB database connection with all required object stores
 */
export function getIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  if (dbInstancePromise) {
    return dbInstancePromise;
  }

  dbInstancePromise = new Promise((resolve) => {
    try {
      requestPersistentStorage().catch(() => {});

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Chat Sessions Object Store
        if (!db.objectStoreNames.contains(STORE_CHAT_SESSIONS)) {
          const chatStore = db.createObjectStore(STORE_CHAT_SESSIONS, { keyPath: 'compositeKey' });
          chatStore.createIndex('userId', 'userId', { unique: false });
          chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          chatStore.createIndex('id', 'id', { unique: false });
        }

        // 2. Generic Key-Value Object Store (for coordinator queues, settings, metadata)
        if (!db.objectStoreNames.contains(STORE_GENERIC)) {
          db.createObjectStore(STORE_GENERIC, { keyPath: 'key' });
        }

        // 3. Tests Object Store
        if (!db.objectStoreNames.contains(STORE_TESTS)) {
          const testStore = db.createObjectStore(STORE_TESTS, { keyPath: 'compositeKey' });
          testStore.createIndex('userId', 'userId', { unique: false });
          testStore.createIndex('id', 'id', { unique: false });
          testStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 4. Attempts Object Store
        if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
          const attemptStore = db.createObjectStore(STORE_ATTEMPTS, { keyPath: 'compositeKey' });
          attemptStore.createIndex('userId', 'userId', { unique: false });
          attemptStore.createIndex('id', 'id', { unique: false });
          attemptStore.createIndex('completedAt', 'completedAt', { unique: false });
          attemptStore.createIndex('testId', 'testId', { unique: false });
        }

        // 5. Active In-Progress Sessions Object Store
        if (!db.objectStoreNames.contains(STORE_ACTIVE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_ACTIVE_SESSIONS, { keyPath: 'compositeKey' });
          sessionStore.createIndex('userId', 'userId', { unique: false });
          sessionStore.createIndex('testId', 'testId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          dbInstancePromise = null;
        };

        db.onclose = () => {
          dbInstancePromise = null;
        };

        db.onerror = () => {
          // Keep resilient
        };

        resolve(db);
      };

      request.onerror = () => {
        dbInstancePromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        dbInstancePromise = null;
        resolve(null);
      };
    } catch {
      dbInstancePromise = null;
      resolve(null);
    }
  });

  return dbInstancePromise;
}

// ============================================================================
// 1. TESTS INDEXEDDB OPERATIONS
// ============================================================================

/**
 * Returns in-memory tests mirror for instant synchronous retrieval
 */
export function getInMemoryTests(userId?: string | null): MathTest[] | null {
  const normUid = normalizeStorageUid(userId);
  if (memoryTestsCache.has(normUid)) {
    return memoryTestsCache.get(normUid) || null;
  }
  return null;
}

/**
 * Updates in-memory tests mirror
 */
export function setInMemoryTests(userId: string | null | undefined, tests: MathTest[]): void {
  const normUid = normalizeStorageUid(userId);
  memoryTestsCache.set(normUid, tests);
}

/**
 * Retrieves all tests for a user from IndexedDB (with memory cache fallback)
 */
export async function getAllTestsFromIndexedDB(userId?: string | null): Promise<MathTest[]> {
  const normUid = normalizeStorageUid(userId);

  // Check memory cache first
  if (memoryTestsCache.has(normUid)) {
    const mem = memoryTestsCache.get(normUid);
    if (Array.isArray(mem) && mem.length > 0) {
      return mem;
    }
  }

  try {
    const db = await getIndexedDb();
    if (!db) {
      return memoryTestsCache.get(normUid) || [];
    }

    // 1. Try fetching from discrete tests store
    const testsFromStore: MathTest[] = await new Promise((resolve) => {
      try {
        if (!db.objectStoreNames.contains(STORE_TESTS)) {
          return resolve([]);
        }
        const tx = db.transaction([STORE_TESTS], 'readonly');
        const store = tx.objectStore(STORE_TESTS);
        const index = store.index('userId');
        const req = index.getAll(normUid);
        req.onsuccess = () => {
          const items = req.result || [];
          const list = items.map((it: any) => it.data || it).filter((t: any) => t && t.id);
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    if (testsFromStore.length > 0) {
      memoryTestsCache.set(normUid, testsFromStore);
      return testsFromStore;
    }

    // 2. Fallback: check appStore for bulk tests array
    const bulkKey = `tests_${normUid}`;
    const bulk = await getGenericItemFromIndexedDB<MathTest[]>(bulkKey);
    if (Array.isArray(bulk) && bulk.length > 0) {
      memoryTestsCache.set(normUid, bulk);
      // Migrate to discrete store in background
      putAllTestsToIndexedDB(normUid, bulk).catch(() => {});
      return bulk;
    }

    return [];
  } catch (err) {
    console.warn('getAllTestsFromIndexedDB error:', err);
    return memoryTestsCache.get(normUid) || [];
  }
}

/**
 * Saves all tests for a user to IndexedDB and memory cache
 */
export async function putAllTestsToIndexedDB(userId: string | null | undefined, tests: MathTest[]): Promise<void> {
  if (!Array.isArray(tests)) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache immediately
  memoryTestsCache.set(normUid, tests);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    // 1. Save bulk array to appStore for fast atomic snapshot loading
    const bulkKey = `tests_${normUid}`;
    setGenericItemInIndexedDB(bulkKey, tests).catch(() => {});

    // 2. Save individual items in tests store
    if (db.objectStoreNames.contains(STORE_TESTS)) {
      const tx = db.transaction([STORE_TESTS], 'readwrite');
      const store = tx.objectStore(STORE_TESTS);

      // Clean old records for this user first
      const index = store.index('userId');
      const getKeysReq = index.getAllKeys(normUid);
      getKeysReq.onsuccess = () => {
        const oldKeys = getKeysReq.result || [];
        for (const k of oldKeys) {
          store.delete(k);
        }
        for (const test of tests) {
          if (test && test.id) {
            const compositeKey = `${normUid}_${test.id}`;
            store.put({
              compositeKey,
              id: test.id,
              userId: normUid,
              updatedAt: test.updatedAt || Date.now(),
              data: test,
            });
          }
        }
      };
    }
  } catch (err) {
    console.warn('putAllTestsToIndexedDB error:', err);
  }
}

/**
 * Saves a single test to IndexedDB and memory cache
 */
export async function putTestToIndexedDB(userId: string | null | undefined, test: MathTest): Promise<void> {
  if (!test || !test.id) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache
  const current = memoryTestsCache.get(normUid) || [];
  const updated = [test, ...current.filter((t) => t.id !== test.id)];
  memoryTestsCache.set(normUid, updated);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    if (db.objectStoreNames.contains(STORE_TESTS)) {
      const compositeKey = `${normUid}_${test.id}`;
      const tx = db.transaction([STORE_TESTS], 'readwrite');
      const store = tx.objectStore(STORE_TESTS);
      store.put({
        compositeKey,
        id: test.id,
        userId: normUid,
        updatedAt: test.updatedAt || Date.now(),
        data: test,
      });
    }

    setGenericItemInIndexedDB(`tests_${normUid}`, updated).catch(() => {});
  } catch (err) {
    console.warn('putTestToIndexedDB error:', err);
  }
}

/**
 * Deletes a test from IndexedDB and memory cache
 */
export async function deleteTestFromIndexedDB(userId: string | null | undefined, testId: string): Promise<void> {
  if (!testId) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache
  const current = memoryTestsCache.get(normUid) || [];
  const updated = current.filter((t) => t.id !== testId);
  memoryTestsCache.set(normUid, updated);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    if (db.objectStoreNames.contains(STORE_TESTS)) {
      const compositeKey = `${normUid}_${testId}`;
      const tx = db.transaction([STORE_TESTS], 'readwrite');
      const store = tx.objectStore(STORE_TESTS);
      store.delete(compositeKey);
      if (normUid !== 'guest') {
        store.delete(`guest_${testId}`);
      }
    }

    setGenericItemInIndexedDB(`tests_${normUid}`, updated).catch(() => {});
  } catch (err) {
    console.warn('deleteTestFromIndexedDB error:', err);
  }
}

// ============================================================================
// 2. ATTEMPTS & OMR SCANNED IMAGES INDEXEDDB OPERATIONS
// ============================================================================

/**
 * Returns in-memory attempts mirror for instant synchronous retrieval
 */
export function getInMemoryAttempts(userId?: string | null): TestAttempt[] | null {
  const normUid = normalizeStorageUid(userId);
  if (memoryAttemptsCache.has(normUid)) {
    return memoryAttemptsCache.get(normUid) || null;
  }
  return null;
}

/**
 * Updates in-memory attempts mirror
 */
export function setInMemoryAttempts(userId: string | null | undefined, attempts: TestAttempt[]): void {
  const normUid = normalizeStorageUid(userId);
  memoryAttemptsCache.set(normUid, attempts);
}

/**
 * Retrieves all test attempts for a user from IndexedDB (with memory cache fallback)
 */
export async function getAllAttemptsFromIndexedDB(userId?: string | null): Promise<TestAttempt[]> {
  const normUid = normalizeStorageUid(userId);

  if (memoryAttemptsCache.has(normUid)) {
    const mem = memoryAttemptsCache.get(normUid);
    if (Array.isArray(mem) && mem.length > 0) {
      return mem;
    }
  }

  try {
    const db = await getIndexedDb();
    if (!db) {
      return memoryAttemptsCache.get(normUid) || [];
    }

    // 1. Try fetching from discrete attempts store
    const attemptsFromStore: TestAttempt[] = await new Promise((resolve) => {
      try {
        if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
          return resolve([]);
        }
        const tx = db.transaction([STORE_ATTEMPTS], 'readonly');
        const store = tx.objectStore(STORE_ATTEMPTS);
        const index = store.index('userId');
        const req = index.getAll(normUid);
        req.onsuccess = () => {
          const items = req.result || [];
          const list = items.map((it: any) => it.data || it).filter((a: any) => a && a.id);
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    if (attemptsFromStore.length > 0) {
      // Sort chronologically descending
      attemptsFromStore.sort((a, b) => {
        const tA = new Date(a.completedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.completedAt || b.createdAt || 0).getTime();
        return tB - tA;
      });
      memoryAttemptsCache.set(normUid, attemptsFromStore);
      return attemptsFromStore;
    }

    // 2. Fallback: check appStore for bulk attempts array
    const bulkKey = `attempts_${normUid}`;
    const bulk = await getGenericItemFromIndexedDB<TestAttempt[]>(bulkKey);
    if (Array.isArray(bulk) && bulk.length > 0) {
      memoryAttemptsCache.set(normUid, bulk);
      putAllAttemptsToIndexedDB(normUid, bulk).catch(() => {});
      return bulk;
    }

    return [];
  } catch (err) {
    console.warn('getAllAttemptsFromIndexedDB error:', err);
    return memoryAttemptsCache.get(normUid) || [];
  }
}

/**
 * Saves all test attempts for a user to IndexedDB (preserves full OMR scanned images!)
 */
export async function putAllAttemptsToIndexedDB(userId: string | null | undefined, attempts: TestAttempt[]): Promise<void> {
  if (!Array.isArray(attempts)) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache immediately
  memoryAttemptsCache.set(normUid, attempts);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    // 1. Save bulk array to appStore
    const bulkKey = `attempts_${normUid}`;
    setGenericItemInIndexedDB(bulkKey, attempts).catch(() => {});

    // 2. Save individual items in attempts store
    if (db.objectStoreNames.contains(STORE_ATTEMPTS)) {
      const tx = db.transaction([STORE_ATTEMPTS], 'readwrite');
      const store = tx.objectStore(STORE_ATTEMPTS);

      const index = store.index('userId');
      const getKeysReq = index.getAllKeys(normUid);
      getKeysReq.onsuccess = () => {
        const oldKeys = getKeysReq.result || [];
        for (const k of oldKeys) {
          store.delete(k);
        }
        for (const attempt of attempts) {
          if (attempt && attempt.id) {
            const compositeKey = `${normUid}_${attempt.id}`;
            store.put({
              compositeKey,
              id: attempt.id,
              userId: normUid,
              testId: attempt.testId || '',
              completedAt: attempt.completedAt || Date.now(),
              data: attempt,
            });
          }
        }
      };
    }
  } catch (err) {
    console.warn('putAllAttemptsToIndexedDB error:', err);
  }
}

/**
 * Saves a single test attempt to IndexedDB
 */
export async function putAttemptToIndexedDB(userId: string | null | undefined, attempt: TestAttempt): Promise<void> {
  if (!attempt || !attempt.id) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache
  const current = memoryAttemptsCache.get(normUid) || [];
  const updated = [attempt, ...current.filter((a) => a.id !== attempt.id)];
  memoryAttemptsCache.set(normUid, updated);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    if (db.objectStoreNames.contains(STORE_ATTEMPTS)) {
      const compositeKey = `${normUid}_${attempt.id}`;
      const tx = db.transaction([STORE_ATTEMPTS], 'readwrite');
      const store = tx.objectStore(STORE_ATTEMPTS);
      store.put({
        compositeKey,
        id: attempt.id,
        userId: normUid,
        testId: attempt.testId || '',
        completedAt: attempt.completedAt || Date.now(),
        data: attempt,
      });
    }

    setGenericItemInIndexedDB(`attempts_${normUid}`, updated).catch(() => {});
  } catch (err) {
    console.warn('putAttemptToIndexedDB error:', err);
  }
}

/**
 * Deletes a test attempt from IndexedDB
 */
export async function deleteAttemptFromIndexedDB(userId: string | null | undefined, attemptId: string): Promise<void> {
  if (!attemptId) return;
  const normUid = normalizeStorageUid(userId);

  // Update memory cache
  const current = memoryAttemptsCache.get(normUid) || [];
  const updated = current.filter((a) => a.id !== attemptId);
  memoryAttemptsCache.set(normUid, updated);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    if (db.objectStoreNames.contains(STORE_ATTEMPTS)) {
      const compositeKey = `${normUid}_${attemptId}`;
      const tx = db.transaction([STORE_ATTEMPTS], 'readwrite');
      const store = tx.objectStore(STORE_ATTEMPTS);
      store.delete(compositeKey);
      if (normUid !== 'guest') {
        store.delete(`guest_${attemptId}`);
      }
    }

    setGenericItemInIndexedDB(`attempts_${normUid}`, updated).catch(() => {});
  } catch (err) {
    console.warn('deleteAttemptFromIndexedDB error:', err);
  }
}

// ============================================================================
// 3. ACTIVE TEST SESSIONS INDEXEDDB OPERATIONS
// ============================================================================

/**
 * Returns in-memory active sessions map for instant synchronous retrieval
 */
export function getInMemoryActiveSessions(userId?: string | null): Record<string, ActiveTestSession> | null {
  const normUid = normalizeStorageUid(userId);
  if (memoryActiveSessionsCache.has(normUid)) {
    return memoryActiveSessionsCache.get(normUid) || null;
  }
  return null;
}

/**
 * Updates in-memory active sessions map
 */
export function setInMemoryActiveSessions(userId: string | null | undefined, sessions: Record<string, ActiveTestSession>): void {
  const normUid = normalizeStorageUid(userId);
  memoryActiveSessionsCache.set(normUid, sessions);
}

/**
 * Retrieves all active sessions map for a user from IndexedDB
 */
export async function getActiveSessionsFromIndexedDB(userId?: string | null): Promise<Record<string, ActiveTestSession>> {
  const normUid = normalizeStorageUid(userId);

  if (memoryActiveSessionsCache.has(normUid)) {
    return memoryActiveSessionsCache.get(normUid) || {};
  }

  try {
    const key = `active_sessions_${normUid}`;
    const sessions = await getGenericItemFromIndexedDB<Record<string, ActiveTestSession>>(key);
    if (sessions && typeof sessions === 'object') {
      memoryActiveSessionsCache.set(normUid, sessions);
      return sessions;
    }
  } catch {}

  return {};
}

/**
 * Saves active sessions map to IndexedDB and memory cache
 */
export async function putActiveSessionsToIndexedDB(
  userId: string | null | undefined,
  sessions: Record<string, ActiveTestSession>
): Promise<void> {
  const normUid = normalizeStorageUid(userId);
  memoryActiveSessionsCache.set(normUid, sessions || {});

  try {
    const key = `active_sessions_${normUid}`;
    await setGenericItemInIndexedDB(key, sessions || {});
  } catch (err) {
    console.warn('putActiveSessionsToIndexedDB error:', err);
  }
}

/**
 * Clears an active session for a specific test in IndexedDB
 */
export async function clearActiveSessionInIndexedDB(userId?: string | null, testId?: string | null): Promise<void> {
  const normUid = normalizeStorageUid(userId);
  const current = memoryActiveSessionsCache.get(normUid) || {};

  if (testId) {
    const updated = { ...current };
    delete updated[testId];
    memoryActiveSessionsCache.set(normUid, updated);
    await setGenericItemInIndexedDB(`active_sessions_${normUid}`, updated);
  } else {
    memoryActiveSessionsCache.set(normUid, {});
    await setGenericItemInIndexedDB(`active_sessions_${normUid}`, {});
  }
}

// ============================================================================
// 4. DELETED ITEMS & TOMBSTONES
// ============================================================================

export async function getDeletedTestIdsFromIndexedDB(userId?: string | null): Promise<Set<string>> {
  const normUid = normalizeStorageUid(userId);
  if (memoryDeletedTestsCache.has(normUid)) {
    return memoryDeletedTestsCache.get(normUid)!;
  }

  const key = `deleted_tests_${normUid}`;
  const list = await getGenericItemFromIndexedDB<string[]>(key);
  const set = new Set<string>(Array.isArray(list) ? list : []);
  memoryDeletedTestsCache.set(normUid, set);
  return set;
}

export async function saveDeletedTestIdsToIndexedDB(userId: string | null | undefined, ids: Set<string> | string[]): Promise<void> {
  const normUid = normalizeStorageUid(userId);
  const arr = Array.from(ids);
  memoryDeletedTestsCache.set(normUid, new Set(arr));
  await setGenericItemInIndexedDB(`deleted_tests_${normUid}`, arr);
}

// ============================================================================
// 5. SMART COORDINATOR WRITE QUEUE PERSISTENCE
// ============================================================================

export async function getWriteQueueFromIndexedDB(): Promise<any[] | null> {
  const key = 'smart_coordinator_write_queue';
  return getGenericItemFromIndexedDB<any[]>(key);
}

export async function saveWriteQueueToIndexedDB(queue: any[]): Promise<void> {
  const key = 'smart_coordinator_write_queue';
  await setGenericItemInIndexedDB(key, queue);
}

// ============================================================================
// 6. CHAT SESSIONS INDEXEDDB (EXPANDED & PRESERVED)
// ============================================================================

export async function getAllChatSessionsFromIndexedDB(userId?: string | null): Promise<any[]> {
  const normUid = normalizeStorageUid(userId);
  const sessionMap = new Map<string, any>();
  
  if (memorySessionsCache.has(normUid)) {
    const memList = memorySessionsCache.get(normUid);
    if (Array.isArray(memList)) {
      memList.forEach((s) => {
        if (s && s.id) sessionMap.set(s.id, s);
      });
    }
  }

  try {
    const db = await getIndexedDb();
    if (!db) {
      return Array.from(sessionMap.values());
    }

    const uidsToFetch = [normUid];

    const fetchedSessions: any[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CHAT_SESSIONS], 'readonly');
        const store = tx.objectStore(STORE_CHAT_SESSIONS);
        const index = store.index('userId');
        const results: any[] = [];
        let completed = 0;

        uidsToFetch.forEach((uid) => {
          const req = index.getAll(uid);
          req.onsuccess = () => {
            const rawItems = req.result || [];
            rawItems.forEach((item) => {
              const data = item.data || item;
              if (data && data.id) {
                results.push(data);
              }
            });
            completed++;
            if (completed === uidsToFetch.length) {
              resolve(results);
            }
          };
          req.onerror = () => {
            completed++;
            if (completed === uidsToFetch.length) {
              resolve(results);
            }
          };
        });
      } catch {
        resolve([]);
      }
    });

    fetchedSessions.forEach((s) => {
      if (s && s.id) {
        const existing = sessionMap.get(s.id);
        if (!existing) {
          sessionMap.set(s.id, s);
        } else {
          const existingCount = Array.isArray(existing.messages) ? existing.messages.length : 0;
          const newCount = Array.isArray(s.messages) ? s.messages.length : 0;
          const existingTime = typeof existing.updatedAt === 'number' ? existing.updatedAt : new Date(existing.updatedAt || 0).getTime();
          const newTime = typeof s.updatedAt === 'number' ? s.updatedAt : new Date(s.updatedAt || 0).getTime();
          if (newCount > existingCount || (newCount === existingCount && newTime >= existingTime)) {
            sessionMap.set(s.id, { ...existing, ...s });
          }
        }
      }
    });

    const sorted = Array.from(sessionMap.values()).sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return tB - tA;
    });

    memorySessionsCache.set(normUid, sorted);
    return sorted;
  } catch {
    return Array.from(sessionMap.values());
  }
}

export async function putChatSessionToIndexedDB(userId: string | null | undefined, session: any): Promise<void> {
  if (!session || !session.id) return;
  const normUid = normalizeStorageUid(userId);
  const compositeKey = `${normUid}_${session.id}`;

  const existingList = memorySessionsCache.get(normUid) || [];
  const updatedList = [session, ...existingList.filter((s) => s.id !== session.id)].sort((a, b) => {
    const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tB - tA;
  });
  memorySessionsCache.set(normUid, updatedList);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    const record = {
      compositeKey,
      id: session.id,
      userId: normUid,
      updatedAt: session.updatedAt || Date.now(),
      createdAt: session.createdAt || Date.now(),
      data: session,
    };

    const tx = db.transaction([STORE_CHAT_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_CHAT_SESSIONS);
    store.put(record);
  } catch (err) {
    console.warn('IndexedDB putChatSession error:', err);
  }
}

export async function putAllChatSessionsToIndexedDB(userId: string | null | undefined, sessions: any[]): Promise<void> {
  if (!Array.isArray(sessions)) return;
  const normUid = normalizeStorageUid(userId);

  memorySessionsCache.set(normUid, sessions);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    const tx = db.transaction([STORE_CHAT_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_CHAT_SESSIONS);

    for (const session of sessions) {
      if (session && session.id) {
        const compositeKey = `${normUid}_${session.id}`;
        store.put({
          compositeKey,
          id: session.id,
          userId: normUid,
          updatedAt: session.updatedAt || Date.now(),
          createdAt: session.createdAt || Date.now(),
          data: session,
        });
      }
    }
  } catch (err) {
    console.warn('IndexedDB putAllChatSessions error:', err);
  }
}

export async function deleteChatSessionFromIndexedDB(userId: string | null | undefined, sessionId: string): Promise<void> {
  if (!sessionId) return;
  const normUid = normalizeStorageUid(userId);
  const compositeKey = `${normUid}_${sessionId}`;

  const existingList = memorySessionsCache.get(normUid) || [];
  memorySessionsCache.set(normUid, existingList.filter((s) => s.id !== sessionId));

  try {
    const db = await getIndexedDb();
    if (!db) return;

    const tx = db.transaction([STORE_CHAT_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_CHAT_SESSIONS);
    store.delete(compositeKey);
  } catch (err) {
    console.warn('IndexedDB deleteChatSession error:', err);
  }
}

export async function clearAllChatSessionsInIndexedDB(userId?: string | null): Promise<void> {
  const normUid = normalizeStorageUid(userId);
  memorySessionsCache.delete(normUid);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    const tx = db.transaction([STORE_CHAT_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_CHAT_SESSIONS);
    const index = store.index('userId');

    const uidsToClear = [normUid];

    uidsToClear.forEach((uid) => {
      const req = index.getAllKeys(uid);
      req.onsuccess = () => {
        const keys = req.result || [];
        for (const k of keys) {
          store.delete(k);
        }
      };
    });
  } catch (err) {
    console.warn('IndexedDB clearAllChatSessions error:', err);
  }
}

export function getInMemoryChatSessions(userId?: string | null): any[] | null {
  const normUid = normalizeStorageUid(userId);
  if (memorySessionsCache.has(normUid)) {
    return memorySessionsCache.get(normUid) || null;
  }
  return null;
}

export function setInMemoryChatSessions(userId: string | null | undefined, sessions: any[]): void {
  const normUid = normalizeStorageUid(userId);
  memorySessionsCache.set(normUid, sessions);
}

// ============================================================================
// 7. GENERIC KEY-VALUE APP STORE
// ============================================================================

export async function setGenericItemInIndexedDB(key: string, value: any): Promise<void> {
  if (!key) return;
  memoryGenericCache.set(key, value);

  try {
    const db = await getIndexedDb();
    if (!db) return;

    const tx = db.transaction([STORE_GENERIC], 'readwrite');
    const store = tx.objectStore(STORE_GENERIC);
    store.put({ key, value, updatedAt: Date.now() });
  } catch {}
}

export async function getGenericItemFromIndexedDB<T = any>(key: string): Promise<T | null> {
  if (!key) return null;
  if (memoryGenericCache.has(key)) {
    return memoryGenericCache.get(key) as T;
  }

  try {
    const db = await getIndexedDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GENERIC], 'readonly');
        const store = tx.objectStore(STORE_GENERIC);
        const req = store.get(key);

        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            memoryGenericCache.set(key, req.result.value);
            resolve(req.result.value as T);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

// Aliases for developer convenience
export const getGenericItem = getGenericItemFromIndexedDB;
export const putGenericItem = setGenericItemInIndexedDB;

// ============================================================================
// 8. AUTOMATIC MIGRATION: LOCALSTORAGE -> INDEXEDDB
// ============================================================================

/**
 * Scans all existing localStorage keys on app startup and seamlessly migrates
 * tests, attempts, active sessions, and queues into IndexedDB.
 * Safe, idempotent, and runs with zero UI interruption.
 */
export async function migrateAllLocalStorageToIndexedDB(): Promise<{
  testsCount: number;
  attemptsCount: number;
  sessionsCount: number;
}> {
  if (typeof localStorage === 'undefined') {
    return { testsCount: 0, attemptsCount: 0, sessionsCount: 0 };
  }

  const result = { testsCount: 0, attemptsCount: 0, sessionsCount: 0 };

  try {
    // 1. Scan for tests in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Migrate Tests
      if (key === 'math_mock_tests_guest_local' || key === 'math_mock_tests_v1' || key === 'math_mock_tests' || key.startsWith('math_mock_tests_account_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const uid = key.startsWith('math_mock_tests_account_')
                ? key.replace('math_mock_tests_account_', '')
                : 'guest';
              await putAllTestsToIndexedDB(uid, parsed);
              result.testsCount += parsed.length;
            }
          }
        } catch {}
      }

      // Migrate Attempts
      if (key === 'math_mock_attempts_guest_local' || key === 'math_mock_attempts_v1' || key === 'math_mock_attempts' || key.startsWith('math_mock_attempts_account_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const uid = key.startsWith('math_mock_attempts_account_')
                ? key.replace('math_mock_attempts_account_', '')
                : 'guest';
              await putAllAttemptsToIndexedDB(uid, parsed);
              result.attemptsCount += parsed.length;
            }
          }
        } catch {}
      }

      // Migrate Active Sessions
      if (key === 'math_mock_active_sessions_map_guest_local' || key.startsWith('math_mock_active_sessions_map_account_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              const uid = key.startsWith('math_mock_active_sessions_map_account_')
                ? key.replace('math_mock_active_sessions_map_account_', '')
                : 'guest';
              await putActiveSessionsToIndexedDB(uid, parsed);
              result.sessionsCount += Object.keys(parsed).length;
            }
          }
        } catch {}
      }

      // Migrate Coordinator Write Queue
      if (key === 'smart_coordinator_v1_write_queue') {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              await saveWriteQueueToIndexedDB(parsed);
            }
          }
        } catch {}
      }

      // Migrate Deleted Test Tombstones
      if (key === 'math_mock_deleted_tests_guest_local' || key.startsWith('math_mock_deleted_tests_account_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const uid = key.startsWith('math_mock_deleted_tests_account_')
                ? key.replace('math_mock_deleted_tests_account_', '')
                : 'guest';
              await saveDeletedTestIdsToIndexedDB(uid, parsed);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('migrateAllLocalStorageToIndexedDB error:', err);
  }

  return result;
}
