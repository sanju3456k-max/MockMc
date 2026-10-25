import jsPDF from 'jspdf';
import { safeHtml2Canvas } from './safeHtml2Canvas';
import { renderOmrSheetToCanvas } from './omrCanvasRenderer';
import { generateOmrSheetBlueprint } from './omrGeometry';

const MM_TO_PX = 3.779527559; // 96 DPI CSS pixels per millimeter

/**
 * Trigger browser file download of Blob or Data URL safely across all browser environments
 */
export function triggerBlobDownload(blob: Blob | string, filename: string) {
  try {
    let url: string;
    let isObjectUrl = false;

    if (typeof blob === 'string') {
      if (blob.startsWith('data:') || blob.startsWith('blob:') || blob.startsWith('http')) {
        url = blob;
      } else {
        const textBlob = new Blob([blob], { type: 'text/plain;charset=utf-8' });
        url = URL.createObjectURL(textBlob);
        isObjectUrl = true;
      }
    } else {
      url = URL.createObjectURL(blob);
      isObjectUrl = true;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.setAttribute('download', filename);
    link.target = '_self';
    link.rel = 'noopener noreferrer';
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    link.style.opacity = '0';
    link.style.pointerEvents = 'none';
    document.body.appendChild(link);

    // Primary native click
    try {
      link.click();
    } catch {
      const evt = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(evt);
    }

    // Retain object URL in memory for 60s so browser download manager has ample time to complete the save
    setTimeout(() => {
      try {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        if (isObjectUrl) {
          URL.revokeObjectURL(url);
        }
      } catch {
        // ignore
      }
    }, 60000);
  } catch (err) {
    console.error('Error in triggerBlobDownload:', err);
  }
}

/**
 * Parses millimeter dimension string like '210mm' or returns fallback
 */
function parseDimensionMm(value?: string | null, fallback = 297): number {
  if (!value) return fallback;
  const match = value.match(/([\d.]+)\s*mm/i);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num > 10) return num;
  }
  return fallback;
}

/**
 * Escapes HTML characters for safety in print templates
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}



/**
 * Extracts all compiled CSS rules from document.styleSheets into a single clean string
 * so that standalone print popups / blobs have 100% of the active Tailwind and KaTeX styling.
 */
function extractAllDocumentStyles(): string {
  let combinedCss = '';
  try {
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        if (sheet.cssRules) {
          for (let i = 0; i < sheet.cssRules.length; i++) {
            combinedCss += sheet.cssRules[i].cssText + '\n';
          }
        }
      } catch {
        // Cross-origin stylesheet security fallback
        if (sheet.href) {
          combinedCss += `@import url("${sheet.href}");\n`;
        }
      }
    }
  } catch (err) {
    console.warn('Could not extract all document stylesheets:', err);
  }
  return combinedCss;
}

/**
 * Question Paper & A4 standalone print stylesheet that guarantees
 * two-column grid, exam header, option layout, KaTeX formulas, diagrams, and page breaks.
 */
