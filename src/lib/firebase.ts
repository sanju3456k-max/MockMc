import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  deleteUser,
  reauthenticateWithPopup,
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  getDocFromServer,
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  deleteDoc, 
  writeBatch,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  setLogLevel,
  limit,
  deleteField,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  normalizeQuestions, 
  type MathTest, 
  type TestAttempt, 
  type UserProfile, 
  type AppSettings, 
  type TestHistoryEntry, 
  type ActiveTestSession,
  type StatsRollup 
} from '../types';
import { SAMPLE_MATH_TESTS } from '../data/sampleTests';
import { firestoreTelemetry } from './firestoreTelemetry';
import { isOfflineLocalOnlyMode, wipeAllScopedUserDataFromLocalStorage, loadScopedChatSessions, getAllDeletedChatSessionIds } from './storage';
import { toCompactChatSession } from './smartLocalCoordinator';
import { optimizeTestForFirestore } from './imageOptimization';

// Suppress transient offline logs in dev iframe
try {
  setLogLevel('silent');
} catch (e) {}

let globalQuotaExceeded = false;
let quotaExceededDate: string | null = null;

export function isGlobalQuotaExceeded(): boolean {
  return globalQuotaExceeded;
}

export function setGlobalQuotaExceeded(val: boolean): void {
  globalQuotaExceeded = val;
  if (val) {
    quotaExceededDate = new Date().toDateString();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', {
        detail: { error: 'Quota limit exceeded' }
      }));
    }
  } else {
    quotaExceededDate = null;
  }
}

export function resetGlobalQuotaExceeded(): void {
  globalQuotaExceeded = false;
  quotaExceededDate = null;
  try {
    setLogLevel('silent');
  } catch (e) {}
}

export function checkAndResetQuotaOnNewDay(): boolean {
  if (globalQuotaExceeded && quotaExceededDate) {
    const today = new Date().toDateString();
    if (today !== quotaExceededDate) {
      console.log('New day detected! Resetting Firestore quota flags.');
      resetGlobalQuotaExceeded();
      return true;
    }
  }
  return false;
}

// 0. Clean up any stale WebStorage keys left by persistentMultipleTabManager that consumed browser localStorage quota
export function cleanupOrphanedFirestoreWebStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('firestore_mutations_') ||
        key.startsWith('firestore_clients_') ||
        key.startsWith('firestore_online_state_') ||
        key.startsWith('firestore_active_tab_') ||
        key.startsWith('firestore_tab_') ||
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
    if (keysToRemove.length > 0) {
      console.log(`Purged ${keysToRemove.length} orphaned Firestore WebStorage keys from localStorage.`);
    }
  } catch (e) {
    console.warn('Storage cleanup warning:', e);
  }
}

// Execute initial storage cleanup immediately
if (typeof window !== 'undefined') {
  cleanupOrphanedFirestoreWebStorage();
}

// 1. Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 2. Initialize Firestore targeting the provisioned database ID with safe in-memory cache
const databaseId =
  (firebaseConfig as any).firestoreDatabaseId ||
  (firebaseConfig as any).databaseId ||
  'ai-studio-remixremixremixr-40313a1d-fb15-4aa9-a549-62895c71b480';

export const db = (() => {
  if (typeof window === 'undefined') {
    return getFirestore(app, databaseId);
  }
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    }, databaseId);
  } catch (err) {
    return getFirestore(app, databaseId);
  }
})();

// Validate connection to Firestore on boot (at most once per session)
if (typeof window !== 'undefined') {
  try {
    const hasTestedConn = sessionStorage.getItem('firebase_conn_tested');
    if (!hasTestedConn) {
      sessionStorage.setItem('firebase_conn_tested', 'true');
      if (typeof navigator === 'undefined' || navigator.onLine) {
        getDoc(doc(db, 'test', 'connection')).catch((error) => {
          if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('code=unavailable'))) {
            console.warn('Firestore connection notice: Client is offline or unreachable.');
          }
        });
      }
    }
  } catch {}

  // Global handler for unhandled offline Firestore promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && typeof reason === 'object') {
      const msg = String(reason.message || reason.toString() || '');
      if (
        msg.includes('client is offline') ||
        msg.includes('code=unavailable') ||
        msg.includes('Failed to get document') ||
        msg.includes('Could not reach Cloud Firestore backend')
      ) {
        event.preventDefault();
        console.warn('Handled offline Firestore rejection gracefully:', msg);
      }
    }
  });
}

// 3. Initialize Firebase Auth
export const auth = (() => {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (err) {
    return getAuth(app);
  }
})();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
googleProvider.addScope('https://www.googleapis.com/auth/documents');

let cachedAccessToken: string | null = null;

export function isGoogleDriveTokenExpired(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const rawToken = cachedAccessToken || sessionStorage.getItem('mockmc_google_access_token');
    const hadAuth = localStorage.getItem('mockmc_had_google_auth') === 'true';
    if (!rawToken && hadAuth) return true;
    if (rawToken) {
      const storedTimeStr = sessionStorage.getItem('mockmc_google_token_time');
      if (storedTimeStr) {
        const storedTime = parseInt(storedTimeStr, 10);
        // Google OAuth access tokens expire in 3600 seconds (1 hour)
        if (Date.now() - storedTime >= 3600 * 1000) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

export function clearGoogleDriveAuth(): void {
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('mockmc_google_access_token');
    sessionStorage.removeItem('mockmc_google_token_time');
    localStorage.removeItem('mockmc_had_google_auth');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockmc-drive-token-changed', { detail: null }));
    }
  } catch {}
}

export function getCachedGoogleAccessToken(): string | null {
  if (isGoogleDriveTokenExpired()) {
    return null;
  }
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  try {
    const stored = sessionStorage.getItem('mockmc_google_access_token');
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
}

export function setCachedGoogleAccessToken(token: string | null): void {
  cachedAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem('mockmc_google_access_token', token);
      sessionStorage.setItem('mockmc_google_token_time', Date.now().toString());
      localStorage.setItem('mockmc_had_google_auth', 'true');
    } else {
      sessionStorage.removeItem('mockmc_google_access_token');
      sessionStorage.removeItem('mockmc_google_token_time');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockmc-drive-token-changed', { detail: token }));
    }
  } catch {}
}

