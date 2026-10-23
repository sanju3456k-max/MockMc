/**
 * htmlSelectionMapper.ts
 * High-accuracy bidirectional mapping between rendered HTML preview selections
 * and source code lines/character ranges in the editor.
 */

export interface LineRangeMatch {
  start: number;
  end: number;
  charStart?: number;
  charEnd?: number;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes HTML entities and whitespace for matching
 */
function normalizeForMatch(str: string): string {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the exact line range (0-indexed) in the source HTML code
 * corresponding to text selected in the rendered preview.
 */
export function findMatchingLineRangeInHtml(
  code: string,
  selectedText: string
): LineRangeMatch | null {
  if (!code || !selectedText) return null;
  const clean = selectedText.trim();
  if (clean.length < 2) return null;

  const normClean = normalizeForMatch(clean);
  const lines = code.split('\n');

  // Strategy 1: Exact whole-phrase substring search in code
  const exactIdx = code.toLowerCase().indexOf(clean.toLowerCase());
  if (exactIdx !== -1) {
    const charStart = exactIdx;
    const charEnd = exactIdx + clean.length;
    const startLine = code.substring(0, charStart).split('\n').length - 1;
    const endLine = code.substring(0, charEnd).split('\n').length - 1;
    return { start: startLine, end: endLine, charStart, charEnd };
  }

  // Strategy 1b: Normalized substring search
  const normCode = normalizeForMatch(code);
  if (normCode.toLowerCase().includes(normClean.toLowerCase())) {
    // If it matches normalized, we need to find the approximate location in the raw code
    const words = normClean.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      const firstWord = words[0];
      const firstIdx = code.toLowerCase().indexOf(firstWord.toLowerCase());
      if (firstIdx !== -1) {
        // Find approximate end by looking for the last word
        const lastWord = words[words.length - 1];
        const lastIdx = code.toLowerCase().indexOf(lastWord.toLowerCase(), firstIdx);
        if (lastIdx !== -1) {
          const charStart = firstIdx;
          const charEnd = lastIdx + lastWord.length;
          const startLine = code.substring(0, charStart).split('\n').length - 1;
          const endLine = code.substring(0, charEnd).split('\n').length - 1;
          return { start: startLine, end: endLine, charStart, charEnd };
        }
      }
    }
  }

  // Strategy 2: Single line exact match (handles case-insensitive trimmed line occurrences)
  const singleLineMatches: number[] = [];
  lines.forEach((line, idx) => {
    const normLine = normalizeForMatch(line);
    if (normLine.toLowerCase().includes(normClean.toLowerCase()) || line.toLowerCase().includes(clean.toLowerCase())) {
      singleLineMatches.push(idx);
    }
  });

  if (singleLineMatches.length === 1) {
    const lineIdx = singleLineMatches[0];
    let lineCharStart = 0;
    for (let i = 0; i < lineIdx; i++) {
      lineCharStart += lines[i].length + 1;
    }
    const matchIdxInLine = lines[lineIdx].toLowerCase().indexOf(clean.toLowerCase());
    const charStart = matchIdxInLine !== -1 ? lineCharStart + matchIdxInLine : lineCharStart;
    const charEnd = matchIdxInLine !== -1 ? charStart + clean.length : lineCharStart + lines[lineIdx].length;
    return { start: lineIdx, end: lineIdx, charStart, charEnd };
  } else if (singleLineMatches.length > 1) {
    // Score based on structural prominence (heading tags, panels, exact length)
    let bestIdx = singleLineMatches[0];
    let bestScore = -1;
    singleLineMatches.forEach(idx => {
      const line = lines[idx];
      let score = 0;
      if (/<h[1-6]/i.test(line)) score += 25;
      if (/<p/i.test(line)) score += 12;
      if (/class="[^"]*panel/i.test(line)) score += 18;
      if (/<section/i.test(line)) score += 10;
      if (line.trim().length === clean.length) score += 30;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    let lineCharStart = 0;
    for (let i = 0; i < bestIdx; i++) {
      lineCharStart += lines[i].length + 1;
    }
    const matchIdxInLine = lines[bestIdx].toLowerCase().indexOf(clean.toLowerCase());
    const charStart = matchIdxInLine !== -1 ? lineCharStart + matchIdxInLine : lineCharStart;
    const charEnd = matchIdxInLine !== -1 ? charStart + clean.length : lineCharStart + lines[bestIdx].length;
    return { start: bestIdx, end: bestIdx, charStart, charEnd };
  }

  // Strategy 3: Tag-tolerant multi-word sequence match in code
  // Handles cases where text in rendered preview spans inline tags like <em>, <strong>, <span>, <br>, etc.
  const words = clean
    .split(/\s+/)
    .map(w => w.replace(/[^\w\u00C0-\u024F]/g, ''))
    .filter(w => w.length > 1);

  if (words.length >= 2) {
    for (let seqLen = Math.min(words.length, 5); seqLen >= 2; seqLen--) {
      const firstSeq = words.slice(0, seqLen);
      const pattern = firstSeq.map(escapeRegex).join('(?:<[^>]+>|\\s)+');
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(code);
        if (match) {
          const charStart = match.index;
          const startLine = code.substring(0, charStart).split('\n').length - 1;

          let charEnd = match.index + match[0].length;
          let endLine = startLine;

          if (words.length > seqLen) {
            const lastSeq = words.slice(-Math.min(words.length, 3));
            const lastPattern = lastSeq.map(escapeRegex).join('(?:<[^>]+>|\\s)+');
            const lastRegex = new RegExp(lastPattern, 'i');
            const remainingCode = code.substring(charStart);
            const lastMatch = lastRegex.exec(remainingCode);
            if (lastMatch) {
              charEnd = charStart + lastMatch.index + lastMatch[0].length;
              endLine = code.substring(0, charEnd).split('\n').length - 1;
            }
          }
          return { start: startLine, end: Math.max(startLine, endLine), charStart, charEnd };
        }
      } catch (e) {}
    }
  }

  // Strategy 4: Distinctive word density matching across lines
  if (words.length > 0) {
    let bestLine = -1;
    let maxMatches = 0;
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      let matchCount = 0;
      words.forEach(w => {
        if (lower.includes(w.toLowerCase())) matchCount++;
      });
      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        bestLine = idx;
      }
    });

    if (bestLine !== -1 && maxMatches >= Math.min(2, Math.ceil(words.length * 0.4))) {
      let charStart = 0;
      for (let i = 0; i < bestLine; i++) {
        charStart += lines[i].length + 1;
      }
      const charEnd = charStart + lines[bestLine].length;
      return { start: bestLine, end: bestLine, charStart, charEnd };
    }
  }

  // Strategy 5: Multi-line selection fallback (split clean into non-empty lines and match first identifiable line)
  const cleanLines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  if (cleanLines.length > 1) {
    for (const cLine of cleanLines) {
      const subResult = findMatchingLineRangeInHtml(code, cLine);
      if (subResult) return subResult;
    }
  }

  return null;
}
