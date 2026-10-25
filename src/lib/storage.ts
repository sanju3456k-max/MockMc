import type { MathTest, TestAttempt, ActiveTestSession } from '../types';
import { SAMPLE_MATH_TESTS } from '../data/sampleTests';
import { 
  fetchFullTestFromFirestore, 
  deleteTestFromFirestore, 
  deleteAttemptFromFirestore, 
  deleteChatSessionFromFirestore,
  unmarkMultipleDeletedTestsInFirestore
} from './firebase';
import { getAllNotesFromIDB, saveAllNotesToIDB, removeMultipleTombstones } from './idbNotes';
import { loadLocalProjects, saveLocalProjects, queueFirestoreSync } from './htmlNotesSync';
import { recordHtmlProjectsUpdate } from './notesManifestCoordinator';
import {
  getAllChatSessionsFromIndexedDB,
  putAllChatSessionsToIndexedDB,
  deleteChatSessionFromIndexedDB,
  clearAllChatSessionsInIndexedDB,
  getInMemoryChatSessions,
  setInMemoryChatSessions,
  requestPersistentStorage,
  // High-capacity IndexedDB storage engine
  getAllTestsFromIndexedDB,
  putAllTestsToIndexedDB,
  putTestToIndexedDB,
  deleteTestFromIndexedDB,
  getInMemoryTests,
  setInMemoryTests,
  getAllAttemptsFromIndexedDB,
  putAllAttemptsToIndexedDB,
  putAttemptToIndexedDB,
  deleteAttemptFromIndexedDB,
  getInMemoryAttempts,
  setInMemoryAttempts,
  getActiveSessionsFromIndexedDB,
  putActiveSessionsToIndexedDB,
  clearActiveSessionInIndexedDB,
  getInMemoryActiveSessions,
  setInMemoryActiveSessions,
  getDeletedTestIdsFromIndexedDB,
  saveDeletedTestIdsToIndexedDB,
  migrateAllLocalStorageToIndexedDB,
  getStorageUsageEstimate,
  normalizeStorageUid
} from './indexedDbStorage';

// Request PWA persistent storage on client startup and trigger background IndexedDB hydration
if (typeof window !== 'undefined') {
  requestPersistentStorage().catch(() => {});
  migrateAllLocalStorageToIndexedDB().then(() => {
    const cachedUid = getCachedAuthUser()?.uid || null;
    hydrateAllScopedDataFromIndexedDB(cachedUid).catch(() => {});
  }).catch(() => {});
}

export const GUEST_STORAGE_TESTS_KEY = 'math_mock_tests_guest_local';
export const GUEST_STORAGE_ATTEMPTS_KEY = 'math_mock_attempts_guest_local';
export const GUEST_STORAGE_ACTIVE_SESSION_KEY = 'math_mock_active_session_guest_local';
export const GUEST_STORAGE_ACTIVE_SESSIONS_MAP_KEY = 'math_mock_active_sessions_map_guest_local';
export const GUEST_STORAGE_DELETED_TESTS_KEY = 'math_mock_deleted_tests_guest_local';
export const GUEST_STORAGE_DELETED_CHAT_SESSIONS_KEY = 'gemini_math_deleted_chat_sessions_guest_local';
export const GLOBAL_DELETED_CHAT_SESSIONS_KEY = 'gemini_math_deleted_chat_sessions_global_v1';
export const GUEST_STORAGE_CHAT_SESSIONS_KEY = 'gemini_math_chatbot_sessions_v1';
export const CACHED_AUTH_USER_KEY = 'math_mock_cached_auth_user_v1';
const LEGACY_STORAGE_TESTS_KEY = 'math_mock_tests_v1';
const LEGACY_STORAGE_ATTEMPTS_KEY = 'math_mock_attempts_v1';

export const OFFLINE_LOCAL_ONLY_KEY = 'math_mock_offline_local_only_mode_v1';

/**
 * Returns whether the application is running in 100% Offline Local Storage Mode (0 Cloud Reads/Writes).
 * Defaults to true for zero quota burn and maximum offline speed.
 */
export function isOfflineLocalOnlyMode(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(OFFLINE_LOCAL_ONLY_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Updates the Offline Local Mode preference in localStorage and dispatches a change event.
 */
export function setOfflineLocalOnlyMode(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_LOCAL_ONLY_KEY, enabled ? 'true' : 'false');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-local-mode-changed', {
        detail: { enabled }
      }));
    }
  } catch (e) {
    console.warn('Failed to update offline local mode in localStorage:', e);
  }
}

export interface CachedAuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Retrieves the cached auth user profile from localStorage for instantaneous hydration without auth flicker.
 */
export function getCachedAuthUser(): CachedAuthUser | null {
  try {
    const raw = localStorage.getItem(CACHED_AUTH_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.uid === 'string' && parsed.uid.trim() !== '') {
        return parsed as CachedAuthUser;
      }
    }
  } catch (err) {
    console.warn('Failed to read cached auth user from localStorage:', err);
  }
  return null;
}

/**
 * Persists or removes the cached auth user in localStorage.
 */
export function setCachedAuthUser(user: CachedAuthUser | null): void {
  try {
    if (user && user.uid) {
      localStorage.setItem(CACHED_AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CACHED_AUTH_USER_KEY);
    }
  } catch (err) {
    console.warn('Failed to save cached auth user to localStorage:', err);
  }
}

/**
 * Returns the storage keys for tests, attempts, active sessions, and deleted items scoped by user account ID or guest mode.
 */
export function getScopedStorageKeys(userId?: string | null): { 
  testsKey: string; 
  attemptsKey: string; 
  activeSessionKey: string;
  activeSessionsMapKey: string;
  deletedTestsKey: string;
  deletedChatSessionsKey: string;
  chatSessionsKey: string;
  activeChatSessionIdKey: string;
} {
  const effectiveUid = userId || getCachedAuthUser()?.uid || null;
  if (effectiveUid && typeof effectiveUid === 'string' && effectiveUid.trim() !== '' && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
    const cleanUid = effectiveUid.trim();
    return {
      testsKey: `math_mock_tests_account_${cleanUid}`,
      attemptsKey: `math_mock_attempts_account_${cleanUid}`,
      activeSessionKey: `math_mock_active_session_account_${cleanUid}`,
      activeSessionsMapKey: `math_mock_active_sessions_map_account_${cleanUid}`,
      deletedTestsKey: `math_mock_deleted_tests_account_${cleanUid}`,
      deletedChatSessionsKey: `gemini_math_deleted_chat_sessions_account_${cleanUid}`,
      chatSessionsKey: `math_mock_chat_sessions_account_${cleanUid}`,
      activeChatSessionIdKey: `math_mock_active_chat_session_account_${cleanUid}`,
    };
  }
  return {
    testsKey: GUEST_STORAGE_TESTS_KEY,
    attemptsKey: GUEST_STORAGE_ATTEMPTS_KEY,
    activeSessionKey: GUEST_STORAGE_ACTIVE_SESSION_KEY,
    activeSessionsMapKey: GUEST_STORAGE_ACTIVE_SESSIONS_MAP_KEY,
    deletedTestsKey: GUEST_STORAGE_DELETED_TESTS_KEY,
    deletedChatSessionsKey: GUEST_STORAGE_DELETED_CHAT_SESSIONS_KEY,
    chatSessionsKey: GUEST_STORAGE_CHAT_SESSIONS_KEY,
    activeChatSessionIdKey: 'gemini_active_session_id_v2',
  };
}

/**
 * Loads chat sessions strictly scoped to the active account or guest storage.
 * Keeps unauthenticated local guest mode and authenticated login mode histories isolated.
 */
export function loadScopedChatSessions(userId?: string | null): any[] {
  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();
  const deletedIds = getAllDeletedChatSessionIds(effectiveUid);
  const sessionMap = new Map<string, any>();

  // 1. Check in-memory persistent cache for this scope only
  const inMemory = getInMemoryChatSessions(effectiveUid);
  if (Array.isArray(inMemory)) {
    inMemory.forEach((s) => {
      if (s && s.id && !deletedIds.has(s.id)) sessionMap.set(s.id, s);
    });
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const { chatSessionsKey } = getScopedStorageKeys(effectiveUid);
      // For guest users, inspect guest key and any legacy keys. For logged-in users, inspect ONLY their scoped key.
      const keysToInspect = isGuest
        ? [chatSessionsKey, 'gemini_chat_sessions_v3', 'gemini_chat_sessions_v2', 'gemini_chat_sessions_v1']
        : [chatSessionsKey];

      for (const key of keysToInspect) {
        if (!key) continue;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((s) => {
                if (s && s.id && !deletedIds.has(s.id)) {
                  const existing = sessionMap.get(s.id);
                  if (!existing) {
                    sessionMap.set(s.id, s);
                  } else {
                    const existingCount = Array.isArray(existing.messages) ? existing.messages.length : 0;
                    const newCount = Array.isArray(s.messages) ? s.messages.length : 0;
                    const existingTime = typeof existing.updatedAt === 'number' ? existing.updatedAt : new Date(existing.updatedAt || 0).getTime();
                    const newTime = typeof s.updatedAt === 'number' ? s.updatedAt : new Date(s.updatedAt || 0).getTime();
                    if (newCount > existingCount || (newCount === existingCount && newTime > existingTime)) {
                      sessionMap.set(s.id, { ...existing, ...s });
                    }
                  }
                }
              });
            }
          } catch {}
        }
      }

      // Background async hydration from IndexedDB for completeness
      getAllChatSessionsFromIndexedDB(effectiveUid).then((idbSessions) => {
        if (Array.isArray(idbSessions) && idbSessions.length > 0) {
          const freshDeletedIds = getAllDeletedChatSessionIds(effectiveUid);
          idbSessions.forEach((s) => {
            if (s && s.id && !freshDeletedIds.has(s.id) && !sessionMap.has(s.id)) {
              sessionMap.set(s.id, s);
            }
          });
          const allMerged = Array.from(sessionMap.values())
            .filter((s) => !freshDeletedIds.has(s.id))
            .sort((a, b) => {
              const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
              const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
              return timeB - timeA;
            });
          setInMemoryChatSessions(effectiveUid, allMerged);
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('Failed to load scoped chat sessions from storage:', err);
    }
  }

  const allMerged = Array.from(sessionMap.values())
    .filter((s) => !deletedIds.has(s.id))
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

  if (allMerged.length > 0) {
    setInMemoryChatSessions(effectiveUid, allMerged);
    return allMerged;
  }

  return [];
}

