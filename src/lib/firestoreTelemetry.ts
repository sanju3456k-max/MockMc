// ============================================================================
// Firestore & Firebase Comprehensive Request Telemetry & Console Logging Engine
// Captures and logs all read/write/rewards/stats events to the browser console
// with structured formatting, timing, caller origins, and payload inspectability.
// ============================================================================

export type TelemetryOpType = 
  | 'READ' 
  | 'WRITE' 
  | 'DELETE' 
  | 'STREAM_DELTA' 
  | 'STREAM_LISTEN' 
  | 'AUTH' 
  | 'DIAGNOSTIC' 
  | 'QUERY';

export interface TelemetryAuthContext {
  uid: string | null;
  email: string | null;
  displayName?: string | null;
  isAnonymous: boolean;
}

export interface FirestoreTelemetryEvent {
  id: string;
  timestamp: number;
  timeIso: string;
  durationMs: number;
  type: TelemetryOpType;
  collection: string;
  path: string;
  operation: 
    | 'getDoc' 
    | 'getDocs' 
    | 'onSnapshot' 
    | 'setDoc' 
    | 'updateDoc' 
    | 'deleteDoc' 
    | 'docChanges' 
    | 'query'
    | 'signInWithPopup'
    | 'signInWithRedirect'
    | 'signOut'
    | 'onAuthStateChanged'
    | 'getRedirectResult'
    | 'ping'
    | 'custom';
  docCount: number;
  dataSnippet?: any;
  dataSummary?: string;
  dataSizeBytes: number;
  caller: string;
  status: 'success' | 'quota_blocked' | 'error' | 'pending';
  statusCode: string;
  error?: string;
  authContext?: TelemetryAuthContext;
}

export interface FirestoreTelemetryStats {
  totalRequests: number;
  totalReads: number;
  totalWrites: number;
  totalDeletes: number;
  totalStreams: number;
  totalAuthOps: number;
  totalErrors: number;
  totalBytes: number;
  averageLatencyMs: number;
  sessionStartTime: number;
  collectionBreakdown: Record<string, { reads: number; writes: number; deletes: number; requests: number }>;
}

const MAX_EVENT_LOGS = 500;
const STORAGE_KEY = 'math_mock_firebase_request_records_v2';

class FirestoreTelemetryEngine {
  private events: FirestoreTelemetryEvent[] = [];
  private stats: FirestoreTelemetryStats = {
    totalRequests: 0,
    totalReads: 0,
    totalWrites: 0,
    totalDeletes: 0,
    totalStreams: 0,
    totalAuthOps: 0,
    totalErrors: 0,
    totalBytes: 0,
    averageLatencyMs: 0,
    sessionStartTime: Date.now(),
    collectionBreakdown: {},
  };
  private listeners = new Set<(stats: FirestoreTelemetryStats, latestEvent?: FirestoreTelemetryEvent) => void>();
  private currentAuthContext: TelemetryAuthContext = {
    uid: null,
    email: null,
    displayName: null,
    isAnonymous: true,
  };

  constructor() {
    this.loadFromSession();
    this.registerGlobalConsoleHelpers();
  }

  public setAuthContext(auth: TelemetryAuthContext): void {
    this.currentAuthContext = { ...auth };
  }

  public getAuthContext(): TelemetryAuthContext {
    return { ...this.currentAuthContext };
  }

