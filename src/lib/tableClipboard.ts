/**
 * Utility to copy tables and formatted text to clipboard with full Google Docs & Sheets fidelity.
 * Ensures tables paste into Google Docs, Google Sheets, MS Word, Apple Pages, and Notion
 * as structured, editable tables with real columns, rows, and headers instead of raw pipe text.
 */

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function splitRow(row: string): string[] {
  let trimmed = row.trim();
  if (trimmed.includes('\t') && !trimmed.includes('|')) {
    return trimmed.split('\t').map((c) => c.trim());
  }
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const rawCells = trimmed.split(/(?<!\\)\|/);
  return rawCells.map((c) => c.replace(/\\\|/g, '|').trim());
}

function cleanCellTextForTsv(cell: string): string {
  let clean = (cell || '').trim();
  if (!clean) return '';

  // Clean stars
  clean = clean.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, n) => {
    const num = parseFloat(n) || 0;
    const full = Math.min(5, Math.max(0, Math.floor(num)));
    const hasHalf = num % 1 >= 0.4 && num % 1 <= 0.8;
    const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
    return '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(empty) + ` (${num}/5)`;
  });

  // Clean progress bars
  clean = clean.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, val) => `${val}%`);

  // Clean trend badges
  clean = clean.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, tVal) => {
    const t = tVal.trim().toLowerCase();
    if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) return `▲ ${tVal.trim()}`;
    if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) return `▼ ${tVal.trim()}`;
    return `▬ ${tVal.trim()}`;
  });

  // Clean color tags
  clean = clean.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\]\s*([^<]*)/gi, (_, _color, textAfter) => textAfter.trim());

  // Clean markdown bold and code
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
  clean = clean.replace(/`([^`]+)`/g, '$1');

  // Strip tabs and newlines inside cell for clean TSV
  clean = clean.replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ');

  return clean;
}

function formatCellForHtml(cell: string): string {
  let clean = (cell || '').trim();
  if (!clean) return '&nbsp;';

  // Format images inside cells
  clean = clean.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<img src="${src.trim()}" alt="${escapeHtml(alt || 'Image')}" style="max-height: 80px; max-width: 120px; vertical-align: middle; border-radius: 4px;" />`;
  });

  // Format star badges: [stars:4] -> Unicode stars
  clean = clean.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, n) => {
    const num = parseFloat(n) || 0;
    const full = Math.min(5, Math.max(0, Math.floor(num)));
    const hasHalf = num % 1 >= 0.4 && num % 1 <= 0.8;
    const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
    const starsStr = '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(empty);
    return `${starsStr} (${num}/5)`;
  });

  // Format progress bars: [bar:80%] -> 80%
  clean = clean.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, val) => `${val}%`);

  // Format trend badges
  clean = clean.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, tVal) => {
    const t = tVal.trim().toLowerCase();
    if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) {
      return `▲ ${escapeHtml(tVal.trim())}`;
    } else if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) {
      return `▼ ${escapeHtml(tVal.trim())}`;
    }
    return `▬ ${escapeHtml(tVal.trim())}`;
  });

  // Clean color tags
  clean = clean.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\]\s*([^<]*)/gi, (_, _colorName, textAfter) => {
    const label = textAfter.trim();
    if (!label) return '';
    return escapeHtml(label);
  });

  // Markdown bold & code
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  clean = clean.replace(/`([^`]+)`/g, '<code style="font-family: Consolas, Monaco, monospace; color: #1e293b; background-color: #f1f5f9; padding: 2px 4px; border-radius: 3px;">$1</code>');
  clean = clean.replace(/\n/g, '<br />');

  return clean;
}

/**
 * Builds standard Google Docs / Word compliant HTML and TSV from a markdown table
 */
export function buildTableHtmlAndTsv(rawTable: string): { html: string; tsv: string } {
  const lines = rawTable
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') || (l.includes('|') && l.split('|').length >= 2) || (l.includes('\t') && l.split('\t').length >= 2));

  if (lines.length === 0) return { html: '', tsv: '' };

  const isSeparatorLine = (s: string) => /^\|?[\s:+\-|]+\|?$/.test(s) && s.includes('-') && (s.includes('|') || s.includes('+'));

  const headers = splitRow(lines[0]);
  const hasSep = lines.length >= 2 && isSeparatorLine(lines[1]);
  const startIdx = hasSep ? 2 : 1;
  const bodyRows = lines.slice(startIdx);

  const alignments = hasSep
    ? splitRow(lines[1]).map((c) => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        return 'left';
      })
    : headers.map(() => 'left');

  // 1. Build Google Docs & Word compliant HTML table
  let tableHtml = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #cbd5e1; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.5; color: #0f172a; margin: 12px 0;">`;
  tableHtml += `<thead><tr style="background-color: #f1f5f9;">`;
  headers.forEach((h, idx) => {
    const align = alignments[idx] || 'left';
    tableHtml += `<th style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: ${align}; background-color: #f1f5f9; color: #0f172a; font-weight: 700;">${formatCellForHtml(h)}</th>`;
  });
  tableHtml += `</tr></thead><tbody>`;

  bodyRows.forEach((rStr) => {
    if (isSeparatorLine(rStr)) return;
    const cells = splitRow(rStr);
    if (cells.length === 0 || (cells.length === 1 && !cells[0])) return;
    tableHtml += `<tr>`;
    cells.forEach((cell, idx) => {
      const align = alignments[idx] || 'left';
      tableHtml += `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: ${align}; vertical-align: top; color: #1e293b;">${formatCellForHtml(cell)}</td>`;
    });
    tableHtml += `</tr>`;
  });
  tableHtml += `</tbody></table>`;

  // 2. Build TSV string for spreadsheet and plain-text fallback
  const tsvRows: string[] = [];
  tsvRows.push(headers.map(cleanCellTextForTsv).join('\t'));
  bodyRows.forEach((rStr) => {
    if (isSeparatorLine(rStr)) return;
    const cells = splitRow(rStr);
    if (cells.length === 0 || (cells.length === 1 && !cells[0])) return;
    tsvRows.push(cells.map(cleanCellTextForTsv).join('\t'));
  });
  const tsv = tsvRows.join('\n');

  return { html: tableHtml, tsv };
}