/**
 * Safely purges stale, legacy, and redundant keys from localStorage
 * when Storage quota is exceeded without touching active chat data.
 */
export function freeUpLocalStorageQuota(userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';

    // 1. Purge legacy keys
    localStorage.removeItem(LEGACY_STORAGE_TESTS_KEY);
    localStorage.removeItem(LEGACY_STORAGE_ATTEMPTS_KEY);
    localStorage.removeItem('math_mock_tests');
    localStorage.removeItem('math_mock_attempts');
    localStorage.removeItem('gemini_chat_sessions_v1');
    localStorage.removeItem('gemini_chat_sessions_v2');
    localStorage.removeItem('gemini_chat_sessions_v3');
    localStorage.removeItem('mockmc_saved_notes_permanent');
    localStorage.removeItem('mockmc_html_notes_v2');
    localStorage.removeItem('mockmc_notes_manifest_doc_v1');

    // 2. Clear old temporary guest active test sessions if logged into an account
    if (!isGuest) {
      localStorage.removeItem(GUEST_STORAGE_ACTIVE_SESSION_KEY);
      localStorage.removeItem(GUEST_STORAGE_ACTIVE_SESSIONS_MAP_KEY);
    }

    // 3. Sweep old temporary items or orphaned Firestore WebStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('_temp_') ||
        key.startsWith('omr_camera_debug_') ||
        key.startsWith('firestore_') ||
        key.startsWith('firestore:')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // 4. Sanitize coordinator write queue if large
    try {
      const qKey = 'smart_coordinator_v1_write_queue';
      const rawQ = localStorage.getItem(qKey);
      if (rawQ && rawQ.length > 100000) {
        const parsed = JSON.parse(rawQ);
        if (Array.isArray(parsed)) {
          const lightenedQ = parsed.map((t: any) => {
            if (t.data && typeof t.data === 'object') {
              const cleanData = { ...t.data };
              if (cleanData.omrScannedImageUrl && cleanData.omrScannedImageUrl.length > 5000) {
                delete cleanData.omrScannedImageUrl;
              }
              return { ...t, data: cleanData };
            }
            return t;
          });
          localStorage.setItem(qKey, JSON.stringify(lightenedQ));
        }
      }
    } catch {}

    // 5. Purge large scanned camera images from saved attempts in localStorage to free up MBs of quota
    const attemptsKey = isGuest ? GUEST_STORAGE_ATTEMPTS_KEY : `math_mock_attempts_account_${userId}`;
    const rawAttempts = localStorage.getItem(attemptsKey);
    if (rawAttempts && rawAttempts.length > 300000) {
      try {
        const parsedAttempts = JSON.parse(rawAttempts);
        if (Array.isArray(parsedAttempts)) {
          const cleanedAttempts = parsedAttempts.map((a: any) => {
            if (a.omrScannedImageUrl && a.omrScannedImageUrl.length > 5000) {
              const { omrScannedImageUrl, ...rest } = a;
              return rest;
            }
            return a;
          });
          localStorage.setItem(attemptsKey, JSON.stringify(cleanedAttempts));
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Error during localStorage quota cleanup:', err);
  }
}

/**
 * Safely writes a key-value pair to localStorage with automatic quota management,
 * LRU pruning, and graceful fallback when QuotaExceededError is encountered.
 */
export function safeSetItem(key: string, value: string, userId?: string | null): boolean {
  if (typeof localStorage === 'undefined' || !key) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    if (
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      String(err).includes('quota') ||
      String(err).includes('exceeded')
    ) {
      freeUpLocalStorageQuota(userId);
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        try {
          const removablePrefixes = [
            'math_mock_tests_account_',
            'math_mock_attempts_account_',
            'smart_coordinator_v1_write_queue',
            'chat_sessions_scoped_'
          ];
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k !== key && removablePrefixes.some((p) => k.startsWith(p))) {
              const raw = localStorage.getItem(k);
              if (raw && raw.length > 30000) {
                localStorage.removeItem(k);
              }
            }
          }
          localStorage.setItem(key, value);
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }
}

/**
 * Saves chat sessions strictly scoped to the active account or guest storage.
 * Dual-persists to High-Capacity IndexedDB (L2) and localStorage mirror for the target user only.
 * Preserves all complete conversation messages without truncation.
 */
export function saveScopedChatSessions(userId: string | null | undefined, sessions: any[]): void {
  if (!Array.isArray(sessions)) return;

  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();

  // 1. Update in-memory cache for this scope only
  setInMemoryChatSessions(effectiveUid, sessions);

  // 2. Persist to High-Capacity IndexedDB for this scope only
  putAllChatSessionsToIndexedDB(effectiveUid, sessions).catch((err) => {
    console.warn('Failed to save chat sessions to IndexedDB:', err);
  });

  // 3. Mirror to localStorage for this scope only
  if (typeof localStorage === 'undefined') return;
  try {
    const { chatSessionsKey } = getScopedStorageKeys(effectiveUid);
    const serialized = JSON.stringify(sessions);
    try {
      localStorage.setItem(chatSessionsKey, serialized);
    } catch {
      freeUpLocalStorageQuota(effectiveUid);
      try {
        localStorage.setItem(chatSessionsKey, serialized);
      } catch {
        // If localStorage is completely full, IndexedDB safely holds the full data
      }
    }
  } catch (err) {
    console.warn('Failed to mirror chat sessions to localStorage:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gemini-chats-updated', { detail: { userId: effectiveUid, count: sessions.length } }));
  }
}

export const GLOBAL_DELETED_TESTS_KEY = 'math_mock_deleted_tests_global';

/**
 * Returns all deleted test IDs across global, account, and guest scopes.
 */
export function getAllDeletedTestIds(userId?: string | null): Set<string> {
  const ids = new Set<string>();
  if (typeof localStorage === 'undefined') return ids;

  // 1. Account scope
  if (userId && typeof userId === 'string' && userId.trim() !== '' && userId !== 'guest-user' && userId !== 'anonymous') {
    try {
      const userRaw = localStorage.getItem(`math_mock_deleted_tests_account_${userId.trim()}`);
      if (userRaw) {
        JSON.parse(userRaw).forEach((id: string) => {
          if (id) ids.add(id);
        });
      }
    } catch {}
  }

  // 2. Global deleted tests scope
  try {
    const globalRaw = localStorage.getItem(GLOBAL_DELETED_TESTS_KEY);
    if (globalRaw) {
      JSON.parse(globalRaw).forEach((id: string) => {
        if (id) ids.add(id);
      });
    }
  } catch {}

  // 3. Guest / unauthenticated scope
  try {
    const guestRaw = localStorage.getItem(GUEST_STORAGE_DELETED_TESTS_KEY);
    if (guestRaw) {
      JSON.parse(guestRaw).forEach((id: string) => {
        if (id) ids.add(id);
      });
    }
  } catch {}

  return ids;
}

/**
 * Records a deleted test ID in scoped storage, and purges it directly from all test caches.
 */
