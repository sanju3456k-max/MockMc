/**
 * Google Workspace (Drive & Docs) Integration Client
 * All requests are executed client-side using standard fetch and the cached user access token.
 */
import { setCachedGoogleAccessToken } from './firebase';
import { isTombstoned, getDeletedTombstones } from './idbNotes';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

/**
 * Strips raw file extensions (.md, .txt, .json, etc), cleans raw LaTeX/Markdown table syntax,
 * and formats clean, human-readable titles.
 */
export function getCleanFileName(rawName?: string, rawContent?: string): string {
  if (!rawName && !rawContent) return 'Untitled Note';
  let str = (rawName || '').trim();

  const isGenericName = (name: string) => {
    if (!name) return true;
    const lower = name.toLowerCase().trim();
    return (
      lower === 'untitled note' ||
      lower === 'untitled study document' ||
      lower === 'untitled document' ||
      lower === 'untitled' ||
      lower === 'new note' ||
      lower === 'file' ||
      lower.startsWith('item_') ||
      lower.startsWith('note_') ||
      lower.startsWith('seed_') ||
      lower.startsWith('auto_') ||
      lower.startsWith('drive_') ||
      /^note[-_]\d+/i.test(name) ||
      /^item[-_]\d+/i.test(name)
    );
  };

  // If no raw name provided or name is generic, derive from content
  if (isGenericName(str) && rawContent) {
    const lines = rawContent
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (l === '---' || l === '***' || l === '___') return false;
        if (/^```/i.test(l)) return false;
        if (/^data:image\//i.test(l)) return false;
        if (/^https?:\/\//i.test(l)) return false;
        return true;
      });

    const firstLine = lines[0] || '';

    // 1. Check for image markdown: ![Image Title](url) or [Attached Visual: Title]
    const imgMatch = firstLine.match(/!\[([^\]]+)\]\([^)]+\)/) || firstLine.match(/\[Attached Visual:\s*([^\]]+)\]/i);
    if (imgMatch && imgMatch[1] && imgMatch[1].trim()) {
      str = imgMatch[1].trim();
    } else if (firstLine.startsWith('#')) {
      // 2. Check for markdown header (# Title, ## Title, ### Title)
      str = firstLine.replace(/^[#\s]+/, '').replace(/\*\*/g, '').trim();
    } else if (firstLine.startsWith('**') && firstLine.endsWith('**')) {
      // 3. Check for bold title
      str = firstLine.replace(/^\*\*|\*\*$/g, '').trim();
    } else if (firstLine.startsWith('|') && firstLine.includes('|', 1)) {
      // 4. Check for markdown table header (| Col 1 | Col 2 | Col 3 |)
      const cells = firstLine
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c && c !== '---' && !/^:?-+:?$/.test(c));
      
      if (cells.length > 0) {
        const cleanCells = cells.filter((c) => !/^(Q#|No\.|#|Item)$/i.test(c));
        if (cleanCells.length > 0) {
          str = cleanCells.slice(0, 3).join(' • ');
        } else {
          str = cells.slice(0, 3).join(' • ');
        }
      }
    } else if (firstLine.startsWith('>')) {
      // 5. Blockquote line
      str = firstLine.replace(/^[>\s]+/, '').trim();
    } else {
      str = firstLine.slice(0, 60).trim();
    }
  }

  // Strip file extensions (.md, .markdown, .txt, .json, .pdf, .png, etc.)
  str = str.replace(/\.(md|markdown|txt|json|pdf|png|jpg|jpeg|doc|docx|csv)$/i, '');

  // Strip raw HTML tags if any (e.g. <span>, <b>, </b>)
  str = str.replace(/<\/?[^>]+(>|$)/g, '');

  // Clean Markdown formatting (**bold**, *italic*, headers #, list bullets, backticks)
  str = str
    .replace(/^[#\s*•\-]+/, '')
    .replace(/[`\*\_]{1,3}/g, '')
    .trim();

  // Clean LaTeX math expressions in title into clean readable symbols
  str = str
    .replace(/\\(sin|cos|tan|sec|csc|cot|log|ln|lim|exp|det|trace|deg)\b/g, '$1')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\int\b/g, '∫')
    .replace(/\\sum\b/g, '∑')
    .replace(/\\prod\b/g, '∏')
    .replace(/\\partial\b/g, '∂')
    .replace(/\\nabla\b/g, '∇')
    .replace(/\\sqrt\{?([^}]+)\}?/g, '√$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\times\b/g, '×')
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\le\b|\\leq\b/g, '≤')
    .replace(/\\ge\b|\\geq\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\equiv\b/g, '≡')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\rightarrow\b|\\to\b/g, '→')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^n\b/g, 'ⁿ')
    .replace(/\$([^\$]+)\$/g, '$1') // Strip dollar signs from $x$
    .replace(/[\$\\]/g, ''); // Strip remaining raw $ and \ characters

  // Clean raw table pipes (|) into neat bullet separators (•)
  if (str.includes('|')) {
    str = str
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s && !/^(Q#|No\.|#|Item)$/i.test(s) && !/^:?-+:?$/.test(s))
      .join(' • ');
  }

  // Convert snake_case or kebab-case to spaced title if entire token is joined
  if (/^[a-z0-9_-]+$/i.test(str) && (str.includes('_') || str.includes('-'))) {
    str = str.replace(/[-_]+/g, ' ').trim();
  }

  // Capitalize title words if entire string is lowercase
  if (str === str.toLowerCase() && !/[θαβγλσμωΔπ∫∑√≤≥≠≈∞→²³ⁿ]/.test(str)) {
    str = str.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // Normalize multi-spaces
  str = str.replace(/\s+/g, ' ').trim();

  return str || 'Untitled Note';
}

/**
 * List files from Google Drive or AppDataFolder (Plan C)
 */
export async function listGoogleDriveFiles(
  accessToken: string,
  searchQuery?: string,
  mimeTypeFilter?: 'all' | 'pdf' | 'image' | 'document',
  folderId?: string,
  spaces?: 'drive' | 'appDataFolder'
): Promise<GoogleDriveFile[]> {
  const isAppData = spaces === 'appDataFolder' || folderId === 'appDataFolder';
  let q = "trashed = false";
  
  if (folderId && folderId !== 'appDataFolder') {
    q += ` and '${folderId}' in parents`;
  }

  if (mimeTypeFilter && mimeTypeFilter !== 'all') {
    if (mimeTypeFilter === 'pdf') {
      q += " and mimeType = 'application/pdf'";
    } else if (mimeTypeFilter === 'image') {
      q += " and (mimeType contains 'image/' or mimeType = 'image/png' or mimeType = 'image/jpeg')";
    } else if (mimeTypeFilter === 'document') {
      q += " and mimeType = 'application/vnd.google-apps.document'";
    }
  }

  if (searchQuery && searchQuery.trim()) {
    const cleanSearch = searchQuery.replace(/'/g, "\\'");
    q += ` and name contains '${cleanSearch}'`;
  }

  const spacesParam = isAppData ? '&spaces=appDataFolder' : '';
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=60&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,appProperties)${spacesParam}&q=${encodeURIComponent(q)}&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      setCachedGoogleAccessToken(null);
    }
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to fetch Google Drive files (Status: ${res.status})`);
  }

  const data = await res.json();
  const rawFiles: GoogleDriveFile[] = data.files || [];
  return rawFiles.filter((f) => !isTombstoned(f.id));
}

/**
 * Sets a Google Drive file or folder permission to 'anyone with the link' can view (reader)
 * so that links opened by other accounts or shared across devices are visible without access errors.
 */
export async function setDriveFilePublic(accessToken: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
        allowFileDiscovery: false,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('Failed to set public reader permission on Drive file:', e);
    return false;
  }
}

/**
 * Upload a file (notes, JSON, PDFs) to Google Drive or AppDataFolder using a multipart upload.
 */
export async function uploadFileToGoogleDrive(
  accessToken: string,
  name: string,
  mimeType: string,
  data: Blob | string,
  parentId?: string,
  appProperties?: Record<string, string>
): Promise<GoogleDriveFile> {
  let effectiveParentId = parentId;
  if (!effectiveParentId && appProperties?.app === 'html_notes_studio') {
    try {
      const rootFolders = await findAllDriveFolders(accessToken, 'HTML Note Studio', undefined);
      if (rootFolders.length > 0) {
        effectiveParentId = rootFolders[0].id;
      }
    } catch (e) {
      console.warn('Could not resolve HTML Note Studio root folder:', e);
    }
  }

  const isAppData = effectiveParentId === 'appDataFolder';
  const metadata: Record<string, any> = {
    name,
    mimeType,
  };
  if (effectiveParentId) {
    metadata.parents = [effectiveParentId];
  }
  if (appProperties) {
    metadata.appProperties = appProperties;
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  
  if (data instanceof Blob) {
    form.append('file', data);
  } else {
    form.append('file', new Blob([data], { type: mimeType }));
  }

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,iconLink,appProperties', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (effectiveParentId && effectiveParentId !== 'appDataFolder' && (res.status === 404 || errorText.includes('File not found') || errorText.includes('notFound'))) {
      console.warn(`Parent folder ${effectiveParentId} not found. Retrying upload to HTML Note Studio folder.`);
      const rootFolders = await findAllDriveFolders(accessToken, 'HTML Note Studio', undefined);
      const fallbackParent = rootFolders.length > 0 ? rootFolders[0].id : undefined;
      return uploadFileToGoogleDrive(accessToken, name, mimeType, data, fallbackParent, appProperties);
    }
    throw new Error(`Failed to upload to Google Drive: ${errorText}`);
  }

  const fileData = await res.json();
  
  // Make file viewable by link across other accounts ONLY if not in private appDataFolder
  if (fileData?.id && !isAppData) {
    setDriveFilePublic(accessToken, fileData.id).catch(() => {});
  }

  return fileData;
}

/**
 * Delete a file from Google Drive (requires user confirmation before calling)
 */
export async function deleteGoogleDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to delete Google Drive file: ${errorText}`);
  }
}

