import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { safeSetItem } from './storage';
import { TEMPLATE_LANDSCAPE_SLIDES } from '../components/htmlNotes/constants/templates';


export interface HtmlNoteItem {
  id: string;
  title: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  driveFileId?: string;
  driveWebViewLink?: string;
  driveSyncStatus?: 'synced' | 'pending_device_upload' | 'local_only';
  pendingDeviceId?: string;
}

export interface HtmlProject {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  files: HtmlNoteItem[];
}

const LOCAL_STORAGE_PROJECTS_KEY = 'mockmc_html_projects_v3';
const LEGACY_STORAGE_KEY = 'mockmc_html_notes_v2';

// In-memory sync tracking to avoid redundant Firestore reads & writes
let lastSyncedHash: string = '';
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let cachedProjects: HtmlProject[] | null = null;
let syncListeners: ((status: 'synced' | 'saving' | 'offline' | 'local_only') => void)[] = [];

export function subscribeToSyncStatus(listener: (status: 'synced' | 'saving' | 'offline' | 'local_only') => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifySyncStatus(status: 'synced' | 'saving' | 'offline' | 'local_only') {
  syncListeners.forEach(l => {
    try {
      l(status);
    } catch {}
  });
}

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
 * Fast content checksum to detect if files actually changed before touching Firestore
 */
function computeProjectsHash(projects: HtmlProject[]): string {
  try {
    return projects.map(p => 
      `${p.id}:${p.name}:${p.updatedAt}:${p.files.map(f => {
        let h = 0;
        const str = f.code || '';
        for (let i = 0; i < str.length; i++) {
          h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        }
        return `${f.id}_${f.title}_${f.updatedAt}_${h.toString(16)}_${str.length}`;
      }).join(',')}`
    ).join('|');
  } catch {
    return String(Date.now());
  }
}

/**
 * Auto-repair legacy string corruptions in stored KaTeX formulas
 */
export function sanitizeAndRepairCode(code: string): string {
  if (!code) return code;

  // 0. Stash all image data URLs and base64 strings so KaTeX string repair regexes NEVER mutate images
  const stashedDataUrls = new Map<string, string>();
  let stashCounter = 0;
  let repaired = code.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, (match) => {
    const token = `__IMG_DATA_STASH_${stashCounter++}__`;
    stashedDataUrls.set(token, match);
    return token;
  });

  // 1. Repair specific corrupted formulas from legacy runaway escapes
  repaired = repaired.replace(/A\^\{-1\}\s*=\s*(?:\\[fF]\s*)+(?:rac|\\frac)?\{1\}\{\|A\|\}\s*(?:\\cdot\s*|cdot\s*)?(?:ext|\\text)?\{adj\}\(A\)/gi, 'A^{-1} = \\frac{1}{|A|} \\cdot \\text{adj}(A)');
  repaired = repaired.replace(/A\^\{-1\}\s*=\s*(?:\\[fF]\s*)+.*?(\$\$|<\/strong>|<\/p>)/g, 'A^{-1} = \\frac{1}{|A|} \\cdot \\text{adj}(A)$1');
  repaired = repaired.replace(/\|A\^\{-1\}\|\s*=\s*(?:\\[fF]\s*)+(?:\\frac|rac)?\{1\}\{\|A\|\}/g, '|A^{-1}| = \\frac{1}{|A|}');
  repaired = repaired.replace(/A\^\{-1\}\s*=\s*(?:\\[fF]\s*)+/gi, 'A^{-1} = \\frac{1}{|A|} \\cdot \\text{adj}(A)');
  repaired = repaired.replace(/\|A\^\{-1\}\|\s*=\s*(?:\\[fF]\s*)+/gi, '|A^{-1}| = \\frac{1}{|A|}');

  // 1b. Repair nested fraction corruptions of 'A' (e.g. \frac{\frac{!}[A]!}\frac{!}[A]}\frac{!}[A]}BCDS -> $ABCD$)
  repaired = repaired.replace(/\\?\$\s*\\frac\{\\frac\{!\}\[?A\]?!\}\s*(?:\\frac\{!\}\[?A\]\}?)+BCDS/g, '$ABCD$');
  repaired = repaired.replace(/\\frac\{\\frac\{!\}\[?A\]?!\}\s*(?:\\frac\{!\}\[?A\]\}?)+BCDS/g, '$ABCD$');
  repaired = repaired.replace(/\\frac\{\\frac\{!\}\[?A\]?!\}\s*(?:\\frac\{!\}\[?A\]\}?)+/g, 'A');
  repaired = repaired.replace(/(?:\\frac\{!\}\[?A\]?\}?){2,}/g, 'A');

  // 1c. Repair 'DA' corrupted into Drac...
  repaired = repaired.replace(/Drac\{1\}\{\|A\|\}\|\[A\]\|\\frac\{1\}\{\|A\|\}\\?\$/g, 'DA$');
  repaired = repaired.replace(/Drac\{1\}\{\|A\|\}\|\[A\]\|\\frac\{1\}\{\|A\|\}/g, 'DA');
  repaired = repaired.replace(/Drac\{1\}\{[^}]+\}/g, 'DA');

  // 1d. Repair stray runaway 'rac{1}{|A|}' attached to vertex letter identifiers
  repaired = repaired.replace(/([a-zA-Z])rac\{1\}\{\[?A\]?\}/g, '$1');

  // 1e. Ensure degree angles with missing $ get wrapped in $ ... $
  repaired = repaired.replace(/\((\\ne\s*90\^\\circ)\)/g, '($$$1$$)');
  repaired = repaired.replace(/\((90\^\\circ)\)/g, '($$$1$$)');
  repaired = repaired.replace(/(Diagonal\s*Angle\s*|Angle\s*):?\s*(\\ne\s*90\^\\circ)(?![\$\\])/gi, '$1$$$2$$');
  repaired = repaired.replace(/All\s+(90\^\\circ)(?![\$\\])/gi, 'All $$$1$$');

  // 2. Obliterate any runaway chained \f\f\f... or redundant \frac
  repaired = repaired.replace(/(?:\\[fF]\s*){2,}(?:rac|\\frac)?\{1\}\{\|A\|\}/gi, '\\frac{1}{|A|}');
  repaired = repaired.replace(/(?:\\[fF]\s*){2,}/gi, '');
  repaired = repaired.replace(/\\+f+rac\{1\}\{\|A\|\}/gi, '\\frac{1}{|A|}');
  repaired = repaired.replace(/\\+t+ext\{adj\}/gi, '\\text{adj}');

  // 3. Fix unescaped fragments ONLY when not already preceded by backslash or word character
  repaired = repaired.replace(/(?<![\\a-zA-Z])rac\{/g, '\\frac{');
  repaired = repaired.replace(/(?<![\\a-zA-Z])ext\{/g, '\\text{');
  repaired = repaired.replace(/m\s*\\?imes\s*n/gi, 'm \\times n');
  repaired = repaired.replace(/p\s*\\?imes\s*q/gi, 'p \\times q');
  repaired = repaired.replace(/([mpn\d\s]|^)\\?imes(?=[\s\dmpn]|$)/gi, '$1\\times ');
  repaired = repaired.replace(/(?:\\|\\\\)imes(?=[a-zA-Z0-9\s]|$)/g, '\\times ');
  repaired = repaired.replace(/cdot\s*ext/g, '\\cdot \\text');

  // 4. Fix corrupted integration and calculus formulas (e.g. Note 4 key formulas)
  repaired = repaired.replace(/\\?int_\{a(?:rac\{1\}\{\[?A\]?\})?\}\^\{b(?:rac\{1\}\{\[?A\]?\})?\}\s*f\(x\)\.?dx\s*=\s*F\(b\)\s*-\s*F\(a\)/g, '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)');
  repaired = repaired.replace(/arac\{1\}\{\[?A\]?\}/g, 'a');
  repaired = repaired.replace(/brac\{1\}\{\[?A\]?\}/g, 'b');
  repaired = repaired.replace(/(?<!\\)int_\{([^}]+)\}\^\{([^}]+)\}/g, '\\int_{$1}^{$2}');
  repaired = repaired.replace(/f\(x\)\.dx/g, 'f(x)\\,dx');

  // 5. Decode HTML entities inside math delimiters ($...$ and $$...$$) to avoid KaTeX parse errors
  repaired = repaired.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (match) => {
    return match
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  });

  // 6. Strip runaway nested empty wrapper spans around KaTeX math formulas
  repaired = repaired.replace(/<span>\s*(\$[^$]+\$)\s*<\/span>/g, '$1');
  repaired = repaired.replace(/<span>\s*(\$\$[\s\S]*?\$\$)\s*<\/span>/g, '$1');

  // 7. Strip stray literal form-feed (\x0C) and vertical tab (\x0B) control characters safely
  repaired = repaired.replace(/[\x0C\x0B]/g, '');

  // 8. Strip transient active editor selection outline styles or attributes
  repaired = repaired
    .replace(/\boutline\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-offset\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-color\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-style\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-width\s*:\s*[^;"]+;?/gi, '')
    .replace(/\bclass=["']([^"']*\s)?studio-active-selected-element(\s[^"']*)?["']/gi, (match, p1, p2) => {
      const remaining = `${p1 || ''}${p2 || ''}`.trim();
      return remaining ? ` class="${remaining}"` : '';
    });

  // 9. Restore stashed image data URLs intact
  if (stashedDataUrls.size > 0) {
    repaired = repaired.replace(/__IMG_DATA_STASH_\d+__/g, (token) => stashedDataUrls.get(token) || token);
  }

  return repaired;
}