/**
 * Copies a standalone markdown table to clipboard with full HTML and TSV representation.
 * Guarantees that pasting into Google Docs or Sheets creates a formatted table grid.
 */
export async function copyTableToClipboard(rawTable: string): Promise<boolean> {
  if (!rawTable) return false;

  const { html, tsv } = buildTableHtmlAndTsv(rawTable);
  if (!html) {
    try {
      await navigator.clipboard.writeText(rawTable);
      return true;
    } catch {
      return false;
    }
  }

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`;

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([tsv || rawTable], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch (e) {
      console.warn('ClipboardItem write error:', e);
    }
  }

  try {
    await navigator.clipboard.writeText(tsv || rawTable);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts data URI to binary Blob for native image clipboard pasting (Google Docs, Word, Slack, etc.)
 */
export function dataUriToBlob(dataUri: string): Blob | null {
  try {
    const parts = dataUri.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch (e) {
    console.warn('Failed to convert dataUri to Blob:', e);
    return null;
  }
}

/**
 * Cleans plain text for clipboard fallback by replacing messy base64 data URIs with human-readable tags
 */
export function cleanPlainTextForClipboard(text: string): string {
  if (!text) return '';
  let clean = text;
  // Replace long base64 markdown images with clean readable tags
  clean = clean.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/gi, (_, alt) => {
    return `[Image: ${alt || 'Visual Diagram'}]`;
  });
  // Strip raw python plot execution code
  clean = clean.replace(/```(?:python|py)?\s*[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/gi, '');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  return clean.trim();
}

/**
 * Converts a markdown document into rich HTML for clipboard pasting with full image support
 */