/**
 * Download a file's raw bytes or text from Google Drive
 * Uses the internal backend proxy (/api/drive/media/:fileId) to avoid client-side CORS and redirect errors
 */
export async function downloadGoogleDriveFile(accessToken: string, fileId: string): Promise<Blob> {
  // Step 1: Attempt via internal backend proxy with Bearer token
  try {
    const proxyRes = await fetch(`/api/drive/media/${encodeURIComponent(fileId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (proxyRes.ok) {
      return await proxyRes.blob();
    }
  } catch {
    // Continue to direct Google Drive fetch
  }

  // Step 2: Fallback to direct Google Drive API call
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      setCachedGoogleAccessToken(null);
    }
    throw new Error(`Failed to download Google Drive file (${res.status}): ${res.statusText}`);
  }

  return await res.blob();
}

/**
 * Loads a file stream from Google Drive for lazy on-demand preview.
 * For standard files (images, PDFs, text), fetches raw binary stream.
 * For Google Docs, exports to text/pdf so it can be previewed seamlessly inside the app.
 */
export async function fetchGoogleDrivePreviewBlob(
  accessToken: string,
  fileId: string,
  mimeType?: string
): Promise<{
  blob?: Blob;
  isPdf: boolean;
  isImage: boolean;
  isText: boolean;
  objectUrl: string;
  textContent?: string;
  realMimeType?: string;
  thumbnailUrl?: string;
  webViewLink?: string;
}> {
  let activeMime = mimeType;
  let remoteName = '';
  let remoteThumbnail = '';
  let remoteWebViewLink = '';

  // Step 1: Query Google Drive metadata to obtain authoritative MIME type, name, and links
  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,thumbnailLink,webContentLink,webViewLink,size,trashed&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta?.trashed) {
        return { isPdf: false, isImage: false, isText: false, objectUrl: '' };
      }
      if (meta?.mimeType) {
        activeMime = meta.mimeType;
      }
      if (meta?.name) {
        remoteName = meta.name;
      }
      if (meta?.thumbnailLink) {
        remoteThumbnail = meta.thumbnailLink.replace(/=s\d+/, '=s2560');
      }
      if (meta?.webViewLink) {
        remoteWebViewLink = meta.webViewLink;
      }
    } else if (metaRes.status === 404) {
      return { isPdf: false, isImage: false, isText: false, objectUrl: '' };
    }
  } catch {
    // Silently continue
  }

  // Step 2: Handle Google Docs / Google Workspace documents
  if (activeMime === 'application/vnd.google-apps.document' || activeMime?.includes('google-apps')) {
    try {
      const text = await fetchGoogleDriveFileContent(accessToken, fileId, activeMime);
      let pdfBlob: Blob;
      try {
        pdfBlob = await exportGoogleDoc(accessToken, fileId, 'application/pdf');
      } catch {
        pdfBlob = new Blob([text || ''], { type: 'text/plain' });
      }
      const objectUrl = URL.createObjectURL(pdfBlob);
      return {
        blob: pdfBlob,
        isPdf: true,
        isImage: false,
        isText: Boolean(text && text.trim()),
        objectUrl,
        textContent: text || undefined,
        realMimeType: activeMime,
        webViewLink: remoteWebViewLink,
      };
    } catch {
      return { isPdf: false, isImage: false, isText: false, objectUrl: '' };
    }
  }

  // Step 3: Handle direct binary / media file downloads (Images, PDFs, Text)
  try {
    const blob = await downloadGoogleDriveFile(accessToken, fileId);
    const rawType = (blob.type || activeMime || '').toLowerCase();

    let isPdf = rawType.includes('pdf');
    let isImage = rawType.startsWith('image/');
    let isText = rawType.startsWith('text/') || rawType.includes('json') || rawType.includes('markdown');

    if (!isPdf && !isImage) {
      try {
        const headerBuffer = await blob.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(headerBuffer);
        // PNG: 89 50 4E 47
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) isImage = true;
        // JPEG: FF D8 FF
        else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) isImage = true;
        // GIF: 47 49 46
        else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) isImage = true;
        // RIFF/WEBP: 52 49 46 46
        else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) isImage = true;
        // PDF: %PDF
        else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) isPdf = true;
      } catch {}
    }

    const objectUrl = URL.createObjectURL(blob);
    let textContent: string | undefined = undefined;

    if (!isPdf && !isImage) {
      try {
        const rawText = await blob.text();
        if (rawText && !rawText.includes('PNG IHDR') && !rawText.startsWith('\x89PNG')) {
          textContent = rawText;
          isText = true;
        }
      } catch {}
    }

    return {
      blob,
      isPdf,
      isImage,
      isText,
      objectUrl,
      textContent,
      realMimeType: activeMime,
      thumbnailUrl: remoteThumbnail,
      webViewLink: remoteWebViewLink,
    };
  } catch (err: any) {
    console.warn('Direct media download failed, checking fallback streams:', err);

    // Fallback 1: For Google Docs or text export if alt=media failed
    const text = await fetchGoogleDriveFileContent(accessToken, fileId, activeMime).catch(() => null);
    if (text) {
      const textBlob = new Blob([text], { type: 'text/plain' });
      return {
        blob: textBlob,
        isPdf: false,
        isImage: false,
        isText: true,
        objectUrl: URL.createObjectURL(textBlob),
        textContent: text,
        realMimeType: activeMime,
        webViewLink: remoteWebViewLink,
      };
    }

    // Fallback 2: For images across accounts or when direct stream is restricted, provide high-res CDN stream
    const isLikelyImage =
      (activeMime && activeMime.startsWith('image/')) ||
      (remoteName && /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|hdr)$/i.test(remoteName));

    if (isLikelyImage) {
      const cdnUrl = remoteThumbnail || `https://lh3.googleusercontent.com/d/${fileId}`;
      return {
        isPdf: false,
        isImage: true,
        isText: false,
        objectUrl: cdnUrl,
        realMimeType: activeMime || 'image/png',
        thumbnailUrl: cdnUrl,
        webViewLink: remoteWebViewLink,
      };
    }

    // Fallback 3: For PDFs across accounts
    if (activeMime === 'application/pdf' || (remoteName && /\.pdf$/i.test(remoteName))) {
      return {
        isPdf: true,
        isImage: false,
        isText: false,
        objectUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        realMimeType: 'application/pdf',
        webViewLink: remoteWebViewLink,
      };
    }

    throw err;
  }
}

