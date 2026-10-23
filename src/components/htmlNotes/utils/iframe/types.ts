export interface PrepareIframeHtmlOptions {
  code: string;
  sideMarginMm: number;
  verticalMarginMm: number;
  totalLeftMarginMm: number;
  fontSizePx: number;
  viewportMode: string;
  isDark: boolean;
  zoomLevel: number;
  a4Pages?: number;
  setA4Pages?: (count: number) => void;
  viewMode?: string;
  isPreviewEditMode?: boolean;
}