export function convertMarkdownToRichHtml(markdown: string, additionalImages?: string[]): string {
  if (!markdown && (!additionalImages || additionalImages.length === 0)) return '';

  const lines = (markdown || '').split('\n');
  const output: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  // If additional images exist (e.g. from generatedImages array) and not already embedded
  if (additionalImages && additionalImages.length > 0) {
    additionalImages.forEach((imgUri, idx) => {
      if (imgUri && !markdown.includes(imgUri)) {
        output.push(`<div style="text-align: center; margin: 16px 0;"><img src="${imgUri}" alt="Figure ${idx + 1}" style="max-width: 100%; max-height: 540px; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-block;" /></div>`);
      }
    });
  }

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const { html } = buildTableHtmlAndTsv(tableLines.join('\n'));
    if (html) {
      output.push(html);
    } else {
      tableLines.forEach((l) => output.push(`<p>${formatCellForHtml(l)}</p>`));
    }
    tableLines = [];
  };

  const flushCodeBlock = () => {
    if (codeBlockLines.length === 0) return;
    const rawBlock = codeBlockLines.join('\n');
    const isPlottingCode = /matplotlib|plt\.|savefig|figure|seaborn|sns\.|numpy|np\./i.test(rawBlock);
    // If it's pure matplotlib/plotting code and we have visual diagrams or explanations, omit it from clipboard HTML
    if (isPlottingCode && ((additionalImages && additionalImages.length > 0) || /!\[.*?\]\(.+?\)|<img/i.test(markdown))) {
      codeBlockLines = [];
      return;
    }
    const code = escapeHtml(rawBlock);
    output.push(`<pre style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-family: Consolas, Monaco, monospace; font-size: 12px; overflow-x: auto; border: 1px solid #e2e8f0;"><code>${code}</code></pre>`);
    codeBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        if (inTable) {
          flushTable();
          inTable = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Markdown Images anywhere on the line: ![alt](src)
    if (/!\[.*?\]\(.+?\)/.test(trimmed)) {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      const renderedImgLine = trimmed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        return `<div style="text-align: center; margin: 16px 0;"><img src="${src.trim()}" alt="${escapeHtml(alt || 'Visual Diagram')}" style="max-width: 100%; max-height: 520px; border-radius: 8px; border: 1px solid #e2e8f0;" /></div>`;
      });
      output.push(renderedImgLine);
      continue;
    }

    // Tables
    const isTableRow =
      (trimmed.startsWith('|') && (trimmed.endsWith('|') || trimmed.includes('|', 1))) ||
      (/^\|?[\s:+\-|]+\|?$/.test(trimmed) && trimmed.includes('-'));

    if (isTableRow) {
      if (!inTable) inTable = true;
      tableLines.push(trimmed);
      continue;
    } else {
      if (inTable) {
        flushTable();
        inTable = false;
      }
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      output.push(`<h3 style="font-size: 15px; font-weight: bold; margin: 14px 0 6px 0; color: #0f172a;">${formatCellForHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      output.push(`<h2 style="font-size: 17px; font-weight: bold; margin: 16px 0 8px 0; color: #0f172a;">${formatCellForHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      output.push(`<h1 style="font-size: 20px; font-weight: bold; margin: 18px 0 10px 0; color: #0f172a;">${formatCellForHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bulletText = trimmed.replace(/^[-*•]\s+/, '');
      output.push(`<li style="margin-left: 20px; line-height: 1.6; color: #1e293b;">${formatCellForHtml(bulletText)}</li>`);
    } else if (trimmed.length > 0) {
      output.push(`<p style="margin: 8px 0; line-height: 1.6; color: #1e293b;">${formatCellForHtml(trimmed)}</p>`);
    }
  }

  if (inTable) flushTable();
  if (inCodeBlock) flushCodeBlock();

  return output.join('\n');
}

/**
 * Copies a visual image artifact directly to the clipboard with PNG binary data & rich HTML.
 * Pasting in Google Docs, Word, Slack, etc. pastes the actual visual image rather than base64 text.
 */
export async function copyImageToClipboard(
  dataUri: string,
  title?: string,
  companionText?: string
): Promise<boolean> {
  if (!dataUri) return false;

  const alt = escapeHtml(title || 'Visual Diagram');
  const cleanCompanion = (companionText || '')
    .replace(/```python[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '')
    .trim();

  const companionHtml = cleanCompanion
    ? `<div style="margin-top: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${convertMarkdownToRichHtml(cleanCompanion)}</div>`
    : '';

  const htmlFragment = `<div style="text-align: center; margin: 12px 0;"><img src="${dataUri}" alt="${alt}" style="max-width: 100%; max-height: 600px; border-radius: 8px;" />${companionHtml}</div>`;
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${htmlFragment}<!--EndFragment--></body></html>`;

  const plainText = cleanCompanion
    ? `[Visual Graphic: ${title || 'Diagram'}]\n\n${cleanPlainTextForClipboard(cleanCompanion)}`
    : `[Visual Graphic: ${title || 'Diagram'}]`;

  // 1. Try copying real image blob (image/png) + rich HTML + plain text
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const clipboardData: Record<string, Blob> = {
        'text/html': blobHtml,
        'text/plain': blobText,
      };

      const imgBlob = dataUriToBlob(dataUri);
      if (imgBlob && imgBlob.type.startsWith('image/')) {
        // ClipboardItem in Chromium browsers supports image/png natively
        if (imgBlob.type === 'image/png') {
          clipboardData['image/png'] = imgBlob;
        }
      }

      const item = new ClipboardItem(clipboardData);
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.warn('ClipboardItem write with image/png failed, attempting text/html fallback:', err);
      try {
        const blobHtml = new Blob([fullHtml], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        });
        await navigator.clipboard.write([item]);
        return true;
      } catch (err2) {
        console.warn('Fallback HTML copy failed:', err2);
      }
    }
  }

  // Fallback
  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch (e) {
    console.warn('Failed to copy to clipboard:', e);
    return false;
  }
}

/**
 * Copies mixed markdown, assistant responses, or notes to clipboard.
 * Converts tables, formulas, and embedded images into rich HTML and clean plain text.
 */
export async function copyFormattedTextToClipboard(
  text: string,
  options?: { generatedImages?: string[]; title?: string }
): Promise<boolean> {
  if (!text && (!options?.generatedImages || options.generatedImages.length === 0)) return false;

  const trimmed = (text || '').trim();
  // Check if text is exclusively a single table
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const isPureTable =
    !options?.generatedImages?.length &&
    lines.length >= 2 &&
    lines.every((l) => l.startsWith('|') || /^\|?[\s:+\-|]+\|?$/.test(l));

  if (isPureTable) {
    return copyTableToClipboard(trimmed);
  }

  // If message has images or python plotting scripts, clean the text for presentation
  let contentToProcess = trimmed;
  const hasImages = Boolean(
    (options?.generatedImages && options.generatedImages.length > 0) ||
    /!\[.*?\]\([^)]+\)|<img\s+[^>]*src=|data:image\//i.test(contentToProcess)
  );

  if (hasImages || /```(?:python|py)?\s*[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/i.test(contentToProcess)) {
    const textWithoutPython = contentToProcess
      .replace(/```(?:python|py)?\s*[\s\S]*?(?:matplotlib|plt|figure|plot|sns|savefig|np\.)[\s\S]*?```/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (textWithoutPython) {
      contentToProcess = textWithoutPython;
    } else if (hasImages) {
      contentToProcess = '';
    }
  }

  const htmlContent = convertMarkdownToRichHtml(contentToProcess, options?.generatedImages);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${htmlContent}<!--EndFragment--></body></html>`;

  // Build clean plain text without huge base64 code dumps
  let cleanPlain = cleanPlainTextForClipboard(contentToProcess);
  if (options?.generatedImages && options.generatedImages.length > 0) {
    const imgLabels = options.generatedImages.map((_, i) => `[Visual Figure ${i + 1}]`).join('\n');
    cleanPlain = cleanPlain ? `${imgLabels}\n\n${cleanPlain}` : imgLabels;
  }

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([cleanPlain || trimmed], { type: 'text/plain' });
      const clipboardData: Record<string, Blob> = {
        'text/html': blobHtml,
        'text/plain': blobText,
      };

      // If single generated image is present, attach image/png binary directly for direct image pasting
      if (options?.generatedImages && options.generatedImages.length === 1) {
        const firstImg = options.generatedImages[0];
        if (firstImg.startsWith('data:image/png')) {
          const imgBlob = dataUriToBlob(firstImg);
          if (imgBlob) {
            clipboardData['image/png'] = imgBlob;
          }
        }
      }

      const item = new ClipboardItem(clipboardData);
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Fallback
    }
  }

  try {
    await navigator.clipboard.writeText(cleanPlain || trimmed);
    return true;
  } catch (e) {
    console.warn('Failed to copy to clipboard:', e);
    return false;
  }
}
