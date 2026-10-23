export interface NoteVersion {
  id: string;
  versionNumber: number; // 1 or 2
  timestamp: number;
  dateTimeStr: string;
  timeAgo: string;
  title: string;
  code: string;
  charCount: number;
  lineCount: number;
  modificationSummary: string;
}

const STORAGE_KEY_PREFIX = 'html_note_versions_';

/**
 * Format timestamp into human readable date & time string
 */
export function formatVersionDateTime(ts: number): { dateTimeStr: string; timeAgo: string } {
  const date = new Date(ts);
  const dateTimeStr = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);

  let timeAgo = 'Just now';
  if (diffSec < 60) {
    timeAgo = `${diffSec}s ago`;
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    timeAgo = `${mins} min${mins > 1 ? 's' : ''} ago`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    timeAgo = `${hours} hr${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffSec / 86400);
    timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
  }

  return { dateTimeStr, timeAgo };
}

/**
 * Get stored versions for a file (loaded on demand)
 */
export function getFileVersionHistory(projectId: string, fileId: string): NoteVersion[] {
  if (!projectId || !fileId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}_${fileId}`);
    if (!raw) return [];
    const parsed: NoteVersion[] = JSON.parse(raw);
    
    // Re-calculate timeAgo dynamically on load
    return parsed.map((ver) => {
      const { timeAgo, dateTimeStr } = formatVersionDateTime(ver.timestamp);
      return {
        ...ver,
        timeAgo,
        dateTimeStr: ver.dateTimeStr || dateTimeStr
      };
    }).sort((a, b) => b.timestamp - a.timestamp); // newest first
  } catch (err) {
    console.warn('Failed to parse file version history:', err);
    return [];
  }
}

/**
 * Save a new version snapshot (maintaining strictly last 2 versions)
 */
export function saveFileVersionSnapshot(
  projectId: string,
  fileId: string,
  title: string,
  code: string
): NoteVersion[] {
  if (!projectId || !fileId || !code || typeof window === 'undefined') return [];

  const existing = getFileVersionHistory(projectId, fileId);

  const safeCode = code || '';
  // Avoid creating duplicate version if code hasn't changed from latest saved version
  if (existing.length > 0 && (existing[0].code || '').trim() === safeCode.trim()) {
    return existing;
  }

  const now = Date.now();
  const { dateTimeStr, timeAgo } = formatVersionDateTime(now);
  const charCount = safeCode.length;
  const lineCount = safeCode.split('\n').length;
  const modificationSummary = `${charCount.toLocaleString()} chars • ${lineCount} lines`;

  const newVersion: NoteVersion = {
    id: `ver_${now}_${Math.random().toString(36).substring(2, 6)}`,
    versionNumber: existing.length >= 1 ? existing.length + 1 : 1,
    timestamp: now,
    dateTimeStr,
    timeAgo,
    title: title || 'Untitled Note',
    code,
    charCount,
    lineCount,
    modificationSummary
  };

  // Combine and preserve strictly the last 2 versions
  let updatedList: NoteVersion[] = [newVersion, ...existing];
  if (updatedList.length > 2) {
    updatedList = updatedList.slice(0, 2);
  }

  // Re-index versionNumbers (1 for older, 2 for newer)
  updatedList = updatedList.map((ver, idx) => ({
    ...ver,
    versionNumber: updatedList.length - idx
  }));

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}_${fileId}`, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('Failed to save version history snapshot:', err);
  }

  return updatedList;
}

/**
 * Clear version history for a deleted file
 */
export function clearFileVersionHistory(projectId: string, fileId: string): void {
  if (!projectId || !fileId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}_${fileId}`);
  } catch (err) {}
}
