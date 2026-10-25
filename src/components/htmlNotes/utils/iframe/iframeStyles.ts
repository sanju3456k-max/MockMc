interface A4StylesOptions {
  zoomLevel: number;
  isDark: boolean;
  pageWidth: number;
  pageHeight: number;
  topMarginMm: number;
  rightMarginMm: number;
  bottomMarginMm: number;
  leftMarginMm: number;
  isSlideMode?: boolean;
  fontSizePx?: number;
}

interface FluidStylesOptions {
  fontSizePx: number;
  verticalMarginMm: number;
  sideMarginMm: number;
  totalLeftMarginMm: number;
  viewMode?: string;
  isDark?: boolean;
}

export function getA4PrintSpecStyles(options: A4StylesOptions): string {
  const {
    zoomLevel,
    isDark,
    pageWidth,
    pageHeight,
    topMarginMm,
    rightMarginMm,
    bottomMarginMm,
    leftMarginMm,
    isSlideMode = false,
    fontSizePx
  } = options;

  return `
<style id="studio-user-print-spec">
  :root {
    --paper-zoom: ${zoomLevel / 100};
  }

  * {
    box-sizing: border-box !important;
  }
  
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    background: ${isDark ? '#0b0c10' : '#e2e8f0'} !important;
    touch-action: pan-x pan-y !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
    image-rendering: -webkit-optimize-contrast !important;
  }
  
  @media screen {
    html {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain !important;
      background: ${isDark ? '#0b0c10' : '#e2e8f0'} !important;
      scrollbar-width: thin !important;
      scrollbar-color: rgba(100, 116, 139, 0.3) transparent !important;
    }
    body {
      min-height: 100% !important;
      width: 100% !important;
      min-width: 100% !important;
      margin: 0 !important;
      padding: 20px 0 36px 0 !important;
      box-sizing: border-box !important;
      background: ${isDark ? '#0b0c10' : '#e2e8f0'} !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      overflow: visible !important;
      overflow-x: visible !important;
      overflow-y: visible !important;
      position: relative !important;
    }

    body.slide-mode {
      background: ${isDark ? '#0b0c10' : '#cbd5e1'} !important;
    }
    
    .a4-centering-stage {
      width: 100% !important;
      min-width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      padding: ${isSlideMode ? '48px 16px 60px 16px' : '60px 12px 32px 12px'} !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
    }

    .a4-container {
      width: ${pageWidth}px !important;
      min-width: ${pageWidth}px !important;
      max-width: ${pageWidth}px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: ${isSlideMode ? '40px' : '24px'} !important;
      zoom: var(--paper-zoom, ${zoomLevel / 100}) !important;
    }
    
    .a4-sheet {
      position: relative !important;
      width: ${pageWidth}px !important;
      min-width: ${pageWidth}px !important;
      max-width: ${pageWidth}px !important;
      min-height: ${pageHeight}px !important;
      ${isSlideMode ? 'aspect-ratio: 16 / 9 !important; border-radius: 12px !important; border: 1px solid #cbd5e1 !important; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08) !important;' : 'box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.05) !important; border-radius: 4px !important; border: none !important;'}
      padding: ${topMarginMm}mm ${rightMarginMm}mm ${bottomMarginMm}mm ${leftMarginMm}mm !important;
      background: white !important;
      box-sizing: border-box !important;
      font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      font-size: ${fontSizePx ? `${fontSizePx}px` : (isSlideMode ? '12pt' : '11pt')} !important;
      line-height: 1.68 !important;
      letter-spacing: -0.011em !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      text-rendering: optimizeLegibility !important;
      margin-left: auto !important;
      margin-right: auto !important;
      text-align: left !important;
      overflow: visible !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
    }

    .a4-sheet *,
    .a4-sheet .panel,
    .a4-sheet table,
    .a4-sheet img,
    .a4-sheet iframe,
    .a4-sheet pre,
    .a4-sheet code,
    .a4-sheet blockquote,
    .a4-sheet div,
    .a4-sheet section {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .a4-sheet h1, .a4-sheet h2, .a4-sheet h3, .a4-sheet h4, .a4-sheet h5, .a4-sheet h6 {
      font-family: 'Plus Jakarta Sans', 'Outfit', 'Inter', system-ui, -apple-system, sans-serif !important;
      font-weight: 800 !important;
      letter-spacing: -0.025em !important;
      line-height: 1.28 !important;
    }

    .a4-sheet h1 { margin-top: 0 !important; margin-bottom: 8px !important; font-size: ${isSlideMode ? '1.8rem' : '1.5rem'} !important; border-bottom: 2px solid #cbd5e1 !important; padding-bottom: 4px !important; }
    .a4-sheet h2 { margin-top: 14px !important; margin-bottom: 6px !important; padding-bottom: 3px !important; font-size: ${isSlideMode ? '1.4rem' : '1.25rem'} !important; }
    .a4-sheet h3 { margin-top: 10px !important; margin-bottom: 4px !important; font-size: ${isSlideMode ? '1.2rem' : '1.1rem'} !important; }
    .a4-sheet p { margin-top: 0 !important; margin-bottom: 8px !important; }
    .a4-sheet .panel { margin: 8px 0 !important; padding: 10px 12px !important; width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; box-sizing: border-box !important; display: flow-root !important; overflow-wrap: break-word !important; }
    .a4-sheet table { margin: 8px 0 !important; width: 100% !important; box-sizing: border-box !important; border-collapse: collapse !important; }
    .a4-sheet th, .a4-sheet td { padding: 6px 10px !important; font-size: 0.88rem !important; }
    .a4-sheet .katex-display {
      max-width: 100% !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      padding: 6px 2px !important;
      margin: 0.8em 0 !important;
      text-align: center !important;
    }
    .a4-sheet .katex-display::-webkit-scrollbar {
      height: 4px !important;
    }
    .a4-sheet .katex-display::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.4) !important;
      border-radius: 4px !important;
    }
    .a4-sheet .katex {
      font-size: 1.05em !important;
      line-height: inherit !important;
      text-indent: 0 !important;
      text-rendering: optimizeLegibility !important;
    }
    .a4-sheet .katex-display {
      display: block !important;
      margin: 0.75em 0 !important;
      padding: 0.25em 0 !important;
      text-align: center !important;
      font-size: 1.15em !important;
      line-height: 1.4 !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }
    .a4-sheet .katex-display > .katex {
      white-space: normal !important;
    }
    .a4-sheet .katex .katex-html {
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }
    /* Matrix and Delimiter Font Hierarchy: Strictly preserve KaTeX sized delimiter fonts */
    .a4-sheet .katex .delimsizing.size1,
    .a4-sheet .katex .delimsizing.size1 * {
      font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .delimsizing.size2,
    .a4-sheet .katex .delimsizing.size2 * {
      font-family: KaTeX_Size2, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .delimsizing.size3,
    .a4-sheet .katex .delimsizing.size3 * {
      font-family: KaTeX_Size3, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .delimsizing.size4,
    .a4-sheet .katex .delimsizing.size4 * {
      font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .delimsizing.mult .delim-size1 > span {
      font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .delimsizing.mult .delim-size4 > span {
      font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
    }
    .a4-sheet .katex .mopen:not(.delimsizing),
    .a4-sheet .katex .mclose:not(.delimsizing) {
      font-family: KaTeX_Main, 'Inter', sans-serif !important;
    }
    .a4-sheet .katex .delimsizing {
      font-family: KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, sans-serif;
    }
    .a4-sheet .katex .mfrac .vlist-t .vlist-r .vlist > span {
      font-size: 1em !important;
    }
    .a4-sheet .katex .mop.op-limits > .vlist-t {
      font-size: 1em !important;
    }
    .a4-sheet .katex .frac-line {
      border-bottom-width: 1.2px !important;
    }
    .a4-sheet .katex .sqrt > .sqrt-line {
      border-bottom-width: 1.2px !important;
    }
    .a4-sheet .katex .mrel {
      margin-left: 0.22em !important;
      margin-right: 0.22em !important;
    }
    .a4-sheet .katex .mbin {
      margin-left: 0.18em !important;
      margin-right: 0.18em !important;
    }
    
    .a4-sheet {
      color: inherit;
    }
    .a4-sheet h1, .a4-sheet h2, .a4-sheet h3, .a4-sheet h4, .a4-sheet h5, .a4-sheet h6 {
      color: inherit;
    }
    .a4-sheet p {
      color: inherit;
    }
    
    .a4-sheet details, .a4-sheet details.dropdown-box {
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      padding: 10px 14px !important;
      margin: 12px 0 !important;
      background: #f8fafc !important;
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .a4-sheet details[open], .a4-sheet details.dropdown-box[open] {
      background: #ffffff !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important;
    }
    .a4-sheet summary {
      font-weight: 700 !important;
      color: #2563eb !important;
      cursor: pointer !important;
      user-select: none !important;
      outline: none !important;
    }
    .a4-sheet summary:hover {
      color: #1d4ed8 !important;
    }
    
    .a4-sheet > header:first-child,
    .a4-sheet > div:first-child,
    .a4-sheet > section:first-child,
    .a4-sheet > h1:first-child,
    .a4-sheet > h2:first-child {
      margin-top: 0 !important;
    }
    
    .studio-page-break-indicator-line {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 1px !important;
      border-top: 1.5px dashed #f43f5e !important;
      z-index: 9999 !important;
      pointer-events: none !important;
    }
    
    .studio-page-break-indicator-label {
      position: absolute !important;
      bottom: 6px !important;
      right: 12px !important;
      transform: none !important;
      background: #2563eb !important;
      color: white !important;
      font-size: 9px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      padding: 3px 8px !important;
      border-radius: 4px !important;
      font-weight: bold !important;
      z-index: 9999 !important;
      pointer-events: none !important;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25) !important;
    }
  }
  
  @media print {
    @page {
      size: ${isSlideMode ? 'A4 landscape' : 'A4 portrait'};
      margin: 0;
    }
    html, body {
      background: white !important;
      width: ${isSlideMode ? '297mm' : '210mm'} !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .a4-centering-stage,
    .a4-container {
      zoom: 1 !important;
      transform: none !important;
      width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
    }
    *, *::before, *::after {
      resize: none !important;
      outline: none !important;
      outline-offset: 0 !important;
    }
    .studio-active-selected-element,
    p, h1, h2, h3, h4, h5, h6, li, blockquote, .panel, .callout, div, span, table, td, th {
      outline: none !important;
      outline-offset: 0 !important;
    }
    .katex {
      font-size: 1.04em !important;
      line-height: inherit !important;
      color: #000000 !important;
    }
    .katex-display {
      font-size: 1.12em !important;
      margin: 0.6em 0 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .katex-display > .katex {
      white-space: normal !important;
    }
    .katex .delimsizing.size1,
    .katex .delimsizing.size1 * {
      font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
    }
    .katex .delimsizing.size2,
    .katex .delimsizing.size2 * {
      font-family: KaTeX_Size2, KaTeX_Main, sans-serif !important;
    }
    .katex .delimsizing.size3,
    .katex .delimsizing.size3 * {
      font-family: KaTeX_Size3, KaTeX_Main, sans-serif !important;
    }
    .katex .delimsizing.size4,
    .katex .delimsizing.size4 * {
      font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
    }
    .katex .delimsizing.mult .delim-size1 > span {
      font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
    }
    .katex .delimsizing.mult .delim-size4 > span {
      font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
    }
    .katex .mopen:not(.delimsizing),
    .katex .mclose:not(.delimsizing) {
      font-family: KaTeX_Main, 'Inter', sans-serif !important;
    }
    .katex .mfrac .vlist-t .vlist-r .vlist > span {
      font-size: 1em !important;
    }
    .katex .mop.op-limits > .vlist-t {
      font-size: 1em !important;
    }
    .a4-sheet {
      position: relative !important;
      width: ${isSlideMode ? '297mm' : '210mm'} !important;
      height: ${isSlideMode ? '210mm' : 'auto'} !important;
      min-height: ${isSlideMode ? '210mm' : '297mm'} !important;
      box-sizing: border-box !important;
      padding: ${topMarginMm}mm ${rightMarginMm}mm ${bottomMarginMm}mm ${leftMarginMm}mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      border: none !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      background: white !important;
      overflow: visible !important;
    }
    .a4-sheet h1 { margin-top: 0 !important; margin-bottom: 6px !important; }
    .a4-sheet h2 { margin-top: 14px !important; margin-bottom: 6px !important; padding-bottom: 3px !important; }
    .a4-sheet h3 { margin-top: 10px !important; margin-bottom: 4px !important; }
    .a4-sheet p { margin-top: 0 !important; margin-bottom: 6px !important; }
    .a4-sheet .panel { margin: 8px 0 !important; padding: 10px 12px !important; display: flow-root !important; overflow-wrap: break-word !important; }
    .a4-sheet table {
      margin: 8px 0 !important;
      width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    .a4-sheet thead {
      display: table-header-group !important;
    }
    .a4-sheet tfoot {
      display: table-footer-group !important;
    }
    .a4-sheet tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .a4-sheet th, .a4-sheet td {
      padding: 6px 10px !important;
      font-size: 0.88rem !important;
      resize: none !important;
      overflow: visible !important;
    }
    
    .a4-sheet:last-child,
    .a4-sheet:last-of-type {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .studio-page-break-indicator-line,
    .studio-page-break-indicator-label,
    .studio-pointer-marker,
    .studio-resize-handle,
    .studio-img-toolbar,
    .doc-img-toolbar,
    .doc-resize-handle,
    .doc-img-dimension-tooltip,
    #doc-image-drop-indicator,
    .slide-card-header-badge,
    .no-print {
      display: none !important;
    }
    .doc-img-wrapper {
      outline: none !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .doc-img-wrapper img {
      width: 100% !important;
      height: auto !important;
      display: block !important;
    }
    .doc-img-wrapper[data-wrap="center"],
    figure[data-wrap="center"],
    img[data-wrap="center"],
    figure.align-center,
    .align-center,
    figure[style*="margin: 16px auto"],
    figure[style*="margin:16px auto"],
    figure[style*="margin: auto"],
    figure[style*="margin:auto"],
    img[style*="margin: 16px auto"],
    img[style*="margin:16px auto"],
    img[style*="margin: auto"],
    img[style*="margin:auto"] {
      float: none !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: 16px !important;
      margin-bottom: 16px !important;
      display: block !important;
      text-align: center !important;
      clear: both !important;
    }
    .doc-img-wrapper[data-wrap="left"],
    figure[data-wrap="left"],
    img[data-wrap="left"],
    figure.align-left,
    .align-left,
    figure[style*="float: left"],
    figure[style*="float:left"],
    img[style*="float: left"],
    img[style*="float:left"] {
      float: left !important;
      margin: 6px 18px 12px 0 !important;
      margin-left: 0 !important;
      margin-right: 18px !important;
      max-width: min(48%, 380px) !important;
      display: block !important;
      clear: none !important;
    }
    .doc-img-wrapper[data-wrap="right"],
    figure[data-wrap="right"],
    img[data-wrap="right"],
    figure.align-right,
    .align-right,
    figure[style*="float: right"],
    figure[style*="float:right"],
    img[style*="float: right"],
    img[style*="float:right"] {
      float: right !important;
      margin: 6px 0 12px 18px !important;
      margin-left: 18px !important;
      margin-right: 0 !important;
      max-width: min(48%, 380px) !important;
      display: block !important;
      clear: none !important;
    }
  }
</style>
`;
}

