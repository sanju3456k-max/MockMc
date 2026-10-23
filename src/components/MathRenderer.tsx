import React, { useMemo, useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import { MindMapVisualizer } from './MindMapVisualizer';
import { InteractiveGraphWidget } from './InteractiveGraphWidget';
import { InteractiveTableWidget } from './InteractiveTableWidget';
import { safeHtml2Canvas } from '../lib/safeHtml2Canvas';
import { exportElementToPng } from '../lib/exportTable';
import { copyTableToClipboard } from '../lib/tableClipboard';
import { 
  getPreferredTableFontSize, 
  setPreferredTableFontSize, 
  TABLE_FONT_SIZE_CONFIG, 
  TableFontSize, 
  splitMarkdownTableCells 
} from '../lib/tablePreferences';
import { attachTableResizers } from '../lib/tableResizer';


export interface MathRendererProps {
  content?: string;
  text?: string;
  className?: string;
  displayMode?: boolean;
  isTableCell?: boolean;
  tableActions?: 'all' | 'copyOnly' | 'none';
}

const KATEX_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  errorColor: '#ef4444',
  strict: false,
  trust: true,
  output: 'html',
  macros: {
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
    '\\sgn': '\\operatorname{sgn}',
    '\\cosec': '\\csc',
    '\\arccot': '\\operatorname{arccot}',
    '\\arcsec': '\\operatorname{arcsec}',
    '\\arccsc': '\\operatorname{arccsc}',
    '\\sech': '\\operatorname{sech}',
    '\\csch': '\\operatorname{csch}',
    '\\abs': '\\left|#1\\right|',
    '\\norm': '\\left\\|#1\\right\\|',
    '\\grad': '\\nabla',
    '\\curl': '\\nabla \\times',
    '\\var': '\\operatorname{Var}',
    '\\cov': '\\operatorname{Cov}',
    '\\corr': '\\operatorname{Corr}',
    '\\diag': '\\operatorname{diag}',
    '\\span': '\\operatorname{span}',
    '\\proj': '\\operatorname{proj}',
    '\\argmax': '\\operatorname*{arg\\,max}',
    '\\argmin': '\\operatorname*{arg\\,min}',
    '\\sen': '\\sin',
    '\\tg': '\\tan',
    '\\cotg': '\\cot',
    '\\bold': '\\mathbf{#1}',
    '\\bm': '\\boldsymbol{#1}',
    '\\implies': '\\Longrightarrow',
    '\\iff': '\\Longleftrightarrow',
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\C': '\\mathbb{C}',
    '\\Q': '\\mathbb{Q}',
  },
};

// High-speed rendering LRU cache (instant O(1) retrieval)
const MATH_RENDER_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 3000;

function getCachedOrRender(key: string, renderFn: () => string): string {
  const cached = MATH_RENDER_CACHE.get(key);
  if (cached !== undefined) return cached;

  const result = renderFn();
  if (MATH_RENDER_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = MATH_RENDER_CACHE.keys().next().value;
    if (firstKey) MATH_RENDER_CACHE.delete(firstKey);
  }
  MATH_RENDER_CACHE.set(key, result);
  return result;
}

/**
 * Clean and normalize LaTeX math strings to ensure standard TeX spacing and symbols
 */
function cleanMathString(mathStr: string): string {
  let s = mathStr.trim();
  if (!s) return '';

  const isMatrix = isMatrixExpression(s);

  // 0. Normalize double backslashes before LaTeX commands or symbols from JSON escaping
  s = s.replace(/\\\\([a-zA-Z]+|[|{}[\],;])/g, '\\$1');

  // 0b. Escape raw underscores inside \text{...} or double-underscores to prevent KaTeX subscript crashes (lookbehind-free)
  s = s.replace(/\\text\s*\{([^{}]+)\}/g, (match, textContent) => {
    const cleanContent = textContent.replace(/\\?_/g, '\\_');
    return `\\text{${cleanContent}}`;
  });
  s = s.replace(/\\?__+/g, (match) => {
    const underscoresCount = match.replace(/\\/g, '').length;
    return '\\_'.repeat(underscoresCount);
  });

  // 1. Normalize unicode dashes and minus signs
  s = s.replace(/[\u2212\u2013\u2014]/g, '-');

  // 1b. Normalize inequality and relation operators (including programmer-style and raw unicode symbols) to standard LaTeX/KaTeX symbols
  s = s.replace(/\\ne\b/g, ' \\neq ');
  s = s.replace(/\\nequal\b/g, ' \\neq ');
  s = s.replace(/!=/g, ' \\neq ');
  s = s.replace(/<>/g, ' \\neq ');
  s = s.replace(/\u2260/g, ' \\neq '); // unicode ≠
  s = s.replace(/<=/g, ' \\leq ');
  s = s.replace(/\u2264/g, ' \\leq '); // unicode ≤
  s = s.replace(/>=/g, ' \\geq ');
  s = s.replace(/\u2265/g, ' \\geq '); // unicode ≥
  s = s.replace(/\u00D7/g, ' \\times '); // unicode ×
  s = s.replace(/\u00F7/g, ' \\div '); // unicode ÷
  s = s.replace(/\u00B1/g, ' \\pm '); // unicode ±
  s = s.replace(/\u2213/g, ' \\mp '); // unicode ∓
  s = s.replace(/\u2248/g, ' \\approx '); // unicode ≈
  s = s.replace(/\u2261/g, ' \\equiv '); // unicode ≡
  s = s.replace(/\u221E/g, ' \\infty '); // unicode ∞
  s = s.replace(/\u2208/g, ' \\in '); // unicode ∈
  s = s.replace(/\u2209/g, ' \\notin '); // unicode ∉
  s = s.replace(/\u2282/g, ' \\subset '); // unicode ⊂
  s = s.replace(/\u2286/g, ' \\subseteq '); // unicode ⊆
  s = s.replace(/\u222A/g, ' \\cup '); // unicode ∪
  s = s.replace(/\u2229/g, ' \\cap '); // unicode ∩
  s = s.replace(/\u2200/g, ' \\forall '); // unicode ∀
  s = s.replace(/\u2203/g, ' \\exists '); // unicode ∃
  s = s.replace(/\u2202/g, ' \\partial '); // unicode ∂
  s = s.replace(/\u2207/g, ' \\nabla '); // unicode ∇
  s = s.replace(/\u2220/g, ' \\angle '); // unicode ∠
  s = s.replace(/\u22A5/g, ' \\perp '); // unicode ⊥
  s = s.replace(/\u2225/g, ' \\parallel '); // unicode ∥

  // 1c. Normalize cube roots written as \cbrt{...}
  s = s.replace(/\\cbrt\s*\{([^{}]+)\}/g, '\\sqrt[3]{$1}');

  if (!isMatrix) {
    // 2. Ensure clean binary minus spacing inside modulus, parentheses and brackets, e.g. |1 -x| -> |1 - x|, (2a -x) -> (2a - x)
    s = s.replace(/([0-9a-zA-Z\)\}\]])\s*-\s*([0-9a-zA-Z\(\{\\\|])/g, '$1 - $2');
    s = s.replace(/([0-9a-zA-Z\)\}\]])\s*\+\s*([0-9a-zA-Z\(\{\\\|])/g, '$1 + $2');
    s = s.replace(/([0-9a-zA-Z\)\}\]])\s*=\s*([0-9a-zA-Z\(\{\\\|])/g, '$1 = $2');
  }

  // 3. Fix inverse trig / log functions written without backslash: tan^-1 -> \tan^{-1}, sin^-1 -> \sin^{-1}
  s = s.replace(/(^|[^\\])\b(tan|sin|cos|sec|csc|cot|log|ln)\^(-?1|\{[^{}]+\})/gi, '$1\\$2^{$3}');
  s = s.replace(/\\(tan|sin|cos|sec|csc|cot|log|ln)\^(-?1)\b/gi, '\\$1^{$2}');

  // 3b. Preserve math functions written without leading backslash (e.g. sin(x), cos(2x), log(n), ln(x), exp(x), det(A))
  s = s.replace(/(^|[^\\])\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|coth|log|ln|exp|arcsin|arccos|arctan|det|dim|ker|gcd|lcm)\b(?=\s*[\(\{0-9a-zA-Z_\^])/gi, '$1\\$2');

  if (!isMatrix) {
    // 4. Ensure proper spacing before differentials at the end of integral expressions: f(x)dx -> f(x) \, dx, x^3dx -> x^3 \, dx
    s = s.replace(/([0-9a-zA-Z\)\}\]\|])\s*(d[xytuvz]|d\\theta)\b/g, '$1 \\, $2');

    // 5. Clean up duplicate spaces inside LaTeX commands
    s = s.replace(/\s+/g, ' ');

    // 6. Auto-convert common math words and statements into \text{ ... } with clean Inter typography
    s = s.replace(/\b(for\s+all|such\s+that|Order|order|Degree|degree|even|odd|where|when|if|and|or|otherwise|constant|prime|rank|trace)\b(?!\s*\{)(?=[^}]*(?:=|,|\$|$))/gi, (match) => `\\text{ ${match.trim()} }`);
  }

  // 7. Auto-inject \displaystyle for fractions, nested fractions, integrals, sums, and limits if not explicitly styled
  if (!s.startsWith('\\displaystyle') && !s.startsWith('\\textstyle')) {
    if (/\\(?:frac|dfrac|cfrac|int|iint|iiint|oint|sum|prod|lim|bigcup|bigcap|matrix|bmatrix|pmatrix|vmatrix|cases)\b/.test(s)) {
      s = `\\displaystyle ${s}`;
    }
  }

  return s;
}

function isMatrixExpression(mathStr: string): boolean {
  return /\\begin\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|aligned|cases|array)\}/i.test(mathStr);
}

/**
 * Checks if a string is a natural language sentence (NOT a pure standalone math formula)
 */
function hasNaturalLanguageSentence(text: string): boolean {
  // Strip out LaTeX commands like \lim, \to, \infty, \frac{...}{...}, \sum, \text{...}
  const stripped = text
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}\[\]\(\)\^\_\=\+\-\*\/\<\>\|\$!]/g, ' ')
    .trim();
  
  const words = stripped.split(/\s+/).filter(w => /^[a-zA-Z]{3,}$/.test(w));
  const SENTENCE_WORDS = /\b(?:evaluate|find|calculate|determine|solve|prove|show|simplify|where|when|which|what|suppose|assume|because|since|therefore|definition|explanation|sequence|divergent|convergent|converges|diverges|statement|question|answer|following)\b/i;
  
  return SENTENCE_WORDS.test(stripped) || words.length >= 3;
}

/**
 * Known LaTeX math command names
 */
const LATEX_MATH_COMMAND_NAMES = [
  'lim', 'limsup', 'liminf', 'frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'cbrt',
  'int', 'iint', 'iiint', 'oint', 'sum', 'prod', 'coprod',
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'cosec', 'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'exp', 'det', 'dim', 'ker', 'gcd', 'lcm', 'deg', 'max', 'min', 'sup', 'inf', 'sgn', 'arg',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma',
  'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'to', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'iff', 'implies', 'leftrightarrow', 'Leftrightarrow',
  'cdot', 'times', 'div', 'pm', 'mp', 'approx', 'sim', 'simeq', 'equiv', 'cong', 'neq', 'ne', 'nequal', 'leq', 'le', 'geq', 'ge', 'll', 'gg', 'propto',
  'in', 'notin', 'ni', 'subset', 'subseteq', 'supset', 'supseteq', 'cup', 'cap', 'bigcup', 'bigcap', 'setminus', 'emptyset', 'varnothing', 'infty',
  'forall', 'exists', 'nexists', 'partial', 'nabla', 'degree', 'angle', 'perp', 'parallel', 'bot', 'top', 'triangle', 'vec', 'bar', 'hat', 'tilde', 'dot', 'ddot',
  'mathbf', 'mathrm', 'mathit', 'mathbb', 'mathcal', 'mathscr', 'mathfrak', 'text', 'operatorname'
];

