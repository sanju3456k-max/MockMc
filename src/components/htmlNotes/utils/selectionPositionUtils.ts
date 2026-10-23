/**
 * Selection Position Utility
 * 
 * Computes top/left pixel coordinates for floating selection toolbars
 * relative to a parent container element, with viewport boundary clamping.
 */

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function getDomSelectionBoundingRect(containerEl: HTMLElement | null): SelectionRect | null {
  if (typeof window === 'undefined') return null;

  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    if (containerEl) {
      const containerRect = containerEl.getBoundingClientRect();
      // Position directly at the bottom of the selected area
      const top = Math.min(
        containerRect.height - 45,
        Math.max(8, rect.bottom - containerRect.top + 8)
      );
      const left = Math.min(
        containerRect.width - 200,
        Math.max(12, rect.right - containerRect.left - 120)
      );

      return {
        top,
        left,
        width: rect.width,
        height: rect.height,
      };
    }

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  } catch (e) {
    return null;
  }
}
