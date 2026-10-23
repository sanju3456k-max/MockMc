import html2canvas, { Options } from 'html2canvas';

/**
 * Fast set of CSS property names that can contain modern color values
 */
const COLOR_PROPERTIES = new Set([
  'color',
  'background-color',
  'backgroundColor',
  'border-color',
  'borderColor',
  'border-top-color',
  'borderTopColor',
  'border-bottom-color',
  'borderBottomColor',
  'border-left-color',
  'borderLeftColor',
  'border-right-color',
  'borderRightColor',
  'outline-color',
  'outlineColor',
  'fill',
  'stroke',
  'box-shadow',
  'boxShadow',
  'text-shadow',
  'textShadow',
  'caret-color',
  'caretColor',
  'accent-color',
  'accentColor',
  'text-decoration-color',
  'textDecorationColor',
]);

/**
 * Helper to replace oklch, oklab, and modern CSS color strings with standard fallback hsla/rgb colors
 */
export function replaceOklchAndOklabWithHsl(cssString: string): string {
  if (!cssString || typeof cssString !== 'string') return cssString;
  if (cssString.indexOf('okl') === -1 && cssString.indexOf('color(') === -1) return cssString;

  // 1. Convert oklch to hsla
  let result = cssString.replace(/oklch\(([^)]+)\)/g, (_match, content) => {
    try {
      const cleaned = content.trim().replace(/\s+/g, ' ');
      let alpha = '1';
      let mainParts = cleaned;
      if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        mainParts = parts[0].trim();
        alpha = parts[1].trim();
      }

      const args = mainParts.split(' ');
      if (args.length < 3) return 'rgb(120, 120, 120)';

      let lVal = parseFloat(args[0]);
      if (args[0].includes('%')) {
        lVal = lVal / 100;
      }
      
      let cVal = parseFloat(args[1]);
      if (args[1].includes('%')) {
        cVal = cVal / 100;
      }

      let hVal = parseFloat(args[2]);
      if (args[2].includes('%')) {
        hVal = (parseFloat(args[2]) / 100) * 360;
      }

      const h = Math.round(isNaN(hVal) ? 0 : hVal);
      const l = Math.round(isNaN(lVal) ? 100 : Math.min(100, Math.max(0, lVal * 100)));
      const c = isNaN(cVal) ? 0 : cVal;
      
      const s = Math.min(100, Math.max(0, Math.round((c / 0.4) * 100)));

      return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    } catch {
      return 'rgb(120, 120, 120)';
    }
  });

  // 2. Convert oklab to hsla
  result = result.replace(/oklab\(([^)]+)\)/g, (_match, content) => {
    try {
      const cleaned = content.trim().replace(/\s+/g, ' ');
      let alpha = '1';
      let mainParts = cleaned;
      if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        mainParts = parts[0].trim();
        alpha = parts[1].trim();
      }

      const args = mainParts.split(' ');
      if (args.length < 3) return 'rgb(120, 120, 120)';

      let lVal = parseFloat(args[0]);
      if (args[0].includes('%')) {
        lVal = lVal / 100;
      }
      
      let aVal = parseFloat(args[1]);
      if (args[1].includes('%')) {
        aVal = (parseFloat(args[1]) / 100) * 0.4;
      }

      let bVal = parseFloat(args[2]);
      if (args[2].includes('%')) {
        bVal = (parseFloat(args[2]) / 100) * 0.4;
      }

      const cVal = Math.sqrt(aVal * aVal + bVal * bVal);
      let hVal = Math.atan2(bVal, aVal) * (180 / Math.PI);
      if (hVal < 0) hVal += 360;

      const h = Math.round(isNaN(hVal) ? 0 : hVal);
      const l = Math.round(isNaN(lVal) ? 100 : Math.min(100, Math.max(0, lVal * 100)));
      const s = Math.min(100, Math.max(0, Math.round((cVal / 0.4) * 100)));

      return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    } catch {
      return 'rgb(120, 120, 120)';
    }
  });

  // 3. Fallback for generic color(srgb ...) or color(display-p3 ...)
  result = result.replace(/color\([^)]+\)/g, 'rgb(30, 41, 59)');

  return result;
}

