/**
 * ============================================================================
 * REAL-TIME CLOUD SYNCHRONIZATION ENGINE FOR FIREBASE & UI ELEMENTS
 * ============================================================================
 * 
 * Granular, Event-Driven, Multi-Device Cloud Sync Architecture:
 * 1. Live Firestore Delta Listeners:
 *    - Uses snapshot.docChanges() to process only specific entities added, modified, or removed.
 *    - Never rebuilds or replaces entire catalogs when a single entity changes.
 * 2. Active Granular Entity Subscriptions:
 *    - Components can listen to category collections ('tests', 'attempts') or specific entities ('test:id').
 *    - When a change occurs, only listeners registered for that specific entity or list are notified.
 * 3. Atomic Cross-Tab Broadcast Channel:
 *    - Broadcasts discrete mutation payloads ({ entity, action, id, data }) across browser tabs.
 * 4. 0ms Local-First Optimistic Updates:
 *    - Immediately applies surgical changes in memory and scoped storage, then updates Firestore in the background.
 */

import { 
  subscribeUserProfile, 
  subscribeToTests, 
  subscribeToAttempts, 
  saveTestToFirestore, 
  updateTestQuestionsInFirestore,
  deleteTestFromFirestore, 
  saveAttemptToFirestore, 
  deleteAttemptFromFirestore,
  saveUserProfileToFirestore, 
  saveChatSessionToFirestore, 
  deleteChatSessionFromFirestore, 
  subscribeUserChatSessionsFromFirestore,
  saveBookmarkToFirestore, 
  deleteBookmarkFromFirestore, 
  saveUserSettingsToFirestore, 
  saveActiveSessionToFirestore,
  fetchTestsFromFirestore,
  fetchUserAttemptsFromFirestore,
  auth,
  isGlobalQuotaExceeded,
  type FirestoreDocChange
} from './firebase';
import { loadLocalProjects, queueFirestoreSync, fetchRemoteProjectsIfNewer } from './htmlNotesSync';
import { smartCoordinator } from './smartLocalCoordinator';
import { 
  normalizeQuestions, 
  type MathTest, 
  type TestAttempt, 
  type UserProfile, 
  type AppSettings, 
  type ActiveTestSession, 
  type StatsRollup, 
  type TestHistoryEntry 
} from '../types';
import { SAMPLE_MATH_TESTS } from '../data/sampleTests';
import { 
  loadScopedTests, 
  saveScopedTests, 
  loadScopedAttempts, 
  saveScopedAttempts, 
  saveScopedChatSessions,
  pruneAttemptsToFirstAndLast,
  getAllDeletedTestIds, 
  markTestAsDeletedInScopedStorage, 
  unmarkTestAsDeletedInScopedStorage,
  loadScopedActiveSession,
  saveScopedActiveSession,
  clearScopedActiveSession,
  isOfflineLocalOnlyMode,
  getCachedAuthUser
} from './storage';

export type CategoryKey = 'tests' | 'attempts' | 'study' | 'preferences';
export type EntitySubscriptionKey = `test:${string}` | `attempt:${string}` | `note:${string}`;
export type SubscriptionKey = CategoryKey | EntitySubscriptionKey | 'all';

export interface StudyNoteItem {
  id: string;
  testId: string;
  questionNumber?: number;
  content: string;
  tag?: string;
  createdAt: string;
  updatedAt?: string;
  fileName?: string;
  fileType?: string;
}

export interface EntityDeltaEvent<T = any> {
  entity: 'test' | 'attempt' | 'note' | 'bookmark' | 'chatSession' | 'settings' | 'activeSession';
  action: 'added' | 'modified' | 'removed';
  id: string;
  data?: T;
  timestamp: string;
}

type SyncSubscriber<T = any> = (data: T, delta?: EntityDeltaEvent<T>) => void;

class RealtimeSyncManager {
  private activeUserId: string | null = null;
  private unsubs: (() => void)[] = [];
  
  // In-memory indexed data states for O(1) surgical lookups & updates
  private testsMap: Map<string, MathTest> = new Map();
  private attemptsMap: Map<string, TestAttempt> = new Map();
  private userProfile: UserProfile | null = null;
  private notes: Record<string, StudyNoteItem> = {};
  private bookmarks: Record<string, any> = {};
  private chatSessions: Record<string, any> = {};
  private activeSession: ActiveTestSession | null = null;
  private settings: AppSettings = { temperature: 0.7, theme: 'system', soundEnabled: true };