  private loadFromSession(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.events)) {
          this.events = parsed.events.slice(0, MAX_EVENT_LOGS);
        }
        if (parsed.stats) {
          this.stats = { ...this.stats, ...parsed.stats };
        }
      }
    } catch {}
  }

  private saveToSession(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          events: this.events.slice(0, 150),
          stats: this.stats,
        })
      );
    } catch {}
  }

  private estimateSize(data: any): number {
    if (data === undefined || data === null) return 0;
    try {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return new Blob([str]).size;
    } catch {
      return 100;
    }
  }

  private summarizeData(data: any, type: TelemetryOpType, path: string): string {
    if (data === undefined || data === null) return 'Empty / No Payload';
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return `Array [${data.length} item(s)]`;
      }
      const keys = Object.keys(data);
      const title = data.title || data.testTitle || data.name || data.displayName || data.email || data.id || '';
      const extra = title ? `("${String(title).slice(0, 30)}")` : '';
      return `${keys.length} fields (${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '...' : ''}) ${extra}`.trim();
    }
    return String(data).slice(0, 80);
  }

  /**
   * Developer Console Logger - Only outputs on critical errors or quota limits
   */
  private logToConsole(event: FirestoreTelemetryEvent): void {
    if (typeof console === 'undefined') return;

    const isError = event.status === 'error' || event.status === 'quota_blocked';
    // Suppress routine write, read, delete, and stream logs from console to keep developer tools clean
    if (!isError) return;

    const badgeStyle = 'background:#b91c1c;color:#ffffff;font-weight:bold;padding:2px 6px;border-radius:4px;';
    const label = `[Firebase ERROR ${event.statusCode}]`;

    const title = `%c${label}%c ${event.caller} ➜ ${event.path} ${event.durationMs > 0 ? `(${event.durationMs}ms)` : ''}`;
    const titleStyle = 'color:#ef4444;font-weight:bold;margin-left:4px;';

    console.groupCollapsed(title, badgeStyle, titleStyle);
    console.log('📌 Caller / Origin:', event.caller);
    console.log('🌐 Target Path:', event.path);
    console.log('⚙️ Operation:', event.operation);
    console.log('⏱️ Execution Latency:', `${event.durationMs}ms`);
    console.log('🔑 Status Code:', event.statusCode);
    if (event.error) {
      console.error('❌ Error Message:', event.error);
    }
    console.groupEnd();
  }

  public record(params: {
    type: TelemetryOpType;
    collection: string;
    path: string;
    operation: FirestoreTelemetryEvent['operation'];
    durationMs?: number;
    docCount?: number;
    data?: any;
    caller: string;
    status?: 'success' | 'quota_blocked' | 'error' | 'pending';
    statusCode?: string;
    error?: string;
    authContext?: TelemetryAuthContext;
  }): FirestoreTelemetryEvent {
    const docCount = params.docCount !== undefined ? params.docCount : 1;
    const durationMs = params.durationMs !== undefined ? Math.max(0, Math.round(params.durationMs)) : 0;
    const dataSize = this.estimateSize(params.data);
    const dataSummary = this.summarizeData(params.data, params.type, params.path);

    let safeSnippet: any = null;
    if (params.data !== undefined) {
      try {
        safeSnippet = JSON.parse(JSON.stringify(params.data));
      } catch {
        safeSnippet = String(params.data);
      }
    }

    const now = Date.now();
    const status = params.status || (params.error ? 'error' : 'success');
    let statusCode = params.statusCode;
    if (!statusCode) {
      if (status === 'success') {
        statusCode = params.type === 'AUTH' ? 'AUTH_OK' : '200 OK';
      } else if (status === 'quota_blocked') {
        statusCode = '429 QUOTA_EXCEEDED';
      } else {
        statusCode = params.error?.toLowerCase().includes('permission') ? '403 PERMISSION_DENIED' : '500 ERROR';
      }
    }

    const event: FirestoreTelemetryEvent = {
      id: `req_${now}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: now,
      timeIso: new Date(now).toISOString(),
      durationMs,
      type: params.type,
      collection: params.collection || 'system',
      path: params.path,
      operation: params.operation,
      docCount,
      dataSnippet: safeSnippet,
      dataSummary,
      dataSizeBytes: dataSize,
      caller: params.caller || 'App Module',
      status,
      statusCode,
      error: params.error,
      authContext: params.authContext || this.getAuthContext(),
    };

    // Update internal aggregated stats
    this.stats.totalRequests += 1;
    if (event.status === 'error' || event.status === 'quota_blocked') {
      this.stats.totalErrors += 1;
    } else {
      if (params.type === 'READ' || params.type === 'QUERY') {
        this.stats.totalReads += docCount;
      } else if (params.type === 'WRITE') {
        this.stats.totalWrites += docCount;
      } else if (params.type === 'DELETE') {
        this.stats.totalDeletes += docCount;
      } else if (params.type === 'STREAM_DELTA' || params.type === 'STREAM_LISTEN') {
        this.stats.totalStreams += 1;
      } else if (params.type === 'AUTH') {
        this.stats.totalAuthOps += 1;
      }
    }

    this.stats.totalBytes += dataSize;

    // Latency running average
    if (durationMs > 0) {
      this.stats.averageLatencyMs = Math.round(
        (this.stats.averageLatencyMs * (this.stats.totalRequests - 1) + durationMs) / this.stats.totalRequests
      );
    }

    // Collection stats breakdown
    const colName = params.collection || 'other';
    if (!this.stats.collectionBreakdown[colName]) {
      this.stats.collectionBreakdown[colName] = { reads: 0, writes: 0, deletes: 0, requests: 0 };
    }
    this.stats.collectionBreakdown[colName].requests += 1;
    if (params.type === 'READ' || params.type === 'STREAM_DELTA') {
      this.stats.collectionBreakdown[colName].reads += docCount;
    } else if (params.type === 'WRITE') {
      this.stats.collectionBreakdown[colName].writes += docCount;
    } else if (params.type === 'DELETE') {
      this.stats.collectionBreakdown[colName].deletes += docCount;
    }

    // Prepend into event history
    this.events.unshift(event);
    if (this.events.length > MAX_EVENT_LOGS) {
      this.events.pop();
    }

    this.saveToSession();
    this.notify(event);

    // Immediate developer console output
    this.logToConsole(event);

    return event;
  }

  /**
   * Helper to execute an async Firebase call while measuring precise duration and capturing telemetry
   */
  public async trackAsync<T>(
    meta: {
      type: TelemetryOpType;
      collection: string;
      path: string;
      operation: FirestoreTelemetryEvent['operation'];
      caller: string;
      requestData?: any;
    },
    fn: () => Promise<T>,
    extractResponse?: (res: T) => { docCount?: number; data?: any }
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const durationMs = performance.now() - startTime;
      const respMeta = extractResponse ? extractResponse(result) : {};
      
      this.record({
        type: meta.type,
        collection: meta.collection,
        path: meta.path,
        operation: meta.operation,
        durationMs,
        docCount: respMeta.docCount !== undefined ? respMeta.docCount : (Array.isArray(result) ? result.length : 1),
        data: respMeta.data !== undefined ? respMeta.data : (meta.requestData !== undefined ? meta.requestData : result),
        caller: meta.caller,
        status: 'success',
      });

      return result;
    } catch (error: any) {
      const durationMs = performance.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);
      const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted');
      
      this.record({
        type: meta.type,
        collection: meta.collection,
        path: meta.path,
        operation: meta.operation,
        durationMs,
        data: meta.requestData,
        caller: meta.caller,
        status: isQuota ? 'quota_blocked' : 'error',
        error: errMsg,
      });

      throw error;
    }
  }

  private notify(latestEvent: FirestoreTelemetryEvent): void {
    const statsSnapshot = { ...this.stats, collectionBreakdown: { ...this.stats.collectionBreakdown } };
    this.listeners.forEach((listener) => {
      try {
        listener(statsSnapshot, latestEvent);
      } catch (err) {
        console.warn('Telemetry subscriber warning:', err);
      }
    });
  }

  public getEvents(): FirestoreTelemetryEvent[] {
    return [...this.events];
  }

  public getStats(): FirestoreTelemetryStats {
    return { ...this.stats, collectionBreakdown: { ...this.stats.collectionBreakdown } };
  }

  public subscribe(
    listener: (stats: FirestoreTelemetryStats, latestEvent?: FirestoreTelemetryEvent) => void
  ): () => void {
    this.listeners.add(listener);
    listener(this.getStats());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear(): void {
    this.events = [];
    this.stats = {
      totalRequests: 0,
      totalReads: 0,
      totalWrites: 0,
      totalDeletes: 0,
      totalStreams: 0,
      totalAuthOps: 0,
      totalErrors: 0,
      totalBytes: 0,
      averageLatencyMs: 0,
      sessionStartTime: Date.now(),
      collectionBreakdown: {},
    };
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    console.log('%c[Firebase Logs Cleared]%c Session event buffer was reset.', 'background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;', 'color:#9ca3af;');
  }

  public exportJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalRequests: this.events.length,
        stats: this.stats,
        requests: this.events,
      },
      null,
      2
    );
  }

  public exportCsv(): string {
    const headers = [
      'Request ID',
      'Timestamp (ms)',
      'Time (ISO)',
      'Duration (ms)',
      'Type',
      'Collection',
      'Path / Endpoint',
      'Operation',
      'Status Code',
      'Doc Count',
      'Payload Size (Bytes)',
      'Caller',
      'Auth UID',
      'Status',
      'Error',
      'Summary',
    ];
    const rows = this.events.map((e) => [
      e.id,
      e.timestamp,
      e.timeIso || new Date(e.timestamp).toISOString(),
      e.durationMs || 0,
      e.type,
      e.collection,
      `"${(e.path || '').replace(/"/g, '""')}"`,
      e.operation,
      `"${e.statusCode || '200 OK'}"`,
      e.docCount,
      e.dataSizeBytes,
      `"${(e.caller || '').replace(/"/g, '""')}"`,
      `"${(e.authContext?.uid || 'anonymous').replace(/"/g, '""')}"`,
      e.status,
      `"${(e.error || '').replace(/"/g, '""')}"`,
      `"${(e.dataSummary || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Attach handy developer inspection methods to window object
   */
  private registerGlobalConsoleHelpers(): void {
    if (typeof window === 'undefined') return;

    (window as any).firebaseTelemetry = this;
    
    (window as any).getFirebaseLogs = (filterType?: string) => {
      const all = this.getEvents();
      if (!filterType) return all;
      const q = filterType.toUpperCase();
      return all.filter((e) => e.type === q || e.collection.toUpperCase() === q);
    };

    (window as any).getFirebaseWrites = () => {
      return this.getEvents().filter((e) => e.type === 'WRITE');
    };

    (window as any).getFirebaseReads = () => {
      return this.getEvents().filter((e) => e.type === 'READ' || e.type === 'QUERY');
    };

    (window as any).getAppRewards = () => {
      return this.getEvents().filter((e) => 
        e.type === 'WRITE' && (
          e.caller.toLowerCase().includes('reward') ||
          e.caller.toLowerCase().includes('stat') ||
          e.caller.toLowerCase().includes('attempt') ||
          e.caller.toLowerCase().includes('score') ||
          e.path.includes('statsRollup') ||
          e.path.includes('testHistories') ||
          e.path.includes('users')
        )
      );
    };

    (window as any).printFirebaseSummary = () => {
      console.log('%c📊 Firebase Session Telemetry Summary', 'font-size:14px;font-weight:bold;color:#3b82f6;');
      console.table({
        'Total Requests': this.stats.totalRequests,
        'Reads & Queries': this.stats.totalReads,
        'Writes & Updates': this.stats.totalWrites,
        'Deletes': this.stats.totalDeletes,
        'Real-time Streams': this.stats.totalStreams,
        'Auth Operations': this.stats.totalAuthOps,
        'Errors': this.stats.totalErrors,
        'Avg Latency (ms)': `${this.stats.averageLatencyMs}ms`,
        'Total Transferred': `${(this.stats.totalBytes / 1024).toFixed(2)} KB`,
      });
      console.log('Tip: Run getAppRewards() to view all app rewards and stats writes.');
    };
  }
}

export const firestoreTelemetry = new FirestoreTelemetryEngine();
