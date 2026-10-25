/**
 * ============================================================================
 * SMART LOCAL COORDINATOR / CACHE-ASIDE PROXY LAYER
 * ============================================================================
 * 
 * Production-Grade Single Gatekeeper between UI Components and Remote Backend
 * Designed for Firebase Spark (Free) Tier Optimization & Zero-Cost Network Operations.
 * 
 * Core Architectural Pillars:
 * 1. Single Access Point & Interception:
 *    - All UI components query and mutate data exclusively through this coordinator.
 * 2. Local Cache-First Filtering (Zero Cost Reads):
 *    - Inspects L1 (memory) and L2 (IndexedDB / local storage). Computes exact missing 'delta'.
 * 3. In-Flight Request Coalescing (Deduplication):
 *    - Merges concurrent identical requests for missing items into a single shared network promise.
 * 4. Micro-Batching & Remote Grouping:
 *    - 50ms buffer window groups divergent missing reads into batched Firestore `whereIn` queries (max 30/chunk).
 * 5. Debounced Write Queues & Optimistic Sync:
 *    - Instant local optimistic cache update (0ms UI latency). Writes pooled in 200ms debounced queue and
 *      flushed in single atomic Firestore `writeBatch` calls with offline queueing & exponential backoff.
 */

import { 
  db, 
  auth, 
  handleFirestoreError, 
  OperationType, 
  isGlobalQuotaExceeded,
  setGlobalQuotaExceeded,
  type UserSyncBeacon,
  updateUserSyncBeacon,
  deleteSingleChatSessionFromFirestoreDirect
} from './firebase';
import { 
  loadScopedTests, 
  saveScopedTests, 
  loadScopedAttempts, 
  saveScopedAttempts, 
  loadScopedChatSessions,
  saveScopedChatSessions,
  getAllDeletedTestIds, 
  markTestAsDeletedInScopedStorage, 
  unmarkTestAsDeletedInScopedStorage, 
  getAllDeletedChatSessionIds,
  markChatSessionAsDeletedInScopedStorage,
  pruneAttemptsToFirstAndLast, 
  isOfflineLocalOnlyMode 
} from './storage';
import { 
  getGenericItem, 
  putGenericItem,
  getAllTestsFromIndexedDB,
  getAllAttemptsFromIndexedDB,
  putTestToIndexedDB,
  deleteTestFromIndexedDB,
  putAttemptToIndexedDB,
  deleteAttemptFromIndexedDB
} from './indexedDbStorage';
import type { MathTest, TestAttempt } from '../types';
import { 
  optimizeTestForFirestore, 
  estimateByteSize, 
  countTestDiagrams 
} from './imageOptimization';
import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  documentId, 
  writeBatch, 
  setDoc, 
  deleteDoc,
  deleteField,
  arrayUnion,
  type DocumentData 
} from 'firebase/firestore';

export interface LocalTestQueryOptions {
  topic?: string;
  difficulty?: string;
  searchQuery?: string;
  authorId?: string | null;
  onlyPublic?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'questionCount' | 'difficulty';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface LocalAttemptQueryOptions {
  testId?: string;
  userId?: string | null;
  minScore?: number;
  maxScore?: number;
  sortBy?: 'date' | 'score' | 'timeSpent';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface LocalAggregatedStats {
  totalTestsCreated: number;
  totalAttemptsTaken: number;
  averageScorePercentage: number;
  passedAttemptsCount: number;
  passRatePercentage: number;
  totalTimeSpentSeconds: number;
  topTopics: { topic: string; count: number }[];
  lastActiveTimestamp?: string;
}

/**
 * Fast deterministic FNV-1a / DJB2 string checksum generator.
 * Ignores transient client metadata (`_syncStatus`, runtime IDs) to guarantee
 * identical payloads never trigger redundant Firestore network writes.
 */
export function computeEntityChecksum(data: any): string {
  if (data === null || data === undefined) return 'null';
  if (typeof data !== 'object') return String(data);
  
  try {
    const cleanForHash = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(cleanForHash);
      }
      const out: Record<string, any> = {};
      const sortedKeys = Object.keys(obj).sort();
      for (const k of sortedKeys) {
        if (k === '_syncStatus' || k === 'timestamp' || k === 'localSyncTime') continue;
        out[k] = cleanForHash(obj[k]);
      }
      return out;
    };
    const canonicalStr = JSON.stringify(cleanForHash(data));
    let hash = 2166136261;
    for (let i = 0; i < canonicalStr.length; i++) {
      hash ^= canonicalStr.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  } catch {
    return String(Date.now());
  }
}

// ==========================================
// Types & Interfaces
// ==========================================

export type CollectionName = 'tests' | 'attempts' | 'users' | 'notes' | 'chatSessions' | 'bookmarks' | 'notes_manifests' | 'user_sync_beacons';

export interface DomainRevisions {
  testsRev: number;
  attemptsRev: number;
  notesRev: number;
  chatsRev: number;
  profileRev: number;
}

export type MutationType = 'set' | 'update' | 'delete';

export interface MutationTask<T = any> {
  id: string;
  collection: CollectionName;
  customKey?: string;
  type: MutationType;
  data?: T;
  userId?: string | null;
  timestamp: number;
  retryCount: number;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

/**
 * Strips bulky base64 data attachments and excessive payload
 * from chat sessions before sending to Firestore, keeping read/write footprint minimal.
 */
export function toCompactChatSession(session: any): any {
  if (!session) return session;
  const compact = { ...session };

  if (Array.isArray(compact.messages)) {
    compact.messages = compact.messages.map((m: any) => {
      const msg = { ...m };
      if (Array.isArray(msg.attachments)) {
        msg.attachments = msg.attachments.map((a: any) => {
          const att = { ...a };
          if (typeof att.data === 'string' && att.data.length > 500) {
            att.data = `[Data attached: ${att.name || 'file'}, ${(att.size / 1024).toFixed(1)} KB]`;
          }
          if (typeof att.previewUrl === 'string' && att.previewUrl.length > 500) {
            delete att.previewUrl;
          }
          return att;
        });
      }
      if (Array.isArray(msg.generatedImages)) {
        msg.generatedImages = msg.generatedImages.map((img: string) => {
          if (typeof img === 'string' && img.length > 500) {
            return `[Generated Image: ${(img.length / 1024).toFixed(1)} KB]`;
          }
          return img;
        });
      }
      return msg;
    });
  }

  if (Array.isArray(compact.sessionDocuments)) {
    compact.sessionDocuments = compact.sessionDocuments.map((doc: any) => {
      const d = { ...doc };
      if (typeof d.data === 'string' && d.data.length > 500) {
        d.data = `[Document attached: ${d.name || 'document'}, ${(d.size / 1024).toFixed(1)} KB]`;
      }
      return d;
    });
  }

  return compact;
}

/**
 * Strips all heavy base64 images and large diagnostic payloads from TestAttempt
 * before storing into user history or the user profile document.
 */
export function toCleanAttemptForStorage(att: any): any {
  if (!att || typeof att !== 'object') return att;
  const { omrScannedImageUrl, processedImageDataUrl, cleanImageDataUrl, diagnosticImageUrl, questionDetections, ...rest } = att;
  return rest;
}

/**
 * Deep sanitization for User Document mutations to ensure that the document
 * never exceeds Firestore's 1MB limit.
 */
export function cleanUserDataForFirestore(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith('testHistories.') || key === 'testHistories') {
      if (val && typeof val === 'object') {
        const cleanedHistory: Record<string, any> = {};
        for (const [hKey, hVal] of Object.entries(val)) {
          if (hVal && typeof hVal === 'object') {
            const entry = { ...(hVal as any) };
            if (entry.firstAttempt) entry.firstAttempt = toCleanAttemptForStorage(entry.firstAttempt);
            if (entry.lastAttempt) entry.lastAttempt = toCleanAttemptForStorage(entry.lastAttempt);
            delete entry.omrScannedImageUrl;
            delete entry.diagnosticImageUrl;
            cleanedHistory[hKey] = entry;
          } else {
            cleanedHistory[hKey] = hVal;
          }
        }
        result[key] = cleanedHistory;
      } else {
        result[key] = val;
      }
    } else if (key.startsWith('chatSessions.') || key === 'chatSessions') {
      result[key] = toCompactChatSession(val);
    } else if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 1000) {
      result[key] = `[Image data stripped: ${(val.length / 1024).toFixed(1)} KB]`;
    } else if (val && typeof val === 'object') {
      result[key] = cleanUserDataForFirestore(val);
    } else {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Sanitizes Attempt payload for the attempts collection so single attempt documents remain small.
 */
export function cleanAttemptDataForFirestore(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const clean = { ...data };
  if (typeof clean.omrScannedImageUrl === 'string' && clean.omrScannedImageUrl.length > 100000) {
    delete clean.omrScannedImageUrl;
  }
  delete clean.processedImageDataUrl;
  delete clean.cleanImageDataUrl;
  delete clean.diagnosticImageUrl;
  return clean;
}

function sanitizeDataForFirestore(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (
    data._methodName || 
    (data.constructor && data.constructor.name === 'FieldValueImpl') || 
    (typeof data.isEqual === 'function' && typeof data.toDelta === 'undefined')
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeDataForFirestore);
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      result[key] = sanitizeDataForFirestore(val);
    }
  }
  return result;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  isStale?: boolean;
}

