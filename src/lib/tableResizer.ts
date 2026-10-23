/**
 * Google Docs Style Interactive Table Row & Column Resizer
 * Enables dragging vertical column borders to adjust widths
 * and horizontal row borders to adjust heights.
 */

export function attachTableResizers(container: HTMLElement): () => void {
  const tables = Array.from(
    container.querySelectorAll('table[data-table-root], table')
  ) as HTMLTableElement[];

  const cleanups: Array<() => void> = [];

  tables.forEach((table) => {
    // Avoid double attaching
    if (table.dataset.resizersAttached === 'true') return;
    table.dataset.resizersAttached = 'true';

    // Set fixed layout so column widths are strictly respected
    table.style.tableLayout = 'fixed';

    const ths = Array.from(table.querySelectorAll('thead th')) as HTMLTableHeaderCellElement[];
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];

    // Ensure initial widths are defined so table doesn't shift unexpectedly
    ths.forEach((th) => {
      if (!th.style.width) {
        const rect = th.getBoundingClientRect();
        if (rect.width > 0) {
          th.style.width = `${Math.round(rect.width)}px`;
        }
      }
    });

    // 1. ATTACH COLUMN RESIZERS (WIDTH ADJUSTMENT)
    ths.forEach((th, colIdx) => {
      th.style.position = 'relative';

      // Create handle
      const colHandle = document.createElement('div');
      colHandle.className = 'table-col-resizer-handle';
      colHandle.title = 'Drag to adjust column width (Double-click to reset)';
      colHandle.setAttribute(
        'style',
        'position: absolute; top: 0; right: -4px; width: 8px; height: 100%; cursor: col-resize; z-index: 10; touch-action: none; user-select: none; display: flex; justify-content: center; align-items: center;'
      );

      const colLine = document.createElement('div');
      colLine.className = 'table-col-resizer-line';
      colLine.setAttribute(
        'style',
        'width: 2px; height: 100%; background: transparent; transition: background-color 0.15s ease;'
      );
      colHandle.appendChild(colLine);

      const handleHoverEnter = () => {
        colLine.style.background = 'rgba(0, 132, 255, 0.7)';
      };
      const handleHoverLeave = () => {
        if (!colHandle.dataset.isDragging) {
          colLine.style.background = 'transparent';
        }
      };

      colHandle.addEventListener('mouseenter', handleHoverEnter);
      colHandle.addEventListener('mouseleave', handleHoverLeave);

      // Double-click to auto-fit
      const handleDblClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        th.style.width = 'auto';
        rows.forEach((row) => {
          const cell = row.children[colIdx] as HTMLElement | undefined;
          if (cell) cell.style.width = 'auto';
        });
      };
      colHandle.addEventListener('dblclick', handleDblClick);

      // Pointer Drag
      const handlePointerDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        colHandle.dataset.isDragging = 'true';
        colLine.style.background = '#0084ff';
        colHandle.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startWidth = th.getBoundingClientRect().width;
        const tableRect = table.getBoundingClientRect();

        // Create visual vertical guide line
        const guide = document.createElement('div');
        guide.className = 'table-resize-guide-vertical';
        guide.setAttribute(
          'style',
          `position: fixed; top: ${tableRect.top}px; height: ${tableRect.height}px; left: ${e.clientX}px; width: 2px; background: #0084ff; z-index: 99999; pointer-events: none; box-shadow: 0 0 6px rgba(0, 132, 255, 0.6);`
        );
        document.body.appendChild(guide);

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onPointerMove = (moveEv: PointerEvent) => {
          const deltaX = moveEv.clientX - startX;
          const newWidth = Math.max(44, Math.round(startWidth + deltaX));

          th.style.width = `${newWidth}px`;
          rows.forEach((row) => {
            const cell = row.children[colIdx] as HTMLElement | undefined;
            if (cell) {
              cell.style.width = `${newWidth}px`;
            }
          });

          guide.style.left = `${moveEv.clientX}px`;
        };

        const onPointerUp = (upEv: PointerEvent) => {
          colHandle.releasePointerCapture(upEv.pointerId);
          delete colHandle.dataset.isDragging;
          colLine.style.background = 'transparent';

          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          guide.remove();

          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      };

      colHandle.addEventListener('pointerdown', handlePointerDown);
      th.appendChild(colHandle);

      cleanups.push(() => {
        colHandle.removeEventListener('mouseenter', handleHoverEnter);
        colHandle.removeEventListener('mouseleave', handleHoverLeave);
        colHandle.removeEventListener('dblclick', handleDblClick);
        colHandle.removeEventListener('pointerdown', handlePointerDown);
        colHandle.remove();
      });
    });

    // 2. ATTACH ROW RESIZERS (HEIGHT ADJUSTMENT)
    rows.forEach((row, rowIdx) => {
      // In each cell of this row, or along the first cell, add row height handle
      // Adding it to each cell bottom gives a continuous Google Docs grid-line handle
      const cells = Array.from(row.children) as HTMLElement[];
      cells.forEach((cell) => {
        cell.style.position = 'relative';

        const rowHandle = document.createElement('div');
        rowHandle.className = 'table-row-resizer-handle';
        rowHandle.title = 'Drag to adjust row height (Double-click to reset)';
        rowHandle.setAttribute(
          'style',
          'position: absolute; left: 0; right: 0; bottom: -3px; height: 6px; cursor: row-resize; z-index: 8; touch-action: none; user-select: none; display: flex; flex-direction: column; justify-content: center;'
        );

        const rowLine = document.createElement('div');
        rowLine.className = 'table-row-resizer-line';
        rowLine.setAttribute(
          'style',
          'height: 2px; width: 100%; background: transparent; transition: background-color 0.15s ease;'
        );
        rowHandle.appendChild(rowLine);

        const handleHoverEnter = () => {
          // Highlight across the entire row's handles
          row.querySelectorAll('.table-row-resizer-line').forEach((l) => {
            (l as HTMLElement).style.background = 'rgba(0, 132, 255, 0.7)';
          });
        };
        const handleHoverLeave = () => {
          if (!row.dataset.isDraggingRow) {
            row.querySelectorAll('.table-row-resizer-line').forEach((l) => {
              (l as HTMLElement).style.background = 'transparent';
            });
          }
        };

        rowHandle.addEventListener('mouseenter', handleHoverEnter);
        rowHandle.addEventListener('mouseleave', handleHoverLeave);

        // Double-click to auto-height
        const handleDblClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          row.style.height = 'auto';
          cells.forEach((c) => {
            c.style.height = 'auto';
          });
        };
        rowHandle.addEventListener('dblclick', handleDblClick);

        // Pointer Drag
        const handlePointerDown = (e: PointerEvent) => {
          e.preventDefault();
          e.stopPropagation();

          row.dataset.isDraggingRow = 'true';
          row.querySelectorAll('.table-row-resizer-line').forEach((l) => {
            (l as HTMLElement).style.background = '#0084ff';
          });
          rowHandle.setPointerCapture(e.pointerId);

          const startY = e.clientY;
          const startHeight = row.getBoundingClientRect().height;
          const tableRect = table.getBoundingClientRect();

          // Create visual horizontal guide line
          const guide = document.createElement('div');
          guide.className = 'table-resize-guide-horizontal';
          guide.setAttribute(
            'style',
            `position: fixed; left: ${tableRect.left}px; width: ${tableRect.width}px; top: ${e.clientY}px; height: 2px; background: #0084ff; z-index: 99999; pointer-events: none; box-shadow: 0 0 6px rgba(0, 132, 255, 0.6);`
          );
          document.body.appendChild(guide);

          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';

          const onPointerMove = (moveEv: PointerEvent) => {
            const deltaY = moveEv.clientY - startY;
            const newHeight = Math.max(28, Math.round(startHeight + deltaY));

            row.style.height = `${newHeight}px`;
            cells.forEach((c) => {
              c.style.height = `${newHeight}px`;
            });

            guide.style.top = `${moveEv.clientY}px`;
          };

          const onPointerUp = (upEv: PointerEvent) => {
            rowHandle.releasePointerCapture(upEv.pointerId);
            delete row.dataset.isDraggingRow;
            row.querySelectorAll('.table-row-resizer-line').forEach((l) => {
              (l as HTMLElement).style.background = 'transparent';
            });

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            guide.remove();

            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
          window.addEventListener('pointercancel', onPointerUp);
        };

        rowHandle.addEventListener('pointerdown', handlePointerDown);
        cell.appendChild(rowHandle);

        cleanups.push(() => {
          rowHandle.removeEventListener('mouseenter', handleHoverEnter);
          rowHandle.removeEventListener('mouseleave', handleHoverLeave);
          rowHandle.removeEventListener('dblclick', handleDblClick);
          rowHandle.removeEventListener('pointerdown', handlePointerDown);
          rowHandle.remove();
        });
      });
    });
  });

  return () => {
    cleanups.forEach((c) => c());
    tables.forEach((t) => {
      delete t.dataset.resizersAttached;
    });
  };
}
