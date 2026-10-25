/**
 * ============================================================================
 * GEMINI CHAT CLOUD SYNC MANAGER
 * ============================================================================
 * 
 * Manages Cloud Synchronization for Gemini/Theta Chat sessions.
 * 
 * Architectural Highlights:
 * 1. Single-Document Archive Model:
 *    All cloud-enabled conversations for a user are compiled and stored in a single
 *    compacted Firestore document at `chat_archives/{userId}`.
 * 2. Zero Continuous Listener Overhead:
 *    Avoids onSnapshot listeners. Uses a single-pass hydration on entry and
 *    reliable debounced flushing on exit (visibilitychange, pagehide, beforeunload).
 * 3. Payload Compaction:
 *    Strips oversized inline base64 image data from the cloud payload while
 *    preserving complete markdown, LaTeX equations, timestamps, and conversation structure.
 * 4. Dirty State Detection:
 *    Computes deterministic session fingerprints to skip redundant cloud writes.
 */

import { 
  saveSingleChatSessionToFirestoreDirect,
  deleteSingleChatSessionFromFirestoreDirect,
  fetchUserChatSessionsFromFirestoreDirect,
  deleteLegacyChatArchiveDoc,
  updateUserSyncBeacon,
  getUserSyncBeacon
} from './firebase';
import { smartCoordinator } from './smartLocalCoordinator';
import { loadScopedChatSessions, saveScopedChatSessions, isOfflineLocalOnlyMode } from './storage';
import { ChatSession, ChatArchive } from '../types';

// In-memory stage state for exit event flush
let stagedUserId: string | null = null;
let stagedActiveSession: ChatSession | null = null;
let stagedSessions: ChatSession[] = [];
let isFlushingInProgress = false;

// In-memory cache of last known synced fingerprints: session.id -> fingerprint string
const syncedFingerprints = new Map<string, string>();

/**
 * Computes a deterministic fingerprint of a chat session to detect modifications.
 */
export function computeSessionFingerprint(session: any): string {
  if (!session || !session.id) return '';
  const msgCount = Array.isArray(session.messages) ? session.messages.length : 0;
  const lastMsg = msgCount > 0 ? session.messages[msgCount - 1] : null;
  const lastMsgId = lastMsg?.id || '';
  const lastMsgLen = typeof lastMsg?.content === 'string' ? lastMsg.content.length : 0;
  const title = session.title || '';
  const updated = session.updatedAt || session.createdAt || 0;
  const stagedCount = Array.isArray(session.stagedQuestions) ? session.stagedQuestions.length : 0;
  const docsCount = Array.isArray(session.sessionDocuments) ? session.sessionDocuments.length : 0;

  return `${session.id}::${updated}::${title}::${msgCount}::${lastMsgId}::${lastMsgLen}::${stagedCount}::${docsCount}`;
}

/**
 * Checks if a session is dirty compared to its last synced state.
 */
export function isSessionDirty(session: any, lastSyncedFingerprint?: string): boolean {
  if (!session || !session.id) return false;
  const currentFingerprint = computeSessionFingerprint(session);
  const baseline = lastSyncedFingerprint || syncedFingerprints.get(session.id);
  if (!baseline) return true;
  return currentFingerprint !== baseline;
}

/**
 * Updates the recorded synced fingerprint for a session.
 */
export function markSessionAsSyncedInFingerprintCache(session: any): void {
  if (session && session.id) {
    syncedFingerprints.set(session.id, computeSessionFingerprint(session));
  }
}

/**
 * Clears recorded synced fingerprint for a deleted session.
 */
export function removeSessionFromFingerprintCache(sessionId: string): void {
  if (sessionId) {
    syncedFingerprints.delete(sessionId);
  }
}

/**
 * Deeply compacts a chat session before serializing to Firestore:
 * - Strips bulky base64 data attachments and oversized binary previews (> 500 chars).
 * - Strips heavy generatedImages data URLs.
 * - Strips large raw file blobs from sessionDocuments.
 * - Preserves 100% of text content, markdown, LaTeX formulas, messages, timestamps,
 *   roles, code execution parts, executable code, staged questions, titles, and IDs.
 */