const QUESTION_PAPER_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 0 !important;
  }
  *, *::before, *::after {
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  html, body {
    background: #ffffff !important;
    color: #000000 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 10pt !important;
    line-height: 1.35 !important;
    -webkit-font-smoothing: antialiased !important;
  }

  /* Page layout rules */
  .a4-page-item, [data-page-wrapper] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    margin: 0 auto !important;
    padding: 10mm 12mm 10mm 12mm !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    position: relative !important;
    left: auto !important;
    top: auto !important;
    transform: none !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .a4-page-item:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }

  /* Question Paper Flexbox & Layout Utilities */
  .flex-1 {
    flex: 1 1 0% !important;
  }
  .shrink-0 {
    flex-shrink: 0 !important;
  }
  .grow {
    flex-grow: 1 !important;
  }
  .min-h-0 {
    min-height: 0px !important;
  }
  .mt-auto {
    margin-top: auto !important;
  }
  .mb-auto {
    margin-bottom: auto !important;
  }
  .my-auto {
    margin-top: auto !important;
    margin-bottom: auto !important;
  }
  .justify-start {
    justify-content: flex-start !important;
  }
  .relative {
    position: relative !important;
  }
  .absolute {
    position: absolute !important;
  }
  .top-0 {
    top: 0px !important;
  }
  .bottom-0 {
    bottom: 0px !important;
  }
  .left-1\/2 {
    left: 50% !important;
  }
  .-translate-x-1\/2 {
    transform: translateX(-50%) !important;
  }
  .w-\\[0\\.75pt\\] {
    width: 0.75pt !important;
  }
  .bg-black {
    background-color: #000000 !important;
  }
  .pointer-events-none {
    pointer-events: none !important;
  }
  .pr-2 {
    padding-right: 0.5rem !important;
  }
  .pl-2 {
    padding-left: 0.5rem !important;
  }
  .gap-x-5 {
    column-gap: 1.25rem !important;
  }
  .mb-1 {
    margin-bottom: 0.25rem !important;
  }
  .mb-2 {
    margin-bottom: 0.5rem !important;
  }

  /* Question Paper 2-Column Grid Layout */
  .grid-cols-2 {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    column-gap: 20px !important;
  }
  .grid-cols-4 {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    column-gap: 12px !important;
  }
  .flex {
    display: flex !important;
  }
  .flex-col {
    flex-direction: column !important;
  }
  .flex-row {
    flex-direction: row !important;
  }
  .justify-between {
    justify-content: space-between !important;
  }
  .justify-center {
    justify-content: center !important;
  }
  .items-center {
    align-items: center !important;
  }
  .items-start {
    align-items: flex-start !important;
  }
  .items-baseline {
    align-items: baseline !important;
  }
  .border-b-2 {
    border-bottom-width: 2px !important;
  }
  .border-b {
    border-bottom-width: 1px !important;
  }
  .border-t-\\[1\\.5pt\\] {
    border-top: 1.5pt solid #000000 !important;
  }
  .border-t {
    border-top-width: 1px !important;
  }
  .border-black {
    border-color: #000000 !important;
    border-style: solid !important;
  }
  .border-dotted {
    border-style: dotted !important;
  }
  .text-black {
    color: #000000 !important;
  }
  .text-center {
    text-align: center !important;
  }
  .uppercase {
    text-transform: uppercase !important;
  }
  .font-bold {
    font-weight: 700 !important;
  }
  .font-semibold {
    font-weight: 600 !important;
  }
  .font-medium {
    font-weight: 500 !important;
  }
  .leading-tight {
    line-height: 1.25 !important;
  }
  .leading-normal {
    line-height: 1.4 !important;
  }
  .tracking-wide {
    letter-spacing: 0.025em !important;
  }

  /* KaTeX Math Equation Styling */
  .katex {
    font-size: 1.05em !important;
    line-height: 1.2 !important;
    text-indent: 0 !important;
    text-rendering: auto !important;
    color: #000000 !important;
  }
  .katex-display {
    display: block !important;
    margin: 0.4em 0 !important;
    text-align: center !important;
  }
  .katex-html {
    display: inline-block !important;
  }
  .katex .delimsizing,
  .katex .delimsizing *,
  .katex .mopen,
  .katex .mclose {
    font-family: KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, KaTeX_Math, sans-serif !important;
  }

  /* Images and Diagrams */
  img, svg {
    max-width: 100% !important;
    height: auto !important;
    display: block !important;
    object-fit: contain !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
`;

/**
 * Triggers the device's native system print dialog for a specific element
 * rendered in exact physical page dimensions.
 */
export async function triggerSystemPrint(
  elementId: string, 
  documentTitle = 'Question_Paper',
  customWidthMm = 210,
  customHeightMm = 297
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element with id "${elementId}" not found for system print`);
    return;
  }

  const printWidthMm = customWidthMm || 210;
  const printHeightMm = customHeightMm || 297;

  // Check if element contains discrete .a4-page-item children
  const pageItems = Array.from(element.querySelectorAll('.a4-page-item')) as HTMLElement[];
  const targets = pageItems.length > 0 ? pageItems : [element];

  const extractedCss = extractAllDocumentStyles();

  const pagesHtml = targets.map((pageEl, idx) => {
    const pageClone = pageEl.cloneNode(true) as HTMLElement;
    pageClone.removeAttribute('id');
    pageClone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));

    // Ensure all images are eager loaded and visible
    pageClone.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      img.style.maxWidth = '100%';
    });

    // Remove any interactive edit handles/controls or hidden elements from the print page
    pageClone.querySelectorAll('.print\\:hidden, [data-editor-control]').forEach((n) => n.remove());

    const isLast = idx === targets.length - 1;
    return `
      <div class="a4-page-item" style="
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        width: ${printWidthMm}mm !important;
        min-width: ${printWidthMm}mm !important;
        max-width: ${printWidthMm}mm !important;
        height: ${printHeightMm}mm !important;
        min-height: ${printHeightMm}mm !important;
        max-height: ${printHeightMm}mm !important;
        margin: 0 auto !important;
        padding: 10mm 12mm 10mm 12mm !important;
        box-sizing: border-box !important;
        position: relative !important;
        background: #ffffff !important;
        color: #000000 !important;
        overflow: hidden !important;
        ${!isLast ? 'page-break-after: always !important; break-after: page !important;' : 'page-break-after: auto !important; break-after: auto !important;'}
      ">
        ${pageClone.innerHTML}
      </div>
    `;
  }).join('\n');

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${window.location.origin}/">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    ${extractedCss}
    ${QUESTION_PAPER_PRINT_CSS}
  </style>
