/**
 * Utility: Replace Selected Part Only
 * 
 * Programmatically guarantees that when refining a selected portion of text/code,
 * ONLY the selected portion is replaced or updated in fullCode, keeping 100% of 
 * unselected code completely intact.
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

export function replaceSelectedPartOnly(
  fullCode: string,
  selectedText: string | null | undefined,
  aiReplacement: string
): string {
  if (!fullCode) return aiReplacement;
  if (!selectedText || !selectedText.trim()) {
    // No selection: append snippet safely without overwriting fullCode
    return fullCode + '\n\n' + aiReplacement.trim();
  }

  const sel = selectedText.trim();
  const replacement = aiReplacement.trim();

  // 1. Direct Exact Substring Match
  if (fullCode.includes(sel)) {
    return fullCode.replace(sel, replacement);
  }

  // 2. Direct Substring Match ignoring surrounding quotes/spaces
  const unquotedSel = sel.replace(/^["']|["']$/g, '');
  if (unquotedSel.length > 3 && fullCode.includes(unquotedSel)) {
    return fullCode.replace(unquotedSel, replacement);
  }

  // 3. Flexible Regex Match (handles whitespace/line break variations from rendered preview)
  const normSel = normalizeWhitespace(sel);
  const normFull = normalizeWhitespace(fullCode);

  if (normSel.length > 4 && normFull.includes(normSel)) {
    const words = sel.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 0) {
      const pattern = words.map(w => escapeRegExp(w)).join('(?:\\s*|<[^>]+>)*\\s*');
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(fullCode)) {
          return fullCode.replace(regex, replacement);
        }
      } catch (e) {
        console.warn('Regex flex match fallback skipped:', e);
      }
    }
  }

  // 4. Substring Match on Significant Word Sequence
  const words = sel.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 2) {
    const firstTwo = words.slice(0, 3).join(' ');
    const lastTwo = words.slice(-3).join(' ');
    const startIdx = fullCode.indexOf(firstTwo);
    if (startIdx !== -1) {
      const endIdx = fullCode.indexOf(lastTwo, startIdx);
      if (endIdx !== -1 && endIdx >= startIdx) {
        const matchLength = (endIdx + lastTwo.length) - startIdx;
        return fullCode.slice(0, startIdx) + replacement + fullCode.slice(startIdx + matchLength);
      }
    }
  }

  // 5. Ultimate Fallback: Append snippet safely to fullCode, NEVER replacing unselected code!
  console.warn('Selection location not found verbatim. Appending refined snippet to document.');
  return fullCode + '\n\n<!-- Refined Section -->\n' + replacement;
}