/**
 * Export a Google Doc to a specific format (like PDF)
 */
export async function exportGoogleDoc(
  accessToken: string,
  fileId: string,
  targetMimeType = 'application/pdf'
): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${targetMimeType}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to export Google Doc: ${res.statusText}`);
  }

  return await res.blob();
}

/**
 * Fetch the latest plain text or markdown content of a Google Doc or Google Drive text file
 */
export async function fetchGoogleDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType?: string
): Promise<string | null> {
  try {
    if (mimeType === 'application/vnd.google-apps.document' || !mimeType || mimeType === 'file') {
      // Export Google Doc as plain text
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        return await res.text();
      }
      if (res.status === 404) {
        return null;
      }
    }
    // Fallback to raw download
    const blob = await downloadGoogleDriveFile(accessToken, fileId);
    return await blob.text();
  } catch {
    return null;
  }
}

export interface DocSection {
  title: string;
  body: string;
  isHeading?: boolean;
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts simple markdown & text to formatted HTML for Google Docs conversion
 */
export function markdownToGoogleDocHtml(title: string, sections: DocSection[]): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; margin: 20px; }
    h1 { font-size: 20pt; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px; }
    h2 { font-size: 14pt; color: #1d4ed8; margin-top: 18px; margin-bottom: 8px; font-weight: bold; }
    h3 { font-size: 12pt; color: #2563eb; margin-top: 14px; margin-bottom: 6px; font-weight: bold; }
    p { margin-bottom: 10px; }
    ul, ol { margin-top: 4px; margin-bottom: 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }
    code { font-family: 'Courier New', Courier, monospace; background-color: #f1f5f9; padding: 2px 4px; font-size: 10pt; }
    pre { font-family: 'Courier New', Courier, monospace; background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 10pt; white-space: pre-wrap; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; margin-bottom: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background-color: #f8fafc; font-weight: bold; color: #0f172a; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
`;

  for (const sec of sections) {
    if (sec.title) {
      if (sec.isHeading) {
        html += `  <h2>${escapeHtml(sec.title)}</h2>\n`;
      } else {
        html += `  <h3>${escapeHtml(sec.title)}</h3>\n`;
      }
    }
    if (sec.body) {
      const formatted = sec.body
        .split('\n\n')
        .map((p) => {
          const trimmed = p.trim();
          if (!trimmed) return '';
          if (trimmed.startsWith('|') && trimmed.includes('|')) {
            // Simple markdown table conversion
            const rows = trimmed.split('\n').filter((r) => !r.includes('---'));
            let tHtml = '<table>';
            rows.forEach((row, i) => {
              const cols = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
              const tag = i === 0 ? 'th' : 'td';
              tHtml += `<tr>${cols.map((c) => `<${tag}>${escapeHtml(c.trim())}</${tag}>`).join('')}</tr>`;
            });
            tHtml += '</table>';
            return tHtml;
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const items = trimmed.split('\n').map((li) => `<li>${escapeHtml(li.replace(/^[-*]\s+/, ''))}</li>`).join('');
            return `<ul>${items}</ul>`;
          }
          return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
        })
        .join('\n');
      html += `  ${formatted}\n`;
    }
  }

  html += `</body>\n</html>`;
  return html;
}

/**
 * Creates a beautifully structured Google Doc with sections (H1 titles, body text).
 * Uses Google Drive API multipart upload with HTML conversion for 100% reliable doc creation.
 */