  // Local pub/sub listeners
  private subscribers: Map<SubscriptionKey, Set<SyncSubscriber>> = new Map();

  // Cross-tab broadcast channel
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Populate base items from cached auth user if available, otherwise fallback to guest sample tests
    const cachedUser = typeof localStorage !== 'undefined' ? getCachedAuthUser() : null;
    if (cachedUser && cachedUser.uid) {
      this.activeUserId = cachedUser.uid;
      const initialTests = loadScopedTests(cachedUser.uid);
      initialTests.forEach((t) => this.testsMap.set(t.id, t));
      const initialAttempts = loadScopedAttempts(cachedUser.uid);
      initialAttempts.forEach((a) => this.attemptsMap.set(a.id, a));
    } else {
      SAMPLE_MATH_TESTS.forEach((t) => this.testsMap.set(t.id, t));
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('math_mock_granular_sync');
        this.broadcastChannel.onmessage = (event) => {
          this.handleCrossTabDelta(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('mockmc-backup-restored', (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        if (detail) {
          this.ingestImportedData({
            tests: detail.tests,
            attempts: detail.attempts,
            activeUserId: detail.userId,
          });
        }
      });
    }
  }

  public getActiveUserId(): string | null {
    return this.activeUserId;
  }

  public getTests(): MathTest[] {
    return Array.from(this.testsMap.values());
  }

  public getTestById(testId: string): MathTest | undefined {
    return this.testsMap.get(testId);
  }

  public getAttempts(): TestAttempt[] {
    const list = Array.from(this.attemptsMap.values());
    return list.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
  }

  public getAttemptById(attemptId: string): TestAttempt | undefined {
    return this.attemptsMap.get(attemptId);
  }

  public getUserProfile(): UserProfile | null {
    return this.userProfile;
  }

  public getNotes(): Record<string, StudyNoteItem> {
    return this.notes;
  }

  public getBookmarks(): Record<string, any> {
    return this.bookmarks;
  }

  public getChatSessions(): Record<string, any> {
    return this.chatSessions;
  }

  public getActiveSession(): ActiveTestSession | null {
    return this.activeSession;
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  /**
   * Starts Real-Time Cloud Synchronization for an authenticated user.
   */
  public startSyncHub(userId: string): void {
    if (!userId || userId === 'anonymous' || userId === 'guest-user') {
      this.stopSyncHub();
      return;
    }

    if (this.activeUserId === userId && this.unsubs.length > 0) {
      return; // Already actively listening
    }

    this.stopSyncHub();
    this.activeUserId = userId;

    // 1. Initial 0ms Local Hydration
    this.testsMap.clear();
    const localTests = loadScopedTests(userId);
    localTests.forEach((t) => this.testsMap.set(t.id, t));

    this.attemptsMap.clear();
    const localAttempts = loadScopedAttempts(userId);
    localAttempts.forEach((a) => this.attemptsMap.set(a.id, a));

    this.activeSession = loadScopedActiveSession(userId);

    // Immediately notify subscribers with the account's local cached data (0ms latency!)
    this.notify('tests', this.getTests());
    this.notify('attempts', this.getAttempts());

    // If running in 100% Offline Local Mode OR Quota is Exceeded, do NOT attach heavy remote Firestore listeners (0 reads!)
    if (!smartCoordinator.shouldAttachLiveListener()) {
      return;
    }

    // 2. Attach Live Firestore onSnapshot Listeners with Granular docChanges (Only in Cloud Sync Mode)
    
    // Live User Profile Listener
    const unsubProfile = subscribeUserProfile(userId, (profile) => {
      if (profile) {
        this.userProfile = profile;
        if (profile.settings) {
          this.settings = { ...this.settings, ...profile.settings };
        }
        // Notes are completely disconnected from Firestore and managed via local IDB + Google Drive
        if (profile.bookmarks) {
          this.bookmarks = profile.bookmarks;
        }
        
        if (profile.chatSessions && typeof profile.chatSessions === 'object' && Object.keys(profile.chatSessions).length > 0) {
          this.chatSessions = profile.chatSessions;
          const remoteList = Object.values(profile.chatSessions);
          const reconciledChatSessions = smartCoordinator.reconcileChatSessions(userId, remoteList);
          this.notify('study', { 
            notes: this.notes, 
            bookmarks: this.bookmarks, 
            chatSessions: this.chatSessions,
            chatSessionsList: reconciledChatSessions 
          });
        }

        if (profile.testHistories && typeof profile.testHistories === 'object') {
          const crossAttempts: TestAttempt[] = [];
          Object.values(profile.testHistories).forEach((entry: any) => {
            if (!entry) return;
            if (entry.firstAttempt && (entry.firstAttempt.id || entry.firstAttempt.attemptId)) {
              crossAttempts.push({
                ...entry.firstAttempt,
                id: entry.firstAttempt.id || entry.firstAttempt.attemptId,
              });
            }
            if (entry.lastAttempt && (entry.lastAttempt.id || entry.lastAttempt.attemptId)) {
              crossAttempts.push({
                ...entry.lastAttempt,
                id: entry.lastAttempt.id || entry.lastAttempt.attemptId,
              });
            }
          });
          if (crossAttempts.length > 0) {
            const reconciledAttempts = smartCoordinator.reconcileAttempts(userId, crossAttempts);
            this.attemptsMap.clear();
            reconciledAttempts.forEach((a) => this.attemptsMap.set(a.id, a));
            this.notify('attempts', reconciledAttempts);
          }
        }

        if (profile.activeSession !== undefined) {
          this.activeSession = profile.activeSession;
          if (profile.activeSession) {
            saveScopedActiveSession(userId, profile.activeSession);
          } else {
            clearScopedActiveSession(userId);
          }
        }

        // Ingest Single Party Cloud Deletions (Tombstones) with safeguard for active local drafts and restored backups
        if (profile.deletedTestIds && Array.isArray(profile.deletedTestIds) && profile.deletedTestIds.length > 0) {
          let hasNewDeletions = false;
          const currentLocal = loadScopedTests(userId);
          const activeOrPendingIds = new Set(
            currentLocal
              .filter((t) => t && (t._syncStatus === 'pending' || smartCoordinator.isPending('tests', t.id)))
              .map((t) => t.id)
          );

          profile.deletedTestIds.forEach((delId: string) => {
            if (delId && !smartCoordinator.isPending('tests', delId) && !activeOrPendingIds.has(delId)) {
              markTestAsDeletedInScopedStorage(userId, delId);
              smartCoordinator.removeFromLocalCache('tests', delId);
              if (this.testsMap.has(delId)) {
                this.testsMap.delete(delId);
                hasNewDeletions = true;
                this.notifySpecificEntity(`test:${delId}`, null, {
                  entity: 'test',
                  action: 'removed',
                  id: delId,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          });
          if (hasNewDeletions) {
            const scoped = loadScopedTests(userId).filter(
              (t) => !profile.deletedTestIds!.includes(t.id) || activeOrPendingIds.has(t.id)
            );
            saveScopedTests(userId, scoped);
            const remainingTests = this.getTests();
            this.notify('tests', remainingTests);
            this.notify('all', remainingTests);
          }
        }

        this.notify('preferences', this.userProfile);
        this.notify('study', { 
          notes: this.notes, 
          bookmarks: this.bookmarks, 
          chatSessions: this.chatSessions
        });
        this.notify('all', this.userProfile);
      }
    });
    this.unsubs.push(unsubProfile);

    // Live Tests Listener with granular deltas
    const unsubTests = subscribeToTests(userId, (cloudTests, deltas) => {
      const currentLocal = loadScopedTests(userId);
      const activeOrPendingIds = new Set(
        currentLocal
          .filter((t) => t && (t._syncStatus === 'pending' || smartCoordinator.isPending('tests', t.id)))
          .map((t) => t.id)
      );
      const deletedIds = getAllDeletedTestIds(userId);
      if (this.userProfile?.deletedTestIds && Array.isArray(this.userProfile.deletedTestIds)) {
        this.userProfile.deletedTestIds.forEach((id) => {
          if (id && !activeOrPendingIds.has(id)) deletedIds.add(id);
        });
      }
      
      if (deltas && deltas.length > 0) {
        // Apply surgical docChanges
        deltas.forEach((delta) => {
          if (delta.type === 'removed' || deletedIds.has(delta.id)) {
            if (!smartCoordinator.isPending('tests', delta.id)) {
              deletedIds.add(delta.id);
              markTestAsDeletedInScopedStorage(userId, delta.id);
              smartCoordinator.removeFromLocalCache('tests', delta.id);
              const scoped = loadScopedTests(userId).filter((t) => t.id !== delta.id);
              saveScopedTests(userId, scoped);
              this.testsMap.delete(delta.id);
              this.notifySpecificEntity(`test:${delta.id}`, null, {
                entity: 'test',
                action: 'removed',
                id: delta.id,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            if (!smartCoordinator.isPending('tests', delta.id)) {
              this.testsMap.set(delta.id, delta.data);
              this.notifySpecificEntity(`test:${delta.id}`, delta.data, {
                entity: 'test',
                action: delta.type,
                id: delta.id,
                data: delta.data,
                timestamp: new Date().toISOString(),
              });
            }
          }
        });
      }

      // Non-destructive reconciliation through SmartLocalCoordinator
      const reconciled = smartCoordinator.reconcileTests(userId, cloudTests, deletedIds);
      this.testsMap.clear();
      reconciled.forEach((t) => this.testsMap.set(t.id, t));
      this.notify('tests', reconciled);
      this.notify('all', reconciled);
    });
    this.unsubs.push(unsubTests);

    // Live Attempts Listener with granular deltas
    const unsubAttempts = subscribeToAttempts(userId, (cloudAttempts, deltas) => {
      if (deltas && deltas.length > 0) {
        deltas.forEach((delta) => {
          if (delta.type === 'removed') {
            if (!smartCoordinator.isPending('attempts', delta.id)) {
              this.attemptsMap.delete(delta.id);
              this.notifySpecificEntity(`attempt:${delta.id}`, null, {
                entity: 'attempt',
                action: 'removed',
                id: delta.id,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            if (!smartCoordinator.isPending('attempts', delta.id)) {
              this.attemptsMap.set(delta.id, delta.data);
              this.notifySpecificEntity(`attempt:${delta.id}`, delta.data, {
                entity: 'attempt',
                action: delta.type,
                id: delta.id,
                data: delta.data,
                timestamp: new Date().toISOString(),
              });
            }
          }
        });
      }

      // Non-destructive reconciliation through SmartLocalCoordinator (Prevents quota wipeout)
      const reconciled = smartCoordinator.reconcileAttempts(userId, cloudAttempts);
      this.attemptsMap.clear();
      reconciled.forEach((a) => this.attemptsMap.set(a.id, a));
      this.notify('attempts', reconciled);
      this.notify('all', reconciled);
    });
    this.unsubs.push(unsubAttempts);
  }

  /**
   * Stops active Firestore listeners and switches to guest mode.
   */
  public stopSyncHub(): void {
    this.unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.unsubs = [];
    this.activeUserId = null;
    
    this.testsMap.clear();
    const guestTests = loadScopedTests(null);
    guestTests.forEach((t) => this.testsMap.set(t.id, t));

    this.attemptsMap.clear();
    const guestAttempts = loadScopedAttempts(null);
    guestAttempts.forEach((a) => this.attemptsMap.set(a.id, a));

    this.userProfile = null;
    this.notes = {};
    this.bookmarks = {};
    this.chatSessions = {};
    this.activeSession = loadScopedActiveSession(null);
  }

  /**
   * Pub/Sub subscription helper for React UI components.
   * Supports both category keys ('tests') and specific entity keys ('test:test_123').
   */
  public subscribe<T = any>(categoryOrEntity: SubscriptionKey, callback: SyncSubscriber<T>): () => void {
    if (!this.subscribers.has(categoryOrEntity)) {
      this.subscribers.set(categoryOrEntity, new Set());
    }
    this.subscribers.get(categoryOrEntity)!.add(callback);

    // Deliver current state immediately
    if (categoryOrEntity === 'tests') {
      callback(this.getTests() as any);
    } else if (categoryOrEntity === 'attempts') {
      callback(this.getAttempts() as any);
    } else if (categoryOrEntity === 'preferences') {
      callback(this.userProfile as any);
    } else if (categoryOrEntity === 'study') {
      callback({ notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions } as any);
    } else if (categoryOrEntity === 'all') {
      callback(this.getTests() as any);
    } else if (categoryOrEntity.startsWith('test:')) {
      const testId = categoryOrEntity.slice(5);
      callback(this.testsMap.get(testId) as any);
    } else if (categoryOrEntity.startsWith('attempt:')) {
      const attemptId = categoryOrEntity.slice(8);
      callback(this.attemptsMap.get(attemptId) as any);
    } else if (categoryOrEntity.startsWith('note:')) {
      const noteId = categoryOrEntity.slice(5);
      callback(this.notes[noteId] as any);
    }

    return () => {
      this.subscribers.get(categoryOrEntity)?.delete(callback);
    };
  }

  private notify(category: SubscriptionKey, data: any, delta?: EntityDeltaEvent): void {
    const subs = this.subscribers.get(category);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(data, delta);
        } catch (e) {
          console.warn('Sync subscriber error:', e);
        }
      });
    }
  }

  private notifySpecificEntity(entityKey: EntitySubscriptionKey, data: any, delta: EntityDeltaEvent): void {
    const subs = this.subscribers.get(entityKey);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(data, delta);
        } catch (e) {
          console.warn('Entity sync subscriber error:', e);
        }
      });
    }
  }

  // ==========================================
  // Surgical Mutator Operations with Task-Specific Listeners
  // ==========================================

  public addOrUpdateTest(test: MathTest): void {
    if (!test || !test.id) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;

    // 1. Route exclusively through SmartLocalCoordinator
    smartCoordinator.recordTest(test, activeUid, 'set');

    const isNew = !this.testsMap.has(test.id);
    const action = isNew ? 'added' : 'modified';

    // 2. In-Memory Update
    this.testsMap.set(test.id, test);
    const allTests = this.getTests();

    const deltaEvent: EntityDeltaEvent<MathTest> = {
      entity: 'test',
      action,
      id: test.id,
      data: test,
      timestamp: new Date().toISOString(),
    };

    // 3. Notify specific entity listener and category listener
    this.notifySpecificEntity(`test:${test.id}`, test, deltaEvent);
    this.notify('tests', allTests, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  /**
   * Seamlessly ingests tests and attempts restored from a backup file.
   * Updates memory caches, registers pending items in the coordinator outbox,
   * notifies UI subscribers instantly, and triggers cross-tab synchronization.
   */
  public ingestImportedData(payload: {
    tests?: MathTest[];
    attempts?: TestAttempt[];
    activeUserId?: string | null;
  }): void {
    const targetUid = payload.activeUserId || this.activeUserId || auth.currentUser?.uid || null;

    if (Array.isArray(payload.tests) && payload.tests.length > 0) {
      payload.tests.forEach((t) => {
        if (!t || !t.id) return;
        const pendingTest: MathTest = {
          ...t,
          authorId: targetUid || 'guest-user',
          _syncStatus: 'pending',
        };
        this.testsMap.set(t.id, pendingTest);
        smartCoordinator.recordTest(pendingTest, targetUid, 'set');
      });

      const allTests = this.getTests();
      this.notify('tests', allTests);
      this.notify('all', allTests);
    }

    if (Array.isArray(payload.attempts) && payload.attempts.length > 0) {
      payload.attempts.forEach((a) => {
        if (!a || !a.id) return;
        const pendingAttempt: TestAttempt = {
          ...a,
          userId: targetUid || 'guest-user',
          _syncStatus: 'pending',
        };
        this.attemptsMap.set(a.id, pendingAttempt);
        smartCoordinator.recordAttempt(pendingAttempt, targetUid);
      });

      const allAttempts = this.getAttempts();
      this.notify('attempts', allAttempts);
      this.notify('all', allAttempts);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('math-mock-storage-hydrated', {
          detail: { userId: targetUid, source: 'importBackup' },
        })
      );
    }
  }

  public updateTestQuestions(testId: string, questions: any[]): void {
    if (!testId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    const existing = this.testsMap.get(testId);
    if (!existing) return;

    const normalized = normalizeQuestions(Array.isArray(questions) ? questions : []);
    const updatedTest: MathTest = {
      ...existing,
      questions: normalized,
      questionCount: normalized.length,
      updatedAt: new Date().toISOString()
    };

    // 1. Surgical In-Memory Update (O(1))
    this.testsMap.set(testId, updatedTest);
    const allTests = this.getTests();

    const deltaEvent: EntityDeltaEvent<MathTest> = {
      entity: 'test',
      action: 'modified',
      id: testId,
      data: updatedTest,
      timestamp: new Date().toISOString(),
    };

    // 2. Trigger targeted listeners
    this.notifySpecificEntity(`test:${testId}`, updatedTest, deltaEvent);
    this.notify('tests', allTests, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);

    // 3. Smart Local Coordinator Proxy Persistence
    smartCoordinator.recordTest(updatedTest, activeUid, 'update');
  }

  public deleteTest(testId: string): void {
    if (!testId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;

    // 1. Mark in scoped storage immediately
    markTestAsDeletedInScopedStorage(activeUid, testId);

    // 2. Route deletion through SmartLocalCoordinator
    smartCoordinator.recordTest({ id: testId } as MathTest, activeUid, 'delete');

    this.testsMap.delete(testId);
    const allTests = this.getTests().filter((t) => t.id !== testId);

    const deltaEvent: EntityDeltaEvent = {
      entity: 'test',
      action: 'removed',
      id: testId,
      timestamp: new Date().toISOString(),
    };

    // 3. Trigger targeted listeners
    this.notifySpecificEntity(`test:${testId}`, null, deltaEvent);
    this.notify('tests', allTests, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  public addAttempt(attempt: TestAttempt): void {
    if (!attempt || !attempt.id) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || attempt.userId || null;

    // 1. Route exclusively through SmartLocalCoordinator (Outbox + 0ms Local Persistence + Quota Protection)
    const recorded = smartCoordinator.recordAttempt(attempt, activeUid);

    // 2. Keep in-memory map aligned
    this.attemptsMap.set(recorded.id, recorded);
    const allAttempts = this.getAttempts();
    const { pruned } = pruneAttemptsToFirstAndLast(allAttempts);
    this.attemptsMap.clear();
    pruned.forEach((a) => this.attemptsMap.set(a.id, a));

    const deltaEvent: EntityDeltaEvent<TestAttempt> = {
      entity: 'attempt',
      action: 'added',
      id: recorded.id,
      data: recorded,
      timestamp: new Date().toISOString(),
    };

    // 3. Trigger targeted listeners
    this.notifySpecificEntity(`attempt:${recorded.id}`, recorded, deltaEvent);
    this.notify('attempts', pruned, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  public deleteAttempt(attemptId: string): void {
    if (!attemptId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;

    // 1. Route deletion through SmartLocalCoordinator
    smartCoordinator.deleteAttempt(attemptId, activeUid);

    this.attemptsMap.delete(attemptId);
    const allAttempts = this.getAttempts();

    const deltaEvent: EntityDeltaEvent = {
      entity: 'attempt',
      action: 'removed',
      id: attemptId,
      timestamp: new Date().toISOString(),
    };

    // 2. Trigger targeted listeners
    this.notifySpecificEntity(`attempt:${attemptId}`, null, deltaEvent);
    this.notify('attempts', allAttempts, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  public saveNote(note: any): void {
    if (!note || !note.id) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    this.notes[note.id] = note;

    const deltaEvent: EntityDeltaEvent = {
      entity: 'note',
      action: 'added',
      id: note.id,
      data: note,
      timestamp: new Date().toISOString(),
    };

    this.notifySpecificEntity(`note:${note.id}`, note, deltaEvent);
    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  public deleteNote(noteId: string): void {
    if (!noteId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    delete this.notes[noteId];

    const deltaEvent: EntityDeltaEvent = {
      entity: 'note',
      action: 'removed',
      id: noteId,
      timestamp: new Date().toISOString(),
    };

    this.notifySpecificEntity(`note:${noteId}`, null, deltaEvent);
    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);
  }

  public saveChatSession(session: any): void {
    if (!session || !session.id) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    this.chatSessions[session.id] = session;

    const deltaEvent: EntityDeltaEvent = {
      entity: 'chatSession',
      action: 'modified',
      id: session.id,
      data: session,
      timestamp: new Date().toISOString(),
    };

    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      saveChatSessionToFirestore(activeUid, session).catch((err) => {
        console.warn('Firestore chat session save error:', err);
      });
    }
  }

  public deleteChatSession(sessionId: string): void {
    if (!sessionId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    delete this.chatSessions[sessionId];

    const deltaEvent: EntityDeltaEvent = {
      entity: 'chatSession',
      action: 'removed',
      id: sessionId,
      timestamp: new Date().toISOString(),
    };

    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      deleteChatSessionFromFirestore(activeUid, sessionId).catch((err) => {
        console.warn('Firestore chat session delete error:', err);
      });
    }
  }

  public saveBookmark(bookmark: any): void {
    if (!bookmark || !bookmark.id) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    this.bookmarks[bookmark.id] = bookmark;

    const deltaEvent: EntityDeltaEvent = {
      entity: 'bookmark',
      action: 'added',
      id: bookmark.id,
      data: bookmark,
      timestamp: new Date().toISOString(),
    };

    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      saveBookmarkToFirestore(activeUid, bookmark).catch((err) => {
        console.warn('Firestore bookmark save error:', err);
      });
    }
  }

  public deleteBookmark(bookmarkId: string): void {
    if (!bookmarkId) return;
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    delete this.bookmarks[bookmarkId];

    const deltaEvent: EntityDeltaEvent = {
      entity: 'bookmark',
      action: 'removed',
      id: bookmarkId,
      timestamp: new Date().toISOString(),
    };

    this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, deltaEvent);
    this.broadcastCrossTabDelta(deltaEvent);

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      deleteBookmarkFromFirestore(activeUid, bookmarkId).catch((err) => {
        console.warn('Firestore bookmark delete error:', err);
      });
    }
  }

  public updateSettings(settings: Partial<AppSettings>): void {
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    this.settings = { ...this.settings, ...settings };
    this.notify('preferences', { settings: this.settings });

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      saveUserSettingsToFirestore(activeUid, this.settings).catch((err) => {
        console.warn('Firestore settings update error:', err);
      });
    }
  }

  public saveActiveSession(session: ActiveTestSession | null): void {
    const activeUid = this.activeUserId || auth.currentUser?.uid || null;
    this.activeSession = session;
    if (session) {
      saveScopedActiveSession(activeUid, session);
    } else {
      clearScopedActiveSession(activeUid);
    }
    this.notify('preferences', { activeSession: session });

    if (!isOfflineLocalOnlyMode() && activeUid && activeUid !== 'anonymous' && activeUid !== 'guest-user') {
      saveActiveSessionToFirestore(activeUid, session).catch((err) => {
        console.warn('Firestore active session save error:', err);
      });
    }
  }

  /**
   * Performs an on-demand manual batch backup of all local tests, attempts & HTML notes to Firestore.
   */
  public async backupAllLocalDataToCloud(userId: string): Promise<{
    testsBackedUp: number;
    attemptsBackedUp: number;
    htmlProjectsBackedUp: number;
    success: boolean;
    error?: string;
  }> {
    if (!userId || userId === 'anonymous' || userId === 'guest-user') {
      return { testsBackedUp: 0, attemptsBackedUp: 0, htmlProjectsBackedUp: 0, success: false, error: 'Sign in required to backup to Cloud' };
    }

    if (isGlobalQuotaExceeded()) {
      return {
        testsBackedUp: 0,
        attemptsBackedUp: 0,
        htmlProjectsBackedUp: 0,
        success: false,
        error: 'Firestore daily write quota reached. Data is securely preserved on device and will sync automatically when quota resets.',
      };
    }

    try {
      const localTests = loadScopedTests(userId);
      const localAttempts = loadScopedAttempts(userId);

      // Route through SmartLocalCoordinator outbox
      localTests.forEach((t) => {
        if (t && t.id) smartCoordinator.recordTest(t, userId, 'set');
      });

      localAttempts.forEach((a) => {
        if (a && a.id) smartCoordinator.recordAttempt(a, userId);
      });

      await smartCoordinator.flushWriteQueue();

      // Backup HTML Notes projects to Google Cloud Firestore
      let htmlProjectsBackedUp = 0;
      try {
        const localProjects = loadLocalProjects(undefined, userId);
        if (localProjects && localProjects.length > 0) {
          queueFirestoreSync(localProjects, true);
          htmlProjectsBackedUp = localProjects.length;
        }
      } catch (htmlErr) {
        console.warn('Error during HTML notes cloud backup:', htmlErr);
      }

      return { 
        testsBackedUp: localTests.length, 
        attemptsBackedUp: localAttempts.length, 
        htmlProjectsBackedUp,
        success: true 
      };
    } catch (err: any) {
      return {
        testsBackedUp: 0,
        attemptsBackedUp: 0,
        htmlProjectsBackedUp: 0,
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Performs an on-demand download of tests, attempts & HTML notes from Firestore and merges into local storage.
   */
  public async downloadAllDataFromCloud(userId: string): Promise<{
    testsFetched: number;
    attemptsFetched: number;
    htmlProjectsFetched: number;
    success: boolean;
    error?: string;
  }> {
    if (!userId || userId === 'anonymous' || userId === 'guest-user') {
      return { testsFetched: 0, attemptsFetched: 0, htmlProjectsFetched: 0, success: false, error: 'Sign in required' };
    }

    try {
      const cloudTests = await fetchTestsFromFirestore(100, true);
      const cloudAttempts = await fetchUserAttemptsFromFirestore(userId, 100, true);

      const deletedIds = getAllDeletedTestIds(userId);
      const reconciledTests = smartCoordinator.reconcileTests(userId, cloudTests, deletedIds);
      this.testsMap.clear();
      reconciledTests.forEach((t) => this.testsMap.set(t.id, t));
      this.notify('tests', reconciledTests);

      const reconciledAttempts = smartCoordinator.reconcileAttempts(userId, cloudAttempts);
      this.attemptsMap.clear();
      reconciledAttempts.forEach((a) => this.attemptsMap.set(a.id, a));
      this.notify('attempts', reconciledAttempts);

      // Also restore HTML projects from Firestore
      let htmlProjectsFetched = 0;
      try {
        const localProjects = loadLocalProjects(undefined, userId);
        const remoteProjects = await fetchRemoteProjectsIfNewer({ uid: userId } as any, localProjects);
        if (remoteProjects && remoteProjects.length > 0) {
          htmlProjectsFetched = remoteProjects.length;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('html-notes-updated', { detail: { count: remoteProjects.length } }));
          }
        }
      } catch (htmlErr) {
        console.warn('Error fetching remote HTML projects:', htmlErr);
      }

      return {
        testsFetched: cloudTests.length,
        attemptsFetched: cloudAttempts.length,
        htmlProjectsFetched,
        success: true,
      };
    } catch (err: any) {
      return {
        testsFetched: 0,
        attemptsFetched: 0,
        htmlProjectsFetched: 0,
        success: false,
        error: err.message || String(err),
      };
    }
  }

  // Cross-Tab Granular Broadcast Dispatcher
  private broadcastCrossTabDelta(event: EntityDeltaEvent): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(event);
      } catch (e) {}
    }
  }

  private handleCrossTabDelta(event: EntityDeltaEvent): void {
    if (!event || !event.entity) return;

    if (event.entity === 'test') {
      if (event.action === 'removed') {
        const activeUid = this.activeUserId || auth.currentUser?.uid || null;
        markTestAsDeletedInScopedStorage(activeUid, event.id);
        smartCoordinator.removeFromLocalCache('tests', event.id);
        const scoped = loadScopedTests(activeUid).filter((t) => t.id !== event.id);
        saveScopedTests(activeUid, scoped);
        this.testsMap.delete(event.id);
      } else if (event.data) {
        this.testsMap.set(event.id, event.data);
      }
      this.notifySpecificEntity(`test:${event.id}`, event.data || null, event);
      this.notify('tests', this.getTests(), event);
    } else if (event.entity === 'attempt') {
      if (event.action === 'removed') {
        this.attemptsMap.delete(event.id);
      } else if (event.data) {
        this.attemptsMap.set(event.id, event.data);
      }
      this.notifySpecificEntity(`attempt:${event.id}`, event.data || null, event);
      this.notify('attempts', this.getAttempts(), event);
    } else if (event.entity === 'note') {
      if (event.action === 'removed') {
        delete this.notes[event.id];
      } else if (event.data) {
        this.notes[event.id] = event.data;
      }
      this.notifySpecificEntity(`note:${event.id}`, event.data || null, event);
      this.notify('study', { notes: this.notes, bookmarks: this.bookmarks, chatSessions: this.chatSessions }, event);
    }
  }
}

export const syncHub = new RealtimeSyncManager();