export function getHtmlNotesStorageKey(userId?: string | null): string {
  const effectiveUid = userId !== undefined ? userId : (auth.currentUser?.uid || null);
  if (effectiveUid && typeof effectiveUid === 'string' && effectiveUid.trim() !== '' && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
    return `mockmc_html_projects_account_${effectiveUid.trim()}`;
  }
  return `mockmc_html_projects_guest`;
}

/**
 * Load projects from localStorage with automatic account scoping
 */
export function loadLocalProjects(defaultMatricesTemplate?: string, userId?: string | null): HtmlProject[] {
  if (typeof window === 'undefined') return [];
  const key = getHtmlNotesStorageKey(userId);
  
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: HtmlProject[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const sanitized = parsed.map(p => ({
          ...p,
          files: p.files.map(f => ({
            ...f,
            code: sanitizeAndRepairCode(f.code)
          }))
        }));
        cachedProjects = sanitized;
        return sanitized;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local projects:', e);
  }

  // Migrate legacy projects if account key has not been populated yet
  try {
    const legacyRaw = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (legacyRaw && key !== LOCAL_STORAGE_PROJECTS_KEY) {
      const parsed: HtmlProject[] = JSON.parse(legacyRaw);
      if (Array.isArray(parsed) && parsed.length > 0 && userId) {
        saveLocalProjects(parsed, userId);
        return parsed;
      }
    }
  } catch {}

  // If in-memory cache already has populated projects (e.g. from active session or recent save)
  if (cachedProjects && cachedProjects.length > 0) {
    return cachedProjects;
  }

  if (defaultMatricesTemplate && (!userId || userId === 'guest-user' || userId === 'anonymous')) {
    const now = Date.now();
    const seedProject: HtmlProject = {
      id: 'proj_seed_' + now,
      name: 'Class 12 Mathematics & Slide Decks',
      description: 'Chapter revision notes, 16:9 slides & formulas',
      createdAt: now,
      updatedAt: now,
      files: [
        {
          id: 'note_slides_ref_' + now,
          title: 'A4 Landscape Slide Reference',
          code: TEMPLATE_LANDSCAPE_SLIDES,
          createdAt: now,
          updatedAt: now,
          tags: ['Slide Deck', 'A4 Landscape', 'Reference']
        },

      ]
    };
    saveLocalProjects([seedProject], userId);
    return [seedProject];
  }

  return [];
}