</head>
<body>
  <div style="width: ${printWidthMm}mm; margin: 0 auto; background: #ffffff;">
    ${pagesHtml}
  </div>
  <script>
    function triggerPrint() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 300);
    }
    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint);
    }
  </script>
</body>
</html>`;

  // =========================================================================
  // Primary Method: In-Page Seamless Print Portal (Never opens a new tab or blob URL)
  // =========================================================================
  const portalId = 'omr-print-active-portal';
  let portalEl = document.getElementById(portalId);
  if (portalEl && portalEl.parentNode) {
    portalEl.parentNode.removeChild(portalEl);
  }

  portalEl = document.createElement('div');
  portalEl.id = portalId;
  portalEl.innerHTML = pagesHtml;
  document.body.appendChild(portalEl);

  // Inject dynamic print style
  const styleId = 'omr-print-dynamic-style';
  let dynamicStyle = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!dynamicStyle) {
    dynamicStyle = document.createElement('style');
    dynamicStyle.id = styleId;
    document.head.appendChild(dynamicStyle);
  }

  dynamicStyle.textContent = `
    @media print {
      @page {
        size: ${printWidthMm}mm ${printHeightMm}mm;
        margin: 0mm !important;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: ${printWidthMm}mm !important;
        min-width: ${printWidthMm}mm !important;
        height: auto !important;
        overflow: visible !important;
      }
      body > *:not(#${portalId}) {
        display: none !important;
      }
      #${portalId} {
        display: block !important;
        position: static !important;
        width: ${printWidthMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      ${QUESTION_PAPER_PRINT_CSS}
    }
  `;

  // Brief delay to ensure portal DOM settles and images decode
  await new Promise((resolve) => setTimeout(resolve, 100));

  const originalDocTitle = document.title;
  document.title = documentTitle;

  const cleanup = () => {
    document.title = originalDocTitle;
    if (portalEl && portalEl.parentNode) {
      portalEl.parentNode.removeChild(portalEl);
    }
    if (dynamicStyle && dynamicStyle.parentNode) {
      dynamicStyle.parentNode.removeChild(dynamicStyle);
    }
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);

  try {
    window.focus();
    window.print();
  } catch (err) {
    console.warn('In-page window.print error, falling back to iframe print:', err);
    fallbackIframePrint(fullHtml, documentTitle);
  }
}

/**
 * Secondary print fallback using an isolated iframe
 */
function fallbackIframePrint(
  fullHtml: string,
  documentTitle: string
) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '100px';
  iframe.style.height = '100px';
  iframe.style.border = '0';
  iframe.style.opacity = '0.01';
  iframe.title = documentTitle;
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(fullHtml);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print error:', e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 6000);
    }
  }, 400);
}

/**
 * Helper to run a promise with a maximum timeout deadline
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs)),
  ]);
}

/**
 * Converts a data URL (image/jpeg, image/png, etc.) directly to a Blob in memory
 * without network requests or fetch(), preventing iframe CSP/security blockers.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binaryStr = atob(parts[1]);
  const len = binaryStr.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Renders an HTML element to a high-resolution canvas/dataURL
 * Directly handles OMR sheets via instant Canvas 2D rasterization,
 * and handles general HTML pages via optimized html2canvas capture.
 */
async function captureElementToDataUrl(
  element: HTMLElement,
  itemWidthMm: number,
  itemHeightMm: number,
  format: 'png' | 'jpeg' = 'png'
): Promise<string> {
  const pixelWidth = Math.ceil(itemWidthMm * MM_TO_PX);
  const pixelHeight = Math.ceil(itemHeightMm * MM_TO_PX);

  // Offscreen mount container with zero opacity placed safely in viewport bounds
  const mountWrapper = document.createElement('div');
  mountWrapper.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${pixelWidth}px;
    height: ${pixelHeight}px;
    z-index: -9999;
    pointer-events: none;
    opacity: 0.001;
    display: block;
    overflow: hidden;
    background: #ffffff;
  `;

  const clonedEl = element.cloneNode(true) as HTMLElement;
  clonedEl.removeAttribute('id');
  clonedEl.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

  const compStyle = window.getComputedStyle(element);
  const pTop = compStyle.paddingTop && compStyle.paddingTop !== '0px' ? compStyle.paddingTop : '37.8px';
  const pRight = compStyle.paddingRight && compStyle.paddingRight !== '0px' ? compStyle.paddingRight : '37.8px';
  const pBottom = compStyle.paddingBottom && compStyle.paddingBottom !== '0px' ? compStyle.paddingBottom : '24.5px';
  const pLeft = compStyle.paddingLeft && compStyle.paddingLeft !== '0px' ? compStyle.paddingLeft : '37.8px';

  clonedEl.style.cssText = `
    width: ${pixelWidth}px !important;
    min-width: ${pixelWidth}px !important;
    max-width: ${pixelWidth}px !important;
    height: ${pixelHeight}px !important;
    min-height: ${pixelHeight}px !important;
    max-height: ${pixelHeight}px !important;
    transform: none !important;
    margin: 0 !important;
    padding: ${pTop} ${pRight} ${pBottom} ${pLeft} !important;
    position: relative !important;
    left: 0 !important;
    top: 0 !important;
    box-sizing: border-box !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: hidden !important;
  `;

  // Neutralize any transform or absolute positioning on cloned node
  clonedEl.style.transform = 'none';
  clonedEl.style.position = 'relative';
  clonedEl.style.left = '0';
  clonedEl.style.top = '0';

  mountWrapper.appendChild(clonedEl);
  document.body.appendChild(mountWrapper);

  try {
    // Brief layout settle
    await new Promise((resolve) => setTimeout(resolve, 80));

    const canvas = await withTimeout(
      safeHtml2Canvas(clonedEl, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: pixelWidth,
        height: pixelHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        windowWidth: pixelWidth,
        windowHeight: pixelHeight,
        imageTimeout: 8000,
      }),
      45000,
      'Render capture timed out'
    );

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(mime, format === 'png' ? 1.0 : 0.95);
  } finally {
    if (mountWrapper.parentNode) {
      mountWrapper.parentNode.removeChild(mountWrapper);
    }
  }
}