// Operation Types for error logging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMessage = error instanceof Error ? error.message : String(error);
  const lowerMsg = errMessage.toLowerCase();
  
  const isPermissionDenied = 
    lowerMsg.includes('permission-denied') || 
    lowerMsg.includes('permission denied') || 
    lowerMsg.includes('insufficient permissions');

  if (isPermissionDenied) {
    const errInfo: FirestoreErrorInfo = {
      error: errMessage,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        emailVerified: auth.currentUser?.emailVerified || null,
        isAnonymous: auth.currentUser?.isAnonymous || null,
        tenantId: auth.currentUser?.tenantId || null,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      }
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  const isOffline = 
    lowerMsg.includes('unavailable') || 
    lowerMsg.includes('offline') || 
    lowerMsg.includes('could not reach cloud firestore backend') ||
    lowerMsg.includes("backend didn't respond") ||
    lowerMsg.includes('network-request-failed') ||
    lowerMsg.includes('failed to get document from server') ||
    lowerMsg.includes('database is closing') ||
    lowerMsg.includes('closing/hidden') ||
    lowerMsg.includes('client is offline');

  const isBrowserStorageError =
    lowerMsg.includes('setitem') ||
    lowerMsg.includes('storage') ||
    lowerMsg.includes('quotaexceedederror') ||
    (lowerMsg.includes('quota') && lowerMsg.includes('exceeded') && lowerMsg.includes('storage'));

  const isFirestoreCloudQuotaExceeded = 
    !isBrowserStorageError && (
      lowerMsg.includes('resource-exhausted') ||
      lowerMsg.includes('resource_exhausted') ||
      lowerMsg.includes('free daily read units per project') ||
      (lowerMsg.includes('quota') && (lowerMsg.includes('limit') || lowerMsg.includes('project') || lowerMsg.includes('daily'))) ||
      lowerMsg.includes('billing')
    );

  if (isBrowserStorageError) {
    console.warn(`Browser Storage Quota Warning during '${operationType}' on '${path}'. Purging orphaned storage.`);
    cleanupOrphanedFirestoreWebStorage();
    try {
      wipeAllScopedUserDataFromLocalStorage();
    } catch {}
    return;
  }

  if (isFirestoreCloudQuotaExceeded) {
    console.warn(`Firestore Quota Limit Exceeded during '${operationType}' on '${path}':`, errMessage);
    setGlobalQuotaExceeded(true);
    return;
  }

  if (isOffline) {
    console.warn(`Firestore operation '${operationType}' on '${path}' in offline mode:`, errMessage);
    return;
  }

  console.warn(`Firestore Warning on '${path}' (${operationType}):`, errMessage);
}

// Connection check
export async function testFirestoreConnection(): Promise<boolean> {
  if (isGlobalQuotaExceeded()) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return true;
}

// ==========================================
// Authentication Helpers
// ==========================================
let activeSignInPromise: Promise<User | null> | null = null;

export async function signInWithGoogle(): Promise<User | null> {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    const start = performance.now();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const duration = Math.round(performance.now() - start);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedGoogleAccessToken(credential.accessToken);
      }
      
      if (result.user) {
        firestoreTelemetry.setAuthContext({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          isAnonymous: result.user.isAnonymous,
        });

        firestoreTelemetry.record({
          type: 'AUTH',
          collection: 'auth',
          path: 'auth/signInWithPopup',
          operation: 'signInWithPopup',
          durationMs: duration,
          data: {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            providerId: result.providerId,
          },
          caller: 'Google Authentication Popup',
          status: 'success',
          statusCode: 'AUTH_SUCCESS',
        });

        syncUserProfile(result.user).catch((err) => {
          console.warn('Background sync user profile warning:', err);
        });
      }
      return result.user;
    } catch (error: any) {
      const errCode = error?.code || '';
      const errMsg = (error?.message || String(error || '')).toLowerCase();

      // Silently handle user closing popup manually or duplicate concurrent popup request cancellation
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('closed-by-user') ||
        errMsg.includes('cancelled-popup-request')
      ) {
        return null;
      }

      const duration = Math.round(performance.now() - start);
      console.warn('Popup sign in encountered error/blocked:', error);
      
      firestoreTelemetry.record({
        type: 'AUTH',
        collection: 'auth',
        path: 'auth/signInWithPopup',
        operation: 'signInWithPopup',
        durationMs: duration,
        caller: 'Google Authentication Popup',
        status: 'error',
        statusCode: error?.code || 'AUTH_FAILED',
        error: String(error?.message || error),
      });

      // Catch network request failed error cleanly
      if (
        errCode === 'auth/network-request-failed' ||
        errMsg.includes('network-request-failed') ||
        errMsg.includes('network error')
      ) {
        console.warn('Firebase authentication network request failed.');
        throw new Error('Network request failed during authentication. Please check your internet connection or try opening the app in a new tab.');
      }

      // Detect iframe environment where signInWithRedirect will fail with cross-origin errors
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (
        errCode === 'auth/popup-blocked' ||
        errMsg.includes('database is closing') ||
        errMsg.includes('closing/hidden')
      ) {
        if (isInIframe) {
          throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site or open the app in a new browser tab.');
        }
        try {
          await signInWithRedirect(auth, googleProvider);
          return null;
        } catch (redirectError: any) {
          console.warn('Redirect sign-in fallback error:', redirectError);
          throw new Error('Sign-in popup was blocked and redirect failed. Please allow popups for this site or open the app in a new window.');
        }
      }
      throw error;
    } finally {
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
}

export async function checkRedirectResult(): Promise<User | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  try {
    const redirectPromise = getRedirectResult(auth);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    const result = await Promise.race([redirectPromise, timeoutPromise]);
    if (result && typeof result === 'object' && 'user' in result && result.user) {
      firestoreTelemetry.setAuthContext({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        isAnonymous: result.user.isAnonymous,
      });
      firestoreTelemetry.record({
        type: 'AUTH',
        collection: 'auth',
        path: 'auth/getRedirectResult',
        operation: 'getRedirectResult',
        data: { uid: result.user.uid, email: result.user.email },
        caller: 'Firebase Redirect Auth Handler',
        statusCode: 'AUTH_SUCCESS',
      });
      syncUserProfile(result.user).catch((err) => {
        console.warn('Redirect background sync warning:', err);
      });
      return result.user;
    }
    return null;
  } catch (error) {
    console.warn('Check redirect result warning:', error);
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  const start = performance.now();
  try {
    invalidateFirestoreCaches();
    cachedAccessToken = null;
    await signOut(auth);
    const duration = Math.round(performance.now() - start);
    
    firestoreTelemetry.setAuthContext({
      uid: null,
      email: null,
      displayName: null,
      isAnonymous: true,
    });

    firestoreTelemetry.record({
      type: 'AUTH',
      collection: 'auth',
      path: 'auth/signOut',
      operation: 'signOut',
      durationMs: duration,
      data: { status: 'logged_out' },
      caller: 'User Sign Out Action',
      status: 'success',
      statusCode: 'AUTH_SIGNOUT_OK',
    });
  } catch (error) {
    console.error('Sign Out Error:', error);
    throw error;
  }
}

// Helper to sanitize objects for Firestore (removes undefined fields and non-serializable properties)
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined || data === null) return null as unknown as T;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return deepCleanUndefined(data);
  }
}

function deepCleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepCleanUndefined).filter((val) => val !== undefined);
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && typeof v !== 'function') {
      clean[k] = deepCleanUndefined(v);
    }
  }
  return clean;
}

// ==========================================
// User Profile Synchronization
// ==========================================
const SYNCED_USERS_SESSION_KEY = 'math_mock_synced_uids_session';
const SYNCED_USERS_PERSISTENT_KEY_PREFIX = 'math_mock_profile_synced_v3_';

