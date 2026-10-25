/**
 * HTML Math Renderer
 * Scans an entire HTML document string or fragment, detects all math equations
 * ($...$, $$...$$, \(...\), \[...\], \begin{...}...\end{...}),
 * and replaces them with pre-rendered KaTeX HTML while ignoring scripts, styles, pre, and code blocks.
 */

import { renderKatexToString } from './katexCore';

const IGNORED_TAGS = new Set(['script', 'style', 'textarea', 'pre', 'code', 'svg']);

/**
 * Renders all math expressions inside an HTML string synchronously using DOMParser or regex.
 */
export function renderMathInHtmlDocument(html: string): string {
  if (!html || typeof html !== 'string') return html || '';

  // Quick check: If no math delimiters exist, return immediately with zero overhead
  if (
    !html.includes('$') &&
    !html.includes('\\(') &&
    !html.includes('\\[') &&
    !html.includes('\\begin')
  ) {
    return html;
  }

  // If running in browser environment with DOMParser available
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check if original had <html> or was a fragment
      const hasHtmlTag = /<html\b/i.test(html);
      const hasBodyTag = /<body\b/i.test(html);

      const targetRoot = doc.body;
      renderMathInDomSubtree(targetRoot);

      if (hasHtmlTag) {
        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      } else if (hasBodyTag) {
        return doc.body.innerHTML;
      } else {
        return doc.body.innerHTML;
      }
    } catch {
      // Fallback to regex-based scanning if DOMParser fails
      return renderMathInHtmlViaRegex(html);
    }
  }

  return renderMathInHtmlViaRegex(html);
}

/**
 * Scans a DOM node subtree and renders all math found in text nodes.
 */
export function renderMathInDomSubtree(rootNode: Node): void {
  if (!rootNode || typeof document === 'undefined') return;

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const val = node.nodeValue;
      if (!val) return NodeFilter.FILTER_REJECT;
      if (
        !val.includes('$') &&
        !val.includes('\\(') &&
        !val.includes('\\[') &&
        !val.includes('\\begin')
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName.toLowerCase();
      if (IGNORED_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.katex, .katex-display, .katex-html, .katex-scroll-wrapper')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  // Regex patterns for math detection
  // 1. Double dollars: $$ ... $$
  // 2. Display brackets: \[ ... \]
  // 3. Inline paren: \( ... \)
  // 4. Single dollars: $ ... $
  const combinedMathRegex = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\$\n]+?)\$/g;

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text) continue;

    combinedMathRegex.lastIndex = 0;
    if (!combinedMathRegex.test(text)) continue;
    combinedMathRegex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let matchedAny = false;

    while ((match = combinedMathRegex.exec(text)) !== null) {
      matchedAny = true;
      const matchStart = match.index;

      if (matchStart > lastIndex) {
        frag.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
      }

      // Identify delimiter type
      const isDisplay = Boolean(match[1] || match[2]);
      const mathContent = (match[1] || match[2] || match[3] || match[4] || '').trim();

      const renderedHtml = renderKatexToString(mathContent, {
        displayMode: isDisplay,
        addScrollWrapper: isDisplay,
        contentEditableFalse: true
      });

      const tempSpan = document.createElement('span');
      tempSpan.innerHTML = renderedHtml;

      while (tempSpan.firstChild) {
        frag.appendChild(tempSpan.firstChild);
      }

      lastIndex = combinedMathRegex.lastIndex;
    }

    if (matchedAny) {
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.substring(lastIndex)));
      }
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(frag, textNode);
      }
    }
  }
}

/**
 * Regex-based fallback for environments without full DOMParser
 */
function renderMathInHtmlViaRegex(html: string): string {
  // Regex that isolates tags and text
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    if (!text || (!text.includes('$') && !text.includes('\\(') && !text.includes('\\['))) {
      return text;
    }

    const mathPattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\$\n]+?)\$/g;
    return text.replace(mathPattern, (_m: string, d1: string, d2: string, i1: string, i2: string) => {
      const isDisplay = Boolean(d1 || d2);
      const math = (d1 || d2 || i1 || i2 || '').trim();
      return renderKatexToString(math, {
        displayMode: isDisplay,
        addScrollWrapper: isDisplay,
        contentEditableFalse: true
      });
    });
  });
}