/**
 * Export an OMR Sheet directly to an exact physical PDF file using vector canvas rasterization
 */
export async function exportOmrSheetToPdf(
  totalQuestions: number,
  examTitle: string,
  filename: string,
  sheetFormat: 'a4' | 'compact' = 'a4'
): Promise<void> {
  const safeQs = Math.max(1, totalQuestions || 50);
  const blueprint = generateOmrSheetBlueprint(safeQs, undefined, sheetFormat);
  const { layout } = blueprint;

  // Render high-resolution canvas at 4x scale (384 DPI for crisp vector output)
  const canvas = renderOmrSheetToCanvas(safeQs, examTitle, 4, sheetFormat);
  const imgData = canvas.toDataURL('image/jpeg', 0.98);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // Standard A4 paper format (210mm x 297mm)
    compress: true,
  });

  // Fit to full 210mm A4 width at the top with exact ISO page height
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, layout.pageHeightMm, undefined, 'FAST');

  try {
    pdf.save(filename);
  } catch {
    const blob = pdf.output('blob');
    triggerBlobDownload(blob, filename);
  }
}

/**
 * Export an OMR Sheet directly to a high-resolution PNG image
 */
export async function exportOmrSheetToPng(
  totalQuestions: number,
  examTitle: string,
  filename: string,
  sheetFormat: 'a4' | 'compact' = 'a4'
): Promise<void> {
  const safeQs = Math.max(1, totalQuestions || 50);
  // Render high-resolution canvas at 4x scale (384 DPI)
  const canvas = renderOmrSheetToCanvas(safeQs, examTitle, 4, sheetFormat);

  canvas.toBlob((blob) => {
    if (blob) {
      triggerBlobDownload(blob, filename);
    } else {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      triggerBlobDownload(dataUrl, filename);
    }
  }, 'image/png');
}

/**
 * Trigger browser system print dialog for OMR Sheet without text clipping or shifting
 */