export async function syncUserProfile(user: User, force = false): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !user || !user.uid) return;

  const persistentKey = `${SYNCED_USERS_PERSISTENT_KEY_PREFIX}${user.uid}`;

  // Persistent Dirty Check: Never write to users/{uid} on reload if profile has not changed within 24 hours
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(persistentKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const email = user.email || '';
        const displayName = user.displayName || user.email?.split('@')[0] || 'Math Learner';
        const photoURL = user.photoURL || '';
        const ageMs = Date.now() - (cached.syncedAt || 0);
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        if (
          cached.uid === user.uid &&
          cached.email === email &&
          cached.displayName === displayName &&
          cached.photoURL === photoURL &&
          ageMs < ONE_DAY_MS
        ) {
          // Zero-write: Local cache matches user identity and token is fresh
          return;
        }
      }
    } catch {}
  }

  // Also check session storage as fallback
  if (!force && typeof sessionStorage !== 'undefined') {
    try {
      const synced = sessionStorage.getItem(SYNCED_USERS_SESSION_KEY);
      if (synced && synced.includes(user.uid)) {
        return; // Already synced profile in this session (0 writes)
      }
    } catch {}
  }

  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const now = new Date().toISOString();
    
    const profileData: Record<string, any> = {
      id: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Math Learner',
      lastLoginAt: now,
      updatedAt: now,
    };
    
    if (user.photoURL) {
      profileData.photoURL = user.photoURL;
    }

    await setDoc(userDocRef, profileData, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path,
      operation: 'setDoc',
      data: profileData,
      caller: 'User Profile Sync (Session Initial)',
    });

    // Cache dirty-check fingerprint persistently to guarantee 0 writes on subsequent reloads
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          persistentKey,
          JSON.stringify({
            uid: user.uid,
            email: profileData.email,
            displayName: profileData.displayName,
            photoURL: profileData.photoURL || '',
            syncedAt: Date.now(),
          })
        );
      } catch {}
    }

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(SYNCED_USERS_SESSION_KEY, user.uid);
      } catch {}
    }
  } catch (error) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path,
      operation: 'setDoc',
      data: user.uid,
      caller: 'User Profile Sync',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveUserProfileToFirestore(userId: string, profile: Partial<UserProfile>): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(profile);
    await setDoc(userDocRef, {
      ...sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save User Profile',
    });
  } catch (err) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'setDoc',
      caller: 'Save User Profile',
      status: 'error',
      error: String(err),
    });
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }
}

export function subscribeUserProfile(userId: string, onProfileChange: (data: UserProfile | null) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onProfileChange(null);
    return () => {};
  }

  try {
    const userDocRef = doc(db, 'users', userId);
    return onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const raw = snap.data() as any;
        const normalizedChatSessions: Record<string, any> = { ...(raw.chatSessions || {}) };
        const normalizedNotes: Record<string, any> = { ...(raw.notes || {}) };
        const normalizedBookmarks: Record<string, any> = { ...(raw.bookmarks || {}) };
        const normalizedTestHistories: Record<string, any> = { ...(raw.testHistories || {}) };

        // Normalize any dot-flattened keys that might have been saved in earlier versions
        Object.keys(raw).forEach((k) => {
          if (k.startsWith('chatSessions.') && raw[k]) {
            const key = k.replace('chatSessions.', '');
            normalizedChatSessions[key] = raw[k];
          } else if (k.startsWith('notes.') && raw[k]) {
            const key = k.replace('notes.', '');
            normalizedNotes[key] = raw[k];
          } else if (k.startsWith('bookmarks.') && raw[k]) {
            const key = k.replace('bookmarks.', '');
            normalizedBookmarks[key] = raw[k];
          } else if (k.startsWith('testHistories.') && raw[k]) {
            const key = k.replace('testHistories.', '');
            normalizedTestHistories[key] = raw[k];
          }
        });

        const profile: UserProfile = {
          ...raw,
          id: userId,
          chatSessions: normalizedChatSessions,
          notes: normalizedNotes,
          bookmarks: normalizedBookmarks,
          testHistories: normalizedTestHistories,
        };

        firestoreTelemetry.record({
          type: 'STREAM_DELTA',
          collection: 'users',
          path: `users/${userId}`,
          operation: 'onSnapshot',
          docCount: 1,
          data: { email: raw.email, displayName: raw.displayName, statsRollup: raw.statsRollup },
          caller: 'User Profile Real-time Stream',
        });
        onProfileChange(profile);
      } else {
        onProfileChange(null);
      }
    }, (error) => {
      console.warn(`User profile listener notice for ${userId}:`, error?.message);
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });
  } catch (err) {
    console.warn(`Failed to attach user profile listener for ${userId}:`, err);
    return () => {};
  }
}

// ==========================================
// Tests CRUD & Real-Time Sync
// ==========================================
export async function saveTestToFirestore(test: MathTest, overrideAuthorId?: string): Promise<void> {
  if (!test || isOfflineLocalOnlyMode()) return;
  const currentUser = auth.currentUser;
  const finalAuthorId = overrideAuthorId || currentUser?.uid || (test.authorId && test.authorId !== 'anonymous' && test.authorId !== 'guest-user' ? test.authorId : 'anonymous');
  
  if (!finalAuthorId || finalAuthorId === 'anonymous' || finalAuthorId === 'guest-user') {
    return;
  }

  const validId = test.id || `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const finalAuthorEmail = (test as any).authorEmail || currentUser?.email || '';

  const testToSave: MathTest = {
    ...test,
    id: validId,
    authorId: finalAuthorId,
    authorName: test.authorName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Teacher',
    authorEmail: finalAuthorEmail,
    isPublic: test.isPublic !== undefined ? test.isPublic : true,
    createdAt: test.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: Array.isArray(test.questions) ? test.questions.length : (test.questionCount || 0),
    questions: normalizeQuestions(Array.isArray(test.questions) ? test.questions : []),
  };

  let processedTest = testToSave;
  try {
    processedTest = await optimizeTestForFirestore(testToSave);
  } catch (e) {
    console.warn('Image optimization skipped in saveTestToFirestore:', e);
  }

  fullTestCache.set(validId, { data: processedTest, timestamp: Date.now() });

  // 1. Direct write to top-level tests collection ONLY
  if (!isGlobalQuotaExceeded()) {
    try {
      const testDocRef = doc(db, 'tests', validId);
      const sanitized = sanitizeForFirestore(processedTest);
      await setDoc(testDocRef, sanitized, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'tests',
        path: `tests/${validId}`,
        operation: 'setDoc',
        data: sanitized,
        caller: 'Save/Create Test',
      });
    } catch (err) {
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'tests',
        path: `tests/${validId}`,
        operation: 'setDoc',
        caller: 'Save/Create Test',
        status: 'error',
        error: String(err),
      });
      handleFirestoreError(err, OperationType.WRITE, `tests/${validId}`);
    }
  }
}

/**
 * Granular / Surgical Question Updater:
 * Directly updates only the questions and questionCount field on /tests/{testId}
 * without re-reading or touching any other part of the test catalog.
 */
export async function updateTestQuestionsInFirestore(
  testId: string, 
  questions: any[], 
  authorId?: string
): Promise<void> {
  if (!testId || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return;
  const currentUser = auth.currentUser;
  const finalAuthorId = authorId || currentUser?.uid;
  if (!finalAuthorId || finalAuthorId === 'anonymous' || finalAuthorId === 'guest-user') {
    return;
  }

  const normalized = normalizeQuestions(Array.isArray(questions) ? questions : []);
  const now = new Date().toISOString();

  // 1. Surgical update on the discrete /tests/{testId} document
  try {
    const testDocRef = doc(db, 'tests', testId);
    const sanitized = sanitizeForFirestore(normalized);
    const payload = {
      questions: sanitized,
      questionCount: normalized.length,
      updatedAt: now,
    };
    await setDoc(testDocRef, payload, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `tests/${testId}`,
      operation: 'updateDoc',
      data: payload,
      caller: 'Update Test Questions',
    });
  } catch (err) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `tests/${testId}`,
      operation: 'updateDoc',
      caller: 'Update Test Questions',
      status: 'error',
      error: String(err),
    });
    handleFirestoreError(err, OperationType.UPDATE, `tests/${testId}`);
  }

  // Update memory cache
  const cached = fullTestCache.get(testId);
  if (cached) {
    fullTestCache.set(testId, {
      data: {
        ...cached.data,
        questions: normalized,
        questionCount: normalized.length,
        updatedAt: now,
      },
      timestamp: Date.now(),
    });
  }
}

export async function deleteTestFromFirestore(testId: string, userId?: string | null): Promise<void> {
  if (!testId || isOfflineLocalOnlyMode()) return;
  fullTestCache.delete(testId);
  testsCache.clear();
  searchResultsCache.clear();

  // 1. Delete from top-level tests collection
  if (!isGlobalQuotaExceeded()) {
    try {
      const testDocRef = doc(db, 'tests', testId);
      await deleteDoc(testDocRef);
      firestoreTelemetry.record({
        type: 'DELETE',
        collection: 'tests',
        path: `tests/${testId}`,
        operation: 'deleteDoc',
        data: { testId },
        caller: 'Delete Test',
      });
    } catch (e) {
      console.warn(`Could not delete test ${testId} from tests collection:`, e);
    }

    // 2. Persist tombstone in cloud user profile and remove from createdTests
    const currentUid = userId || auth.currentUser?.uid;
    if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
      try {
        const userDocRef = doc(db, 'users', currentUid);
        await setDoc(userDocRef, {
          deletedTestIds: arrayUnion(testId),
          [`createdTests.${testId}`]: deleteField(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn(`Could not add test ${testId} to user deletedTestIds:`, err);
      }
    }
  }
}

export async function markDeletedTestInFirestore(testId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !testId) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayUnion(testId),
      [`createdTests.${testId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn('Could not mark deleted test ID in cloud user profile:', error);
  }
}