export function markTestAsDeletedInScopedStorage(userId: string | null | undefined, testId: string): void {
  if (!testId || typeof localStorage === 'undefined') return;
  try {
    // 1. Store in user account deleted set if authenticated
    if (userId && typeof userId === 'string' && userId.trim() !== '' && userId !== 'guest-user' && userId !== 'anonymous') {
      const userKey = `math_mock_deleted_tests_account_${userId.trim()}`;
      const userRaw = localStorage.getItem(userKey);
      const userIds: string[] = userRaw ? JSON.parse(userRaw) : [];
      if (!userIds.includes(testId)) {
        userIds.push(testId);
        safeSetItem(userKey, JSON.stringify(userIds), userId);
      }
    }

    // 2. Store in guest deleted set
    const guestRaw = localStorage.getItem(GUEST_STORAGE_DELETED_TESTS_KEY);
    const guestIds: string[] = guestRaw ? JSON.parse(guestRaw) : [];
    if (!guestIds.includes(testId)) {
      guestIds.push(testId);
      safeSetItem(GUEST_STORAGE_DELETED_TESTS_KEY, JSON.stringify(guestIds), userId);
    }

    // 3. Store in global device-wide deleted set
    const globalRaw = localStorage.getItem(GLOBAL_DELETED_TESTS_KEY);
    const globalIds: string[] = globalRaw ? JSON.parse(globalRaw) : [];
    if (!globalIds.includes(testId)) {
      globalIds.push(testId);
      safeSetItem(GLOBAL_DELETED_TESTS_KEY, JSON.stringify(globalIds), userId);
    }

    // 4. Actively purge the test from memory and IndexedDB
    deleteTestFromIndexedDB(userId, testId).catch(() => {});
    if (userId) {
      deleteTestFromIndexedDB(null, testId).catch(() => {});
    }
    saveDeletedTestIdsToIndexedDB(userId, getAllDeletedTestIds(userId)).catch(() => {});

    // 5. Actively purge the test from all localStorage arrays immediately
    const testKeysToPurge = [
      GUEST_STORAGE_TESTS_KEY,
      LEGACY_STORAGE_TESTS_KEY,
      'math_mock_tests',
      userId ? `math_mock_tests_account_${userId.trim()}` : null
    ].filter(Boolean) as string[];

    testKeysToPurge.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list: MathTest[] = JSON.parse(raw);
          if (Array.isArray(list)) {
            const filtered = list.filter((t) => t && t.id !== testId);
            safeSetItem(k, JSON.stringify(filtered), userId);
          }
        }
      } catch {}
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tests-updated'));
    }
  } catch (err) {
    console.warn('Failed to mark test as deleted in scoped storage:', err);
  }
}

/**
 * Unmarks a test ID from deleted storage (e.g. when recreating or editing a test).
 */
export function unmarkTestAsDeletedInScopedStorage(userId: string | null | undefined, testId: string): void {
  if (!testId || typeof localStorage === 'undefined') return;
  try {
    const keys = [
      GLOBAL_DELETED_TESTS_KEY,
      GUEST_STORAGE_DELETED_TESTS_KEY,
      userId ? `math_mock_deleted_tests_account_${userId.trim()}` : null
    ].filter(Boolean) as string[];

    keys.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          const updated = ids.filter((id) => id !== testId);
          localStorage.setItem(k, JSON.stringify(updated));
        }
      } catch {}
    });

    saveDeletedTestIdsToIndexedDB(userId, getAllDeletedTestIds(userId)).catch(() => {});
  } catch (err) {
    console.warn('Failed to unmark test as deleted in scoped storage:', err);
  }
}

/**
 * Returns deleted chat session IDs scoped to the specified user or guest storage.
 */
export function getAllDeletedChatSessionIds(userId?: string | null): Set<string> {
  const ids = new Set<string>();
  if (typeof localStorage === 'undefined') return ids;

  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();

  // 1. Account scope if authenticated
  if (!isGuest && effectiveUid) {
    try {
      const userRaw = localStorage.getItem(`gemini_math_deleted_chat_sessions_account_${effectiveUid}`);
      if (userRaw) {
        JSON.parse(userRaw).forEach((id: string) => {
          if (id) ids.add(id);
        });
      }
    } catch {}
  } else {
    // 2. Guest scope if unauthenticated
    try {
      const guestRaw = localStorage.getItem(GUEST_STORAGE_DELETED_CHAT_SESSIONS_KEY);
      if (guestRaw) {
        JSON.parse(guestRaw).forEach((id: string) => {
          if (id) ids.add(id);
        });
      }
    } catch {}
  }

  return ids;
}

/**
 * Marks a chat session as permanently deleted strictly within the target scope and purges it from caches/storage.
 */
export function markChatSessionAsDeletedInScopedStorage(userId: string | null | undefined, sessionId: string): void {
  if (!sessionId || typeof localStorage === 'undefined') return;
  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();

  try {
    const { deletedChatSessionsKey, chatSessionsKey } = getScopedStorageKeys(effectiveUid);

    // 1. Record in target scoped deleted set
    const raw = localStorage.getItem(deletedChatSessionsKey);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(sessionId)) {
      ids.push(sessionId);
      localStorage.setItem(deletedChatSessionsKey, JSON.stringify(ids));
    }

    // 2. Remove from in-memory cache for this scope only
    const inMem = getInMemoryChatSessions(effectiveUid) || [];
    setInMemoryChatSessions(effectiveUid, inMem.filter((s: any) => s.id !== sessionId));

    // 3. Delete from IndexedDB for this scope only
    deleteChatSessionFromIndexedDB(effectiveUid, sessionId).catch(() => {});

    // 4. Actively purge from scoped localStorage
    try {
      const scopedRaw = localStorage.getItem(chatSessionsKey);
      if (scopedRaw) {
        const list = JSON.parse(scopedRaw);
        if (Array.isArray(list)) {
          const filtered = list.filter((s: any) => s && s.id !== sessionId);
          localStorage.setItem(chatSessionsKey, JSON.stringify(filtered));
        }
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini-chats-updated', { detail: { userId: effectiveUid, deletedId: sessionId } }));
    }
  } catch (err) {
    console.warn('Failed to mark chat session as deleted in scoped storage:', err);
  }
}

/**
 * Unmarks a chat session ID from deleted storage (e.g. when creating a new session).
 */
export function unmarkChatSessionAsDeletedInScopedStorage(userId: string | null | undefined, sessionId: string): void {
  if (!sessionId || typeof localStorage === 'undefined') return;
  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();

  try {
    const { deletedChatSessionsKey } = getScopedStorageKeys(effectiveUid);
    const raw = localStorage.getItem(deletedChatSessionsKey);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      const updated = ids.filter((id) => id !== sessionId);
      localStorage.setItem(deletedChatSessionsKey, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to unmark chat session as deleted in scoped storage:', err);
  }
}

/**
 * Clears all deleted chat session IDs for fresh start in target scope.
 */
export function clearAllDeletedChatSessionIds(userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
  const effectiveUid = isGuest ? null : userId.trim();

  try {
    const { deletedChatSessionsKey } = getScopedStorageKeys(effectiveUid);
    localStorage.removeItem(deletedChatSessionsKey);
  } catch {}
}

/**
 * Hydrates all scoped tests, attempts, and active sessions from IndexedDB into memory mirrors
 * and dispatches a notification event so the UI updates with the authoritative dataset.
 */
export async function hydrateAllScopedDataFromIndexedDB(userId?: string | null): Promise<void> {
  try {
    const [tests, attempts, sessions] = await Promise.all([
      getAllTestsFromIndexedDB(userId),
      getAllAttemptsFromIndexedDB(userId),
      getActiveSessionsFromIndexedDB(userId)
    ]);

    if (Array.isArray(tests) && tests.length > 0) {
      setInMemoryTests(userId, tests);
    }
    if (Array.isArray(attempts) && attempts.length > 0) {
      setInMemoryAttempts(userId, attempts);
    }
    if (sessions && typeof sessions === 'object' && Object.keys(sessions).length > 0) {
      setInMemoryActiveSessions(userId, sessions);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-storage-hydrated', {
        detail: {
          userId,
          testsCount: tests.length,
          attemptsCount: attempts.length,
          sessionsCount: Object.keys(sessions).length
        }
      }));
    }
  } catch (err) {
    console.warn('hydrateAllScopedDataFromIndexedDB error:', err);
  }
}

/**
 * Loads tests scoped to the current user (or guest local mode).
 * Uses high-capacity IndexedDB as the primary persistent backing,
 * backed by synchronous in-memory cache and localStorage bootstrap.
 */
export function loadScopedTests(userId?: string | null): MathTest[] {
  try {
    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
    const deletedIds = getAllDeletedTestIds(userId);

    // 1. Instant synchronous check from L1 In-Memory mirror
    const mem = getInMemoryTests(userId);
    if (mem && Array.isArray(mem)) {
      if (isGuest) {
        const sanitized = mem.filter((t: MathTest) => t && t.id && !deletedIds.has(t.id));
        const guestIds = new Set(sanitized.map((t) => t.id));
        SAMPLE_MATH_TESTS.forEach((s) => {
          if (!deletedIds.has(s.id) && !guestIds.has(s.id)) {
            sanitized.push(s);
          }
        });
        return sanitized;
      } else {
        const userTests = mem.filter((t: MathTest) => t && t.id && !deletedIds.has(t.id));
        if (userTests.length > 0) return userTests;
      }
    }

    // 2. Trigger asynchronous IndexedDB hydration in background to warm in-memory cache
    getAllTestsFromIndexedDB(userId).then((idbTests) => {
      if (Array.isArray(idbTests) && idbTests.length > 0) {
        setInMemoryTests(userId, idbTests);
      }
    }).catch(() => {});

    // 3. Fallback to localStorage bootstrap cache for initial frame 0 render
    const { testsKey } = getScopedStorageKeys(userId);
    let cached = localStorage.getItem(testsKey);

    // If guest storage is empty, attempt one-time migration from legacy key
    if (!cached && isGuest) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_TESTS_KEY);
      if (legacy) {
        cached = legacy;
        try {
          localStorage.setItem(GUEST_STORAGE_TESTS_KEY, legacy);
        } catch {}
      }
    }

    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        setInMemoryTests(userId, parsed);
        if (isGuest) {
          const sanitizedGuestTests = parsed.filter((t: MathTest) => t && t.id && !deletedIds.has(t.id));
          const guestIds = new Set(sanitizedGuestTests.map((t) => t.id));
          SAMPLE_MATH_TESTS.forEach((s) => {
            if (!deletedIds.has(s.id) && !guestIds.has(s.id)) {
              sanitizedGuestTests.push(s);
            }
          });
          return sanitizedGuestTests;
        } else {
          const userTests = parsed.filter((t: MathTest) => t && t.id && !deletedIds.has(t.id));
          const hasCustomAccountTests = userTests.some(
            (t) => t.authorId === userId || (!t.id.startsWith('sample-') && !t.id.startsWith('math-'))
          );

          if (hasCustomAccountTests) {
            const userOnlyTests = userTests.filter(
              (t) => t.authorId === userId || (!t.id.startsWith('sample-') && !t.id.startsWith('math-'))
            );
            if (userOnlyTests.length > 0) {
              return userOnlyTests;
            }
          }

          if (userTests.length > 0) {
            return userTests;
          }
        }
      }
    }

    // Default: return sample tests ONLY for guest mode
    if (isGuest) {
      return SAMPLE_MATH_TESTS.filter((s) => !deletedIds.has(s.id));
    }
    return [];
  } catch (err) {
    console.warn('Failed to load scoped tests:', err);
  }
  return (!userId || userId === 'guest-user' || userId === 'anonymous') ? SAMPLE_MATH_TESTS : [];
}