export async function createGoogleDoc(
  accessToken: string,
  title: string,
  sections: DocSection[],
  parentId?: string
): Promise<{ documentId: string; title: string; webViewLink?: string }> {
  // Build HTML formatted document body
  const htmlContent = markdownToGoogleDocHtml(title, sections);

  const metadata: Record<string, any> = {
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  };
  if (parentId && parentId !== 'appDataFolder') {
    metadata.parents = [parentId];
  }

  const boundary = 'foo_bar_baz_doc';
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;

  const multipartRequestBody =
    `${delimiter}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `${delimiter}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `${htmlContent}\r\n` +
    `${closeDelimiter}`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Google Doc: ${errText}`);
  }

  const data = await res.json();
  const documentId = data.id;

  // Make document viewable by link across other accounts
  setDriveFilePublic(accessToken, documentId).catch(() => {});

  const webViewLink = data.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`;

  return {
    documentId,
    title,
    webViewLink,
  };
}

/**
 * Updates an existing Google Doc with fresh content and formatted sections.
 * Clears old content safely and re-inserts updated sections.
 */
export async function updateGoogleDocContent(
  accessToken: string,
  documentId: string,
  title: string,
  sections: DocSection[]
): Promise<{ documentId: string; title: string; webViewLink: string }> {
  // First retrieve doc to know end index
  let endIndex = 1;
  try {
    const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (docRes.ok) {
      const docData = await docRes.json();
      const bodyContent = docData.body?.content || [];
      if (bodyContent.length > 0) {
        endIndex = bodyContent[bodyContent.length - 1].endIndex || 1;
      }
    }
  } catch (e) {
    console.warn('Could not read existing doc length before update:', e);
  }

  const requests: any[] = [];

  // Delete previous body if length > 2
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex - 1,
        },
      },
    });
  }

  // Build updated content string
  let fullText = `${title}\n\n`;
  const formattingRanges: { start: number; end: number; type: 'title' | 'heading' | 'body' }[] = [
    { start: 1, end: title.length + 1, type: 'title' }
  ];

  for (const sec of sections) {
    const startIdx = fullText.length + 1;
    if (sec.title) {
      fullText += `${sec.title}\n`;
      const endIdx = fullText.length + 1;
      formattingRanges.push({
        start: startIdx,
        end: endIdx,
        type: sec.isHeading ? 'heading' : 'title'
      });
    }

    const bodyStartIdx = fullText.length + 1;
    fullText += `${sec.body}\n\n`;
    const bodyEndIdx = fullText.length + 1;
    formattingRanges.push({
      start: bodyStartIdx,
      end: bodyEndIdx,
      type: 'body'
    });
  }

  // Insert new text at index 1
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Apply typography styles
  for (const range of formattingRanges) {
    if (range.type === 'title') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: range.start, endIndex: range.end - 1 },
          paragraphStyle: { namedStyleType: 'TITLE' },
          fields: 'namedStyleType',
        },
      });
    } else if (range.type === 'heading') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: range.start, endIndex: range.end - 1 },
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType',
        },
      });
    } else if (range.type === 'body') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: range.start, endIndex: range.end - 1 },
          paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
          fields: 'namedStyleType',
        },
      });
    }
  }

  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.warn('Google Doc batch update warning:', errText);
  }

  return {
    documentId,
    title,
    webViewLink: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

/**
 * Read the raw plain text from a Google Doc using the Google Docs v1 API.
 */
export async function getGoogleDocPlainText(accessToken: string, documentId: string): Promise<string> {
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!docRes.ok) {
    throw new Error(`Failed to fetch Google Doc text (status ${docRes.status})`);
  }

  const docData = await docRes.json();
  let fullText = '';
  const bodyContent = docData.body?.content || [];
  for (const item of bodyContent) {
    if (item.paragraph?.elements) {
      for (const elem of item.paragraph.elements) {
        if (elem.textRun?.content) {
          fullText += elem.textRun.content;
        }
      }
    } else if (item.table?.tableRows) {
      const rows: string[][] = [];
      for (const row of item.table.tableRows) {
        const rowCells: string[] = [];
        for (const cell of row.tableCells || []) {
          let cellText = '';
          for (const cellItem of cell.content || []) {
            if (cellItem.paragraph?.elements) {
              for (const elem of cellItem.paragraph.elements) {
                if (elem.textRun?.content) {
                  cellText += elem.textRun.content;
                }
              }
            }
          }
          rowCells.push(cellText.trim().replace(/\n/g, ' ').replace(/\|/g, '\\|'));
        }
        rows.push(rowCells);
      }

      if (rows.length > 0) {
        fullText += '\n\n';
        rows.forEach((rowCells, rIdx) => {
          fullText += `| ${rowCells.join(' | ')} |\n`;
          if (rIdx === 0) {
            fullText += `| ${rowCells.map(() => '---').join(' | ')} |\n`;
          }
        });
        fullText += '\n';
      }
    }
  }

  return fullText.trim();
}

/**
 * Converts a base64 or data URL to a standard browser Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.warn('Failed to convert dataUrl to Blob, falling back to plain text blob:', err);
    return new Blob([dataUrl], { type: 'text/plain' });
  }
}

// In-flight mutex for folder creation to prevent concurrent race conditions
const folderCreationMutex = new Map<string, Promise<string>>();
// In-flight mutex for file upserts to prevent concurrent double-writes to same note
const fileUpsertMutex = new Map<string, Promise<{ id: string; webViewLink?: string; isNew: boolean }>>();

/**
 * Find all matching folders by name or app properties in Google Drive.
 */
export async function findAllDriveFolders(
  accessToken: string,
  folderName: string,
  parentId?: string,
  appPropertyFilter?: { key: string; value: string }
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const cleanName = folderName.replace(/'/g, "\\'");
  const parentConstraint = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  
  let q = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentConstraint}`;
  if (appPropertyFilter) {
    q += ` and appProperties has { key='${appPropertyFilter.key}' and value='${appPropertyFilter.value}' }`;
  } else {
    q += ` and name = '${cleanName}'`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,appProperties)&pageSize=100&orderBy=createdTime asc`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return [];
    const data = await res.json();
    const files = data.files || [];
    if (files.length > 0) return files;

    // Fallback: If appPropertyFilter was specified but returned 0 matches, search by name
    if (appPropertyFilter && cleanName) {
      const nameQuery = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentConstraint} and name = '${cleanName}'`;
      const fallbackRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(nameQuery)}&fields=files(id,name,createdTime,appProperties)&pageSize=100&orderBy=createdTime asc`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        return fallbackData.files || [];
      }
    }
    return [];
  } catch (err) {
    console.warn('Error finding drive folders:', err);
    return [];
  }
}