export async function unmarkDeletedTestInFirestore(testId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !testId) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayRemove(testId),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn('Could not unmark deleted test ID in cloud user profile:', error);
  }
}

export async function unmarkMultipleDeletedTestsInFirestore(testIds: string[], userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !testIds || testIds.length === 0) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const validIds = testIds.filter(Boolean);
    if (validIds.length === 0) return;
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayRemove(...validIds),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn('Could not unmark multiple deleted test IDs in cloud user profile:', error);
  }
}

export async function fetchTestsFromFirestore(limitCount = 50, forceRefresh = false): Promise<MathTest[]> {
  const currentUid = auth.currentUser?.uid;
  const isGuest = !currentUid || currentUid === 'anonymous' || currentUid === 'guest-user';

  if (isGuest || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) {
    return SAMPLE_MATH_TESTS.slice(0, limitCount);
  }

  const resultsMap = new Map<string, MathTest>();

  // 1. Fetch user doc createdTests
  try {
    const userDocSnap = await getDoc(doc(db, 'users', currentUid));
    if (userDocSnap.exists()) {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'users',
        path: `users/${currentUid}`,
        operation: 'getDoc',
        docCount: 1,
        caller: 'Fetch User Created Tests',
      });
      const data = userDocSnap.data();
      if (data?.createdTests && typeof data.createdTests === 'object') {
        Object.values(data.createdTests).forEach((t: any) => {
          if (t && t.id) {
            resultsMap.set(t.id, {
              ...t,
              questions: normalizeQuestions(Array.isArray(t.questions) ? t.questions : []),
            });
          }
        });
      }
    }
  } catch (e) {}

  // 2. Fetch from top-level tests collection where authorId == currentUid
  try {
    const q = query(collection(db, 'tests'), where('authorId', '==', currentUid), limit(limitCount));
    const snap = await getDocs(q);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: `tests?authorId=${currentUid}&limit=${limitCount}`,
      operation: 'getDocs',
      docCount: snap.docs.length,
      data: snap.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title })),
      caller: 'Fetch User Tests Collection',
    });
    snap.forEach((d) => {
      const data = d.data() as MathTest;
      if (data && data.id) {
        resultsMap.set(data.id, {
          ...data,
          questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
        });
      }
    });
  } catch (e) {}

  // Merge with samples
  SAMPLE_MATH_TESTS.forEach((st) => {
    if (!resultsMap.has(st.id)) {
      resultsMap.set(st.id, st);
    }
  });

  return Array.from(resultsMap.values()).slice(0, limitCount);
}

export interface FirestoreDocChange<T> {
  type: 'added' | 'modified' | 'removed';
  id: string;
  data: T;
  isInitialLoad?: boolean;
}

export function subscribeToTests(
  userId: string | null, 
  onUpdate: (tests: MathTest[], deltas?: FirestoreDocChange<MathTest>[]) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onUpdate(SAMPLE_MATH_TESTS);
    return () => {};
  }

  let isFirstSnapshot = true;

  try {
    const q = query(collection(db, 'tests'), where('authorId', '==', userId), limit(25));
    return onSnapshot(q, (snap) => {
      const deltas: FirestoreDocChange<MathTest>[] = [];

      firestoreTelemetry.record({
        type: isFirstSnapshot ? 'STREAM_LISTEN' : 'STREAM_DELTA',
        collection: 'tests',
        path: `tests?authorId=${userId}&limit=25`,
        operation: 'onSnapshot',
        docCount: isFirstSnapshot ? snap.docs.length : snap.docChanges().length,
        data: snap.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title })),
        caller: isFirstSnapshot ? 'Initial Tests Real-time Stream' : 'Live Tests Delta Change',
      });

      snap.docChanges().forEach((change) => {
        const raw = change.doc.data() as MathTest;
        const normalized: MathTest = {
          ...raw,
          id: change.doc.id,
          questions: normalizeQuestions(Array.isArray(raw?.questions) ? raw.questions : []),
        };
        deltas.push({
          type: change.type,
          id: change.doc.id,
          data: normalized,
          isInitialLoad: isFirstSnapshot,
        });
      });

      isFirstSnapshot = false;

      const customTests: MathTest[] = [];
      snap.forEach((d) => {
        const data = d.data() as MathTest;
        if (data && data.id) {
          customTests.push({
            ...data,
            questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
          });
        }
      });

      const mergedMap = new Map<string, MathTest>();
      customTests.forEach((t) => mergedMap.set(t.id, t));
      SAMPLE_MATH_TESTS.forEach((st) => {
        if (!mergedMap.has(st.id)) {
          mergedMap.set(st.id, st);
        }
      });

      onUpdate(Array.from(mergedMap.values()), deltas);
    }, (err) => {
      console.warn('Tests snapshot listener warning:', err?.message);
      handleFirestoreError(err, OperationType.LIST, 'tests');
    });
  } catch (err) {
    console.warn('Failed to attach tests snapshot listener:', err);
    return () => {};
  }
}