/**
 * Saves tests scoped to the active account or guest storage.
 * Directly persists to high-capacity IndexedDB (with questions, LaTeX, and SVG diagrams),
 * keeps synchronous in-memory mirror updated, and maintains a safe local bootstrap mirror.
 */
export function saveScopedTests(userId: string | null | undefined, tests: MathTest[]): void {
  try {
    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
    const { testsKey } = getScopedStorageKeys(userId);
    
    const safeTests = tests.map((t) => {
      if (!t) return t;
      if (isGuest) {
        return {
          ...t,
          authorId: (!t.authorId || t.authorId === 'anonymous' || t.authorId === 'guest-user') ? (t.authorId || 'guest-user') : 'guest-user'
        };
      }
      return t;
    });

    // 1. Immediate in-memory mirror update
    setInMemoryTests(userId, safeTests);

    // 2. High-capacity IndexedDB persistence (stores full questions, equations & SVG diagrams without limits)
    putAllTestsToIndexedDB(userId, safeTests).catch((err) => {
      console.warn('IndexedDB putAllTestsToIndexedDB error:', err);
    });

    // 3. Best-effort mirror to localStorage for instantaneous frame-0 bootstrap
    try {
      localStorage.setItem(testsKey, JSON.stringify(safeTests));
    } catch {
      freeUpLocalStorageQuota(userId);
      try {
        localStorage.setItem(testsKey, JSON.stringify(safeTests));
      } catch {
        // Safe to ignore quota exceeded here because IndexedDB holds the complete data!
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tests-updated', { detail: { userId, source: 'saveScopedTests' } }));
    }
  } catch (err) {
    console.warn('Failed to save scoped tests:', err);
  }
}

/**
 * Accurately determines if an attempt was taken in OMR mode.
 * Returns false if attemptMode is explicitly 'online'.
 */
export function isAttemptOmrMode(attempt?: Partial<TestAttempt> | null): boolean {
  if (!attempt) return false;
  if (attempt.attemptMode === 'online') return false;
  if (attempt.attemptMode === 'omr') return true;
  if (Boolean(attempt.omrScannedImageUrl) && typeof attempt.omrScannedImageUrl === 'string' && attempt.omrScannedImageUrl.trim() !== '') return true;
  if (typeof attempt.id === 'string' && (attempt.id.startsWith('attempt_omr_') || attempt.id.startsWith('omr_') || attempt.id.includes('_omr_'))) return true;
  return false;
}

/**
 * Prunes an array of test attempts so that for every test (by testId),
 * we keep strictly AT MOST 2 records:
 * 1. The FIRST attempt (oldest completedAt/createdAt record)
 * 2. The LAST attempt (most recent completedAt/createdAt record)
 * 
 * When a user attempts a test for the 2nd time: both 1st and 2nd attempts exist.
 * When a user attempts a test for the 3rd+ time: 1st attempt stays untouched,
 * the previous last attempt is deleted, and the new attempt becomes the current last attempt.
 * 
 * Returns the pruned attempts array and the list of deleted/superseded attempt IDs.
 */
export function pruneAttemptsToFirstAndLast(attempts: TestAttempt[]): {
  pruned: TestAttempt[];
  removedAttemptIds: string[];
} {
  if (!Array.isArray(attempts) || attempts.length <= 1) {
    return { pruned: attempts || [], removedAttemptIds: [] };
  }

  const byTestId = new Map<string, TestAttempt[]>();
  attempts.forEach((a) => {
    if (!a || !a.id) return;
    const tId = a.testId || 'unknown';
    if (!byTestId.has(tId)) {
      byTestId.set(tId, []);
    }
    byTestId.get(tId)!.push(a);
  });

  const pruned: TestAttempt[] = [];
  const removedAttemptIds: string[] = [];

  byTestId.forEach((testAttempts) => {
    if (testAttempts.length <= 2) {
      // 1 or 2 attempts: keep them all
      pruned.push(...testAttempts);
    } else {
      // Sort chronologically ascending (oldest first)
      testAttempts.sort((a, b) => {
        const timeA = new Date(a.completedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.completedAt || b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      const firstAttempt = testAttempts[0];
      const lastAttempt = testAttempts[testAttempts.length - 1];

      // Mark all intermediate attempts (between first and last) for deletion
      for (let i = 1; i < testAttempts.length - 1; i++) {
        removedAttemptIds.push(testAttempts[i].id);
      }

      pruned.push(firstAttempt, lastAttempt);
    }
  });

  // Sort overall results descending by completion date for UI display
  pruned.sort((a, b) => {
    const timeA = new Date(b.completedAt || b.createdAt || 0).getTime();
    const timeB = new Date(a.completedAt || a.createdAt || 0).getTime();
    return timeA - timeB;
  });

  return { pruned, removedAttemptIds };
}

/**
 * Loads test attempt history scoped to the current user (or guest local mode).
 * Uses high-capacity IndexedDB as the primary storage engine to preserve full attempt
 * records (including OMR sheet scans) without 5MB storage limits.
 */
export function loadScopedAttempts(userId?: string | null): TestAttempt[] {
  try {
    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';

    // 1. Instant synchronous check from L1 In-Memory mirror
    const mem = getInMemoryAttempts(userId);
    if (mem && Array.isArray(mem)) {
      let rawAttempts: TestAttempt[] = [];
      if (!isGuest && userId && userId.trim() !== '') {
        rawAttempts = mem.filter((a: TestAttempt) => a && a.userId === userId.trim());
      } else {
        rawAttempts = mem.filter((a: TestAttempt) => a && (!a.userId || a.userId === 'guest-user' || a.userId === 'anonymous'));
      }
      const { pruned } = pruneAttemptsToFirstAndLast(rawAttempts);
      return pruned;
    }

    // 2. Trigger asynchronous IndexedDB hydration in background to warm in-memory cache
    getAllAttemptsFromIndexedDB(userId).then((idbAttempts) => {
      if (Array.isArray(idbAttempts) && idbAttempts.length > 0) {
        setInMemoryAttempts(userId, idbAttempts);
      }
    }).catch(() => {});

    // 3. Fallback to localStorage bootstrap cache for initial render
    const { attemptsKey } = getScopedStorageKeys(userId);
    let cached = localStorage.getItem(attemptsKey);

    // If guest storage is empty, attempt one-time migration from legacy key
    if (!cached && isGuest) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_ATTEMPTS_KEY);
      if (legacy) {
        cached = legacy;
        try {
          localStorage.setItem(GUEST_STORAGE_ATTEMPTS_KEY, legacy);
        } catch {}
      }
    }

    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        setInMemoryAttempts(userId, parsed);
        let rawAttempts: TestAttempt[] = [];
        if (!isGuest && userId && userId.trim() !== '') {
          rawAttempts = parsed.filter((a: TestAttempt) => a && a.userId === userId.trim());
        } else {
          rawAttempts = parsed.filter((a: TestAttempt) => a && (!a.userId || a.userId === 'guest-user' || a.userId === 'anonymous'));
        }

        const { pruned, removedAttemptIds } = pruneAttemptsToFirstAndLast(rawAttempts);
        if (removedAttemptIds.length > 0) {
          try {
            localStorage.setItem(attemptsKey, JSON.stringify(pruned));
          } catch {}
        }
        return pruned;
      }
    }
  } catch (err) {
    console.warn('Failed to load scoped attempts:', err);
  }
  return [];
}

/**
 * Saves test attempt history scoped to the active account or guest storage.
 * Automatically prunes attempts so only the first attempt and latest attempt are kept for each test.
 * Preserves high-resolution OMR scanned images in IndexedDB without quota restrictions.
 */