const LATEX_COMMANDS_REGEX = new RegExp(`\\\\(?:${LATEX_MATH_COMMAND_NAMES.join('|')})\\b`, 'i');

const KNOWN_MATH_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'cosec',
  'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
  'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'exp', 'lg',
  'det', 'dim', 'ker', 'gcd', 'lcm', 'deg', 'max', 'min', 'sup', 'inf', 'lim', 'mod',
  'sgn', 'arg', 'adj', 'tr', 'rank'
]);

const DIFFERENTIALS = new Set([
  'dx', 'dy', 'dz', 'dt', 'dr', 'du', 'dv', 'dw', 'ds', 'dp', 'dq', 'dtheta', 'dphi'
]);

const ENGLISH_PROSE_WORDS = new Set([
  'for', 'all', 'where', 'when', 'which', 'what', 'with', 'without', 'only',
  'such', 'that', 'valid', 'from', 'then', 'since', 'given', 'here',
  'constant', 'case', 'period', 'periods', 'each', 'every', 'both', 'between',
  'before', 'after', 'while', 'because', 'assuming', 'assume', 'note', 'shortcut',
  'condition', 'definition', 'formula', 'rule', 'law', 'theorem', 'identity',
  'equation', 'property', 'state', 'point', 'value', 'type', 'types', 'form',
  'standard', 'general', 'special', 'ideal', 'real', 'uniform', 'nonuniform',
  'zero', 'unit', 'maximum', 'minimum', 'average', 'initial', 'final', 'total'
]);

/**
 * Scans mixed text for unwrapped LaTeX formulas (e.g. \lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e)
 * and safely extracts them as rendered math tokens.
 */
function extractUnwrappedLatexExpressions(
  text: string, 
  saveToken: (renderedHtml: string, rawMath: string) => string
): string {
  if (!text || (!text.includes('\\') && !/[a-zA-Z]_[0-9a-zA-Z]/.test(text))) {
    return text;
  }

  let result = '';
  let i = 0;
  const n = text.length;

  while (i < n) {
    // 1. Skip existing tokens (e.g. \uFFF0MTK0\uFFF1, §§MATH_TOKEN_0§§)
    if (text[i] === '\uFFF0') {
      const endToken = text.indexOf('\uFFF1', i + 1);
      if (endToken !== -1) {
        result += text.slice(i, endToken + 1);
        i = endToken + 1;
        continue;
      }
    }
    if (text.startsWith('§§', i)) {
      const endToken = text.indexOf('§§', i + 2);
      if (endToken !== -1) {
        result += text.slice(i, endToken + 2);
        i = endToken + 2;
        continue;
      }
    }
    // Skip HTML tags
    if (text[i] === '<' && /<[a-zA-Z\/]/.test(text.slice(i, i + 3))) {
      const endTag = text.indexOf('>', i);
      if (endTag !== -1) {
        result += text.slice(i, endTag + 1);
        i = endTag + 1;
        continue;
      }
    }

    // 2. Check for start of unwrapped LaTeX command or math sequence
    let matchStart = -1;
    const remaining = text.slice(i);
    const cmdMatch = remaining.match(/^(\\[a-zA-Z]+)/);
    const assignMatch = remaining.match(/^([a-zA-Z](?:_[0-9a-zA-Z]|\^[0-9a-zA-Z])?\s*=\s*)(?=\\[a-zA-Z]+|[0-9]|\()/);
    const relMatch = remaining.match(/^([a-zA-Z0-9_\^]+(?:\s*[\+\-\*\/]\s*[a-zA-Z0-9_\^]+)*\s*\\(?:neq|ne|leq|le|geq|ge|approx|sim|equiv|times|cdot|in|notin|subset|subseteq|implies|iff|to|rightarrow)\b)/i);

    if (cmdMatch && LATEX_COMMANDS_REGEX.test(cmdMatch[1])) {
      matchStart = i;
    } else if (assignMatch) {
      const lookahead = remaining.slice(0, 150);
      if (LATEX_COMMANDS_REGEX.test(lookahead)) {
        matchStart = i;
      }
    } else if (relMatch) {
      matchStart = i;
    }

    if (matchStart !== -1) {
      let j = matchStart;
      let braceDepth = 0;
      let parenDepth = 0;
      let bracketDepth = 0;
      let lastValidEnd = -1;

      while (j < n) {
        const char = text[j];

        if (
          text.startsWith('§§', j) ||
          text.startsWith('\uFFF0', j) ||
          char === '\n' ||
          char === '\r' ||
          char === '<' ||
          char === '|'
        ) {
          break;
        }

        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (char === '(') parenDepth++;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

        if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
          // Terminal sentence punctuation followed by whitespace or EOF
          if ((char === '.' || char === ',' || char === ';' || char === '?' || char === '!' || char === ':') && 
              (j + 1 >= n || /\s/.test(text[j + 1]) || text[j + 1] === '<' || text.startsWith('§§', j + 1) || text.startsWith('\uFFF0', j + 1))) {
            lastValidEnd = j;
            break;
          }

          // English prose words separating math clauses (e.g. "valid only for...", "where n > 0")
          const lookaheadMatch = text.slice(j).match(/^\s+([a-zA-Z]{3,})\b/);
          if (lookaheadMatch) {
            const word = lookaheadMatch[1].toLowerCase();
            if (ENGLISH_PROSE_WORDS.has(word)) {
              lastValidEnd = j;
              break;
            }
          }
        }

        j++;
        if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
          lastValidEnd = j;
        }
      }

      const endIdx = lastValidEnd > matchStart ? lastValidEnd : j;
      const candidate = text.slice(matchStart, endIdx).trim();

      if (candidate && (LATEX_COMMANDS_REGEX.test(candidate) || candidate.includes('\\')) && !candidate.includes('<')) {
        const tokenPlaceholder = saveToken(renderMathToken(candidate, false), `$${candidate}$`);
        result += tokenPlaceholder;
        i = endIdx;
        continue;
      }
    }

    result += text[i];
    i++;
  }

  return result;
}

/**
 * Checks if a string is a 100% self-contained math formula (like an option A/B/C/D, matrix, equation, or single value)
 */
