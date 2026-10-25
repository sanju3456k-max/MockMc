/**
 * High-Performance KaTeX Core Engine
 * Synchronous speed, LRU caching, macro extensions, display style injection,
 * and graceful fallback safety for malformed equations.
 */

import katex from 'katex';

export const PIPELINE_KATEX_MACROS: Record<string, string> = {
  '\\ne': '\\mathrel{≠}',
  '\\neq': '\\mathrel{≠}',
  '\\nequal': '\\mathrel{≠}',
  '\\not=': '\\mathrel{≠}',
  '\\degree': '^\\circ',
  '\\deg': '^\\circ',
  '\\le': '\\leq',
  '\\ge': '\\geq',
  '\\cbrt': '\\sqrt[3]',
  '\\det': '\\operatorname{det}',
  '\\adj': '\\operatorname{adj}',
  '\\tr': '\\operatorname{tr}',
  '\\rank': '\\operatorname{rank}',
  '\\gcd': '\\operatorname{gcd}',
  '\\lcm': '\\operatorname{lcm}',
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\|#1\\right\\|',
  '\\grad': '\\nabla',
  '\\curl': '\\nabla \\times',
  '\\bold': '\\mathbf{#1}',
  '\\bm': '\\boldsymbol{#1}',
  '\\implies': '\\Longrightarrow',
  '\\iff': '\\Longleftrightarrow',
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\C': '\\mathbb{C}',
  '\\Q': '\\mathbb{Q}',
};

const LRU_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 3000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pre-processes LaTeX math string:
 * - Fixes forward slash command typos (/frac -> \frac, /lim -> \lim)
 * - Auto-injects \displaystyle for fractions, limits, integrals, and sums if not explicitly styled
 */
export function normalizeLatexMath(rawMath: string, isDisplay: boolean): string {
  let s = (rawMath || '').trim();
  if (!s) return '';

  // Fix forward slash command typos (common user typing errors)
  s = s.replace(/\/(displaystyle|textstyle|frac|sqrt|sum|int|lim|infty|partial|mathbf|mathrm|text)\b/g, '\\$1');

  // Inject \displaystyle for inline equations that contain tall operators (fractions, sums, integrals, limits)
  if (!isDisplay && !s.startsWith('\\displaystyle') && !s.startsWith('\\textstyle')) {
    if (/\\(?:frac|dfrac|cfrac|int|iint|iiint|oint|sum|prod|lim|matrix|bmatrix|pmatrix|vmatrix|cases)\b/.test(s)) {
      s = `\\displaystyle ${s}`;
    }
  }

  return s;
}

export interface RenderKatexOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  addScrollWrapper?: boolean;
  contentEditableFalse?: boolean;
}

/**
 * Renders a LaTeX string into KaTeX HTML with synchronous speed, LRU caching, and error safety.
 */
export function renderKatexToString(mathStr: string, options: RenderKatexOptions = {}): string {
  const isDisplay = Boolean(options.displayMode);
  const addScrollWrapper = options.addScrollWrapper !== false;
  const contentEditableFalse = options.contentEditableFalse !== false;

  const normalized = normalizeLatexMath(mathStr, isDisplay);
  if (!normalized) return '';

  const cacheKey = `${isDisplay ? 'D:' : 'I:'}${normalized}`;
  const cached = LRU_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let html = '';
  try {
    const rendered = katex.renderToString(normalized, {
      displayMode: isDisplay,
      throwOnError: false,
      strict: false,
      trust: true,
      macros: PIPELINE_KATEX_MACROS,
      output: 'html'
    });

    const editableAttr = contentEditableFalse ? ' contenteditable="false"' : '';
    const safeDataLatex = escapeHtml(mathStr);

    if (isDisplay && addScrollWrapper) {
      html = `<div class="katex-scroll-wrapper" style="overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; margin: 0.5em 0;"${editableAttr} data-latex="${safeDataLatex}"><span class="katex-display"${editableAttr}>${rendered}</span></div>`;
    } else {
      html = `<span class="${isDisplay ? 'katex-display' : 'katex-inline'}"${editableAttr} data-latex="${safeDataLatex}">${rendered}</span>`;
    }
  } catch (err) {
    // Fallback: Gracefully display escaped raw LaTeX rather than crashing the UI thread
    const safeRaw = escapeHtml(mathStr);
    const tag = isDisplay ? 'div' : 'span';
    html = `<${tag} class="katex-error-fallback" style="color: #ef4444; font-family: monospace; background: rgba(239, 68, 68, 0.08); padding: 2px 6px; border-radius: 4px;" title="KaTeX parse error">${isDisplay ? `$$${safeRaw}$$` : `$${safeRaw}$`}</${tag}>`;
  }

  if (LRU_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = LRU_CACHE.keys().next().value;
    if (firstKey) LRU_CACHE.delete(firstKey);
  }
  LRU_CACHE.set(cacheKey, html);

  return html;
}
