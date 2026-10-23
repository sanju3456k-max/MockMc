/**
 * HtmlNotesStudio Entry Point
 * 
 * Modular architecture:
 * The single 5,000-line monolithic file has been refactored into domain-specific components:
 * - src/components/htmlNotes/types.ts                   (Data models & view mode types)
 * - src/components/htmlNotes/constants/templates.ts     (Starter templates & samples)
 * - src/components/htmlNotes/constants/studioStyles.ts  (Studio styles & design rules)
 * - src/components/htmlNotes/utils/iframeGenerator.ts   (A4 pagination & KaTeX iframe compiler)
 * - src/components/htmlNotes/hooks/useSplitResizer.ts   (Ultra-smooth 120 FPS split resizing)
 * - src/components/htmlNotes/hooks/usePreviewZoom.ts    (Dynamic paper zoom & centering)
 * - src/components/htmlNotes/components/
 *     - HtmlNotesHomeView.tsx                           (Overleaf-style Project dashboard)
 *     - HtmlNotesHeader.tsx                             (Top action & file tabs header)
 *     - HtmlNotesSidebar.tsx                            (Left drawer: files, outline, margins)
 *     - HtmlNotesEditorPane.tsx                         (Code textarea, search, line numbers)
 *     - HtmlNotesSplitDivider.tsx                       (Lag-free draggable split bar)
 *     - HtmlNotesPreviewPane.tsx                        (Centered A4 stage & preview canvas)
 *     - HtmlNotesZoomControls.tsx                       (Floating zoom pill)
 *     - HtmlNotesModals.tsx                             (Options popover & delete modal)
 * - src/components/htmlNotes/HtmlNotesStudio.tsx        (Lightweight orchestrator)
 */

export { HtmlNotesStudio } from './htmlNotes/HtmlNotesStudio';
export * from './htmlNotes/types';