export function saveScopedAttempts(userId: string | null | undefined, attempts: TestAttempt[]): {
  pruned: TestAttempt[];
  removedAttemptIds: string[];
} {
  try {
    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
    const targetUid = isGuest ? 'guest-user' : userId!.trim();
    const { attemptsKey } = getScopedStorageKeys(userId);

    const safeAttempts = attempts.map((a) => {
      if (!a) return a;
      if (isGuest) {
        return {
          ...a,
          userId: (!a.userId || a.userId === 'anonymous' || a.userId === 'guest-user') ? (a.userId || 'guest-user') : 'guest-user'
        };
      }
      return {
        ...a,
        userId: a.userId || targetUid
      };
    });

    const { pruned, removedAttemptIds } = pruneAttemptsToFirstAndLast(safeAttempts);

    // 1. Immediate in-memory mirror update
    setInMemoryAttempts(userId, pruned);

    // 2. High-capacity IndexedDB persistence (Stores FULL attempt records including OMR sheets!)
    putAllAttemptsToIndexedDB(userId, pruned).catch((err) => {
      console.warn('IndexedDB putAllAttemptsToIndexedDB error:', err);
    });

    // 3. Best-effort mirror to localStorage (lightened version to avoid localStorage quota crash)
    const lightened = pruned.map((att) => {
      if (att.omrScannedImageUrl && att.omrScannedImageUrl.length > 5000) {
        const { omrScannedImageUrl, ...rest } = att;
        return rest as TestAttempt;
      }
      return att;
    });

    try {
      localStorage.setItem(attemptsKey, JSON.stringify(lightened));
    } catch {
      freeUpLocalStorageQuota(userId);
      try {
        localStorage.setItem(attemptsKey, JSON.stringify(lightened.slice(0, 10)));
      } catch {
        // Safe to ignore because IndexedDB holds authoritative data!
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('attempts-updated', { detail: { userId, source: 'saveScopedAttempts' } }));
    }

    return { pruned, removedAttemptIds };
  } catch (err) {
    console.warn('Failed to save scoped attempts:', err);
    return { pruned: attempts, removedAttemptIds: [] };
  }
}

/**
 * Loads all active running test sessions scoped to current user or guest storage.
 * Returns a dictionary mapping testId to ActiveTestSession.
 * Persisted in IndexedDB without risk of QuotaExceededError during exams.
 */
export function loadAllScopedActiveSessions(userId?: string | null): Record<string, ActiveTestSession> {
  try {
    // 1. Instant check from L1 In-Memory mirror
    const mem = getInMemoryActiveSessions(userId);
    if (mem && Object.keys(mem).length > 0) {
      return { ...mem };
    }

    // 2. Background hydration from IndexedDB
    getActiveSessionsFromIndexedDB(userId).then((idbSessions) => {
      if (idbSessions && Object.keys(idbSessions).length > 0) {
        setInMemoryActiveSessions(userId, idbSessions);
      }
    }).catch(() => {});

    // 3. Fallback to localStorage bootstrap
    const { activeSessionsMapKey, activeSessionKey } = getScopedStorageKeys(userId);
    const sessionsMap: Record<string, ActiveTestSession> = {};
    let needsResave = false;

    // Helper to validate whether a session is truly in progress
    const isValidSession = (sess: any): sess is ActiveTestSession => {
      if (!sess || !sess.testId || typeof sess.testId !== 'string' || !sess.hasStarted) {
        return false;
      }
      return true;
    };

    // 1. Read from multi-session map
    const rawMap = localStorage.getItem(activeSessionsMapKey);
    if (rawMap) {
      try {
        const parsed = JSON.parse(rawMap);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([tId, sess]: [string, any]) => {
            if (isValidSession(sess) && sess.testId === tId) {
              sessionsMap[tId] = sess;
            } else {
              needsResave = true;
            }
          });
        }
      } catch {
        needsResave = true;
      }
    }

    // 2. Backward compatibility: Read legacy single session key if present
    const rawLegacy = localStorage.getItem(activeSessionKey);
    if (rawLegacy) {
      try {
        const legacySess = JSON.parse(rawLegacy) as ActiveTestSession;
        if (isValidSession(legacySess)) {
          if (!sessionsMap[legacySess.testId]) {
            sessionsMap[legacySess.testId] = legacySess;
            needsResave = true;
          }
        } else {
          localStorage.removeItem(activeSessionKey);
        }
      } catch {
        localStorage.removeItem(activeSessionKey);
      }
    }

    if (needsResave && rawMap) {
      try {
        localStorage.setItem(activeSessionsMapKey, JSON.stringify(sessionsMap));
      } catch {}
    }

    setInMemoryActiveSessions(userId, sessionsMap);
    return sessionsMap;
  } catch (err) {
    console.warn('Failed to load active test sessions:', err);
    return {};
  }
}

/**
 * Saves all active test sessions dictionary scoped to current user or guest storage.
 */
export function saveAllScopedActiveSessions(
  userId: string | null | undefined,
  sessionsMap: Record<string, ActiveTestSession>
): void {
  try {
    // 1. Memory mirror
    setInMemoryActiveSessions(userId, sessionsMap);

    // 2. IndexedDB high-capacity persistence
    putActiveSessionsToIndexedDB(userId, sessionsMap).catch((err) => {
      console.warn('IndexedDB putActiveSessionsToIndexedDB error:', err);
    });

    // 3. Mirror to localStorage
    const { activeSessionsMapKey } = getScopedStorageKeys(userId);
    try {
      localStorage.setItem(activeSessionsMapKey, JSON.stringify(sessionsMap));
    } catch {
      freeUpLocalStorageQuota(userId);
      try {
        localStorage.setItem(activeSessionsMapKey, JSON.stringify(sessionsMap));
      } catch {}
    }
  } catch (err) {
    console.warn('Failed to save active test sessions:', err);
  }
}

/**
 * Loads active running test session scoped to current user or guest storage.
 * If testId is provided, returns the session for that specific testId.
 * If testId is not provided, returns the most recently updated active session.
 */
export function loadScopedActiveSession(userId?: string | null, testId?: string | null): ActiveTestSession | null {
  try {
    const sessionsMap = loadAllScopedActiveSessions(userId);

    // If specific testId requested:
    if (testId && testId.trim() !== '') {
      const cleanId = testId.trim();
      const sess = sessionsMap[cleanId];
      if (sess && sess.testId === cleanId && sess.hasStarted) {
        return sess;
      }
      return null;
    }

    // If no testId requested, return the most recently updated active session
    const sessions = Object.values(sessionsMap).filter((s) => s && s.hasStarted);
    if (sessions.length === 0) return null;

    sessions.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return sessions[0] || null;
  } catch (err) {
    console.warn('Failed to load active test session from localStorage:', err);
    return null;
  }
}

/**
 * Persists active running test session scoped to current user or guest storage.
 * If testId is provided (or derived from session.testId), stores into the sessions map.
 */
export function saveScopedActiveSession(
  userId: string | null | undefined, 
  session: ActiveTestSession | null, 
  testId?: string | null
): void {
  try {
    const targetTestId = testId?.trim() || session?.testId?.trim();

    if (session && targetTestId) {
      const sessionsMap = loadAllScopedActiveSessions(userId);
      sessionsMap[targetTestId] = session;
      saveAllScopedActiveSessions(userId, sessionsMap);

      const { activeSessionKey } = getScopedStorageKeys(userId);
      try {
        localStorage.setItem(activeSessionKey, JSON.stringify(session));
      } catch {}
    } else if (targetTestId) {
      // Clear this specific test session
      clearScopedActiveSession(userId, targetTestId);
    } else {
      // Clear all
      setInMemoryActiveSessions(userId, {});
      clearActiveSessionInIndexedDB(userId, null).catch(() => {});
      const { activeSessionsMapKey, activeSessionKey } = getScopedStorageKeys(userId);
      localStorage.removeItem(activeSessionsMapKey);
      localStorage.removeItem(activeSessionKey);
    }
  } catch (err) {
    console.warn('Failed to save active test session:', err);
  }
}

/**
 * Clears active running test session scoped to current user or guest storage.
 * If testId is provided, clears only that specific test's session across both scoped and guest stores.
 * If testId is omitted, clears all active sessions.
 */
export function clearScopedActiveSession(userId?: string | null, testId?: string | null): void {
  try {
    const targetTestId = testId?.trim();

    // 1. Clear in memory and IndexedDB
    clearActiveSessionInIndexedDB(userId, targetTestId || null).catch(() => {});
    if (userId) {
      clearActiveSessionInIndexedDB(null, targetTestId || null).catch(() => {});
    }

    const currentMap = getInMemoryActiveSessions(userId) || {};
    if (targetTestId) {
      delete currentMap[targetTestId];
      setInMemoryActiveSessions(userId, currentMap);
    } else {
      setInMemoryActiveSessions(userId, {});
    }

    // 2. Clear in localStorage
    const cleanKeysList = [
      getScopedStorageKeys(userId),
      getScopedStorageKeys(null), // Also check guest keys
    ];

    if (targetTestId) {
      cleanKeysList.forEach(({ activeSessionsMapKey, activeSessionKey }) => {
        try {
          const raw = localStorage.getItem(activeSessionsMapKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed[targetTestId]) {
              delete parsed[targetTestId];
              localStorage.setItem(activeSessionsMapKey, JSON.stringify(parsed));
            }
          }

          // Check single key
          const legacyRaw = localStorage.getItem(activeSessionKey);
          if (legacyRaw) {
            const parsedLegacy = JSON.parse(legacyRaw);
            if (parsedLegacy && parsedLegacy.testId === targetTestId) {
              localStorage.removeItem(activeSessionKey);
            }
          }
        } catch {}
      });
    } else {
      cleanKeysList.forEach(({ activeSessionsMapKey, activeSessionKey }) => {
        localStorage.removeItem(activeSessionsMapKey);
        localStorage.removeItem(activeSessionKey);
      });
    }
  } catch (err) {
    console.warn('Failed to clear active test session:', err);
  }
}