/**
 * Find a folder by name and optional parentId in Google Drive.
 * If multiple folders exist with the same name, picks the oldest canonical folder to prevent fragmentation.
 */
export async function findDriveFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
  appPropertyFilter?: { key: string; value: string }
): Promise<string | null> {
  const folders = await findAllDriveFolders(accessToken, folderName, parentId, appPropertyFilter);
  if (folders.length > 0) {
    return folders[0].id;
  }
  return null;
}

/**
 * Automatic Deduplication: If duplicate folders exist with the same name under parentId,
 * keeps the oldest canonical folder, migrates all unique files from duplicate folders into it,
 * trashes duplicate files, and trashes the duplicate folders.
 */
export async function deduplicateDriveFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
  appPropertyFilter?: { key: string; value: string }
): Promise<string | null> {
  const folders = await findAllDriveFolders(accessToken, folderName, parentId, appPropertyFilter);
  if (folders.length === 0) return null;
  if (folders.length === 1) return folders[0].id;

  const canonicalFolder = folders[0];
  const duplicateFolders = folders.slice(1);

  console.warn(`[Drive Deduplicator] Found ${duplicateFolders.length} duplicate folders for "${folderName}". Merging into canonical folder: ${canonicalFolder.id}`);

  // Fetch all existing files in canonical folder to prevent file-level clashes
  const canonicalFilesRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${canonicalFolder.id}' in parents and trashed = false`)}&fields=files(id,name,appProperties)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).catch(() => null);

  const existingFileNames = new Set<string>();
  const existingNoteIds = new Set<string>();
  if (canonicalFilesRes && canonicalFilesRes.ok) {
    const cData = await canonicalFilesRes.json().catch(() => ({}));
    (cData.files || []).forEach((f: any) => {
      if (f.name) existingFileNames.add(f.name);
      if (f.appProperties?.hns_note_id) existingNoteIds.add(f.appProperties.hns_note_id);
    });
  }

  for (const dup of duplicateFolders) {
    try {
      // Find all files inside the duplicate folder
      const filesRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${dup.id}' in parents and trashed = false`)}&fields=files(id,name,appProperties)&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (filesRes.ok) {
        const filesData = await filesRes.json();
        const files: Array<{ id: string; name: string; appProperties?: Record<string, string> }> = filesData.files || [];

        for (const file of files) {
          const isClash =
            existingFileNames.has(file.name) ||
            (file.appProperties?.hns_note_id && existingNoteIds.has(file.appProperties.hns_note_id));

          if (isClash) {
            // Trash the duplicate redundant file in the duplicate folder
            await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ trashed: true }),
            }).catch(() => {});
          } else {
            // Move file to canonical folder
            await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${canonicalFolder.id}&removeParents=${dup.id}`,
              {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            ).catch((e) => console.warn(`Failed to move file ${file.id} to canonical folder:`, e));
            existingFileNames.add(file.name);
            if (file.appProperties?.hns_note_id) existingNoteIds.add(file.appProperties.hns_note_id);
          }
        }
      }

      // Trash the duplicate folder
      await fetch(`https://www.googleapis.com/drive/v3/files/${dup.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      });
      console.log(`[Drive Deduplicator] Trashed duplicate folder: ${dup.id} (${dup.name})`);
    } catch (err) {
      console.warn(`[Drive Deduplicator] Failed to clean up duplicate folder ${dup.id}:`, err);
    }
  }

  return canonicalFolder.id;
}

/**
 * Creates a folder in Google Drive with mutex lock to guarantee zero duplicate creations.
 */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
  appProperties?: Record<string, string>
): Promise<string> {
  const mutexKey = `${parentId || 'root'}::${folderName}::${appProperties?.projectId || ''}`;
  if (folderCreationMutex.has(mutexKey)) {
    return folderCreationMutex.get(mutexKey)!;
  }

  const creationPromise = (async () => {
    try {
      // Step 1: Run deduplication check first
      const propFilter = appProperties?.role ? { key: 'role', value: appProperties.role } : undefined;
      const existingId = await deduplicateDriveFolder(accessToken, folderName, parentId, propFilter);
      if (existingId) {
        // Ensure appProperties are stamped
        if (appProperties) {
          fetch(`https://www.googleapis.com/drive/v3/files/${existingId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              appProperties: {
                app: 'html_notes_studio',
                ...(appProperties || {}),
              },
            }),
          }).catch(() => {});
        }
        return existingId;
      }

      // Step 2: Create new folder with metadata
      const metadata: Record<string, any> = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          app: 'html_notes_studio',
          ...(appProperties || {}),
        },
      };
      if (parentId) {
        metadata.parents = [parentId];
      }

      const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,appProperties', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (parentId && (res.status === 404 || errText.includes('File not found') || errText.includes('notFound'))) {
          console.warn(`Parent folder ${parentId} not found. Retrying createDriveFolder at root.`);
          return createDriveFolder(accessToken, folderName, undefined, appProperties);
        }
        throw new Error(`Failed to create Google Drive folder "${folderName}": ${errText}`);
      }

      const data = await res.json();
      return data.id;
    } finally {
      folderCreationMutex.delete(mutexKey);
    }
  })();

  folderCreationMutex.set(mutexKey, creationPromise);
  return creationPromise;
}

/**
 * Searches for an existing note file in a given folder by note ID or clean filename
 */
export async function findExistingDriveFile(
  accessToken: string,
  noteId: string,
  folderId: string,
  fileName?: string
): Promise<{ id: string; name: string; webViewLink?: string } | null> {
  try {
    // 1. Search by exact appProperties (most accurate, Google Docs style)
    const propQuery = `'${folderId}' in parents and trashed = false and appProperties has { key='hns_note_id' and value='${noteId}' }`;
    const propRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(propQuery)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (propRes.ok) {
      const propData = await propRes.json();
      if (propData.files && propData.files.length > 0) {
        // If duplicates exist with same noteId, trash the extras
        if (propData.files.length > 1) {
          for (let i = 1; i < propData.files.length; i++) {
            fetch(`https://www.googleapis.com/drive/v3/files/${propData.files[i].id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ trashed: true }),
            }).catch(() => {});
          }
        }
        return propData.files[0];
      }
    }

    // 2. Fallback search by filename in same folder
    if (fileName) {
      const cleanFileName = fileName.replace(/'/g, "\\'");
      const nameQuery = `'${folderId}' in parents and trashed = false and name = '${cleanFileName}'`;
      const nameRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(nameQuery)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (nameRes.ok) {
        const nameData = await nameRes.json();
        if (nameData.files && nameData.files.length > 0) {
          return nameData.files[0];
        }
      }
    }

    return null;
  } catch (err) {
    console.warn('Error finding existing drive file:', err);
    return null;
  }
}