function isPureMathString(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Never treat tokens, HTML, or UI bracket tags as pure math string
  if (trimmed.includes('§§') || /_TOKEN_\d+/i.test(trimmed)) return false;
  if (/\[\s*(?:color|badge|status|tag|category|bar|stars|trend)\s*:/i.test(trimmed)) return false;

  // Single number or signed number, e.g. "0", "1", "-2", "25"
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return true;

  // Single variable with optional super/subscript, e.g. "x", "e", "A", "x_1", "A^T"
  if (/^[a-zA-Z](?:_[0-9a-zA-Z]|\^[0-9a-zA-Z])?$/.test(trimmed)) return true;

  // Standard matrix or environment
  if (isMatrixExpression(trimmed)) return true;

  // If it contains natural prose sentences, it's mixed text, not pure math
  if (hasNaturalLanguageSentence(trimmed)) return false;

  // Check for LaTeX commands or equations: \frac, \int, \sqrt, \tan, \infty, etc.
  if (LATEX_COMMANDS_REGEX.test(trimmed) || /\\(?:infty|pi|theta|alpha|beta|gamma|lambda|mu|sigma|omega|Delta|degree|vec|bar|hat|cdot|circ|det|adj|tr|mathrm|mathbf|text)/i.test(trimmed)) {
    return true;
  }

  // Math equations with variables, operators, parentheses, brackets, or powers: e.g. "f(2a - x) = f(x)", "y = 2x + 1", "\lambda^2 - 6\lambda + 5 = 0"
  if (/[=+\-\^\/_{}\[\]\|]/.test(trimmed) && /[a-zA-Z0-9]/.test(trimmed)) {
    return true;
  }

  return false;
}

function renderMathToken(rawMath: string, forceDisplay = false): string {
  const cleaned = cleanMathString(rawMath);
  if (!cleaned) return '';

  // Critical safety guard: NEVER let KaTeX parse or mangle token placeholders!
  if (cleaned.includes('§§') || /_TOKEN_\d+/i.test(cleaned)) {
    return cleaned;
  }

  const tryKatex = (expr: string): string | null => {
    try {
      const rendered = katex.renderToString(expr, { 
        ...KATEX_OPTIONS, 
        displayMode: forceDisplay 
      });
      if (forceDisplay) {
        return `<div class="katex-display">${rendered}</div>`;
      }
      return `<span class="inline-math">${rendered}</span>`;
    } catch {
      return null;
    }
  };

  // 1. Direct render
  const directResult = tryKatex(cleaned);
  if (directResult) return directResult;

  // 2. Recovery: Replace undefined command with \operatorname{cmd}
  let recovered = cleaned;
  recovered = recovered.replace(/\\([a-zA-Z]{2,})(?![a-zA-Z])/g, (match, cmd) => {
    if (LATEX_COMMANDS_REGEX.test(match)) return match;
    return `\\operatorname{${cmd}}`;
  });
  const recResult1 = tryKatex(recovered);
  if (recResult1) return recResult1;

  // 3. Recovery: Escape raw % or # or & outside matrix environments
  if (!isMatrixExpression(cleaned)) {
    recovered = recovered.replace(/(?<!\\)%/g, '\\%').replace(/(?<!\\)#/g, '\\#');
    const recResult2 = tryKatex(recovered);
    if (recResult2) return recResult2;
  }

  return `<span class="inline-math">${escapeHtml(cleaned)}</span>`;
}

function normalizeUiTokens(text: string): string {
  if (!text) return '';
  let s = text;
  // Strip backticks surrounding color tags with following label or standalone
  // e.g. `[color:red]` `0%` -> [color:red] 0%
  s = s.replace(/`(\[\s*(?:color|badge|status|tag|category)\s*:[^\]]+\](?:\s*[^`\n]*)?)`/gi, '$1');
  s = s.replace(/\[\s*(?:color|badge|status|tag|category)\s*:\s*([^\]]+)\]\s*`([^`\n]+)`/gi, '[color:$1] $2');
  s = s.replace(/`(\[\s*(?:color|badge|status|tag|category|bar|stars|trend)\s*:[^\]]+\])`/gi, '$1');
  s = s.replace(/`(\[(?:x|X|\s|✓|✔)\])`/g, '$1');
  return s;
}

/**
 * Helper to format table cells cleanly with rich typography, code tags, checkboxes, and full math support (Google AI mode)
 */
export function formatTableCellContent(cellText: string): string {
  if (!cellText) return '';
  let cleaned = normalizeUiTokens(String(cellText).trim());
  if (cleaned === '$') return '';

  // Tokens storage for widgets, math, and code
  const tokens: string[] = [];
  const saveCellToken = (html: string): string => {
    const idx = tokens.length;
    tokens.push(html);
    return `\uFFF0TCTK${idx}\uFFF1`;
  };

  // 1. PRIORITY: Checkbox indicators (standalone [x], [ ], or followed by status text e.g. [x] Done, [ ] Pending)
  const standaloneCheckboxMatch = cleaned.match(/^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\]\s*$/);
  if (standaloneCheckboxMatch) {
    const mark = standaloneCheckboxMatch[2];
    const isChecked = mark === 'x' || mark === 'X' || mark === '✓' || mark === '✔';
    if (isChecked) {
      return `<span class="inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/90 dark:border-emerald-800/60 align-middle select-none"><span class="w-3.5 h-3.5 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span><span>Checked</span></span>`;
    } else {
      return `<span class="inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 align-middle select-none"><span class="w-3.5 h-3.5 rounded border border-slate-300 dark:border-zinc-600 flex items-center justify-center text-[10px] shrink-0"></span><span>Unchecked</span></span>`;
    }
  }

  const checkboxWithTextMatch = cleaned.match(/^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\]\s+(.+)$/);
  if (checkboxWithTextMatch) {
    const mark = checkboxWithTextMatch[2];
    const label = checkboxWithTextMatch[3].trim();
    const isChecked = mark === 'x' || mark === 'X' || mark === '✓' || mark === '✔';
    if (isChecked) {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/90 dark:border-emerald-800/60 align-middle max-w-full select-none"><span class="w-3.5 h-3.5 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span><span>${escapeHtml(label)}</span></span>`;
    } else {
      return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 align-middle max-w-full select-none"><span class="w-3.5 h-3.5 rounded border border-slate-300 dark:border-zinc-600 flex items-center justify-center text-[10px] shrink-0"></span><span>${escapeHtml(label)}</span></span>`;
    }
  }

  // 1. Clean up explicit Status / Category / Color / Trend tags without generating colored pills
  cleaned = cleaned.replace(/\[\s*(?:color|badge|status|tag|category)\s*:\s*([^\]\n]+)\s*\](?:\s*([^\n|•<]+))?/gi, (_, tagVal, textAfter) => {
    const trimmedText = (textAfter || '').trim();
    if (trimmedText) return trimmedText;
    return (tagVal || '').trim();
  });

  cleaned = cleaned.replace(/\[\s*trend\s*:\s*([^\]\n]+)\s*\](?:\s*([^\n|•<]+))?/gi, (_, trendVal, textAfter) => {
    const trimmedText = (textAfter || '').trim();
    if (trimmedText) return trimmedText;
    return (trendVal || '').trim();
  });

  // 0. Exact display math: $$...$$ or \[...\]
  if (
    (cleaned.startsWith('$$') && cleaned.endsWith('$$') && cleaned.length > 4) ||
    (cleaned.startsWith('\\[') && cleaned.endsWith('\\]') && cleaned.length > 4)
  ) {
    const math = cleaned.startsWith('$$') ? cleaned.slice(2, -2).trim() : cleaned.slice(2, -2).trim();
    return renderMathToken(math, false);
  }

  // 0b. Exact inline math: $...$ or \(...\)
  if (
    (cleaned.startsWith('$') && cleaned.endsWith('$') && cleaned.length > 2 && !cleaned.slice(1, -1).includes('$')) ||
    (cleaned.startsWith('\\(') && cleaned.endsWith('\\)') && cleaned.length > 4)
  ) {
    const math = cleaned.startsWith('$') ? cleaned.slice(1, -1).trim() : cleaned.slice(2, -2).trim();
    return renderMathToken(math, false);
  }

  // 0c. Standalone pure math equation/expression (e.g. \Delta t = \sqrt{2h/g}, v = u + at, E = mc^2, \lambda = \frac{ax}{D}, etc.)
  if (!cleaned.includes('$') && !cleaned.includes('\uFFF0') && isPureMathString(cleaned)) {
    return renderMathToken(cleaned, false);
  }

  // 1. Exact checkbox indicators: [x] or [X] and [ ]
  if (/^\[x\]$/i.test(cleaned)) {
    return `<span class="inline-flex items-center justify-center w-4 h-4 rounded text-emerald-600 dark:text-emerald-400 font-bold text-xs">✓</span>`;
  }
  if (/^\[ \]$/.test(cleaned)) {
    return `<span class="inline-flex items-center justify-center w-4 h-4 rounded text-slate-400 text-xs">○</span>`;
  }

  // 2. Protect and render inline backtick `code`
  cleaned = cleaned.replace(/`([^`\n]+)`/g, (_, code) => {
    const html = `<code class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#222530] text-blue-600 dark:text-blue-400 font-mono text-[11px] border border-slate-200/60 dark:border-[#2e3240]">${escapeHtml(code)}</code>`;
    return saveCellToken(html);
  });

  // 3. PRIORITY: Extract and render ALL LaTeX math blocks BEFORE color tags or markdown!
  // This guarantees math formulas inside color pills, bullets, and text are 100% rendered with KaTeX.

  // 3a. Display math $$...$$ and \[...\] (rendered compact for table cells)
  cleaned = cleaned.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => saveCellToken(renderMathToken(math, false)));
  cleaned = cleaned.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => saveCellToken(renderMathToken(math, false)));

  // 3b. Explicit inline math $...$ and \(...\)
  cleaned = cleaned.replace(/\$([^\$\n]+?)\$/g, (_, math) => saveCellToken(renderMathToken(math, false)));
  cleaned = cleaned.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => saveCellToken(renderMathToken(math, false)));

  // 3c. Raw matrix environments \begin{pmatrix}...\end{pmatrix}
  cleaned = cleaned.replace(/(\\begin\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|aligned|cases|array)\}[\s\S]+?\\end\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|aligned|cases|array)\})/gi, (match) => {
    return saveCellToken(renderMathToken(match, false));
  });

  // 3d. Fix dangling single $ math expressions (e.g. "$h^2 > ab" at end of line without closing $)
  if ((cleaned.match(/\$/g) || []).length % 2 === 1) {
    cleaned = cleaned.replace(/\$([a-zA-Z0-9_\\\{\}\^+\-*\/|\s><=]+)(?=[,.;:!?\n]|$)/g, (match, expr) => {
      if (/[a-zA-Z0-9]/.test(expr) && !/^\s*\d+(\.\d+)?\s*$/.test(expr)) {
        return saveCellToken(renderMathToken(expr.trim(), false));
      }
      return match;
    });
  }

  // 3e. Extract unwrapped LaTeX formulas (e.g. \frac{x}{a} \pm \frac{y}{b} = 0, \lim, \int, etc.)
  if (cleaned.includes('\\') || /[a-zA-Z]_[0-9a-zA-Z]/.test(cleaned)) {
    cleaned = extractUnwrappedLatexExpressions(cleaned, (rendered) => saveCellToken(rendered));
  }

  // 3f. Handle isolated commands and Greek letters (\theta, \pm, \implies, etc.)
  const ISOLATED_COMMANDS_REGEX = new RegExp(
    `(?:\\\\(?:${LATEX_MATH_COMMAND_NAMES.join('|')})\\b(?![a-zA-Z\\}])|` +
    `\\\\(?:vec|hat|bar|tilde|dot|ddot)\\{[^{}]+\\}|` +
    `\\b[a-zA-Z]\\^\\{[^{}]+\\}|\\b[a-zA-Z]_\\{[^{}]+\\}|` +
    `\\b[a-zA-Z]_[0-9a-zA-Z]\\b|\\b[a-zA-Z]\\^[0-9a-zA-Z]\\b)`,
    'g'
  );
  cleaned = cleaned.replace(ISOLATED_COMMANDS_REGEX, (match) => {
    if (match.includes('\uFFF0') || match.includes('§§') || match.includes('<') || match.includes('class=')) {
      return match;
    }
    return saveCellToken(renderMathToken(match, false));
  });

  // 4. Match progress bar syntax: [bar:85] or [bar:85%] or [bar: 15]
  cleaned = cleaned.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, valStr) => {
    const val = Math.min(100, Math.max(0, parseInt(valStr, 10)));
    const barColor = val >= 75 
      ? 'bg-emerald-500 dark:bg-emerald-400' 
      : val >= 40 
        ? 'bg-amber-500 dark:bg-amber-400' 
        : 'bg-rose-500 dark:bg-rose-400';
    return saveCellToken(
      `<div class="inline-flex items-center gap-2 min-w-[95px] w-full max-w-[130px] my-0.5 align-middle">` +
        `<div class="flex-1 h-2 rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden shadow-2xs">` +
          `<div class="h-full rounded-full transition-all duration-300 ${barColor}" style="width: ${val}%"></div>` +
        `</div>` +
        `<span class="text-[11px] font-mono font-semibold text-slate-700 dark:text-zinc-300 tabular-nums">${val}%</span>` +
      `</div>`
    );
  });

  // 5. Match star rating syntax: [stars:4] or [stars:4.5] or [stars:5]
  cleaned = cleaned.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, valStr) => {
    const val = Math.min(5, Math.max(0, parseFloat(valStr) || 0));
    const fullStars = Math.floor(val);
    const hasHalf = val % 1 >= 0.4 && val % 1 <= 0.8;
    const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0));
    const starsStr = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(emptyStars);
    return saveCellToken(
      `<span class="inline-flex items-center gap-1 font-medium whitespace-nowrap align-middle"><span class="text-amber-500 dark:text-amber-400 tracking-wider text-xs">${starsStr}</span><span class="text-[11px] font-mono text-slate-500 dark:text-zinc-400">(${val}/5)</span></span>`
    );
  });

  // 6. Match trend indicators: [trend:up], [trend:down], [trend:flat], [trend:+15%]
  cleaned = cleaned.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, trendVal) => {
    const t = trendVal.trim().toLowerCase();
    if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) {
      return saveCellToken(
        `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/90 dark:border-emerald-800/60 align-middle"><span class="text-[10px]">▲</span> ${escapeHtml(trendVal.trim())}</span>`
      );
    } else if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) {
      return saveCellToken(
        `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/90 dark:border-rose-800/60 align-middle"><span class="text-[10px]">▼</span> ${escapeHtml(trendVal.trim())}</span>`
      );
    } else {
      return saveCellToken(
        `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 align-middle"><span class="text-[10px]">▬</span> ${escapeHtml(trendVal.trim())}</span>`
      );
    }
  });

  // Clean any remaining dangling color tags
  cleaned = cleaned.replace(/\[\s*(?:color|badge|status|tag|category)\s*:\s*[a-zA-Z0-9_-]+\s*\]/gi, '');

  // 8. Normalize fill-in-the-blank dashes and escaped underscores e.g. \_\_\_\_\_ -> ________
  cleaned = cleaned.replace(/(?:\\_)+/g, (match) => '_'.repeat(Math.max(4, Math.floor(match.length / 2) * 2)));
  cleaned = cleaned.replace(/\\_/g, '_');
  cleaned = cleaned.replace(/(?:[_\-–—]\s+){2,}[_\-–—]/g, '________');

  // 9. Markdown formatting
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-zinc-100">$1</strong>');
  cleaned = cleaned.replace(/(?<=^|\s)\*(\S[^*\n]*?\S|\S)\*(?=\s|$|[.,;:!?])/g, '<em>$1</em>');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '<br />');

  // 10. Multi-bullet formatting: handles bullets like "• item 1 \n • item 2" cleanly
  if (cleaned.includes('•') || cleaned.includes('\n•') || cleaned.includes('\n- ')) {
    const lines = cleaned.split(/\n|(?=•)/g).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 1) {
      cleaned = `<div class="space-y-1.5">${lines.map(line => {
        const hasBullet = line.startsWith('•') || line.startsWith('- ');
        const cleanContent = hasBullet ? line.replace(/^[•\-]\s*/, '') : line;
        return `<div class="flex items-start gap-1.5 leading-relaxed"><span class="text-slate-400 dark:text-zinc-500 font-bold shrink-0 mt-0.5 text-xs">•</span><div class="min-w-0 flex-1">${cleanContent}</div></div>`;
      }).join('')}</div>`;
    }
  }

  // 11. Restore all saved tokens (widgets, math, code)
  cleaned = cleaned.replace(/\uFFF0TCTK(\d+)\uFFF1/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return tokens[idx] ?? '';
  });

  return cleaned;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ 
  content, 
  text: textProp,
  className = '', 
  displayMode = false,
  isTableCell = false,
  tableActions = 'all'
}) => {
  const inputStr = content ?? textProp ?? '';

  // Guard against raw binary strings / PNG IHDR headers rendering as garbled text
  if (
    inputStr.startsWith('\x89PNG') ||
    inputStr.startsWith('PNG\r\n') ||
    inputStr.includes('PNG IHDR') ||
    inputStr.startsWith('GIF8') ||
    inputStr.startsWith('data:image/') ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]{3,}/.test(inputStr.slice(0, 100))
  ) {
    if (inputStr.startsWith('data:image/')) {
      return (
        <span className="my-2 max-w-full inline-block">
          <img 
            src={inputStr} 
            alt="Attachment" 
            className="max-h-[350px] max-w-full object-contain rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs mx-auto" 
            loading="lazy" 
          />
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-[#21222e] text-slate-500 dark:text-zinc-400 text-xs font-mono my-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
        <span className="truncate font-sans font-medium">Image Attachment File</span>
      </div>
    );
  }

  if (isTableCell) {
    const cellHtml = formatTableCellContent(inputStr);
    return (
      <span 
        className={`table-cell-math-content inline-block max-w-full ${className}`} 
        dangerouslySetInnerHTML={{ __html: cellHtml }} 
      />
    );
  }

  const renderedHtml = useMemo(() => {
    if (!inputStr) return '';

    const cacheKey = `${displayMode ? 'D:' : 'I:'}${tableActions}:${inputStr}`;
    return getCachedOrRender(cacheKey, () => {
      let text = String(inputStr).trim();

      // Normalize escaped underscores and fill-in-the-blank patterns e.g. \_\_\_\_\_ -> ________
      text = text.replace(/(?:\\_)+/g, (match) => '_'.repeat(Math.max(4, Math.floor(match.length / 2) * 2)));
      text = text.replace(/\\_/g, '_');
      text = text.replace(/(?:[_\-–—]\s+){2,}[_\-–—]/g, '________');

      // 1. Explicit display math: $$...$$ or \[...\]
      if ((text.startsWith('$$') && text.endsWith('$$') && text.length > 4) ||
          (text.startsWith('\\[') && text.endsWith('\\]') && text.length > 4)) {
        const math = text.startsWith('$$') ? text.slice(2, -2) : text.slice(2, -2);
        return renderMathToken(math, true);
      }

      // 2. Explicit inline math: $...$ or \(...\)
      if ((text.startsWith('$') && text.endsWith('$') && text.length > 2 && !text.slice(1, -1).includes('$')) ||
          (text.startsWith('\\(') && text.endsWith('\\)') && text.length > 4)) {
        const math = text.startsWith('$') ? text.slice(1, -1) : text.slice(2, -2);
        return renderMathToken(math, displayMode);
      }

      // 3. Check if standalone text is a 100% pure math equation (e.g. option formula like "\frac{1}{4}[(x^4 - 1)...] + c", "f(2a-x)=f(x)", matrices)
      if (!text.includes('$') && isPureMathString(text)) {
        return renderMathToken(text, displayMode);
      }

      // 4. Mixed Text & Math Processing
      const mathTokens: string[] = [];
      const rawMathTokens: string[] = [];
      const saveToken = (renderedHtml: string, rawMath: string) => {
        const tokenIndex = mathTokens.length;
        mathTokens.push(renderedHtml);
        rawMathTokens.push(rawMath);
        return `\uFFF0MTK${tokenIndex}\uFFF1`;
      };

      const codeTokens: string[] = [];
      const saveCodeToken = (renderedHtml: string) => {
        const tokenIndex = codeTokens.length;
        codeTokens.push(renderedHtml);
        return `\uFFF0CTK${tokenIndex}\uFFF1`;
      };

      const imageTokens: string[] = [];
      const saveImageToken = (renderedHtml: string) => {
        const tokenIndex = imageTokens.length;
        imageTokens.push(renderedHtml);
        return `\uFFF0ITK${tokenIndex}\uFFF1`;
      };

      const tableTokens: string[] = [];
      const saveTableToken = (renderedHtml: string) => {
        const tokenIndex = tableTokens.length;
        tableTokens.push(renderedHtml);
        return `\uFFF0TTK${tokenIndex}\uFFF1`;
      };

      let processed = normalizeUiTokens(text);

      // Extract markdown images: ![alt](url)
      processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        const cleanSrc = src.trim();
      if (cleanSrc) {
        const cleanAlt = escapeHtml(alt.trim() || 'Diagram Image');
        const html = `<span class="my-2 max-w-full inline-block"><img src="${cleanSrc}" alt="${cleanAlt}" class="max-h-[280px] max-w-full object-contain rounded-xl border border-slate-200/80 dark:border-zinc-800 shadow-2xs mx-auto" loading="lazy" onerror="this.style.display='none'; if(this.parentElement) this.parentElement.style.display='none';" /></span>`;
        return saveImageToken(html);
      }
      return '';
    });

    // Extract raw <img> tags
    processed = processed.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (fullTag, src) => {
      if (src && src.trim()) {
        const html = `<span class="my-2 max-w-full inline-block"><img src="${src.trim()}" class="max-h-[280px] max-w-full object-contain rounded-xl border border-slate-200/80 dark:border-zinc-800 shadow-2xs mx-auto" loading="lazy" onerror="this.style.display='none'; if(this.parentElement) this.parentElement.style.display='none';" /></span>`;
        return saveImageToken(html);
      }
      return '';
    });

      // Extract JSON widgets (MindMap, InteractiveGraph, InteractiveTable)
      processed = processed.replace(/```(mindmap|graph|chart|interactive-table)\s*\r?\n([\s\S]*?)```/gi, (_, lang, json) => {
        const langLower = lang.toLowerCase();
        let data: any = null;
        try {
          data = JSON.parse(json.trim());
        } catch {
          try {
            const safe = json.trim()
              .replace(/\/\/.*$/gm, '')
              .replace(/,\s*([\]}])/g, '$1')
              .replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
            data = JSON.parse(safe);
          } catch (e) {
            console.warn(`Could not parse ${langLower} JSON payload:`, e);
          }
        }

        if (data && typeof data === 'object') {
          const id = Date.now().toString() + Math.random().toString().slice(2, 6);
          const html = `<div id="widget-${id}" class="react-widget-mount my-4 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800" data-widget-type="${langLower}" data-widget-payload="${encodeURIComponent(JSON.stringify(data))}"></div>`;
          return saveCodeToken(html);
        }

        // Graceful fallback to formatted code container instead of broken UI
        const cleanCode = escapeHtml(json.trim());
        const html = `<div class="my-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#121316] p-4 text-xs font-mono overflow-x-auto"><div class="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">${langLower} data</div><pre><code>${cleanCode}</code></pre></div>`;
        return saveCodeToken(html);
      });

      // Extract code blocks first to protect them from other parsing
      processed = processed.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const rawCode = code.trim();
        const langLower = (lang || '').toLowerCase().trim();
        
        // If code block explicitly contains a table or is markdown table, leave it for table parsing
        if (
          langLower === 'table' ||
          langLower === 'markdown' ||
          (!langLower && rawCode.split('\n').some(l => l.trim().startsWith('|') && l.trim().includes('|', 1)))
        ) {
          if (rawCode.split('\n').some(l => l.trim().includes('|'))) {
            return `\n\n${rawCode}\n\n`;
          }
        }

        const cleanCode = escapeHtml(rawCode);
        const encodedCode = encodeURIComponent(rawCode);
        const langLabel = (lang ? lang.trim() : 'CODE').toUpperCase();
        const isPlottingScript = /matplotlib|plt\.|sns\.|fig\.|plt\.show/i.test(rawCode);
        
        const codeBlockHtml = `<div class="relative group/code-export ${isPlottingScript ? 'my-2' : 'my-4'} rounded-xl border border-slate-800 bg-[#0d1017] text-[#cdd6f4] overflow-hidden shadow-lg">` +
          `<div class="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-slate-800 text-[11px] text-slate-400 select-none">` +
            `<div class="flex items-center gap-2">` +
              `<span class="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block"></span>` +
              `<span class="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block"></span>` +
              `<span class="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block"></span>` +
              `<span class="ml-2 font-mono font-bold text-blue-400 tracking-widest text-[10px]">${langLabel}</span>` +
            `</div>` +
            `<div class="flex items-center gap-1.5">` +
              `<button type="button" data-code-snippet="${encodedCode}" class="code-copy-btn px-2.5 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 font-medium flex items-center gap-1.5 transition-all text-[11px] cursor-pointer" title="Copy code snippet to clipboard">` +
                `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>` +
                `<span class="copy-btn-text">Copy Code</span>` +
              `</button>` +
              `<button type="button" data-edit-code="${encodedCode}" data-code-lang="${langLabel}" class="px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 font-semibold flex items-center gap-1.5 transition-all text-[11px] cursor-pointer" title="Prompt Gemini to modify this code">` +
                `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>` +
                `<span>Edit with AI</span>` +
              `</button>` +
            `</div>` +
          `</div>` +
          `<pre class="p-4 text-xs font-mono overflow-x-auto leading-relaxed text-slate-100 selection:bg-blue-600 selection:text-white"><code>${cleanCode}</code></pre>` +
        `</div>`;

        if (isPlottingScript) {
          const collapsibleHtml = `<details class="my-3 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/80 dark:bg-[#12141d] overflow-hidden group/plot-details">` +
            `<summary class="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer select-none flex items-center justify-between bg-slate-100/70 dark:bg-zinc-800/50">` +
              `<span class="flex items-center gap-2">🐍 <span class="font-bold text-slate-700 dark:text-zinc-200">Python Plotting Script</span> <span class="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">(Click to show code)</span></span>` +
            `</summary>` +
            `<div class="p-2">${codeBlockHtml}</div>` +
          `</details>`;
          return saveCodeToken(collapsibleHtml);
        }

        return saveCodeToken(codeBlockHtml);
      });

      // A. Extract \[ ... \] display blocks
      processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
        return saveToken(renderMathToken(math, true), `$$${math}$$`);
      });

      // B. Extract $$ ... $$ display blocks
      processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
        return saveToken(renderMathToken(math, true), `$$${math}$$`);
      });

      // C. Extract \( ... \) inline blocks
      processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
        return saveToken(renderMathToken(math, false), `$${math}$`);
      });

      // D. Extract $ ... $ inline blocks
      processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
        return saveToken(renderMathToken(math, false), `$${math}$`);
      });

      // E. Extract raw unwrapped \begin{...} ... \end{...} environments
      processed = processed.replace(/(\\begin\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|aligned|cases|array)\}[\s\S]+?\\end\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|aligned|cases|array)\})/gi, (match) => {
        return saveToken(renderMathToken(match, false), `$$${match}$$`);
      });

      // F. Match and extract full unwrapped LaTeX formulas & equations in mixed sentences (e.g. \lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e)
      processed = extractUnwrappedLatexExpressions(processed, saveToken);

      // G. Handle remaining individual Greek letters, operators, relations, and short math tokens
      const ISOLATED_COMMANDS_REGEX = new RegExp(
        `(?:\\\\(?:${LATEX_MATH_COMMAND_NAMES.join('|')})\\b(?![a-zA-Z\\}])|` +
        `\\\\(?:vec|hat|bar|tilde|dot|ddot)\\{[^{}]+\\}|` +
        `\\b[a-zA-Z]\\^\\{[^{}]+\\}|\\b[a-zA-Z]_\\{[^{}]+\\}|` +
        `\\b[a-zA-Z]_[0-9a-zA-Z]\\b|\\b[a-zA-Z]\\^[0-9a-zA-Z]\\b)`,
        'g'
      );
      processed = processed.replace(ISOLATED_COMMANDS_REGEX, (match) => {
        if (
          match.includes('\uFFF0') ||
          match.includes('\uFFF1') ||
          match.includes('§§') ||
          match.includes('<') ||
          match.includes('>') ||
          match.includes('class=')
        ) {
          return match;
        }
        return saveToken(renderMathToken(match, false), `$${match}$`);
      });

      const restoreRawMath = (text: string): string => {
        return text.replace(/\uFFF0MTK(\d+)\uFFF1|§§MATH_TOKEN_(\d+)§§/g, (_, idx1, idx2) => {
          const idx = parseInt(idx1 || idx2, 10);
          return rawMathTokens[idx] ?? '';
        });
      };

      // Helper: check if a line is a markdown table separator row e.g. |---|---| or :---|---: or ---|---
      const isTableSeparatorLine = (str: string): boolean => {
        const trimmed = str.trim();
        if (!trimmed) return false;
        return /^\|?[\s:+\-|]+\|?$/.test(trimmed) && trimmed.includes('-') && (trimmed.includes('|') || trimmed.includes('+'));
      };

      // Helper: check if a line can be part of a markdown or TSV table
      const isTableRowLine = (str: string): boolean => {
        const trimmed = str.trim();
        if (!trimmed) return false;
        if (isTableSeparatorLine(trimmed)) return true;

        // Standard markdown row starting with pipe and ending with pipe
        if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) return true;

        // Ignore standalone math lines containing absolute values or math functions (that are NOT markdown tables)
        const isMathWithAbsoluteValues = /(?:ln|log|exp|sin|cos|tan|sec|csc|cot|det|abs|u|v|w|x|y|z)\s*\|\s*[^|\n]+\s*\||\\(?:left|right|ln|det)\s*\|/i.test(trimmed);
        if (isMathWithAbsoluteValues) return false;

        // Standard markdown row starting with pipe
        if (trimmed.startsWith('|') && trimmed.includes('|', 1)) return true;

        // Tab-delimited row from Google Sheets or Docs export
        if (trimmed.includes('\t') && trimmed.split('\t').length >= 2) return true;

        return false;
      };

      // Helper to build modern Google AI / Google Docs style markdown table with responsive scroll, minimal borders, and action buttons
      const renderMarkdownTable = (rows: string[]) => {
        if (rows.length < 1) return '';

        const hasSeparator = rows.length >= 2 && isTableSeparatorLine(rows[1]);
        let headerCells = splitMarkdownTableCells(rows[0]);
        let bodyRows: string[] = [];
        let rawColAlignments: string[] = [];

        if (hasSeparator) {
          const sepCells = splitMarkdownTableCells(rows[1]);
          rawColAlignments = sepCells.map((c) => {
            if (c.startsWith(':') && c.endsWith(':')) return 'text-center';
            if (c.endsWith(':')) return 'text-right';
            return 'text-left';
          });
          bodyRows = rows.slice(2);
        } else {
          bodyRows = rows.slice(1);
        }

        // Determine target column count
        const splitBody = bodyRows.map(r => splitMarkdownTableCells(r)).filter(cells => cells.length > 0 && (cells.length > 1 || cells[0]));
        let maxCols = headerCells.length;
        for (const rowCells of splitBody) {
          if (rowCells.length > maxCols) {
            maxCols = rowCells.length;
          }
        }
        if (maxCols === 0) maxCols = 1;

        // Pad headers if body has more distinct columns
        while (headerCells.length < maxCols) {
          headerCells.push(`Column ${headerCells.length + 1}`);
        }

        const targetCols = headerCells.length;
        const colAlignments: string[] = [];
        for (let i = 0; i < targetCols; i++) {
          colAlignments.push(rawColAlignments[i] || 'text-left');
        }

        // Check if column 0 is a question number / index column (e.g. Q#, #, No., Q1, 1, Question No., Sr No, Sl No)
        const isIndexColumn = (colIdx: number): boolean => {
          if (colIdx !== 0) return false;
          const h = (headerCells[0] || '').replace(/[*_`#]/g, '').trim().toLowerCase();
          if (/^(?:q|q\.|q#|#|no|no\.|s\.?no\.?|sr\.?no\.?|sl\.?no\.?|step|item|id|index|idx|question|question\s*no\.?|question\s*number|question\s*#|q\.?\s*no\.?|q\.?\s*#)$/i.test(h)) return true;
          if (/^(?:q|#|question)\s*\d+$/i.test(h)) return true;
          if (splitBody.length > 0 && splitBody.every(r => /^(?:q|#|step|question)?\s*0?\d+$/i.test((r[0] || '').replace(/[*_`]/g, '').trim()))) {
            return true;
          }
          return false;
        };

        const rawMarkdownTable = restoreRawMath(rows.join('\n'));
        const encodedTable = encodeURIComponent(rawMarkdownTable);
        const currentFontSize = getPreferredTableFontSize();
        const fontConfig = TABLE_FONT_SIZE_CONFIG[currentFontSize] || TABLE_FONT_SIZE_CONFIG.large;

        // Structured square container with minimal clean square borders and responsive scrolling
        let tableHtml = '<div class="my-4 w-full select-text group/table-export">';
        tableHtml += '<div class="table-panel-box overflow-x-auto w-full max-w-full rounded-none border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-[#0c0d14] shadow-xs [scrollbar-width:thin] scrollbar-thin touch-auto overscroll-x-contain">';
        tableHtml += `<table class="w-full min-w-full text-left border-collapse ${fontConfig.table} leading-relaxed" data-table-root data-current-size="${currentFontSize}">`;

        // Minimal header with background tint, solid divider, and clear column separation
        tableHtml += '<thead class="bg-slate-50/90 dark:bg-zinc-800/40 border-b border-slate-200/90 dark:border-zinc-800 select-none">';
        tableHtml += '<tr class="divide-x divide-slate-200/70 dark:divide-zinc-800/80">';
        headerCells.forEach((cell, idx) => {
          const isIndex = isIndexColumn(idx);
          const align = isIndex ? 'text-center' : (colAlignments[idx] || 'text-left');
          const widthClass = isIndex
            ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 sm:px-2 py-3 text-center shrink-0'
            : `${fontConfig.th} min-w-[100px] sm:min-w-[130px] break-words ${align}`;
          tableHtml += `<th class="${widthClass} text-slate-800 dark:text-zinc-200 font-bold align-top whitespace-normal tracking-tight">`;
          tableHtml += `<span>${formatTableCellContent(cell)}</span>`;
          tableHtml += '</th>';
        });
        tableHtml += '</tr></thead>';

        // Body rows with subtle hover, cell dividers, and crisp padding
        if (splitBody.length > 0) {
          tableHtml += '<tbody class="divide-y divide-slate-100 dark:divide-zinc-800/40">';
          splitBody.forEach((rawCells) => {
            const cells: string[] = [];
            if (rawCells.length === targetCols) {
              cells.push(...rawCells);
            } else if (rawCells.length < targetCols) {
              cells.push(...rawCells);
              while (cells.length < targetCols) {
                cells.push('');
              }
            } else {
              for (let i = 0; i < targetCols - 1; i++) {
                cells.push(rawCells[i]);
              }
              cells.push(rawCells.slice(targetCols - 1).join(' | '));
            }

            tableHtml += '<tr class="divide-x divide-slate-100 dark:divide-zinc-800/30 transition-colors hover:bg-slate-50/70 dark:hover:bg-zinc-800/20">';
            cells.forEach((c, idx) => {
              const isIndex = isIndexColumn(idx);
              const align = isIndex ? 'text-center' : (colAlignments[idx] || 'text-left');
              const cellClasses = isIndex
                ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 py-3 sm:px-2 sm:py-3.5 text-center font-bold text-slate-900 dark:text-zinc-100 align-top shrink-0'
                : `${fontConfig.td} text-slate-800 dark:text-zinc-200 align-top min-w-[100px] sm:min-w-[130px] break-words ${align}`;
              tableHtml += `<td class="${cellClasses}">${formatTableCellContent(c)}</td>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody>';
        }
        tableHtml += '</table></div>';

        // Action Toolbar at bottom of the table
        if (tableActions !== 'none') {
          tableHtml += '<div class="flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/60 select-none flex-wrap px-0.5">';

          tableHtml += '<div class="flex items-center gap-1 sm:gap-1.5 flex-wrap">';
          // 1. Copy Table Button (Always included when toolbar is enabled)
          tableHtml += `<button type="button" data-copy-table="${encodedTable}" class="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/80 dark:hover:bg-zinc-800/80 transition-colors text-[11px] sm:text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap bg-transparent border-0 shadow-none" title="Copy clean table for Google Docs / Sheets">`;
          tableHtml += '<svg class="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
          tableHtml += '<span class="copy-table-text">Copy<span class="hidden xs:inline sm:inline"> Table</span></span>';
          tableHtml += '</button>';

          if (tableActions === 'all') {
            // 2. Save to Note Button
            tableHtml += `<button type="button" data-save-table-note="${encodedTable}" class="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/80 dark:hover:bg-zinc-800/80 transition-colors text-[11px] sm:text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap bg-transparent border-0 shadow-none" title="Save this table to Notes Repository">`;
            tableHtml += '<svg class="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
            tableHtml += '<span class="save-table-note-text">Save<span class="hidden xs:inline sm:inline"> to Note</span></span>';
            tableHtml += '</button>';

            // 3. Edit with AI Button
            tableHtml += `<button type="button" data-edit-table="${encodedTable}" class="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-[11px] sm:text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap bg-transparent border-0 shadow-none" title="Edit this table with AI in Canvas Studio">`;
            tableHtml += '<svg class="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3Z"/></svg>';
            tableHtml += '<span>Edit<span class="hidden xs:inline sm:inline"> with AI</span></span>';
            tableHtml += '</button>';

            // 4. Retry Button
            tableHtml += `<button type="button" data-retry-table="${encodedTable}" class="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-md text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/80 dark:hover:bg-zinc-800/80 transition-colors text-[11px] sm:text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap bg-transparent border-0 shadow-none" title="Regenerate table response with AI">`;
            tableHtml += '<svg class="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';
            tableHtml += '<span class="retry-table-text">Retry</span>';
            tableHtml += '</button>';
          }
          tableHtml += '</div>';

          // Table Font Size Controls on Chat Table: 2 font options (A+ and A++) in a single button
          const isLarge = currentFontSize === 'large';
          tableHtml += `<button type="button" data-table-font-toggle class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-transparent hover:bg-slate-100/80 dark:hover:bg-zinc-800/80 text-xs font-semibold transition-all cursor-pointer border-0 shadow-none select-none" title="Toggle table font size (A+ / A++)">`;
          tableHtml += `<span class="${isLarge ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}">A+</span>`;
          tableHtml += `<span class="text-slate-300 dark:text-zinc-600 text-[10px]">/</span>`;
          tableHtml += `<span class="${!isLarge ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}">A++</span>`;
          tableHtml += '</button>';

          tableHtml += '</div>';
        }

        tableHtml += '</div>';
        return tableHtml;
      };

      // H. Process Markdown tables BEFORE inline code so backticks in tables are parsed in context
      const lines = processed.split('\n');
      let inTable = false;
      let tableRows: string[] = [];
      const newLines: string[] = [];

      const isValidTableBlock = (rows: string[]): boolean => {
        if (rows.length === 0) return false;
        if (rows.length >= 2) {
          return rows.some((r) => isTableSeparatorLine(r)) || rows.filter((r) => r.trim().startsWith('|') || r.includes('\t')).length >= 2;
        }
        const r = rows[0].trim();
        const isMathWithPipes = /(?:ln|log|exp|sin|cos|tan|sec|csc|cot|det|abs)\s*\||\\(?:left|right|ln|det)\s*\||\|[a-zA-Z0-9\s()+-/*^]+\|/i.test(r);
        return r.startsWith('|') && r.endsWith('|') && r.split('|').length >= 4 && !isMathWithPipes;
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isRow = isTableRowLine(line);

        if (isRow) {
          inTable = true;
          if (trimmed.includes('\t') && !trimmed.includes('|')) {
            const cols = trimmed.split('\t').map((c) => c.trim());
            tableRows.push(`| ${cols.join(' | ')} |`);
          } else {
            tableRows.push(trimmed);
          }
        } else {
          if (inTable) {
            if (isValidTableBlock(tableRows)) {
              newLines.push(saveTableToken(renderMarkdownTable(tableRows)));
            } else {
              newLines.push(...tableRows);
            }
            tableRows = [];
            inTable = false;
          }
          newLines.push(line);
        }
      }
      if (inTable) {
        if (isValidTableBlock(tableRows)) {
          newLines.push(saveTableToken(renderMarkdownTable(tableRows)));
        } else {
          newLines.push(...tableRows);
        }
      }
      processed = newLines.join('\n');

      // I. Process UI Widgets in body text: Progress bars, Color badges, Trend badges, Stars
      processed = processed.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, valStr) => {
        const val = Math.min(100, Math.max(0, parseInt(valStr, 10)));
        const barColor = val >= 75 
          ? 'bg-emerald-500 dark:bg-emerald-400' 
          : val >= 40 
            ? 'bg-amber-500 dark:bg-amber-400' 
            : 'bg-rose-500 dark:bg-rose-400';
        const html = `<span class="inline-flex items-center gap-2 min-w-[95px] w-auto max-w-[140px] my-0.5 align-middle"><span class="flex-1 h-2 rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden shadow-2xs min-w-[60px] inline-block"><span class="h-full rounded-full transition-all duration-300 ${barColor} block" style="width: ${val}%"></span></span><span class="text-[11px] font-mono font-semibold text-slate-700 dark:text-zinc-300 tabular-nums">${val}%</span></span>`;
        return saveToken(html, `[bar:${val}]`);
      });

      processed = processed.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, trendVal) => {
        return escapeHtml(trendVal.trim());
      });

      processed = processed.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\](?:\s*([^\[\]`|<>\n]+))?/gi, (_, colorName, textAfter) => {
        const trimmedText = (textAfter || '').trim();
        if (trimmedText) return escapeHtml(trimmedText);
        return '';
      });

      // J. Process inline `code`
      processed = processed.replace(/`([^`\n]+)`/g, (_, code) => {
        const html = `<code class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#222530] text-blue-600 dark:text-blue-400 font-mono text-[11px] border border-slate-200/60 dark:border-[#2e3240]">${escapeHtml(code)}</code>`;
        return saveCodeToken(html);
      });

      // Convert horizontal rules: ---, ***, ___
      processed = processed.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '<hr class="my-3 border-t border-slate-200/80 dark:border-zinc-800" />');

      // Convert Markdown blockquote options / lines starting with >
      // e.g. "> * (A) text" -> "• (A) text"
      processed = processed.replace(/^[\s]*>[\s]*[\*\-]\s+(.*$)/gm, '<span class="inline-block pl-2">• $1</span>');
      // e.g. empty ">" line -> empty spacer
      processed = processed.replace(/^[\s]*>[\s]*$/gm, '');
      // e.g. "> text" -> clean indented quote line
      processed = processed.replace(/^[\s]*>\s+(.*$)/gm, '<span class="inline-block pl-2 border-l-2 border-blue-400/40 my-0.5">$1</span>');

      // Convert Markdown bullet items "* " or "- " at line start to "• " bullets
      processed = processed.replace(/^[\s]*[\*\-]\s+(.*$)/gm, '• $1');

      // Convert Markdown images ![alt](url) to styled responsive <img>
      processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, altText, imgUrl) => {
        const cleanAlt = escapeHtml(altText || 'Visual');
        const cleanUrl = imgUrl.trim();
        const html = `<div class="my-3 text-center select-none"><img src="${cleanUrl}" alt="${cleanAlt}" class="max-h-[550px] max-w-full object-contain rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-md mx-auto my-2" loading="lazy" onerror="this.style.display='none'; if(this.parentElement) this.parentElement.style.display='none';" /></div>`;
        return saveToken(html, `![${altText}](${imgUrl})`);
      });

      // Convert Markdown bold **text** to <strong>text</strong>
      processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Convert Markdown italic *text* strictly (single line, no space adjacent to inner asterisk)
      processed = processed.replace(/(?<=^|\s)\*(\S[^*\n]*?\S|\S)\*(?=\s|$|[.,;:!?])/g, '<em>$1</em>');
      // Convert Markdown headings #, ##, ###
      processed = processed.replace(/^### (.*$)/gm, '<h3 class="font-semibold text-[15px] sm:text-base my-1.5">$1</h3>');
      processed = processed.replace(/^## (.*$)/gm, '<h2 class="font-bold text-base sm:text-lg my-2">$1</h2>');
      processed = processed.replace(/^# (.*$)/gm, '<h1 class="font-black text-lg sm:text-xl my-2 text-slate-900 dark:text-white">$1</h1>');

      // Extract and preserve HTML <table> blocks before converting \n to <br />
      processed = processed.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
        let styled = match;
        if (!styled.includes('border-collapse')) {
          styled = styled.replace(/<table/i, '<table class="w-full min-w-full text-left border-collapse text-[13.5px] sm:text-[14px] leading-relaxed"');
        }
        const wrapped = `<div class="my-4 w-full select-text group/table-export"><div class="table-panel-box overflow-x-auto w-full max-w-full rounded-none border border-slate-200/90 dark:border-zinc-700/80 bg-white dark:bg-[#14161f] shadow-xs [scrollbar-width:thin] touch-auto overscroll-x-contain">${styled}</div></div>`;
        return saveTableToken(wrapped);
      });

      // Preserve line breaks (except where HTML elements like div/table already handle it)
      processed = processed.replace(/\n/g, '<br />');

      // Robust iterative multi-pass token restoration to resolve all nested tokens (tables, math, code)
      let restorePass = 0;
      while (
        restorePass < 10 &&
        (
          processed.includes('\uFFF0TTK') ||
          processed.includes('\uFFF0MTK') ||
          processed.includes('\uFFF0CTK') ||
          processed.includes('\uFFF0ITK') ||
          processed.includes('§§TABLE_TOKEN_') ||
          processed.includes('§§MATH_TOKEN_') ||
          processed.includes('§§CODE_TOKEN_') ||
          processed.includes('___MATH_TOKEN_') ||
          processed.includes('__MATH_TOKEN_') ||
          processed.includes('___CODE_TOKEN_') ||
          processed.includes('__CODE_TOKEN_')
        )
      ) {
        const prev = processed;

        // 1. Restore Table tokens
        processed = processed.replace(/\uFFF0TTK(\d+)\uFFF1/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return tableTokens[idx] ?? '';
        });
        processed = processed.replace(/§§TABLE_TOKEN_(\d+)§§/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return tableTokens[idx] ?? '';
        });

        // 2. Restore Image tokens
        processed = processed.replace(/\uFFF0ITK(\d+)\uFFF1/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return imageTokens[idx] ?? '';
        });
        processed = processed.replace(/§§IMAGE_TOKEN_(\d+)§§/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return imageTokens[idx] ?? '';
        });
        processed = processed.replace(/_{2,3}IMAGE_TOKEN_(\d+)_{2,3}/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return imageTokens[idx] ?? '';
        });

        // 3. Restore Code tokens
        processed = processed.replace(/\uFFF0CTK(\d+)\uFFF1/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return codeTokens[idx] ?? '';
        });
        processed = processed.replace(/§§CODE_TOKEN_(\d+)§§/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return codeTokens[idx] ?? '';
        });
        processed = processed.replace(/_{2,3}CODE_TOKEN_(\d+)_{2,3}/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return codeTokens[idx] ?? '';
        });

        // 4. Restore Math tokens
        processed = processed.replace(/\uFFF0MTK(\d+)\uFFF1/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return mathTokens[idx] ?? '';
        });
        processed = processed.replace(/§§MATH_TOKEN_(\d+)§§/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return mathTokens[idx] ?? '';
        });
        processed = processed.replace(/_{2,3}MATH_TOKEN_(\d+)_{2,3}/g, (_, idxStr) => {
          const idx = parseInt(idxStr, 10);
          return mathTokens[idx] ?? '';
        });

        if (processed === prev) break;
        restorePass++;
      }

      // Final sweep to guarantee no tokens remain unresolved even if surrounding delimiters were modified
      processed = processed.replace(/\uFFF0MTK(\d+)\uFFF1/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return mathTokens[idx] ?? '';
      });
      processed = processed.replace(/\uFFF0ITK(\d+)\uFFF1/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return imageTokens[idx] ?? '';
      });
      processed = processed.replace(/\uFFF0CTK(\d+)\uFFF1/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return codeTokens[idx] ?? '';
      });
      processed = processed.replace(/\uFFF0TTK(\d+)\uFFF1/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return tableTokens[idx] ?? '';
      });
      processed = processed.replace(/§*MATH_TOKEN_(\d+)§*/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return mathTokens[idx] ?? '';
      });
      processed = processed.replace(/§*IMAGE_TOKEN_(\d+)§*/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return imageTokens[idx] ?? '';
      });
      processed = processed.replace(/§*CODE_TOKEN_(\d+)§*/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return codeTokens[idx] ?? '';
      });
      processed = processed.replace(/§*TABLE_TOKEN_(\d+)§*/g, (_, idxStr) => {
        const idx = parseInt(idxStr, 10);
        return tableTokens[idx] ?? '';
      });

      return processed;
    });
  }, [inputStr, displayMode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetPortals, setWidgetPortals] = useState<Array<{ id: string; container: Element; node: React.ReactNode }>>([]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      setWidgetPortals([]);
      return;
    }

    const widgetMounts = el.querySelectorAll('.react-widget-mount:not(.mounted)');
    if (widgetMounts.length === 0) {
      setWidgetPortals((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const newPortals: Array<{ id: string; container: Element; node: React.ReactNode }> = [];

    widgetMounts.forEach((mount, idx) => {
      const type = mount.getAttribute('data-widget-type');
      const payloadEncoded = mount.getAttribute('data-widget-payload');

      if (type && payloadEncoded) {
        try {
          const payload = JSON.parse(decodeURIComponent(payloadEncoded));
          mount.classList.add('mounted');
          const id = `${type}-${idx}-${Date.now()}`;

          let node: React.ReactNode = null;
          if (type === 'mindmap') {
            node = <MindMapVisualizer data={payload} />;
          } else if (type === 'graph' || type === 'chart') {
            node = <InteractiveGraphWidget type={type as 'chart' | 'function'} {...payload} />;
          } else if (type === 'interactive-table') {
            node = <InteractiveTableWidget tableConfig={payload} />;
          }

          if (node) {
            newPortals.push({ id, container: mount, node });
          }
        } catch (e) {
          console.error('Failed to parse React widget payload', e);
        }
      }
    });

    setWidgetPortals(newPortals);
  }, [renderedHtml]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleContainerClick = (e: MouseEvent) => {
      const clickTarget = e.target as HTMLElement;

      // 0. TABLE FONT SIZE TOGGLE (2 options: A+ and A++ in a single button)
      const fontToggleBtn = clickTarget.closest('button[data-table-font-toggle], button[data-table-font]') as HTMLButtonElement | null;
      if (fontToggleBtn) {
        e.preventDefault();
        e.stopPropagation();

        const tableWrapper = fontToggleBtn.closest('.group\\/table-export') as HTMLElement | null;
        const table = tableWrapper ? tableWrapper.querySelector('table') : null;
        const currentSize = (table?.getAttribute('data-current-size') || getPreferredTableFontSize()) as TableFontSize;
        const newSize: TableFontSize = currentSize === 'large' ? 'xlarge' : 'large';
        setPreferredTableFontSize(newSize);

        if (tableWrapper && table) {
          const prevConfig = TABLE_FONT_SIZE_CONFIG[currentSize] || TABLE_FONT_SIZE_CONFIG.large;
          const newConfig = TABLE_FONT_SIZE_CONFIG[newSize] || TABLE_FONT_SIZE_CONFIG.large;

          prevConfig.table.split(' ').forEach(cls => table.classList.remove(cls));
          newConfig.table.split(' ').forEach(cls => table.classList.add(cls));
          table.setAttribute('data-current-size', newSize);

          table.querySelectorAll('th').forEach(th => {
            prevConfig.th.split(' ').forEach(cls => th.classList.remove(cls));
            newConfig.th.split(' ').forEach(cls => th.classList.add(cls));
          });

          table.querySelectorAll('td').forEach(td => {
            prevConfig.td.split(' ').forEach(cls => td.classList.remove(cls));
            newConfig.td.split(' ').forEach(cls => td.classList.add(cls));
          });

          tableWrapper.querySelectorAll('button[data-table-font-toggle]').forEach(b => {
            const isLarge = newSize === 'large';
            b.innerHTML = `<span class="${isLarge ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}">A+</span><span class="text-slate-300 dark:text-zinc-600 text-[10px]">/</span><span class="${!isLarge ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}">A++</span>`;
          });
        }
        return;
      }

      // 1. DOWNLOAD TABLE PNG
      const exportTableBtn = clickTarget.closest('button[data-export-table-png]') as HTMLButtonElement | null;
      if (exportTableBtn) {
        e.preventDefault();
        e.stopPropagation();

        const tableWrapper = exportTableBtn.closest('.group\\/table-export') as HTMLDivElement | null;
        if (tableWrapper) {
          const originalText = exportTableBtn.innerHTML;
          exportTableBtn.innerHTML = '<span class="inline-flex items-center gap-1"><svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Exporting...</span></span>';
          exportTableBtn.disabled = true;

          // Target only the table panel box to export
          const targetBox = (tableWrapper.querySelector('.table-panel-box') as HTMLElement) || tableWrapper;

          exportElementToPng(targetBox, `table-${Date.now()}.png`).catch((err) => {
            console.error('Failed to export markdown table as PNG:', err);
          }).finally(() => {
            exportTableBtn.innerHTML = originalText;
            exportTableBtn.disabled = false;
          });
        }
        return;
      }

      // 1B. OPEN IN GOOGLE SHEETS
      const openSheetsBtn = clickTarget.closest('button[data-open-sheets]') as HTMLButtonElement | null;
      if (openSheetsBtn) {
        e.preventDefault();
        e.stopPropagation();
        const encoded = openSheetsBtn.getAttribute('data-open-sheets') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          const lines = rawText.split('\n').filter(l => l.trim().startsWith('|'));
          const tsvRows: string[] = [];
          lines.forEach((line, idx) => {
            if (idx === 1 && line.includes('---')) return;
            const cells = line.split('|').slice(1, -1).map(c => {
              return c.trim()
                .replace(/\[color:\w+\]/g, '')
                .replace(/\[bar:\d+%?\]/g, '')
                .replace(/\[stars:[0-9.]+\]/g, '')
                .replace(/\[trend:[^\]]+\]/g, '')
                .trim();
            });
            tsvRows.push(cells.join('\t'));
          });
          const tsvContent = tsvRows.join('\n');
          navigator.clipboard.writeText(tsvContent).then(() => {
            const label = openSheetsBtn.querySelector('.sheets-btn-text');
            if (label) {
              const orig = label.textContent;
              label.textContent = 'Copied! Opening...';
              openSheetsBtn.classList.add('!bg-emerald-600', '!text-white');
              setTimeout(() => {
                label.textContent = orig;
                openSheetsBtn.classList.remove('!bg-emerald-600', '!text-white');
              }, 2500);
            }
            window.open('https://sheets.new', '_blank');
          }).catch(() => {
            window.open('https://sheets.new', '_blank');
          });
        }
        return;
      }

      // 1C. EXPAND TO TABLE CANVAS
      const expandTableBtn = clickTarget.closest('button[data-expand-table]') as HTMLButtonElement | null;
      if (expandTableBtn) {
        e.preventDefault();
        e.stopPropagation();
        const encoded = expandTableBtn.getAttribute('data-expand-table') || '';
        const rawText = decodeURIComponent(encoded);
        window.dispatchEvent(new CustomEvent('gemini-expand-table', {
          detail: {
            markdown: rawText,
            title: 'Gemini Table Canvas'
          }
        }));
        return;
      }

      // 1D. INTERACTIVE COLUMN SORTING
      const sortTh = clickTarget.closest('th[data-sort-col]') as HTMLTableCellElement | null;
      if (sortTh) {
        e.preventDefault();
        const table = sortTh.closest('table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const colIdx = parseInt(sortTh.getAttribute('data-sort-col') || '0', 10);
        const currentDir = sortTh.getAttribute('data-sort-dir') || 'none';
        const newDir = currentDir === 'asc' ? 'desc' : 'asc';

        // Reset other headers
        table.querySelectorAll('th[data-sort-col]').forEach((th) => {
          th.setAttribute('data-sort-dir', 'none');
          const icon = th.querySelector('.sort-icon');
          if (icon) icon.textContent = '⇅';
        });

        sortTh.setAttribute('data-sort-dir', newDir);
        const icon = sortTh.querySelector('.sort-icon');
        if (icon) icon.textContent = newDir === 'asc' ? '▲' : '▼';

        const allRows = Array.from(tbody.querySelectorAll('tr'));
        const dataRows = allRows.filter(r => r.getAttribute('data-summary-row') !== 'true');
        const summaryRows = allRows.filter(r => r.getAttribute('data-summary-row') === 'true');

        dataRows.sort((rowA, rowB) => {
          const cellA = rowA.children[colIdx]?.textContent?.trim() || '';
          const cellB = rowB.children[colIdx]?.textContent?.trim() || '';

          const cleanA = cellA.replace(/[$€£¥,%\s]/g, '');
          const cleanB = cellB.replace(/[$€£¥,%\s]/g, '');
          const numA = parseFloat(cleanA);
          const numB = parseFloat(cleanB);

          let comp = 0;
          if (!isNaN(numA) && !isNaN(numB) && cleanA !== '' && cleanB !== '') {
            comp = numA - numB;
          } else {
            comp = cellA.localeCompare(cellB, undefined, { numeric: true, sensitivity: 'base' });
          }
          return newDir === 'asc' ? comp : -comp;
        });

        dataRows.forEach(r => tbody.appendChild(r));
        summaryRows.forEach(r => tbody.appendChild(r));
        return;
      }

      // 2. COPY TABLE AS MARKDOWN AND RICH HTML (Pasting to Google Docs / Notes)
      const copyTableBtn = clickTarget.closest('button[data-copy-table]') as HTMLButtonElement | null;
      if (copyTableBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = copyTableBtn.getAttribute('data-copy-table') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          copyTableToClipboard(rawText).then(() => {
            const label = copyTableBtn.querySelector('.copy-table-text');
            if (label) {
              const original = label.textContent;
              label.textContent = 'Copied! ✓';
              copyTableBtn.classList.add('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
              setTimeout(() => {
                label.textContent = original;
                copyTableBtn.classList.remove('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
              }, 2000);
            }
          }).catch((err) => {
            console.warn('Clipboard copy error:', err);
          });
        }
        return;
      }

      // 2B. COPY TABLE AS TSV (Sheets / Excel)
      const copyTsvBtn = clickTarget.closest('button[data-copy-tsv]') as HTMLButtonElement | null;
      if (copyTsvBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = copyTsvBtn.getAttribute('data-copy-tsv') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          const lines = rawText.split('\n').filter(l => l.trim().startsWith('|'));
          // Exclude separator line (line 1)
          const tsvRows: string[] = [];
          lines.forEach((line, idx) => {
            if (idx === 1 && line.includes('---')) return;
            const cells = line.split('|').slice(1, -1).map(c => c.trim().replace(/\[color:\w+\]/g, '').replace(/\[bar:\d+%?\]/g, '').trim());
            tsvRows.push(cells.join('\t'));
          });
          const tsvContent = tsvRows.join('\n');
          navigator.clipboard.writeText(tsvContent).then(() => {
            const label = copyTsvBtn.querySelector('.copy-tsv-text');
            if (label) {
              const original = label.textContent;
              label.textContent = 'Copied TSV! ✓';
              copyTsvBtn.classList.add('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
              setTimeout(() => {
                label.textContent = original;
                copyTsvBtn.classList.remove('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
              }, 2000);
            }
          }).catch((err) => {
            console.warn('Clipboard TSV write error:', err);
          });
        }
        return;
      }

      // 2C. DOWNLOAD TABLE AS CSV
      const exportCsvBtn = clickTarget.closest('button[data-export-csv]') as HTMLButtonElement | null;
      if (exportCsvBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = exportCsvBtn.getAttribute('data-export-csv') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          const lines = rawText.split('\n').filter(l => l.trim().startsWith('|'));
          const csvRows: string[] = [];
          lines.forEach((line, idx) => {
            if (idx === 1 && line.includes('---')) return;
            const cells = line.split('|').slice(1, -1).map(c => {
              const clean = c.trim().replace(/\[color:\w+\]/g, '').replace(/\[bar:\d+%?\]/g, '').trim();
              if (clean.includes(',') || clean.includes('"') || clean.includes('\n')) {
                return `"${clean.replace(/"/g, '""')}"`;
              }
              return clean;
            });
            csvRows.push(cells.join(','));
          });
          const csvContent = csvRows.join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `table-${Date.now()}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        return;
      }

      // 3. EDIT TABLE BY OPENING TABLE CANVAS PAGE
      const editTableBtn = clickTarget.closest('button[data-edit-table]') as HTMLButtonElement | null;
      if (editTableBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = editTableBtn.getAttribute('data-edit-table') || '';
        const rawText = decodeURIComponent(encoded);
        const targetMessageId = clickTarget.closest('[data-message-id]')?.getAttribute('data-message-id') || undefined;
        
        window.dispatchEvent(new CustomEvent('gemini-open-table-canvas', {
          detail: {
            markdown: rawText,
            targetMessageId
          }
        }));

        window.dispatchEvent(new CustomEvent('gemini-edit-element', {
          detail: {
            type: 'table',
            content: rawText,
            title: 'Generated Table',
            targetMessageId
          }
        }));
        return;
      }

      // 3B. SAVE TABLE TO NOTES REPOSITORY
      const saveTableNoteBtn = clickTarget.closest('button[data-save-table-note]') as HTMLButtonElement | null;
      if (saveTableNoteBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = saveTableNoteBtn.getAttribute('data-save-table-note') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          const label = saveTableNoteBtn.querySelector('.save-table-note-text');
          if (label) {
            const original = label.textContent;
            label.textContent = 'Saved to Note ✓';
            saveTableNoteBtn.classList.add('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
            setTimeout(() => {
              label.textContent = original;
              saveTableNoteBtn.classList.remove('!bg-emerald-50', '!text-emerald-600', 'dark:!bg-emerald-950/40');
            }, 2500);
          }

          window.dispatchEvent(new CustomEvent('gemini-save-table-note', {
            detail: {
              markdown: rawText,
              title: 'Table Note'
            }
          }));
        }
        return;
      }

      // 3C. RETRY / REGENERATE TABLE RESPONSE
      const retryTableBtn = clickTarget.closest('button[data-retry-table]') as HTMLButtonElement | null;
      if (retryTableBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = retryTableBtn.getAttribute('data-retry-table') || '';
        const rawText = decodeURIComponent(encoded);
        const targetMessageId = clickTarget.closest('[data-message-id]')?.getAttribute('data-message-id') || undefined;

        const label = retryTableBtn.querySelector('.retry-table-text');
        if (label) {
          const original = label.textContent;
          label.textContent = 'Retrying...';
          retryTableBtn.classList.add('!text-blue-600', 'dark:!text-blue-400');
          setTimeout(() => {
            label.textContent = original;
            retryTableBtn.classList.remove('!text-blue-600', 'dark:!text-blue-400');
          }, 2000);
        }

        window.dispatchEvent(new CustomEvent('gemini-retry-table', {
          detail: {
            markdown: rawText,
            targetMessageId
          }
        }));
        return;
      }

      // 4. COPY CODE SNIPPET
      const copyCodeBtn = clickTarget.closest('button[data-code-snippet]') as HTMLButtonElement | null;
      if (copyCodeBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = copyCodeBtn.getAttribute('data-code-snippet') || '';
        const rawText = decodeURIComponent(encoded);
        if (rawText) {
          navigator.clipboard.writeText(rawText).then(() => {
            const label = copyCodeBtn.querySelector('.copy-btn-text');
            if (label) {
              const orig = label.textContent;
              label.textContent = 'Copied! ✓';
              copyCodeBtn.classList.add('!bg-emerald-600', '!text-white', '!border-emerald-500');
              setTimeout(() => {
                label.textContent = orig;
                copyCodeBtn.classList.remove('!bg-emerald-600', '!text-white', '!border-emerald-500');
              }, 2000);
            }
          }).catch((err) => {
            console.warn('Clipboard write error:', err);
          });
        }
        return;
      }

      // 5. DOWNLOAD CODE PNG
      const exportCodePngBtn = clickTarget.closest('button[data-export-code-png]') as HTMLButtonElement | null;
      if (exportCodePngBtn) {
        e.preventDefault();
        e.stopPropagation();

        const codeWrapper = exportCodePngBtn.closest('.group\\/code-export') as HTMLDivElement | null;
        if (codeWrapper) {
          const originalText = exportCodePngBtn.innerHTML;
          exportCodePngBtn.innerHTML = `Exporting...`;
          exportCodePngBtn.disabled = true;

          // Temporarily hide action buttons
          const actionsDiv = codeWrapper.querySelector('.flex.items-center.gap-1\\.5') as HTMLDivElement | null;
          const origDisplay = actionsDiv ? actionsDiv.style.display : '';
          if (actionsDiv) actionsDiv.style.display = 'none';

          safeHtml2Canvas(codeWrapper, {
            useCORS: true,
            backgroundColor: '#12141c',
            scale: 2.5,
            logging: false,
            scrollX: 0,
            scrollY: 0,
          }).then((canvas) => {
            const dataUri = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUri;
            link.setAttribute('download', `code-${Date.now()}.png`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }).catch((err) => {
            console.error('Failed to export code as PNG:', err);
          }).finally(() => {
            if (actionsDiv) actionsDiv.style.display = origDisplay;
            exportCodePngBtn.innerHTML = originalText;
            exportCodePngBtn.disabled = false;
          });
        }
        return;
      }

      // 6. EDIT CODE BY PROMPTING
      const editCodeBtn = clickTarget.closest('button[data-edit-code]') as HTMLButtonElement | null;
      if (editCodeBtn) {
        e.preventDefault();
        e.stopPropagation();

        const encoded = editCodeBtn.getAttribute('data-edit-code') || '';
        const rawText = decodeURIComponent(encoded);
        const lang = editCodeBtn.getAttribute('data-code-lang') || 'CODE';
        const targetMessageId = clickTarget.closest('[data-message-id]')?.getAttribute('data-message-id') || undefined;
        window.dispatchEvent(new CustomEvent('gemini-edit-element', {
          detail: {
            type: 'code',
            content: rawText,
            language: lang,
            title: 'Code Snippet',
            targetMessageId
          }
        }));
        return;
      }
    };

    const handleContainerInput = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const filterInput = target.closest('input[data-table-filter]') as HTMLInputElement | null;
      if (!filterInput) return;

      const query = filterInput.value.trim().toLowerCase();
      const tableWrapper = filterInput.closest('.group\\/table-export') as HTMLElement | null;
      if (!tableWrapper) return;

      const tbody = tableWrapper.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      let visibleCount = 0;

      rows.forEach((row) => {
        const isSummary = row.getAttribute('data-summary-row') === 'true';
        if (!query) {
          row.style.display = '';
          if (!isSummary) visibleCount++;
          return;
        }

        const text = row.textContent?.toLowerCase() || '';
        const matches = text.includes(query);
        if (matches && !isSummary) {
          row.style.display = '';
          visibleCount++;
        } else if (isSummary) {
          row.style.display = visibleCount > 0 ? '' : 'none';
        } else {
          row.style.display = 'none';
        }
      });

      const counter = tableWrapper.querySelector('.table-row-counter');
      if (counter) {
        const totalDataRows = rows.filter(r => r.getAttribute('data-summary-row') !== 'true').length;
        counter.textContent = query ? `${visibleCount} of ${totalDataRows} rows` : `${totalDataRows} rows`;
      }
    };

    el.addEventListener('click', handleContainerClick);
    el.addEventListener('input', handleContainerInput);

    // Google Docs style interactive column and row resizing
    const cleanupResizers = attachTableResizers(el);

    return () => {
      cleanupResizers();
      el.removeEventListener('click', handleContainerClick);
      el.removeEventListener('input', handleContainerInput);
    };
  }, [renderedHtml]);

  return (
    <div 
      ref={containerRef}
      className={`math-content leading-relaxed max-w-full w-full min-w-0 [text-rendering:optimizeLegibility] [-webkit-font-smoothing:antialiased] [-moz-osx-font-smoothing:grayscale] ${className}`}
    >
      <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      {widgetPortals.map((portal) => 
        portal.container && portal.container.isConnected
          ? createPortal(portal.node, portal.container, portal.id)
          : null
      )}
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to parse a markdown table into a clean HTML table for Google Docs / Sheets pasting
function buildHtmlTableFromMarkdown(mdTable: string): string {
  const lines = mdTable.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (lines.length < 2) return '';

  const splitRow = (row: string): string[] => {
    let trimmed = row;
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    const rawCells = trimmed.split(/(?<!\\)\|/);
    return rawCells.map(c => c.replace(/\\\|/g, '|').trim());
  };

  const headers = splitRow(lines[0]);
  const sep = lines[1];
  const hasSep = sep && sep.includes('---');
  const startIdx = hasSep ? 2 : 1;
  const bodyRows = lines.slice(startIdx);

  const alignments = hasSep ? splitRow(sep).map(c => {
    if (c.startsWith(':') && c.endsWith(':')) return 'center';
    if (c.endsWith(':')) return 'right';
    return 'left';
  }) : [];

  const formatCellForHtmlDocs = (cell: string): string => {
    let clean = (cell || '').trim();
    if (!clean) return '-';

    // Format stars: [stars:4] -> Clean Unicode stars without background/orange highlight
    clean = clean.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, n) => {
      const num = parseFloat(n) || 0;
      const full = Math.min(5, Math.max(0, Math.floor(num)));
      const hasHalf = num % 1 >= 0.4 && num % 1 <= 0.8;
      const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
      const starsStr = '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(empty);
      return `${starsStr} (${num}/5)`;
    });

    // Format progress bar: [bar:80%] -> Clean 80% without colored box
    clean = clean.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, val) => {
      return `${val}%`;
    });

    // Format trend indicators: [trend:up] -> Clean Unicode indicators without background pills
    clean = clean.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, tVal) => {
      const t = tVal.trim().toLowerCase();
      if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) {
        return `▲ ${escapeHtml(tVal.trim())}`;
      } else if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) {
        return `▼ ${escapeHtml(tVal.trim())}`;
      }
      return `▬ ${escapeHtml(tVal.trim())}`;
    });

    // Format color badges: [color:amber] Boundary -> Clean text without background highlight
    clean = clean.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\]\s*([^<]*)/gi, (_, _colorName, textAfter) => {
      const label = textAfter.trim();
      if (!label) return '';
      return escapeHtml(label);
    });

    // Format bold and code (pure text styling without background color fill)
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    clean = clean.replace(/`([^`]+)`/g, '<code style="font-family: Consolas, Menlo, Monaco, monospace; color: #1e293b;">$1</code>');
    clean = clean.replace(/\n/g, '<br />');

    return clean;
  };

  let html = `<table style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; border: 1px solid #cbd5e1; font-size: 13px; line-height: 1.5; color: #0f172a;">`;
  
  // Header row - neutral clean background without colored text highlight
  html += `<thead><tr>`;
  headers.forEach((h, idx) => {
    const align = alignments[idx] || 'left';
    html += `<th style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: ${align}; background-color: #f8fafc; color: #0f172a; font-weight: 700;">${formatCellForHtmlDocs(h)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Body rows - completely unhighlighted clean cells
  bodyRows.forEach((rowStr) => {
    const cells = splitRow(rowStr);
    if (cells.length === 0 || (cells.length === 1 && !cells[0])) return;
    html += `<tr>`;
    cells.forEach((cell, idx) => {
      const align = alignments[idx] || 'left';
      html += `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: ${align}; vertical-align: top; color: #1e293b;">${formatCellForHtmlDocs(cell)}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  return html;
}