// ==========================================
// Attempts CRUD & Real-Time Sync
// ==========================================
export async function saveAttemptToFirestore(attempt: TestAttempt, overrideUserId?: string): Promise<void> {
  if (!attempt || isOfflineLocalOnlyMode()) return;
  const currentUser = auth.currentUser;
  const finalUserId = overrideUserId || currentUser?.uid || attempt.userId || 'anonymous';
  
  if (!finalUserId || finalUserId === 'anonymous' || finalUserId === 'guest-user') {
    return;
  }

  const validId = attempt.id || `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const finalUserEmail = attempt.userEmail || currentUser?.email || '';

  const attemptToSave: TestAttempt = {
    ...attempt,
    id: validId,
    testId: attempt.testId || 'unknown_test',
    userId: finalUserId,
    userEmail: finalUserEmail,
    userName: attempt.userName || currentUser?.displayName || finalUserEmail.split('@')[0] || 'Learner',
    createdAt: attempt.createdAt || new Date().toISOString(),
    completedAt: attempt.completedAt || new Date().toISOString(),
  };

  // 1. Direct write to top-level attempts collection
  if (!isGlobalQuotaExceeded()) {
    try {
      const attemptDocRef = doc(db, 'attempts', validId);
      const attemptCopy = { ...attemptToSave };
      if (typeof attemptCopy.omrScannedImageUrl === 'string' && attemptCopy.omrScannedImageUrl.length > 80000) {
        delete attemptCopy.omrScannedImageUrl;
      }
      const sanitized = sanitizeForFirestore(attemptCopy);
      await setDoc(attemptDocRef, sanitized, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'attempts',
        path: `attempts/${validId}`,
        operation: 'setDoc',
        data: sanitized,
        caller: 'Submit Test Attempt',
      });
    } catch (err) {
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'attempts',
        path: `attempts/${validId}`,
        operation: 'setDoc',
        caller: 'Submit Test Attempt',
        status: 'error',
        error: String(err),
      });
      handleFirestoreError(err, OperationType.WRITE, `attempts/${validId}`);
    }
  }

  // Single-Write Attempt Pattern:
  // We write strictly to the /attempts/{validId} collection.
  // Test histories and stats are maintained locally and in UI state to eliminate write duplication.
}

export async function deleteAttemptFromFirestore(attemptId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !attemptId) return;

  try {
    const attemptDocRef = doc(db, 'attempts', attemptId);
    await deleteDoc(attemptDocRef);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'attempts',
      path: `attempts/${attemptId}`,
      operation: 'deleteDoc',
      data: { id: attemptId, status: 'pruned_old_last_attempt' },
      caller: 'Prune Old Last Attempt from Firestore',
    });
  } catch (e) {
    console.warn(`Could not delete attempt ${attemptId} from Firestore attempts collection:`, e);
  }
}

export async function fetchUserAttemptsFromFirestore(
  userId: string,
  limitCount = 50,
  forceRefresh = false
): Promise<TestAttempt[]> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return [];

  const results: TestAttempt[] = [];
  try {
    const q = query(collection(db, 'attempts'), where('userId', '==', userId), limit(limitCount));
    const snap = await getDocs(q);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'attempts',
      path: `attempts?userId=${userId}&limit=${limitCount}`,
      operation: 'getDocs',
      docCount: snap.docs.length,
      data: snap.docs.map((d) => ({ id: d.id, testId: (d.data() as any)?.testId, score: (d.data() as any)?.score })),
      caller: 'Fetch User Attempt History',
    });
    snap.forEach((d) => {
      const data = d.data() as TestAttempt;
      if (data && data.id) {
        results.push(data);
      }
    });
    // Sort descending by completion date
    results.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
  } catch (err) {
    console.warn('fetchUserAttemptsFromFirestore notice:', err);
  }

  return results;
}

export function subscribeToAttempts(
  userId: string, 
  onUpdate: (attempts: TestAttempt[], deltas?: FirestoreDocChange<TestAttempt>[]) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onUpdate([]);
    return () => {};
  }

  let isFirstSnapshot = true;

  try {
    const q = query(collection(db, 'attempts'), where('userId', '==', userId), limit(25));
    return onSnapshot(q, (snap) => {
      const deltas: FirestoreDocChange<TestAttempt>[] = [];

      firestoreTelemetry.record({
        type: isFirstSnapshot ? 'STREAM_LISTEN' : 'STREAM_DELTA',
        collection: 'attempts',
        path: `attempts?userId=${userId}&limit=25`,
        operation: 'onSnapshot',
        docCount: isFirstSnapshot ? snap.docs.length : snap.docChanges().length,
        data: snap.docs.map((d) => ({ id: d.id, testId: (d.data() as any)?.testId, score: (d.data() as any)?.score })),
        caller: isFirstSnapshot ? 'Initial Attempts Real-time Stream' : 'Live Attempt Delta Change',
      });

      snap.docChanges().forEach((change) => {
        const raw = change.doc.data() as TestAttempt;
        const normalized: TestAttempt = {
          ...raw,
          id: change.doc.id,
        };
        deltas.push({
          type: change.type,
          id: change.doc.id,
          data: normalized,
          isInitialLoad: isFirstSnapshot,
        });
      });

      isFirstSnapshot = false;

      const list: TestAttempt[] = [];
      snap.forEach((d) => {
        const data = d.data() as TestAttempt;
        if (data && data.id) {
          list.push(data);
        }
      });
      list.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
      onUpdate(list, deltas);
    }, (err) => {
      console.warn('Attempts snapshot listener warning:', err?.message);
      handleFirestoreError(err, OperationType.LIST, 'attempts');
    });
  } catch (err) {
    console.warn('Failed to attach attempts snapshot listener:', err);
    return () => {};
  }
}

// ==========================================
// Notes, Bookmarks & Chat Sessions Real-Time Sync
// ==========================================
export async function saveNoteToFirestore(userId: string, note: any): Promise<void> {
  if (!note || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  const noteId = note.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore({ ...note, id: noteId, updatedAt: new Date().toISOString() });
    await setDoc(userDocRef, {
      notes: {
        [noteId]: sanitized,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/notes/${noteId}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save Study Note',
    });
  } catch (err) {
    console.warn('Failed to save note to Firestore:', err);
  }
}

export const saveUserNoteToFirestore = saveNoteToFirestore;

export async function deleteNoteFromFirestore(userId: string, noteId: string): Promise<void> {
  if (!noteId || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      notes: {
        [noteId]: deleteField(),
      },
      [`notes.${noteId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/notes/${noteId}`,
      operation: 'setDoc',
      data: { noteId, action: 'delete' },
      caller: 'Delete Study Note',
    });
  } catch (err) {
    console.warn('Failed to delete note from Firestore:', err);
  }
}

export const deleteUserNoteFromFirestore = deleteNoteFromFirestore;

export function subscribeUserNotesFromFirestore(userId: string, onNotesChange: (notes: any[]) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onNotesChange([]);
    return () => {};
  }

  return subscribeUserProfile(userId, (profile) => {
    if (!profile || !profile.notes) {
      onNotesChange([]);
      return;
    }
    const notesList = Object.values(profile.notes);
    notesList.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onNotesChange(notesList);
  });
}

const chatSaveDebounceTimers = new Map<string, any>();
const pendingChatSaves = new Map<string, { userId: string; sessions: any[] }>();

/**
 * Directly commits a compacted single-document chat archive to `chat_archives/{userId}`.
 */
export async function saveChatArchiveToFirestoreDirect(userId: string, sessions?: any[]): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') return;
  const start = performance.now();
  const path = `chat_archives/${userId}`;

  try {
    const rawList = Array.isArray(sessions) && sessions.length > 0 ? sessions : loadScopedChatSessions(userId);
    let compactSessions = (Array.isArray(rawList) ? rawList : [])
      .filter((s: any) => s && s.id)
      .map((s: any) => {
        if (s.cloudSyncEnabled === true) {
          return toCompactChatSession({ ...s, cloudSyncEnabled: true });
        }
        return {
          id: s.id,
          title: s.title || 'New Conversation',
          createdAt: s.createdAt || Date.now(),
          updatedAt: s.updatedAt || Date.now(),
          modelTier: s.modelTier || 'gemini-3.8-flash',
          cloudSyncEnabled: false,
          messages: []
        };
      });

    // Volumetric Safety Guard: Ensure cloud document never exceeds 750 KB (well below Firestore's 1MB limit)
    // Note: IndexedDB retains 100% of all sessions & messages locally without limit.
    const estimatedBytes = JSON.stringify(compactSessions).length;
    if (estimatedBytes > 700000) {
      // Sort sessions by updatedAt descending (newest first)
      compactSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      // Cap at 25 most recent active sessions for cloud backup
      compactSessions = compactSessions.slice(0, 25);
      // Trim per-session message tail to most recent 35 messages
      compactSessions = compactSessions.map((s) => {
        if (Array.isArray(s.messages) && s.messages.length > 35) {
          return {
            ...s,
            messages: s.messages.slice(-35)
          };
        }
        return s;
      });
    }

    const archiveDocRef = doc(db, 'chat_archives', userId);
    const archivePayload = {
      userId,
      sessions: compactSessions,
      totalSessions: compactSessions.length,
      updatedAt: new Date().toISOString(),
      clientVersion: 'v3.0.0',
    };

    const sanitized = sanitizeForFirestore(archivePayload);
    await setDoc(archiveDocRef, sanitized, { merge: true });
    const latency = Math.round(performance.now() - start);

    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chat_archives',
      path,
      operation: 'setDoc',
      durationMs: latency,
      data: { totalSessions: compactSessions.length, userId },
      caller: 'Save Chat Archive (Single Document)',
      statusCode: '200 OK',
    });
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chat_archives',
      path,
      operation: 'setDoc',
      durationMs: latency,
      caller: 'Save Chat Archive',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Reads single-document chat archive from `chat_archives/{userId}` on 1-pass entry.
 */
export async function fetchChatArchiveFromFirestore(userId: string): Promise<any[] | null> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') return null;
  const start = performance.now();
  const path = `chat_archives/${userId}`;

  try {
    const archiveDocRef = doc(db, 'chat_archives', userId);
    const snap = await getDoc(archiveDocRef);
    const latency = Math.round(performance.now() - start);

    if (snap.exists()) {
      const data = snap.data() as any;
      const remoteSessions = Array.isArray(data.sessions) ? data.sessions : [];

      firestoreTelemetry.record({
        type: 'READ',
        collection: 'chat_archives',
        path,
        operation: 'getDoc',
        docCount: 1,
        durationMs: latency,
        data: { totalSessions: remoteSessions.length, userId },
        caller: 'Fetch Chat Archive (Single Document Entry Hydration)',
        statusCode: '200 OK',
      });

      return remoteSessions;
    } else {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'chat_archives',
        path,
        operation: 'getDoc',
        docCount: 0,
        durationMs: latency,
        caller: 'Fetch Chat Archive (Not Found)',
        statusCode: '404 NOT_FOUND',
      });
      return null;
    }
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'chat_archives',
      path,
      operation: 'getDoc',
      durationMs: latency,
      caller: 'Fetch Chat Archive',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function flushPendingChatSaves(_userId?: string): Promise<void> {
  return;
}

/**
 * Save chat session to Firestore via single-document archive.
 */
export async function saveChatSessionToFirestore(userId: string, _sessionOrSessions: any, _forceImmediate = false): Promise<void> {
  if (!userId || userId === 'anonymous' || userId === 'guest-user' || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return;
  await saveChatArchiveToFirestoreDirect(userId);
}

export async function deleteChatSessionFromFirestore(userId: string, _sessionId: string): Promise<void> {
  if (!userId || userId === 'anonymous' || userId === 'guest-user' || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return;
  await saveChatArchiveToFirestoreDirect(userId);
}

export function subscribeUserChatSessionsFromFirestore(
  userId: string,
  onSessionsChange: (sessions: any[]) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onSessionsChange([]);
    return () => {};
  }

  try {
    const archiveDocRef = doc(db, 'chat_archives', userId);
    return onSnapshot(
      archiveDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          const remoteSessions = Array.isArray(data?.sessions) ? data.sessions : [];
          firestoreTelemetry.record({
            type: 'STREAM_DELTA',
            collection: 'chat_archives',
            path: `chat_archives/${userId}`,
            operation: 'onSnapshot',
            docCount: 1,
            caller: 'Real-time Chat Archive Listener',
            statusCode: '200 OK',
          });
          onSessionsChange(remoteSessions);
        } else {
          onSessionsChange([]);
        }
      },
      (err) => {
        console.warn('Chat archive snapshot listener notice:', err?.message);
        handleFirestoreError(err, OperationType.GET, `chat_archives/${userId}`);
      }
    );
  } catch (err) {
    console.warn('Failed to attach chat archive snapshot listener:', err);
    return () => {};
  }
}

export async function saveBookmarkToFirestore(userId: string, bookmark: any): Promise<void> {
  if (!bookmark || !bookmark.id || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore({ ...bookmark, createdAt: new Date().toISOString() });
    await setDoc(userDocRef, {
      bookmarks: {
        [bookmark.id]: sanitized,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/bookmarks/${bookmark.id}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save Bookmark',
    });
  } catch (err) {
    console.warn('Failed to save bookmark to Firestore:', err);
  }
}

export async function deleteBookmarkFromFirestore(userId: string, bookmarkId: string): Promise<void> {
  if (!bookmarkId || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      bookmarks: {
        [bookmarkId]: deleteField(),
      },
      [`bookmarks.${bookmarkId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/bookmarks/${bookmarkId}`,
      operation: 'setDoc',
      data: { bookmarkId, action: 'delete' },
      caller: 'Delete Bookmark',
    });
  } catch (err) {
    console.warn('Failed to delete bookmark from Firestore:', err);
  }
}

export function subscribeUserBookmarksFromFirestore(userId: string, onBookmarksChange: (bookmarks: any[]) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onBookmarksChange([]);
    return () => {};
  }

  return subscribeUserProfile(userId, (profile) => {
    if (!profile || !profile.bookmarks) {
      onBookmarksChange([]);
      return;
    }
    const list = Object.values(profile.bookmarks);
    onBookmarksChange(list);
  });
}

export async function saveUserSettingsToFirestore(userId: string, settings: Partial<AppSettings>): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(settings);
    await setDoc(userDocRef, {
      settings: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/settings`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save App Settings',
    });
  } catch (err) {
    console.warn('Failed to save user settings to Firestore:', err);
  }
}

