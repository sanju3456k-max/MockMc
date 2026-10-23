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

import { saveChatArchiveToFirestoreDirect, fetchChatArchiveFromFirestore } from './firebase';
import { smartCoordinator } from './smartLocalCoordinator';
import { loadScopedChatSessions, saveScopedChatSessions, isOfflineLocalOnlyMode } from './storage';
import { ChatSession, ChatArchive } from '../types';

// In-memory stage state for exit event flush
let stagedUserId: string | null = null;
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
  const syncEnabled = Boolean(session.cloudSyncEnabled);
  const title = session.title || '';
  const updated = session.updatedAt || session.createdAt || 0;
  const stagedCount = Array.isArray(session.stagedQuestions) ? session.stagedQuestions.length : 0;
  const docsCount = Array.isArray(session.sessionDocuments) ? session.sessionDocuments.length : 0;

  return `${session.id}::${updated}::${syncEnabled}::${title}::${msgCount}::${lastMsgId}::${lastMsgLen}::${stagedCount}::${docsCount}`;
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
 * Compiles sessions into a minimal single-document JSON payload for `chat_archives/{userId}`,
 * preserving explicit cloudSyncEnabled: false flags with lightweight metadata so other devices synchronize toggle states accurately.
 */
export function compileChatArchive(sessions: any[], userId: string): ChatArchive {
  const compactSessions = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && s.id)
    .map((s) => {
      if (s.cloudSyncEnabled === true) {
        return compactSessionForCloud({ ...s, cloudSyncEnabled: true });
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

  return {
    userId,
    sessions: compactSessions,
    totalSessions: compactSessions.length,
    updatedAt: new Date().toISOString(),
    clientVersion: 'v3.0.0',
  };
}

/**
 * Stages current sessions and active user in memory so exit events can flush reliably.
 */
export function stageChatArchiveForExit(userId: string | null | undefined, sessions: any[]): void {
  if (userId && userId !== 'guest-user' && userId !== 'anonymous') {
    stagedUserId = userId;
    if (Array.isArray(sessions)) {
      stagedSessions = sessions;
    }
  } else {
    stagedUserId = null;
    stagedSessions = [];
  }
}

/**
 * Hydrates chat sessions on entry via a single Firestore read from `chat_archives/{userId}`
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

  try {
    const remoteSessions = await fetchChatArchiveFromFirestore(userId);
    if (Array.isArray(remoteSessions) && remoteSessions.length > 0) {
      const reconciled = smartCoordinator.reconcileChatSessions(userId, remoteSessions);
      
      // Update synced fingerprint cache for reconciled cloud sessions
      reconciled.forEach((s) => {
        if (s && s.cloudSyncEnabled) {
          markSessionAsSyncedInFingerprintCache(s);
        }
      });

      stageChatArchiveForExit(userId, reconciled);
      return reconciled;
    }
  } catch (err) {
    console.warn('GeminiChatSyncManager: Single-pass archive entry hydration notice:', err);
  }

  stageChatArchiveForExit(userId, localList);
  return localList;
}

/**
 * Flushes staged chat archive to Firestore on tab close / page hide / exit if any cloud sessions are dirty.
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

  const cloudEnabledSessions = candidateSessions.filter((s) => s && s.id && Boolean(s.cloudSyncEnabled));

  // Check if any cloud-enabled session is dirty or if archive state needs updating
  const hasDirtySession = cloudEnabledSessions.some((s) => isSessionDirty(s));

  if (!hasDirtySession && cloudEnabledSessions.length === syncedFingerprints.size) {
    return; // Everything is cleanly up to date; skip redundant cloud write!
  }

  isFlushingInProgress = true;
  try {
    await saveChatArchiveToFirestoreDirect(targetUid, candidateSessions);

    // Update synced fingerprints
    cloudEnabledSessions.forEach((s) => {
      markSessionAsSyncedInFingerprintCache(s);
    });

    // Mark sessions as synced in storage
    const updatedWithSync = candidateSessions.map((s) => {
      if (s && s.cloudSyncEnabled) {
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
 * Manually or immediately triggers an instant Firestore cloud sync for chat archives.
 */
export async function syncChatArchiveNow(userId?: string | null, sessionsToSync?: any[]): Promise<void> {
  const targetUid = userId || stagedUserId;
  if (!targetUid || targetUid === 'guest-user' || targetUid === 'anonymous' || isOfflineLocalOnlyMode()) {
    return;
  }
  const candidateSessions = Array.isArray(sessionsToSync) && sessionsToSync.length > 0
    ? sessionsToSync
    : (stagedSessions.length > 0 ? stagedSessions : loadScopedChatSessions(targetUid));

  const cloudEnabledSessions = candidateSessions.filter((s) => s && s.id && Boolean(s.cloudSyncEnabled));

  try {
    await saveChatArchiveToFirestoreDirect(targetUid, candidateSessions);
    cloudEnabledSessions.forEach((s) => {
      markSessionAsSyncedInFingerprintCache(s);
    });
    const updatedWithSync = candidateSessions.map((s) => {
      if (s && s.cloudSyncEnabled) {
        return { ...s, _syncStatus: 'synced' };
      }
      return s;
    });
    saveScopedChatSessions(targetUid, updatedWithSync);
  } catch (err) {
    console.warn('GeminiChatSyncManager: Immediate sync warning:', err);
  }
}
