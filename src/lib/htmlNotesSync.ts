import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, limit, type Unsubscribe } from 'firebase/firestore';
import { auth, db, isGlobalQuotaExceeded, updateUserSyncBeacon } from './firebase';
import { smartCoordinator } from './smartLocalCoordinator';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { safeSetItem, getCachedAuthUser } from './storage';
import { TEMPLATE_LANDSCAPE_SLIDES } from '../components/htmlNotes/constants/templates';
import { checkFirestoreDocSize } from './firestoreDocSizeValidator';


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
  _syncStatus?: 'pending' | 'synced';
  localUpdatedAt?: number;
}

export interface HtmlProject {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  files: HtmlNoteItem[];
  _syncStatus?: 'pending' | 'synced';
  localUpdatedAt?: number;
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

  // 5. Decode HTML entities inside math delimiters ($...$, $$...$$, and bare matrix environments) to avoid KaTeX parse errors
  repaired = repaired.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\begin\{(?:b|p|v|V|small)?matrix|cases|aligned|array\}[\s\S]+?\\end\{(?:b|p|v|V|small)?matrix|cases|aligned|array\})/g, (match) => {
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
  const cachedUid = typeof window !== 'undefined' ? getCachedAuthUser()?.uid || null : null;
  const effectiveUid = userId !== undefined ? userId : (auth.currentUser?.uid || cachedUid);
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

  // Immediately mirror to localStorage so any synchronous read or instant reload sees the data
  try {
    const key = getHtmlNotesStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(projects));
  } catch (e) {
    // Handled by flushLocalProjectsSave fallback if quota hit
  }

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
 * Saves strictly ONE single project document to Firestore.
 * Used when explicitly clicking "Save" or leaving an open project.
 * Hits exactly 1 Firestore write (never looping all projects or touching master doc).
 */