export async function triggerOmrSheetPrint(
  totalQuestions: number,
  examTitle: string,
  sheetFormat: 'a4' | 'compact' = 'a4'
): Promise<void> {
  const safeQs = Math.max(1, totalQuestions || 50);
  const blueprint = generateOmrSheetBlueprint(safeQs, undefined, sheetFormat);
  const { layout } = blueprint;

  const canvas = renderOmrSheetToCanvas(safeQs, examTitle, 3.5, sheetFormat);
  const dataUrl = canvas.toDataURL('image/png');

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(examTitle || 'OMR Bubble Sheet')}</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
      height: 100% !important;
    }
    img {
      width: 210mm !important;
      height: ${layout.pageHeightMm}mm !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body>
  <div style="width: 210mm; margin: 0; padding: 0;">
    <img src="${dataUrl}" alt="OMR Sheet" />
  </div>
  <script>
    function triggerPrint() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    }
    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint);
    }
  </script>
</body>
</html>`;

  // Direct In-Page Print Portal (Never opens a new tab or blob URL)
  const existingPortal = document.getElementById('omr-print-active-portal');
  if (existingPortal && existingPortal.parentNode) {
    existingPortal.parentNode.removeChild(existingPortal);
  }

    const portal = document.createElement('div');
    portal.id = 'omr-print-active-portal';
    portal.style.cssText = `
      display: none;
      position: absolute;
      left: 0;
      top: 0;
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
    `;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = `
      width: 210mm;
      height: ${layout.pageHeightMm}mm;
      display: block;
      margin: 0;
    `;

    portal.appendChild(img);
    document.body.appendChild(portal);

    const styleEl = document.createElement('style');
    styleEl.id = 'omr-print-dynamic-style';
    styleEl.textContent = `
      @media print {
        @page {
          size: 210mm 297mm;
          margin: 0mm !important;
        }
        *, *::before, *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 210mm !important;
          height: auto !important;
        }
        body > *:not(#omr-print-active-portal) {
          display: none !important;
        }
        #omr-print-active-portal {
          display: block !important;
          position: static !important;
          width: 210mm !important;
        }
        #omr-print-active-portal img {
          width: 210mm !important;
          height: ${layout.pageHeightMm}mm !important;
          display: block !important;
          margin: 0 !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

  try {
    window.focus();
    window.print();
  } catch (err) {
    console.error('Window print failed:', err);
  }
}

/**
 * Export an HTML Element directly to an exact physical PDF file
 * Accurately sizes the PDF to either standard A4 (210mm x 297mm) or custom compact dimensions (e.g. 210mm x 115mm)
 */
export async function exportElementToA4Pdf(
  elementId: string,
  filename: string,
  options: { isSinglePage?: boolean; customWidthMm?: number; customHeightMm?: number; totalQuestions?: number; examTitle?: string } = {}
): Promise<void> {
  if (elementId === 'omr-printable-sheet' && options.totalQuestions) {
    return exportOmrSheetToPdf(options.totalQuestions, options.examTitle || '', filename);
  }

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // Check if element contains discrete .a4-page-item children or is itself a page item
  let pageItems = Array.from(element.querySelectorAll('.a4-page-item')) as HTMLElement[];
  if (pageItems.length === 0) {
    pageItems = [element];
  }

  // Determine base page dimensions
  const defaultWidthMm = options.customWidthMm || parseDimensionMm(element.style.width, 210);
  const defaultHeightMm = options.customHeightMm || parseDimensionMm(element.style.height || element.style.minHeight, 297);

  // Initialize jsPDF with matching orientation & custom dimensions
  const isFirstLandscape = defaultWidthMm > defaultHeightMm;
  const pdf = new jsPDF({
    orientation: isFirstLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: isFirstLandscape ? [defaultHeightMm, defaultWidthMm] : [defaultWidthMm, defaultHeightMm],
    compress: true,
  });

  for (let i = 0; i < pageItems.length; i++) {
    const pageEl = pageItems[i];
    
    const itemWidthMm = options.customWidthMm || parseDimensionMm(pageEl.style.width, defaultWidthMm);
    const itemHeightMm = options.customHeightMm || parseDimensionMm(pageEl.style.height || pageEl.style.minHeight, defaultHeightMm);
    
    const imgData = await captureElementToDataUrl(pageEl, itemWidthMm, itemHeightMm, 'jpeg');
    if (!imgData) {
      throw new Error(`Failed to render page ${i + 1} to image`);
    }

    const isLandscape = itemWidthMm > itemHeightMm;

    if (i > 0) {
      pdf.addPage(
        isLandscape ? [itemHeightMm, itemWidthMm] : [itemWidthMm, itemHeightMm],
        isLandscape ? 'landscape' : 'portrait'
      );
    }
    
    pdf.addImage(imgData, 'JPEG', 0, 0, itemWidthMm, itemHeightMm, undefined, 'FAST');
  }

  // Download PDF via native jsPDF saver with blob fallback
  try {
    pdf.save(filename);
  } catch {
    const blob = pdf.output('blob');
    triggerBlobDownload(blob, filename);
  }
}