/**
 * Creates a proxied getComputedStyle function that intercepts and replaces modern color values on the fly
 */
function createProxyComputedStyle(originalFn: typeof window.getComputedStyle, contextWindow: Window) {
  return function (el: Element, pseudoElt?: string | null) {
    const style = originalFn.call(contextWindow, el, pseudoElt);
    if (!style) return style;

    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return function (propertyName: string) {
            try {
              const originalVal = target.getPropertyValue(propertyName);
              if (typeof originalVal === 'string' && (originalVal.indexOf('okl') !== -1 || originalVal.indexOf('color(') !== -1)) {
                return replaceOklchAndOklabWithHsl(originalVal);
              }
              return originalVal;
            } catch {
              return '';
            }
          };
        }

        const val = (target as any)[prop];
        if (typeof val === 'function') {
          return val.bind(target);
        }
        if (typeof prop === 'string' && COLOR_PROPERTIES.has(prop) && typeof val === 'string') {
          if (val.indexOf('okl') !== -1 || val.indexOf('color(') !== -1) {
            return replaceOklchAndOklabWithHsl(val);
          }
        }
        return val;
      }
    });
  };
}

/**
 * Custom html2canvas wrapper that intercepts window & iframe getComputedStyle and translates oklch/oklab elements on the fly
 */
export async function safeHtml2Canvas(element: HTMLElement, options?: Partial<Options>): Promise<HTMLCanvasElement> {
  const originalGetComputedStyle = window.getComputedStyle;
  
  try {
    window.getComputedStyle = createProxyComputedStyle(originalGetComputedStyle, window);

    const userOnClone = options?.onclone;
    const userIgnoreElements = options?.ignoreElements;

    const mergedOptions: Partial<Options> = {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      imageTimeout: 5000,
      ...options,
      ignoreElements: (element: Element) => {
        if (element.classList && element.classList.contains('no-export')) return true;
        if (typeof userIgnoreElements === 'function') {
          return userIgnoreElements(element);
        }
        return false;
      },
      onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
        try {
          // Patch the cloned iframe window's getComputedStyle so internal html2canvas queries never see oklch
          if (clonedDoc.defaultView) {
            const iframeOrigGetComputedStyle = clonedDoc.defaultView.getComputedStyle;
            clonedDoc.defaultView.getComputedStyle = createProxyComputedStyle(
              iframeOrigGetComputedStyle,
              clonedDoc.defaultView
            );
          }

          // Inject export normalization CSS styles into cloned DOM
          const styleEl = clonedDoc.createElement('style');
          styleEl.textContent = `
            .no-export {
              display: none !important;
            }

            /* Ensure table and cells take full natural width without clipping */
            table {
              width: max-content !important;
              max-width: none !important;
              border-collapse: collapse !important;
            }
            /* KaTeX Math Normalization for clean canvas rasterization */
            .katex, .katex-html, .mrel, .mbin, .mord, .text, .mathrm {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            }
            th, td {
              white-space: normal !important;
              word-break: normal !important;
            }
          `;
          clonedDoc.head.appendChild(styleEl);

          // Clean up any combining slash characters or multi-span KaTeX \neq fragments in cloned DOM
          const mrelNodes = clonedDoc.querySelectorAll('.mrel, .katex');
          mrelNodes.forEach((node) => {
            const text = node.textContent || '';
            if (text.includes('̸') || text.includes('\u0338') || text.includes('=/')) {
              node.textContent = text.replace(/=\s*̸|=\s*\u0338|=\//g, '≠');
            }
          });

          // Fast clean of any oklch in existing style tags
          const styleNodes = clonedDoc.querySelectorAll('style');
          styleNodes.forEach((st) => {
            if (st.textContent && (st.textContent.indexOf('okl') !== -1 || st.textContent.indexOf('color(') !== -1)) {
              st.textContent = replaceOklchAndOklabWithHsl(st.textContent);
            }
          });
        } catch {
          // ignore cloning style modification error
        }

        if (typeof userOnClone === 'function') {
          userOnClone(clonedDoc, clonedEl);
        }
      }
    };

    return await html2canvas(element, mergedOptions as Options);
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
  }
}