/**
 * Idempotent In-Place File Upsert:
 * If file already exists, updates content via PATCH (guaranteeing ZERO duplicate files in Drive).
 * Only creates a new file if no match is found. Protected by fileUpsertMutex to serialize concurrent writes.
 */
export async function upsertFileToGoogleDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  content: string | Blob,
  folderId: string,
  noteId: string,
  projectId: string,
  knownDriveFileId?: string | null
): Promise<{ id: string; webViewLink?: string; isNew: boolean }> {
  const mutexKey = `${folderId}::${noteId}`;
  if (fileUpsertMutex.has(mutexKey)) {
    return fileUpsertMutex.get(mutexKey)!;
  }

  const upsertPromise = (async () => {
    // 1. Verify or discover existing file ID
    let targetFileId = knownDriveFileId;
    let targetWebViewLink = '';

    if (targetFileId) {
      // Check if target file is still valid
      try {
        const chkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${targetFileId}?fields=id,trashed,webViewLink`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (chkRes.ok) {
          const chkData = await chkRes.json();
          if (chkData?.trashed) {
            targetFileId = null;
          } else {
            targetWebViewLink = chkData?.webViewLink || '';
          }
        } else {
          targetFileId = null;
        }
      } catch {
        targetFileId = null;
      }
    }

    // 2. If targetFileId is not known, search folder by noteId / filename
    if (!targetFileId) {
      const existing = await findExistingDriveFile(accessToken, noteId, folderId, fileName);
      if (existing) {
        targetFileId = existing.id;
        targetWebViewLink = existing.webViewLink || '';
      }
    }

    // 3. If file exists, PATCH media content in-place (ZERO DUPLICATION)
    if (targetFileId) {
      const patchRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `${mimeType}; charset=UTF-8`,
          },
          body: content,
        }
      );

      if (patchRes.ok) {
        // Update metadata (name, description, and appProperties)
        await fetch(`https://www.googleapis.com/drive/v3/files/${targetFileId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: fileName,
            description: 'HTML Note Studio Document · Open in app to edit or open in browser to view.',
            appProperties: {
              app: 'html_notes_studio',
              hns_note_id: noteId,
              hns_project_id: projectId,
              hns_updated_at: String(Date.now()),
            },
          }),
        }).catch(() => {});

        return { id: targetFileId, webViewLink: targetWebViewLink || `https://drive.google.com/file/d/${targetFileId}/view`, isNew: false };
      }
    }

    // 4. File does not exist anywhere -> upload fresh file
    const uploaded = await uploadFileToGoogleDrive(
      accessToken,
      fileName,
      mimeType,
      content,
      folderId,
      {
        app: 'html_notes_studio',
        hns_note_id: noteId,
        hns_project_id: projectId,
        hns_updated_at: String(Date.now()),
      }
    );

    return { id: uploaded.id, webViewLink: uploaded.webViewLink, isNew: true };
  })();

  fileUpsertMutex.set(mutexKey, upsertPromise);
  try {
    return await upsertPromise;
  } finally {
    fileUpsertMutex.delete(mutexKey);
  }
}

// In-memory cache and mutex promises for folder IDs to prevent redundant API queries and duplicate creations
let cachedAppFolderId: string | null = null;
let cachedNotesFolderId: string | null = null;
const cachedTestFolderMap = new Map<string, string>();

let notesFolderPromise: Promise<{ appFolderId: string; notesFolderId: string }> | null = null;
const testFolderPromiseMap = new Map<string, Promise<{ appFolderId: string; notesFolderId: string; testFolderId: string; testFolderName: string }>>();

/**
 * Sanitize folder and file names for Google Drive compatibility
 */
export function sanitizeFolderName(name: string): string {
  if (!name || !name.trim()) return 'General Repository';
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 80);
}

/**
 * Plan C: Virtual Folder Reference for AppDataFolder
 * No physical folders are created in Google Drive, eliminating folder duplication and visible Drive clutter.
 */
export function getOrCreateNotesFolder(
  _accessToken: string
): Promise<{ appFolderId: string; notesFolderId: string }> {
  return Promise.resolve({
    appFolderId: 'appDataFolder',
    notesFolderId: 'appDataFolder',
  });
}

/**
 * Plan C: Dedicated Virtual Test Folder mapping to appDataFolder
 * No subfolders are spawned in Google Drive. All test organization is handled virtually via appProperties metadata.
 */
export function getOrCreateTestNotesFolder(
  _accessToken: string,
  testTitle?: string
): Promise<{ appFolderId: string; notesFolderId: string; testFolderId: string; testFolderName: string }> {
  const testFolderName = sanitizeFolderName(testTitle || 'General Repository');
  return Promise.resolve({
    appFolderId: 'appDataFolder',
    notesFolderId: 'appDataFolder',
    testFolderId: 'appDataFolder',
    testFolderName,
  });
}

/**
 * Plan C: Discovers available tests dynamically from appDataFolder notes manifest
 * rather than physical Google Drive folders.
 */
export async function listTestDriveFolders(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const manifest = await loadNotesManifestFromGoogleDrive(accessToken);
    if (!manifest || !Array.isArray(manifest) || manifest.length === 0) {
      return [{ id: 'General Repository', name: 'General Repository' }];
    }
    const testNamesSet = new Set<string>();
    manifest.forEach((n: any) => {
      const title = n.testTitle || (n.testId && n.testId !== 'notes_repository' ? n.testId : null);
      if (title) testNamesSet.add(sanitizeFolderName(title));
    });
    if (testNamesSet.size === 0) {
      testNamesSet.add('General Repository');
    }
    return Array.from(testNamesSet).map((name) => ({ id: name, name }));
  } catch (err) {
    console.warn('Could not list tests from appDataFolder:', err);
    return [{ id: 'General Repository', name: 'General Repository' }];
  }
}

/**
 * Move a file into a specific folder in Google Drive (kept for backward compatibility)
 */