/**
 * Export element directly as high-resolution PNG image
 */
export async function exportElementToPng(
  elementId: string, 
  filename: string,
  options: { customWidthMm?: number; customHeightMm?: number; totalQuestions?: number; examTitle?: string } = {}
): Promise<void> {
  if (elementId === 'omr-printable-sheet' && options.totalQuestions) {
    return exportOmrSheetToPng(options.totalQuestions, options.examTitle || '', filename);
  }

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // If container has multiple pages, capture all discrete page items or the element itself
  const pageItems = Array.from(element.querySelectorAll('.a4-page-item')) as HTMLElement[];
  const targets = pageItems.length > 0 ? pageItems : [element];

  for (let i = 0; i < targets.length; i++) {
    const pageEl = targets[i];
    const itemWidthMm = options.customWidthMm || parseDimensionMm(pageEl.style.width, 210);
    const itemHeightMm = options.customHeightMm || parseDimensionMm(pageEl.style.height || pageEl.style.minHeight, 297);

    const dataUrl = await captureElementToDataUrl(pageEl, itemWidthMm, itemHeightMm, 'png');
    if (!dataUrl) {
      throw new Error(`Failed to capture page ${i + 1} as PNG`);
    }

    const pageFilename = targets.length > 1
      ? filename.replace(/\.png$/i, `_Page_${i + 1}.png`)
      : filename;

    const blob = dataUrlToBlob(dataUrl);
    triggerBlobDownload(blob, pageFilename);

    if (i < targets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
}

export interface CustomOmrPositionItem {
  id: string;
  page?: number; // 1-indexed page number (default 1)
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  height: number; // percentage 0 - 100
  totalQuestions: number;
  title: string;
}

export interface MultiUpLayoutConfig {
  cols: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
  showCutLines?: boolean;
  repeatCopies?: number;
  customItems?: CustomOmrPositionItem[];
}

export interface MultiUpOmrItem {
  totalQuestions: number;
  title: string;
}

/**
 * Trigger system print for Multi-Up (N-Up) OMR Sheet arrangement on A4 paper.
 * Lays out OMRs vertically using minor side margins to preserve exact full OMR page width.
 */
export async function triggerMultiUpOmrPrint(
  items: MultiUpOmrItem[],
  config: MultiUpLayoutConfig,
  printTitle = 'Multi_Up_OMR_Sheets_A4'
): Promise<void> {
  const { cols, rows, orientation, showCutLines = false, customItems } = config;

  const isPortrait = orientation === 'portrait';
  const pageW = isPortrait ? '210mm' : '297mm';
  const pageH = isPortrait ? '297mm' : '210mm';

  let pagesHtml = '';

  if (customItems && customItems.length > 0) {
    // Group custom positioned items by page
    const pageMap = new Map<number, CustomOmrPositionItem[]>();
    customItems.forEach(item => {
      const pNum = item.page || 1;
      if (!pageMap.has(pNum)) pageMap.set(pNum, []);
      pageMap.get(pNum)!.push(item);
    });

    const pageNumbers = Array.from(pageMap.keys()).sort((a, b) => a - b);

    pagesHtml = pageNumbers.map(pNum => {
      const itemsOnPage = pageMap.get(pNum) || [];
      const customTilesHtml = itemsOnPage.map(cItem => {
        const canvas = renderOmrSheetToCanvas(
          Math.max(1, cItem.totalQuestions || 50),
          cItem.title ?? '',
          3.5,
          'compact'
        );
        const url = canvas.toDataURL('image/png');

        return `
          <div class="omr-tile" style="
            position: absolute;
            left: ${cItem.x}%;
            top: ${cItem.y}%;
            width: ${cItem.width}%;
            height: ${cItem.height}%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            border: ${showCutLines ? '1px dashed #cccccc' : 'none'};
            overflow: hidden;
          ">
            <img src="${url}" alt="OMR Sheet" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
            " />
          </div>
        `;
      }).join('');

      return `
        <div class="a4-page" style="
          width: ${pageW};
          height: ${pageH};
          position: relative;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
          background: #ffffff;
          margin: 0 auto;
          overflow: hidden;
        ">
          ${customTilesHtml}
        </div>
      `;
    }).join('');
  } else {
    // Standard Grid layout
    const itemsPerPage = Math.max(1, cols * rows);

    // Pre-render image Data URLs for all items
    const itemDataUrls = items.map(item => {
      const canvas = renderOmrSheetToCanvas(
        Math.max(1, item.totalQuestions || 50),
        item.title ?? '',
        3.5,
        'a4'
      );
      return canvas.toDataURL('image/png');
    });

    const totalItemCount = itemDataUrls.length;
    const pageCount = Math.ceil(totalItemCount / itemsPerPage);

    for (let p = 0; p < pageCount; p++) {
      const pageItems: string[] = [];
      const startIndex = p * itemsPerPage;

      for (let i = 0; i < itemsPerPage; i++) {
        const idx = startIndex + i;
        if (idx < totalItemCount) {
          pageItems.push(itemDataUrls[idx]);
        } else if (totalItemCount === 1) {
          pageItems.push(itemDataUrls[0]);
        }
      }

      if (pageItems.length === 0) break;

      const tilesHtml = pageItems.map(url => `
        <div class="omr-tile" style="
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1mm 2mm;
          box-sizing: border-box;
          border: ${showCutLines ? '1px dashed #cccccc' : 'none'};
          overflow: hidden;
        ">
          <img src="${url}" alt="OMR Sheet" style="
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
          " />
        </div>
      `).join('');

      pagesHtml += `
        <div class="a4-page" style="
          width: ${pageW};
          height: ${pageH};
          padding: 4mm 5mm;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(${cols}, 1fr);
          grid-template-rows: repeat(${rows}, 1fr);
          gap: 2mm;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
          background: #ffffff;
          margin: 0 auto;
          overflow: hidden;
        ">
          ${tilesHtml}
        </div>
      `;
    }
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(printTitle)}</title>
  <style>
    @page {
      size: ${isPortrait ? 'A4 portrait' : 'A4 landscape'};
      margin: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: ${pageW} !important;
    }
    .a4-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  </style>
</head>
<body>
  ${pagesHtml}
  <script>
    function triggerPrint() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    }
    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint);
    }
  </script>