export function getFluidPrintSpecStyles(options: FluidStylesOptions): string {
  const { fontSizePx, verticalMarginMm, sideMarginMm, totalLeftMarginMm, viewMode, isDark } = options;

  return `
<style id="studio-user-print-spec">
  * {
    box-sizing: border-box !important;
  }

  html, body {
    background: ${isDark ? '#14161d' : '#ffffff'} !important;
    color: ${isDark ? '#e6edf3' : 'inherit'} !important;
    touch-action: pan-x pan-y !important;
  }

  .katex-scroll-wrapper {
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: thin !important;
    margin: 0.6em 0 !important;
  }
  .katex-display {
    max-width: 100% !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    padding: 6px 2px !important;
    margin: 0.8em 0 !important;
    text-align: center !important;
  }
  .katex-display::-webkit-scrollbar {
    height: 4px !important;
  }
  .katex-display::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.4) !important;
    border-radius: 4px !important;
  }
  .katex {
    font-size: 1.08em !important;
    line-height: 1.2 !important;
    text-indent: 0 !important;
    white-space: nowrap !important;
  }
    /* Matrix and Delimiter Font Hierarchy: Strictly preserve KaTeX sized delimiter fonts */
  .katex .delimsizing.size1,
  .katex .delimsizing.size1 * {
    font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
  }
  .katex .delimsizing.size2,
  .katex .delimsizing.size2 * {
    font-family: KaTeX_Size2, KaTeX_Main, sans-serif !important;
  }
  .katex .delimsizing.size3,
  .katex .delimsizing.size3 * {
    font-family: KaTeX_Size3, KaTeX_Main, sans-serif !important;
  }
  .katex .delimsizing.size4,
  .katex .delimsizing.size4 * {
    font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
  }
  .katex .delimsizing.mult .delim-size1 > span {
    font-family: KaTeX_Size1, KaTeX_Main, sans-serif !important;
  }
  .katex .delimsizing.mult .delim-size4 > span {
    font-family: KaTeX_Size4, KaTeX_Main, sans-serif !important;
  }
  .katex .mopen:not(.delimsizing),
  .katex .mclose:not(.delimsizing) {
    font-family: KaTeX_Main, 'Inter', sans-serif !important;
  }
  .katex .delimsizing {
    font-family: KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, KaTeX_Main, sans-serif;
  }
  .katex .mfrac .vlist-t .vlist-r .vlist > span {
    font-size: 1em !important;
  }
  .katex .mop.op-limits > .vlist-t {
    font-size: 1em !important;
  }
  .katex .katex-html {
    overflow-x: auto !important;
    overflow-y: hidden !important;
  }
  .katex .frac-line {
    border-bottom-width: 1.2px !important;
  }
  .katex .sqrt > .sqrt-line {
    border-bottom-width: 1.2px !important;
  }

  ${isDark ? `
    h1, h2, h3, h4, h5, h6 { color: #f0f6fc !important; }
    .panel, .card, .note { background: #1e222d !important; border-color: #30363d !important; color: #e6edf3 !important; }
    .panel-warning { background: rgba(245, 158, 11, 0.12) !important; border-left: 4px solid #f59e0b !important; color: #f6d860 !important; }
    .panel-info { background: rgba(59, 130, 246, 0.12) !important; border-left: 4px solid #3b82f6 !important; color: #93c5fd !important; }
    .panel-success { background: rgba(16, 185, 129, 0.12) !important; border-left: 4px solid #10b981 !important; color: #6ee7b7 !important; }
    .panel-danger { background: rgba(239, 68, 68, 0.12) !important; border-left: 4px solid #ef4444 !important; color: #fca5a5 !important; }
    table { background: #161b22 !important; border-color: #30363d !important; color: #e6edf3 !important; }
    th { background: #21262d !important; color: #f0f6fc !important; border: 1px solid #30363d !important; }
    td { background: #161b22 !important; color: #e6edf3 !important; border: 1px solid #30363d !important; }
    pre, code { background: #0d1117 !important; color: #58a6ff !important; border: 1px solid #30363d !important; }
    details, details.dropdown-box { background: #1e222d !important; border-color: #30363d !important; color: #e6edf3 !important; }
    details[open], details.dropdown-box[open] { background: #161b22 !important; box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important; }
    summary { color: #58a6ff !important; }
    .katex, .katex-display { color: #e6edf3 !important; }
    .katex .mord, .katex .mbin, .katex .mrel, .katex .mop, .katex .mopen, .katex .mclose, .katex .mpunct, .katex .minner, .katex .text { color: #e6edf3 !important; }
    .katex .frac-line, .katex .sqrt > .sqrt-line { border-color: #e6edf3 !important; }
  ` : ''}

  @media screen {
    html {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain !important;
      scrollbar-width: thin !important;
      scrollbar-color: rgba(100, 116, 139, 0.3) transparent !important;
    }
    body {
      min-height: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 24px 20px 48px 20px !important;
      box-sizing: border-box !important;
      overflow-y: visible !important;
      overflow-x: hidden !important;
    }
    ::-webkit-scrollbar {
      display: block !important;
      width: 6px !important;
      height: 6px !important;
    }
    ::-webkit-scrollbar-track {
      background: transparent !important;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(100, 116, 139, 0.3) !important;
      border-radius: 3px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 116, 139, 0.5) !important;
    }

    .studio-page-break-indicator-line {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      height: 1px !important;
      border-top: 1.5px dashed #f43f5e !important;
      z-index: 99999 !important;
      pointer-events: none !important;
      opacity: 0.75 !important;
    }

    .studio-page-break-indicator-label {
      position: absolute !important;
      right: 12px !important;
      background: #f43f5e !important;
      color: white !important;
      font-size: 9px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      padding: 3px 8px !important;
      border-radius: 4px !important;
      z-index: 99999 !important;
      font-weight: bold !important;
      pointer-events: none !important;
      box-shadow: 0 2px 6px rgba(244, 63, 94, 0.25) !important;
      transform: translateY(-50%) !important;
      letter-spacing: 0.02em !important;
      opacity: 0.9 !important;
    }
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'} ${sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm'} ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'} ${totalLeftMarginMm > 0 ? `${totalLeftMarginMm}mm` : (sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm')};
      margin-top: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'};
      margin-bottom: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'};
      margin-right: ${sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm'};
      margin-left: ${totalLeftMarginMm > 0 ? `${totalLeftMarginMm}mm` : (sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm')};
    }
    html, body {
      background: white !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
      outline: none !important;
      outline-offset: 0 !important;
    }
    .studio-active-selected-element,
    p, h1, h2, h3, h4, h5, h6, li, blockquote, .panel, .callout, div, span, table, td, th {
      outline: none !important;
      outline-offset: 0 !important;
    }
    ::-webkit-scrollbar {
      display: none !important;
      width: 0px !important;
      height: 0px !important;
    }
    .studio-page-break-indicator-line,
    .studio-page-break-indicator-label {
      display: none !important;
    }
  }

  :root {
    --paper-zoom: 1;
  }

  html {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
  }

  body {
    width: 100% !important;
    max-width: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
    font-size: ${fontSizePx}px !important;
    zoom: var(--paper-zoom, 1) !important;
    line-height: 1.68 !important;
    letter-spacing: -0.011em !important;
    color: ${isDark ? '#e2e8f0' : '#1e293b'};
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: optimizeLegibility !important;
    padding-top: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '0px'} !important;
    padding-bottom: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '0px'} !important;
    padding-right: ${sideMarginMm > 0 ? `${sideMarginMm}mm` : '0px'} !important;
    padding-left: ${totalLeftMarginMm > 0 ? `${totalLeftMarginMm}mm` : '0px'} !important;
    box-sizing: border-box !important;
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'Plus Jakarta Sans', 'Outfit', 'Inter', system-ui, -apple-system, sans-serif !important;
    font-weight: 800 !important;
    letter-spacing: -0.025em !important;
    line-height: 1.28 !important;
    color: ${isDark ? '#f8fafc' : 'inherit'};
    margin-top: 1.3em !important;
    margin-bottom: 0.5em !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
  }

  h1 {
    font-size: 1.85em !important;
    letter-spacing: -0.03em !important;
    padding-bottom: 0.35em !important;
    border-bottom: 2px solid ${isDark ? '#334155' : '#e2e8f0'} !important;
  }

  h2 {
    font-size: 1.45em !important;
    letter-spacing: -0.022em !important;
  }

  h3 {
    font-size: 1.2em !important;
  }

  p {
    margin-top: 0 !important;
    margin-bottom: 0.9em !important;
    line-height: 1.7 !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
  }

  code, pre, kbd, samp {
    font-family: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  /* Responsive Auto-Wrapping Tables for Mobile & A4 Print */
  table {
    display: table !important;
    table-layout: auto !important;
    width: 100% !important;
    max-width: 100% !important;
    border-collapse: collapse !important;
    margin: 1em 0 !important;
    box-sizing: border-box !important;
  }

  table th, table td {
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
    hyphens: manual !important;
    min-width: 70px !important;
    box-sizing: border-box !important;
    padding: 8px 10px !important;
  }

  .table-wrapper, div:has(> table) {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    box-sizing: border-box !important;
  }

  pre, code, .katex-display, figure, img, video, iframe, .panel, .wrapper, .callout {
    max-width: 100% !important;
    box-sizing: border-box !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
  }

  img, video, iframe {
    height: auto !important;
    max-width: 100% !important;
  }

  @media screen {
    html, body {
      scrollbar-width: thin !important;
      scrollbar-color: rgba(100, 116, 139, 0.3) transparent !important;
    }
  }

  body > *:first-child,
  header:first-child,
  div:first-child,
  h1:first-child,
  h2:first-child,
  main:first-child,
  article:first-child,
  section:first-child {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }

  header {
    margin-top: 0 !important;
    margin-bottom: 12px !important;
    padding-top: 0 !important;
    padding-bottom: 8px !important;
  }

  main, article, header, section, .container, .wrapper, .panel, img, figure, svg, div {
    max-width: 100% !important;
    box-sizing: border-box !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
  }

  @page {
    size: A4 portrait;
    margin: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'} ${sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm'} ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'} ${totalLeftMarginMm > 0 ? `${totalLeftMarginMm}mm` : (sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm')};
    margin-top: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'};
    margin-bottom: ${verticalMarginMm > 0 ? `${verticalMarginMm}mm` : '12mm'};
    margin-right: ${sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm'};
    margin-left: ${totalLeftMarginMm > 0 ? `${totalLeftMarginMm}mm` : (sideMarginMm > 0 ? `${sideMarginMm}mm` : '10mm')};
  }

  @media print {
    html,
    body {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-size: 11pt !important;
      line-height: 1.5 !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
      overflow: visible !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
    }

    * {
      max-width: 100% !important;
      box-sizing: border-box !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      resize: none !important;
      outline: none !important;
      outline-offset: 0 !important;
    }
    .studio-active-selected-element,
    p, h1, h2, h3, h4, h5, h6, li, blockquote, .panel, .callout, div, span, table, td, th {
      outline: none !important;
      outline-offset: 0 !important;
    }

    table {
      display: table !important;
      table-layout: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }

    thead {
      display: table-header-group !important;
    }

    tfoot {
      display: table-footer-group !important;
    }

    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    table th, table td {
      white-space: normal !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      resize: none !important;
      overflow: visible !important;
    }

    pre, code, blockquote, .panel, .note, img, figure, iframe {
      max-width: 100% !important;
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }

    .studio-pointer-marker,
    .studio-resize-handle,
    .studio-img-toolbar,
    .doc-img-toolbar,
    .doc-resize-handle,
    .doc-img-dimension-tooltip,
    #doc-image-drop-indicator,
    .slide-card-header-badge,
    .no-print {
      display: none !important;
    }
    .doc-img-wrapper {
      outline: none !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    h1,
    h2,
    h3 {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    section,
    article,
    main,
    .panel,
    .note,
    blockquote,
    pre,
    table {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }

    img,
    figure {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    img {
      visibility: visible !important;
      opacity: 1 !important;
      max-width: 100% !important;
      height: auto !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }

    .doc-img-wrapper[data-wrap="center"],
    figure[data-wrap="center"],
    img[data-wrap="center"],
    figure.align-center,
    .align-center,
    figure[style*="margin: 16px auto"],
    figure[style*="margin:16px auto"],
    figure[style*="margin: auto"],
    figure[style*="margin:auto"],
    img[style*="margin: 16px auto"],
    img[style*="margin:16px auto"],
    img[style*="margin: auto"],
    img[style*="margin:auto"] {
      float: none !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: 16px !important;
      margin-bottom: 16px !important;
      display: block !important;
      text-align: center !important;
      clear: both !important;
    }

    .doc-img-wrapper[data-wrap="left"],
    figure[data-wrap="left"],
    img[data-wrap="left"],
    figure.align-left,
    .align-left,
    figure[style*="float: left"],
    figure[style*="float:left"],
    img[style*="float: left"],
    img[style*="float:left"] {
      float: left !important;
      margin: 8px 18px 8px 0 !important;
      margin-left: 0 !important;
      margin-right: 18px !important;
      display: block !important;
      clear: none !important;
    }

    .doc-img-wrapper[data-wrap="right"],
    figure[data-wrap="right"],
    img[data-wrap="right"],
    figure.align-right,
    .align-right,
    figure[style*="float: right"],
    figure[style*="float:right"],
    img[style*="float: right"],
    img[style*="float:right"] {
      float: right !important;
      margin: 8px 0 8px 18px !important;
      margin-left: 18px !important;
      margin-right: 0 !important;
      display: block !important;
      clear: none !important;
    }

    a {
      color: inherit !important;
      text-decoration: none !important;
    }
  }
</style>
`;
}

export interface DocumentPrintSpecOptions {
  fontSizePx?: number;
  verticalMarginMm?: number;
  sideMarginMm?: number;
  totalLeftMarginMm?: number;
}

export function getDocumentPrintSpecStyles(options: DocumentPrintSpecOptions = {}): string {
  const {
    fontSizePx = 14,
    verticalMarginMm = 12,
    sideMarginMm = 10,
    totalLeftMarginMm = 10
  } = options;

  const vMargin = typeof verticalMarginMm === 'number' && verticalMarginMm >= 0 ? verticalMarginMm : 12;
  const sMargin = typeof sideMarginMm === 'number' && sideMarginMm >= 0 ? sideMarginMm : 10;
  const lMargin = typeof totalLeftMarginMm === 'number' && totalLeftMarginMm >= 0 ? totalLeftMarginMm : sMargin;

  return `
<style id="studio-document-print-spec">
  @page {
    size: A4 portrait;
    margin: ${vMargin}mm ${sMargin}mm ${vMargin}mm ${lMargin}mm;
    margin-top: ${vMargin}mm;
    margin-bottom: ${vMargin}mm;
    margin-left: ${lMargin}mm;
    margin-right: ${sMargin}mm;
  }

  *, *::before, *::after {
    box-sizing: border-box !important;
    resize: none !important;
    outline: none !important;
    outline-offset: 0 !important;
    -webkit-tap-highlight-color: transparent !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  .studio-active-selected-element,
  p, h1, h2, h3, h4, h5, h6, li, blockquote, .panel, .callout, div, span, table, td, th {
    outline: none !important;
    outline-offset: 0 !important;
  }

  html, body {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: ${fontSizePx ? `${fontSizePx}px` : '10.5pt'};
    line-height: 1.55;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
    color-adjust: exact !important;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
  }

  .print-document-content {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  /* Table Architecture for PDF & Print - Natural Continuous Flow */
  table {
    display: table !important;
    width: 100% !important;
    max-width: 100% !important;
    border-collapse: collapse !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
    overflow: visible !important;
    margin-top: 8px !important;
    margin-bottom: 12px !important;
    box-shadow: none !important;
  }

  thead {
    display: table-header-group !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  tfoot {
    display: table-footer-group !important;
  }

  tbody {
    display: table-row-group !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  table th, table td {
    padding: 7px 10px;
    font-size: ${fontSizePx ? `${Math.max(fontSizePx - 2, 11)}px` : '9.5pt'};
    line-height: 1.45;
    resize: none !important;
    overflow: visible !important;
    vertical-align: top;
    box-sizing: border-box;
    word-break: break-word;
    border: 1px solid #cbd5e1;
  }

  table th {
    font-weight: 700;
  }

  /* Headings with orphan protection (Preserve Colors) */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 800;
    margin-top: 0;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #e2e8f0;
  }

  h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin-top: 14px;
    margin-bottom: 6px;
  }

  h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 10px;
    margin-bottom: 4px;
  }

  p {
    margin-top: 0;
    margin-bottom: 6px;
    orphans: 2;
    widows: 2;
    page-break-inside: auto;
    break-inside: auto;
  }

  /* Section Containers - Prevent pushing entire sections */
  section, article, main, .section, .content-block, .topic, .block {
    page-break-inside: auto !important;
    break-inside: auto !important;
    overflow: visible !important;
  }

  /* Callout Panels & Blockquotes */
  .panel, .callout, blockquote {
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: visible !important;
    max-width: 100% !important;
  }

  /* KaTeX Math */
  .katex-display {
    margin: 0.4em 0 !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .katex {
    font-size: 1.05em !important;
    text-rendering: auto !important;
  }

  /* Images & Figures */
  img, figure {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    max-width: 100% !important;
  }

  img {
    height: auto !important;
    max-width: 100% !important;
  }

  /* Non-print overlays */
  .studio-pointer-marker,
  .studio-resize-handle,
  .studio-img-toolbar,
  .doc-img-toolbar,
  .doc-resize-handle,
  .doc-img-dimension-tooltip,
  #doc-image-drop-indicator,
  .slide-card-header-badge,
  .studio-page-break-indicator-line,
  .studio-page-break-indicator-label,
  .no-print {
    display: none !important;
  }

  .doc-img-wrapper {
    outline: none !important;
    box-shadow: none !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .doc-img-wrapper img {
    width: 100% !important;
    height: auto !important;
    display: block !important;
  }

  /* Center Aligned Images & Figures in Print */
  .doc-img-wrapper[data-wrap="center"],
  figure[data-wrap="center"],
  img[data-wrap="center"],
  figure.align-center,
  .align-center,
  figure[style*="margin: 16px auto"],
  figure[style*="margin:16px auto"],
  figure[style*="margin: auto"],
  figure[style*="margin:auto"],
  img[style*="margin: 16px auto"],
  img[style*="margin:16px auto"],
  img[style*="margin: auto"],
  img[style*="margin:auto"] {
    float: none !important;
    margin-left: auto !important;
    margin-right: auto !important;
    margin-top: 16px !important;
    margin-bottom: 16px !important;
    display: block !important;
    text-align: center !important;
    clear: both !important;
  }

  /* Left Aligned Images & Figures in Print */
  .doc-img-wrapper[data-wrap="left"],
  figure[data-wrap="left"],
  img[data-wrap="left"],
  figure.align-left,
  .align-left,
  figure[style*="float: left"],
  figure[style*="float:left"],
  img[style*="float: left"],
  img[style*="float:left"] {
    float: left !important;
    margin: 6px 18px 12px 0 !important;
    margin-left: 0 !important;
    margin-right: 18px !important;
    max-width: min(48%, 380px) !important;
    display: block !important;
    clear: none !important;
  }

  /* Right Aligned Images & Figures in Print */
  .doc-img-wrapper[data-wrap="right"],
  figure[data-wrap="right"],
  img[data-wrap="right"],
  figure.align-right,
  .align-right,
  figure[style*="float: right"],
  figure[style*="float:right"],
  img[style*="float: right"],
  img[style*="float:right"] {
    float: right !important;
    margin: 6px 0 12px 18px !important;
    margin-left: 18px !important;
    margin-right: 0 !important;
    max-width: min(48%, 380px) !important;
    display: block !important;
    clear: none !important;
  }
</style>
`;
}