const IDB_NAME = 'MockMC_HtmlStudio_DB';
const IDB_STORE = 'projects_store';

function openHtmlStudioIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveHtmlProjectsToIDB(key: string, projects: HtmlProject[]): Promise<void> {
  try {
    const db = await openHtmlStudioIDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(projects, key);
  } catch (err) {
    console.warn('Error saving html projects to IndexedDB:', err);
  }
}

export async function loadHtmlProjectsFromIDB(key: string): Promise<HtmlProject[] | null> {
  try {
    const db = await openHtmlStudioIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveProjects: HtmlProject[] | null = null;
let pendingSaveUserId: string | null | undefined = undefined;

export function flushLocalProjectsSave(): void {
  if (localSaveTimer) {
    clearTimeout(localSaveTimer);
    localSaveTimer = null;
  }
  if (pendingSaveProjects && typeof window !== 'undefined') {
    const key = getHtmlNotesStorageKey(pendingSaveUserId);
    try {
      localStorage.setItem(key, JSON.stringify(pendingSaveProjects));
    } catch (e) {
      safeSetItem(key, JSON.stringify(pendingSaveProjects), pendingSaveUserId);
    }
    saveHtmlProjectsToIDB(key, pendingSaveProjects).catch(() => {});
    pendingSaveProjects = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushLocalProjectsSave);
  window.addEventListener('pagehide', flushLocalProjectsSave);
}

/**
 * Save projects locally scoped by user account with 400ms debounce
 */
export function saveLocalProjects(projects: HtmlProject[], userId?: string | null, immediate: boolean = false): void {
  cachedProjects = projects;
  pendingSaveProjects = projects;
  pendingSaveUserId = userId;
  if (typeof window === 'undefined') return;

  if (immediate) {
    flushLocalProjectsSave();
  } else {
    if (localSaveTimer) clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => {
      flushLocalProjectsSave();
    }, 400);
  }
}

/**
 * Delete a project explicitly from Firebase Firestore
 */
export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  try {
    const projDoc = doc(db, 'users', user.uid, 'htmlNotesProjects', projectId);
    await deleteDoc(projDoc);
  } catch (err) {
    console.warn('Error deleting project document from Firestore:', err);
  }
}