</body>
</html>`;

  // Direct In-Page Print Portal (Never opens a new tab or blob URL)
  const portalId = 'omr-print-active-portal';
  let portalEl = document.getElementById(portalId);
  if (portalEl && portalEl.parentNode) {
    portalEl.parentNode.removeChild(portalEl);
  }

  portalEl = document.createElement('div');
  portalEl.id = portalId;
  portalEl.innerHTML = pagesHtml;
  document.body.appendChild(portalEl);

  const styleId = 'omr-print-dynamic-style';
  let dynamicStyle = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!dynamicStyle) {
    dynamicStyle = document.createElement('style');
    dynamicStyle.id = styleId;
    document.head.appendChild(dynamicStyle);
  }

  dynamicStyle.textContent = `
    @media print {
      @page {
        size: ${isPortrait ? 'A4 portrait' : 'A4 landscape'};
        margin: 0mm !important;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageW} !important;
      }
      body > *:not(#${portalId}) {
        display: none !important;
      }
      #${portalId} {
        display: block !important;
        position: static !important;
        width: ${pageW} !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .a4-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  `;

  await new Promise(resolve => setTimeout(resolve, 80));

  const originalDocTitle = document.title;
  document.title = printTitle;

  const cleanup = () => {
    document.title = originalDocTitle;
    if (portalEl && portalEl.parentNode) {
      portalEl.parentNode.removeChild(portalEl);
    }
    if (dynamicStyle && dynamicStyle.parentNode) {
      dynamicStyle.parentNode.removeChild(dynamicStyle);
    }
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 45000);

  try {
    window.focus();
    window.print();
  } catch (err) {
    console.warn('In-page print error:', err);
  }
}

/**
 * Export Multi-Up OMR layout directly to PDF with minor side margins
 */
export async function exportMultiUpOmrPdf(
  items: MultiUpOmrItem[],
  config: MultiUpLayoutConfig,
  filename = 'Multi_Up_OMR_Sheets_A4.pdf'
): Promise<void> {
  const { cols, rows, orientation, showCutLines = false, customItems } = config;
  const isPortrait = orientation === 'portrait';
  const pageWMm = isPortrait ? 210 : 297;
  const pageHMm = isPortrait ? 297 : 210;

  const pdf = new jsPDF({
    orientation: isPortrait ? 'portrait' : 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  if (customItems && customItems.length > 0) {
    // Group custom positioned items by page
    const pageMap = new Map<number, CustomOmrPositionItem[]>();
    customItems.forEach(item => {
      const pNum = item.page || 1;
      if (!pageMap.has(pNum)) pageMap.set(pNum, []);
      pageMap.get(pNum)!.push(item);
    });

    const pageNumbers = Array.from(pageMap.keys()).sort((a, b) => a - b);

    for (let pIdx = 0; pIdx < pageNumbers.length; pIdx++) {
      if (pIdx > 0) {
        pdf.addPage('a4', isPortrait ? 'portrait' : 'landscape');
      }

      const pNum = pageNumbers[pIdx];
      const itemsOnPage = pageMap.get(pNum) || [];

      for (let i = 0; i < itemsOnPage.length; i++) {
        const cItem = itemsOnPage[i];
        const canvas = renderOmrSheetToCanvas(
          Math.max(1, cItem.totalQuestions || 50),
          cItem.title ?? '',
          4,
          'compact'
        );
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        const x = (cItem.x / 100) * pageWMm;
        const y = (cItem.y / 100) * pageHMm;
        const w = (cItem.width / 100) * pageWMm;
        const h = (cItem.height / 100) * pageHMm;

        pdf.addImage(imgData, 'JPEG', x, y, w, h, undefined, 'FAST');

        if (showCutLines) {
          pdf.setLineWidth(0.15);
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineDashPattern([1.5, 1.5], 0);
          pdf.rect(x, y, w, h);
          pdf.setLineDashPattern([], 0);
        }
      }
    }
  } else {
    // Standard Grid Layout
    const itemsPerPage = Math.max(1, cols * rows);

    // Pre-render canvases
    const canvases = items.map(item => 
      renderOmrSheetToCanvas(
        Math.max(1, item.totalQuestions || 50),
        item.title ?? '',
        4,
        'a4'
      )
    );

    const paddingSideMm = 5; // Minor side margins
    const paddingTopMm = 4;
    const gapMm = 2;
    const availWMm = pageWMm - paddingSideMm * 2 - (cols - 1) * gapMm;
    const availHMm = pageHMm - paddingTopMm * 2 - (rows - 1) * gapMm;
    const cellWMm = availWMm / cols;
    const cellHMm = availHMm / rows;

    const totalItems = canvases.length;
    const pageCount = Math.ceil(totalItems / itemsPerPage);

    for (let p = 0; p < pageCount; p++) {
      if (p > 0) {
        pdf.addPage('a4', isPortrait ? 'portrait' : 'landscape');
      }

      const startIndex = p * itemsPerPage;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const slotIdx = r * cols + c;
          let itemIdx = startIndex + slotIdx;

          if (itemIdx >= totalItems) {
            if (totalItems === 1) {
              itemIdx = 0;
            } else {
              continue;
            }
          }

          const canvas = canvases[itemIdx];
          const imgData = canvas.toDataURL('image/jpeg', 0.98);

          const x = paddingSideMm + c * (cellWMm + gapMm);
          const y = paddingTopMm + r * (cellHMm + gapMm);

          // Aspect fit inside cell
          const aspectCanvas = canvas.width / canvas.height;
          const aspectCell = cellWMm / cellHMm;

          let drawW = cellWMm;
          let drawH = cellHMm;
          let drawX = x;
          let drawY = y;

          if (aspectCanvas > aspectCell) {
            drawH = cellWMm / aspectCanvas;
            drawY = y + (cellHMm - drawH) / 2;
          } else {
            drawW = cellHMm * aspectCanvas;
            drawX = x + (cellWMm - drawW) / 2;
          }

          pdf.addImage(imgData, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');

          if (showCutLines) {
            pdf.setLineWidth(0.15);
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineDashPattern([1.5, 1.5], 0);
            pdf.rect(x, y, cellWMm, cellHMm);
            pdf.setLineDashPattern([], 0);
          }
        }
      }
    }
  }

  try {
    pdf.save(filename);
  } catch {
    const blob = pdf.output('blob');
    triggerBlobDownload(blob, filename);
  }
}