export async function moveDriveFileToFolder(
  accessToken: string,
  fileId: string,
  folderId: string
): Promise<void> {
  const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let prevParents = '';
  if (getRes.ok) {
    const fileData = await getRes.json();
    if (fileData.parents && Array.isArray(fileData.parents)) {
      prevParents = fileData.parents.join(',');
    }
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}${prevParents ? `&removeParents=${prevParents}` : ''}&fields=id,parents`;
  await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Plan C: Find existing file in appDataFolder by noteId to prevent duplicate file creation
 */
export async function findAppDataFileByNoteId(
  accessToken: string,
  noteId: string
): Promise<string | null> {
  try {
    const cleanId = noteId.replace(/'/g, "\\'");
    const q = `trashed = false and appProperties has { key='noteId' and value='${cleanId}' }`;
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Plan C: Save a personal study note into Google Drive's isolated 'appDataFolder'
 * - Zero visible folders or clutter in user's personal Google Drive
 * - Deduplication guaranteed: checks for existing noteId before uploading
 * - Preserves tables, LaTeX formulas, and Markdown format cleanly
 */
export async function saveNoteToGoogleDrive(
  accessToken: string,
  note: {
    id: string;
    testId: string;
    attemptId?: string;
    questionNumber?: number;
    content: string;
    tag: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: 'image' | 'pdf' | 'file';
    createdAt: string;
  },
  testTitle?: string
): Promise<{ driveFileId: string; webViewLink: string; notesFolderId: string; testFolderId: string; testFolderName: string; isAppData: boolean }> {
  const testFolderName = sanitizeFolderName(testTitle || note.testId || 'General Repository');

  // Step 1: Check if this note was already uploaded and has an ID or already exists in appDataFolder
  let existingFileId = (note as any).driveFileId;
  if (!existingFileId) {
    existingFileId = await findAppDataFileByNoteId(accessToken, note.id);
  }

  // Handle attachment vs text-based note
  const isImageAttachment =
    note.fileType === 'image' ||
    Boolean(note.fileName && /\.(jpe?g|png|gif|webp|svg|bmp|ico|heic|hdr)$/i.test(note.fileName)) ||
    Boolean(note.fileUrl && note.fileUrl.startsWith('data:image/'));

  const isPdfAttachment =
    note.fileType === 'pdf' ||
    Boolean(note.fileName && /\.pdf$/i.test(note.fileName)) ||
    Boolean(note.fileUrl && note.fileUrl.startsWith('data:application/pdf'));

  const appProperties: Record<string, string> = {
    noteId: note.id,
    testId: note.testId || '',
    testTitle: testTitle || '',
    tag: note.tag || '',
    questionNumber: String(note.questionNumber || ''),
    fileType: note.fileType || (isImageAttachment ? 'image' : isPdfAttachment ? 'pdf' : 'text'),
    isAppData: 'true',
  };

  // If file already exists in Drive, update its content in-place (ZERO DUPLICATES)
  if (existingFileId) {
    try {
      if (note.fileUrl && (isImageAttachment || isPdfAttachment)) {
        const fileData = note.fileUrl.startsWith('data:') ? dataUrlToBlob(note.fileUrl) : note.fileUrl;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': isPdfAttachment ? 'application/pdf' : 'image/png',
          },
          body: fileData,
        });
      } else {
        const markdownBody = note.content || '';
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/markdown; charset=UTF-8',
          },
          body: markdownBody,
        });
      }

      // Update appProperties metadata
      await fetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appProperties }),
      });

      return {
        driveFileId: existingFileId,
        webViewLink: (note as any).driveWebViewLink || `https://drive.google.com/file/d/${existingFileId}/view`,
        notesFolderId: 'appDataFolder',
        testFolderId: 'appDataFolder',
        testFolderName,
        isAppData: true,
      };
    } catch (updateErr) {
      console.warn('In-place update of appData file failed, will re-upload:', updateErr);
    }
  }

  // Step 2: Upload new file directly into 'appDataFolder'
  let driveFileId = '';
  let webViewLink = '';

  if (note.fileUrl && (isImageAttachment || isPdfAttachment || note.fileName)) {
    let mimeType = isPdfAttachment ? 'application/pdf' : 'image/png';
    if (!isPdfAttachment) {
      if (note.fileName && /\.(jpe?g|hdr)$/i.test(note.fileName)) {
        mimeType = 'image/jpeg';
      } else if (note.fileName && /\.webp$/i.test(note.fileName)) {
        mimeType = 'image/webp';
      } else if (note.fileName && /\.gif$/i.test(note.fileName)) {
        mimeType = 'image/gif';
      } else if (note.fileName && /\.svg$/i.test(note.fileName)) {
        mimeType = 'image/svg+xml';
      } else if (note.fileUrl.startsWith('data:image/jpeg')) {
        mimeType = 'image/jpeg';
      } else if (note.fileUrl.startsWith('data:image/webp')) {
        mimeType = 'image/webp';
      }
    }

    const cleanFileName = note.fileName || `Attachment_${note.id}.${isPdfAttachment ? 'pdf' : 'png'}`;
    const fileData = note.fileUrl.startsWith('data:') ? dataUrlToBlob(note.fileUrl) : note.fileUrl;

    const uploaded = await uploadFileToGoogleDrive(
      accessToken,
      cleanFileName,
      mimeType,
      fileData,
      'appDataFolder',
      appProperties
    );

    driveFileId = uploaded.id;
    webViewLink = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
  } else {
    // Pure text / formula / table note: Store as structured Markdown in appDataFolder
    const cleanDocName = (note.fileName || (note.questionNumber ? `Q${note.questionNumber}_Note` : note.content.slice(0, 30))).replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Study_Note';
    const fileName = `${cleanDocName}.md`;
    const markdownBody = note.content || '';

    const uploaded = await uploadFileToGoogleDrive(
      accessToken,
      fileName,
      'text/markdown',
      markdownBody,
      'appDataFolder',
      appProperties
    );

    driveFileId = uploaded.id;
    webViewLink = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
  }

  return {
    driveFileId,
    webViewLink,
    notesFolderId: 'appDataFolder',
    testFolderId: 'appDataFolder',
    testFolderName,
    isAppData: true,
  };
}

/**
 * Plan C: Loads the notes index manifest from 'appDataFolder' in Google Drive.
 * If none exists yet, falls back to legacy visible folders to seamlessly migrate existing notes.
 */
