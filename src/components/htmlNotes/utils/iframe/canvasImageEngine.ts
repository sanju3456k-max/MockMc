/**
 * Canvas Image Engine for HTML Notes Preview
 * Provides Google Docs-style image text-wrapping, 8-point stretching/resizing,
 * multi-page free-drag repositioning, and positional image insertion (drag-drop, paste, modal).
 */

export function getCanvasImageEngineScript(isPreviewEditMode: boolean = false): string {
  return `
<style id="studio-canvas-image-engine-styles">
  /* Base Image Wrapper with Google Docs flow */
  .doc-img-wrapper {
    position: relative !important;
    display: block;
    box-sizing: border-box !important;
    cursor: grab;
    user-select: none;
    touch-action: none;
    overflow: visible !important;
    transition: outline 0.15s ease, box-shadow 0.15s ease;
    border-radius: 6px;
    z-index: 10;
  }

  body.studio-preview-editable .doc-img-wrapper:hover {
    outline: 2px dashed #3b82f6 !important;
  }

  body.studio-preview-editable .doc-img-wrapper.selected {
    cursor: move;
    z-index: 1000 !important;
    outline: 2.5px solid #2563eb !important;
    box-shadow: 0 4px 18px rgba(37, 99, 235, 0.35) !important;
  }

  /* When Edit Mode is OFF: completely passive, non-adjustable, non-selectable */
  body:not(.studio-preview-editable) .doc-img-wrapper {
    cursor: default !important;
    touch-action: auto !important;
    user-select: auto !important;
    outline: none !important;
    box-shadow: none !important;
  }

  body:not(.studio-preview-editable) .doc-img-wrapper:hover,
  body:not(.studio-preview-editable) .doc-img-wrapper.selected {
    outline: none !important;
    box-shadow: none !important;
    cursor: default !important;
  }

  body:not(.studio-preview-editable) .doc-img-toolbar,
  body:not(.studio-preview-editable) .doc-resize-handle,
  body:not(.studio-preview-editable) .doc-img-dimension-tooltip,
  body:not(.studio-preview-editable) #doc-image-drop-indicator {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
  }

  /* Google Docs Real-Time Ghost Dragging */
  .doc-img-wrapper.is-dragging {
    pointer-events: none !important;
    opacity: 0.72 !important;
    cursor: grabbing !important;
    outline: 2.5px solid #2563eb !important;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35), 0 0 20px rgba(37, 99, 235, 0.45) !important;
    will-change: transform !important;
    transition: none !important;
  }

  .doc-img-wrapper.is-dragging * {
    pointer-events: none !important;
  }

  .doc-img-wrapper.is-dragging .doc-img-toolbar,
  .doc-img-wrapper.is-dragging .doc-resize-handle {
    display: none !important;
  }

  .doc-img-wrapper.doc-img-card-frame {
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12) !important;
    border: 1px solid rgba(0, 0, 0, 0.12) !important;
    padding: 6px !important;
    background: #ffffff !important;
  }

  .doc-img-wrapper img {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    border-radius: 6px;
    pointer-events: auto !important;
    user-select: none !important;
    -webkit-user-drag: none !important;
  }

  /* Containers must establish Block Formatting Context so floats are cleanly contained */
  .panel, .panel-warning, .panel-success, .panel-info, .slide, .slide-body, .a4-sheet, .dropdown-box, details, section, article, .card {
    display: flow-root !important;
    box-sizing: border-box !important;
    overflow-wrap: break-word !important;
  }

  .katex-display {
    max-width: 100% !important;
    overflow-x: auto !important;
  }

  /* Wrap Presets (Google Docs flow with generous text margins) */
  .doc-img-wrapper[data-wrap="left"] {
    float: left !important;
    max-width: min(48%, 380px) !important;
    margin: 6px 18px 12px 0 !important;
    clear: none !important;
    shape-outside: margin-box !important;
  }

  .doc-img-wrapper[data-wrap="center"] {
    float: none !important;
    margin: 16px auto !important;
    margin-left: auto !important;
    margin-right: auto !important;
    clear: both !important;
    display: block !important;
    max-width: 100% !important;
  }

  .doc-img-wrapper[data-wrap="right"] {
    float: right !important;
    max-width: min(48%, 380px) !important;
    margin: 6px 0 12px 18px !important;
    clear: none !important;
    shape-outside: margin-box !important;
  }

  .doc-img-wrapper[data-wrap="break"] {
    float: none !important;
    margin: 16px auto !important;
    margin-left: auto !important;
    margin-right: auto !important;
    clear: both !important;
    display: block !important;
    max-width: 100% !important;
  }

  .doc-img-wrapper[data-wrap="full"] {
    float: none !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 16px 0 !important;
    clear: both !important;
    display: block !important;
  }

  /* Floating Google Docs Toolbar */
  .doc-img-toolbar {
    display: none !important;
    position: absolute !important;
    top: -50px !important;
    left: 50% !important;
    transform: translateX(-50%) scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: bottom center !important;
    background: #0f172a !important;
    color: #ffffff !important;
    padding: 4px 8px !important;
    border-radius: 9999px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    z-index: 2147483647 !important;
    white-space: nowrap !important;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    align-items: center !important;
    gap: 4px !important;
    pointer-events: auto !important;
    min-width: max-content !important;
    width: max-content !important;
  }

  .doc-img-wrapper.selected .doc-img-toolbar {
    display: inline-flex !important;
  }

  .doc-img-wrapper.toolbar-flip .doc-img-toolbar {
    top: auto !important;
    bottom: -50px !important;
    transform: translateX(-50%) scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: top center !important;
  }

  .doc-img-toolbar button {
    background: rgba(255, 255, 255, 0.12) !important;
    border: none !important;
    color: #ffffff !important;
    padding: 4px 8px !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    transition: all 0.12s ease !important;
    line-height: 1 !important;
    user-select: none !important;
  }

  .doc-img-toolbar button:hover {
    background: rgba(255, 255, 255, 0.24) !important;
  }

  .doc-img-toolbar button.active {
    background: #2563eb !important;
    color: #ffffff !important;
    box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4) !important;
  }

  .doc-img-toolbar button.btn-danger {
    background: #ef4444 !important;
  }

  .doc-img-toolbar button.btn-danger:hover {
    background: #dc2626 !important;
  }

  .doc-img-toolbar .toolbar-divider {
    width: 1px;
    height: 14px;
    background: rgba(255, 255, 255, 0.22);
    margin: 0 2px;
  }

  /* 8-Point Transformation & Stretching Handles */
  .doc-resize-handle {
    display: none !important;
    position: absolute !important;
    width: 16px !important;
    height: 16px !important;
    background: #ffffff !important;
    border: 2.5px solid #2563eb !important;
    border-radius: 4px !important;
    z-index: 100001 !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
    touch-action: none !important;
    pointer-events: auto !important;
    transform: scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: center center !important;
    box-sizing: border-box !important;
  }

  .doc-img-wrapper.selected .doc-resize-handle {
    display: block !important;
  }

  /* Corner Handles (Proportional / Corner Stretch) */
  .handle-nw { top: -8px !important; left: -8px !important; cursor: nwse-resize !important; }
  .handle-ne { top: -8px !important; right: -8px !important; cursor: nesw-resize !important; }
  .handle-sw { bottom: -8px !important; left: -8px !important; cursor: nesw-resize !important; }
  .handle-se { bottom: -8px !important; right: -8px !important; cursor: nwse-resize !important; }

  /* Edge Handles (Stretch Width & Height) */
  .handle-n { top: -8px !important; left: calc(50% - 8px) !important; cursor: ns-resize !important; border-radius: 50% !important; background: #2563eb !important; border-color: #ffffff !important; }
  .handle-s { bottom: -8px !important; left: calc(50% - 8px) !important; cursor: ns-resize !important; border-radius: 50% !important; background: #2563eb !important; border-color: #ffffff !important; }
  .handle-w { top: calc(50% - 8px) !important; left: -8px !important; cursor: ew-resize !important; border-radius: 50% !important; background: #2563eb !important; border-color: #ffffff !important; }
  .handle-e { top: calc(50% - 8px) !important; right: -8px !important; cursor: ew-resize !important; border-radius: 50% !important; background: #2563eb !important; border-color: #ffffff !important; }

  /* Live Insertion Drop Indicator with Accurate Edge Beads */
  #doc-image-drop-indicator {
    height: 4px !important;
    background: #2563eb !important;
    border-radius: 2px !important;
    margin: 8px 0 !important;
    box-shadow: 0 0 16px rgba(37, 99, 235, 0.95) !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    width: 100% !important;
    position: relative !important;
    transition: top 0.04s ease !important;
  }

  #doc-image-drop-indicator::before {
    content: '' !important;
    position: absolute !important;
    left: -5px !important;
    top: -5px !important;
    width: 14px !important;
    height: 14px !important;
    border-radius: 50% !important;
    background: #2563eb !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 10px rgba(37, 99, 235, 1) !important;
  }

  #doc-image-drop-indicator::after {
    content: '' !important;
    position: absolute !important;
    right: -5px !important;
    top: -5px !important;
    width: 14px !important;
    height: 14px !important;
    border-radius: 50% !important;
    background: #2563eb !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 0 10px rgba(37, 99, 235, 1) !important;
  }

  /* Free drag state: disable pointer events so underlying DOM can be detected reliably */
  .doc-img-wrapper.is-dragging {
    pointer-events: none !important;
    opacity: 0.45 !important;
    cursor: grabbing !important;
    filter: drop-shadow(0 8px 24px rgba(37, 99, 235, 0.4)) !important;
  }

  .doc-img-wrapper.is-dragging * {
    pointer-events: none !important;
  }

  /* Size feedback tooltip during stretch/resize */
  .doc-img-dimension-tooltip {
    position: absolute !important;
    bottom: -28px !important;
    left: 50% !important;
    transform: translateX(-50%) scale(calc(1 / var(--paper-zoom, 1))) !important;
    background: rgba(15, 23, 42, 0.9) !important;
    color: #ffffff !important;
    padding: 2px 7px !important;
    border-radius: 4px !important;
    font-size: 10px !important;
    font-family: monospace !important;
    pointer-events: none !important;
    white-space: nowrap !important;
    z-index: 100002 !important;
  }

  @media print {
    .doc-img-toolbar,
    .doc-resize-handle,
    .doc-img-dimension-tooltip,
    #doc-image-drop-indicator {
      display: none !important;
    }
    .doc-img-wrapper {
      outline: none !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .doc-img-wrapper[data-wrap="center"],
    figure[data-wrap="center"],
    img[data-wrap="center"] {
      float: none !important;
      margin: 16px auto !important;
      margin-left: auto !important;
      margin-right: auto !important;
      display: block !important;
      text-align: center !important;
      clear: both !important;
    }
    .doc-img-wrapper[data-wrap="left"],
    figure[data-wrap="left"],
    img[data-wrap="left"] {
      float: left !important;
      margin: 8px 18px 8px 0 !important;
      margin-left: 0 !important;
      margin-right: 18px !important;
      display: block !important;
      clear: none !important;
    }
    .doc-img-wrapper[data-wrap="right"],
    figure[data-wrap="right"],
    img[data-wrap="right"] {
      float: right !important;
      margin: 8px 0 8px 18px !important;
      margin-left: 18px !important;
      margin-right: 0 !important;
      display: block !important;
      clear: none !important;
    }
  }
</style>

<script id="studio-canvas-image-engine-script">
(function() {
  'use strict';

  // Mark engine as active so legacy scripts don't double-bind
  window.__useCanvasImageEngine = true;

  var selectedWrapper = null;
  var targetImgToReplace = null;
  var isStretchMode = false;
  var lastActiveElement = null;
  var lastPointerCoords = { x: -1, y: -1 };

  function recordPointer(e) {
    if (e && typeof e.clientX === 'number') {
      lastPointerCoords.x = e.clientX;
      lastPointerCoords.y = e.clientY;
    }
  }

  // Track the last clicked or focused block element in the document
  function recordActiveElement(e) {
    recordPointer(e);
    var target = e.target;
    if (!target || target.nodeType !== 1) return;
    if (target.closest('.doc-img-toolbar') || target.closest('.doc-resize-handle')) return;
    var block = target.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, div:not(.a4-sheet):not(.a4-container):not(.a4-centering-stage):not(.doc-img-wrapper)');
    if (block) {
      lastActiveElement = block;
    }
  }

  document.addEventListener('pointermove', recordPointer, { passive: true });
  document.addEventListener('mousemove', recordPointer, { passive: true });
  document.addEventListener('pointerdown', recordActiveElement, true);
  document.addEventListener('click', recordActiveElement, true);
  document.addEventListener('keyup', recordActiveElement, true);

  // 1. Zoom calculation helper
  function getPaperZoom() {
    var container = document.querySelector('.a4-container') || document.querySelector('.a4-centering-stage') || document.body;
    var zoomStr = getComputedStyle(container).getPropertyValue('--paper-zoom') ||
                  getComputedStyle(document.documentElement).getPropertyValue('--paper-zoom') || '1';
    var parsed = parseFloat(zoomStr);
    return (parsed && parsed > 0) ? parsed : 1;
  }

  // 2. Edit Mode Guard & Selection management
  function isCanvasImageEditAllowed() {
    return Boolean(
      window.__isEditModeActive ||
      window.__isPaperEditActive ||
      (document.body && document.body.classList.contains('studio-preview-editable'))
    );
  }
  window.isCanvasImageEditAllowed = isCanvasImageEditAllowed;

  function deselectAllImages() {
    var wrappers = document.querySelectorAll('.doc-img-wrapper.selected');
    wrappers.forEach(function(w) {
      w.classList.remove('selected');
      var tooltip = w.querySelector('.doc-img-dimension-tooltip');
      if (tooltip) tooltip.remove();
    });
    selectedWrapper = null;
  }
  window.deselectAllImages = deselectAllImages;

  function selectWrapper(wrapper) {
    if (!wrapper) return;
    if (!isCanvasImageEditAllowed()) {
      deselectAllImages();
      return;
    }
    if (selectedWrapper && selectedWrapper !== wrapper) {
      selectedWrapper.classList.remove('selected');
    }
    if (!wrapper.querySelector('.doc-resize-handle') || !wrapper.querySelector('.doc-img-toolbar')) {
      attachImageHandlesAndToolbar(wrapper);
    }
    wrapper.classList.add('selected');
    selectedWrapper = wrapper;

    // Flip toolbar if close to sheet/page top
    try {
      var rect = wrapper.getBoundingClientRect();
      var parentSheet = wrapper.closest('.a4-sheet') || wrapper.closest('.a4-container') || document.body;
      var sheetRect = parentSheet.getBoundingClientRect();
      if (rect.top - sheetRect.top < 52) {
        wrapper.classList.add('toolbar-flip');
      } else {
        wrapper.classList.remove('toolbar-flip');
      }
    } catch(err) {}

    // Update active wrap button state
    var toolbar = wrapper.querySelector('.doc-img-toolbar');
    if (toolbar) {
      var currentWrap = wrapper.getAttribute('data-wrap') || 'left';
      toolbar.querySelectorAll('button[data-wrap]').forEach(function(btn) {
        var bw = btn.getAttribute('data-wrap');
        if (bw === currentWrap || ((currentWrap === 'center' || currentWrap === 'break') && (bw === 'center' || bw === 'break'))) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      var stretchBtn = toolbar.querySelector('button[data-action="toggle-stretch"]');
      if (stretchBtn) {
        if (isStretchMode) stretchBtn.classList.add('active');
        else stretchBtn.classList.remove('active');
      }
    }
  }

  // 3. Drop Indicator Element
  function getOrCreateDropIndicator() {
    var ind = document.getElementById('doc-image-drop-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'doc-image-drop-indicator';
    }
    return ind;
  }

  // 4. HTML Sync Notifier with clean serialization
  var updateDebounceTimer = null;
  function triggerHtmlSync(immediate) {
    if (!window.__isEditModeActive) return;
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
    var doSync = function() {
      try {
        if (!window.__isEditModeActive) return;
        if (typeof window.getCleanHtml === 'function') {
          var cleanHtml = window.getCleanHtml();
          window.parent.postMessage({
            type: 'STUDIO_HTML_UPDATE',
            html: cleanHtml
          }, '*');
        }
      } catch(e) {}
    };

    if (immediate) {
      doSync();
    } else {
      updateDebounceTimer = setTimeout(doSync, 100);
    }
  }

  // 5. Setup Free Drag Repositioning Across Sheets & Elements
  function setupImageDrag(wrapper) {
    if (wrapper.__hasCanvasDrag) return;
    wrapper.__hasCanvasDrag = true;

    var isDragging = false;
    var startClientX = 0;
    var startClientY = 0;

    function onPointerDown(e) {
      if (!isCanvasImageEditAllowed()) return;
      var target = e.target;
      if (target.closest('.doc-resize-handle') || target.closest('.doc-img-toolbar')) return;

      e.stopPropagation();

      selectWrapper(wrapper);
      var touchObj = (e.touches && e.touches[0]) ? e.touches[0] : ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e);
      startClientX = touchObj.clientX || 0;
      startClientY = touchObj.clientY || 0;
      isDragging = false;

      var dropIndicator = getOrCreateDropIndicator();
      var dragRafId = null;

      function onPointerMove(evt) {
        var moveObj = (evt.touches && evt.touches[0]) ? evt.touches[0] : ((evt.changedTouches && evt.changedTouches[0]) ? evt.changedTouches[0] : evt);
        var curX = moveObj.clientX || 0;
        var curY = moveObj.clientY || 0;

        var dist = Math.hypot(curX - startClientX, curY - startClientY);
        if (!isDragging && dist > 4) {
          isDragging = true;
          wrapper.classList.add('is-dragging');
        }
        if (!isDragging) return;
        if (evt.cancelable) evt.preventDefault();

        if (dragRafId) cancelAnimationFrame(dragRafId);
        dragRafId = requestAnimationFrame(function() {
          // 1. Google Docs Real-Time Ghost Follows Cursor
          var dx = curX - startClientX;
          var dy = curY - startClientY;
          wrapper.style.transform = 'translate3d(' + dx + 'px, ' + dy + 'px, 0)';
          wrapper.style.zIndex = '2147483640';

          var hoverEl = document.elementFromPoint(curX, curY);
          if (!hoverEl || wrapper.contains(hoverEl)) return;

          var blockSelector = 'h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, figure, table, section, article, pre, details, summary, .panel, .callout, .dropdown-box, .metric-card, div:not(.a4-sheet):not(.a4-container):not(.doc-img-wrapper):not(.a4-centering-stage)';

          var sheets = Array.from(document.querySelectorAll('.a4-sheet, .slide'));
          if (sheets.length > 0) {
            var targetSheet = hoverEl.closest('.a4-sheet, .slide');
            if (!targetSheet) {
              for (var s = 0; s < sheets.length; s++) {
                var sRect = sheets[s].getBoundingClientRect();
                if (curY >= sRect.top - 10 && curY <= sRect.bottom + 10) {
                  targetSheet = sheets[s];
                  break;
                }
              }
            }
            if (targetSheet) {
              var block = hoverEl.closest(blockSelector);
              if (block && block !== wrapper && targetSheet.contains(block) && block.parentNode) {
                var rect = block.getBoundingClientRect();
                var relY = curY - rect.top;
                var isContainerBox = block.matches && block.matches('.panel, .panel-warning, .panel-success, .panel-info, .dropdown-box, details, .card');
                if (isContainerBox) {
                  if (relY < rect.height / 2) {
                    block.insertBefore(dropIndicator, block.firstChild);
                  } else {
                    block.appendChild(dropIndicator);
                  }
                } else if (relY > rect.height / 2) {
                  if (block.nextSibling) {
                    block.parentNode.insertBefore(dropIndicator, block.nextSibling);
                  } else {
                    block.parentNode.appendChild(dropIndicator);
                  }
                } else {
                  block.parentNode.insertBefore(dropIndicator, block);
                }
              } else {
                var children = Array.from(targetSheet.children).filter(function(c) {
                  return c !== dropIndicator && c !== wrapper && !c.classList.contains('slide-card-header-badge') && !c.classList.contains('studio-page-break-indicator-line') && !c.classList.contains('studio-page-break-indicator-label');
                });
                if (children.length > 0) {
                  var placed = false;
                  for (var ci = 0; ci < children.length; ci++) {
                    var cRect = children[ci].getBoundingClientRect();
                    if (curY < (cRect.top + cRect.bottom) / 2) {
                      targetSheet.insertBefore(dropIndicator, children[ci]);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    targetSheet.appendChild(dropIndicator);
                  }
                } else {
                  targetSheet.appendChild(dropIndicator);
                }
              }
            }
          } else {
            var container = document.querySelector('.a4-container') || document.body;
            var block = hoverEl.closest(blockSelector);
            if (block && block !== wrapper && container.contains(block) && block.parentNode) {
              var rect = block.getBoundingClientRect();
              var relY = curY - rect.top;
              var isContainerBox = block.matches && block.matches('.panel, .panel-warning, .panel-success, .panel-info, .dropdown-box, details, .card');
              if (isContainerBox) {
                if (relY < rect.height / 2) {
                  block.insertBefore(dropIndicator, block.firstChild);
                } else {
                  block.appendChild(dropIndicator);
                }
              } else if (relY > rect.height / 2) {
                if (block.nextSibling) {
                  block.parentNode.insertBefore(dropIndicator, block.nextSibling);
                } else {
                  block.parentNode.appendChild(dropIndicator);
                }
              } else {
                block.parentNode.insertBefore(dropIndicator, block);
              }
            } else {
              var allBlocks = Array.from(container.querySelectorAll(blockSelector)).filter(function(b) {
                return b !== wrapper && b !== dropIndicator && !wrapper.contains(b);
              });
              if (allBlocks.length > 0) {
                var closestB = null;
                var minD = Infinity;
                var isAfter = false;
                for (var bi = 0; bi < allBlocks.length; bi++) {
                  var bRect = allBlocks[bi].getBoundingClientRect();
                  var bMid = (bRect.top + bRect.bottom) / 2;
                  var dist = Math.abs(curY - bMid);
                  if (dist < minD) {
                    minD = dist;
                    closestB = allBlocks[bi];
                    isAfter = curY > bMid;
                  }
                }
                if (closestB && closestB.parentNode) {
                  if (isAfter) {
                    closestB.parentNode.insertBefore(dropIndicator, closestB.nextSibling || null);
                  } else {
                    closestB.parentNode.insertBefore(dropIndicator, closestB);
                  }
                }
              } else {
                container.appendChild(dropIndicator);
              }
            }
          }
        });
      }

      function onPointerUp(evt) {
        if (dragRafId) cancelAnimationFrame(dragRafId);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('touchend', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchcancel', onPointerUp);

        if (isDragging) {
          isDragging = false;
          wrapper.classList.remove('is-dragging');
          wrapper.style.transform = '';
          wrapper.style.zIndex = '';

          if (dropIndicator && dropIndicator.parentNode) {
            dropIndicator.parentNode.insertBefore(wrapper, dropIndicator);
            dropIndicator.remove();
          }
          selectWrapper(wrapper);
          if (typeof window.runA4Pagination === 'function') {
            window.runA4Pagination();
          }
          triggerHtmlSync(true);
        }
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('touchend', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('touchcancel', onPointerUp);
    }

    wrapper.addEventListener('pointerdown', onPointerDown);
    wrapper.addEventListener('touchstart', onPointerDown, { passive: false });
    wrapper.addEventListener('click', function(e) {
      if (!isCanvasImageEditAllowed()) {
        deselectAllImages();
        return;
      }
      e.stopPropagation();
      selectWrapper(wrapper);
    });
  }

  // 6. Setup 8-Point Stretching & Resizing Engine
  function setupImageResize(wrapper) {
    var handles = wrapper.querySelectorAll('.doc-resize-handle');
    handles.forEach(function(handle) {
      var handleType = handle.dataset.handle;

      function onHandleDown(e) {
        if (!isCanvasImageEditAllowed()) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        selectWrapper(wrapper);
        var zoom = getPaperZoom();

        var touchObj = (e.touches && e.touches[0]) ? e.touches[0] : ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e);
        var startX = touchObj.clientX || 0;
        var startY = touchObj.clientY || 0;
        var startW = wrapper.offsetWidth;
        var startH = wrapper.offsetHeight;
        var aspectRatio = (startW > 0 && startH > 0) ? (startW / startH) : 1;

        var tooltip = wrapper.querySelector('.doc-img-dimension-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'doc-img-dimension-tooltip';
          wrapper.appendChild(tooltip);
        }

        var img = wrapper.querySelector('img');
        var resizeRafId = null;

        function onHandleMove(evt) {
          if (evt.cancelable) evt.preventDefault();
          var moveObj = (evt.touches && evt.touches[0]) ? evt.touches[0] : ((evt.changedTouches && evt.changedTouches[0]) ? evt.changedTouches[0] : evt);
          var curX = moveObj.clientX || 0;
          var curY = moveObj.clientY || 0;

          if (resizeRafId) cancelAnimationFrame(resizeRafId);
          resizeRafId = requestAnimationFrame(function() {
            var dx = (curX - startX) / zoom;
            var dy = (curY - startY) / zoom;

            var newW = startW;
            var newH = startH;
            var freeStretch = (wrapper.getAttribute('data-stretch') === 'true') || isStretchMode || Boolean(evt.shiftKey);

            // Corner handles
            if (handleType === 'se') {
              newW = Math.max(60, startW + dx);
              newH = freeStretch ? Math.max(40, startH + dy) : Math.round(newW / aspectRatio);
            } else if (handleType === 'sw') {
              newW = Math.max(60, startW - dx);
              newH = freeStretch ? Math.max(40, startH + dy) : Math.round(newW / aspectRatio);
            } else if (handleType === 'ne') {
              newW = Math.max(60, startW + dx);
              newH = freeStretch ? Math.max(40, startH - dy) : Math.round(newW / aspectRatio);
            } else if (handleType === 'nw') {
              newW = Math.max(60, startW - dx);
              newH = freeStretch ? Math.max(40, startH - dy) : Math.round(newW / aspectRatio);
            }
            // Edge handles: Stretch width or height freely
            else if (handleType === 'e') {
              newW = Math.max(60, startW + dx);
            } else if (handleType === 'w') {
              newW = Math.max(60, startW - dx);
            } else if (handleType === 's') {
              newH = Math.max(40, startH + dy);
            } else if (handleType === 'n') {
              newH = Math.max(40, startH - dy);
            }

            var currentWrap = wrapper.getAttribute('data-wrap') || 'left';
            var parentEl = wrapper.parentElement;
            var parentW = parentEl ? parentEl.clientWidth : 800;
            if (currentWrap === 'left' || currentWrap === 'right') {
              var maxAllowedW = Math.max(100, Math.floor(parentW * 0.48));
              newW = Math.min(newW, maxAllowedW);
              wrapper.style.maxWidth = '48%';
            } else {
              wrapper.style.maxWidth = '100%';
            }

            wrapper.style.width = Math.round(newW) + 'px';

            if (freeStretch || handleType === 's' || handleType === 'n') {
              wrapper.style.height = Math.round(newH) + 'px';
              if (img) {
                img.style.height = '100%';
                img.style.objectFit = 'fill';
              }
            } else {
              wrapper.style.height = 'auto';
              if (img) {
                img.style.height = 'auto';
                img.style.objectFit = 'contain';
              }
            }

            if (tooltip) {
              tooltip.textContent = Math.round(newW) + ' × ' + Math.round(wrapper.offsetHeight) + ' px' + (freeStretch ? ' (Stretch)' : '');
            }
          });
        }

        function onHandleUp() {
          if (resizeRafId) cancelAnimationFrame(resizeRafId);
          document.removeEventListener('pointermove', onHandleMove);
          document.removeEventListener('touchmove', onHandleMove);
          document.removeEventListener('pointerup', onHandleUp);
          document.removeEventListener('touchend', onHandleUp);
          document.removeEventListener('pointercancel', onHandleUp);
          document.removeEventListener('touchcancel', onHandleUp);

          if (tooltip) tooltip.remove();
          triggerHtmlSync(true);
          if (typeof window.runA4Pagination === 'function') {
            window.runA4Pagination();
          }
        }

        document.addEventListener('pointermove', onHandleMove);
        document.addEventListener('touchmove', onHandleMove, { passive: false });
        document.addEventListener('pointerup', onHandleUp);
        document.addEventListener('touchend', onHandleUp);
        document.addEventListener('pointercancel', onHandleUp);
        document.addEventListener('touchcancel', onHandleUp);
      }

      handle.addEventListener('pointerdown', onHandleDown);
      handle.addEventListener('touchstart', onHandleDown, { passive: false });
    });
  }

  // 7. Attach Toolbar and 8 Handles to Wrapper
  function attachImageHandlesAndToolbar(wrapper) {
    if (!wrapper) return;

    // Clean existing UI elements
    var oldToolbar = wrapper.querySelector('.doc-img-toolbar');
    if (oldToolbar) oldToolbar.remove();
    var oldHandles = wrapper.querySelectorAll('.doc-resize-handle');
    oldHandles.forEach(function(h) { h.remove(); });

    wrapper.setAttribute('contenteditable', 'false');

    // Default wrap mode is "left" (wrap text with margins)
    if (!wrapper.getAttribute('data-wrap')) {
      var currentFloat = wrapper.style.float || '';
      if (currentFloat === 'right') wrapper.setAttribute('data-wrap', 'right');
      else if (currentFloat === 'left') wrapper.setAttribute('data-wrap', 'left');
      else if (wrapper.style.width === '100%') wrapper.setAttribute('data-wrap', 'full');
      else wrapper.setAttribute('data-wrap', 'left');
    }

    var img = wrapper.querySelector('img');
    if (img) {
      img.draggable = false;
      img.addEventListener('dragstart', function(e) { e.preventDefault(); });
      img.addEventListener('dblclick', function(e) {
        if (!isCanvasImageEditAllowed()) return;
        e.stopPropagation();
        targetImgToReplace = img;
        try {
          window.parent.postMessage({ type: 'STUDIO_TRIGGER_FILE_UPLOAD' }, '*');
        } catch(err) {}
      });
    }

    // Build clean, professional image toolbar (Left, Center, Right, Stretch, Replace, Delete)
    var toolbar = document.createElement('div');
    toolbar.className = 'doc-img-toolbar';
    toolbar.setAttribute('contenteditable', 'false');
    toolbar.innerHTML = \`
      <button data-wrap="left" title="Wrap text around right side (Float Left)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="7" height="7"/><line x1="14" y1="5" x2="21" y2="5"/><line x1="14" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="19" x2="21" y2="19"/></svg>
        Wrap Left
      </button>
      <button data-wrap="center" title="Center image neatly on page">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        Center
      </button>
      <button data-wrap="right" title="Wrap text around left side (Float Right)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="14" y="4" width="7" height="7"/><line x1="3" y1="5" x2="10" y2="5"/><line x1="3" y1="9" x2="10" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="19" x2="21" y2="19"/></svg>
        Wrap Right
      </button>
      <div class="toolbar-divider"></div>
      <button data-action="toggle-stretch" title="Toggle Free 2D Stretch vs Proportional Ratio">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>
        Stretch
      </button>
      <button data-action="replace" title="Replace Image">Replace</button>
      <button data-action="delete" class="btn-danger" title="Delete Image (Backspace or Delete key)" style="background: #ef4444 !important; color: #ffffff !important; font-weight: 700 !important;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        Delete
      </button>
    \`;

    toolbar.addEventListener('click', function(e) {
      e.stopPropagation();
      var btn = e.target.closest('button');
      if (!btn) return;

      var wrapMode = btn.getAttribute('data-wrap');
      if (wrapMode) {
        wrapper.setAttribute('data-wrap', wrapMode);
        if (wrapMode === 'left') {
          wrapper.style.float = 'left';
          wrapper.style.margin = '8px 18px 12px 0';
          wrapper.style.marginLeft = '0';
          wrapper.style.marginRight = '18px';
          var parentW = wrapper.parentElement ? wrapper.parentElement.clientWidth : 800;
          var maxW = Math.max(120, Math.floor(parentW * 0.45));
          var curW = parseInt(wrapper.style.width, 10);
          if (isNaN(curW) || curW > maxW || wrapper.style.width === '100%') {
            wrapper.style.width = Math.min(320, maxW) + 'px';
          }
          wrapper.style.maxWidth = '48%';
          wrapper.style.clear = 'none';
        } else if (wrapMode === 'right') {
          wrapper.style.float = 'right';
          wrapper.style.margin = '8px 0 12px 18px';
          wrapper.style.marginLeft = '18px';
          wrapper.style.marginRight = '0';
          var parentW = wrapper.parentElement ? wrapper.parentElement.clientWidth : 800;
          var maxW = Math.max(120, Math.floor(parentW * 0.45));
          var curW = parseInt(wrapper.style.width, 10);
          if (isNaN(curW) || curW > maxW || wrapper.style.width === '100%') {
            wrapper.style.width = Math.min(320, maxW) + 'px';
          }
          wrapper.style.maxWidth = '48%';
          wrapper.style.clear = 'none';
        } else if (wrapMode === 'center') {
          wrapper.style.float = 'none';
          wrapper.style.margin = '16px auto';
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = 'auto';
          wrapper.style.maxWidth = '100%';
          wrapper.style.display = 'block';
          wrapper.style.clear = 'both';
          if (!wrapper.style.width || wrapper.style.width === '100%') {
            wrapper.style.width = '440px';
          }
        }

        toolbar.querySelectorAll('button[data-wrap]').forEach(function(b) {
          if (b.getAttribute('data-wrap') === wrapMode) b.classList.add('active');
          else b.classList.remove('active');
        });

        triggerHtmlSync(true);
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
        return;
      }

      var action = btn.dataset.action;
      if (action === 'toggle-stretch') {
        var isCurrentStretch = wrapper.getAttribute('data-stretch') === 'true';
        var nextStretch = !isCurrentStretch;
        wrapper.setAttribute('data-stretch', nextStretch ? 'true' : 'false');
        isStretchMode = nextStretch;
        if (nextStretch) {
          btn.classList.add('active');
          var wImg = wrapper.querySelector('img');
          if (wImg) {
            wImg.style.objectFit = 'fill';
          }
        } else {
          btn.classList.remove('active');
          wrapper.style.height = 'auto';
          var wImg = wrapper.querySelector('img');
          if (wImg) {
            wImg.style.height = 'auto';
            wImg.style.objectFit = 'contain';
          }
        }
        triggerHtmlSync(true);
        return;
      }

      if (action === 'replace') {
        var currentImg = wrapper.querySelector('img');
        if (currentImg) targetImgToReplace = currentImg;
        try {
          window.parent.postMessage({ type: 'STUDIO_TRIGGER_FILE_UPLOAD' }, '*');
        } catch(err) {}
        return;
      }

      if (action === 'delete') {
        wrapper.remove();
        deselectAllImages();
        triggerHtmlSync(true);
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
        return;
      }
    });

    wrapper.appendChild(toolbar);

    // Add 8 resize handles
    var handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    handles.forEach(function(h) {
      var handle = document.createElement('div');
      handle.className = 'doc-resize-handle handle-' + h;
      handle.setAttribute('contenteditable', 'false');
      handle.dataset.handle = h;
      wrapper.appendChild(handle);
    });

    setupImageResize(wrapper);
    setupImageDrag(wrapper);
  }

  // 8. Wrap Raw Images into Interactive Containers
  function wrapAndAttachAllImages() {
    var wrappers = document.querySelectorAll('.doc-img-wrapper');
    wrappers.forEach(function(w) {
      attachImageHandlesAndToolbar(w);
      setupImageDrag(w);
    });

    var rawImgs = document.querySelectorAll('img:not(.doc-processed)');
    rawImgs.forEach(function(img) {
      if (img.closest('.doc-img-wrapper')) return;
      img.classList.add('doc-processed');

      var parent = img.parentNode;
      if (!parent) return;

      var parentFig = img.closest('figure');
      var figcap = parentFig ? parentFig.querySelector('figcaption') : null;

      var wrapper = document.createElement('div');
      wrapper.className = 'doc-img-wrapper';
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.style.width = (parentFig && parentFig.style.width) ? parentFig.style.width : (img.style.width || '320px');
      wrapper.style.maxWidth = (parentFig && parentFig.style.maxWidth) ? parentFig.style.maxWidth : (img.style.maxWidth || '48%');
      wrapper.style.height = img.style.height || 'auto';

      var effectiveFloat = (parentFig && parentFig.style.float) ? parentFig.style.float : img.style.float;
      var effectiveMargin = (parentFig && parentFig.style.margin) ? parentFig.style.margin : img.style.margin;

      // Preserve existing alignment/float
      if (effectiveFloat === 'right') {
        wrapper.setAttribute('data-wrap', 'right');
        wrapper.style.float = 'right';
        wrapper.style.maxWidth = '48%';
        wrapper.style.margin = '6px 0 12px 18px';
      } else if (effectiveFloat === 'left') {
        wrapper.setAttribute('data-wrap', 'left');
        wrapper.style.float = 'left';
        wrapper.style.maxWidth = '48%';
        wrapper.style.margin = '6px 18px 12px 0';
      } else if (wrapper.style.width === '100%') {
        wrapper.setAttribute('data-wrap', 'full');
        wrapper.style.float = 'none';
        wrapper.style.maxWidth = '100%';
        wrapper.style.margin = '16px 0';
      } else if (effectiveMargin && effectiveMargin.indexOf('auto') !== -1) {
        wrapper.setAttribute('data-wrap', 'break');
        wrapper.style.float = 'none';
        wrapper.style.maxWidth = '100%';
        wrapper.style.margin = '16px auto';
      } else {
        wrapper.setAttribute('data-wrap', 'left');
        wrapper.style.float = 'left';
        wrapper.style.maxWidth = '48%';
        wrapper.style.margin = '6px 18px 12px 0';
      }

      if (parentFig) {
        parentFig.parentNode.insertBefore(wrapper, parentFig);
        wrapper.appendChild(img);
        if (figcap) wrapper.appendChild(figcap);
        parentFig.remove();
      } else {
        parent.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }
      attachImageHandlesAndToolbar(wrapper);
      setupImageDrag(wrapper);
    });
  }

  window.wrapAndAttachAllImages = wrapAndAttachAllImages;
  window.attachImageHandlesAndToolbar = attachImageHandlesAndToolbar;

  // 9. Positional Canvas Image Insertion (Anywhere in Canvas)
  function insertImageAtPosition(dataUrl, altText, clientX, clientY, customAlign, customCaption) {
    if (targetImgToReplace) {
      targetImgToReplace.src = dataUrl;
      targetImgToReplace = null;
      triggerHtmlSync(true);
      return;
    }

    var chosenAlign = customAlign || 'left';
    var wrapper = document.createElement('div');
    wrapper.className = 'doc-img-wrapper';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.setAttribute('data-wrap', chosenAlign === 'center' ? 'center' : chosenAlign);

    if (chosenAlign === 'right') {
      wrapper.style.width = '320px';
      wrapper.style.maxWidth = '48%';
      wrapper.style.float = 'right';
      wrapper.style.margin = '6px 0 12px 18px';
      wrapper.style.marginLeft = '18px';
      wrapper.style.marginRight = '0';
    } else if (chosenAlign === 'center' || chosenAlign === 'break') {
      wrapper.style.width = '440px';
      wrapper.style.maxWidth = '100%';
      wrapper.style.float = 'none';
      wrapper.style.margin = '16px auto';
      wrapper.style.marginLeft = 'auto';
      wrapper.style.marginRight = 'auto';
      wrapper.style.clear = 'both';
    } else if (chosenAlign === 'full') {
      wrapper.style.width = '100%';
      wrapper.style.maxWidth = '100%';
      wrapper.style.float = 'none';
      wrapper.style.margin = '16px 0';
      wrapper.style.marginLeft = '0';
      wrapper.style.marginRight = '0';
      wrapper.style.clear = 'both';
    } else {
      wrapper.style.width = '320px';
      wrapper.style.maxWidth = '48%';
      wrapper.style.float = 'left';
      wrapper.style.margin = '6px 18px 12px 0';
      wrapper.style.marginLeft = '0';
      wrapper.style.marginRight = '18px';
    }
    wrapper.style.display = 'block';

    var img = document.createElement('img');
    img.src = dataUrl;
    img.alt = altText || 'Diagram';
    img.className = 'doc-processed';
    img.style.width = '100%';
    img.style.height = 'auto';
    wrapper.appendChild(img);

    if (customCaption && customCaption.trim()) {
      var figcap = document.createElement('figcaption');
      figcap.style.cssText = 'font-size: 0.85rem; color: #64748b; margin-top: 0.4rem; text-align: left;';
      figcap.textContent = customCaption.trim();
      wrapper.appendChild(figcap);
    }

    var inserted = false;
    var sheets = Array.from(document.querySelectorAll('.a4-sheet, .slide'));

    // Check 0: Active text selection or caret in document (Edit Mode caret position)
    if (!inserted && (clientX === undefined || clientY === undefined)) {
      try {
        var sel = window.getSelection();
        if (sel && sel.anchorNode) {
          var selNode = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
          var textBlock = selNode ? selNode.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, article, pre, div:not(.a4-sheet):not(.a4-container):not(.doc-img-wrapper):not(.a4-centering-stage)') : null;
          if (textBlock && textBlock.parentNode && document.body.contains(textBlock)) {
            textBlock.parentNode.insertBefore(wrapper, textBlock.nextSibling || textBlock);
            inserted = true;
          }
        }
      } catch(_) {}
    }

    // Check 1: Explicit coordinates provided (pointer drop or click)
    if (typeof clientX === 'number' && clientX >= 0 && typeof clientY === 'number' && clientY >= 0) {
      var hoverTarget = document.elementFromPoint(clientX, clientY);
      if (hoverTarget) {
        if (sheets.length > 0) {
          var targetSheet = hoverTarget.closest('.a4-sheet, .slide');
          if (targetSheet) {
            var block = hoverTarget.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, article, pre');
            if (block && block.parentNode && targetSheet.contains(block)) {
              var rect = block.getBoundingClientRect();
              if (clientY - rect.top > rect.height / 2) {
                var nextB = block.nextSibling;
                if (nextB) block.parentNode.insertBefore(wrapper, nextB);
                else block.parentNode.appendChild(wrapper);
              } else {
                block.parentNode.insertBefore(wrapper, block);
              }
              inserted = true;
            } else {
              targetSheet.appendChild(wrapper);
              inserted = true;
            }
          }
        } else {
          var container = document.querySelector('.a4-container') || document.body;
          var block = hoverTarget.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, article, pre');
          if (block && block.parentNode && container.contains(block)) {
            var rect = block.getBoundingClientRect();
            if (clientY - rect.top > rect.height / 2) {
              block.parentNode.insertBefore(wrapper, block.nextSibling || null);
            } else {
              block.parentNode.insertBefore(wrapper, block);
            }
            inserted = true;
          }
        }
      }
    }

    // Check 2: User-selected or clicked element in document
    if (!inserted && lastActiveElement && document.contains(lastActiveElement) && lastActiveElement.parentNode) {
      var block = lastActiveElement.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, article, pre');
      if (block && block.parentNode) {
        // If sheets exist, verify block is inside a sheet
        if (sheets.length === 0 || block.closest('.a4-sheet, .slide')) {
          block.parentNode.insertBefore(wrapper, block.nextSibling || block);
          inserted = true;
        }
      }
    }

    // Check 3: Current Visible Sheet in Viewport Center
    if (!inserted && sheets.length > 0) {
      var vpHeight = window.innerHeight || 800;
      var vpCenterY = Math.round(vpHeight / 2);
      var visibleSheet = null;

      for (var s = 0; s < sheets.length; s++) {
        var r = sheets[s].getBoundingClientRect();
        if (r.top <= vpCenterY && r.bottom >= vpCenterY) {
          visibleSheet = sheets[s];
          break;
        }
      }
      if (!visibleSheet) {
        for (var s = 0; s < sheets.length; s++) {
          var r = sheets[s].getBoundingClientRect();
          if (r.bottom > 60 && r.top < vpHeight) {
            visibleSheet = sheets[s];
            break;
          }
        }
      }
      if (!visibleSheet) visibleSheet = sheets[0];

      if (visibleSheet) {
        var blocks = Array.from(visibleSheet.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, figure, table, section, article, pre'));
        var bestBlock = null;
        var minDistance = Infinity;
        blocks.forEach(function(b) {
          var r = b.getBoundingClientRect();
          var mid = (r.top + r.bottom) / 2;
          var dist = Math.abs(mid - vpCenterY);
          if (dist < minDistance) {
            minDistance = dist;
            bestBlock = b;
          }
        });

        if (bestBlock && bestBlock.parentNode) {
          bestBlock.parentNode.insertBefore(wrapper, bestBlock.nextSibling || bestBlock);
          inserted = true;
        } else if (visibleSheet.firstChild) {
          visibleSheet.insertBefore(wrapper, visibleSheet.firstChild);
          inserted = true;
        } else {
          visibleSheet.appendChild(wrapper);
          inserted = true;
        }
      }
    }

    // Check 4: Fluid document fallback
    if (!inserted) {
      var container = document.querySelector('.a4-container') || document.body;
      var blocks = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, figure, table, section, article, pre'));
      if (blocks.length > 0) {
        var vpHeight = window.innerHeight || 800;
        var vpCenterY = Math.round(vpHeight / 2);
        var bestBlock = blocks[0];
        var minDistance = Infinity;
        blocks.forEach(function(b) {
          var r = b.getBoundingClientRect();
          var mid = (r.top + r.bottom) / 2;
          var dist = Math.abs(mid - vpCenterY);
          if (dist < minDistance) {
            minDistance = dist;
            bestBlock = b;
          }
        });
        if (bestBlock && bestBlock.parentNode) {
          bestBlock.parentNode.insertBefore(wrapper, bestBlock.nextSibling || bestBlock);
          inserted = true;
        }
      }
      if (!inserted) {
        container.appendChild(wrapper);
        inserted = true;
      }
    }

    attachImageHandlesAndToolbar(wrapper);
    setupImageDrag(wrapper);
    selectWrapper(wrapper);

    try {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch(e) {}

    if (typeof window.runA4Pagination === 'function') {
      window.runA4Pagination();
    }

    if (typeof window.renderKaTeXMathInDocument === 'function') {
      window.renderKaTeXMathInDocument();
    }

    var allWrappers = document.querySelectorAll('.doc-img-wrapper');
    if (allWrappers.length > 0) {
      var targetWrapper = document.querySelector('.doc-img-wrapper.selected') || allWrappers[allWrappers.length - 1];
      selectWrapper(targetWrapper);
    }

    triggerHtmlSync(true);
  }

  window.insertImageAtPosition = insertImageAtPosition;

  // 10. Client-side Image Compressor for Drop & Paste Files
  function compressImageClient(fileOrDataUrl, callback) {
    var loadSrc = function(src) {
      var img = new Image();
      img.onload = function() {
        try {
          var maxDim = 1200;
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) { callback(src); return; }
          if (w > maxDim || h > maxDim) {
            var ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          var cvs = document.createElement('canvas');
          cvs.width = w;
          cvs.height = h;
          var ctx = cvs.getContext('2d');
          if (!ctx) { callback(src); return; }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          var comp = '';
          try {
            comp = cvs.toDataURL('image/webp', 0.82);
            if (!comp.startsWith('data:image/webp')) comp = cvs.toDataURL('image/jpeg', 0.82);
          } catch(e) {
            try { comp = cvs.toDataURL('image/jpeg', 0.82); } catch(_) { comp = src; }
          }
          if (comp && comp.length > 250000) {
            try {
              var comp2 = cvs.toDataURL('image/webp', 0.74);
              if (comp2.startsWith('data:image/webp') && comp2.length < comp.length) comp = comp2;
            } catch(_) {}
          }
          callback(comp && comp.length < src.length ? comp : src);
        } catch(err) {
          callback(src);
        }
      };
      img.onerror = function() { callback(src); };
      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      var s = fileOrDataUrl.trim();
      if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/svg+xml') || (s.startsWith('data:image/webp') && s.length < 25000)) {
        callback(s);
        return;
      }
      loadSrc(s);
      return;
    }

    var reader = new FileReader();
    reader.onload = function(evt) {
      if (evt.target && evt.target.result) loadSrc(evt.target.result);
      else callback('');
    };
    reader.onerror = function() { callback(''); };
    reader.readAsDataURL(fileOrDataUrl);
  }

  // 11. Drag-and-Drop Ingestion on Preview Canvas
  var dropIndicator = null;
  document.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropIndicator = getOrCreateDropIndicator();

    var hoverTarget = document.elementFromPoint(e.clientX, e.clientY);
    if (hoverTarget) {
      var block = hoverTarget.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, figure, table, section, article, pre');
      if (block && block.parentNode && !block.closest('#doc-image-drop-indicator')) {
        var rect = block.getBoundingClientRect();
        if (e.clientY - rect.top > rect.height / 2) {
          if (block.nextSibling) block.parentNode.insertBefore(dropIndicator, block.nextSibling);
          else block.parentNode.appendChild(dropIndicator);
        } else {
          block.parentNode.insertBefore(dropIndicator, block);
        }
      }
    }
  });

  document.addEventListener('dragleave', function(e) {
    if (dropIndicator && (!e.relatedTarget || !document.contains(e.relatedTarget))) {
      dropIndicator.remove();
    }
  });

  document.addEventListener('drop', function(e) {
    e.preventDefault();
    if (dropIndicator) dropIndicator.remove();

    var clientX = e.clientX;
    var clientY = e.clientY;

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      var file = e.dataTransfer.files[0];
      if (file && file.type.indexOf('image') !== -1) {
        compressImageClient(file, function(compUrl) {
          if (compUrl) {
            insertImageAtPosition(compUrl, file.name, clientX, clientY);
          }
        });
        return;
      }
    }

    // Check for dragged image URL
    var url = e.dataTransfer ? (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')) : '';
    if (url && typeof url === 'string') {
      var trimmedUrl = url.trim();
      var cleanUrlPath = trimmedUrl.split('?')[0].toLowerCase();
      var isImgUrl = (cleanUrlPath.indexOf('http://') === 0 || cleanUrlPath.indexOf('https://') === 0) && (
        cleanUrlPath.indexOf('.png') !== -1 || cleanUrlPath.indexOf('.jpg') !== -1 || cleanUrlPath.indexOf('.jpeg') !== -1 ||
        cleanUrlPath.indexOf('.webp') !== -1 || cleanUrlPath.indexOf('.gif') !== -1 || cleanUrlPath.indexOf('.svg') !== -1 ||
        cleanUrlPath.indexOf('.avif') !== -1 || cleanUrlPath.indexOf('images.unsplash.com') !== -1 || cleanUrlPath.indexOf('googleusercontent.com') !== -1
      );
      if (isImgUrl) {
        insertImageAtPosition(trimmedUrl, 'Diagram', clientX, clientY);
      }
    }
  });

  // 12. Clipboard Paste Ingestion anywhere on Canvas
  document.addEventListener('paste', function(e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (file) {
          compressImageClient(file, function(compUrl) {
            if (compUrl) {
              insertImageAtPosition(compUrl, file.name || 'Pasted Image', undefined, undefined);
            }
          });
        }
        break;
      }
    }
  });

  // 13. Listen for Parent Window Messages
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;

    if (e.data.type === 'STUDIO_RESET_DIRTY') {
      if (updateDebounceTimer) {
        clearTimeout(updateDebounceTimer);
        updateDebounceTimer = null;
      }
    }

    if (e.data.type === 'SET_EDIT_MODE' || e.data.type === 'STUDIO_SET_EDIT_MODE') {
      var active = Boolean(e.data.active);
      window.__isEditModeActive = active;
      window.__isPaperEditActive = active;
      if (!active) {
        deselectAllImages();
      }
      if (typeof window.applyEditModeState === 'function') {
        window.applyEditModeState(active);
      }
    }

    if (e.data.type === 'STUDIO_INSERT_IMAGE_CANVAS' || e.data.type === 'STUDIO_INSERT_IMAGE') {
      var dataUrl = e.data.dataUrl || e.data.base64;
      if (!dataUrl) return;
      var altText = e.data.fileName || 'Diagram';
      var x = e.data.x;
      var y = e.data.y;
      var align = e.data.align || 'left';
      var caption = e.data.caption || '';
      insertImageAtPosition(dataUrl, altText, x, y, align, caption);
    }
  });

  // 13. Global Click & Keyboard Listeners to Select, Deselect, & Delete Images
  document.addEventListener('keydown', function(e) {
    if (!isCanvasImageEditAllowed()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      var selected = document.querySelector('.doc-img-wrapper.selected');
      if (selected) {
        var activeEl = document.activeElement;
        var sel = window.getSelection ? window.getSelection() : null;
        var hasTextCaret = sel && sel.anchorNode && !selected.contains(sel.anchorNode);
        var isEditingText = Boolean(hasTextCaret) || (activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl.isContentEditable && activeEl !== selected && !selected.contains(activeEl))
        ));
        if (!isEditingText) {
          e.preventDefault();
          e.stopPropagation();
          selected.remove();
          deselectAllImages();
          triggerHtmlSync(true);
          if (typeof window.runA4Pagination === 'function') {
            window.runA4Pagination();
          }
        }
      }
    }
  });

  document.addEventListener('click', function(e) {
    if (!isCanvasImageEditAllowed()) {
      deselectAllImages();
      return;
    }
    var target = e.target;
    if (target.closest('.doc-img-toolbar') || target.closest('.doc-resize-handle')) {
      return;
    }
    var wrapper = target.closest ? target.closest('.doc-img-wrapper') : null;
    if (wrapper) {
      e.stopPropagation();
      selectWrapper(wrapper);
      return;
    }
    if (target.tagName === 'IMG' || (target.closest && target.closest('img'))) {
      e.stopPropagation();
      wrapAndAttachAllImages();
      var imgWrapper = target.closest ? target.closest('.doc-img-wrapper') : null;
      if (imgWrapper) {
        selectWrapper(imgWrapper);
        return;
      }
    }
    deselectAllImages();
  });

  // Initialize
  if (document.readyState === 'complete') {
    wrapAndAttachAllImages();
  } else {
    window.addEventListener('load', wrapAndAttachAllImages);
  }
})();
</script>
`;
}
