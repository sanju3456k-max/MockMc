export const STUDIO_CSS_STYLES = `
  * {
    box-sizing: border-box;
  }

  .studio,
  .studio * {
    scrollbar-width: thin !important;
    -ms-overflow-style: auto !important;
    scrollbar-color: rgba(148, 163, 184, 0.5) transparent !important;
  }

  .studio.dark,
  .studio.dark * {
    scrollbar-color: rgba(113, 113, 122, 0.6) transparent !important;
  }

  .studio::-webkit-scrollbar,
  .studio *::-webkit-scrollbar {
    display: block !important;
    width: 6px !important;
    height: 6px !important;
  }

  .studio::-webkit-scrollbar-track,
  .studio *::-webkit-scrollbar-track {
    background: transparent !important;
  }

  .studio::-webkit-scrollbar-thumb,
  .studio *::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.5) !important;
    border-radius: 9999px !important;
    border: 1.5px solid transparent !important;
    background-clip: content-box !important;
  }

  .studio::-webkit-scrollbar-thumb:hover,
  .studio *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(100, 116, 139, 0.8) !important;
  }

  .studio.dark::-webkit-scrollbar-thumb,
  .studio.dark *::-webkit-scrollbar-thumb {
    background-color: rgba(113, 113, 122, 0.6) !important;
  }

  .studio.dark::-webkit-scrollbar-thumb:hover,
  .studio.dark *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(161, 161, 170, 0.9) !important;
  }

  .studio.is-home-view,
  .studio.is-home-view * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  .studio.is-home-view::-webkit-scrollbar,
  .studio.is-home-view *::-webkit-scrollbar {
    display: none !important;
    width: 0px !important;
    height: 0px !important;
  }

  .studio {
    --bg: #ffffff;
    --panel: #ffffff;
    --text: #0f172a;
    --muted: #475569;
    --line: #cbd5e1;

    min-height: 100vh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    color: #0f172a;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .studio style {
    display: none !important;
  }

  .studio.dark {
    --bg: #0b0c10;
    --panel: #0b0c10;
    --text: #e8eaed;
    --muted: #9aa0a6;
    --line: #2c313d;
    background: #0b0c10;
  }

  /* HTML Notes Home Page: Matches Test List Home Page with identical plain #e5e9f0 body and header */
  .studio.is-home-view {
    --bg: #e5e9f0;
    --panel: #e5e9f0;
    background: #e5e9f0 !important;
  }

  .studio.dark.is-home-view {
    --bg: #0b0c10;
    --panel: #0b0c10;
    background: #0b0c10 !important;
  }

  .studio.is-home-view .topbar {
    background: #e5e9f0 !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
  }

  .studio.dark.is-home-view .topbar {
    background: #0b0c10 !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
  }

  /* Low-performance device optimized hardware acceleration & motion transitions */
  .studio button, 
  .studio a, 
  .studio [role="button"], 
  .studio-rail-btn, 
  .mode-switch button, 
  .tabs button {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    transition: transform 0.1s cubic-bezier(0.2, 0, 0, 1), background-color 0.1s ease, color 0.1s ease, border-color 0.1s ease;
  }

  .studio button:active,
  .studio .btn:active {
    transform: scale(0.97) translateZ(0);
  }

  .sidebar-drawer {
    will-change: transform, opacity;
    transform: translateZ(0);
    transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1), opacity 0.15s ease;
  }

  /* Global Medium Font Weight Enforcement across Notes Studio */
  .studio, 
  .studio input, 
  .studio textarea, 
  .studio button, 
  .code-editor, 
  .line-numbers,
  .sidebar-drawer,
  .sidebar-rail,
  .topbar {
    font-weight: 500;
  }

  .topbar {
    min-height: 48px;
    height: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 0.6rem) 16px 0.6rem 16px;
    margin: 0 !important;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #ffffff;
    border-bottom: 0 !important;
    border: 0 !important;
    flex-shrink: 0;
    z-index: 20;
    width: 100%;
    box-sizing: border-box;
  }

  .studio.dark .topbar {
    background: #0b0c10;
  }

  .brand {
    font-weight: 800;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 17px;
    white-space: nowrap;
    flex-shrink: 0;
    color: #0f172a;
  }

  .studio.dark .brand {
    color: #e3e3e3;
  }

  .brand span {
    color: #0b57d0;
  }

  .studio.dark .brand span {
    color: #a8c7fa;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .btn {
    border-radius: 9999px;
    border: 0 !important;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    background: #eff2f6;
    color: #334155;
    transition: all 0.15s ease;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .studio.dark .btn {
    background: #232732;
    color: #cbd5e1;
    border: 0 !important;
  }

  .btn:hover {
    background: #e2e8f0;
    color: #0b57d0;
  }

  .studio.dark .btn:hover {
    background: #2d3340;
    color: #a8c7fa;
  }

  .btn-primary {
    background: #0b57d0;
    color: #ffffff !important;
  }

  .btn-primary:hover {
    background: #0842a0;
  }

  .mode-switch {
    display: flex;
    align-items: center;
    background: #eff2f6;
    padding: 2px;
    border-radius: 9999px;
    border: 0 !important;
  }

  .studio.dark .mode-switch {
    background: #232732;
    border: 0 !important;
  }

  .mode-switch button {
    border: 0 !important;
    background: transparent;
    color: #64748b;
    border-radius: 9999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }

  .studio.dark .mode-switch button {
    color: #94a3b8;
  }

  .mode-switch button.active {
    background: #0b57d0;
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .studio.dark .mode-switch button.active {
    background: #0b57d0;
    color: #ffffff;
  }

  .tabs {
    min-height: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border-bottom: 0 !important;
    background: #f8fafc;
    flex-shrink: 0;
    overflow-x: auto;
  }

  .studio.dark .tabs {
    background: #1b1e27;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tabs button {
    white-space: nowrap;
    border-radius: 9999px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    border: 0 !important;
    background: #f1f5f9;
    color: #334155;
    box-shadow: none !important;
  }

  .studio.dark .tabs button {
    background: #232732;
    color: #cbd5e1;
    border: 0 !important;
  }

  .tabs button:hover {
    background: #e2e8f0;
    border: 0 !important;
    color: #0b57d0;
  }

  .tabs .active-tab {
    border: 0 !important;
    color: #0b57d0 !important;
    background: #eff6ff !important;
    font-weight: 800;
    box-shadow: none !important;
  }

  .studio.dark .tabs .active-tab {
    border: 0 !important;
    color: #a8c7fa !important;
    background: #1e293b !important;
  }

  .workspace {
    min-height: 0;
    flex: 1;
    display: flex;
    gap: 0;
    background: var(--panel);
    overflow: hidden;
    position: relative;
  }

  .split-workspace-container {
    flex: 1 1 0%;
    min-width: 0;
    height: 100%;
    display: flex;
    position: relative;
    overflow: hidden;
    background: var(--panel);
  }

  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    background: var(--panel);
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    background: var(--panel);
  }

  .preview-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden !important;
    position: relative;
    background: var(--panel);
  }

  .editor-container {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
    min-width: 0;
    height: 100%;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .line-numbers {
    background: rgba(241, 245, 249, 0.7);
    color: #94a3b8;
    border-right: 1px solid rgba(226, 232, 240, 0.9);
  }

  .studio.dark .line-numbers {
    background: #0d1117 !important;
    color: #64748b !important;
    border-right: 1px solid #1e293b !important;
  }

  .code-editor {
    background: #ffffff;
    color: #0f172a;
    caret-color: #2563eb;
  }

  .studio.dark .code-editor {
    background: #0d1117 !important;
    color: #e2e8f0 !important;
    caret-color: #38bdf8 !important;
  }

  .studio.dark .code-editor::selection {
    background: #1e3a8a !important;
    color: #ffffff !important;
  }

  .section-code-blink-banner {
    position: absolute;
    left: 46px;
    right: 0;
    height: 22px;
    background: rgba(37, 99, 235, 0.15);
    border-left: 3px solid #2563eb;
    pointer-events: none;
    z-index: 10;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 11px;
    color: #1d4ed8;
    font-weight: 600;
  }

  .studio.dark .section-code-blink-banner {
    background: rgba(56, 189, 248, 0.2) !important;
    border-left: 3px solid #38bdf8 !important;
    color: #a5f3fc !important;
  }

  /* Resizable Divider */
  .split-divider {
    width: 8px;
    cursor: col-resize;
    background: var(--line);
    position: relative;
    z-index: 30;
    transition: background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }

  .split-divider:hover,
  .split-divider.active {
    background: #3b82f6;
  }

  .split-divider-handle {
    width: 2px;
    height: 24px;
    background: var(--muted);
    border-radius: 9999px;
  }

  /* Resizing Shield State (Prevents iframe from swallowing mouse/touch events & eliminates layout lag) */
  .is-resizing,
  .is-resizing * {
    user-select: none !important;
    -webkit-user-select: none !important;
    cursor: col-resize !important;
    transition: none !important;
  }
  .is-resizing iframe {
    pointer-events: none !important;
  }

  /* Left Activity Rail (Desktop Only) */
  .sidebar-rail {
    width: 42px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    z-index: 25;
  }

  .sidebar-rail-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .sidebar-rail-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--muted);
    transition: all 0.15s ease;
  }

  .sidebar-rail-btn:hover {
    color: #0b57d0;
    background: #eff6ff;
  }

  .sidebar-rail-btn.active {
    color: #0b57d0;
    background: #dbeafe;
  }

  .studio.dark .sidebar-rail-btn:hover {
    color: #a8c7fa;
    background: #1e293b;
  }

  .studio.dark .sidebar-rail-btn.active {
    color: #a8c7fa;
    background: #232732;
  }

  .sidebar-drawer {
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid var(--line);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 20;
  }

  .sidebar-drawer-header {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
    color: var(--text);
    transition: background 0.1s;
  }

  .tree-node:hover {
    background: #f1f5f9;
  }

  .studio.dark .tree-node:hover {
    background: #1e293b;
  }

  .tree-node.active {
    background: #eff6ff;
    color: #0b57d0;
    font-weight: 600;
  }

  .studio.dark .tree-node.active {
    background: #1e293b;
    color: #a8c7fa;
  }

  /* HTML Preview Canvas - Full Background Mode & Sheet Options */
  .preview-canvas-wrapper {
    flex: 1;
    overflow: hidden !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #ffffff;
    padding: 0 !important;
    margin: 0 !important;
    width: 100%;
    height: 100%;
  }

  .studio.dark .preview-canvas-wrapper {
    background: #0b0c10;
  }

  .preview-canvas-wrapper.is-a4-mode,
  .is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
    display: block !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
  }

  .studio.dark .preview-canvas-wrapper.is-a4-mode,
  .studio.dark.is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
    background: #14161d !important;
  }

  /* Full Background Mode in HTML Preview (both split view and preview view modes) */
  .preview-canvas-wrapper.is-full-background,
  .preview-pane .preview-canvas-wrapper:not(.is-a4-mode),
  .is-preview-active .preview-pane .preview-canvas-wrapper:not(.is-a4-mode) {
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: #ffffff !important;
    display: block !important;
    border: 0 !important;
    border-radius: 0 !important;
  }

  .studio.dark .preview-canvas-wrapper.is-full-background,
  .studio.dark .preview-pane .preview-canvas-wrapper:not(.is-a4-mode),
  .studio.dark.is-preview-active .preview-pane .preview-canvas-wrapper:not(.is-a4-mode) {
    background: #14161d !important;
  }

  .preview-sheet-card {
    background: #ffffff;
    width: 100%;
    max-width: 1000px;
    height: 100%;
    min-height: 100%;
    margin: 0 auto;
    padding: 0;
    border: 0 !important;
    border-radius: 24px !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
    overflow: hidden;
  }

  .preview-sheet-card.is-full-background,
  .preview-pane .preview-sheet-card:not(.is-a4-paper),
  .is-preview-active .preview-pane .preview-sheet-card:not(.is-a4-paper) {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  .studio.dark .preview-sheet-card {
    background: #1b1e27 !important;
    border: 0 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35) !important;
  }

  .studio.dark .preview-sheet-card.is-a4-paper {
    background: #161b22 !important;
    border: 1px solid #30363d !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1) !important;
  }

  .preview-sheet-card.is-a4-paper {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 50% !important;
    margin: 0 !important;
    margin-left: -397px !important;
    transform-origin: top center !important;
    width: 794px !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1) !important;
    background: #ffffff !important;
    text-align: left !important;
    vertical-align: top !important;
    overflow: hidden !important;
    flex-shrink: 0 !important;
  }

  .preview-frame {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    border: 0 !important;
    margin: 0 !important;
    background: #fff;
    display: block;
  }

  .status {
    min-height: 24px;
    height: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    color: var(--muted);
    font-size: 10px;
    flex-shrink: 0;
  }

  .hidden-input {
    display: none;
  }

  .studio-preview-editable {
    cursor: text;
  }
  .studio-preview-editable [contenteditable="true"] {
    outline: none !important;
    caret-color: #2563eb !important;
  }
  .studio-preview-editable [contenteditable="true"]:focus {
    outline: 1.5px dashed rgba(37,99,235,0.35) !important;
    outline-offset: 2px !important;
  }

  .studio-img-wrapper {
    position: relative;
    display: inline-block;
    max-width: 100%;
    user-select: none;
    vertical-align: middle;
    box-sizing: border-box;
    margin: 12px 0;
  }

  .studio-img-wrapper img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    border-radius: 8px;
    cursor: pointer;
  }

  .studio-img-wrapper.selected {
    outline: 2.5px solid #2563eb;
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.18);
  }

  .studio-resize-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #2563eb;
    border: 2px solid #ffffff;
    border-radius: 50%;
    z-index: 100;
    display: none;
  }

  .studio-img-wrapper.selected .studio-resize-handle {
    display: block;
  }

  .handle-nw { top: -6px; left: -6px; cursor: nwse-resize; }
  .handle-ne { top: -6px; right: -6px; cursor: nesw-resize; }
  .handle-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
  .handle-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
  .handle-n { top: -6px; left: calc(50% - 6px); cursor: ns-resize; }
  .handle-s { bottom: -6px; left: calc(50% - 6px); cursor: ns-resize; }
  .handle-w { top: calc(50% - 6px); left: -6px; cursor: ew-resize; }
  .handle-e { top: calc(50% - 6px); right: -6px; cursor: ew-resize; }

  .studio-img-toolbar {
    position: absolute;
    top: -48px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: #ffffff;
    padding: 5px 10px;
    border-radius: 9999px;
    display: none;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: bold;
    z-index: 101;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    white-space: nowrap;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .studio-img-wrapper.selected .studio-img-toolbar {
    display: flex;
  }

  .studio-img-toolbar button {
    background: rgba(255,255,255,0.18);
    border: none;
    color: white;
    padding: 3px 8px;
    border-radius: 9999px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    transition: background 0.15s;
  }

  .studio-img-toolbar button:hover {
    background: #2563eb;
  }

  /* MOBILE OPTIMIZATIONS (Strictly hides Split view & cleans top header) */
  @media (max-width: 768px) {
    .preview-canvas-wrapper,
    .preview-canvas-wrapper.is-a4-mode,
    .is-preview-active .preview-pane .preview-canvas-wrapper.is-a4-mode {
      padding: 0 !important;
    }

    .preview-sheet-card:not(.is-a4-paper) {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    .desktop-only,
    .hidden-mobile {
      display: none !important;
    }

    .sidebar-rail {
      display: none !important;
    }

    .mode-switch button[title*="Split"],
    .mode-switch button:nth-child(2) {
      display: none !important;
    }

    .sidebar-drawer.mobile-sheet {
      position: absolute !important;
      top: 0;
      left: 0;
      bottom: 0;
      width: 85% !important;
      max-width: 320px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      border-right: 1px solid var(--line);
      z-index: 50 !important;
    }

    .mobile-drawer-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 45;
    }
  }
`;
