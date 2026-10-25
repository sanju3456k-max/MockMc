import { PrepareIframeHtmlOptions } from './iframe/types';
import { getInteractiveCanvasScript } from './iframe/interactiveCanvasScript';
import { getPaperImageAdjustmentScript } from './iframe/paperImageAdjustmentScript';
import { getCanvasImageEngineScript } from './iframe/canvasImageEngine';
import { getA4PaginationScript } from './iframe/a4PaginationScript';
import { getA4PrintSpecStyles, getFluidPrintSpecStyles, getDocumentPrintSpecStyles } from './iframe/iframeStyles';
import { sanitizeAndRepairCode } from '../../../lib/htmlNotesSync';
import { renderMathInHtmlDocument } from '../../../lib/mathPipeline/htmlMathRenderer';

export type { PrepareIframeHtmlOptions };
export { getInteractiveCanvasScript, getPaperImageAdjustmentScript, getCanvasImageEngineScript };

export interface PreparePrintHtmlOptions {
  code?: string;
  sideMarginMm?: number;
  verticalMarginMm?: number;
  totalLeftMarginMm?: number;
  fontSizePx?: number;
  isSlideMode?: boolean;
}

export function preparePrintHtml(options: PreparePrintHtmlOptions): string {
  const {
    code = '',
    sideMarginMm = 10,
    verticalMarginMm = 12,
    totalLeftMarginMm = 10,
    fontSizePx = 14,
    isSlideMode = false
  } = options;

  let preparedCode = sanitizeAndRepairCode(code) || '';

  // Strip contenteditable, transient editor outlines, and active string editing attributes
  preparedCode = preparedCode
    .replace(/\scontenteditable(=["'][^"']*["'])?/gi, '')
    .replace(/\scontenteditable/gi, '')
    .replace(/\boutline\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-offset\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-color\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-style\s*:\s*[^;"]+;?/gi, '')
    .replace(/\boutline-width\s*:\s*[^;"]+;?/gi, '')
    .replace(/\bclass=["']([^"']*\s)?studio-active-selected-element(\s[^"']*)?["']/gi, (match, p1, p2) => {
      const remaining = `${p1 || ''}${p2 || ''}`.trim();
      return remaining ? ` class="${remaining}"` : '';
    });

  // Pre-render all math equations synchronously using the core KaTeX pipeline
  preparedCode = renderMathInHtmlDocument(preparedCode);

  // Slide deck mode printing
  if (isSlideMode) {
    const slideHtml = prepareIframeHtml({
      code: preparedCode,
      viewportMode: 'slide',
      sideMarginMm,
      verticalMarginMm,
      totalLeftMarginMm,
      fontSizePx,
      isDark: false,
      zoomLevel: 100,
      a4Pages: 1,
      setA4Pages: () => {},
      isPreviewEditMode: false
    });
    const printScript = `
    <script>
      (function() {
        function doPrint() {
          setTimeout(function() {
            try { window.focus(); window.print(); } catch(e) {}
          }, 250);
        }
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          setTimeout(doPrint, 100);
        } else {
          window.addEventListener('load', doPrint);
        }
      })();
    </script>
    </body>`;
    return slideHtml.replace('</body>', printScript);
  }

  // High-Fidelity CSS Paged Media Document Print (Standard Notes, Tests, Tables)
  let headHtml = '';
  let finalBodyHtml = preparedCode;

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(preparedCode, 'text/html');

    // Extract head elements (links, styles)
    headHtml = Array.from(doc.querySelectorAll('link, style'))
      .map(el => {
        let h = el.outerHTML;
        // Neutralize destructive legacy print rules that turn headings monochrome or lock tables from splitting
        h = h.replace(/color:\s*(#000000|#000|black)\s*!important/gi, '/* color preserved */');
        // Strip embedded @page rules so studio margin settings govern print layout
        h = h.replace(/@page\s*\{[^}]*\}/gi, '/* studio-margin-controlled */');
        return h;
      })
      .join('\n');

    doc.querySelectorAll('link, style, script').forEach(el => el.remove());

    // Clean body: strip editor overlays and cell resize styles
    const cleanBodyNode = doc.body;
    cleanBodyNode.querySelectorAll('.studio-page-break-indicator-line, .studio-page-break-indicator-label, .doc-img-toolbar, .doc-resize-handle, #doc-image-drop-indicator, .doc-img-dimension-tooltip, .slide-card-header-badge, .no-print').forEach(el => el.remove());

    cleanBodyNode.querySelectorAll('table').forEach(tbl => {
      tbl.removeAttribute('data-has-resizers');
      delete tbl.dataset.hasResizers;
    });

    cleanBodyNode.querySelectorAll<HTMLElement>('*').forEach(el => {
      el.classList.remove('studio-active-selected-element');
      if (el.style) {
        if (el.style.outline) el.style.outline = '';
        if (el.style.outlineOffset) el.style.outlineOffset = '';
        if (el.style.boxShadow && el.style.boxShadow.includes('11, 87, 208')) el.style.boxShadow = '';
        if (el.style.backgroundColor && el.style.backgroundColor.includes('11, 87, 208')) el.style.backgroundColor = '';
        if (!el.getAttribute('style') || !el.getAttribute('style').trim()) {
          el.removeAttribute('style');
        }
      }
    });

    cleanBodyNode.querySelectorAll<HTMLElement>('th, td').forEach(c => {
      if (c.style.resize) c.style.resize = '';
      if (c.style.overflow) c.style.overflow = '';
      if (c.style.minWidth) c.style.minWidth = '';
      if (!c.getAttribute('style') || !c.getAttribute('style').trim()) {
        c.removeAttribute('style');
      }
    });

    // Enforce exact image positioning preservation in print output
    cleanBodyNode.querySelectorAll<HTMLElement>('.doc-img-wrapper, figure, img').forEach(w => {
      const isImgTag = w.tagName === 'IMG';
      if (isImgTag && w.closest('.doc-img-wrapper, figure')) return;
      const wrap = w.getAttribute('data-wrap') || (w.style.float === 'right' ? 'right' : w.style.float === 'left' ? 'left' : (w.style.margin && w.style.margin.includes('auto') ? 'center' : ''));
      if (wrap === 'center' || wrap === 'break') {
        w.setAttribute('data-wrap', 'center');
        w.style.float = 'none';
        w.style.margin = '16px auto';
        w.style.marginLeft = 'auto';
        w.style.marginRight = 'auto';
        w.style.display = 'block';
        w.style.clear = 'both';
      } else if (wrap === 'left') {
        w.setAttribute('data-wrap', 'left');
        w.style.float = 'left';
        w.style.margin = '8px 18px 8px 0';
        w.style.marginLeft = '0';
        w.style.marginRight = '18px';
        w.style.display = 'block';
      } else if (wrap === 'right') {
        w.setAttribute('data-wrap', 'right');
        w.style.float = 'right';
        w.style.margin = '8px 0 8px 18px';
        w.style.marginLeft = '18px';
        w.style.marginRight = '0';
        w.style.display = 'block';
      }
    });

    // If body content is wrapped in .a4-sheet or .a4-container, unwrap it for seamless continuous flow
    const sheets = cleanBodyNode.querySelectorAll('.a4-sheet');
    if (sheets.length > 0) {
      finalBodyHtml = '';
      sheets.forEach(s => {
        finalBodyHtml += s.innerHTML + '\n';
      });
    } else {
      const container = cleanBodyNode.querySelector('.a4-container');
      finalBodyHtml = container ? container.innerHTML : cleanBodyNode.innerHTML;
    }
  }

  const printStyles = getDocumentPrintSpecStyles({
    fontSizePx,
    verticalMarginMm,
    sideMarginMm,
    totalLeftMarginMm
  });

  const fontTags = `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  `;

  return `<!DOCTYPE html>
<html>
<head>
  ${fontTags}
  ${printStyles}
  ${headHtml}
  <script>
    (function() {
      try {
        var p = window.parent !== window ? window.parent : window.opener;
        if (p) {
          if (!window.katex && p.katex) window.katex = p.katex;
          if (!window.renderMathInElement && p.renderMathInElement) window.renderMathInElement = p.renderMathInElement;
        }
      } catch(e) {}
    })();
  </script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>
</head>
<body>
  <div class="print-document-content">
    ${finalBodyHtml}
  </div>
  <script>
    function renderMathFormulas() {
      var fn = window.renderMathInElement;
      if (typeof fn !== 'function') {
        if (fn && typeof fn.default === 'function') {
          fn = fn.default;
          window.renderMathInElement = fn;
        } else {
          try {
            var p = window.parent !== window ? window.parent : window.opener;
            if (p) {
              if (typeof p.renderMathInElement === 'function') fn = p.renderMathInElement;
              else if (p.renderMathInElement && typeof p.renderMathInElement.default === 'function') fn = p.renderMathInElement.default;
              if (fn) window.renderMathInElement = fn;
              if (!window.katex && p.katex) window.katex = (p.katex && p.katex.renderToString) ? p.katex : ((p.katex && p.katex.default) || p.katex);
            }
          } catch(e) {}
        }
      }

      if (typeof fn === 'function') {
        try {
          fn(document.body, {
            preProcess: function(math) {
              var s = math ? math.trim() : '';
              if (!s) return '';
              s = s.replace(/\/(displaystyle|textstyle|frac|sqrt|sum|int|lim|infty|partial|mathbf|mathrm|text)\b/g, '\\$1');
              s = s.replace(/(?:^|[^\\])\[\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\]/g, '\\begin{bmatrix}$1\\end{bmatrix}');
              s = s.replace(/(?:^|[^\\])\(\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\)/g, '\\begin{pmatrix}$1\\end{pmatrix}');
              s = s.replace(/(?:^|[^\\])\|\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\|/g, '\\begin{vmatrix}$1\\end{vmatrix}');
              function scalePairs(str, o, c, l, r) {
                var out = '', idx = 0;
                while (idx < str.length) {
                  if (str.indexOf(o, idx) === idx) {
                    var pfx = str.slice(Math.max(0, idx - 6), idx);
                    if (/\\(left|right)$/.test(pfx) || /\\$/.test(pfx)) {
                      out += str.slice(idx, idx + o.length);
                      idx += o.length;
                      continue;
                    }
                    var d = 1, j = idx + o.length, tall = false;
                    while (j < str.length && d > 0) {
                      if (str[j] === '\\') {
                        var rem = str.slice(j);
                        if (/^\\(?:frac|dfrac|cfrac|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|cases|array|int|iint|iiint|oint|sum|prod|lim)\b/.test(rem)) tall = true;
                        j++;
                        if (j < str.length && /[a-zA-Z]/.test(str[j])) {
                          while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
                        } else if (j < str.length) {
                          j++;
                        }
                        continue;
                      }
                      if (str.indexOf(o, j) === j) { d++; j += o.length; continue; }
                      else if (str.indexOf(c, j) === j) { d--; j += c.length; continue; }
                      j++;
                    }
                    if (d === 0 && tall) {
                      var inside = str.slice(idx + o.length, j - c.length);
                      out += l + scalePairs(inside, o, c, l, r) + r;
                      idx = j;
                      continue;
                    }
                  }
                  out += str[idx];
                  idx++;
                }
                return out;
              }
              s = scalePairs(s, '(', ')', '\\left(', '\\right)');
              s = scalePairs(s, '[', ']', '\\left[', '\\right]');
              s = scalePairs(s, '\\{', '\\}', '\\left\\{', '\\right\\}');

              // Guarantee \displaystyle for tall operators so integrals and fractions render at full truth height
              if (!s.startsWith('\\displaystyle') && !s.startsWith('\\textstyle')) {
                if (/\\(?:frac|dfrac|cfrac|int|iint|iiint|oint|sum|prod|lim|matrix|bmatrix|pmatrix|vmatrix|cases)\b/.test(s)) {
                  s = '\\displaystyle ' + s;
                }
              }

              return s;
            },
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\\\[', right: '\\\\]', display: true },
              { left: '\\\\(', right: '\\\\)', display: false },
              { left: '\\\\begin{equation}', right: '\\\\end{equation}', display: true },
              { left: '\\\\begin{equation*}', right: '\\\\end{equation*}', display: true },
              { left: '\\\\begin{align}', right: '\\\\end{align}', display: true },
              { left: '\\\\begin{align*}', right: '\\\\end{align*}', display: true },
              { left: '\\\\begin{matrix}', right: '\\\\end{matrix}', display: true },
              { left: '\\\\begin{pmatrix}', right: '\\\\end{pmatrix}', display: true },
              { left: '\\\\begin{bmatrix}', right: '\\\\end{bmatrix}', display: true },
              { left: '\\\\begin{vmatrix}', right: '\\\\end{vmatrix}', display: true },
              { left: '\\\\begin{Vmatrix}', right: '\\\\end{Vmatrix}', display: true },
              { left: '\\\\begin{gather}', right: '\\\\end{gather}', display: true },
              { left: '\\\\begin{gather*}', right: '\\\\end{gather*}', display: true },
              { left: '\\\\begin{cases}', right: '\\\\end{cases}', display: true },
              { left: '\\\\begin{aligned}', right: '\\\\end{aligned}', display: true },
              { left: '\\\\begin{CD}', right: '\\\\end{CD}', display: true }
            ],
            macros: {
              "\\\\ne": "\\\\mathrel{≠}",
              "\\\\neq": "\\\\mathrel{≠}",
              "\\\\nequal": "\\\\mathrel{≠}",
              "\\\\not=": "\\\\mathrel{≠}",
              "\\\\degree": "^\\\\circ",
              "\\\\deg": "^\\\\circ",
              "\\\\le": "\\\\leq",
              "\\\\ge": "\\\\geq",
              "\\\\cbrt": "\\\\sqrt[3]",
              "\\\\det": "\\\\operatorname{det}",
              "\\\\adj": "\\\\operatorname{adj}",
              "\\\\tr": "\\\\operatorname{tr}",
              "\\\\rank": "\\\\operatorname{rank}",
              "\\\\gcd": "\\\\operatorname{gcd}",
              "\\\\lcm": "\\\\operatorname{lcm}",
              "\\\\abs": "\\\\left|#1\\\\right|",
              "\\\\norm": "\\\\left\\\\|#1\\\\right\\\\|",
              "\\\\grad": "\\\\nabla",
              "\\\\curl": "\\\\nabla \\\\times",
              "\\\\bold": "\\\\mathbf{#1}",
              "\\\\bm": "\\\\boldsymbol{#1}",
              "\\\\implies": "\\\\Longrightarrow",
              "\\\\iff": "\\\\Longleftrightarrow",
              "\\\\R": "\\\\mathbb{R}",
              "\\\\N": "\\\\mathbb{N}",
              "\\\\Z": "\\\\mathbb{Z}",
              "\\\\C": "\\\\mathbb{C}",
              "\\\\Q": "\\\\mathbb{Q}"
            },
            processEscapes: true,
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
            ignoredClasses: ['katex', 'katex-display', 'katex-html'],
            throwOnError: false
          });
        } catch(e) {}
      }
    }

    function initPrintProcess() {
      try { renderMathFormulas(); } catch(e) {}

      function triggerPrint() {
        setTimeout(function() {
          try {
            window.focus();
            window.print();
          } catch(e) {
            console.warn('Auto print failed:', e);
          }
        }, 200);
      }

      var imgs = Array.from(document.images);
      var pending = imgs.filter(function(i) { return !i.complete; });
      if (pending.length === 0) {
        triggerPrint();
      } else {
        var loaded = 0;
        var check = function() {
          loaded++;
          if (loaded >= pending.length) triggerPrint();
        };
        imgs.forEach(function(img) {
          img.onload = check;
          img.onerror = check;
        });
        setTimeout(triggerPrint, 1500);
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initPrintProcess, 80);
    } else {
      window.addEventListener('DOMContentLoaded', initPrintProcess);
      window.addEventListener('load', initPrintProcess);
    }
  </script>
</body>
</html>`;
}

export function prepareIframeHtml(options: PrepareIframeHtmlOptions): string {
  const {
    code = '',
    sideMarginMm,
    verticalMarginMm,
    totalLeftMarginMm,
    fontSizePx,
    viewportMode,
    isDark,
    zoomLevel,
    viewMode,
    isPreviewEditMode = false
  } = options;

  let preparedCode = sanitizeAndRepairCode(code) || '';

  // Ensure contenteditable and transient outlines are completely stripped from HTML when edit mode is OFF
  if (!isPreviewEditMode) {
    preparedCode = preparedCode
      .replace(/\scontenteditable(=["'][^"']*["'])?/gi, '')
      .replace(/\scontenteditable/gi, '')
      .replace(/\boutline\s*:\s*[^;"]+;?/gi, '')
      .replace(/\boutline-offset\s*:\s*[^;"]+;?/gi, '')
      .replace(/\bclass=["']([^"']*\s)?studio-active-selected-element(\s[^"']*)?["']/gi, (match, p1, p2) => {
        const remaining = `${p1 || ''}${p2 || ''}`.trim();
        return remaining ? ` class="${remaining}"` : '';
      });
  }

  // Pre-render all math equations synchronously using the core KaTeX pipeline with 0ms first-frame render
  preparedCode = renderMathInHtmlDocument(preparedCode);

  // Synchronous KaTeX Bridge & Local Fallback
  const katexHeadBridge = `
  <script>
    (function() {
      try {
        var p = window.parent !== window ? window.parent : window.opener;
        if (p) {
          if (!window.katex && p.katex) window.katex = (p.katex && p.katex.renderToString) ? p.katex : ((p.katex && p.katex.default) || p.katex);
          if (!window.renderMathInElement && p.renderMathInElement) {
            window.renderMathInElement = typeof p.renderMathInElement === 'function' ? p.renderMathInElement : ((p.renderMathInElement && p.renderMathInElement.default) || p.renderMathInElement);
          }
        }
      } catch(e) {}
    })();
  </script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"></script>
  `;


  // 1. DETERMINISTIC SLIDE DECK & A4 BACKGROUND PAGINATION ENGINE (Slide / A4 Mode)
  if (viewportMode === 'slide' || viewportMode === 'a4') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(preparedCode, 'text/html');

      // Extract head elements, links, styles, and scripts to clone them in head
      const headHtml = Array.from(doc.querySelectorAll('link, style, script'))
        .map(el => el.outerHTML)
        .join('\n');

      // Remove from body to avoid duplicates
      doc.querySelectorAll('link, style, script').forEach(el => el.remove());

      const isSlideMode = viewportMode === 'slide';
      const pageWidth = isSlideMode ? 1200 : 794;
      const pageHeight = isSlideMode ? 675 : 1123;

      const topMarginMm = verticalMarginMm > 0 ? verticalMarginMm : 8;
      const bottomMarginMm = verticalMarginMm > 0 ? verticalMarginMm : 8;
      const leftMarginMm = totalLeftMarginMm > 0 ? totalLeftMarginMm : 5;
      const rightMarginMm = sideMarginMm > 0 ? sideMarginMm : 5;

      const vertPaddingPx = Math.round((topMarginMm + bottomMarginMm) * 3.7795);
      const printableHeight = Math.max(isSlideMode ? 480 : 400, pageHeight - vertPaddingPx);

      const bodyHtml = doc.body.innerHTML;

      const a4PrintSpecStyle = getA4PrintSpecStyles({
        zoomLevel,
        isDark,
        pageWidth,
        pageHeight,
        topMarginMm,
        rightMarginMm,
        bottomMarginMm,
        leftMarginMm,
        isSlideMode,
        fontSizePx
      });

      const paginationEngineScript = getA4PaginationScript(
        printableHeight,
        topMarginMm,
        rightMarginMm,
        bottomMarginMm,
        leftMarginMm,
        isSlideMode
      );

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  ${katexHeadBridge}
  ${a4PrintSpecStyle}
  ${headHtml}
</head>
<body class="${isSlideMode ? 'slide-mode' : ''}">
  <div class="a4-centering-stage ${isSlideMode ? 'slide-stage' : ''}">
    <div class="a4-container ${isSlideMode ? 'slide-container' : ''}">
      ${bodyHtml}
    </div>
  </div>
  <script>window.__useCanvasImageEngine = true;</script>
  ${getInteractiveCanvasScript(isPreviewEditMode)}
  ${getCanvasImageEngineScript(isPreviewEditMode)}
  ${paginationEngineScript}
</body>
</html>`;
    } catch (err) {
      console.error("Error generating paginated Slide/A4 pages:", err);
    }
  }

  // Non-A4 (Desktop / Fluid / Split) Mode
  const printStyle = getFluidPrintSpecStyles({
    fontSizePx,
    verticalMarginMm,
    sideMarginMm,
    totalLeftMarginMm,
    viewMode,
    isDark
  });

  const interactiveScript = getInteractiveCanvasScript(isPreviewEditMode);
  const canvasImageScript = getCanvasImageEngineScript(isPreviewEditMode);
  const canvasScripts = `
  <script>window.__useCanvasImageEngine = true;</script>
  ${interactiveScript}
  ${canvasImageScript}
  `;

  const fontTags = `
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Outfit:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
  `;

  if (preparedCode.includes('<head>')) {
    preparedCode = preparedCode.replace('<head>', `<head>\n${fontTags}\n${katexHeadBridge}\n${printStyle}`);
  } else if (preparedCode.includes('</head>')) {
    preparedCode = preparedCode.replace('</head>', () => `${fontTags}\n${katexHeadBridge}\n${printStyle}\n</head>`);
  } else {
    preparedCode = `${fontTags}\n${katexHeadBridge}\n${printStyle}\n${preparedCode}`;
  }

  if (preparedCode.includes('</body>')) {
    preparedCode = preparedCode.replace('</body>', () => `${canvasScripts}\n</body>`);
  } else {
    preparedCode = `${preparedCode}\n${canvasScripts}`;
  }

  return preparedCode;
}
