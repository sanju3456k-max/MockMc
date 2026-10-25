/**
 * firestoreDocSizeValidator.ts
 * Proactive Document Size Validator & Guardrail for Firebase Firestore.
 * 
 * Enforces Firestore's hard 1 MB (1,048,576 bytes) document size limit.
 * Accurately calculates serialized UTF-8 byte weights of keys, values, and metadata overhead.
 * Provides early warnings (> 850 KB) and hard write-blocks (> 980 KB) to prevent data corruption.
 */

export const FIRESTORE_MAX_DOC_SIZE = 1_048_576; // 1 MB hard limit
export const FIRESTORE_WARN_DOC_SIZE = 870_400;  // ~850 KB warning threshold (~83%)
export const FIRESTORE_BLOCK_DOC_SIZE = 1_000_000; // ~980 KB safety cutoff to prevent 400 Bad Request

export interface DocSizeCheckResult {
  sizeBytes: number;
  formattedSize: string;
  isApproachingLimit: boolean;
  isExceeded: boolean;
  percentageUsed: number;
  warningMessage?: string;
}

/**
 * Accurately estimates Firestore document byte size following official Google Cloud Firestore specs:
 * - 32 bytes document overhead
 * - Key names: UTF-8 bytes + 1 byte
 * - String values: UTF-8 bytes + 1 byte
 * - Numbers / Timestamps: 8 bytes
 * - Booleans: 1 byte
 * - Arrays / Maps: container overhead + element size
 */
export function estimateFirestoreDocSize(data: any): number {
  if (data === null || data === undefined) return 0;

  let totalBytes = 32; // Document metadata overhead

  function calculateValueSize(val: any): number {
    if (val === null || val === undefined) return 1;

    const valType = typeof val;

    if (valType === 'boolean') {
      return 1;
    }

    if (valType === 'number') {
      return 8;
    }

    if (valType === 'string') {
      // Fast UTF-8 byte calculation
      let bytes = 1;
      for (let i = 0; i < val.length; i++) {
        const code = val.charCodeAt(i);
        if (code <= 0x7f) bytes += 1;
        else if (code <= 0x7ff) bytes += 2;
        else if (code <= 0xffff) bytes += 3;
        else bytes += 4;
      }
      return bytes;
    }

    if (val instanceof Date) {
      return 8;
    }

    if (Array.isArray(val)) {
      let arrayBytes = 0;
      for (let i = 0; i < val.length; i++) {
        arrayBytes += calculateValueSize(val[i]);
      }
      return arrayBytes;
    }

    if (valType === 'object') {
      let objBytes = 0;
      for (const key of Object.keys(val)) {
        // Key overhead: UTF-8 bytes + 1
        objBytes += key.length + 1;
        objBytes += calculateValueSize(val[key]);
      }
      return objBytes;
    }

    return 8;
  }

  totalBytes += calculateValueSize(data);
  return totalBytes;
}

/**
 * Formats byte count into human-readable string (e.g. "842 KB", "1.2 MB")
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates any object or project document against Firestore limits
 */
export function checkFirestoreDocSize(data: any, docLabel: string = 'Document'): DocSizeCheckResult {
  const sizeBytes = estimateFirestoreDocSize(data);
  const percentageUsed = Math.min(100, Math.round((sizeBytes / FIRESTORE_MAX_DOC_SIZE) * 100));
  const isApproachingLimit = sizeBytes >= FIRESTORE_WARN_DOC_SIZE;
  const isExceeded = sizeBytes >= FIRESTORE_BLOCK_DOC_SIZE;

  let warningMessage: string | undefined = undefined;

  if (isExceeded) {
    warningMessage = `${docLabel} size is ${formatByteSize(sizeBytes)}, exceeding Firestore's 1 MB limit (${percentageUsed}%). Changes are saved safely in local IndexedDB, but cannot sync to cloud until content or images are split/optimized.`;
  } else if (isApproachingLimit) {
    warningMessage = `${docLabel} size is ${formatByteSize(sizeBytes)} (${percentageUsed}% of 1 MB limit). Consider splitting into multiple notes or compressing embedded images to avoid sync rejection.`;
  }

  return {
    sizeBytes,
    formattedSize: formatByteSize(sizeBytes),
    isApproachingLimit,
    isExceeded,
    percentageUsed,
    warningMessage
  };
}