/**
 * Migrates any custom tests and attempts created during guest mode to the user's account.
 * This is triggered upon successful login.
 */
export function migrateGuestDataToUserAccount(
  userId: string,
  displayName: string | null,
  userEmail: string | null
): { migratedTests: MathTest[]; migratedAttempts: TestAttempt[] } {
  const migratedTests: MathTest[] = [];
  const migratedAttempts: TestAttempt[] = [];

  try {
    const cleanUid = userId?.trim();
    if (!cleanUid || cleanUid === 'guest-user' || cleanUid === 'anonymous') {
      return { migratedTests, migratedAttempts };
    }

    // 1. Migrate custom tests from guest storage and legacy keys (only if not already completed)
    const migrationFlagKey = `math_mock_migration_completed_${cleanUid}`;
    if (!localStorage.getItem(migrationFlagKey)) {
      const rawTestsSources = [
        localStorage.getItem(GUEST_STORAGE_TESTS_KEY),
        localStorage.getItem(LEGACY_STORAGE_TESTS_KEY),
        localStorage.getItem('math_mock_tests')
      ].filter(Boolean);

      for (const guestTestsRaw of rawTestsSources) {
        if (!guestTestsRaw) continue;
        try {
          const guestTests: MathTest[] = JSON.parse(guestTestsRaw);
          if (Array.isArray(guestTests)) {
            const userTests = loadScopedTests(cleanUid);
            const userTestIds = new Set(userTests.map(t => t.id));

            const deletedRaw = localStorage.getItem(`math_mock_deleted_tests_account_${cleanUid}`);
            const guestDeletedRaw = localStorage.getItem(GUEST_STORAGE_DELETED_TESTS_KEY);
            const deletedIds = new Set<string>([
              ...(deletedRaw ? JSON.parse(deletedRaw) : []),
              ...(guestDeletedRaw ? JSON.parse(guestDeletedRaw) : [])
            ]);

            const customGuestTests = guestTests.filter(
              t => t && t.id && !deletedIds.has(t.id) && !SAMPLE_MATH_TESTS.some(s => s.id === t.id)
            );

            customGuestTests.forEach(t => {
              if (!userTestIds.has(t.id)) {
                const migrated: MathTest = {
                  ...t,
                  authorId: cleanUid,
                  authorName: displayName || userEmail?.split('@')[0] || 'Teacher',
                  updatedAt: new Date().toISOString()
                };
                migratedTests.push(migrated);
                userTests.push(migrated);
                userTestIds.add(t.id);
              }
            });

            if (migratedTests.length > 0) {
              saveScopedTests(cleanUid, userTests);
              console.log(`Successfully migrated ${migratedTests.length} custom tests from guest/legacy storage to account ${cleanUid}`);
            }
          }
        } catch (err) {
          console.warn('Failed to parse guest tests during migration:', err);
        }
      }
    }

    // 2. Migrate attempts from guest storage and legacy keys (only if migration not already completed)
    if (!localStorage.getItem(migrationFlagKey)) {
      const rawAttemptsSources = [
        localStorage.getItem(GUEST_STORAGE_ATTEMPTS_KEY),
        localStorage.getItem(LEGACY_STORAGE_ATTEMPTS_KEY),
        localStorage.getItem('math_mock_attempts')
      ].filter(Boolean);

      for (const guestAttemptsRaw of rawAttemptsSources) {
        if (!guestAttemptsRaw) continue;
        try {
          const guestAttempts: TestAttempt[] = JSON.parse(guestAttemptsRaw);
          if (Array.isArray(guestAttempts)) {
            const userAttempts = loadScopedAttempts(cleanUid);
            const userAttemptIds = new Set(userAttempts.map(a => a.id));

            guestAttempts.forEach(a => {
              if (a && a.id && !userAttemptIds.has(a.id)) {
                const migrated: TestAttempt = {
                  ...a,
                  userId: cleanUid,
                  userEmail: userEmail || '',
                  userName: displayName || userEmail?.split('@')[0] || 'Learner'
                };
                migratedAttempts.push(migrated);
                userAttempts.push(migrated);
                userAttemptIds.add(a.id);
              }
            });

            if (migratedAttempts.length > 0) {
              saveScopedAttempts(cleanUid, userAttempts);
              console.log(`Successfully migrated ${migratedAttempts.length} test attempts locally to account ${cleanUid}`);
            }
          }
        } catch (err) {
          console.warn('Failed to parse guest attempts during migration:', err);
        }
      }
      try {
        localStorage.setItem(migrationFlagKey, 'true');
      } catch {}
    }

    // Clean up all guest AND legacy keys permanently to prevent re-triggering
    try {
      localStorage.removeItem(GUEST_STORAGE_TESTS_KEY);
      localStorage.removeItem(GUEST_STORAGE_ATTEMPTS_KEY);
      localStorage.removeItem(GUEST_STORAGE_ACTIVE_SESSION_KEY);
      localStorage.removeItem(GUEST_STORAGE_ACTIVE_SESSIONS_MAP_KEY);
      localStorage.removeItem(GUEST_STORAGE_DELETED_TESTS_KEY);
      localStorage.removeItem(LEGACY_STORAGE_TESTS_KEY);
      localStorage.removeItem(LEGACY_STORAGE_ATTEMPTS_KEY);
      localStorage.removeItem('math_mock_tests');
      localStorage.removeItem('math_mock_attempts');

      // Also clean up guest data from IndexedDB
      putAllTestsToIndexedDB('guest-user', []).catch(() => {});
      putAllAttemptsToIndexedDB('guest-user', []).catch(() => {});
      clearActiveSessionInIndexedDB('guest-user', null).catch(() => {});
    } catch {}

  } catch (err) {
    console.error('Error during guest data migration:', err);
  }

  return { migratedTests, migratedAttempts };
}

/**
 * On-demand test loader.
 * Checks memory, local storage, sample tests, and on-demand Firestore fetch.
 * Guarantees zero unnecessary reads when questions are already in memory or local cache.
 */
export async function loadFullTestOnDemand(
  testId: string, 
  memoryTests?: MathTest[], 
  userId?: string | null
): Promise<MathTest | null> {
  if (!testId) return null;

  // 1. Check in-memory tests first
  if (memoryTests && Array.isArray(memoryTests)) {
    const found = memoryTests.find((t) => t.id === testId);
    if (found && Array.isArray(found.questions) && found.questions.length > 0) {
      return found;
    }
  }

  // 2. Check local scoped storage cache
  const localScoped = loadScopedTests(userId);
  const foundLocal = localScoped.find((t) => t.id === testId);
  if (foundLocal && Array.isArray(foundLocal.questions) && foundLocal.questions.length > 0) {
    return foundLocal;
  }

  // 3. Check sample tests
  const sample = SAMPLE_MATH_TESTS.find((s) => s.id === testId);
  if (sample && Array.isArray(sample.questions) && sample.questions.length > 0) {
    return sample;
  }

  // 4. Fetch on demand from Firestore (single document read)
  try {
    const remote = await fetchFullTestFromFirestore(testId);
    if (remote && Array.isArray(remote.questions) && remote.questions.length > 0) {
      // Update local cache with hydrated test
      const updated = localScoped.map((t) => (t.id === testId ? remote : t));
      if (!updated.some((t) => t.id === testId)) {
        updated.push(remote);
      }
      saveScopedTests(userId, updated);
      return remote;
    }
  } catch (err) {
    console.warn(`Failed to fetch test ${testId} on demand:`, err);
  }

  return foundLocal || sample || null;
}

/**
 * Returns summary stats of local storage usage.
 */
export function getLocalDataStorageStats(userId?: string | null): {
  testsCount: number;
  attemptsCount: number;
  activeSessionsCount: number;
  approxSizeBytes: number;
  isOfflineMode: boolean;
} {
  const tests = loadScopedTests(userId);
  const attempts = loadScopedAttempts(userId);
  const sessions = loadAllScopedActiveSessions(userId);

  let approxSizeBytes = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('math_mock_')) {
          const val = localStorage.getItem(key);
          approxSizeBytes += (key.length + (val?.length || 0)) * 2;
        }
      }
    } catch {}
  }

  return {
    testsCount: tests.length,
    attemptsCount: attempts.length,
    activeSessionsCount: Object.keys(sessions).length,
    approxSizeBytes,
    isOfflineMode: isOfflineLocalOnlyMode(),
  };
}

/**
 * Exports all scoped tests, attempts, sessions, Gemini chats, notes, HTML notes, and app preferences to a downloadable JSON string.
 */
