/**
 * docSynthesizerEngine.ts
 * Structure-Aware Context Synthesizer & Patch Engine for HTML Notes Studio.
 * 
 * Intelligently merges AI generated snippets into existing documents by reading
 * document outlines, detecting container boundaries, preventing heading duplication,
 * and placing content at target locations without nesting or duplicates.
 */

import { buildDocumentOutline, DocumentOutline, DocumentSection } from './docStructureMap';

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

interface SectionBoundaries {
  containerStart: number;
  containerEnd: number;
  contentStart: number;
  contentEnd: number;
  hasContainer: boolean;
  containerTag?: string;
}

/**
 * Robustly resolves the start and end boundaries of a section, including any wrapping
 * container tags (<section>, <div class="panel">, <div class="card">, <article>, etc.).
 */
function resolveSectionBoundaries(
  currentCode: string,
  matchedSection: { startCharIndex: number; level?: number }
): SectionBoundaries {
  const headingStart = currentCode.lastIndexOf('<h', matchedSection.startCharIndex);
  const startIdx = headingStart !== -1 ? headingStart : matchedSection.startCharIndex;

  // Find next heading of same or higher level
  const secLevel = matchedSection.level || 2;
  const nextHeadingRegex = new RegExp(`<h[1-${secLevel}][\\s>]`, 'i');
  const remainingCode = currentCode.substring(startIdx + 10);
  const nextMatch = remainingCode.match(nextHeadingRegex);

  let nextSecIdx = currentCode.length;
  if (nextMatch && nextMatch.index !== undefined) {
    nextSecIdx = startIdx + 10 + nextMatch.index;
  } else {
    const bodyCloseIdx = currentCode.lastIndexOf('</body>');
    if (bodyCloseIdx !== -1 && bodyCloseIdx > startIdx) {
      nextSecIdx = bodyCloseIdx;
    }
  }

  // Check backward for an enclosing container element (<section>, <article>, <div class="panel|card|box">)
  const windowStart = Math.max(0, startIdx - 800);
  const textBefore = currentCode.substring(windowStart, startIdx);
  const containerRegex = /<(section|article|aside|div)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let candidateContainer: { tag: string; start: number; end: number; fullTag: string } | null = null;

  while ((match = containerRegex.exec(textBefore)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const openTagIdx = windowStart + match.index;
    const afterOpenTag = currentCode.substring(openTagIdx + match[0].length, startIdx);

    const isExplicitSectionContainer = tag === 'section' || tag === 'article';
    const isPanelDiv = tag === 'div' && /\b(?:class|id)=["'][^"']*\b(?:panel|card|box|section|slide|sheet|note-section)\b/i.test(attrs);
    const isDirectParent = !afterOpenTag.includes('</' + tag) && afterOpenTag.replace(/<!--[\s\S]*?-->/g, '').trim().length < 160;

    if ((isExplicitSectionContainer || isPanelDiv) && isDirectParent) {
      candidateContainer = {
        tag,
        start: openTagIdx,
        end: openTagIdx + match[0].length,
        fullTag: match[0]
      };
    }
  }

  if (candidateContainer) {
    const containerTag = candidateContainer.tag;
    const closingTag = `</${containerTag}>`;
    const betweenCode = currentCode.substring(startIdx, nextSecIdx);
    const closeIdxInBetween = betweenCode.lastIndexOf(closingTag);

    if (closeIdxInBetween !== -1) {
      const containerEnd = startIdx + closeIdxInBetween + closingTag.length;
      return {
        containerStart: candidateContainer.start,
        containerEnd: containerEnd,
        contentStart: candidateContainer.end,
        contentEnd: startIdx + closeIdxInBetween,
        hasContainer: true,
        containerTag
      };
    }
  }

  return {
    containerStart: startIdx,
    containerEnd: nextSecIdx,
    contentStart: startIdx,
    contentEnd: nextSecIdx,
    hasContainer: false
  };
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

  // If codeToApply is a full complete HTML document
  const isFullSnippet = /^\s*<!DOCTYPE\s+html/i.test(cleanSnippet) || /^\s*<html[\s>]/i.test(cleanSnippet);
  if (isFullSnippet) {
    if (cleanFull.length < 200 || surgicalCommand?.type === 'REWRITE' || cleanSnippet.length > cleanFull.length * 0.8) {
      return cleanSnippet;
    }
    const strippedSnippet = cleanSnippet.replace(/<html[^>]*>|<\/html>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>|<head>[\s\S]*?<\/head>/gi, '').trim();
    return synthesizeCodeIntoDocument({ ...options, codeToApply: strippedSnippet });
  }

  if (surgicalCommand?.type === 'REWRITE') {
    return cleanSnippet;
  }

  const outline = buildDocumentOutline(currentCode, noteTitle);

  // Check if cleanSnippet itself has an outer container tag (<section>, <div class="panel">, etc.)
  const snippetHasContainer = /^\s*<(?:section|article|aside|div)\b[^>]*>[\s\S]*<\/(?:section|article|aside|div)>\s*$/i.test(cleanSnippet);

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
      let matchedSection: DocumentSection | null | undefined = null;

      // 1. Direct ID match (e.g. "sec_4", "section-4")
      matchedSection = outline.sections.find(
        (sec) => sec.id.toLowerCase() === targetId.toLowerCase()
      );

      // 2. Direct Section Number match (e.g. "Section 4", "4", "4. Trigonometric...")
      if (!matchedSection) {
        const numMatch = targetId.match(/(?:section|sec|part|heading)?\s*#?([0-9]+)\b/i);
        if (numMatch && numMatch[1]) {
          const secNum = parseInt(numMatch[1], 10);
          
          // Match by heading text starting with "4." or "4 " or "4:" or "4)"
          matchedSection = outline.sections.find((sec) => {
            const hMatch = (sec.headingText || '').trim().match(/^([0-9]+)[\.\:\)\s]/);
            return hMatch ? parseInt(hMatch[1], 10) === secNum : false;
          });

          // Match by section ID ending with _4 or -4
          if (!matchedSection) {
            matchedSection = outline.sections.find(
              (sec) => sec.id === `sec_${secNum}` || sec.id === `section-${secNum}`
            );
          }

          // Match by non-h1 section ordinal
          if (!matchedSection) {
            const nonH1 = outline.sections.filter((s) => s.level !== 1);
            const ordIdx = secNum - 1;
            if (ordIdx >= 0 && ordIdx < nonH1.length) {
              matchedSection = nonH1[ordIdx];
            } else if (ordIdx >= 0 && ordIdx < outline.sections.length) {
              matchedSection = outline.sections[ordIdx];
            }
          }
        }
      }

      // 3. Fuzzy text and ID matching
      if (!matchedSection) {
        const normTarget = targetId.toLowerCase().replace(/^(section\s*|sec\s*|[0-9]+[\.\:\)\s]+)/gi, '').trim();
        matchedSection = outline.sections.find((sec) => {
          const normHeading = (sec.headingText || '').toLowerCase().replace(/^(section\s*|sec\s*|[0-9]+[\.\:\)\s]+)/gi, '').trim();
          return (
            sec.headingText?.toLowerCase() === targetId.toLowerCase() ||
            (sec.headingText && sec.headingText.toLowerCase().includes(targetId.toLowerCase())) ||
            (targetId && targetId.toLowerCase().includes(sec.headingText?.toLowerCase() || '')) ||
            (normTarget.length > 2 && normHeading.includes(normTarget)) ||
            (normHeading.length > 2 && normTarget.includes(normHeading))
          );
        });
      }

      if (matchedSection) {
        const bounds = resolveSectionBoundaries(currentCode, matchedSection);

        if (type === 'REPLACE_SECTION') {
          if (bounds.hasContainer && !snippetHasContainer) {
            // Replace content inside existing container
            return currentCode.substring(0, bounds.contentStart) + '\n  ' + cleanSnippet + '\n' + currentCode.substring(bounds.contentEnd).trimStart();
          }
          // Cleanly replace the entire container or section block without duplicating
          return currentCode.substring(0, bounds.containerStart) + cleanSnippet + '\n\n' + currentCode.substring(bounds.containerEnd).trimStart();
        } else if (type === 'INSERT_BEFORE_SECTION') {
          return currentCode.substring(0, bounds.containerStart) + cleanSnippet + '\n\n' + currentCode.substring(bounds.containerStart);
        } else if (type === 'INSERT_AFTER_SECTION') {
          return currentCode.substring(0, bounds.containerEnd) + '\n\n' + cleanSnippet + '\n\n' + currentCode.substring(bounds.containerEnd).trimStart();
        } else if (type === 'APPEND_TO_SECTION') {
          const appendPos = bounds.hasContainer ? bounds.contentEnd : bounds.containerEnd;
          return currentCode.substring(0, appendPos) + '\n\n' + cleanSnippet + '\n\n' + currentCode.substring(appendPos).trimStart();
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
  if (typeof targetPointerIndex === 'number' && targetPointerIndex >= 0 && targetPointerIndex <= currentCode.length) {
    const before = currentCode.substring(0, targetPointerIndex);
    const after = currentCode.substring(targetPointerIndex);

    const needsPrefixNL = before && !before.endsWith('\n') ? '\n\n' : '';
    const needsSuffixNL = after && !after.startsWith('\n') ? '\n\n' : '';

    return before + needsPrefixNL + cleanSnippet + needsSuffixNL + after;
  }

  // 2. Section Heading Match & Update (Anti-Duplication)
  const snippetHeadingMatch = cleanSnippet.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
  if (snippetHeadingMatch && snippetHeadingMatch[1]) {
    const snippetHeadingText = snippetHeadingMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();

    if (snippetHeadingText && snippetHeadingText.length > 2) {
      // Find matching section in outline
      const matchedSection = outline.sections.find(
        (sec) =>
          sec.headingText?.toLowerCase() === snippetHeadingText ||
          (sec.headingText && sec.headingText.toLowerCase().includes(snippetHeadingText)) ||
          snippetHeadingText.includes(sec.headingText?.toLowerCase() || '')
      );

      if (matchedSection) {
        const bounds = resolveSectionBoundaries(currentCode, matchedSection);
        if (bounds.hasContainer && !snippetHasContainer) {
          return currentCode.substring(0, bounds.contentStart) + '\n  ' + cleanSnippet + '\n' + currentCode.substring(bounds.contentEnd).trimStart();
        }
        return currentCode.substring(0, bounds.containerStart) + cleanSnippet + '\n\n' + currentCode.substring(bounds.containerEnd).trimStart();
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