export async function saveSingleProjectToFirestore(
  project: HtmlProject,
  targetUserId?: string | null
): Promise<boolean> {
  const user = auth.currentUser;
  const effectiveUid = targetUserId || user?.uid;
  if (!effectiveUid || (user && user.isAnonymous)) {
    return false;
  }

  if (isGlobalQuotaExceeded()) {
    console.warn('[saveSingleProjectToFirestore] Daily quota reached; saved locally.');
    return false;
  }

  try {
    const cleanProj = {
      id: project.id,
      name: project.name,
      description: project.description || '',
      createdAt: project.createdAt || Date.now(),
      updatedAt: project.updatedAt || Date.now(),
      userId: effectiveUid,
      files: (project.files || []).map(f => ({
        id: f.id,
        title: f.title || 'Untitled Note',
        code: f.code || '',
        createdAt: f.createdAt || Date.now(),
        updatedAt: f.updatedAt || Date.now(),
        tags: f.tags || []
      }))
    };

    const sizeCheck = checkFirestoreDocSize(cleanProj);
    if (sizeCheck.isExceeded) {
      console.warn(`[Firestore Limit Exceeded] Project "${cleanProj.name}" is ${sizeCheck.formattedSize} (> 980 KB). Cloud write blocked to prevent 400 rejection.`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mockmc_doc_size_alert', { detail: { project: cleanProj, sizeResult: sizeCheck } }));
      }
      return false;
    }

    const projDoc = doc(db, 'users', effectiveUid, 'htmlNotesProjects', project.id);
    await setDoc(projDoc, removeUndefinedFields(cleanProj), { merge: true });

    // Atomically bump sync beacon notes revision and align local revision
    // This ensures local and remote revisions match, producing 0 reads on reload!
    const nowRev = Date.now();
    updateUserSyncBeacon(effectiveUid, { notesRev: nowRev }).catch(() => {});
    smartCoordinator.setLocalSyncRevision(effectiveUid, 'notesRev', nowRev);

    notifySyncStatus('synced');
    return true;
  } catch (err) {
    console.error('[saveSingleProjectToFirestore] Error saving single project:', err);
    return false;
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
 * Non-destructive Local-First Project Reconciliation.
 * Guarantees that local edits created during offline or quota-exhaustion states
 * are NEVER overwritten by older/stale remote snapshots.
 */
export function reconcileHtmlProjects(localProjects: HtmlProject[], remoteProjects: HtmlProject[]): HtmlProject[] {
  if (!Array.isArray(remoteProjects) || remoteProjects.length === 0) {
    return localProjects || [];
  }
  if (!Array.isArray(localProjects) || localProjects.length === 0) {
    return remoteProjects.map(p => ({ ...p, _syncStatus: 'synced' }));
  }

  // Quota guard: When daily quotas are exhausted or app is offline,
  // remote Firestore data cannot have post-quota edits.
  // Local state is strictly authoritative!
  if (isGlobalQuotaExceeded()) {
    console.warn('[reconcileHtmlProjects] Quota exhausted: Local HTML notes are strictly authoritative.');
    const localIdSet = new Set(localProjects.map(p => p.id));
    const merged = [...localProjects];
    remoteProjects.forEach(rp => {
      if (rp && rp.id && !localIdSet.has(rp.id)) {
        merged.push({ ...rp, _syncStatus: 'synced' });
      }
    });
    return merged;
  }

  const remoteMap = new Map<string, HtmlProject>();
  remoteProjects.forEach(rp => {
    if (rp && rp.id) remoteMap.set(rp.id, rp);
  });

  const mergedProjects: HtmlProject[] = [];
  const processedIds = new Set<string>();

  for (const local of localProjects) {
    if (!local || !local.id) continue;
    processedIds.add(local.id);
    const remote = remoteMap.get(local.id);

    if (!remote) {
      // Local project doesn't exist remotely (e.g. created while offline or during quota exhaustion)
      // PRESERVE local project completely!
      mergedProjects.push(local);
      continue;
    }

    // Project exists in both: merge files non-destructively
    const remoteFileMap = new Map<string, HtmlNoteItem>();
    (remote.files || []).forEach(rf => {
      if (rf && rf.id) remoteFileMap.set(rf.id, rf);
    });

    const reconciledFiles: HtmlNoteItem[] = [];
    const localFileIdSet = new Set<string>();

    (local.files || []).forEach(lf => {
      if (!lf || !lf.id) return;
      localFileIdSet.add(lf.id);
      const rf = remoteFileMap.get(lf.id);
      if (!rf) {
        // File exists locally, absent remotely -> ALWAYS PRESERVE IT!
        reconciledFiles.push(lf);
        return;
      }
      // File exists in both:
      const isLfPending = lf._syncStatus === 'pending';
      const lfTime = Math.max(lf.localUpdatedAt || 0, lf.updatedAt || 0);
      const rfTime = rf.updatedAt || 0;
      if (isLfPending || lfTime >= rfTime) {
        reconciledFiles.push(lf);
      } else {
        reconciledFiles.push({ ...rf, _syncStatus: 'synced' });
      }
    });

    // Add any files from remote that local does not have
    (remote.files || []).forEach(rf => {
      if (rf && rf.id && !localFileIdSet.has(rf.id)) {
        reconciledFiles.push({ ...rf, _syncStatus: 'synced' });
      }
    });

    const isProjectPending = local._syncStatus === 'pending' || reconciledFiles.some(f => f._syncStatus === 'pending');

    mergedProjects.push({
      ...local,
      name: (local.updatedAt >= (remote.updatedAt || 0)) ? local.name : (remote.name || local.name),
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
      _syncStatus: isProjectPending ? 'pending' : 'synced',
      files: reconciledFiles
    });
  }

  // Add any remote projects that do not exist locally
  for (const remote of remoteProjects) {
    if (remote && remote.id && !processedIds.has(remote.id)) {
      mergedProjects.push({
        ...remote,
        _syncStatus: 'synced'
      });
    }
  }

  return mergedProjects;
}

/**
 * Smart Firestore Sync:
 * Saves project documents to Firebase Firestore under users/{userId}/htmlNotesProjects/{projectId}.
 * Strictly guards against 1 MB document limits and halts uploads during quota exhaustion.
 */
export function queueFirestoreSync(projects: HtmlProject[], immediate = false): void {
  saveLocalProjects(projects);

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    notifySyncStatus('local_only');
    return;
  }

  // Quota guard: When daily quotas are exhausted, keep changes safely in local storage
  if (isGlobalQuotaExceeded()) {
    console.warn('[Firestore Sync] Daily Firestore quota exhausted. Edits safely stored in local IndexedDB/localStorage.');
    notifySyncStatus('offline');
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
      if (isGlobalQuotaExceeded()) {
        notifySyncStatus('offline');
        return;
      }

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

      // 1. Write individual project documents with 1 MB size guardrails
      for (const proj of cleanProjects) {
        const sizeCheck = checkFirestoreDocSize(proj);
        if (sizeCheck.isExceeded) {
          console.warn(`[Firestore Limit Exceeded] Project "${proj.name}" is ${sizeCheck.formattedSize} (> 980 KB). Cloud write blocked to prevent 400 rejection.`);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mockmc_doc_size_alert', { detail: { project: proj, sizeResult: sizeCheck } }));
          }
          continue; // Keep safely held in local IndexedDB/localStorage
        }

        const projDoc = doc(db, 'users', user.uid, 'htmlNotesProjects', proj.id);
        await setDoc(projDoc, removeUndefinedFields(proj), { merge: true });
      }



      // Mark projects as synced locally
      const syncedProjects = projects.map(p => ({ ...p, _syncStatus: 'synced' as const }));
      saveLocalProjects(syncedProjects, user.uid);

      // Atomically bump sync beacon notes revision
      const nowRev = Date.now();
      updateUserSyncBeacon(user.uid, { notesRev: nowRev }).catch(() => {});
      smartCoordinator.setLocalSyncRevision(user.uid, 'notesRev', nowRev);

      lastSyncedHash = currentHash;
      notifySyncStatus('synced');
    } catch (err: any) {
      console.warn('Firestore HTML notes sync warning:', err);
      const errStr = String(err?.message || err || '');
      if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || err?.code === 'resource-exhausted') {
        notifySyncStatus('offline');
      } else {
        notifySyncStatus('offline');
      }
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
 * Uses non-destructive reconciliation so local pending edits are NEVER overwritten!
 */
/**
 * Local-First Project Provider:
 * Instantly loads local projects from cache/IndexedDB with 0 network operations.
 * If local storage is empty on a brand-new device, performs a single-pass hydration pull with strict limit(25).
 * Eliminates continuous onSnapshot collection listening and unbounded queries to prevent quota spikes.
 */
export function subscribeToFirestoreProjects(
  userId: string,
  onProjectsUpdate: (projects: HtmlProject[]) => void
): Unsubscribe {
  // 1. Immediately hydrate from local storage (0ms UI latency, 0 reads, 0 writes)
  const currentLocal = loadLocalProjects(undefined, userId);
  if (currentLocal && currentLocal.length > 0) {
    onProjectsUpdate(currentLocal);
    // Align local revision with beacon if not set
    const localRevs = smartCoordinator.getLocalSyncRevisions(userId);
    if (!localRevs.notesRev) {
      smartCoordinator.setLocalSyncRevision(userId, 'notesRev', Date.now());
    }
    return () => {};
  }

  // 2. Single-pass cold start hydration ONLY if local storage is completely empty
  // Strict limit(25) prevents downloading thousands of historical documents!
  let isCancelled = false;
  if (typeof navigator !== 'undefined' && navigator.onLine && !isGlobalQuotaExceeded()) {
    const q = query(collection(db, 'users', userId, 'htmlNotesProjects'), limit(25));
    getDocs(q).then((snapshot) => {
      if (isCancelled || snapshot.empty) return;
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

      if (remoteProjects.length > 0) {
        saveLocalProjects(remoteProjects, userId, true);
        lastSyncedHash = computeProjectsHash(remoteProjects);
        const now = Date.now();
        smartCoordinator.setLocalSyncRevision(userId, 'notesRev', now);
        notifySyncStatus('synced');
        onProjectsUpdate(remoteProjects);
      }
    }).catch((err) => {
      console.warn('Initial projects hydration notice:', err);
    });
  }

  return () => {
    isCancelled = true;
  };
}

/**
 * Reconcile remote projects when revision differences are detected by sync beacon
 * Uses strict limit(25) and non-destructive reconciliation to protect offline/quota-exhaustion local notes.
 */
export async function fetchRemoteProjectsIfNewer(user: User, localProjects: HtmlProject[]): Promise<HtmlProject[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  if (isGlobalQuotaExceeded()) {
    return null;
  }
  try {
    const q = query(collection(db, 'users', user.uid, 'htmlNotesProjects'), limit(25));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

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

    const reconciled = reconcileHtmlProjects(localProjects, remoteProjects);
    saveLocalProjects(reconciled, user.uid, true);
    return reconciled;
  } catch (err) {
    console.warn('Remote projects fetch notice:', err);
    return null;
  }
}