export async function exportAllLocalDataAsJson(userId?: string | null): Promise<string> {
  const tests = loadScopedTests(userId);
  const attempts = loadScopedAttempts(userId);
  const sessions = loadAllScopedActiveSessions(userId);
  const chatSessions = loadScopedChatSessions(userId);

  // Fetch all notes from IndexedDB
  let notes: any[] = [];
  try {
    notes = await getAllNotesFromIDB();
  } catch (err) {
    console.warn('Failed to retrieve notes for JSON backup:', err);
  }

  // Fetch HTML Notes / Notes Studio projects
  let htmlProjects: any[] = [];
  try {
    htmlProjects = loadLocalProjects(undefined, userId);
    if (!htmlProjects || htmlProjects.length === 0) {
      const fallbackProjs = loadLocalProjects(undefined, null);
      if (fallbackProjs && fallbackProjs.length > 0) {
        htmlProjects = fallbackProjs;
      }
    }
  } catch (err) {
    console.warn('Failed to retrieve HTML notes for JSON backup:', err);
  }

  // App preferences
  let theme = 'light';
  let geminiSettings: any = null;
  let uiScale: any = null;
  if (typeof localStorage !== 'undefined') {
    try {
      theme = localStorage.getItem('math_mock_theme_v1') || 'light';
      const rawSettings = localStorage.getItem('gemini_user_settings_v1');
      if (rawSettings) geminiSettings = JSON.parse(rawSettings);
      const rawScale = localStorage.getItem('mockmc_ui_scale_config');
      if (rawScale) uiScale = JSON.parse(rawScale);
    } catch {}
  }

  const payload = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    scope: userId || 'guest',
    tests,
    attempts,
    sessions,
    chatSessions,
    notes,
    htmlProjects,
    preferences: {
      theme,
      geminiSettings,
      uiScale,
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Imports tests, attempts, active sessions, Gemini AI chats, study notes, and preferences
 * from a JSON backup string into local storage and IndexedDB.
 * Seamlessly supports both legacy version 1.0 backups and comprehensive version 2.0 archives.
 */
export async function importAllLocalDataFromJson(
  jsonStr: string,
  userId?: string | null
): Promise<{
  success: boolean;
  testsCount: number;
  attemptsCount: number;
  chatsCount: number;
  notesCount: number;
  htmlProjectsCount: number;
  mergedTests: MathTest[];
  mergedAttempts: TestAttempt[];
  message?: string;
}> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, testsCount: 0, attemptsCount: 0, chatsCount: 0, notesCount: 0, htmlProjectsCount: 0, mergedTests: [], mergedAttempts: [], message: 'Invalid JSON format' };
    }

    const isGuest = !userId || userId === 'guest-user' || userId === 'anonymous';
    const targetUid = isGuest ? 'guest-user' : userId!.trim();

    let addedTests = 0;
    let addedAttempts = 0;
    let addedChats = 0;
    let addedNotes = 0;
    let addedHtmlProjects = 0;
    let mergedTestsResult: MathTest[] = [];
    let mergedAttemptsResult: TestAttempt[] = [];

    // 1. Process and merge tests
    if (Array.isArray(parsed.tests) && parsed.tests.length > 0) {
      const currentTests = loadScopedTests(userId);
      const testMap = new Map<string, MathTest>();

      // Load existing tests
      currentTests.forEach((t) => {
        if (t && t.id) testMap.set(t.id, t);
      });

      const restoredTestIds: string[] = [];

      parsed.tests.forEach((t: MathTest) => {
        if (t && t.id) {
          // Unmark test ID from deleted list so imported tests are always visible
          unmarkTestAsDeletedInScopedStorage(userId, t.id);
          restoredTestIds.push(t.id);

          // Adapt authorId to match target scope and mark as pending so it is never treated as deleted remotely
          const adaptedTest: MathTest = {
            ...t,
            authorId: isGuest ? 'guest-user' : targetUid,
            _syncStatus: 'pending',
            updatedAt: t.updatedAt || new Date().toISOString(),
          };

          if (!testMap.has(t.id)) {
            addedTests++;
          }
          testMap.set(t.id, adaptedTest);
        }
      });

      // Batch unmark tombstones in cloud user profile if authenticated
      if (!isGuest && restoredTestIds.length > 0) {
        unmarkMultipleDeletedTestsInFirestore(restoredTestIds, targetUid).catch(() => {});
      }

      mergedTestsResult = Array.from(testMap.values());
      saveScopedTests(userId, mergedTestsResult);
      putAllTestsToIndexedDB(userId, mergedTestsResult).catch(() => {});
    } else {
      mergedTestsResult = loadScopedTests(userId);
    }

    // 2. Process and merge attempts
    if (Array.isArray(parsed.attempts) && parsed.attempts.length > 0) {
      const currentAttempts = loadScopedAttempts(userId);
      const attemptMap = new Map<string, TestAttempt>();

      currentAttempts.forEach((a) => {
        if (a && a.id) attemptMap.set(a.id, a);
      });

      parsed.attempts.forEach((a: TestAttempt) => {
        if (a && a.id) {
          const adaptedAttempt: TestAttempt = {
            ...a,
            userId: isGuest ? 'guest-user' : targetUid,
            _syncStatus: 'pending',
          };

          if (!attemptMap.has(a.id)) {
            addedAttempts++;
          }
          attemptMap.set(a.id, adaptedAttempt);
        }
      });

      mergedAttemptsResult = Array.from(attemptMap.values());
      saveScopedAttempts(userId, mergedAttemptsResult);
      putAllAttemptsToIndexedDB(userId, mergedAttemptsResult).catch(() => {});
    } else {
      mergedAttemptsResult = loadScopedAttempts(userId);
    }

    // 3. Process active running test sessions if present
    if (parsed.sessions && typeof parsed.sessions === 'object') {
      try {
        const currentSessions = loadAllScopedActiveSessions(userId);
        const mergedSessions = { ...currentSessions, ...parsed.sessions };
        saveAllScopedActiveSessions(userId, mergedSessions);
        putActiveSessionsToIndexedDB(userId, mergedSessions).catch(() => {});
      } catch (err) {
        console.warn('Failed to restore active sessions from backup:', err);
      }
    }

    // 4. Process and merge Gemini Chat Sessions (version 2.0)
    const incomingChats = parsed.chatSessions || parsed.chats || parsed.chatHistory;
    if (Array.isArray(incomingChats) && incomingChats.length > 0) {
      try {
        const currentChats = loadScopedChatSessions(userId);
        const chatMap = new Map<string, any>();

        currentChats.forEach((c) => {
          const cid = c.id || c.sessionId;
          if (cid) chatMap.set(cid, c);
        });

        incomingChats.forEach((c: any) => {
          const cid = c.id || c.sessionId;
          if (cid) {
            unmarkChatSessionAsDeletedInScopedStorage(userId, cid);
            const adaptedChat = {
              ...c,
              _syncStatus: 'pending',
            };
            if (!chatMap.has(cid)) {
              addedChats++;
            }
            chatMap.set(cid, adaptedChat);
          }
        });

        const mergedChats = Array.from(chatMap.values());
        saveScopedChatSessions(userId, mergedChats);
        putAllChatSessionsToIndexedDB(userId, mergedChats).catch(() => {});
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gemini-chats-updated', { detail: { count: mergedChats.length } }));
        }
      } catch (err) {
        console.warn('Failed to restore chat sessions from backup:', err);
      }
    }

    // 5. Process and merge Study Notes (version 2.0)
    if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
      try {
        let currentNotes: any[] = [];
        try {
          currentNotes = await getAllNotesFromIDB();
        } catch {}

        const notesMap = new Map<string, any>();
        currentNotes.forEach((n) => {
          if (n && n.id) notesMap.set(n.id, n);
        });

        const noteIdsToUntombstone: string[] = [];

        parsed.notes.forEach((n: any) => {
          if (n && n.id) {
            noteIdsToUntombstone.push(n.id);
            if (n.driveFileId) {
              noteIdsToUntombstone.push(n.driveFileId);
            }
            if (!notesMap.has(n.id)) {
              addedNotes++;
            }
            notesMap.set(n.id, n);
          }
        });

        // Untombstone restored notes so IDB queries never filter them out
        removeMultipleTombstones(noteIdsToUntombstone);

        const mergedNotes = Array.from(notesMap.values());
        await saveAllNotesToIDB(mergedNotes, true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notes-updated'));
        }
      } catch (err) {
        console.warn('Failed to restore notes from backup:', err);
      }
    }

    // 6. Process and merge HTML Notes / Notes Studio Projects
    const incomingHtmlProjects = parsed.htmlProjects || parsed.htmlNotes || parsed.html_projects;
    if (Array.isArray(incomingHtmlProjects) && incomingHtmlProjects.length > 0) {
      try {
        const currentHtmlProjects = loadLocalProjects(undefined, userId);
        const projMap = new Map<string, any>();
        currentHtmlProjects.forEach((p) => {
          if (p && p.id) projMap.set(p.id, p);
        });

        incomingHtmlProjects.forEach((p: any) => {
          if (p && p.id) {
            if (!projMap.has(p.id)) {
              addedHtmlProjects++;
            }
            projMap.set(p.id, p);
          }
        });

        const mergedHtmlProjects = Array.from(projMap.values());
        saveLocalProjects(mergedHtmlProjects, userId, true);

        if (!isGuest) {
          queueFirestoreSync(mergedHtmlProjects, true);
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('html-notes-updated', { detail: { count: mergedHtmlProjects.length } }));
        }
      } catch (err) {
        console.warn('Failed to restore HTML projects from backup:', err);
      }
    }

    // 7. Restore Preferences (version 2.0)
    if (parsed.preferences && typeof parsed.preferences === 'object') {
      try {
        const { theme, geminiSettings, uiScale } = parsed.preferences;
        if (theme && (theme === 'dark' || theme === 'light')) {
          localStorage.setItem('math_mock_theme_v1', theme);
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        if (geminiSettings) {
          localStorage.setItem('gemini_user_settings_v1', JSON.stringify(geminiSettings));
        }
        if (uiScale) {
          localStorage.setItem('mockmc_ui_scale_config', JSON.stringify(uiScale));
        }
      } catch (err) {
        console.warn('Failed to restore preferences:', err);
      }
    }

    // Broadcast synchronization events across tabs and to memory sync manager
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('mockmc-backup-restored', {
          detail: {
            tests: mergedTestsResult,
            attempts: mergedAttemptsResult,
            userId: targetUid,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('math-mock-storage-hydrated', {
          detail: {
            userId: targetUid,
            source: 'importBackup',
          },
        })
      );
    }

    const summaryParts: string[] = [];
    if (addedTests > 0) summaryParts.push(`${addedTests} tests`);
    if (addedAttempts > 0) summaryParts.push(`${addedAttempts} attempts`);
    if (addedChats > 0) summaryParts.push(`${addedChats} chats`);
    if (addedNotes > 0) summaryParts.push(`${addedNotes} notes`);
    if (addedHtmlProjects > 0) summaryParts.push(`${addedHtmlProjects} HTML projects`);

    const summaryStr = summaryParts.length > 0 ? summaryParts.join(', ') : 'All backup items synchronized';

    return {
      success: true,
      testsCount: addedTests,
      attemptsCount: addedAttempts,
      chatsCount: addedChats,
      notesCount: addedNotes,
      htmlProjectsCount: addedHtmlProjects,
      mergedTests: mergedTestsResult,
      mergedAttempts: mergedAttemptsResult,
      message: `Successfully imported backup! (${summaryStr})`,
    };
  } catch (err: any) {
    return {
      success: false,
      testsCount: 0,
      attemptsCount: 0,
      chatsCount: 0,
      notesCount: 0,
      htmlProjectsCount: 0,
      mergedTests: [],
      mergedAttempts: [],
      message: `Import failed: ${err.message || String(err)}`,
    };
  }
}

