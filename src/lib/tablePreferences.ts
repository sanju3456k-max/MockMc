/**
 * Shared Table Preferences & Utilities
 * Handles font size preferences across all table views (Chat tables, Table Canvas Studio, Interactive Table Widget),
 * robust markdown table cell splitting preserving LaTeX math, and responsive styling.
 */

export type TableFontSize = 'large' | 'xlarge';

export interface FontSizeClasses {
  table: string;
  th: string;
  td: string;
  badge: string;
  minColWidth: string;
  mathClass: string;
  label: string;
}

export const TABLE_FONT_SIZE_CONFIG: Record<TableFontSize, FontSizeClasses> = {
  large: {
    table: 'text-sm sm:text-[14.5px]',
    th: 'px-4 py-3 sm:px-5 sm:py-3 text-xs sm:text-[12px] tracking-wider',
    td: 'px-4 py-3 sm:px-5 sm:py-3.5 leading-relaxed',
    badge: 'text-xs px-2.5 py-0.5',
    minColWidth: 'min-w-[140px] sm:min-w-[180px]',
    mathClass: 'text-[14.5px]',
    label: 'A+'
  },
  xlarge: {
    table: 'text-base sm:text-[16.5px]',
    th: 'px-5 py-3.5 sm:px-6 sm:py-3.5 text-[12.5px] sm:text-[13.5px] tracking-wider',
    td: 'px-5 py-3.5 sm:px-6 sm:py-4 leading-relaxed',
    badge: 'text-xs sm:text-sm px-3 py-1',
    minColWidth: 'min-w-[160px] sm:min-w-[210px]',
    mathClass: 'text-[16.5px]',
    label: 'A++'
  }
};

const STORAGE_KEY = 'preferred_table_font_size';
const CHANGE_EVENT = 'table-font-size-changed';

export function getPreferredTableFontSize(): TableFontSize {
  if (typeof window === 'undefined') return 'large';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as string | null;
    if (saved === 'xlarge') {
      return 'xlarge';
    }
  } catch {
    // ignore
  }
  return 'large';
}

export function setPreferredTableFontSize(size: TableFontSize): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, size);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { size } }));
  } catch {
    // ignore
  }
}

export function togglePreferredTableFontSize(): TableFontSize {
  const current = getPreferredTableFontSize();
  const next: TableFontSize = current === 'large' ? 'xlarge' : 'large';
  setPreferredTableFontSize(next);
  return next;
}

/**
 * Robustly splits a markdown or TSV table row into individual cell strings.
 * Critical: Safely preserves all pipes inside LaTeX math ($...$, $$...$$, \[...\], \(...\),
 * \begin{...}...\end{...}, \left|...\right|, conditional probabilities P(A|B), set builders {x | x>0},
 * double pipes ||v||, and absolute values |x|) so formula columns are NEVER split, lost, or truncated.
 */