/**
 * Smart Firestore Sync:
 * Saves all project documents in real-time to Firebase Firestore under users/{userId}/htmlNotesProjects/{projectId}
 * as well as the composite notes_data document.
 */
export function queueFirestoreSync(projects: HtmlProject[], immediate = false): void {
  saveLocalProjects(projects);

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    notifySyncStatus('local_only');
    return;
  }

  const currentHash = computeProjectsHash(projects);
  if (currentHash === lastSyncedHash) {
    notifySyncStatus('synced');
    return;
  }

  notifySyncStatus('saving');

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }

  const executeWrite = async () => {
    try {
      const cleanProjects = projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now(),
        userId: user.uid,
        files: (p.files || []).map(f => ({
          id: f.id,
          title: f.title || 'Untitled Note',
          code: f.code || '',
          createdAt: f.createdAt || Date.now(),
          updatedAt: f.updatedAt || Date.now(),
          tags: f.tags || []
        }))
      }));

      // 1. Write individual project documents under users/{userId}/htmlNotesProjects/{projectId}
      const writePromises = cleanProjects.map(proj => {
        const projDoc = doc(db, 'users', user.uid, 'htmlNotesProjects', proj.id);
        return setDoc(projDoc, removeUndefinedFields(proj), { merge: true });
      });
      await Promise.all(writePromises);

      // 2. Also write master single-document backup for legacy fallback
      const targetDoc = doc(db, 'users', user.uid, 'notes_data', 'projects');
      const payload = removeUndefinedFields({
        userId: user.uid,
        userEmail: user.email || '',
        updatedAt: Date.now(),
        projects: cleanProjects
      });
      await setDoc(targetDoc, payload, { merge: true });

      lastSyncedHash = currentHash;
      notifySyncStatus('synced');
    } catch (err) {
      console.warn('Firestore HTML notes sync warning:', err);
      notifySyncStatus('offline');
    }
  };

  if (immediate) {
    executeWrite();
  } else {
    syncDebounceTimer = setTimeout(executeWrite, 800);
  }
}

