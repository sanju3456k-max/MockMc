import { toPng } from 'html-to-image';
import { safeHtml2Canvas } from './safeHtml2Canvas';

export interface ExportTableOptions {
  title?: string;
  description?: string;
}

export async function exportElementToPng(
  element: HTMLElement,
  filename: string = `table-canvas-${Date.now()}.png`,
  options?: ExportTableOptions
): Promise<void> {
  const isDark = document.documentElement.classList.contains('dark');
  const bgColor = isDark ? '#0c0e17' : '#ffffff';
  const textColor = isDark ? '#f1f5f9' : '#0f172a';
  const cardBg = isDark ? '#111420' : '#ffffff';
  const headerBg = isDark ? '#181c2c' : '#f1f5f9';
  const headerBorder = isDark ? '#2a3048' : '#cbd5e1';
  const rowBorder = isDark ? '#1e2336' : '#e2e8f0';
  const altRowBg = isDark ? '#141826' : '#f8fafc';
  const subTextColor = isDark ? '#94a3b8' : '#64748b';

  // 1. Locate the actual <table> inside the element or check if the element is a <table>
  const tableEl = (element.tagName === 'TABLE' ? element : element.querySelector('table')) as HTMLTableElement | null;

  // Create an offscreen mount container with full styling context
  const mountWrapper = document.createElement('div');
  mountWrapper.style.cssText = `
    position: fixed;
    left: -99999px;
    top: 0;
    z-index: -99999;
    pointer-events: none;
    opacity: 1;
    display: block;
    width: max-content;
  `;

  // Create a clean, publication-ready table card presentation
  const cardContainer = document.createElement('div');
  cardContainer.style.cssText = `
    background-color: ${cardBg};
    color: ${textColor};
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 28px 32px;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    border: 1px solid ${rowBorder};
    display: inline-block;
    box-sizing: border-box;
    width: max-content;
    min-width: 680px;
    max-width: 1800px;
  `;

  // Try to determine title and description
  let titleText = options?.title;
  let descText = options?.description;

  if (!titleText) {
    const titleEl = element.querySelector('h1, h2, h3, h4');
    if (titleEl) {
      titleText = titleEl.textContent?.replace(/Interactive Table/i, '').trim() || undefined;
    }
  }

  // Header banner inside card
  if (titleText) {
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 1px solid ${rowBorder};
    `;

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';

    const titleH = document.createElement('h3');
    titleH.style.cssText = `
      font-size: 17px;
      font-weight: 800;
      color: ${textColor};
      letter-spacing: -0.015em;
      margin: 0;
      padding: 0;
    `;
    titleH.textContent = titleText;
    titleRow.appendChild(titleH);

    headerDiv.appendChild(titleRow);

    if (descText) {
      const descP = document.createElement('p');
      descP.style.cssText = `
        font-size: 12px;
        color: ${subTextColor};
        margin: 0;
        padding: 0;
      `;
      descP.textContent = descText;
      headerDiv.appendChild(descP);
    }

    cardContainer.appendChild(headerDiv);
  }

  // Clone or copy table
  let clonedTable: HTMLTableElement;
  if (tableEl) {
    clonedTable = tableEl.cloneNode(true) as HTMLTableElement;
  } else {
    // If no table element, clone the provided element directly
    clonedTable = element.cloneNode(true) as any;
  }

  // Strip all non-export elements (buttons, search inputs, sort arrows, action dropdowns)
  const elementsToRemove = clonedTable.querySelectorAll(
    'button, input, textarea, select, .no-export, [data-copy-table], [data-edit-table]'
  );
  elementsToRemove.forEach((el) => el.remove());

  // Style the cloned table directly for pristine rendering
  if (clonedTable.tagName === 'TABLE') {
    clonedTable.style.cssText = `
      width: 100%;
      min-width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
      line-height: 1.6;
      border-spacing: 0;
    `;

    // Style thead
    const thead = clonedTable.querySelector('thead');
    if (thead) {
      thead.style.cssText = `
        background-color: ${headerBg};
        color: ${textColor};
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.04em;
      `;
      const ths = thead.querySelectorAll('th');
      ths.forEach((th) => {
        th.style.cssText = `
          padding: 12px 18px;
          border-bottom: 2px solid ${headerBorder};
          border-top: 1px solid ${rowBorder};
          color: ${textColor};
          font-weight: 700;
          white-space: nowrap;
          text-align: left;
        `;
      });
    }

    // Style tbody
    const tbody = clonedTable.querySelector('tbody');
    if (tbody) {
      const trs = tbody.querySelectorAll('tr');
      trs.forEach((tr, rIdx) => {
        const rowBg = rIdx % 2 === 0 ? cardBg : altRowBg;
        tr.style.cssText = `
          background-color: ${rowBg};
          border-bottom: 1px solid ${rowBorder};
        `;
        const tds = tr.querySelectorAll('td');
        tds.forEach((td) => {
          td.style.cssText = `
            padding: 12px 18px;
            color: ${textColor};
            border-bottom: 1px solid ${rowBorder};
            vertical-align: middle;
          `;
        });
      });
    }
  }

  // Normalize KaTeX elements and math symbols so they render crisp and without glyph boxes during canvas/SVG rasterization
  const katexNodes = cardContainer.querySelectorAll('.katex, .katex-html, .mrel, .mbin, .mord, .text, .mathrm');
  katexNodes.forEach((node) => {
    const el = node as HTMLElement;
    el.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  });

  // Clean up any combining slash characters or multi-span KaTeX \neq fragments into a crisp, single Unicode '≠'
  const mrelNodes = cardContainer.querySelectorAll('.mrel, .katex');
  mrelNodes.forEach((node) => {
    const text = node.textContent || '';
    if (text.includes('̸') || text.includes('\u0338') || text.includes('=/')) {
      node.textContent = text.replace(/=\s*̸|=\s*\u0338|=\//g, '≠');
    }
  });

  cardContainer.appendChild(clonedTable);
  mountWrapper.appendChild(cardContainer);
  document.body.appendChild(mountWrapper);

  try {
    // Short wait for layout and KaTeX CSS calculation in DOM pass
    await new Promise((resolve) => setTimeout(resolve, 80));

    let dataUrl = '';

    try {
      // High-resolution SVG-based capture with native font and KaTeX glyph rasterization (skipFonts avoids cross-origin cssRules DOMExceptions)
      dataUrl = await toPng(cardContainer, {
        backgroundColor: bgColor,
        pixelRatio: 3,
        cacheBust: true,
        skipFonts: true,
        fontEmbedCSS: '',
        filter: (node: HTMLElement) => {
          if (!node || !node.classList) return true;
          return !node.classList.contains('no-export') && node.tagName !== 'BUTTON' && node.tagName !== 'INPUT';
        }
      });
    } catch (toImageError) {
      console.warn('html-to-image export encountered error, using safeHtml2Canvas fallback:', toImageError);
      const canvas = await safeHtml2Canvas(cardContainer, {
        backgroundColor: bgColor,
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false
      });
      dataUrl = canvas.toDataURL('image/png', 1.0);
    }

    if (dataUrl) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.error('Failed to export table image:', err);
  } finally {
    // Cleanup temporary DOM elements
    if (mountWrapper.parentNode) {
      mountWrapper.parentNode.removeChild(mountWrapper);
    }
  }
}