export async function loadNotesManifestFromGoogleDrive(
  accessToken: string,
  _testTitle?: string
): Promise<any[] | null> {
  try {
    // 1. Check primary appDataFolder
    const q = "name = 'mockmc_notes_manifest.json' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        const manifestFileId = data.files[0].id;
        const blob = await downloadGoogleDriveFile(accessToken, manifestFileId);
        const text = await blob.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const tombstones = getDeletedTombstones();
          return parsed.filter((n) => n && !tombstones.has(n.id) && (!n.driveFileId || (!tombstones.has(n.driveFileId) && !tombstones.has(`drive_${n.driveFileId}`))));
        }
      }
    }

    // 2. Fallback: Search legacy visible folder for initial migration
    const legacyFolderId = await findDriveFolder(accessToken, 'Mock MC App');
    if (legacyFolderId) {
      const notesFolderId = await findDriveFolder(accessToken, 'Notes', legacyFolderId);
      const targetFolderId = notesFolderId || legacyFolderId;
      const legacyQ = `name = 'mockmc_notes_manifest.json' and '${targetFolderId}' in parents and trashed = false`;
      const legacyRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(legacyQ)}&fields=files(id)&pageSize=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (legacyRes.ok) {
        const legacyData = await legacyRes.json();
        if (legacyData.files && legacyData.files.length > 0) {
          const blob = await downloadGoogleDriveFile(accessToken, legacyData.files[0].id);
          const parsed = JSON.parse(await blob.text());
          if (Array.isArray(parsed)) {
            // Auto-migrate manifest to appDataFolder
            syncNotesManifestToGoogleDrive(accessToken, parsed).catch(() => {});
            return parsed;
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.warn('Could not load notes manifest from Google Drive appDataFolder:', err);
    return null;
  }
}

/**
 * Plan C: Loads all notes manifests from appDataFolder (instant 1-call delta sync)
 */
export async function loadAllNotesManifestsFromGoogleDrive(
  accessToken: string
): Promise<any[]> {
  try {
    const manifest = await loadNotesManifestFromGoogleDrive(accessToken);
    return Array.isArray(manifest) ? manifest : [];
  } catch (err) {
    console.warn('Could not load aggregated manifests from Google Drive:', err);
    return [];
  }
}

/**
 * Plan C: Syncs the master notes manifest JSON file inside Google Drive's 'appDataFolder'
 */
export async function syncNotesManifestToGoogleDrive(
  accessToken: string,
  notes: any[],
  _testTitle?: string
): Promise<void> {
  try {
    const cleanNotes = notes.map((n) => {
      const copy = { ...n };
      // Strip large base64 fileUrl to keep manifest lightweight (<50KB)
      if (copy.fileUrl && copy.fileUrl.length > 500) {
        copy.fileUrl = '';
      }
      return copy;
    });

    const manifestJson = JSON.stringify(cleanNotes, null, 2);

    // Check if manifest already exists in appDataFolder
    const q = "name = 'mockmc_notes_manifest.json' and trashed = false";
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let manifestFileId: string | null = null;
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        manifestFileId = searchData.files[0].id;
      }
    }

    if (manifestFileId) {
      // Update existing
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${manifestFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: manifestJson,
      });
    } else {
      // Upload new into appDataFolder
      await uploadFileToGoogleDrive(
        accessToken,
        'mockmc_notes_manifest.json',
        'application/json',
        manifestJson,
        'appDataFolder'
      );
    }
  } catch (err) {
    console.warn('Failed to sync notes manifest to Google Drive appDataFolder:', err);
  }
}

/**
 * Automatically uploads notes and attached files that have not been uploaded to Google Drive yet.
 * Used when connecting or reconnecting Google Drive.
 */
export async function uploadPendingNotesToGoogleDrive(
  accessToken: string,
  notes: any[],
  testTitle?: string,
  onNoteUploaded?: (noteId: string, driveFileId: string, webViewLink: string) => void
): Promise<{ updatedNotes: any[]; uploadedCount: number }> {
  if (!accessToken || !Array.isArray(notes) || notes.length === 0) {
    return { updatedNotes: notes, uploadedCount: 0 };
  }

  // Filter notes that have not yet been assigned a driveFileId
  const unuploaded = notes.filter((n) => !n.driveFileId && (n.content?.trim() || n.fileUrl));
  if (unuploaded.length === 0) {
    return { updatedNotes: notes, uploadedCount: 0 };
  }

  let uploadedCount = 0;
  const updatedMap = new Map<string, any>(notes.map((n) => [n.id, { ...n }]));

  for (const note of unuploaded) {
    try {
      const res = await saveNoteToGoogleDrive(accessToken, note, testTitle);
      if (res.driveFileId) {
        const existing = updatedMap.get(note.id);
        if (existing) {
          existing.driveFileId = res.driveFileId;
          existing.driveWebViewLink = res.webViewLink;
          updatedMap.set(note.id, existing);
          uploadedCount++;
          if (onNoteUploaded) {
            onNoteUploaded(note.id, res.driveFileId, res.webViewLink);
          }
        }
      }
    } catch (err: any) {
      console.warn(`Failed to auto-upload pending note ${note.id} to Drive:`, err);
    }
  }

  const finalNotes = Array.from(updatedMap.values());
  if (uploadedCount > 0) {
    try {
      await syncNotesManifestToGoogleDrive(accessToken, finalNotes, testTitle);
    } catch (e) {
      console.warn('Failed to sync manifest after uploading pending notes:', e);
    }
  }

  return { updatedNotes: finalNotes, uploadedCount };
}

/**
 * Plan C Migration Helper: Cleans up old visible "Mock MC App" folders in the user's visible Drive.
 * Moves legacy folders to trash so the user's Google Drive is completely clean and duplicate-free.
 */
export async function cleanUpLegacyVisibleDriveFolders(
  accessToken: string
): Promise<{ cleanedCount: number }> {
  try {
    const q = "name = 'Mock MC App' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { cleanedCount: 0 };
    const data = await res.json();
    const files = data.files || [];
    let cleanedCount = 0;
    for (const f of files) {
      try {
        await deleteGoogleDriveFile(accessToken, f.id);
        cleanedCount++;
      } catch (e) {
        console.warn(`Failed to delete legacy folder ${f.id}:`, e);
      }
    }
    return { cleanedCount };
  } catch (err) {
    console.warn('Failed to clean up legacy Drive folders:', err);
    return { cleanedCount: 0 };
  }
}

/**
 * Plan C On-Demand Export: Exports a note directly to the user's visible Google Drive (root or Google Docs)
 * if they explicitly want a visible copy outside the private appDataFolder.
 */
export async function exportNoteToVisibleGoogleDrive(
  accessToken: string,
  note: { id: string; content: string; fileName?: string; tag?: string },
  testTitle?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const cleanTitle = getCleanFileName(note.fileName, note.content) || `Study Note - ${(note.tag || 'General').toUpperCase()} (${new Date().toLocaleDateString()})`;
  const sections: DocSection[] = [
    {
      title: cleanTitle,
      body: note.content || 'Study Note Content',
      isHeading: true,
    },
    {
      title: 'Study Metadata',
      body: `Exported from Mock MC App\nDate: ${new Date().toLocaleString()}\nCategory: ${(note.tag || 'General').toUpperCase()}${testTitle ? `\nTest: ${testTitle}` : ''}`,
      isHeading: false,
    },
  ];

  // Creates visible Google Doc directly in the user's Drive root
  const doc = await createGoogleDoc(accessToken, cleanTitle, sections);
  const link = doc.webViewLink || `https://docs.google.com/document/d/${doc.documentId}/edit`;
  return {
    fileId: doc.documentId,
    webViewLink: link,
  };
}