export interface ReadRequestItem<T = any> {
  id: string;
  resolve: (data: T | null) => void;
  reject: (err: any) => void;
}

export interface TelemetryMetrics {
  totalRequests: number;
  cacheHits: number;
  coalescedRequests: number;
  microBatchedQueries: number;
  remoteReadsExecuted: number;
  optimisticWrites: number;
  batchedWritesExecuted: number;
  quotaSavingsPercentage: number;
}

// ==========================================
// Smart Local Coordinator Class
// ==========================================

export class SmartLocalCoordinator {
  // L1 In-Memory Cache: Collection -> ID -> CacheEntry
  private l1Cache: Map<CollectionName, Map<string, CacheEntry>> = new Map();

  // In-Flight Promise Coalescing Map: `collection:id` -> Promise
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  // Micro-Batching Buffer: Collection -> Map<id, ReadRequestItem[]>
  private readBuffers: Map<CollectionName, Map<string, ReadRequestItem[]>> = new Map();
  private batchTimers: Map<CollectionName, NodeJS.Timeout | number> = new Map();
  private readonly MICRO_BATCH_DELAY_MS = 50; // 50ms aggregation window

  // Debounced Write Queue
  private writeQueue: MutationTask[] = [];
  private writeTimer: NodeJS.Timeout | number | null = null;
  private isFlushingWrites = false;
  private readonly WRITE_DEBOUNCE_MS = 200; // 200ms write buffer window

  // UI Subscribers: `collection:id` or `collection` -> Set<Callback>
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();

  // Checksum Fingerprint Store to prevent redundant Firestore writes
  private syncedFingerprints: Map<string, string> = new Map();
  // Timestamp store for collection sync metadata across reloads
  private syncTimestamps: Map<string, number> = new Map();
  // Local domain sync revision tracker to gate all collection queries
  private syncRevisions: Map<string, DomainRevisions> = new Map();