export function compactSessionForCloud(session: any): ChatSession {
  if (!session) return session;
  const compact: any = { ...session };

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

  // Cloud metadata
  compact._syncStatus = 'synced';
  return compact;
}



/**
 * Stages current active session, all sessions, and active user in memory so exit events can flush reliably.
 */
export function stageChatArchiveForExit(userId: string | null | undefined, sessions: any[], activeSession?: any): void {
  if (userId && userId !== 'guest-user' && userId !== 'anonymous') {
    stagedUserId = userId;
    if (activeSession && activeSession.id) {
      stagedActiveSession = activeSession;
    }
    if (Array.isArray(sessions)) {
      stagedSessions = sessions;
    }
  } else {
    stagedUserId = null;
    stagedActiveSession = null;
    stagedSessions = [];
  }
}

/**
 * Stages strictly the currently active session for reliable single-document exit flush.
 */
export function stageActiveChatSession(userId: string | null | undefined, session: any): void {
  if (userId && userId !== 'guest-user' && userId !== 'anonymous' && session && session.id) {
    stagedUserId = userId;
    stagedActiveSession = session;
  }
}

/**
 * Hydrates chat sessions on entry via per-session subcollection `users/{userId}/chatSessions`,
 * strictly gated by UserSyncBeacon `chatsRev` to consume 0 reads when up to date,
 * and reconciles them non-destructively with local IndexedDB/scoped storage.
 */
export async function hydrateAndReconcileChatArchiveOnEntry(
  userId: string | null | undefined,
  currentLocalSessions: any[]
): Promise<any[]> {
  const localList = Array.isArray(currentLocalSessions) && currentLocalSessions.length > 0
    ? currentLocalSessions
    : loadScopedChatSessions(userId || null);

  if (!userId || userId === 'guest-user' || userId === 'anonymous' || isOfflineLocalOnlyMode()) {
    return localList;
  }

  // Purge deprecated legacy chat_archives document from Firestore so collection is removed from console
  deleteLegacyChatArchiveDoc(userId).catch(() => {});

  // UserSyncBeacon Gatekeeper (0 Reads if local revision is already up to date!)
  try {
    const localRevs = smartCoordinator.getLocalSyncRevisions(userId);
    const localChatsRev = localRevs.chatsRev || 0;

    if (localChatsRev > 0 && localList.length > 0) {
      const beacon = await getUserSyncBeacon(userId);
      const remoteChatsRev = beacon?.chatsRev || 0;
      if (remoteChatsRev <= localChatsRev) {
        // 0 Firestore Reads! Local state is strictly authoritative and up to date
        stageChatArchiveForExit(userId, localList);
        return localList;
      }
    }
  } catch (beaconErr) {
    console.warn('GeminiChatSyncManager: Beacon revision check notice:', beaconErr);
  }

  try {
    const remoteSessions = await fetchUserChatSessionsFromFirestoreDirect(userId, 30);
    if (Array.isArray(remoteSessions) && remoteSessions.length > 0) {
      const reconciled = smartCoordinator.reconcileChatSessions(userId, remoteSessions);
      
      // Update synced fingerprint cache for reconciled cloud sessions
      reconciled.forEach((s) => {
        if (s && s.id) {
          markSessionAsSyncedInFingerprintCache(s);
        }
      });

      // Align local revision with sync beacon (0 reads on next load!)
      const nowRev = Date.now();
      smartCoordinator.setLocalSyncRevision(userId, 'chatsRev', nowRev);

      stageChatArchiveForExit(userId, reconciled);
      return reconciled;
    }
  } catch (err) {
    console.warn('GeminiChatSyncManager: Entry hydration notice:', err);
  }

  stageChatArchiveForExit(userId, localList);
  return localList;
}

/**
 * Flushes strictly ONE single active chat session document to Firestore on close / leave / exit.
 * Hits exactly 1 Firestore write if dirty, and 0 writes if clean.
 */
