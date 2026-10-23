/**
 * Smart Selection Refiner Utility
 * 
 * Guarantees surgical, non-destructive replacements when refining a selected snippet 
 * of code or text in HTML Notes Studio.
 */

/**
 * Escapes special regex characters in a raw string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes string whitespace for fuzzy matching between rendered preview text and raw HTML
 */
function normalizeSpace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Replaces strictly the selected portion of code/text within fullCode.
 * If exact match fails, attempts whitespace-insensitive and HTML-tag-aware replacements
 * so that preview selection NEVER wipes out the rest of the document!
 */
export function replaceSelectedSnippet(
  fullCode: string,
  selectedText: string | null | undefined,
  aiReplacement: string
): string {
  if (!fullCode) return aiReplacement;
  if (!selectedText || !selectedText.trim()) return fullCode;

  const rawSel = selectedText.trim();
  const rawReplacement = aiReplacement.trim();

  // 1. Direct Exact Match (Editor mode or exact HTML snippet)
  if (fullCode.includes(rawSel)) {
    return fullCode.replace(rawSel, rawReplacement);
  }

  // 2. Direct Substring Match with trim variations
  const selWithoutQuotes = rawSel.replace(/^["']|["']$/g, '');
  if (selWithoutQuotes.length > 3 && fullCode.includes(selWithoutQuotes)) {
    return fullCode.replace(selWithoutQuotes, rawReplacement);
  }

  // 3. Normalized Whitespace Matching (Handles preview rendered text line breaks)
  const normSel = normalizeSpace(rawSel);
  const normFull = normalizeSpace(fullCode);

  if (normSel.length > 5 && normFull.includes(normSel)) {
    // Construct flexible regex that matches rawSel with arbitrary inner HTML whitespace/tags
    const regexPattern = rawSel
      .split(/\s+/)
      .map(word => escapeRegExp(word))
      .join('(?:\\s*|<[^>]+>)*\\s*');

    try {
      const flexRegex = new RegExp(regexPattern, 'i');
      if (flexRegex.test(fullCode)) {
        return fullCode.replace(flexRegex, rawReplacement);
      }
    } catch (e) {
      console.warn('Regex flex match fallback skipped:', e);
    }
  }

  // 4. Single-Word or Small Selection Match
  if (rawSel.length > 2) {
    const wordIdx = fullCode.indexOf(rawSel);
    if (wordIdx !== -1) {
      return fullCode.slice(0, wordIdx) + rawReplacement + fullCode.slice(wordIdx + rawSel.length);
    }
  }

  // 5. Safe Element Container Fallback:
  // If preview selection was plain inner text of a heading or paragraph (e.g. "Matrices & Determinants"),
  // find the HTML tag containing that text and replace inner content rather than wiping the document!
  const textWords = rawSel.split(/\s+/).filter(w => w.length > 2);
  if (textWords.length > 0) {
    for (const word of textWords) {
      const idx = fullCode.indexOf(word);
      if (idx !== -1) {
        // Find surrounding tag block if possible (e.g. <h1...>, <p...>, <li...>)
        const tagStart = fullCode.lastIndexOf('<', idx);
        const tagEnd = fullCode.indexOf('>', idx);
        if (tagStart !== -1 && tagEnd !== -1 && tagEnd > tagStart) {
          const closingTagIdx = fullCode.indexOf('</', tagEnd);
          if (closingTagIdx !== -1 && closingTagIdx - tagStart < 1500) {
            const endOfBlock = fullCode.indexOf('>', closingTagIdx);
            if (endOfBlock !== -1) {
              // Replace content inside this tag block or the block itself
              const block = fullCode.slice(tagStart, endOfBlock + 1);
              // Replace tag contents with AI replacement wrapped appropriately if needed
              if (rawReplacement.startsWith('<')) {
                return fullCode.slice(0, tagStart) + rawReplacement + fullCode.slice(endOfBlock + 1);
              } else {
                // Keep tag shell, replace inner text
                const innerStart = tagEnd + 1;
                return fullCode.slice(0, innerStart) + rawReplacement + fullCode.slice(closingTagIdx);
              }
            }
          }
        }
      }
    }
  }

  // 6. Ultimate Guard Rail:
  // If no safe match was found, APPEND the replacement or prepend it rather than destroying fullCode!
  console.warn('Could not safely isolate selectedText location in full document. Appending replacement cleanly to avoid document loss.');
  return fullCode + '\n\n' + rawReplacement;
}

/**
 * Synthesizes an AI-generated snippet or new/updated section into fullCode.
 * Reads document structure, matches section/heading tags if present, or inserts
 * into the structural frame (before </body> / </main>) rather than wiping the document!
 */
export function integrateSnippetIntoDocument(fullCode: string, codeToApply: string): string {
  if (!fullCode || !fullCode.trim()) {
    return codeToApply;
  }
  if (!codeToApply || !codeToApply.trim()) {
    return fullCode;
  }

  const cleanFull = fullCode.trim();
  const cleanSnippet = codeToApply.trim();

  // If codeToApply is explicitly a full standalone HTML document with <!DOCTYPE html> or <html...>,
  // return cleanSnippet if cleanFull was simple or if user asked for full replacement
  if (/^\s*<!DOCTYPE\s+html/i.test(cleanSnippet) || /^\s*<html[\s>]/i.test(cleanSnippet)) {
    return cleanSnippet;
  }

  // 1. Heading / Section Replacement Detection
  // Extract heading text from snippet (e.g. <h2>Section 2: Matrix Operations</h2> or <h3>...</h3>)
  const headingMatch = cleanSnippet.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
  if (headingMatch && headingMatch[1]) {
    const headingText = headingMatch[1].replace(/<[^>]+>/g, '').trim();
    if (headingText && headingText.length > 2) {
      // Find if fullCode already contains this heading text
      const headingIdx = fullCode.toLowerCase().indexOf(headingText.toLowerCase());
      if (headingIdx !== -1) {
        // Locate starting <h... tag before this heading text
        const tagStart = fullCode.lastIndexOf('<h', headingIdx);
        if (tagStart !== -1) {
          const levelMatch = fullCode.substring(tagStart, tagStart + 5).match(/<h([1-6])/i);
          const level = levelMatch ? levelMatch[1] : '2';

          // Look for next heading of same or higher hierarchy (h1 to h[level])
          const nextHeadingRegex = new RegExp(`<h[1-${level}][\\s>]`, 'i');
          const remaining = fullCode.substring(tagStart + 10);
          const nextMatch = remaining.match(nextHeadingRegex);

          let replaceEnd = fullCode.length;
          if (nextMatch && nextMatch.index !== undefined) {
            replaceEnd = tagStart + 10 + nextMatch.index;
          } else {
            const bodyCloseIdx = fullCode.lastIndexOf('</body>');
            if (bodyCloseIdx !== -1 && bodyCloseIdx > tagStart) {
              replaceEnd = bodyCloseIdx;
            }
          }

          // Replace old section with updated section cleanly!
          return fullCode.substring(0, tagStart) + cleanSnippet + '\n\n' + fullCode.substring(replaceEnd).trimStart();
        }
      }
    }
  }

  // 2. Structural Frame Insertion (Insert before </body> / </main> / </article>)
  if (fullCode.includes('</body>')) {
    return fullCode.replace('</body>', `\n\n${cleanSnippet}\n\n</body>`);
  }

  if (fullCode.includes('</main>')) {
    return fullCode.replace('</main>', `\n\n${cleanSnippet}\n\n</main>`);
  }

  if (fullCode.includes('</article>')) {
    return fullCode.replace('</article>', `\n\n${cleanSnippet}\n\n</article>`);
  }

  // 3. Fallback: Append cleanly to fullCode
  return fullCode + '\n\n' + cleanSnippet;
}

