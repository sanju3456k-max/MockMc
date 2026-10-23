/**
 * File Preview & Type Detection Utilities
 * Handles robust cross-device, cross-account file type classification and Google Drive URL resolution.
 */

export interface FileItemCandidate {
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'file' | string;
  fileUrl?: string;
  content?: string;
  mimeType?: string;
  driveFileId?: string;
}

const IMAGE_EXTENSIONS_REGEX = /\.(jpe?g|png|gif|webp|svg|bmp|ico|heic|heif|tiff?|hdr|raw)$/i;
const PDF_EXTENSIONS_REGEX = /\.pdf$/i;
const IMAGE_NAME_PATTERNS = /^(img|imo|dcim|photo|scan|pxl|hdr|cam|pic|screenshot|snapshot|visual)[\s_\-\d]/i;

/**
 * Extracts attached file name if embedded in note content string like "Attachment: IMG_20260923_224904407_HDR.jpg"
 */
export function extractAttachmentFileName(content?: string): string | null {
  if (!content) return null;
  const match = content.match(/Attachment:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Checks whether an item is an image based on multiple reliable heuristics
 */
export function isImageFile(item: FileItemCandidate | null | undefined): boolean {
  if (!item) return false;

  // 1. Explicit fileType or mimeType
  if (item.fileType === 'image') return true;
  if (item.mimeType && (item.mimeType.startsWith('image/') || item.mimeType === 'image')) return true;

  // 2. Data URL or direct image web URL
  if (item.fileUrl) {
    const url = item.fileUrl.trim();
    if (url.startsWith('data:image/')) return true;
    if (IMAGE_EXTENSIONS_REGEX.test(url)) return true;
  }

  // 3. File name extension or pattern
  if (item.fileName) {
    const name = item.fileName.trim();
    if (IMAGE_EXTENSIONS_REGEX.test(name)) return true;
    if (IMAGE_NAME_PATTERNS.test(name)) return true;
    const lower = name.toLowerCase();
    if (lower.includes('screenshot') || lower.includes('hdr') || lower.includes('photo') || lower.includes('drawing')) return true;
  }

  // 4. Inspect content for embedded attachment name, base64 image or markdown image
  if (item.content) {
    const embeddedName = extractAttachmentFileName(item.content);
    if (embeddedName && (IMAGE_EXTENSIONS_REGEX.test(embeddedName) || IMAGE_NAME_PATTERNS.test(embeddedName))) {
      return true;
    }
    if (item.content.includes('data:image/') || item.content.startsWith('\x89PNG') || item.content.startsWith('PNG\r\n')) {
      return true;
    }
    if (/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/.test(item.content)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an item is a PDF file based on multiple reliable heuristics
 */
export function isPdfFile(item: FileItemCandidate | null | undefined): boolean {
  if (!item) return false;

  // 1. Explicit fileType or mimeType
  if (item.fileType === 'pdf') return true;
  if (item.mimeType === 'application/pdf') return true;

  // 2. URL
  if (item.fileUrl) {
    const url = item.fileUrl.trim();
    if (url.startsWith('data:application/pdf') || PDF_EXTENSIONS_REGEX.test(url)) return true;
  }

  // 3. File name
  if (item.fileName && PDF_EXTENSIONS_REGEX.test(item.fileName.trim())) {
    return true;
  }

  // 4. Content embedded attachment name
  if (item.content) {
    const embeddedName = extractAttachmentFileName(item.content);
    if (embeddedName && PDF_EXTENSIONS_REGEX.test(embeddedName)) return true;
  }

  return false;
}

/**
 * Resolves the primary detected type ('image' | 'pdf' | 'file')
 */
export function resolveFileType(item: FileItemCandidate | null | undefined): 'image' | 'pdf' | 'file' {
  if (isPdfFile(item)) return 'pdf';
  if (isImageFile(item)) return 'image';
  return 'file';
}

/**
 * Returns prioritized array of direct Google Drive CDN and backend proxy stream URLs for an image
 */
export function getDriveImageCandidates(driveFileId: string, token?: string | null): string[] {
  if (!driveFileId || !driveFileId.trim()) return [];
  const cleanId = driveFileId.trim();
  const list: string[] = [];

  // When token is available, the backend proxy stream is the most authoritative and avoids CORS/auth errors
  if (token) {
    list.push(`/api/drive/media/${encodeURIComponent(cleanId)}?token=${encodeURIComponent(token)}`);
  }

  // Next candidates for public/shared files
  list.push(`https://lh3.googleusercontent.com/d/${cleanId}`);
  list.push(`https://drive.google.com/thumbnail?id=${cleanId}&sz=w2560`);
  list.push(`https://drive.google.com/uc?export=view&id=${cleanId}`);

  return list;
}

/**
 * Returns the Google Drive in-app embedded preview iframe URL.
 * Renders any file (PDF, Doc, Sheet, Slide, Image, Media) inside an iframe.
 */
export function getDriveEmbedPreviewUrl(driveFileId: string): string {
  if (!driveFileId || !driveFileId.trim()) return '';
  return `https://drive.google.com/file/d/${driveFileId.trim()}/preview`;
}

/**
 * Returns a direct download URL for a Google Drive file
 */
export function getDriveDirectDownloadUrl(driveFileId: string): string {
  if (!driveFileId || !driveFileId.trim()) return '';
  return `https://drive.google.com/uc?export=download&id=${driveFileId.trim()}`;
}