export function splitMarkdownTableCells(line: string): string[] {
  let trimmed = (line || '').trim();
  if (!trimmed) return [];

  // Tab-delimited rows from Sheets/Docs exports
  if (trimmed.includes('\t') && !trimmed.includes('|')) {
    return trimmed.split('\t').map(c => c.trim());
  }

  // Remove leading and trailing pipes
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

  const placeholder = '\uFFF9PIPE\uFFF9';

  // 1. Protect escaped pipes \|
  let safeLine = trimmed.replace(/\\\|/g, placeholder);

  // 2. Protect double pipes || (norms ||v|| or logical OR)
  safeLine = safeLine.replace(/\|\|/g, `${placeholder}${placeholder}`);

  // 3. Protect pipes inside inline code `...`
  safeLine = safeLine.replace(/`([^`]+)`/g, (match) => match.replace(/\|/g, placeholder));

  // 4. Protect pipes inside display math $$...$$ and \[...\]
  safeLine = safeLine.replace(/\$\$([\s\S]+?)\$\$/g, (match) => match.replace(/\|/g, placeholder));
  safeLine = safeLine.replace(/\\\[([\s\S]+?)\\\]/g, (match) => match.replace(/\|/g, placeholder));

  // 5. Protect pipes inside inline math $...$ and \(...\)
  safeLine = safeLine.replace(/\$([^\$\n]+?)\$/g, (match) => match.replace(/\|/g, placeholder));
  safeLine = safeLine.replace(/\\\(([\s\S]+?)\\\)/g, (match) => match.replace(/\|/g, placeholder));

  // 6. Protect pipes inside LaTeX environments e.g. \begin{...}...\end{...}
  safeLine = safeLine.replace(/(\\begin\{[a-zA-Z*]+\}[\s\S]+?\\end\{[a-zA-Z*]+\})/gi, (match) => {
    return match.replace(/\|/g, placeholder);
  });

  // 7. Protect pipes inside UI token brackets [color:...], [status:...], [tag:...], etc.
  safeLine = safeLine.replace(/(\[\s*(?:color|badge|status|tag|category|stars|bar|trend)[^\]]*\])/gi, (match) => {
    return match.replace(/\|/g, placeholder);
  });

  // 8. Protect pipes inside conditional probabilities e.g. P(A | B) or P(X=x | Y=y)
  safeLine = safeLine.replace(/\b(?:P|Pr|prob|Prob)\s*\(\s*([^()|]+)\s*\|\s*([^()|]+)\s*\)/g, (match, a, b) => {
    return `P(${a}${placeholder}${b})`;
  });

  // 9. Protect pipes inside set builder notation e.g. { x | x > 0 } or \{ x \in R | x \neq 0 \}
  safeLine = safeLine.replace(/\\?\{\s*([^{}|]{1,40})\s*\|\s*([^{}|]{1,50})\s*\\?\}/g, (match, a, b) => {
    return `\\{ ${a} ${placeholder} ${b} \\}`;
  });

  // 10. Protect pipes inside LaTeX delimiters \left|...\right|, \lvert...\rvert, \mid, \parallel, \det|...|, \abs|...|
  safeLine = safeLine.replace(/(\\left\|[\s\S]+?\\right\|)/g, (match) => match.replace(/\|/g, placeholder));
  safeLine = safeLine.replace(/(\\left\|[\s\S]+?\\right\.)/g, (match) => match.replace(/\|/g, placeholder));
  safeLine = safeLine.replace(/(\\left\.[\s\S]+?\\right\|)/g, (match) => match.replace(/\|/g, placeholder));
  safeLine = safeLine.replace(/((?:\\det|\\ln|\\log|\\exp|\\sin|\\cos|\\tan|\\dim|\\ker|\\deg|\\gcd|\\lcm|\\abs|\\mid|\\nmid)\s*\|[^\n|]+\|)/gi, (match) => match.replace(/\|/g, placeholder));

  // 11. Protect evaluation bars at integration/derivative boundaries e.g. |_0^1 or |_{\theta=0}^{\pi}
  safeLine = safeLine.replace(/\|_(\{?[0-9a-zA-Z\\+\-*/^ ]+\}?)(?:\^(\{?[0-9a-zA-Z\\+\-*/ ]+\}?))?/g, (match, sub, sup) => {
    return `${placeholder}_${sub}${sup ? `^${sup}` : ''}`;
  });

  // 12. Protect unwrapped mathematical absolute values strictly in math formula contexts (e.g. '= |x|', '|a-b| <=', '(|z|)', '|\vec{u}|')
  // CRITICAL: inner MUST NOT allow whitespace/words (to prevent mistakenly matching table headers or cell text like '| Decimal Value |')
  safeLine = safeLine.replace(/([=+\-*/<>≈≠≤≥\({[\^~,]|\\(?:le|ge|leq|geq|ne|neq|approx|sim|pm|mp|cdot|mid|nmid)\b)\s*\|([a-zA-Z0-9_\^+\-*/\\()]{1,20}?)\|\s*(?:($|[=+\-*/<>≈≠≤≥\)\]}\^~,]|\\(?:le|ge|leq|geq|ne|neq|approx|sim|pm|mp|cdot)\b))/g, (match, op, inner, suffix) => {
    return `${op} ${placeholder}${inner}${placeholder}${suffix || ''}`;
  });
  safeLine = safeLine.replace(/(^|\s)\s*\|([a-zA-Z0-9_\^+\-*/\\()]{1,20}?)\|\s*([=+\-*/<>≈≠≤≥\)\]}\^~,]|\\(?:le|ge|leq|geq|ne|neq|approx|sim|pm|mp|cdot)\b)/g, (match, prefix, inner, op) => {
    return `${prefix}${placeholder}${inner}${placeholder} ${op}`;
  });

  return safeLine.split('|').map(c => {
    // Restore protected pipes
    return c.replace(new RegExp(placeholder, 'g'), '|').trim();
  });
}