/**
 * Real-Time Listener on Firestore:
 * Attaches a real-time onSnapshot listener on user's htmlNotesProjects collection.
 * Any change made on Device A reflects instantly on Device B with 0 duplicates!
 */
export function subscribeToFirestoreProjects(
  userId: string,
  onProjectsUpdate: (projects: HtmlProject[]) => void
): Unsubscribe {
  const userCol = collection(db, 'users', userId, 'htmlNotesProjects');

  const unsubscribeCollection = onSnapshot(userCol, (snapshot) => {
    if (!snapshot.empty) {
      const remoteProjects: HtmlProject[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id || data.id,
          name: data.name || 'Untitled Project',
          description: data.description || '',
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          files: Array.isArray(data.files) ? data.files.map((f: any) => ({
            id: f.id,
            title: f.title || 'Untitled Note',
            code: sanitizeAndRepairCode(f.code || ''),
            createdAt: f.createdAt || Date.now(),
            updatedAt: f.updatedAt || Date.now(),
            tags: Array.isArray(f.tags) ? f.tags : []
          })) : []
        };
      });

      saveLocalProjects(remoteProjects, userId);
      lastSyncedHash = computeProjectsHash(remoteProjects);
      notifySyncStatus('synced');
      onProjectsUpdate(remoteProjects);
    }
  }, (err) => {
    console.warn('Firestore htmlNotesProjects collection snapshot notice:', err);
  });

  // Fallback listener for single-doc fallback
  const masterDoc = doc(db, 'users', userId, 'notes_data', 'projects');
  const unsubscribeDoc = onSnapshot(masterDoc, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.projects) && data.projects.length > 0) {
        const remoteProjects: HtmlProject[] = data.projects;
        const currentHash = computeProjectsHash(remoteProjects);
        if (currentHash !== lastSyncedHash) {
          saveLocalProjects(remoteProjects, userId);
          lastSyncedHash = currentHash;
          notifySyncStatus('synced');
          onProjectsUpdate(remoteProjects);
        }
      }
    }
  }, (err) => {
    console.warn('Firestore notes_data/projects snapshot notice:', err);
  });

  return () => {
    unsubscribeCollection();
    unsubscribeDoc();
  };
}

/**
 * Single initial read from Firestore on user sign-in to pull latest notes
 */
export async function fetchRemoteProjectsIfNewer(user: User, localProjects: HtmlProject[]): Promise<HtmlProject[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  try {
    const targetDoc = doc(db, 'users', user.uid, 'notes_data', 'projects');
    const snap = await getDoc(targetDoc);
    
    if (!snap.exists()) {
      if (localProjects.length > 0) {
        queueFirestoreSync(localProjects, true);
      }
      return null;
    }

    const data = snap.data();
    if (data && Array.isArray(data.projects) && data.projects.length > 0) {
      const remoteProjects: HtmlProject[] = data.projects;
      const remoteHash = computeProjectsHash(remoteProjects);
      const localHash = computeProjectsHash(localProjects);

      if (remoteHash !== localHash) {
        saveLocalProjects(remoteProjects, user.uid);
        lastSyncedHash = remoteHash;
        notifySyncStatus('synced');
        return remoteProjects;
      }
    }
  } catch (err) {
    console.warn('Remote projects fetch notice:', err);
    notifySyncStatus('local_only');
  }
  return null;
}

