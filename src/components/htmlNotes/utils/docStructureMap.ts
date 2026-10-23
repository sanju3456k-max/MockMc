/**
 * docStructureMap.ts
 * Token-Optimized Document Map & AST Outline Extractor for HTML Notes Studio.
 * 
 * Provides a lightweight structural outline of HTML documents (headings, sections, IDs, summaries)
 * to Gemini AI to eliminate duplicate headings, enable context-aware editing, and reduce token usage.
 */

export interface DocumentSection {
  id: string;
  type: 'heading' | 'block' | 'table';
  level?: number; // 1 for h1, 2 for h2, 3 for h3...
  headingText?: string;
  startCharIndex: number;
  endCharIndex: number;
  snippetSummary: string; // first 120 chars
}

export interface DocumentOutline {
  title: string;
  totalLength: number;
  totalLines: number;
  sections: DocumentSection[];
  hasKatex: boolean;
  hasTables: boolean;
  hasImages: boolean;
  outlineText: string;
}

/**
 * Parses raw HTML code into a compact structural outline representation.
 * Now includes support for blocks with data-note-id.
 */
export function buildDocumentOutline(code: string, noteTitle: string = 'Untitled Note'): DocumentOutline {
  if (!code) {
    return {
      title: noteTitle,
      totalLength: 0,
      totalLines: 0,
      sections: [],
      hasKatex: false,
      hasTables: false,
      hasImages: false,
      outlineText: 'Document is currently empty.',
    };
  }

  const lines = code.split('\n');
  const totalLength = code.length;
  const totalLines = lines.length;

  const hasKatex = code.includes('$') || code.includes('katex');
  const hasTables = /<table\b/i.test(code);
  const hasImages = /<img\b/i.test(code);

  const sections: DocumentSection[] = [];
  
  // 1. Match Headings (Traditional Sectioning)
  const headingRegex = /<h([1-6])([^>]*)>(.*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(code)) !== null) {
    const level = parseInt(match[1], 10);
    const attributes = match[2] || '';
    const rawHeadingHtml = match[3] || '';
    
    // Extract ID if present (prefer data-note-id)
    const idMatch = attributes.match(/\b(?:data-note-id|id)=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : `sec_${sections.length + 1}`;

    const headingText = rawHeadingHtml.replace(/<[^>]+>/g, '').trim();
    if (!headingText) continue;

    const startCharIndex = match.index;
    const endCharIndex = match.index + match[0].length;

    const afterHeading = code.substring(endCharIndex, endCharIndex + 300);
    const cleanTextAfter = afterHeading.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippetSummary = cleanTextAfter.slice(0, 120);

    sections.push({
      id,
      type: 'heading',
      level,
      headingText,
      startCharIndex,
      endCharIndex,
      snippetSummary,
    });
  }

  // 2. Match Generic Data-Note-ID Blocks (Advanced Sectioning)
  const blockRegex = /<(?:section|div|table|article)[^>]*\bdata-note-id=["']([^"']+)["'][^>]*>/gi;
  while ((match = blockRegex.exec(code)) !== null) {
    const id = match[1];
    // Avoid duplicates if a heading inside a section also has the same ID (unlikely but safe)
    if (sections.some(s => s.id === id)) continue;

    const startCharIndex = match.index;
    const endCharIndex = match.index + match[0].length;
    
    const afterBlock = code.substring(endCharIndex, endCharIndex + 300);
    const cleanTextAfter = afterBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippetSummary = cleanTextAfter.slice(0, 120);

    sections.push({
      id,
      type: match[0].toLowerCase().includes('table') ? 'table' : 'block',
      startCharIndex,
      endCharIndex,
      snippetSummary,
    });
  }

  // Sort sections by their appearance in code
  sections.sort((a, b) => a.startCharIndex - b.startCharIndex);

  // Format compact text summary of the document structure
  let outlineText = `DOCUMENT MAP FOR "${noteTitle}" (Stable IDs enabled):\n`;
  if (sections.length === 0) {
    outlineText += `- No explicit HTML headings or tagged blocks found.\n`;
  } else {
    sections.forEach((sec) => {
      const indent = sec.level ? '  '.repeat(sec.level - 1) : '  ';
      const typeLabel = sec.type.toUpperCase();
      const contentDesc = sec.headingText ? `[HEADING] "${sec.headingText}"` : `[CONTENT] "${sec.snippetSummary}..."`;
      outlineText += `${indent}- ${contentDesc} (data-note-id: "${sec.id}")\n`;
    });
  }

  return {
    title: noteTitle,
    totalLength,
    totalLines,
    sections,
    hasKatex,
    hasTables,
    hasImages,
    outlineText,
  };
}

/**
 * Ensures all major blocks in the HTML have a unique data-note-id for AI targeting.
 */
export function ensureStableBlockIds(html: string): string {
  if (!html) return html;

  // 1. Tag sections, articles, and tables that don't have IDs
  let updatedHtml = html.replace(/<(section|article|table)(?![^>]*\b(?:data-note-id|id)=)/gi, (match, tag) => {
    const id = `block_${Math.random().toString(36).substring(2, 9)}`;
    return `<${tag} data-note-id="${id}"`;
  });

  // 2. Tag headings that don't have IDs
  updatedHtml = updatedHtml.replace(/<(h[1-6])(?![^>]*\b(?:data-note-id|id)=)/gi, (match, tag) => {
    const id = `head_${Math.random().toString(36).substring(2, 9)}`;
    return `<${tag} data-note-id="${id}"`;
  });

  return updatedHtml;
}

/**
 * Determines whether user prompt explicitly requests reading full raw code/file.
 */
export function isFullDocumentRequest(promptText: string): boolean {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return (
    lower.includes('read full') ||
    lower.includes('full code') ||
    lower.includes('entire document') ||
    lower.includes('whole note') ||
    lower.includes('complete file') ||
    lower.includes('rewrite full') ||
    lower.includes('full text')
  );
}
