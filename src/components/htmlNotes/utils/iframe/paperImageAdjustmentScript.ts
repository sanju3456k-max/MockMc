/**
 * Dedicated Paper Mode Image Adjustment Script
 * Controls image selection, free-drag positioning, 8-point resizing,
 * alignment toolbars, and zoom-aware pointer tracking inside A4 Paper Preview sheets.
 */
export function getPaperImageAdjustmentScript(isPreviewEditMode: boolean = false): string {
  return `
<style id="paper-image-adjustment-styles">
  .doc-img-wrapper {
    position: relative !important;
    display: block;
    margin: 16px auto;
    max-width: 100%;
    box-sizing: border-box !important;
    cursor: grab;
    user-select: none;
    transition: outline 0.15s ease;
    touch-action: none;
    overflow: visible !important;
  }
  .doc-img-wrapper.selected {
    cursor: move;
    z-index: 9999 !important;
    outline: 2.5px solid #2563eb !important;
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35) !important;
  }
  .doc-img-wrapper:hover {
    outline: 2px dashed #3b82f6 !important;
  }
  .doc-img-wrapper img {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    border-radius: 6px;
    pointer-events: auto !important;
  }
  .doc-img-toolbar {
    display: none !important;
    position: absolute !important;
    top: -52px !important;
    left: 50% !important;
    transform: translateX(-50%) scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: bottom center !important;
    background: #0f172a !important;
    color: #ffffff !important;
    padding: 5px 10px !important;
    border-radius: 9999px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    z-index: 2147483647 !important;
    white-space: nowrap !important;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    align-items: center !important;
    gap: 5px !important;
    pointer-events: auto !important;
    min-width: max-content !important;
    width: max-content !important;
  }
  .doc-img-wrapper.selected .doc-img-toolbar {
    display: inline-flex !important;
  }
  .doc-img-wrapper.toolbar-flip .doc-img-toolbar {
    top: auto !important;
    bottom: -52px !important;
    transform: translateX(-50%) scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: top center !important;
  }
  .doc-img-toolbar button {
    background: rgba(255, 255, 255, 0.15) !important;
    border: none !important;
    color: #ffffff !important;
    padding: 4px 9px !important;
    border-radius: 9999px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    transition: all 0.15s ease !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }
  .doc-img-toolbar button:hover {
    background: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
  }
  .doc-img-toolbar button.btn-blue {
    background: #2563eb !important;
    color: #ffffff !important;
  }
  .doc-img-toolbar button.btn-blue:hover {
    background: #1d4ed8 !important;
  }
  .doc-img-toolbar button.btn-red {
    background: #ef4444 !important;
    color: #ffffff !important;
  }
  .doc-img-toolbar button.btn-red:hover {
    background: #dc2626 !important;
  }
  .doc-img-toolbar .toolbar-sep {
    color: rgba(255, 255, 255, 0.3) !important;
    margin: 0 2px !important;
    user-select: none !important;
  }
  .doc-resize-handle {
    display: none !important;
    position: absolute !important;
    width: 20px !important;
    height: 20px !important;
    background: #2563eb !important;
    border: 3px solid #ffffff !important;
    border-radius: 50% !important;
    z-index: 100001 !important;
    box-shadow: 0 3px 12px rgba(0,0,0,0.4) !important;
    touch-action: none;
    pointer-events: auto !important;
    transform: scale(calc(1 / var(--paper-zoom, 1))) !important;
    transform-origin: center center !important;
  }
  .doc-img-wrapper.selected .doc-resize-handle {
    display: block !important;
  }
  .handle-nw { top: -10px !important; left: -10px !important; cursor: nwse-resize !important; }
  .handle-ne { top: -10px !important; right: -10px !important; cursor: nesw-resize !important; }
  .handle-sw { bottom: -10px !important; left: -10px !important; cursor: nesw-resize !important; }
  .handle-se { bottom: -10px !important; left: auto !important; right: -10px !important; cursor: nwse-resize !important; }
  .handle-n { top: -10px !important; left: calc(50% - 10px) !important; cursor: ns-resize !important; }
  .handle-s { bottom: -10px !important; left: calc(50% - 10px) !important; cursor: ns-resize !important; }
  .handle-w { top: calc(50% - 10px) !important; left: -10px !important; cursor: ew-resize !important; }
  .handle-e { top: calc(50% - 10px) !important; right: -10px !important; cursor: ew-resize !important; }

  /* Ensure paper sheets allow overflow when editing so toolbars and handles remain fully visible regardless of image size */
  body.studio-preview-editable .a4-sheet,
  body.studio-preview-editable .a4-container,
  body.studio-preview-editable .a4-centering-stage,
  body.studio-preview-editable .doc-img-wrapper {
    overflow: visible !important;
  }

  body:not(.studio-preview-editable) .doc-img-wrapper:hover {
    outline: none !important;
    cursor: default !important;
  }
  body:not(.studio-preview-editable) .doc-img-wrapper.selected {
    outline: none !important;
    box-shadow: none !important;
  }
  body:not(.studio-preview-editable) .doc-img-toolbar,
  body:not(.studio-preview-editable) .doc-resize-handle {
    display: none !important;
  }
</style>

<script id="paper-image-adjustment-script">
(function() {
  window.__isPaperEditActive = ${Boolean(isPreviewEditMode)};
  var targetImgToReplace = null;

  function notifyParentOfHtmlChange() {
    try {
      if (!window.__isPaperEditActive) return;
      if (typeof window.getCleanHtml === 'function') {
        var cleanHtml = window.getCleanHtml();
        window.parent.postMessage({ type: 'STUDIO_HTML_UPDATE', html: cleanHtml }, '*');
      }
    } catch(err) {
      console.error('[PaperImageAdjustment] Failed to notify html change:', err);
    }
  }

  function getEffectivePaperZoom() {
    var sheet = document.querySelector('.a4-sheet') || document.querySelector('.a4-container') || document.body;
    if (!sheet) return 1;
    var zoomStr = getComputedStyle(sheet).getPropertyValue('--paper-zoom') || getComputedStyle(document.documentElement).getPropertyValue('--paper-zoom');
    var val = parseFloat(zoomStr);
    return (val && !isNaN(val) && val > 0) ? val : 1;
  }

  function selectWrapper(wrapper) {
    if (!wrapper) return;
    window.__isPaperEditActive = true;
    window.__isEditModeActive = true;
    deselectAllImages();
    wrapper.classList.add('selected');

    // Flip toolbar if image is near top of page sheet
    var rect = wrapper.getBoundingClientRect();
    if (rect.top < 65) {
      wrapper.classList.add('toolbar-flip');
    } else {
      wrapper.classList.remove('toolbar-flip');
    }
  }

  function deselectAllImages() {
    var all = document.querySelectorAll('.doc-img-wrapper');
    all.forEach(function(w) {
      w.classList.remove('selected');
      w.classList.remove('toolbar-flip');
    });
  }

  function setupImageFreeDrag(wrapper) {
    if (!wrapper || wrapper.__hasPaperDrag) return;
    wrapper.__hasPaperDrag = true;

    var img = wrapper.querySelector('img');
    if (img) {
      img.ondragstart = function(e) { e.preventDefault(); return false; };
      img.style.userSelect = 'none';
      img.style.webkitUserDrag = 'none';
    }

    var isDragging = false;

    function startDrag(e) {
      window.__isPaperEditActive = true;
      window.__isEditModeActive = true;

      if (e.target.closest('.doc-img-toolbar') || e.target.closest('.doc-resize-handle')) return;

      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      selectWrapper(wrapper);

      if (e.pointerId !== undefined) {
        try { wrapper.setPointerCapture(e.pointerId); } catch(err) {}
      }

      var dropIndicator = document.getElementById('doc-image-drop-indicator');
      if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.id = 'doc-image-drop-indicator';
        dropIndicator.style.cssText = 'height: 4px; background: #0b57d0; border-radius: 2px; margin: 8px 0; transition: all 0.1s ease; box-shadow: 0 0 12px rgba(11,87,208,0.8); pointer-events: none; z-index: 2147483647; width: 100%;';
      }

      function onMove(evt) {
        if (!isDragging) return;
        if (evt.cancelable) evt.preventDefault();
        wrapper.classList.add('is-dragging');

        var hoverTarget = document.elementFromPoint(evt.clientX, evt.clientY);
        var container = wrapper.closest('.a4-sheet') || wrapper.closest('.google-docs-page') || document.body;
        if (hoverTarget && container && container.contains(hoverTarget) && !wrapper.contains(hoverTarget)) {
          var block = hoverTarget.closest('p, h1, h2, h3, h4, h5, h6, div, section, blockquote, figure, table, .google-docs-slide-card, .a4-sheet');
          if (block && block !== wrapper && block.parentNode && !wrapper.contains(block)) {
            var rect = block.getBoundingClientRect();
            var relY = evt.clientY - rect.top;
            if (relY > rect.height / 2) {
              if (block.nextSibling) {
                block.parentNode.insertBefore(dropIndicator, block.nextSibling);
              } else {
                block.parentNode.appendChild(dropIndicator);
              }
            } else {
              block.parentNode.insertBefore(dropIndicator, block);
            }
          }
        }
      }

      function onUp(evt) {
        if (!isDragging) return;
        isDragging = false;
        wrapper.classList.remove('is-dragging');

        if (dropIndicator && dropIndicator.parentNode) {
          dropIndicator.parentNode.insertBefore(wrapper, dropIndicator);
          dropIndicator.remove();
        }

        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    wrapper.addEventListener('pointerdown', startDrag);
    wrapper.addEventListener('mousedown', startDrag);
    wrapper.addEventListener('click', function(e) {
      window.__isPaperEditActive = true;
      window.__isEditModeActive = true;
      e.stopPropagation();
      selectWrapper(wrapper);
    });
  }

    wrapper.addEventListener('pointerdown', onPointerDown);
  }

  function setupImageResize(wrapper) {
    if (!wrapper) return;
    var handles = wrapper.querySelectorAll('.doc-resize-handle');

    handles.forEach(function(handle) {
      if (handle.__hasPaperResize) return;
      handle.__hasPaperResize = true;

      function onPointerDown(e) {
        if (!window.__isPaperEditActive && !window.__isEditModeActive) return;
        e.stopPropagation();
        e.preventDefault();

        var handleType = handle.dataset.handle;
        var isResizing = true;

        if (e.pointerId !== undefined) {
          try { handle.setPointerCapture(e.pointerId); } catch(err) {}
        }

        selectWrapper(wrapper);

        var zoomVal = getEffectivePaperZoom();
        var startX = e.clientX;
        var startY = e.clientY;
        var startWidth = wrapper.offsetWidth;

        function onPointerMove(evt) {
          if (!isResizing) return;
          if (evt.cancelable) evt.preventDefault();

          var dx = (evt.clientX - startX) / zoomVal;

          var newWidth = startWidth;
          if (['se', 'e', 'ne'].indexOf(handleType) !== -1) {
            newWidth = Math.max(60, startWidth + dx);
          } else if (['sw', 'w', 'nw'].indexOf(handleType) !== -1) {
            newWidth = Math.max(60, startWidth - dx);
          }

          wrapper.style.width = newWidth + 'px';
          wrapper.style.maxWidth = '100%';
        }

        function onPointerUp(evt) {
          if (isResizing) {
            isResizing = false;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);

            notifyParentOfHtmlChange();
            if (typeof window.runA4Pagination === 'function') {
              window.runA4Pagination();
            }
          }
        }

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      }

      handle.addEventListener('pointerdown', onPointerDown);
    });
  }

  function attachPaperImageHandlesAndToolbar(wrapper) {
    if (!wrapper) return;

    var oldToolbar = wrapper.querySelector('.doc-img-toolbar');
    if (oldToolbar) oldToolbar.remove();
    var oldHandles = wrapper.querySelectorAll('.doc-resize-handle');
    oldHandles.forEach(function(h) { h.remove(); });

    wrapper.setAttribute('contenteditable', 'false');
    var img = wrapper.querySelector('img');
    if (img) {
      img.draggable = false;
      img.style.userSelect = 'none';
      img.addEventListener('dragstart', function(e) { e.preventDefault(); });

      img.addEventListener('dblclick', function(e) {
        if (!window.__isPaperEditActive && !window.__isEditModeActive) return;
        e.stopPropagation();
        targetImgToReplace = img;
        try {
          window.parent.postMessage({ type: 'STUDIO_TRIGGER_FILE_UPLOAD' }, '*');
        } catch(err) {}
      });
    }

    var toolbar = document.createElement('div');
    toolbar.className = 'doc-img-toolbar';
    toolbar.setAttribute('contenteditable', 'false');

    // Matching Fluid Viewer toolbar layout & buttons exactly
    toolbar.innerHTML = \`
      <button data-action="rotate" title="Rotate 90°">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>Rotate
      </button>
      <button data-action="full" title="Full Width (100%)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>Full
      </button>
      <button data-action="align-toggle" title="Cycle Alignment (Center / Left / Right)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:3px;"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg><span class="align-val">Center</span>
      </button>
      <span class="toolbar-sep">|</span>
      <button data-action="replace" class="btn-blue" title="Replace Image">Replace</button>
      <button data-action="delete" class="btn-red" title="Delete Image">Delete</button>
    \`;

    toolbar.addEventListener('click', function(e) {
      e.stopPropagation();
      var btn = e.target.closest('button');
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === 'rotate') {
        var currentRot = parseInt(wrapper.dataset.rotation || '0', 10);
        var nextRot = (currentRot + 90) % 360;
        wrapper.dataset.rotation = nextRot.toString();
        
        wrapper.style.transform = 'rotate(' + nextRot + 'deg)';
        wrapper.style.transition = 'transform 0.25s ease';
        
        if (nextRot === 90 || nextRot === 270) {
          wrapper.style.margin = '48px auto';
        } else {
          wrapper.style.margin = '16px auto';
        }

        // Counter-rotate the toolbar so it stays horizontal and upright
        var tbEl = wrapper.querySelector('.doc-img-toolbar');
        if (tbEl) {
          tbEl.style.transform = 'translateX(-50%) rotate(' + (-nextRot) + 'deg)';
          tbEl.style.transition = 'transform 0.25s ease';
        }

        notifyParentOfHtmlChange();
        return;
      }

      if (action === 'full') {
        wrapper.style.width = '100%';
        wrapper.style.maxWidth = '100%';
        wrapper.style.marginLeft = 'auto';
        wrapper.style.marginRight = 'auto';
        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
        return;
      }

      if (action === 'align-toggle') {
        var currentAlign = wrapper.dataset.align || 'center';
        var nextAlign = 'left';
        if (currentAlign === 'center') nextAlign = 'left';
        else if (currentAlign === 'left') nextAlign = 'right';
        else if (currentAlign === 'right') nextAlign = 'center';

        wrapper.dataset.align = nextAlign;

        if (nextAlign === 'left') {
          wrapper.style.marginLeft = '0';
          wrapper.style.marginRight = 'auto';
        } else if (nextAlign === 'right') {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = '0';
        } else {
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = 'auto';
        }
        wrapper.style.float = 'none';

        var alignLabel = toolbar.querySelector('.align-val');
        if (alignLabel) {
          alignLabel.textContent = nextAlign.charAt(0).toUpperCase() + nextAlign.slice(1);
        }

        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
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
        notifyParentOfHtmlChange();
        if (typeof window.runA4Pagination === 'function') {
          window.runA4Pagination();
        }
        return;
      }

      notifyParentOfHtmlChange();
      if (typeof window.runA4Pagination === 'function') {
        window.runA4Pagination();
      }
    });

    wrapper.appendChild(toolbar);

    var handleTypes = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    handleTypes.forEach(function(h) {
      var handle = document.createElement('div');
      handle.className = 'doc-resize-handle handle-' + h;
      handle.setAttribute('contenteditable', 'false');
      handle.dataset.handle = h;
      wrapper.appendChild(handle);
    });

    setupImageResize(wrapper);
    setupImageFreeDrag(wrapper);
  }

  function wrapAndAttachAllImages() {
    var wrappers = document.querySelectorAll('.doc-img-wrapper');
    wrappers.forEach(function(w) {
      attachPaperImageHandlesAndToolbar(w);
      if (w.classList.contains('selected')) {
        selectWrapper(w);
      }
    });

    var imgs = document.querySelectorAll('img:not(.doc-processed)');
    imgs.forEach(function(img) {
      if (img.closest('.doc-img-wrapper')) return;
      img.classList.add('doc-processed');

      var parent = img.parentNode;
      if (!parent) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'doc-img-wrapper';
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.style.width = img.style.width || '380px';
      wrapper.style.maxWidth = '100%';
      wrapper.style.display = img.style.display || 'block';
      wrapper.style.margin = img.style.margin || '16px auto';
      if (img.style.float) wrapper.style.float = img.style.float;

      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      attachPaperImageHandlesAndToolbar(wrapper);
    });
  }

  window.wrapAndAttachAllImages = wrapAndAttachAllImages;
  window.attachPaperImageHandlesAndToolbar = attachPaperImageHandlesAndToolbar;

  // Listen for image selection / clicks
  document.addEventListener('click', function(e) {
    if (!window.__isPaperEditActive && !window.__isEditModeActive) return;
    var target = e.target;
    if (target.closest('.doc-img-toolbar') || target.closest('.doc-resize-handle')) {
      return;
    }

    var imgWrapper = target.closest ? target.closest('.doc-img-wrapper') : null;
    var img = target.closest ? target.closest('img') : null;

    if (imgWrapper || img) {
      var targetWrapper = imgWrapper || (img ? img.closest('.doc-img-wrapper') : null);
      if (targetWrapper) {
        e.stopPropagation();
        attachPaperImageHandlesAndToolbar(targetWrapper);
        selectWrapper(targetWrapper);
      }
      return;
    }

    deselectAllImages();
  });

  // Re-attach images on load or state readiness
  if (document.readyState === 'complete') {
    wrapAndAttachAllImages();
  } else {
    window.addEventListener('load', wrapAndAttachAllImages);
  }
})();
</script>
`;
}