/**
 * Completely purges all local storage data, caches, and offline queues associated with a specific user ID.
 */
export function wipeAllScopedUserDataFromLocalStorage(userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    const cleanUid = (userId && typeof userId === 'string') ? userId.trim() : null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // If user-specific key matches cleanUid
      if (cleanUid && key.includes(cleanUid)) {
        keysToRemove.push(key);
      }
    }

    if (cleanUid) {
      const { testsKey, attemptsKey, activeSessionKey, activeSessionsMapKey, deletedTestsKey, chatSessionsKey } = getScopedStorageKeys(cleanUid);
      keysToRemove.push(testsKey, attemptsKey, activeSessionKey, activeSessionsMapKey, deletedTestsKey, chatSessionsKey);
      keysToRemove.push(`math_mock_tests_account_${cleanUid}`);
      keysToRemove.push(`math_mock_attempts_account_${cleanUid}`);
      keysToRemove.push(`math_mock_active_session_account_${cleanUid}`);
      keysToRemove.push(`math_mock_active_sessions_map_account_${cleanUid}`);
      keysToRemove.push(`math_mock_deleted_tests_account_${cleanUid}`);
      keysToRemove.push(`math_mock_chat_sessions_account_${cleanUid}`);
      keysToRemove.push(`math_mock_offline_queue_user_${cleanUid}`);
      keysToRemove.push(`math_mock_offline_user_${cleanUid}`);
      keysToRemove.push(`math_mock_user_settings_${cleanUid}`);
      keysToRemove.push(CACHED_AUTH_USER_KEY);

      // Clean up from IndexedDB
      putAllTestsToIndexedDB(cleanUid, []).catch(() => {});
      putAllAttemptsToIndexedDB(cleanUid, []).catch(() => {});
      clearActiveSessionInIndexedDB(cleanUid, null).catch(() => {});
      clearAllChatSessionsInIndexedDB(cleanUid).catch(() => {});
    }

    // Remove identified keys
    const uniqueKeys = Array.from(new Set(keysToRemove));
    uniqueKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch (err) {
    console.warn('Failed to wipe scoped user data from localStorage:', err);
  }
}

/**
 * Returns breakdown stats for user's custom app activity data.
 */
export function getCustomDataStats(userId?: string | null) {
  const tests = loadScopedTests(userId);
  const attempts = loadScopedAttempts(userId);
  const chatSessions = loadScopedChatSessions(userId);

  const omrAttemptsCount = attempts.filter(
    (a) => a.attemptMode === 'omr' || Boolean(a.omrScannedImageUrl)
  ).length;

  const onlineAttemptsCount = attempts.filter(
    (a) => a.attemptMode !== 'omr' && !a.omrScannedImageUrl
  ).length;

  let notesCount = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('mockmc_saved_notes_permanent');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) notesCount = parsed.length;
      }
    } catch {}
  }

  let htmlProjectsCount = 0;
  let htmlNotesCount = 0;
  try {
    const projs = loadLocalProjects(undefined, userId);
    if (projs && Array.isArray(projs)) {
      htmlProjectsCount = projs.length;
      htmlNotesCount = projs.reduce((acc, p) => acc + (p.files?.length || 0), 0);
    }
  } catch {}

  return {
    authoredTestsCount: tests.length,
    totalAttemptsCount: attempts.length,
    omrAttemptsCount,
    onlineAttemptsCount,
    chatHistoriesCount: chatSessions.length,
    notesCount,
    htmlProjectsCount,
    htmlNotesCount,
  };
}

/**
 * Deletes all authored tests for the user.
 */
export async function deleteCustomDataAuthoredTests(userId?: string | null): Promise<number> {
  const tests = loadScopedTests(userId);
  const count = tests.length;
  saveScopedTests(userId, []);

  for (const t of tests) {
    markTestAsDeletedInScopedStorage(userId, t.id);
  }

  if (userId && userId !== 'guest-user' && userId !== 'anonymous') {
    for (const t of tests) {
      try {
        await deleteTestFromFirestore(t.id, userId);
      } catch (err) {
        console.warn(`Failed to delete test ${t.id} from Firestore:`, err);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tests-updated'));
  }
  return count;
}

/**
 * Selectively deletes exam attempts (All, OMR only, or Online only).
 */
export async function deleteCustomDataAttempts(
  userId?: string | null,
  filter: 'all' | 'omr' | 'online' = 'all'
): Promise<number> {
  const currentAttempts = loadScopedAttempts(userId);
  let remainingAttempts: TestAttempt[] = [];
  let deletedAttempts: TestAttempt[] = [];

  if (filter === 'omr') {
    remainingAttempts = currentAttempts.filter(
      (a) => a.attemptMode !== 'omr' && !a.omrScannedImageUrl
    );
    deletedAttempts = currentAttempts.filter(
      (a) => a.attemptMode === 'omr' || Boolean(a.omrScannedImageUrl)
    );
  } else if (filter === 'online') {
    remainingAttempts = currentAttempts.filter(
      (a) => a.attemptMode === 'omr' || Boolean(a.omrScannedImageUrl)
    );
    deletedAttempts = currentAttempts.filter(
      (a) => a.attemptMode !== 'omr' && !a.omrScannedImageUrl
    );
  } else {
    deletedAttempts = [...currentAttempts];
    remainingAttempts = [];
  }

  saveScopedAttempts(userId, remainingAttempts);

  if (userId && userId !== 'guest-user' && userId !== 'anonymous') {
    for (const a of deletedAttempts) {
      try {
        await deleteAttemptFromFirestore(a.id, userId);
      } catch (err) {
        console.warn(`Failed to delete attempt ${a.id} from Firestore:`, err);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('attempts-updated'));
  }

  return deletedAttempts.length;
}

/**
 * Clears all Gemini AI chat sessions and conversation histories.
 */
export async function deleteCustomDataChatHistories(userId?: string | null): Promise<number> {
  const sessions = loadScopedChatSessions(userId);
  const count = sessions.length;
  
  // Mark all as deleted
  sessions.forEach((s) => {
    if (s && s.id) {
      markChatSessionAsDeletedInScopedStorage(userId, s.id);
    }
  });

  saveScopedChatSessions(userId, []);
  clearAllChatSessionsInIndexedDB(userId).catch(() => {});

  if (userId && userId !== 'guest-user' && userId !== 'anonymous') {
    for (const s of sessions) {
      try {
        const sid = s.id || s.sessionId;
        if (sid) {
          await deleteChatSessionFromFirestore(userId, sid);
        }
      } catch (err) {
        console.warn(`Failed to delete chat session from Firestore:`, err);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gemini-chats-cleared'));
  }

  return count;
}

/**
 * Deletes all study notes from local IndexedDB and backup caches.
 */
export async function deleteCustomDataNotes(): Promise<number> {
  let count = 0;
  try {
    const notes = await getAllNotesFromIDB();
    count = notes.length;
    await saveAllNotesToIDB([], true);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mockmc_saved_notes_permanent');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notes-updated'));
    }
  } catch (err) {
    console.warn('Failed to delete custom data notes:', err);
  }
  return count;
}