export async function syncStatsRollupToFirestore(userId: string, rollup: any): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(rollup);
    await setDoc(userDocRef, {
      statsRollup: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/statsRollup`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Sync Analytics Rollup',
    });
  } catch (err) {
    console.warn('Failed to sync stats rollup to Firestore:', err);
  }
}

export async function syncTestHistoriesToFirestore(userId: string, testHistories: Record<string, TestHistoryEntry>): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const cleanedHistories: Record<string, any> = {};
    if (testHistories && typeof testHistories === 'object') {
      for (const [k, v] of Object.entries(testHistories)) {
        if (v && typeof v === 'object') {
          const entry = { ...v };
          if (entry.firstAttempt) {
            const { omrScannedImageUrl, ...fRest } = entry.firstAttempt;
            entry.firstAttempt = fRest as any;
          }
          if (entry.lastAttempt) {
            const { omrScannedImageUrl, ...lRest } = entry.lastAttempt;
            entry.lastAttempt = lRest as any;
          }
          cleanedHistories[k] = entry;
        } else {
          cleanedHistories[k] = v;
        }
      }
    }
    const sanitized = sanitizeForFirestore(cleanedHistories);
    await setDoc(userDocRef, {
      testHistories: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/testHistories`,
      operation: 'setDoc',
      data: { count: Object.keys(testHistories || {}).length },
      caller: 'Sync Test Histories',
    });
  } catch (err) {
    console.warn('Failed to sync test histories to Firestore:', err);
  }
}

