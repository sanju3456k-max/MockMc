export function getA4PaginationScript(
  printableHeight: number,
  topMarginMm: number,
  rightMarginMm: number,
  bottomMarginMm: number,
  leftMarginMm: number,
  isSlideMode: boolean = false
): string {
  return `
<script id="studio-a4-pagination-script">
(function() {
  var isSlideMode = ${Boolean(isSlideMode)};
  function runA4Pagination() {
    if (typeof window.renderKaTeXMathInDocument === 'function') {
      window.renderKaTeXMathInDocument();
    }

    var container = document.querySelector('.a4-container');
    if (!container) return;

    // STEP 0: Clean up and merge any split elements from previous pagination cycles
    var splits = container.querySelectorAll('[data-split-id]');
    var splitMap = {};
    splits.forEach(function(el) {
      var sid = el.getAttribute('data-split-id');
      if (!splitMap[sid]) {
        splitMap[sid] = el;
        el.removeAttribute('data-split-id');
        el.removeAttribute('data-split-tag');
      } else {
        var primary = splitMap[sid];
        while (el.firstChild) {
          primary.appendChild(el.firstChild);
        }
        el.remove();
      }
    });

    // Remove temporary indicators before collecting nodes
    var indicators = container.querySelectorAll('.studio-page-break-indicator-line, .studio-page-break-indicator-label');
    indicators.forEach(function(ind) { ind.remove(); });

    var rawNodes = [];
    var existingSheets = container.querySelectorAll('.a4-sheet');
    if (existingSheets.length > 0) {
      existingSheets.forEach(function(s) {
        Array.from(s.childNodes).forEach(function(c) {
          if (c.nodeType === 3 && !c.textContent.trim()) return;
          rawNodes.push(c);
        });
      });
      // Collect orphan element nodes directly inside container that were inserted outside existing sheets
      Array.from(container.childNodes).forEach(function(c) {
        if (c.nodeType === 1 && !c.classList.contains('a4-sheet') && !c.classList.contains('slide')) {
          rawNodes.push(c);
        }
      });
    } else {
      Array.from(container.childNodes).forEach(function(c) {
        if (c.nodeType === 3 && !c.textContent.trim()) return;
        rawNodes.push(c);
      });
    }

    var printableHeight = ${printableHeight};

    var tempHost = document.createElement('div');
    tempHost.className = 'a4-sheet';
    tempHost.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:' + (isSlideMode ? '1200px' : '794px') + ';padding:${topMarginMm}mm ${rightMarginMm}mm ${bottomMarginMm}mm ${leftMarginMm}mm;box-sizing:border-box;font-size:11pt;line-height:1.5;visibility:hidden;margin:0!important;box-shadow:none!important;border:none!important;';
    document.body.appendChild(tempHost);

    function measureNodeHeight(node) {
      var clone = node.cloneNode(true);
      tempHost.appendChild(clone);
      var h = 0;
      if (clone.nodeType === 1) {
        var imgs = clone.tagName === 'IMG' ? [clone] : Array.from(clone.querySelectorAll('img'));
        imgs.forEach(function(imgEl) {
          if (!imgEl.style.height || imgEl.style.height === 'auto') {
            if (imgEl.naturalHeight && imgEl.naturalWidth && imgEl.offsetWidth) {
              var calcH = Math.round((imgEl.offsetWidth * imgEl.naturalHeight) / imgEl.naturalWidth);
              if (calcH > 0) imgEl.style.height = calcH + 'px';
            } else if (!imgEl.offsetHeight || imgEl.offsetHeight < 20) {
              imgEl.style.height = '260px';
            }
          }
        });

        var rect = clone.getBoundingClientRect();
        var style = window.getComputedStyle(clone);
        var marginTop = parseFloat(style.marginTop) || 0;
        var marginBottom = parseFloat(style.marginBottom) || 0;
        h = rect.height + marginTop + marginBottom;

        var isFloat = clone.style.float === 'left' || clone.style.float === 'right' ||
                      (clone.classList && clone.classList.contains('doc-img-wrapper') &&
                       (clone.getAttribute('data-wrap') === 'left' || clone.getAttribute('data-wrap') === 'right'));
        if (isFloat) {
          // Floating images reflow alongside text; do not overestimate vertical height
          h = Math.min(h, Math.round(printableHeight * 0.45));
        }
      } else {
        var range = document.createRange();
        range.selectNodeContents(clone);
        var rects = range.getClientRects();
        for (var i = 0; i < rects.length; i++) {
          h += rects[i].height;
        }
      }
      tempHost.removeChild(clone);
      return Math.max(h, 12);
    }

    var contentBlocks = [];
    var splitCounter = 0;

    function isContainerElement(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.classList && (node.classList.contains('doc-img-wrapper') || node.classList.contains('doc-image-figure') || node.classList.contains('slide'))) return false;
      if (node.closest && (node.closest('.doc-img-wrapper') || node.closest('.doc-image-figure'))) return false;
      if (node.tagName === 'FIGURE') return false;
      var tag = node.tagName.toUpperCase();
      return tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'BLOCKQUOTE' || tag === 'DETAILS' || tag === 'UL' || tag === 'OL' || (tag === 'DIV' && !node.classList.contains('a4-sheet') && !node.classList.contains('a4-container'));
    }

    function unrollNode(child) {
      if (child.nodeType === 3) {
        return child.textContent.trim() ? [child] : [];
      }
      if (child.nodeType !== 1) return [child];
      if (child.classList && child.classList.contains('slide')) {
        return [child];
      }

      var h = measureNodeHeight(child);
      if (isContainerElement(child) && h > printableHeight) {
        splitCounter++;
        var splitId = 'split_' + splitCounter + '_' + Date.now();
        var blocks = [];
        Array.from(child.childNodes).forEach(function(gChild) {
          if (gChild.nodeType === 3 && !gChild.textContent.trim()) return;
          var subBlocks = unrollNode(gChild);
          subBlocks.forEach(function(sb) {
            var wrapperClone = child.cloneNode(false);
            wrapperClone.setAttribute('data-split-id', splitId);
            wrapperClone.setAttribute('data-split-tag', child.tagName.toLowerCase());
            wrapperClone.appendChild(sb.cloneNode(true));
            blocks.push(wrapperClone);
          });
        });
        return blocks.length > 0 ? blocks : [child];
      }
      return [child];
    }

    rawNodes.forEach(function(child) {
      var unrolled = unrollNode(child);
      unrolled.forEach(function(b) {
        contentBlocks.push(b);
      });
    });

    var pages = [];
    var currentPage = [];
    var currentHeight = 0;

    var maxLoopSafety = 5000;
    var loopCount = 0;

    if (isSlideMode && contentBlocks.some(function(b) { return b.nodeType === 1 && b.classList && b.classList.contains('slide'); })) {
      contentBlocks.forEach(function(b) {
        if (b.nodeType === 1 && b.classList && b.classList.contains('slide')) {
          pages.push([b]);
        } else if (b.nodeType === 1 || (b.nodeType === 3 && b.textContent.trim())) {
          if (pages.length === 0) pages.push([]);
          pages[pages.length - 1].push(b);
        }
      });
    } else {
      while (contentBlocks.length > 0 && loopCount < maxLoopSafety) {
        loopCount++;
        var block = contentBlocks.shift();
        if (!block) continue;
        if (block.nodeType === 3 && !block.textContent.trim()) continue;

        var h = measureNodeHeight(block);
        var isHeading = block.nodeType === 1 && /^H[1-6]$/i.test(block.tagName);

        if (isHeading && contentBlocks.length > 0) {
          var nextBlock = contentBlocks[0];
          var nextH = measureNodeHeight(nextBlock);
          if (currentHeight + h + nextH > printableHeight && currentPage.length > 0) {
            pages.push(currentPage);
            currentPage = [block];
            currentHeight = h;
            continue;
          }
        }

        // Specialized Table Paged Media Decomposition
        if (block.nodeType === 1 && block.tagName.toUpperCase() === 'TABLE') {
          var thead = block.querySelector('thead');
          var colgroup = block.querySelector('colgroup');
          var allRows = Array.from(block.querySelectorAll('tbody > tr'));
          if (allRows.length === 0) {
            allRows = Array.from(block.querySelectorAll('tr')).filter(function(r) { return !r.closest('thead'); });
          }

          if (allRows.length > 1 && (currentHeight + h > printableHeight)) {
            var theadH = thead ? measureNodeHeight(thead) : 34;
            var availH = printableHeight - currentHeight;

            // If we are already mid-page and cannot even fit header + 1 row, push page and start table fresh
            var firstRowH = measureNodeHeight(allRows[0]);
            if (currentPage.length > 0 && availH < (theadH + firstRowH + 15)) {
              pages.push(currentPage);
              currentPage = [];
              currentHeight = 0;
              contentBlocks.unshift(block);
              continue;
            }

            // Fill available page height with as many rows as fit cleanly
            var targetAvail = printableHeight - currentHeight;
            var fittedRows = [];
            var remainingRows = [];
            var runningTableH = theadH + 10;

            for (var rIdx = 0; rIdx < allRows.length; rIdx++) {
              var rEl = allRows[rIdx];
              var rH = measureNodeHeight(rEl);
              if (fittedRows.length > 0 && (runningTableH + rH > targetAvail)) {
                remainingRows = allRows.slice(rIdx);
                break;
              }
              fittedRows.push(rEl);
              runningTableH += rH;
            }

            if (remainingRows.length > 0) {
              splitCounter++;
              var tblSplitId = block.getAttribute('data-split-id') || ('split_tbl_' + splitCounter + '_' + Date.now());

              var chunkTable = block.cloneNode(false);
              chunkTable.setAttribute('data-split-id', tblSplitId);
              chunkTable.setAttribute('data-split-tag', 'table');
              if (colgroup) chunkTable.appendChild(colgroup.cloneNode(true));
              if (thead) chunkTable.appendChild(thead.cloneNode(true));
              var chunkTbody = document.createElement('tbody');
              fittedRows.forEach(function(r) { chunkTbody.appendChild(r.cloneNode(true)); });
              chunkTable.appendChild(chunkTbody);

              var remainderTable = block.cloneNode(false);
              remainderTable.setAttribute('data-split-id', tblSplitId);
              remainderTable.setAttribute('data-split-tag', 'table');
              if (colgroup) remainderTable.appendChild(colgroup.cloneNode(true));
              if (thead) remainderTable.appendChild(thead.cloneNode(true));
              var remainderTbody = document.createElement('tbody');
              remainingRows.forEach(function(r) { remainderTbody.appendChild(r.cloneNode(true)); });
              remainderTable.appendChild(remainderTbody);

              currentPage.push(chunkTable);
              pages.push(currentPage);
              currentPage = [];
              currentHeight = 0;
              contentBlocks.unshift(remainderTable);
              continue;
            }
          }
        }

        if (currentHeight + h > printableHeight) {
          if (currentPage.length > 0 && isContainerElement(block) && block.childNodes.length > 1) {
            splitCounter++;
            var splitId = 'split_sub_' + splitCounter + '_' + Date.now();
            var decomposed = [];
            Array.from(block.childNodes).forEach(function(ch) {
              if (ch.nodeType === 3 && !ch.textContent.trim()) return;
              var wrapperClone = block.cloneNode(false);
              wrapperClone.setAttribute('data-split-id', splitId);
              wrapperClone.setAttribute('data-split-tag', block.tagName.toLowerCase());
              wrapperClone.appendChild(ch.cloneNode(true));
              decomposed.push(wrapperClone);
            });
            if (decomposed.length > 0) {
              contentBlocks = decomposed.concat(contentBlocks);
              continue;
            }
          }

          if (currentPage.length > 0) {
            pages.push(currentPage);
            currentPage = [block];
            currentHeight = h;
          } else {
            currentPage.push(block);
            pages.push(currentPage);
            currentPage = [];
            currentHeight = 0;
          }
        } else {
          currentPage.push(block);
          currentHeight += h;
        }
      }

      if (currentPage.length > 0) pages.push(currentPage);
    }

    if (pages.length === 0) pages.push([]);

    document.body.removeChild(tempHost);

    container.innerHTML = '';
    pages.forEach(function(pageBlocks, idx) {
      var sheet = document.createElement('div');
      sheet.className = isSlideMode ? 'a4-sheet slide' : 'a4-sheet';
      sheet.setAttribute('data-page', (idx + 1).toString());
      sheet.setAttribute('data-slide-index', idx.toString());
      var isEditActive = Boolean(window.__isEditModeActive);
      sheet.contentEditable = isEditActive ? 'true' : 'false';
      sheet.setAttribute('contenteditable', isEditActive ? 'true' : 'false');

      if (isSlideMode) {
        var badge = document.createElement('div');
        badge.className = 'slide-card-header-badge no-print';
        badge.setAttribute('contenteditable', 'false');
        badge.style.cssText = 'position:absolute;top:-28px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:#64748b;user-select:none;pointer-events:none;z-index:99;';
        badge.innerHTML = '<span>Slide ' + (idx + 1) + ' of ' + pages.length + '</span><span style="background:#e2e8f0;padding:2px 8px;border-radius:9999px;font-size:10px;color:#334155;">1200 × 675 px (16:9)</span>';
        sheet.appendChild(badge);
      }

      pageBlocks.forEach(function(b) {
        sheet.appendChild(b.cloneNode(true));
      });

      if (idx < pages.length - 1) {
        var line = document.createElement('div');
        line.className = 'studio-page-break-indicator-line';
        line.contentEditable = 'false';
        var label = document.createElement('div');
        label.className = 'studio-page-break-indicator-label';
        label.contentEditable = 'false';
        label.textContent = isSlideMode ? ('Slide ' + (idx + 1) + ' Ends / Slide ' + (idx + 2) + ' Begins') : ('Page ' + (idx + 1) + ' Ends / Page ' + (idx + 2) + ' Begins');
        sheet.appendChild(line);
        sheet.appendChild(label);
      }

      container.appendChild(sheet);
    });

    if (typeof window.renderKaTeXMathInDocument === 'function') {
      window.renderKaTeXMathInDocument();
    }

    if (typeof window.wrapAndAttachAllImages === 'function') {
      window.wrapAndAttachAllImages();
    }
    if (typeof window.applyEditModeState === 'function') {
      window.applyEditModeState(Boolean(window.__isEditModeActive));
    } else {
      if (Boolean(window.__isEditModeActive)) {
        document.body.classList.add('studio-preview-editable');
      } else {
        document.body.classList.remove('studio-preview-editable');
      }
      var katexElements = document.querySelectorAll('.katex, .katex-display');
      katexElements.forEach(function(k) { k.setAttribute('contenteditable', 'false'); });
    }

    try {
      var headingPageMap = [];
      var sheets = container.querySelectorAll('.a4-sheet');
      sheets.forEach(function(sheet) {
        var pIndex = parseInt(sheet.getAttribute('data-page') || '1', 10);
        var headNodes = sheet.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headNodes.forEach(function(hNode) {
          var cleanText = (hNode.textContent || '').trim();
          if (cleanText) {
            headingPageMap.push({
              id: hNode.id || hNode.getAttribute('data-note-id') || ('head_' + headingPageMap.length),
              text: cleanText,
              level: parseInt(hNode.tagName.substring(1), 10),
              pageIndex: pIndex,
              index: headingPageMap.length
            });
          }
        });
      });

      window.parent.postMessage({ 
        type: 'STUDIO_HEADING_PAGE_MAP', 
        headings: headingPageMap,
        count: pages.length 
      }, '*');
      window.parent.postMessage({ type: 'STUDIO_A4_PAGES_COUNT', count: pages.length }, '*');
    } catch(e) {}

    try {
      if (typeof window.wrapAndAttachAllImages === 'function') {
        window.wrapAndAttachAllImages();
      }
    } catch(err) {}
  }

  window.runA4Pagination = runA4Pagination;

  // Active scroll listener to broadcast current page & active heading
  if (!window.__studioScrollListenerAttached) {
    window.__studioScrollListenerAttached = true;
    var scrollDebounceTimer = null;
    window.addEventListener('scroll', function() {
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(function() {
        var sheets = document.querySelectorAll('.a4-sheet');
        var currentVisiblePage = 1;
        var midY = window.innerHeight * 0.35;
        
        sheets.forEach(function(s) {
          var r = s.getBoundingClientRect();
          if (r.top <= midY && r.bottom >= 0) {
            currentVisiblePage = parseInt(s.getAttribute('data-page') || '1', 10);
          }
        });

        var headings = document.querySelectorAll('.a4-sheet h1, .a4-sheet h2, .a4-sheet h3, .a4-sheet h4, .a4-sheet h5, .a4-sheet h6');
        var activeHeadText = '';
        var activeHeadId = '';
        headings.forEach(function(h) {
          var r = h.getBoundingClientRect();
          if (r.top <= midY + 120) {
            activeHeadText = (h.textContent || '').trim();
            activeHeadId = h.id || h.getAttribute('data-note-id') || '';
          }
        });

        try {
          window.parent.postMessage({
            type: 'STUDIO_ACTIVE_PAGE_AND_HEADING',
            activePage: currentVisiblePage,
            activeHeadingText: activeHeadText,
            activeHeadingId: activeHeadId
          }, '*');
        } catch(e) {}
      }, 80);
    }, { passive: true });
  }

  // Event listener for smooth jump to heading with flash highlight
  if (!window.__studioMsgListenerAttached) {
    window.__studioMsgListenerAttached = true;
    window.addEventListener('message', function(e) {
      if (!e.data) return;
      if (e.data.type === 'SCROLL_TO_HEADING' || e.data.type === 'JUMP_TO_HEADING') {
        var targetText = (e.data.headingText || '').trim().toLowerCase();
        var targetId = e.data.headingId;
        var targetIndex = e.data.headingIndex;
        var headings = Array.from(document.querySelectorAll('.a4-sheet h1, .a4-sheet h2, .a4-sheet h3, .a4-sheet h4, .a4-sheet h5, .a4-sheet h6, [data-note-id]'));
        
        var matchEl = null;
        if (targetId) {
          matchEl = document.getElementById(targetId) || document.querySelector('[data-note-id="' + targetId + '"]');
        }
        if (!matchEl && typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < headings.length) {
          matchEl = headings[targetIndex];
        }
        if (!matchEl && targetText) {
          matchEl = headings.find(function(h) {
            return (h.textContent || '').trim().toLowerCase() === targetText;
          });
          if (!matchEl) {
            matchEl = headings.find(function(h) {
              return (h.textContent || '').trim().toLowerCase().includes(targetText);
            });
          }
        }

        if (matchEl) {
          var prevAct = document.querySelectorAll('.studio-active-heading');
          for (var pa = 0; pa < prevAct.length; pa++) {
            prevAct[pa].classList.remove('studio-active-heading');
            try {
              prevAct[pa].style.outline = '';
              prevAct[pa].style.backgroundColor = '';
            } catch (_) {}
          }

          var parentSheet = matchEl.closest('.a4-sheet');
          if (parentSheet) {
            parentSheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          matchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          matchEl.classList.add('studio-active-heading');
          matchEl.style.transition = 'all 0.25s ease-out';
          matchEl.style.outline = '3px solid #0b57d0';
          matchEl.style.outlineOffset = '4px';
          matchEl.style.backgroundColor = 'rgba(11, 87, 208, 0.14)';
          matchEl.style.borderRadius = '6px';
        }
      }
    });
  }

  function initAndSchedule() {
    if (typeof window.renderKaTeXMathInDocument === 'function') {
      window.renderKaTeXMathInDocument();
    }
    runA4Pagination();
    setTimeout(function() {
      if (typeof window.renderKaTeXMathInDocument === 'function') {
        window.renderKaTeXMathInDocument();
      }
      runA4Pagination();
    }, 350);
  }

  if (document.readyState === 'complete') initAndSchedule();
  else window.addEventListener('load', initAndSchedule);
})();
</script>
`;
}