  // Telemetry & Metrics Tracking
  private metrics: TelemetryMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    coalescedRequests: 0,
    microBatchedQueries: 0,
    remoteReadsExecuted: 0,
    optimisticWrites: 0,
    batchedWritesExecuted: 0,
    quotaSavingsPercentage: 0,
  };

  private storagePrefix = 'smart_coordinator_v1_';

  // Strict Remote Storage Boundary: Only permitted top-level collections are synced with Firebase
  public readonly ALLOWED_FIRESTORE_COLLECTIONS: ReadonlySet<CollectionName> = new Set(['tests', 'attempts', 'users', 'user_sync_beacons']);

  constructor() {
    this.initL2StorageHydration();
    this.initFingerprintsFromStorage();
    this.setupOfflineOnlineListeners();
    this.setupLifecycleFlushListeners();
  }

  private initFingerprintsFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(`${this.storagePrefix}synced_fingerprints`);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === 'string') {
            this.syncedFingerprints.set(k, v);
          }
        });
      }
      const rawTime = localStorage.getItem(`${this.storagePrefix}sync_timestamps`);
      if (rawTime) {
        const parsedTimes = JSON.parse(rawTime);
        Object.entries(parsedTimes).forEach(([k, v]) => {
          if (typeof v === 'number') {
            this.syncTimestamps.set(k, v);
          }
        });
      }
      const rawRevs = localStorage.getItem(`${this.storagePrefix}sync_revisions`);
      if (rawRevs) {
        const parsedRevs = JSON.parse(rawRevs);
        Object.entries(parsedRevs).forEach(([uid, revs]) => {
          if (revs && typeof revs === 'object') {
            this.syncRevisions.set(uid, revs as DomainRevisions);
          }
        });
      }
    } catch {}
  }

  private persistFingerprintsToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const obj: Record<string, string> = {};
      this.syncedFingerprints.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(`${this.storagePrefix}synced_fingerprints`, JSON.stringify(obj));

      const timeObj: Record<string, number> = {};
      this.syncTimestamps.forEach((v, k) => {
        timeObj[k] = v;
      });
      localStorage.setItem(`${this.storagePrefix}sync_timestamps`, JSON.stringify(timeObj));

      const revsObj: Record<string, DomainRevisions> = {};
      this.syncRevisions.forEach((v, k) => {
        revsObj[k] = v;
      });
      localStorage.setItem(`${this.storagePrefix}sync_revisions`, JSON.stringify(revsObj));
      putGenericItem(`${this.storagePrefix}sync_revisions`, revsObj).catch(() => {});
    } catch {}
  }

  /**
   * Retrieves current local domain sync revisions for an authenticated user.
   */
  public getLocalSyncRevisions(userId?: string | null): DomainRevisions {
    const uid = userId && userId !== 'anonymous' && userId !== 'guest-user' ? userId.trim() : 'guest';
    const found = this.syncRevisions.get(uid);
    if (found) return found;

    const defaultRevs: DomainRevisions = {
      testsRev: 0,
      attemptsRev: 0,
      notesRev: 0,
      chatsRev: 0,
      profileRev: 0,
    };
    this.syncRevisions.set(uid, defaultRevs);
    return defaultRevs;
  }

  /**
   * Sets local domain sync revision for a specific domain.
   */
  public setLocalSyncRevision(userId: string | null | undefined, domain: keyof DomainRevisions, rev: number): void {
    const uid = userId && userId !== 'anonymous' && userId !== 'guest-user' ? userId.trim() : 'guest';
    const current = this.getLocalSyncRevisions(uid);
    current[domain] = rev;
    this.syncRevisions.set(uid, current);
    this.persistFingerprintsToStorage();
  }

  /**
   * Bulk updates local domain sync revisions.
   */
  public setAllLocalSyncRevisions(userId: string | null | undefined, revs: Partial<DomainRevisions>): void {
    const uid = userId && userId !== 'anonymous' && userId !== 'guest-user' ? userId.trim() : 'guest';
    const current = this.getLocalSyncRevisions(uid);
    Object.assign(current, revs);
    this.syncRevisions.set(uid, current);
    this.persistFingerprintsToStorage();
  }

  /**
   * Checks if local collection is fresh and does not need remote Firestore reload.
   */
  public isCollectionFresh(col: CollectionName, userId: string | null, maxAgeMs = 15 * 60 * 1000): boolean {
    if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return true;
    const key = `${col}:${userId || 'guest'}`;
    const lastSync = this.syncTimestamps.get(key) || 0;
    const age = Date.now() - lastSync;
    const hasPendingWrites = this.writeQueue.some((t) => t.collection === col && (t.userId || null) === (userId || null));
    return !hasPendingWrites && lastSync > 0 && age < maxAgeMs;
  }

  /**
   * Marks collection as successfully synchronized at current timestamp.
   */
  public markCollectionSynced(col: CollectionName, userId: string | null): void {
    const key = `${col}:${userId || 'guest'}`;
    this.syncTimestamps.set(key, Date.now());
    this.persistFingerprintsToStorage();
  }

  private setupLifecycleFlushListeners(): void {
    if (typeof window === 'undefined') return;
    const handleExit = () => {
      this.flushWriteQueue().catch(() => {});
    };
    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleExit();
      }
    });
  }

  public scheduleFlush(delayMs: number = this.WRITE_DEBOUNCE_MS): void {
    if (isGlobalQuotaExceeded() || isOfflineLocalOnlyMode()) {
      return;
    }
    if (this.writeTimer) clearTimeout(this.writeTimer as any);
    this.writeTimer = setTimeout(() => {
      this.flushWriteQueue();
    }, delayMs);
  }

  // ============================================================================
  // 1. SINGLE ACCESS POINT & INTERCEPTION
  // ============================================================================

  /**
   * Main Interceptor Method for Single Entity Reads.
   * Checks L1/L2 cache and IndexedDB first. If missing, coalesces and queues for micro-batching.
   */
  public async getEntity<T = any>(col: CollectionName, id: string): Promise<T | null> {
    this.metrics.totalRequests++;

    if (!col || !id) return null;

    // Step 1: Local L1/L2 Synchronous Cache-First Filtering (0ms, 0 Reads)
    const cached = this.getFromLocalCache<T>(col, id);
    if (cached) {
      this.metrics.cacheHits++;
      this.updateMetricsRatio();
      return cached.data;
    }

    // Step 2: High-Capacity IndexedDB Persistent Storage Filtering (0 Reads)
    const idbCached = await this.getFromIndexedDBCache<T>(col, id);
    if (idbCached) {
      this.metrics.cacheHits++;
      this.updateMetricsRatio();
      return idbCached.data;
    }

    // Step 3: Strict Scope Guard - Never ping Firestore for unauthorized collections (notes, etc.)
    if (!this.ALLOWED_FIRESTORE_COLLECTIONS.has(col)) {
      return null;
    }

    // Step 4: In-Flight Request Coalescing (Deduplication)
    const requestKey = `${col}:${id}`;
    if (this.inFlightRequests.has(requestKey)) {
      this.metrics.coalescedRequests++;
      this.updateMetricsRatio();
      return this.inFlightRequests.get(requestKey) as Promise<T | null>;
    }

    // Create a new coalesced promise and route to Micro-Batch Buffer
    const promise = new Promise<T | null>((resolve, reject) => {
      this.enqueueForMicroBatch(col, id, resolve, reject);
    }).finally(() => {
      this.inFlightRequests.delete(requestKey);
    });

    this.inFlightRequests.set(requestKey, promise);
    return promise;
  }

  /**
   * Main Interceptor Method for Multiple Entity Reads.
   * Computes exact missing 'delta' across L1/L2/IndexedDB and only queries remote for absent items.
   */
  public async getEntities<T = any>(col: CollectionName, ids: string[]): Promise<Record<string, T | null>> {
    if (!ids || ids.length === 0) return {};

    this.metrics.totalRequests += ids.length;

    const result: Record<string, T | null> = {};
    const missingIds: string[] = [];

    // Step 1: Synchronous Local Cache Delta Calculation
    for (const id of ids) {
      const cached = this.getFromLocalCache<T>(col, id);
      if (cached) {
        this.metrics.cacheHits++;
        result[id] = cached.data;
      } else {
        missingIds.push(id);
      }
    }

    // Step 2: Asynchronous IndexedDB Cache Delta Calculation
    if (missingIds.length > 0) {
      const remainingMissing: string[] = [];
      for (const id of missingIds) {
        const idbCached = await this.getFromIndexedDBCache<T>(col, id);
        if (idbCached) {
          this.metrics.cacheHits++;
          result[id] = idbCached.data;
        } else {
          remainingMissing.push(id);
        }
      }
      missingIds.length = 0;
      missingIds.push(...remainingMissing);
    }

    this.updateMetricsRatio();

    // If zero missing items, return instantly (Zero Remote Cost!)
    if (missingIds.length === 0) {
      return result;
    }

    // If collection is not allowed on Firestore (e.g. notes), resolve missing as null with 0 network reads
    if (!this.ALLOWED_FIRESTORE_COLLECTIONS.has(col)) {
      missingIds.forEach((id) => {
        result[id] = null;
      });
      return result;
    }

    // Fetch missing delta in parallel using coalesced single entity reads
    const missingPromises = missingIds.map(async (id) => {
      const data = await this.getEntity<T>(col, id);
      return { id, data };
    });

    const fetchedItems = await Promise.all(missingPromises);
    fetchedItems.forEach(({ id, data }) => {
      result[id] = data;
    });

    return result;
  }

  /**
   * High-capacity IndexedDB cache filter for tests, attempts, and general entries.
   */
  private async getFromIndexedDBCache<T>(col: CollectionName, id: string): Promise<CacheEntry<T> | null> {
    try {
      const activeUid = auth.currentUser?.uid || null;
      if (col === 'tests') {
        const tests = await getAllTestsFromIndexedDB(activeUid);
        const found = tests.find((t) => t && t.id === id);
        if (found) {
          this.setInL1Cache(col, id, found as any);
          return { data: found as any, timestamp: Date.now() };
        }
      } else if (col === 'attempts') {
        const attempts = await getAllAttemptsFromIndexedDB(activeUid);
        const found = attempts.find((a) => a && a.id === id);
        if (found) {
          this.setInL1Cache(col, id, found as any);
          return { data: found as any, timestamp: Date.now() };
        }
      } else {
        const generic = await getGenericItem<T>(`${this.storagePrefix}${col}_${id}`);
        if (generic) {
          this.setInL1Cache(col, id, generic);
          return { data: generic, timestamp: Date.now() };
        }
      }
    } catch {
      // IndexedDB access fallback
    }
    return null;
  }

  // ============================================================================
  // 2. LOCAL CACHE-FIRST FILTERING (ZERO COST READS)
  // ============================================================================

  private getFromLocalCache<T>(col: CollectionName, id: string): CacheEntry<T> | null {
    // 1. Check L1 In-Memory Cache
    const colMap = this.l1Cache.get(col);
    if (colMap && colMap.has(id)) {
      return colMap.get(id) as CacheEntry<T>;
    }

    // 2. Fallback to L2 Local Storage
    try {
      const raw = localStorage.getItem(`${this.storagePrefix}${col}_${id}`);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        // Hydrate L1
        this.setInL1Cache(col, id, entry.data);
        return entry;
      }
    } catch (e) {
      // Storage unavailable or disabled
    }

    return null;
  }

  private setInL1Cache<T>(col: CollectionName, id: string, data: T): void {
    if (!this.l1Cache.has(col)) {
      this.l1Cache.set(col, new Map());
    }
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.l1Cache.get(col)!.set(id, entry);

    // Sync to L2 Async/Storage
    try {
      localStorage.setItem(`${this.storagePrefix}${col}_${id}`, JSON.stringify(entry));
    } catch (e) {}
  }

  public removeFromLocalCache(col: CollectionName, id: string): void {
    const colMap = this.l1Cache.get(col);
    if (colMap) {
      colMap.delete(id);
    }
    try {
      localStorage.removeItem(`${this.storagePrefix}${col}_${id}`);
    } catch (e) {}
  }

  // ============================================================================
  // 3. HIGH-PERFORMANCE LOCAL QUERY & AGGREGATION ENGINE (0 NETWORK COST)
  // ============================================================================

  /**
   * Executes multi-filter, full-text search, sorting, and pagination queries
   * 100% locally from IndexedDB / L1 / L2 scoped storage without hitting Firestore.
   */
  public queryTestsLocal(options: LocalTestQueryOptions = {}): MathTest[] {
    const activeUid = options.authorId !== undefined ? options.authorId : (auth.currentUser?.uid || null);
    const tests = loadScopedTests(activeUid);

    let filtered = tests.filter((t) => {
      if (!t || !t.id) return false;
      if (options.topic && options.topic !== 'all' && t.topic?.toLowerCase() !== options.topic.toLowerCase()) {
        return false;
      }
      if (options.difficulty && options.difficulty !== 'all' && t.difficulty?.toLowerCase() !== options.difficulty.toLowerCase()) {
        return false;
      }
      if (options.onlyPublic && !t.isPublic) {
        return false;
      }
      if (options.searchQuery && options.searchQuery.trim().length > 0) {
        const q = options.searchQuery.toLowerCase().trim();
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const topicMatch = (t.topic || '').toLowerCase().includes(q);
        const questionMatch = Array.isArray(t.questions) && t.questions.some((qu: any) => 
          (qu?.text || '').toLowerCase().includes(q) || (qu?.question || '').toLowerCase().includes(q)
        );
        if (!titleMatch && !descMatch && !topicMatch && !questionMatch) {
          return false;
        }
      }
      return true;
    });

    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    filtered.sort((a, b) => {
      let valA: any = a[sortBy as keyof MathTest];
      let valB: any = b[sortBy as keyof MathTest];
      if (sortBy === 'questionCount') {
        valA = a.questions?.length || a.questionCount || 0;
        valB = b.questions?.length || b.questionCount || 0;
      } else if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Executes attempt history queries, filtering by testId, score, sorting by date/score locally.
   */
  public queryAttemptsLocal(options: LocalAttemptQueryOptions = {}): TestAttempt[] {
    const activeUid = options.userId !== undefined ? options.userId : (auth.currentUser?.uid || null);
    const attempts = loadScopedAttempts(activeUid);

    let filtered = attempts.filter((a) => {
      if (!a || !a.id) return false;
      if (options.testId && a.testId !== options.testId) {
        return false;
      }
      const pct = typeof a.percentage === 'number' ? a.percentage : (
        typeof a.score === 'number' && typeof a.totalPoints === 'number' && a.totalPoints > 0
          ? (a.score / a.totalPoints) * 100
          : 0
      );
      if (options.minScore !== undefined && pct < options.minScore) {
        return false;
      }
      if (options.maxScore !== undefined && pct > options.maxScore) {
        return false;
      }
      return true;
    });

    const sortBy = options.sortBy || 'date';
    const sortOrder = options.sortOrder || 'desc';
    filtered.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (sortBy === 'date') {
        valA = new Date(a.completedAt || a.createdAt || 0).getTime();
        valB = new Date(b.completedAt || b.createdAt || 0).getTime();
      } else if (sortBy === 'score') {
        valA = typeof a.percentage === 'number' ? a.percentage : (a.score || 0);
        valB = typeof b.percentage === 'number' ? b.percentage : (b.score || 0);
      } else if (sortBy === 'timeSpent') {
        valA = a.timeSpentSeconds || 0;
        valB = b.timeSpentSeconds || 0;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Computes comprehensive analytics rollup from local data with zero cloud latency.
   */
  public getLocalStatsRollup(userId?: string | null): LocalAggregatedStats {
    const activeUid = userId !== undefined ? userId : (auth.currentUser?.uid || null);
    const tests = loadScopedTests(activeUid);
    const attempts = loadScopedAttempts(activeUid);

    const totalTestsCreated = tests.filter((t) => t.authorId === activeUid || (!t.id.startsWith('sample-') && !t.id.startsWith('math-'))).length;
    const totalAttemptsTaken = attempts.length;

    let totalScorePct = 0;
    let passedCount = 0;
    let totalTime = 0;
    let lastActive: string | undefined;

    const topicCounts: Record<string, number> = {};

    attempts.forEach((a) => {
      const pct = typeof a.percentage === 'number' ? a.percentage : (
        typeof a.score === 'number' && typeof a.totalPoints === 'number' && a.totalPoints > 0
          ? (a.score / a.totalPoints) * 100
          : 0
      );
      totalScorePct += pct;
      if (a.passed || pct >= 70) {
        passedCount++;
      }
      if (a.timeSpentSeconds) {
        totalTime += a.timeSpentSeconds;
      }
      const dateStr = a.completedAt || a.createdAt;
      if (dateStr && (!lastActive || new Date(dateStr).getTime() > new Date(lastActive).getTime())) {
        lastActive = dateStr;
      }
      if (a.testTitle) {
        topicCounts[a.testTitle] = (topicCounts[a.testTitle] || 0) + 1;
      }
    });

    const topTopics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalTestsCreated,
      totalAttemptsTaken,
      averageScorePercentage: totalAttemptsTaken > 0 ? Math.round(totalScorePct / totalAttemptsTaken) : 0,
      passedAttemptsCount: passedCount,
      passRatePercentage: totalAttemptsTaken > 0 ? Math.round((passedCount / totalAttemptsTaken) * 100) : 0,
      totalTimeSpentSeconds: totalTime,
      topTopics,
      lastActiveTimestamp: lastActive,
    };
  }

  /**
   * Retrieves a test by ID with immediate L1/L2 local fallback.
   */
  public getTestByIdLocal(id: string, userId?: string | null): MathTest | null {
    const activeUid = userId !== undefined ? userId : (auth.currentUser?.uid || null);
    const cached = this.getFromLocalCache<MathTest>('tests', id);
    if (cached) return cached.data;
    const tests = loadScopedTests(activeUid);
    const found = tests.find((t) => t && t.id === id);
    if (found) {
      this.setInL1Cache('tests', id, found);
      return found;
    }
    return null;
  }

  /**
   * Fetches full test payload (including questions and SVG diagrams) on-demand.
   * Checks L1 memory -> L2 IndexedDB -> Firestore single doc (Data-on-Demand).
   */
  public async fetchTestPayloadOnDemand(id: string, userId?: string | null): Promise<MathTest | null> {
    if (!id) return null;
    const activeUid = userId !== undefined ? userId : (auth.currentUser?.uid || null);

    // 1. Check L1 / L2 local
    const local = this.getTestByIdLocal(id, activeUid);
    if (local && Array.isArray(local.questions) && local.questions.length > 0) {
      return local;
    }

    // 2. Check IndexedDB directly
    try {
      const idbTests = await getAllTestsFromIndexedDB(activeUid);
      const found = idbTests.find((t) => t.id === id);
      if (found && Array.isArray(found.questions) && found.questions.length > 0) {
        this.setInL1Cache('tests', id, found);
        return found;
      }
    } catch {}

    // 3. Fallback: Fetch single test doc on-demand from Firestore
    if (!isOfflineLocalOnlyMode() && !isGlobalQuotaExceeded()) {
      try {
        const snap = await getDoc(doc(db, 'tests', id));
        if (snap.exists()) {
          const raw = snap.data() as MathTest;
          const normalized: MathTest = {
            ...raw,
            id: snap.id,
            questions: Array.isArray(raw.questions) ? raw.questions : [],
          };
          this.setInL1Cache('tests', id, normalized);
          putTestToIndexedDB(activeUid, normalized).catch(() => {});
          return normalized;
        }
      } catch (e) {
        console.warn(`Failed to fetch test payload on-demand for ${id}:`, e);
      }
    }

    return local || null;
  }

  /**
   * Retrieves an attempt by ID with immediate L1/L2 local fallback.
   */
  public getAttemptByIdLocal(id: string, userId?: string | null): TestAttempt | null {
    const activeUid = userId !== undefined ? userId : (auth.currentUser?.uid || null);
    const cached = this.getFromLocalCache<TestAttempt>('attempts', id);
    if (cached) return cached.data;
    const attempts = loadScopedAttempts(activeUid);
    const found = attempts.find((a) => a && a.id === id);
    if (found) {
      this.setInL1Cache('attempts', id, found);
      return found;
    }
    return null;
  }

  // ============================================================================
  // 4. MICRO-BATCHING & REMOTE GROUPING
  // ============================================================================

  private enqueueForMicroBatch<T>(
    col: CollectionName,
    id: string,
    resolve: (data: T | null) => void,
    reject: (err: any) => void
  ): void {
    if (!this.readBuffers.has(col)) {
      this.readBuffers.set(col, new Map());
    }

    const colBuffer = this.readBuffers.get(col)!;
    if (!colBuffer.has(id)) {
      colBuffer.set(id, []);
    }

    colBuffer.get(id)!.push({ id, resolve, reject });

    // Schedule batch flush if not already active
    if (!this.batchTimers.has(col)) {
      const timer = setTimeout(() => {
        this.flushMicroBatch(col);
      }, this.MICRO_BATCH_DELAY_MS);
      this.batchTimers.set(col, timer);
    }
  }

  /**
   * Flushes accumulated read requests into single batched Firestore `whereIn` queries.
   */
  private async flushMicroBatch(col: CollectionName): Promise<void> {
    const timer = this.batchTimers.get(col);
    if (timer) {
      clearTimeout(timer as any);
      this.batchTimers.delete(col);
    }

    const colBuffer = this.readBuffers.get(col);
    if (!colBuffer || colBuffer.size === 0) return;

    // Extract all unique missing IDs in buffer
    const missingIds = Array.from(colBuffer.keys());
    const requestsMap = new Map(colBuffer);
    this.readBuffers.set(col, new Map()); // Reset buffer

    if (isGlobalQuotaExceeded() || !this.ALLOWED_FIRESTORE_COLLECTIONS.has(col)) {
      // Reject or return offline nulls if quota exceeded or collection is non-cloud
      requestsMap.forEach((reqs) => reqs.forEach((r) => r.resolve(null)));
      return;
    }

    this.metrics.microBatchedQueries++;

    // Firestore `whereIn` supports max 30 items per chunk
    const CHUNK_SIZE = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
      chunks.push(missingIds.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      try {
        this.metrics.remoteReadsExecuted++;
        
        // Execute single remote query for up to 30 items at once
        const q = query(collection(db, col), where(documentId(), 'in', chunk));
        const snap = await getDocs(q);

        const fetchedMap = new Map<string, DocumentData>();
        snap.forEach((docSnap) => {
          fetchedMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });

        // Resolve all waiting component promises & hydrate local cache
        chunk.forEach((id) => {
          const docData = fetchedMap.get(id) || null;
          if (docData) {
            this.setInL1Cache(col, id, docData);
          }
          const waitingReqs = requestsMap.get(id) || [];
          waitingReqs.forEach((r) => r.resolve(docData));
          this.notifySubscribers(col, id, docData);
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, col);
        // Fallback resolution
        chunk.forEach((id) => {
          const waitingReqs = requestsMap.get(id) || [];
          waitingReqs.forEach((r) => r.resolve(null));
        });
      }
    }
  }

  // ============================================================================
  // 5. DEBOUNCED WRITE QUEUES & OUTBOX ENGINE
  // ============================================================================

  /**
   * Checks if live network snapshot listeners should be attached.
   * If quota is exceeded or offline local mode is active, returns false to prevent
   * quota burn and avoid stale data overwriting local progress.
   */
  public shouldAttachLiveListener(): boolean {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return !isOffline && !isOfflineLocalOnlyMode() && !isGlobalQuotaExceeded();
  }

  /**
   * Checks if an entity is currently pending write in the local outbox queue.
   */
  public isPending(col: CollectionName, id: string): boolean {
    return this.writeQueue.some((task) => task.collection === col && task.id === id);
  }

  /**
   * Returns current count of pending outbox writes awaiting remote commit.
   */
  public getPendingCount(): number {
    return this.writeQueue.length;
  }

  /**
   * Gatekeeper for Test Attempts:
   * 1. Tags attempt as `_syncStatus: 'pending'`
   * 2. Immediately updates L1 memory & L2 scoped storage (0ms UI latency)
   * 3. Prunes locally to first + last attempt per test
   * 4. Queues into persistent outbox
   * 5. If quota is exceeded, keeps safe locally and defers network commit without throwing
   */
  public recordAttempt(attempt: TestAttempt, userId?: string | null): TestAttempt {
    if (!attempt || !attempt.id) return attempt;
    const activeUid = userId || auth.currentUser?.uid || attempt.userId || null;

    const cleanAttempt = cleanAttemptDataForFirestore(attempt);
    const checksum = computeEntityChecksum(cleanAttempt);
    const existingChecksum = this.syncedFingerprints.get(`attempts:${attempt.id}`);

    // If payload is byte-for-byte identical to what was already committed to Firestore,
    // update local state and avoid queuing redundant network writes.
    if (existingChecksum === checksum && !this.isPending('attempts', attempt.id)) {
      this.setInL1Cache('attempts', attempt.id, attempt);
      return attempt;
    }

    const pendingAttempt: TestAttempt = {
      ...attempt,
      userId: activeUid || attempt.userId || 'guest-user',
      _syncStatus: 'pending',
    };

    // 1. Instant Cache Update (L1 + L2)
    this.setInL1Cache('attempts', pendingAttempt.id, pendingAttempt);

    // 2. Load existing local attempts, merge, and prune to first + last
    const currentAttempts = loadScopedAttempts(activeUid);
    const updatedList = [pendingAttempt, ...currentAttempts.filter((a) => a.id !== pendingAttempt.id)];
    const { pruned, removedAttemptIds } = pruneAttemptsToFirstAndLast(updatedList);
    saveScopedAttempts(activeUid, pruned);

    // 3. Single-Write Attempt Pattern:
    // Strictly queue 1 write task for the new attempt document.
    // Pruning is kept 100% in local browser storage (L2) to prevent Firestore write pollution.
    this.writeQueue = this.writeQueue.filter((t) => !(t.collection === 'attempts' && t.id === pendingAttempt.id));
    this.writeQueue.push({
      id: pendingAttempt.id,
      collection: 'attempts',
      type: 'set',
      data: pendingAttempt,
      userId: activeUid,
      timestamp: Date.now(),
      retryCount: 0,
      syncStatus: 'pending',
    });

    this.persistWriteQueueToL2();
    this.notifySubscribers('attempts', pendingAttempt.id, pendingAttempt);
    putAttemptToIndexedDB(activeUid, pendingAttempt).catch(() => {});

    // 4. Safe offline isolation if quota exceeded or offline mode
    if (isGlobalQuotaExceeded() || isOfflineLocalOnlyMode()) {
      console.info('SmartLocalCoordinator: Attempt saved locally in outbox. Remote sync queued until quota resets.');
      return pendingAttempt;
    }

    // 5. Debounce flush to remote
    if (this.writeTimer) clearTimeout(this.writeTimer as any);
    this.writeTimer = setTimeout(() => {
      this.flushWriteQueue();
    }, this.WRITE_DEBOUNCE_MS);

    return pendingAttempt;
  }

  /**
   * Deletes an attempt locally and queues remote deletion in the coordinator outbox.
   */
  public deleteAttempt(attemptId: string, userId?: string | null): void {
    if (!attemptId) return;
    const activeUid = userId || auth.currentUser?.uid || null;

    // 1. Instant Cache Update (L1 + L2)
    this.removeFromLocalCache('attempts', attemptId);
    const currentAttempts = loadScopedAttempts(activeUid);
    const updatedList = currentAttempts.filter((a) => a.id !== attemptId);
    saveScopedAttempts(activeUid, updatedList);

    // 2. Queue in Outbox
    this.writeQueue = this.writeQueue.filter((t) => !(t.collection === 'attempts' && t.id === attemptId));
    this.writeQueue.push({
      id: attemptId,
      collection: 'attempts',
      type: 'delete',
      userId: activeUid,
      timestamp: Date.now(),
      retryCount: 0,
    });

    this.persistWriteQueueToL2();
    this.notifySubscribers('attempts', attemptId, null);
    deleteAttemptFromIndexedDB(activeUid, attemptId).catch(() => {});

    if (isGlobalQuotaExceeded() || isOfflineLocalOnlyMode()) {
      return;
    }

    if (this.writeTimer) clearTimeout(this.writeTimer as any);
    this.writeTimer = setTimeout(() => {
      this.flushWriteQueue();
    }, this.WRITE_DEBOUNCE_MS);
  }

  /**
   * Non-destructive reconciliation for Test Attempts:
   * Prevents stale cloud data from wiping out local attempts when quota is reached.
   */
  public reconcileAttempts(userId: string | null, remoteAttempts: TestAttempt[]): TestAttempt[] {
    const localAttempts = loadScopedAttempts(userId);
    const pendingIds = new Set(
      this.writeQueue.filter((t) => t.collection === 'attempts').map((t) => t.id)
    );

    const mergedMap = new Map<string, TestAttempt>();

    // Step 1: Seed with all local attempts (ensures any local work is never lost)
    localAttempts.forEach((loc) => {
      if (loc && loc.id) {
        mergedMap.set(loc.id, loc);
      }
    });

    // Step 2: Merge cloud attempts without overwriting pending local attempts
    (remoteAttempts || []).forEach((rem) => {
      if (!rem || !rem.id) return;
      const localExisting = mergedMap.get(rem.id);

      // Rule: Never overwrite uncommitted local work or locally newer records!
      if (localExisting) {
        if (pendingIds.has(rem.id) || localExisting._syncStatus === 'pending') {
          return; // Local version wins
        }
        const localTime = new Date((localExisting as any).localUpdatedAt || localExisting.completedAt || localExisting.createdAt || 0).getTime();
        const remoteTime = new Date(rem.completedAt || rem.createdAt || (rem as any).updatedAt || 0).getTime();
        if (localTime > remoteTime) {
          return; // Local newer version wins
        }
      }

      mergedMap.set(rem.id, {
        ...rem,
        _syncStatus: 'synced',
      });
    });

    // Step 3: Prune to first + last attempt per test
    const mergedList = Array.from(mergedMap.values());
    const { pruned } = pruneAttemptsToFirstAndLast(mergedList);

    // Step 4: Persist reconciled list safely to scoped storage
    saveScopedAttempts(userId, pruned);

    // Step 5: Refresh L1 cache & record synced fingerprints
    pruned.forEach((a) => {
      this.setInL1Cache('attempts', a.id, a);
      if (a._syncStatus === 'synced') {
        const clean = cleanAttemptDataForFirestore(a);
        this.syncedFingerprints.set(`attempts:${a.id}`, computeEntityChecksum(clean));
      }
    });

    this.markCollectionSynced('attempts', userId);
    this.persistFingerprintsToStorage();

    return pruned;
  }

  /**
   * Optimistic Chat Session Recorder:
   * 1. 0ms Latency: writes directly to L1 Cache & L2 Scoped IndexedDB.
   * 2. Read/Write Minimization:
   *    During active chat/typing, saves locally only.
   *    Firestore single-document archive is flushed on tab close / exit or on explicit toggle (forceImmediate).
   */
  public recordChatSession(session: any, userId?: string | null, forceImmediate: boolean = false): any {
    if (!session || !session.id) return session;
    const activeUid = userId || auth.currentUser?.uid || null;
    const isCloudEnabled = Boolean(session.cloudSyncEnabled);
    const isSignedIn = Boolean(activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user');

    const pendingSession = {
      ...session,
      _syncStatus: isCloudEnabled && isSignedIn ? (forceImmediate ? 'synced' : 'pending') : 'synced',
    };

    // 1. Instant Cache Update (L1 + L2 IndexedDB)
    this.setInL1Cache('chatSessions', pendingSession.id, pendingSession);
    const localSessions = loadScopedChatSessions(activeUid);
    const updatedList = [pendingSession, ...localSessions.filter((s: any) => s.id !== pendingSession.id)];
    saveScopedChatSessions(activeUid, updatedList);

    // Working mode is 100% local (0 network writes). Per-session cloud persistence is handled strictly on exit via geminiChatSyncManager.
    this.notifySubscribers('chatSessions', pendingSession.id, pendingSession);
    return pendingSession;
  }

  /**
   * Deletes a chat session locally and removes the session document from Firestore directly.
   */
  public deleteChatSession(sessionId: string, userId?: string | null): void {
    if (!sessionId) return;
    const activeUid = userId || auth.currentUser?.uid || null;
    const isSignedIn = Boolean(activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user');

    markChatSessionAsDeletedInScopedStorage(activeUid, sessionId);

    this.removeFromLocalCache('chatSessions', sessionId);
    const localSessions = loadScopedChatSessions(activeUid).filter((s: any) => s.id !== sessionId);
    saveScopedChatSessions(activeUid, localSessions);

    if (isSignedIn && !isOfflineLocalOnlyMode() && !isGlobalQuotaExceeded()) {
      deleteSingleChatSessionFromFirestoreDirect(activeUid!, sessionId).catch(() => {});
    }

    this.notifySubscribers('chatSessions', sessionId, null);
  }

  /**
   * Non-destructive reconciliation for Chat Sessions:
   * Merges remote cloud sessions with local sessions, respecting deleted tombstones.
   */
  public reconcileChatSessions(userId: string | null, remoteSessions: any[]): any[] {
    const deletedChatIds = getAllDeletedChatSessionIds(userId);
    const localSessions = loadScopedChatSessions(userId).filter((s: any) => s && s.id && !deletedChatIds.has(s.id));
    const pendingIds = new Set(
      this.writeQueue
        .filter((t) => t.collection === 'users' && t.customKey?.startsWith('chat_'))
        .map((t) => t.id)
    );

    const sessionMap = new Map<string, any>();

    // 1. Seed with local sessions (preserve un-synced/local conversations)
    localSessions.forEach((s) => {
      if (s && s.id && !deletedChatIds.has(s.id)) {
        sessionMap.set(s.id, s);
      }
    });

    const remoteList = (Array.isArray(remoteSessions)
      ? remoteSessions
      : (remoteSessions && typeof remoteSessions === 'object' ? Object.values(remoteSessions) : []))
      .filter((rem: any) => rem && rem.id && !deletedChatIds.has(rem.id));

    const remoteIds = new Set(remoteList.map((r: any) => r && r.id).filter(Boolean));

    // 2. Preserve local sessions without resetting cloudSyncEnabled to false
    localSessions.forEach((s) => {
      if (s && s.id) {
        sessionMap.set(s.id, s);
      }
    });

    // 3. Merge remote sessions
    remoteList.forEach((rem: any) => {
      if (!rem || !rem.id) return;
      const safeKey = rem.id.replace(/[./#$\[\]]/g, '_');
      const existing = sessionMap.get(rem.id) || sessionMap.get(safeKey);
      const isPendingLocally = existing && (existing._syncStatus === 'pending' || pendingIds.has(safeKey) || pendingIds.has(rem.id));
      
      const localTime = typeof existing?.updatedAt === 'number' ? existing.updatedAt : new Date(existing?.updatedAt || 0).getTime();
      const remoteTime = typeof rem.updatedAt === 'number' ? rem.updatedAt : new Date(rem.updatedAt || 0).getTime();

      // Respect the most recent cloudSyncEnabled toggle state between local and remote
      let finalSyncEnabled: boolean;
      if (rem.cloudSyncEnabled !== undefined && existing?.cloudSyncEnabled !== undefined) {
        finalSyncEnabled = remoteTime >= localTime
          ? Boolean(rem.cloudSyncEnabled)
          : Boolean(existing.cloudSyncEnabled);
      } else if (rem.cloudSyncEnabled !== undefined) {
        finalSyncEnabled = Boolean(rem.cloudSyncEnabled);
      } else if (existing?.cloudSyncEnabled !== undefined) {
        finalSyncEnabled = Boolean(existing.cloudSyncEnabled);
      } else {
        finalSyncEnabled = false;
      }

      // Union/Merge all messages from both local and remote without dropping any messages
      const localMsgs = Array.isArray(existing?.messages) ? existing.messages : [];
      const remoteMsgs = Array.isArray(rem.messages) ? rem.messages : [];
      const msgMap = new Map<string, any>();

      // Seed with local messages
      localMsgs.forEach((m: any) => {
        if (m && m.id) msgMap.set(m.id, m);
      });

      // Overlay remote messages (and keep un-truncated local attachments if remote was compacted)
      remoteMsgs.forEach((rm: any) => {
        if (rm && rm.id) {
          const lm = msgMap.get(rm.id);
          if (lm && lm.attachments && Array.isArray(lm.attachments) && lm.attachments.some((a: any) => typeof a.data === 'string' && !a.data.startsWith('[Data attached:'))) {
            msgMap.set(rm.id, { ...rm, attachments: lm.attachments });
          } else {
            msgMap.set(rm.id, rm);
          }
        }
      });

      const mergedMessages = Array.from(msgMap.values());
      const bestBase = remoteTime >= localTime ? rem : (existing || rem);

      const mergedSession = {
        ...bestBase,
        title: bestBase.title && bestBase.title !== 'New Conversation' ? bestBase.title : (existing?.title || rem.title || 'New Conversation'),
        cloudSyncEnabled: finalSyncEnabled,
        messages: mergedMessages,
        updatedAt: Math.max(localTime, remoteTime),
        _syncStatus: isPendingLocally ? 'pending' : 'synced'
      };

      sessionMap.set(rem.id, mergedSession);
    });

    // 4. If we have real remote sessions, clean up any default unmodified empty/welcome session
    if (remoteList.length > 0 && sessionMap.size > remoteList.length) {
      for (const [id, s] of sessionMap.entries()) {
        const isDefaultEmpty = (!s.messages || s.messages.length === 0) && (s.title === 'New Conversation' || !s.title);
        const isDefaultWelcome = Array.isArray(s.messages) && s.messages.length === 1 && (s.messages[0]?.id?.startsWith('msg_welcome') || s.messages[0]?.id === 'msg_welcome') && s.title === 'New Conversation';
        if (
          s._syncStatus !== 'pending' &&
          (isDefaultEmpty || isDefaultWelcome)
        ) {
          sessionMap.delete(id);
        }
      }
    }

    const merged = Array.from(sessionMap.values()).sort((a, b) => {
      const timeA = new Date(a.updatedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || 0).getTime();
      return timeB - timeA;
    });

    saveScopedChatSessions(userId, merged);
    merged.forEach((s) => {
      this.setInL1Cache('chatSessions', s.id, s);
    });

    return merged;
  }

  /**
   * Gatekeeper for Tests:
   * Adds or modifies tests through the local coordinator outbox.
   */
  public recordTest(test: MathTest, userId?: string | null, type: MutationType = 'set'): void {
    if (!test || !test.id) return;
    const activeUid = userId || auth.currentUser?.uid || null;

    if (type === 'delete') {
      this.syncedFingerprints.delete(`tests:${test.id}`);
      this.persistFingerprintsToStorage();
      markTestAsDeletedInScopedStorage(activeUid, test.id);
      this.removeFromLocalCache('tests', test.id);
      deleteTestFromIndexedDB(activeUid, test.id).catch(() => {});
      const localTests = loadScopedTests(activeUid).filter((t) => t.id !== test.id);
      saveScopedTests(activeUid, localTests);

      this.writeQueue.push({
        id: test.id,
        collection: 'tests',
        type: 'delete',
        userId: activeUid,
        timestamp: Date.now(),
        retryCount: 0,
      });
      this.persistWriteQueueToL2();
      this.notifySubscribers('tests', test.id, null);
    } else {
      unmarkTestAsDeletedInScopedStorage(activeUid, test.id);

      const checksum = computeEntityChecksum(test);
      const existingChecksum = this.syncedFingerprints.get(`tests:${test.id}`);

      // If test data is byte-identical to synced version and no outbox write is pending,
      // update memory/scoped cache and skip queueing redundant network write.
      if (existingChecksum === checksum && !this.isPending('tests', test.id)) {
        this.setInL1Cache('tests', test.id, test);
        return;
      }

      const pendingTest: MathTest = {
        ...test,
        _syncStatus: 'pending',
      };

      this.setInL1Cache('tests', test.id, pendingTest);
      putTestToIndexedDB(activeUid, pendingTest).catch(() => {});
      const localTests = loadScopedTests(activeUid);
      const updatedList = [pendingTest, ...localTests.filter((t) => t.id !== test.id)];
      saveScopedTests(activeUid, updatedList);

      this.writeQueue = this.writeQueue.filter((t) => !(t.collection === 'tests' && t.id === test.id));
      this.writeQueue.push({
        id: test.id,
        collection: 'tests',
        type,
        data: pendingTest,
        userId: activeUid,
        timestamp: Date.now(),
        retryCount: 0,
        syncStatus: 'pending',
      });
      this.persistWriteQueueToL2();
      this.notifySubscribers('tests', test.id, pendingTest);
    }

    if (isGlobalQuotaExceeded() || isOfflineLocalOnlyMode()) {
      return;
    }

    if (this.writeTimer) clearTimeout(this.writeTimer as any);
    this.writeTimer = setTimeout(() => {
      this.flushWriteQueue();
    }, this.WRITE_DEBOUNCE_MS);
  }

  /**
   * Gatekeeper for User Data:
   * Merges user profiles and test history summaries into outbox for atomic batching.
   */
  public recordUserData(userId: string, data: any): void {
    if (!userId) return;
    const cleanData = cleanUserDataForFirestore(data);
    this.mutateEntity('users', 'set', userId, cleanData);
  }

  /**
   * Smart Merging Single Party Rule Reconciliation for Tests.
   * Protocols:
   * 1. Single Party Deletion Dominance:
   *    If a test is identified in tombstones (deletedIds, local storage, or userProfile.deletedTestIds),
   *    the deletion is final. It is immediately purged from L1 cache, L2 local storage, and excluded from merged output.
   * 2. Authoritative Remote Absence Inference (Single Party Authority):
   *    When connected to Firestore and receiving an authoritative remote list for an authenticated user,
   *    any local test authored by this account with _syncStatus === 'synced' (previously confirmed in the cloud)
   *    that is absent from remoteTests and NOT currently pending in local writeQueue was authoritatively deleted
   *    by the user on another device.
   *    Under the Single Party Rule, it is purged locally, recorded in deletedIds, and excluded from the catalog.
   * 3. Local Pending Draft Protection:
   *    Tests with _syncStatus === 'pending' or queued in pendingIds represent local offline creation or edits.
   *    They are preserved as local drafts awaiting synchronization.
   * 4. Diagram Safeguard:
   *    Preserves local rich diagram assets if a remote copy is stale or stripped.
   */
  public reconcileTests(userId: string | null, remoteTests: MathTest[], deletedIds?: Set<string>): MathTest[] {
    const localTests = loadScopedTests(userId);
    const delIds = new Set<string>(deletedIds || getAllDeletedTestIds(userId));
    const pendingIds = new Set(
      this.writeQueue.filter((t) => t.collection === 'tests').map((t) => t.id)
    );

    const mergedMap = new Map<string, MathTest>();
    const remoteIdSet = new Set((remoteTests || []).map((r) => r.id).filter(Boolean));
    const isAuthUser = Boolean(userId && userId !== 'guest-user' && userId !== 'anonymous');
    const isRemoteAuthoritative = !isOfflineLocalOnlyMode() && !isGlobalQuotaExceeded() && Array.isArray(remoteTests);

    // 1. Seed with local tests adhering to Single Party Rule
    localTests.forEach((loc) => {
      if (!loc || !loc.id) return;

      // Rule 1: Tombstone absolute priority (with safeguard for newly created or restored drafts)
      if (delIds.has(loc.id)) {
        if (loc._syncStatus === 'pending' || pendingIds.has(loc.id)) {
          // Newly restored from backup or edited locally: revoke stale tombstone
          delIds.delete(loc.id);
          unmarkTestAsDeletedInScopedStorage(userId, loc.id);
          mergedMap.set(loc.id, loc);
          return;
        }
        this.removeFromLocalCache('tests', loc.id);
        return;
      }

      // Rule 2: Single Party Remote Deletion Inference
      // Only infer remote deletion if the test was EXPLICITLY synced in this session/device (recorded in syncedFingerprints),
      // is not an uncommitted local creation or restored backup, and is absent from remote:
      if (isAuthUser && isRemoteAuthoritative && (loc.authorId === userId || (!loc.id.startsWith('sample-') && !loc.id.startsWith('math-')))) {
        const isLocSynced = loc._syncStatus === 'synced';
        const isLocPending = loc._syncStatus === 'pending' || pendingIds.has(loc.id);
        const wasCommittedToCloud = this.syncedFingerprints.has(`tests:${loc.id}`);

        if (isLocSynced && !isLocPending && wasCommittedToCloud && !remoteIdSet.has(loc.id)) {
          // Authoritative remote absence: Deleted by the user on another device!
          delIds.add(loc.id);
          markTestAsDeletedInScopedStorage(userId, loc.id);
          this.removeFromLocalCache('tests', loc.id);
          return;
        }
      }

      mergedMap.set(loc.id, loc);
    });

    // 2. Merge remote tests
    (remoteTests || []).forEach((rem) => {
      if (!rem || !rem.id || delIds.has(rem.id)) return;
      const localExisting = mergedMap.get(rem.id);

      if (localExisting) {
        if (pendingIds.has(rem.id) || localExisting._syncStatus === 'pending') {
          return; // Local version with pending changes wins
        }
        const localTime = new Date((localExisting as any).localUpdatedAt || localExisting.updatedAt || localExisting.createdAt || 0).getTime();
        const remoteTime = new Date(rem.updatedAt || rem.createdAt || 0).getTime();
        if (localTime > remoteTime) {
          return; // Local newer version wins
        }
      }

      // Safeguard: Protect local diagrams against empty/stale remote documents
      if (localExisting) {
        const localDiags = countTestDiagrams(localExisting);
        const remoteDiags = countTestDiagrams(rem);
        if (localDiags.total > 0 && remoteDiags.total === 0) {
          // Local test has rich diagrams that the remote document is missing!
          // Retain local rich test and mark pending so it syncs up safely
          mergedMap.set(rem.id, {
            ...localExisting,
            _syncStatus: 'pending',
          });
          return;
        }
      }

      mergedMap.set(rem.id, {
        ...rem,
        _syncStatus: 'synced',
      });
    });

    let mergedList = Array.from(mergedMap.values());

    // Filter out any newly discovered deleted IDs
    mergedList = mergedList.filter((t) => t && t.id && !delIds.has(t.id));

    // For authenticated users with custom account tests, filter out default sample tests
    if (isAuthUser) {
      const hasCustomAccountTests = mergedList.some(
        (t) => t.authorId === userId || (!t.id.startsWith('sample-') && !t.id.startsWith('math-'))
      );
      if (hasCustomAccountTests) {
        const userOnlyList = mergedList.filter(
          (t) => t.authorId === userId || (!t.id.startsWith('sample-') && !t.id.startsWith('math-'))
        );
        if (userOnlyList.length > 0) {
          mergedList = userOnlyList;
        }
      }
    }

    saveScopedTests(userId, mergedList);

    mergedList.forEach((t) => {
      this.setInL1Cache('tests', t.id, t);
      if (t._syncStatus === 'synced') {
        this.syncedFingerprints.set(`tests:${t.id}`, computeEntityChecksum(t));
      }
    });

    this.markCollectionSynced('tests', userId);
    this.persistFingerprintsToStorage();

    return mergedList;
  }

  /**
   * Interceptor for Entity Write/Update/Delete Mutations.
  * Performs 0ms Optimistic Local Cache Update, then queues for debounced atomic batching.
   */
  public mutateEntity<T = any>(col: CollectionName, type: MutationType, id: string, data?: T): void {
    this.metrics.optimisticWrites++;

    // Step 1: Instant Optimistic Cache Update (0ms UI latency)
    if (type === 'delete') {
      this.removeFromLocalCache(col, id);
      this.notifySubscribers(col, id, null);
    } else if (data) {
      const payload = { id, ...data };
      this.setInL1Cache(col, id, payload);
      this.notifySubscribers(col, id, payload);
    }

    // Step 2: Push mutation into debounced write queue
    this.writeQueue.push({
      id,
      collection: col,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    });

    this.persistWriteQueueToL2();

    // Debounce flush
    if (this.writeTimer) {
      clearTimeout(this.writeTimer as any);
    }

    this.writeTimer = setTimeout(() => {
      this.flushWriteQueue();
    }, this.WRITE_DEBOUNCE_MS);
  }

  /**
   * Flushes queued writes into atomic Firestore `writeBatch` transactions (up to 500 ops).
   */
  public async flushWriteQueue(): Promise<void> {
    if (this.isFlushingWrites || this.writeQueue.length === 0) return;
    if (isGlobalQuotaExceeded() || isOfflineLocalOnlyMode()) return;

    // Critical Auth Guard: All Firestore writes require an active authenticated user.
    // When the user is unauthenticated or in guest mode, all mutations remain safely stored
    // in browser memory (L1), localStorage (L2), and IndexedDB (L2) without remote errors.
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      return;
    }

    this.isFlushingWrites = true;

    // Grab pending mutations up to 500 (Firestore WriteBatch limit)
    const rawBatch = this.writeQueue.splice(0, 500);
    this.persistWriteQueueToL2();

    // Coalesce multiple mutations on the exact same document into 1 final state
    const coalescedMap = new Map<string, MutationTask>();
    rawBatch.forEach((task) => {
      const key = `${task.collection}:${task.id}`;
      coalescedMap.set(key, task);
    });
    const pendingBatch = Array.from(coalescedMap.values());

    try {
      // Pre-check and auto-compress any test document approaching the 1 MB Firestore threshold
      for (const task of pendingBatch) {
        if (task.type !== 'delete' && task.collection === 'tests' && task.data) {
          try {
            if (estimateByteSize(task.data) > 750_000) {
              task.data = await optimizeTestForFirestore(task.data);
            }
          } catch (e) {
            console.warn('SmartLocalCoordinator: Auto-compression error on test payload:', e);
          }
        }
      }

      const currentUid = currentUser.uid;

      // Strict Remote Storage Boundary: Only commit 'tests', 'attempts', and 'users' to Firebase Firestore
      const firestoreTasks = pendingBatch.filter((task) => {
        if (!this.ALLOWED_FIRESTORE_COLLECTIONS.has(task.collection)) return false;

        // Skip unauthenticated or guest task IDs that cannot pass isOwner() rules
        if (task.userId === 'anonymous' || task.userId === 'guest-user') {
          return false;
        }
        if (task.collection === 'users' && task.id !== currentUid) {
          return false;
        }

        if (task.type === 'delete') return true;
        // Checksum deduplication: If data is identical to synced remote, skip writing to Firestore (Zero redundant writes!)
        let taskData = task.data;
        if (task.collection === 'users') {
          taskData = cleanUserDataForFirestore(taskData);
        } else if (task.collection === 'attempts') {
          taskData = cleanAttemptDataForFirestore(taskData);
        }
        const checksum = computeEntityChecksum(taskData);
        const lastSyncedChecksum = this.syncedFingerprints.get(`${task.collection}:${task.id}`);
        if (lastSyncedChecksum === checksum) {
          return false; // Skip redundant remote write!
        }
        return true;
      });

      if (firestoreTasks.length > 0) {
        const batch = writeBatch(db);
        const now = new Date().toISOString();

        firestoreTasks.forEach((task) => {
          const docRef = doc(db, task.collection, task.id);
          if (task.type === 'delete') {
            batch.delete(docRef);
            this.syncedFingerprints.delete(`${task.collection}:${task.id}`);
            if (task.collection === 'tests' && task.userId && task.userId !== 'anonymous' && task.userId !== 'guest-user') {
              const userDocRef = doc(db, 'users', task.userId);
              batch.set(userDocRef, {
                deletedTestIds: arrayUnion(task.id),
                [`createdTests.${task.id}`]: deleteField(),
                updatedAt: now,
              }, { merge: true });
            }
          } else {
            let taskData = task.data;
            if (task.collection === 'users') {
              taskData = cleanUserDataForFirestore(taskData);
            } else if (task.collection === 'attempts') {
              taskData = cleanAttemptDataForFirestore(taskData);
            }
            const payload = sanitizeDataForFirestore({
              ...taskData,
              ...(task.collection !== 'users' ? { id: task.id } : {}),
              updatedAt: now,
            });
            batch.set(docRef, payload, { merge: true });
            this.syncedFingerprints.set(`${task.collection}:${task.id}`, computeEntityChecksum(taskData));
          }
        });

        // Step 3: Bump Domain Sync Beacon Revision in the exact same Firestore WriteBatch (1 unified atomic commit)
        const nowRev = Date.now();
        const touchedTests = firestoreTasks.some((t) => t.collection === 'tests');
        const touchedAttempts = firestoreTasks.some((t) => t.collection === 'attempts');
        const touchedProfileOrChat = firestoreTasks.some((t) => t.collection === 'users');

        const beaconUpdates: Partial<UserSyncBeacon> = {};
        if (touchedTests) beaconUpdates.testsRev = nowRev;
        if (touchedAttempts) beaconUpdates.attemptsRev = nowRev;
        if (touchedProfileOrChat) {
          beaconUpdates.profileRev = nowRev;
          beaconUpdates.chatsRev = nowRev;
        }

        if (Object.keys(beaconUpdates).length > 0 && currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
          updateUserSyncBeacon(currentUid, beaconUpdates, batch);
        }

        await batch.commit();

        if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
          if (touchedTests) this.setLocalSyncRevision(currentUid, 'testsRev', nowRev);
          if (touchedAttempts) this.setLocalSyncRevision(currentUid, 'attemptsRev', nowRev);
          if (touchedProfileOrChat) {
            this.setLocalSyncRevision(currentUid, 'profileRev', nowRev);
            this.setLocalSyncRevision(currentUid, 'chatsRev', nowRev);
          }
        }

        this.metrics.batchedWritesExecuted++;
        this.updateMetricsRatio();
        this.persistFingerprintsToStorage();
      }

      // Mark items as synced in local storage and IndexedDB
      pendingBatch.forEach((task) => {
        if (task.collection === 'attempts' && task.type !== 'delete') {
          const attempts = loadScopedAttempts(task.userId);
          const found = attempts.find((a) => a.id === task.id);
          if (found && found._syncStatus === 'pending') {
            found._syncStatus = 'synced';
            saveScopedAttempts(task.userId, attempts);
            putAttemptToIndexedDB(task.userId, found).catch(() => {});
          }
        } else if (task.collection === 'tests' && task.type !== 'delete') {
          const tests = loadScopedTests(task.userId);
          const found = tests.find((t) => t.id === task.id);
          if (found && found._syncStatus === 'pending') {
            found._syncStatus = 'synced';
            saveScopedTests(task.userId, tests);
            putTestToIndexedDB(task.userId, found).catch(() => {});
          }
        } else if (task.collection === 'users' && task.customKey?.startsWith('chat_')) {
          const sessions = loadScopedChatSessions(task.userId);
          const safeKey = task.customKey.replace('chat_', '');
          const found = sessions.find((s: any) => s.id.replace(/[./#$\[\]]/g, '_') === safeKey);
          if (found && found._syncStatus === 'pending') {
            found._syncStatus = 'synced';
            saveScopedChatSessions(task.userId, sessions);
          }
        }
      });
    } catch (error: any) {
      console.warn('SmartLocalCoordinator: Write batch error, re-queueing for retry:', error);
      const errStr = String(error?.message || error || '');
      const isPermissionDenied =
        errStr.includes('permission-denied') ||
        errStr.includes('Missing or insufficient permissions') ||
        error?.code === 'permission-denied';

      if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota') || error?.code === 'resource-exhausted') {
        setGlobalQuotaExceeded(true);
        console.warn('SmartLocalCoordinator: Daily Firestore quota reached. Writes safely held in local outbox.');
      } else if (errStr.includes('cannot be written because its size') || errStr.includes('exceeds the maximum allowed size')) {
        console.warn('SmartLocalCoordinator: Document size exceeded limit. Deeply sanitizing bloated tasks in writeQueue to unblock.');
        for (const task of pendingBatch) {
          if (task.collection === 'users') {
            task.data = cleanUserDataForFirestore(task.data);
          } else if (task.collection === 'attempts') {
            task.data = cleanAttemptDataForFirestore(task.data);
          } else if (task.collection === 'tests' && task.data) {
            try {
              task.data = await optimizeTestForFirestore(task.data, 600_000);
            } catch (e) {
              console.warn('SmartLocalCoordinator: Emergency test compression error:', e);
            }
          }
        }
      } else if (isPermissionDenied) {
        console.warn('SmartLocalCoordinator: Firestore write permission denied. Dropping unwriteable tasks from remote sync queue to prevent loop.');
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'batch');
      }

      // Re-queue failed tasks safely. During quota exhaustion, tasks are NEVER dropped!
      if (isGlobalQuotaExceeded()) {
        // Daily quota limit exhausted: keep all un-synced tasks safely queued in local outbox (IndexedDB/L2)
        // Never drop user tasks during quota exhaustion!
        pendingBatch.forEach((task) => {
          this.writeQueue.unshift(task);
        });
        console.warn('SmartLocalCoordinator: Daily quota reached. All pending tasks safely held in local outbox.');
      } else if (!isPermissionDenied) {
        pendingBatch.forEach((task) => {
          if (task.retryCount < 5) {
            task.retryCount++;
            this.writeQueue.unshift(task);
          } else {
            console.warn(`SmartLocalCoordinator: Dropping unrecoverable task ${task.collection}:${task.id} after max retries.`);
          }
        });
      }
      this.persistWriteQueueToL2();
    } finally {
      this.isFlushingWrites = false;
      if (
        this.writeQueue.length > 0 &&
        !isGlobalQuotaExceeded() &&
        !isOfflineLocalOnlyMode() &&
        auth.currentUser &&
        !auth.currentUser.isAnonymous
      ) {
        setTimeout(() => this.flushWriteQueue(), 2000);
      }
    }
  }

  // ============================================================================
  // PUB/SUB REACTIVE UI SUBSCRIPTIONS
  // ============================================================================

  public subscribe<T = any>(col: CollectionName, id: string, callback: (data: T | null) => void): () => void {
    const key = `${col}:${id}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Deliver instant cached state if available
    const cached = this.getFromLocalCache<T>(col, id);
    if (cached) {
      callback(cached.data);
    }

    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  private notifySubscribers(col: CollectionName, id: string, data: any): void {
    const key = `${col}:${id}`;
    const subs = this.subscribers.get(key);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {}
      });
    }
  }

  // ============================================================================
  // TELEMETRY & OFFLINE INFRASTRUCTURE
  // ============================================================================

  public getTelemetryStats(): TelemetryMetrics {
    return { ...this.metrics };
  }

  private updateMetricsRatio(): void {
    if (this.metrics.totalRequests > 0) {
      const savedReads = this.metrics.cacheHits + this.metrics.coalescedRequests;
      this.metrics.quotaSavingsPercentage = Math.round(
        (savedReads / this.metrics.totalRequests) * 100
      );
    }
  }

  private initL2StorageHydration(): void {
    const processQueue = (rawTasks: any[]) => {
      if (!Array.isArray(rawTasks) || rawTasks.length === 0) return;
      const filtered = rawTasks.filter((task) => {
        if (!task || !task.collection || !task.id) return false;
        // Filter out legacy automated attempt pruning deletes from write queue
        if (task.collection === 'attempts' && task.type === 'delete' && !task.customKey?.includes('explicit_user_delete')) {
          return false;
        }
        // Filter out legacy testHistories duplicate writes to users collection
        if (task.collection === 'users' && task.customKey?.startsWith('history_')) {
          return false;
        }
        return true;
      });

      this.writeQueue = filtered.map((task) => {
        if (task.collection === 'users') {
          return { ...task, data: cleanUserDataForFirestore(task.data) };
        }
        if (task.collection === 'attempts') {
          return { ...task, data: cleanAttemptDataForFirestore(task.data) };
        }
        return task;
      });

      this.persistWriteQueueToL2();
      if (this.writeQueue.length > 0 && auth.currentUser && !auth.currentUser.isAnonymous) {
        setTimeout(() => this.flushWriteQueue(), 1000);
      }
    };

    // 1. First check high-capacity IndexedDB for persistent outbox tasks
    getGenericItem<MutationTask[]>(`${this.storagePrefix}write_queue`).then((idbQueue) => {
      if (Array.isArray(idbQueue) && idbQueue.length > 0) {
        processQueue(idbQueue);
      } else {
        // 2. Fallback to localStorage bootstrap cache
        try {
          const rawQueue = localStorage.getItem(`${this.storagePrefix}write_queue`);
          if (rawQueue) {
            processQueue(JSON.parse(rawQueue));
          }
        } catch (e) {
          this.writeQueue = [];
        }
      }
    }).catch(() => {
      try {
        const rawQueue = localStorage.getItem(`${this.storagePrefix}write_queue`);
        if (rawQueue) {
          processQueue(JSON.parse(rawQueue));
        }
      } catch (e) {
        this.writeQueue = [];
      }
    });
  }

  private persistWriteQueueToL2(): void {
    // 1. High-capacity IndexedDB storage (handles unlimited batch queue entries safely)
    putGenericItem(`${this.storagePrefix}write_queue`, this.writeQueue).catch(() => {});

    // 2. Best-effort mirror to localStorage (trimmed if needed)
    try {
      localStorage.setItem(`${this.storagePrefix}write_queue`, JSON.stringify(this.writeQueue.slice(0, 50)));
    } catch (e) {
      try {
        localStorage.removeItem(`${this.storagePrefix}write_queue`);
      } catch {}
    }
  }

  private setupOfflineOnlineListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('SmartLocalCoordinator: Online event detected. Flushing queued writes.');
        this.flushWriteQueue();
      });
    }
  }
}

// Global Singleton Export
export const smartCoordinator = new SmartLocalCoordinator();
