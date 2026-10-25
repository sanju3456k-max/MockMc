/**
 * Math Isolation Engine
 * Safely isolates LaTeX math delimiters ($...$, $$...$$, \(...\), \[...\], \begin{...}...\end{...})
 * so that Markdown and HTML parsers do not interfere with underscores, asterisks, or backslashes.
 */

export interface IsolatedMathItem {
  id: string;
  math: string;
  display: boolean;
  raw: string;
}

export interface IsolationResult {
  text: string;
  mathMap: Map<string, IsolatedMathItem>;
}

const TOKEN_PREFIX = '@@KATEX_ISOLATED_TOKEN_';
const TOKEN_SUFFIX = '@@';

/**
 * Isolates math blocks from raw markdown/text and replaces them with safe unique tokens.
 */
export function isolateMathDelimiters(input: string): IsolationResult {
  if (!input || typeof input !== 'string') {
    return { text: input || '', mathMap: new Map() };
  }

  // Quick check: if no math markers exist, return as-is
  if (
    !input.includes('$') &&
    !input.includes('\\(') &&
    !input.includes('\\[') &&
    !input.includes('\\begin')
  ) {
    return { text: input, mathMap: new Map() };
  }

  const mathMap = new Map<string, IsolatedMathItem>();
  let tokenCounter = 0;

  const createToken = (math: string, display: boolean, raw: string): string => {
    const id = `${TOKEN_PREFIX}${tokenCounter++}${TOKEN_SUFFIX}`;
    mathMap.set(id, { id, math, display, raw });
    return id;
  };

  // Protect escaped dollar signs (\$ -> safe placeholder)
  const ESCAPED_DOLLAR_HOLDER = '@@KATEX_ESCAPED_DOLLAR@@';
  let processed = input.replace(/\\\$/g, ESCAPED_DOLLAR_HOLDER);

  // 1. Match AMS LaTeX Environments: \begin{equation}...\end{equation}, \begin{matrix}...\end{matrix}, etc.
  const amsRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
  processed = processed.replace(amsRegex, (match) => {
    return createToken(match.trim(), true, match);
  });

  // 2. Match Display LaTeX: \[ ... \]
  const bracketDisplayRegex = /\\\[([\s\S]*?)\\\]/g;
  processed = processed.replace(bracketDisplayRegex, (match, inner) => {
    return createToken(inner.trim(), true, match);
  });

  // 3. Match Inline LaTeX: \( ... \)
  const parenInlineRegex = /\\\(([\s\S]*?)\\\)/g;
  processed = processed.replace(parenInlineRegex, (match, inner) => {
    return createToken(inner.trim(), false, match);
  });

  // 4. Match Display Math: $$ ... $$
  const doubleDollarRegex = /\$\$([\s\S]*?)\$\$/g;
  processed = processed.replace(doubleDollarRegex, (match, inner) => {
    return createToken(inner.trim(), true, match);
  });

  // 5. Match Inline Math: $ ... $
  // Ensures single $ is not matched if inside words (like currency: $50 or $100)
  // Inline math requires non-whitespace immediately following opening $ and non-whitespace preceding closing $
  const singleDollarRegex = /(^|[^\\])\$([^\$\n]+?)\$/g;
  processed = processed.replace(singleDollarRegex, (match, prefix, inner) => {
    const trimmed = inner.trim();
    if (!trimmed) return match; // Empty $$
    const token = createToken(trimmed, false, `$${inner}$`);
    return `${prefix}${token}`;
  });

  // Restore escaped dollar signs
  processed = processed.replace(new RegExp(ESCAPED_DOLLAR_HOLDER, 'g'), '\\$');

  return { text: processed, mathMap };
}

/**
 * Restores math tokens using a custom renderer function (e.g. KaTeX renderToString).
 */
export function restoreMathTokens(
  processedText: string,
  mathMap: Map<string, IsolatedMathItem>,
  renderFn: (item: IsolatedMathItem) => string
): string {
  if (!processedText || mathMap.size === 0) {
    return processedText || '';
  }

  const tokenPattern = new RegExp(`${TOKEN_PREFIX}\\d+${TOKEN_SUFFIX}`, 'g');
  return processedText.replace(tokenPattern, (token) => {
    const item = mathMap.get(token);
    if (!item) return token;
    return renderFn(item);
  });
}
