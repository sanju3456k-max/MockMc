/**
 * docSynthesizerEngine.ts
 * Structure-Aware Context Synthesizer & Patch Engine for HTML Notes Studio.
 * 
 * Intelligently merges AI generated snippets into existing documents by reading
 * document outlines, preventing heading duplication, and placing content at target locations.
 */

import { buildDocumentOutline, DocumentOutline } from './docStructureMap';

export interface SynthesizeOptions {
  currentCode: string;
  codeToApply: string;
  noteTitle?: string;
  targetPointerIndex?: number | null; // Exact character position if right-clicked or cursor focused
  surgicalCommand?: {
    type: 'REPLACE_SECTION' | 'INSERT_BEFORE_SECTION' | 'INSERT_AFTER_SECTION' | 'APPEND_TO_SECTION' | 'INSERT_AT_END' | 'REPLACE_BLOCK' | 'DELETE_BLOCK' | 'REWRITE';
    targetId?: string;
  } | null;
}

/**
 * Merges and synthesizes new code into currentCode using structural matching and anti-duplication rules.
 */
export function synthesizeCodeIntoDocument(options: SynthesizeOptions): string {
  const { currentCode, codeToApply, noteTitle, targetPointerIndex, surgicalCommand } = options;

  if (!currentCode || !currentCode.trim()) {
    return codeToApply;
  }
  if (!codeToApply || !codeToApply.trim()) {
    return currentCode;
  }

  const cleanFull = currentCode.trim();
  const cleanSnippet = codeToApply.trim();

  // If codeToApply is a full complete HTML document (e.g. contains <!DOCTYPE html> or <html...>),
  // return cleanSnippet if cleanFull was minimal or user explicitly requested full rewrite via structural command
  // But be careful: if snippet is much smaller than current, it's probably NOT a full rewrite even if it has html tags
  const isFullSnippet = /^\s*<!DOCTYPE\s+html/i.test(cleanSnippet) || /^\s*<html[\s>]/i.test(cleanSnippet);
  if (isFullSnippet) {
    if (cleanFull.length < 200 || surgicalCommand?.type === 'REWRITE' || cleanSnippet.length > cleanFull.length * 0.8) {
      return cleanSnippet;
    }
    // If it's a small snippet but has HTML tags, strip them and proceed to surgical placement
    const strippedSnippet = cleanSnippet.replace(/<html[^>]*>|<\/html>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>|<head>[\s\S]*?<\/head>/gi, '').trim();
    return synthesizeCodeIntoDocument({ ...options, codeToApply: strippedSnippet });
  }

  if (surgicalCommand?.type === 'REWRITE') {
    return cleanSnippet;
  }

  const outline = buildDocumentOutline(currentCode, noteTitle);

  // 0. Explicit Surgical Command Mode (AI directed)
  if (surgicalCommand) {
    const { type, targetId } = surgicalCommand;
    
    if (type === 'INSERT_AT_END') {
      const bodyCloseIdx = currentCode.lastIndexOf('</body>');
      if (bodyCloseIdx !== -1) {
        return currentCode.substring(0, bodyCloseIdx) + `\n\n${cleanSnippet}\n\n` + currentCode.substring(bodyCloseIdx);
      }
      return currentCode + '\n\n' + cleanSnippet;
    }

    if (targetId) {
      // 1. Check direct ordinal reference (e.g. "Section 1", "Section 3", "1st section", "3rd section")
      let matchedSection = null;
      const ordinalMatch = targetId.match(/(?:section|sec|part|heading)?\s*#?([0-9]+)(?:st|nd|rd|th)?(?:\s*section)?/i);
      if (ordinalMatch && ordinalMatch[1]) {
        const secIndex = parseInt(ordinalMatch[1], 10) - 1;
        if (secIndex >= 0 && secIndex < outline.sections.length) {
          matchedSection = outline.sections[secIndex];
        }
      }

      // 2. Fuzzy text and ID matching
      if (!matchedSection) {
        const normTarget = targetId.toLowerCase().replace(/^(section\s*|sec\s*|[0-9]+[\.\:\)\s]+)/gi, '').trim();
        matchedSection = outline.sections.find(
          (sec) => {
            const normHeading = sec.headingText.toLowerCase().replace(/^(section\s*|sec\s*|[0-9]+[\.\:\)\s]+)/gi, '').trim();
            return (
              sec.id.toLowerCase() === targetId.toLowerCase() ||
              sec.headingText.toLowerCase() === targetId.toLowerCase() ||
              sec.headingText.toLowerCase().includes(targetId.toLowerCase()) ||
              targetId.toLowerCase().includes(sec.headingText.toLowerCase()) ||
              (normTarget.length > 2 && normHeading.includes(normTarget)) ||
              (normHeading.length > 2 && normTarget.includes(normHeading))
            );
          }
        );
      }

      if (matchedSection) {
        const startIdx = currentCode.lastIndexOf('<h', matchedSection.startCharIndex);
        if (startIdx !== -1) {
          // Find next heading of same or higher level
          const nextHeadingRegex = new RegExp(`<h[1-${matchedSection.level}][\\s>]`, 'i');
          const remainingCode = currentCode.substring(startIdx + 10);
          const nextMatch = remainingCode.match(nextHeadingRegex);

          let endIdx = currentCode.length;
          if (nextMatch && nextMatch.index !== undefined) {
            endIdx = startIdx + 10 + nextMatch.index;
          } else {
            const bodyCloseIdx = currentCode.lastIndexOf('</body>');
            if (bodyCloseIdx !== -1 && bodyCloseIdx > startIdx) {
              endIdx = bodyCloseIdx;
            }
          }

          if (type === 'REPLACE_SECTION') {
            return currentCode.substring(0, startIdx) + cleanSnippet + '\n\n' + currentCode.substring(endIdx).trimStart();
          } else if (type === 'INSERT_BEFORE_SECTION') {
            return currentCode.substring(0, startIdx) + cleanSnippet + '\n\n' + currentCode.substring(startIdx);
          } else if (type === 'INSERT_AFTER_SECTION') {
            return currentCode.substring(0, endIdx) + '\n\n' + cleanSnippet + '\n\n' + currentCode.substring(endIdx).trimStart();
          } else if (type === 'APPEND_TO_SECTION') {
             // Logic to append inside the section before the next heading
             return currentCode.substring(0, endIdx) + '\n\n' + cleanSnippet + '\n\n' + currentCode.substring(endIdx).trimStart();
          }
        }
      }

      // Handle Generic Blocks (div, section, table, etc. with data-note-id)
      if (type === 'REPLACE_BLOCK' || type === 'DELETE_BLOCK') {
        const blockMatch = currentCode.match(new RegExp(`(<(?:section|div|table|article)[^>]*\\bdata-note-id=["']${targetId}["'][^>]*>)([\\s\\S]*?)(</(?:section|div|table|article)>)`, 'i'));
        if (blockMatch && blockMatch.index !== undefined) {
          const startIdx = blockMatch.index;
          const endIdx = blockMatch.index + blockMatch[0].length;
          
          if (type === 'DELETE_BLOCK') {
            return currentCode.substring(0, startIdx) + currentCode.substring(endIdx).trimStart();
          }
          return currentCode.substring(0, startIdx) + cleanSnippet + currentCode.substring(endIdx);
        }
      }
    }
  }

  // 1. Pointer / Cursor Placement Mode
  // If targetPointerIndex was provided (e.g. user right-clicked and selected "Insert Topic Here with AI")
  if (typeof targetPointerIndex === 'number' && targetPointerIndex >= 0 && targetPointerIndex <= currentCode.length) {
    const before = currentCode.substring(0, targetPointerIndex);
    const after = currentCode.substring(targetPointerIndex);

    const needsPrefixNL = before && !before.endsWith('\n') ? '\n\n' : '';
    const needsSuffixNL = after && !after.startsWith('\n') ? '\n\n' : '';

    return before + needsPrefixNL + cleanSnippet + needsSuffixNL + after;
  }

  // 2. Section Heading Match & Update (Anti-Duplication)
  // Extract heading text from cleanSnippet
  const snippetHeadingMatch = cleanSnippet.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
  if (snippetHeadingMatch && snippetHeadingMatch[1]) {
    const snippetHeadingText = snippetHeadingMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();

    if (snippetHeadingText && snippetHeadingText.length > 2) {
      // Find matching section in outline
      const matchedSection = outline.sections.find(
        (sec) =>
          sec.headingText.toLowerCase() === snippetHeadingText ||
          sec.headingText.toLowerCase().includes(snippetHeadingText) ||
          snippetHeadingText.includes(sec.headingText.toLowerCase())
      );

      if (matchedSection) {
        // Find section boundary start and end in currentCode
        const startIdx = currentCode.lastIndexOf('<h', matchedSection.startCharIndex);
        if (startIdx !== -1) {
          // Find next heading of same or higher level
          const nextHeadingRegex = new RegExp(`<h[1-${matchedSection.level}][\\s>]`, 'i');
          const remainingCode = currentCode.substring(startIdx + 10);
          const nextMatch = remainingCode.match(nextHeadingRegex);

          let endIdx = currentCode.length;
          if (nextMatch && nextMatch.index !== undefined) {
            endIdx = startIdx + 10 + nextMatch.index;
          } else {
            const bodyCloseIdx = currentCode.lastIndexOf('</body>');
            if (bodyCloseIdx !== -1 && bodyCloseIdx > startIdx) {
              endIdx = bodyCloseIdx;
            }
          }

          // Replace existing section cleanly with updated section
          return currentCode.substring(0, startIdx) + cleanSnippet + '\n\n' + currentCode.substring(endIdx).trimStart();
        }
      }
    }
  }

  // 3. Common-Sense Location Placement before </body> or </main>
  if (currentCode.includes('</body>')) {
    return currentCode.replace('</body>', `\n\n${cleanSnippet}\n\n</body>`);
  }

  if (currentCode.includes('</main>')) {
    return currentCode.replace('</main>', `\n\n${cleanSnippet}\n\n</main>`);
  }

  if (currentCode.includes('</article>')) {
    return currentCode.replace('</article>', `\n\n${cleanSnippet}\n\n</article>`);
  }

  // 4. Default Fallback
  return currentCode + '\n\n' + cleanSnippet;
}