// Active Test Session Persistence
export async function saveActiveSessionToFirestore(userId: string, session: ActiveTestSession | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    if (session) {
      const sanitized = sanitizeForFirestore(session);
      await setDoc(userDocRef, {
        activeSession: sanitized,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'users',
        path: `users/${userId}/activeSession`,
        operation: 'setDoc',
        data: { testId: session.testId, currentIndex: session.currentIndex },
        caller: 'Save Active Test Session',
      });
    } else {
      await setDoc(userDocRef, {
        activeSession: deleteField(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'users',
        path: `users/${userId}/activeSession`,
        operation: 'setDoc',
        data: { action: 'clear' },
        caller: 'Clear Active Test Session',
      });
    }
  } catch (err) {
    console.warn('Failed to save active session to Firestore:', err);
  }
}

// Search and fetch full tests
const testsCache = new Map<string, { data: MathTest[]; timestamp: number }>();
const searchResultsCache = new Map<string, { data: MathTest[]; timestamp: number }>();
const fullTestCache = new Map<string, { data: MathTest; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateFirestoreCaches(): void {
  testsCache.clear();
  searchResultsCache.clear();
  fullTestCache.clear();
}

export async function fetchFullTestFromFirestore(testId: string): Promise<MathTest | null> {
  if (!testId || isOfflineLocalOnlyMode()) return null;
  const cached = fullTestCache.get(testId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (isGlobalQuotaExceeded()) return null;

  try {
    const testDocRef = doc(db, 'tests', testId);
    const snap = await getDoc(testDocRef);
    if (snap.exists()) {
      const data = snap.data() as MathTest;
      const normalized: MathTest = {
        ...data,
        questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
      };
      fullTestCache.set(testId, { data: normalized, timestamp: Date.now() });
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'tests',
        path: `tests/${testId}`,
        operation: 'getDoc',
        docCount: 1,
        data: { id: normalized.id, title: normalized.title, questionCount: normalized.questionCount },
        caller: 'Fetch Full Test',
      });
      return normalized;
    }
  } catch (error) {
    console.warn(`Could not fetch full test ${testId} from Firestore:`, error);
  }
  return null;
}

export async function searchCloudTests(searchQuery: string, topic?: string, limitCount = 15): Promise<MathTest[]> {
  const cleanQuery = (searchQuery || '').trim().toLowerCase();
  const cleanTopic = (topic || 'All Topics').trim().toLowerCase();
  if (isGlobalQuotaExceeded()) return [];

  try {
    const testsQuery = query(collection(db, 'tests'), limit(limitCount));
    const snapshot = await getDocs(testsQuery);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: `tests?limit=${limitCount}`,
      operation: 'getDocs',
      docCount: snapshot.docs.length,
      data: snapshot.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title })),
      caller: `Search Cloud Tests ("${searchQuery}")`,
    });
    const results: MathTest[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as MathTest;
      if (!data || !data.id) return;

      const titleMatch = (data.title || '').toLowerCase().includes(cleanQuery);
      const topicMatch = (data.topic || '').toLowerCase().includes(cleanQuery);
      const descMatch = (data.description || '').toLowerCase().includes(cleanQuery);
      const matchesSearch = cleanQuery === '' || titleMatch || topicMatch || descMatch;
      const matchesTopicFilter = cleanTopic === 'all topics' || (data.topic || '').toLowerCase() === cleanTopic;

      if (matchesSearch && matchesTopicFilter) {
        results.push(data);
      }
    });

    return results;
  } catch (error) {
    console.warn('Search cloud tests notice:', error);
    return [];
  }
}

// Offline Attempts Queue Flushing
export const OFFLINE_ATTEMPTS_QUEUE_KEY = 'math_mock_offline_attempts_queue';

export function getOfflineQueuedAttempts(): TestAttempt[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ATTEMPTS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function flushOfflineAttemptsQueue(): Promise<void> {
  if (isGlobalQuotaExceeded() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  const queue = getOfflineQueuedAttempts();
  if (queue.length === 0) return;

  try {
    localStorage.removeItem(OFFLINE_ATTEMPTS_QUEUE_KEY);
  } catch {}

  for (const att of queue) {
    try {
      await saveAttemptToFirestore(att);
    } catch (e) {
      console.warn('Failed to flush offline attempt:', e);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineAttemptsQueue().catch(() => {});
  });
}

/**
 * Diagnostic Live Firestore Write & Read verification
 * Immediately writes a real test document with complete questions payload to verify live cloud writes.
 */
export async function executeDiagnosticFirestoreWrite(): Promise<{ success: boolean; docId: string; latencyMs: number; error?: string }> {
  const start = performance.now();
  const testId = `diag_test_${Date.now()}`;
  const currentUser = auth.currentUser;
  
  const testPayload: MathTest = {
    id: testId,
    title: `Diagnostic Telemetry Verification (${new Date().toLocaleTimeString()})`,
    description: 'Real-time cloud database write verification document generated by Firestore Activity Inspector.',
    topic: 'Calculus',
    difficulty: 'Medium',
    timeLimitMinutes: 15,
    authorId: currentUser?.uid || 'telemetry_diagnostic_agent',
    authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'System Inspector',
    authorEmail: currentUser?.email || 'telemetry@system.local',
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: 3,
    questions: [
      {
        id: 'q_diag_1',
        text: 'What is the derivative of f(x) = x^3 + 4x - 7?',
        options: ['3x^2 + 4', '3x^2 - 4', 'x^2 + 4', '3x^3 + 4'],
        correctAnswer: '3x^2 + 4',
        explanation: 'Using the power rule: d/dx(x^3) = 3x^2, d/dx(4x) = 4, and d/dx(-7) = 0.',
        type: 'mcq',
      },
      {
        id: 'q_diag_2',
        text: 'Evaluate the limit as x approaches 0 of sin(x)/x.',
        options: ['0', '1', 'Infinity', 'Undefined'],
        correctAnswer: '1',
        explanation: 'By standard trigonometric limit theorem, lim_{x->0} sin(x)/x = 1.',
        type: 'mcq',
      },
      {
        id: 'q_diag_3',
        text: 'If A and B are mutually exclusive events with P(A)=0.3 and P(B)=0.4, find P(A or B).',
        options: ['0.12', '0.70', '0.58', '0.10'],
        correctAnswer: '0.70',
        explanation: 'For mutually exclusive events, P(A or B) = P(A) + P(B) = 0.3 + 0.4 = 0.70.',
        type: 'mcq',
      },
    ],
  };

  try {
    const testDocRef = doc(db, 'tests', testId);
    const sanitized = sanitizeForFirestore(testPayload);
    await setDoc(testDocRef, sanitized, { merge: true });
    const latency = Math.round(performance.now() - start);

    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `tests/${testId}`,
      operation: 'setDoc',
      durationMs: latency,
      data: sanitized,
      caller: 'Live Diagnostic Write Request',
      statusCode: '200 OK',
    });

    return { success: true, docId: testId, latencyMs: latency };
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `tests/${testId}`,
      operation: 'setDoc',
      durationMs: latency,
      caller: 'Live Diagnostic Write Request',
      status: 'error',
      statusCode: 'WRITE_FAILED',
      error: String(err?.message || err),
    });
    return { success: false, docId: testId, latencyMs: latency, error: String(err?.message || err) };
  }
}