export async function flushActiveChatSessionOnExit(userId?: string | null, activeSession?: ChatSession | null): Promise<boolean> {
  const targetUid = userId || stagedUserId;
  const targetSession = activeSession || stagedActiveSession;

  if (!targetUid || targetUid === 'guest-user' || targetUid === 'anonymous' || isOfflineLocalOnlyMode()) {
    return false;
  }
  if (!targetSession || !targetSession.id) {
    return false;
  }

  if (isFlushingInProgress) return false;

  // Check if this specific active session is dirty compared to its last synced hash
  if (!isSessionDirty(targetSession)) {
    return false; // 0 writes! Clean session requires no network write.
  }

  isFlushingInProgress = true;
  try {
    const success = await saveSingleChatSessionToFirestoreDirect(targetUid, targetSession);
    if (success) {
      markSessionAsSyncedInFingerprintCache(targetSession);

      // Atomically bump UserSyncBeacon chatsRev and align local revision
      const nowRev = Date.now();
      updateUserSyncBeacon(targetUid, { chatsRev: nowRev }).catch(() => {});
      smartCoordinator.setLocalSyncRevision(targetUid, 'chatsRev', nowRev);

      // Update in scoped storage with synced status
      const existing = loadScopedChatSessions(targetUid);
      const updatedList = existing.map((s) => s.id === targetSession.id ? { ...s, _syncStatus: 'synced' } : s);
      saveScopedChatSessions(targetUid, updatedList);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('GeminiChatSyncManager: Active session flush notice:', err);
    return false;
  } finally {
    isFlushingInProgress = false;
  }
}

/**
 * Flushes any dirty chat sessions to Firestore on tab close / page hide / exit.
 * Writes ONLY dirty sessions as individual documents.
 */
export async function flushChatArchiveOnExit(userId?: string | null, sessionsToFlush?: any[]): Promise<void> {
  const targetUid = userId || stagedUserId;
  if (!targetUid || targetUid === 'guest-user' || targetUid === 'anonymous' || isOfflineLocalOnlyMode()) {
    return;
  }

  if (isFlushingInProgress) return;

  const candidateSessions = Array.isArray(sessionsToFlush) && sessionsToFlush.length > 0
    ? sessionsToFlush
    : (stagedSessions.length > 0 ? stagedSessions : loadScopedChatSessions(targetUid));

  // Find dirty sessions
  const dirtySessions = candidateSessions.filter((s) => s && s.id && isSessionDirty(s));

  if (dirtySessions.length === 0) {
    return; // 0 writes! Everything is cleanly up to date.
  }

  isFlushingInProgress = true;
  try {
    for (const session of dirtySessions) {
      const ok = await saveSingleChatSessionToFirestoreDirect(targetUid, session);
      if (ok) {
        markSessionAsSyncedInFingerprintCache(session);
      }
    }

    const nowRev = Date.now();
    updateUserSyncBeacon(targetUid, { chatsRev: nowRev }).catch(() => {});
    smartCoordinator.setLocalSyncRevision(targetUid, 'chatsRev', nowRev);

    const updatedWithSync = candidateSessions.map((s) => {
      if (s && isSessionDirty(s)) {
        return { ...s, _syncStatus: 'synced' };
      }
      return s;
    });
    saveScopedChatSessions(targetUid, updatedWithSync);
  } catch (err) {
    console.warn('GeminiChatSyncManager: Exit flush warning:', err);
  } finally {
    isFlushingInProgress = false;
  }
}

/**
 * Manually or immediately triggers an instant Firestore cloud sync for active chat session.
 */
export async function syncChatArchiveNow(userId?: string | null, sessionToSync?: any): Promise<void> {
  const targetUid = userId || stagedUserId;
  if (!targetUid || targetUid === 'guest-user' || targetUid === 'anonymous' || isOfflineLocalOnlyMode()) {
    return;
  }
  const session = sessionToSync || stagedActiveSession;
  if (session && session.id) {
    await flushActiveChatSessionOnExit(targetUid, session);
  }
}