/**
 * Diagnostic Live Firestore Read verification
 * Immediately reads the public tests collection to measure roundtrip query latency and returned documents.
 */
export async function executeDiagnosticFirestoreRead(): Promise<{ success: boolean; docCount: number; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const q = query(collection(db, 'tests'), limit(10));
    const snap = await getDocs(q);
    const latency = Math.round(performance.now() - start);
    const docsSummary = snap.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title || 'Test Document' }));

    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: 'tests?limit=10',
      operation: 'getDocs',
      durationMs: latency,
      docCount: snap.docs.length,
      data: docsSummary,
      caller: 'Live Diagnostic Read Request',
      statusCode: '200 OK',
    });

    return { success: true, docCount: snap.docs.length, latencyMs: latency };
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: 'tests?limit=10',
      operation: 'getDocs',
      durationMs: latency,
      caller: 'Live Diagnostic Read Request',
      status: 'error',
      statusCode: 'READ_FAILED',
      error: String(err?.message || err),
    });
    return { success: false, docCount: 0, latencyMs: latency, error: String(err?.message || err) };
  }
}

/**
 * Diagnostic Auth Context Probe
 */
export function executeDiagnosticAuthProbe(): { uid: string | null; email: string | null; isAnonymous: boolean } {
  const user = auth.currentUser;
  const ctx = {
    uid: user?.uid || null,
    email: user?.email || null,
    displayName: user?.displayName || null,
    isAnonymous: !user,
  };
  firestoreTelemetry.record({
    type: 'AUTH',
    collection: 'auth',
    path: user ? `auth/users/${user.uid}` : 'auth/session',
    operation: 'onAuthStateChanged',
    durationMs: 1,
    data: ctx,
    caller: 'Live Auth State Diagnostic Probe',
    statusCode: user ? 'AUTH_ACTIVE' : 'ANONYMOUS_GUEST',
  });
  return ctx;
}

export interface DeleteAccountProgress {
  step: 'idle' | 'deleting_firestore' | 'deleting_auth' | 'clearing_local' | 'reauth_required' | 'completed' | 'error';
  message: string;
  deletedTestsCount?: number;
  deletedAttemptsCount?: number;
  error?: string;
}

/**
 * Permanently deletes a user's account and all associated cloud data in Firestore,
 * purges local storage caches, and deletes their Firebase Authentication record.
 */
export async function deleteUserAccountAndAllData(
  user: User,
  onProgress?: (progress: DeleteAccountProgress) => void
): Promise<{ success: boolean; error?: string; requiresReauth?: boolean; deletedTestsCount?: number; deletedAttemptsCount?: number }> {
  if (!user || !user.uid) {
    return { success: false, error: 'No active authenticated user provided.' };
  }

  const userId = user.uid;
  const userEmail = user.email || null;

  try {
    // 1. Delete all Firestore documents associated with this user
    onProgress?.({
      step: 'deleting_firestore',
      message: 'Purging all test papers, attempts, notes, bookmarks, and chat history from Google Cloud...',
    });

    let deletedTestsCount = 0;
    let deletedAttemptsCount = 0;

    // Delete subcollections in user document (notes, bookmarks, chat_sessions, tests, attempts)
    const subcollections = ['notes', 'bookmarks', 'chat_sessions', 'tests', 'attempts'];
    for (const subcol of subcollections) {
      try {
        const subSnap = await getDocs(collection(db, 'users', userId, subcol));
        if (!subSnap.empty) {
          const batch = writeBatch(db);
          subSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn(`Note: Could not clear subcollection ${subcol}:`, err);
      }
    }

    // Delete root tests created by user
    try {
      const testsQuery = query(collection(db, 'tests'), where('authorId', '==', userId));
      const testsSnap = await getDocs(testsQuery);
      if (!testsSnap.empty) {
        const batch = writeBatch(db);
        testsSnap.docs.forEach((d) => {
          batch.delete(d.ref);
          deletedTestsCount++;
        });
        await batch.commit();
      }
      if (userEmail) {
        const emailTestsQuery = query(collection(db, 'tests'), where('authorEmail', '==', userEmail));
        const emailTestsSnap = await getDocs(emailTestsQuery);
        if (!emailTestsSnap.empty) {
          const batch = writeBatch(db);
          emailTestsSnap.docs.forEach((d) => {
            batch.delete(d.ref);
            deletedTestsCount++;
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Note deleting authored tests from root collection:', err);
    }

    // Delete root attempts created by user
    try {
      const attemptsQuery = query(collection(db, 'attempts'), where('userId', '==', userId));
      const attemptsSnap = await getDocs(attemptsQuery);
      if (!attemptsSnap.empty) {
        const batch = writeBatch(db);
        attemptsSnap.docs.forEach((d) => {
          batch.delete(d.ref);
          deletedAttemptsCount++;
        });
        await batch.commit();
      }
      if (userEmail) {
        const emailAttemptsQuery = query(collection(db, 'attempts'), where('userEmail', '==', userEmail));
        const emailAttemptsSnap = await getDocs(emailAttemptsQuery);
        if (!emailAttemptsSnap.empty) {
          const batch = writeBatch(db);
          emailAttemptsSnap.docs.forEach((d) => {
            batch.delete(d.ref);
            deletedAttemptsCount++;
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Note deleting attempts from root collection:', err);
    }

    // Delete the root users document
    try {
      const userDocRef = doc(db, 'users', userId);
      await deleteDoc(userDocRef);
    } catch (err) {
      console.warn('Note deleting user profile document:', err);
    }

    // Record deletion telemetry
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'deleteDoc',
      data: { userId, userEmail, deletedTestsCount, deletedAttemptsCount },
      caller: 'Permanent Account & Data Wipe',
      statusCode: '200 DELETED',
    });

    // 2. Clear local storage
    onProgress?.({
      step: 'clearing_local',
      message: 'Purging local storage cache, offline queues, and session state...',
      deletedTestsCount,
      deletedAttemptsCount,
    });
    wipeAllScopedUserDataFromLocalStorage(userId);

    // 3. Delete Firebase Auth User Account
    onProgress?.({
      step: 'deleting_auth',
      message: 'Deleting Firebase Authentication user credentials...',
      deletedTestsCount,
      deletedAttemptsCount,
    });

    try {
      await deleteUser(user);
    } catch (authErr: any) {
      if (authErr?.code === 'auth/requires-recent-login') {
        onProgress?.({
          step: 'reauth_required',
          message: 'Recent security authentication required. Opening Google sign-in to confirm...',
          deletedTestsCount,
          deletedAttemptsCount,
        });
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);
        await deleteUser(user);
      } else {
        throw authErr;
      }
    }

    onProgress?.({
      step: 'completed',
      message: 'Your account and all associated cloud data have been completely deleted.',
      deletedTestsCount,
      deletedAttemptsCount,
    });

    return { success: true, deletedTestsCount, deletedAttemptsCount };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('Error during account & data deletion:', err);
    onProgress?.({
      step: 'error',
      message: `Account deletion failed: ${errMsg}`,
      error: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

export { onAuthStateChanged };


