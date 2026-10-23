import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Table as TableIcon, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  Maximize2, 
  Edit3, 
  FileSpreadsheet,
  FileText,
  Sparkles,
  Columns,
  Undo2,
  Redo2,
  Image as ImageIcon,
  Code2,
  CheckCheck,
  RotateCcw,
  AlertCircle,
  Bookmark
} from 'lucide-react';
import { APP_STYLES } from './ui/AppStyles';
import { MathRenderer } from './MathRenderer';
import { exportElementToPng } from '../lib/exportTable';
import { saveSingleNoteToIDB } from '../lib/idbNotes';
import { copyTableToClipboard, copyFormattedTextToClipboard } from '../lib/tableClipboard';
import { 
  getPreferredTableFontSize, 
  setPreferredTableFontSize, 
  TABLE_FONT_SIZE_CONFIG, 
  TableFontSize, 
  splitMarkdownTableCells 
} from '../lib/tablePreferences';
import { attachTableResizers } from '../lib/tableResizer';

export interface TableConfig {
  title: string;
  description?: string;
  headers: string[];
  rows: string[][];
  theme?: 'docs' | 'modern' | 'compact';
}

export interface InteractiveTableWidgetProps {
  tableConfig: TableConfig;
  onExpandToCanvas?: () => void;
  isDarkMode?: boolean;
  isEditable?: boolean;
  onTableUpdate?: (updated: TableConfig) => void;
  onSaveToNotes?: (noteContent: string, title?: string) => void;
}

export const InteractiveTableWidget: React.FC<InteractiveTableWidgetProps> = ({
  tableConfig,
  onExpandToCanvas,
  isDarkMode = false,
  isEditable = true,
  onTableUpdate,
  onSaveToNotes,
}) => {
  const [headers, setHeaders] = useState<string[]>(tableConfig.headers || ['Column 1', 'Column 2']);
  const [rows, setRows] = useState<string[][]>(tableConfig.rows || []);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortColumnIndex, setSortColumnIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tableFontSize, setTableFontSize] = useState<TableFontSize>(() => getPreferredTableFontSize());

  useEffect(() => {
    const handlePreferenceChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ size: TableFontSize }>;
      if (customEvent.detail?.size) {
        setTableFontSize(customEvent.detail.size);
      }
    };
    window.addEventListener('table-font-size-changed', handlePreferenceChange);
    return () => window.removeEventListener('table-font-size-changed', handlePreferenceChange);
  }, []);

  const handleSetFontSize = (size: TableFontSize) => {
    setTableFontSize(size);
    setPreferredTableFontSize(size);
  };

  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tableContainerRef.current) return;
    const cleanup = attachTableResizers(tableContainerRef.current);
    return cleanup;
  }, [headers, rows, tableFontSize]);

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<Array<{ headers: string[]; rows: string[][] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ headers: string[]; rows: string[][] }>>([]);
  
  // Editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  
  // Header editing
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null);
  const [editingHeaderValue, setEditingHeaderValue] = useState<string>('');

  const [copiedStatus, setCopiedStatus] = useState<'none' | 'docs' | 'tsv'>('none');
  const [isExportingPNG, setIsExportingPNG] = useState(false);
  const [isSavedToNotes, setIsSavedToNotes] = useState(false);
  
  // Code Section States
  const [showCodeSection, setShowCodeSection] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isEditingCode, setIsEditingCode] = useState<boolean>(false);
  const [customCodeInput, setCustomCodeInput] = useState<string>('');
  const [codeErrorMessage, setCodeErrorMessage] = useState<string | null>(null);

  // Computations for code representations
  const markdownCode = useMemo(() => {
    if (headers.length === 0) return '';
    const headerRow = '| ' + headers.join(' | ') + ' |';
    const separatorRow = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const bodyRows = rows.map((row) => '| ' + row.map(cell => (cell || '-').replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
    return `${headerRow}\n${separatorRow}\n${bodyRows}`;
  }, [headers, rows]);

  const activeCodeDisplay = useMemo(() => {
    return markdownCode;
  }, [markdownCode]);

  // Synchronize customCodeInput whenever active code format changes or table updates while not in mid-edit
  useEffect(() => {
    if (!isEditingCode) {
      setCustomCodeInput(activeCodeDisplay);
      setCodeErrorMessage(null);
    }
  }, [activeCodeDisplay, isEditingCode]);

  // Push snapshot to undo history before making mutations
  const pushHistorySnapshot = (currentHeaders = headers, currentRows = rows) => {
    setHistory((prev) => [...prev, { headers: [...currentHeaders], rows: currentRows.map((r) => [...r]) }]);
    setRedoStack([]);
  };

  const handleApplyCode = () => {
    setCodeErrorMessage(null);
    try {
      const lines = customCodeInput.trim().split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && (l.includes('|') || l.includes('\t')));
      if (lines.length < 1) {
        setCodeErrorMessage('Invalid Markdown table. Please provide pipe-delimited (|) columns.');
        return;
      }

      let headerIdx = 0;
      let separatorIdx = -1;
      for (let i = 0; i < lines.length - 1; i++) {
        const nextLine = lines[i + 1];
        if (/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(nextLine) || (nextLine.includes('-') && nextLine.includes('|') && !/[a-zA-Z0-9]/.test(nextLine))) {
          headerIdx = i;
          separatorIdx = i + 1;
          break;
        }
      }

      const rawHeaders = splitMarkdownTableCells(lines[headerIdx]);
      if (rawHeaders.length === 0) {
        setCodeErrorMessage('No valid table headers found in Markdown.');
        return;
      }

      const startRowIdx = separatorIdx !== -1 ? separatorIdx + 1 : headerIdx + 1;
      let maxCols = rawHeaders.length;
      for (let i = startRowIdx; i < lines.length; i++) {
        const rCells = splitMarkdownTableCells(lines[i]);
        if (rCells.length > maxCols) maxCols = rCells.length;
      }
      while (rawHeaders.length < maxCols) {
        rawHeaders.push(`Column ${rawHeaders.length + 1}`);
      }

      const newRows: string[][] = [];
      for (let i = startRowIdx; i < lines.length; i++) {
        const cells = splitMarkdownTableCells(lines[i]);
        if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;
        while (cells.length < rawHeaders.length) {
          cells.push('');
        }
        newRows.push(cells.slice(0, rawHeaders.length));
      }

      pushHistorySnapshot();
      setHeaders(rawHeaders);
      setRows(newRows);
      setIsEditingCode(false);
      if (onTableUpdate) {
        onTableUpdate({
          ...tableConfig,
          headers: rawHeaders,
          rows: newRows
        });
      }
    } catch (err: any) {
      setCodeErrorMessage(err?.message || 'Failed to parse code syntax. Check formatting and retry.');
    }
  };

  const handleCopyCodeForDocs = async () => {
    const textToCopy = isEditingCode ? customCodeInput : activeCodeDisplay;
    
    const formatCellForHtml = (rawCell: string): string => {
      let cell = (rawCell || '').trim();
      if (!cell) return '-';

      cell = cell.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, n) => {
        const num = parseFloat(n) || 0;
        const full = Math.min(5, Math.max(0, Math.floor(num)));
        const hasHalf = num % 1 >= 0.4 && num % 1 <= 0.8;
        const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
        const starsStr = '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(empty);
        return `${starsStr} (${num}/5)`;
      });

      cell = cell.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, val) => {
        return `${val}%`;
      });

      cell = cell.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, tVal) => {
        const t = tVal.trim().toLowerCase();
        if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) {
          return `▲ ${tVal.trim()}`;
        } else if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) {
          return `▼ ${tVal.trim()}`;
        }
        return `▬ ${tVal.trim()}`;
      });

      cell = cell.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\]\s*([^<]*)/gi, (_, _colorName, textAfter) => {
        const label = textAfter.trim();
        if (!label) return '';
        return label;
      });

      cell = cell.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      cell = cell.replace(/`([^`]+)`/g, '<code style="font-family: Consolas, Monaco, monospace; color: #1e293b;">$1</code>');
      return cell;
    };

    let html = `<table style="border-collapse: collapse; width: 100%; border: 1px solid #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #0f172a;">\n<thead>\n<tr>\n`;
    headers.forEach((h) => {
      html += `  <th style="border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; background-color: #f8fafc; color: #0f172a; font-weight: 700;">${formatCellForHtml(h)}</th>\n`;
    });
    html += `</tr>\n</thead>\n<tbody>\n`;
    rows.forEach((row) => {
      html += `<tr>\n`;
      row.forEach((cell) => {
        html += `  <td style="border: 1px solid #cbd5e1; padding: 10px 14px; vertical-align: top; color: #1e293b;">${formatCellForHtml(cell)}</td>\n`;
      });
      html += `</tr>\n`;
    });
    html += `</tbody>\n</table>`;

    const plainText = textToCopy || markdownCode;

    try {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ]);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      navigator.clipboard.writeText(plainText);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousSnapshot = history[history.length - 1];
    const newHistory = history.slice(0, history.length - 1);
    
    setRedoStack((prev) => [{ headers: [...headers], rows: rows.map((r) => [...r]) }, ...prev]);
    setHistory(newHistory);
    setHeaders(previousSnapshot.headers);
    setRows(previousSnapshot.rows);
    notifyUpdate(previousSnapshot.headers, previousSnapshot.rows);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextSnapshot = redoStack[0];
    const newRedoStack = redoStack.slice(1);

    setHistory((prev) => [...prev, { headers: [...headers], rows: rows.map((r) => [...r]) }]);
    setRedoStack(newRedoStack);
    setHeaders(nextSnapshot.headers);
    setRows(nextSnapshot.rows);
    notifyUpdate(nextSnapshot.headers, nextSnapshot.rows);
  };

  // Keep state synchronized if props update
  React.useEffect(() => {
    if (tableConfig.headers) setHeaders(tableConfig.headers);
    if (tableConfig.rows) setRows(tableConfig.rows);
  }, [tableConfig]);

  const notifyUpdate = (newHeaders: string[], newRows: string[][]) => {
    if (onTableUpdate) {
      onTableUpdate({
        ...tableConfig,
        headers: newHeaders,
        rows: newRows,
      });
    }
  };

  // Sort logic
  const handleSort = (colIndex: number) => {
    if (sortColumnIndex === colIndex) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumnIndex(null); // Reset sort
      }
    } else {
      setSortColumnIndex(colIndex);
      setSortDirection('asc');
    }
  };

  // Search & filtered/sorted rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(term))
      );
    }

    // Sort if active
    if (sortColumnIndex !== null) {
      result.sort((a, b) => {
        const valA = (a[sortColumnIndex] || '').toLowerCase();
        const valB = (b[sortColumnIndex] || '').toLowerCase();

        // Check if numerical sort
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return result;
  }, [rows, searchTerm, sortColumnIndex, sortDirection]);

  // Cell Edit Handlers
  const startEditingCell = (rowIndex: number, colIndex: number, currentVal: string) => {
    if (!isEditable) return;
    setEditingCell({ rowIndex, colIndex });
    setEditingValue(currentVal);
  };

  const saveEditingCell = () => {
    if (!editingCell) return;
    const { rowIndex, colIndex } = editingCell;
    const targetRow = filteredAndSortedRows[rowIndex];
    if (!targetRow) return;
    const origRowIndex = rows.indexOf(targetRow);
    if (origRowIndex === -1) return;

    pushHistorySnapshot();
    const newRows = rows.map((r, rIdx) => {
      if (rIdx !== origRowIndex) return r;
      const updatedRow = [...r];
      updatedRow[colIndex] = editingValue;
      return updatedRow;
    });
    setRows(newRows);
    notifyUpdate(headers, newRows);
    setEditingCell(null);
  };

  const handleToggleCellCheckbox = (viewRowIdx: number, colIndex: number, currentVal: string): boolean => {
    if (!isEditable) return false;
    const trimmed = (currentVal || '').trim();
    const match = trimmed.match(/^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\](?:\s*(.*))?$/);
    if (!match) return false;

    const prefix = match[1] || '';
    const mark = match[2];
    const rest = match[3] !== undefined && match[3] !== '' ? ` ${match[3]}` : '';
    const isChecked = mark === 'x' || mark === 'X' || mark === '✓' || mark === '✔';
    const newMark = isChecked ? ' ' : 'x';
    const newVal = `${prefix}[${newMark}]${rest}`;

    const targetRow = filteredAndSortedRows[viewRowIdx];
    if (!targetRow) return false;
    const origRowIndex = rows.indexOf(targetRow);
    if (origRowIndex === -1) return false;

    pushHistorySnapshot();
    const newRows = rows.map((r, rIdx) => {
      if (rIdx !== origRowIndex) return r;
      const updatedRow = [...r];
      updatedRow[colIndex] = newVal;
      return updatedRow;
    });
    setRows(newRows);
    notifyUpdate(headers, newRows);
    return true;
  };

  // Header Edit Handlers
  const startEditingHeader = (colIndex: number, currentVal: string) => {
    if (!isEditable) return;
    setEditingHeaderIndex(colIndex);
    setEditingHeaderValue(currentVal);
  };

  const saveEditingHeader = () => {
    if (editingHeaderIndex === null) return;
    pushHistorySnapshot();
    const newHeaders = [...headers];
    newHeaders[editingHeaderIndex] = editingHeaderValue;
    setHeaders(newHeaders);
    notifyUpdate(newHeaders, rows);
    setEditingHeaderIndex(null);
  };

  // Row & Column Mutators
  const handleAddRow = () => {
    pushHistorySnapshot();
    const newRow = new Array(headers.length).fill('Click to edit');
    const updatedRows = [...rows, newRow];
    setRows(updatedRows);
    notifyUpdate(headers, updatedRows);
  };

  const handleDeleteRow = (viewIndex: number) => {
    const targetRow = filteredAndSortedRows[viewIndex];
    if (!targetRow) return;
    const origRowIndex = rows.indexOf(targetRow);
    if (origRowIndex === -1) return;

    pushHistorySnapshot();
    const updatedRows = rows.filter((_, idx) => idx !== origRowIndex);
    setRows(updatedRows);
    notifyUpdate(headers, updatedRows);
  };

  const handleAddColumn = () => {
    pushHistorySnapshot();
    const newHeaders = [...headers, `Column ${headers.length + 1}`];
    const updatedRows = rows.map((row) => [...row, '-']);
    setHeaders(newHeaders);
    setRows(updatedRows);
    notifyUpdate(newHeaders, updatedRows);
  };

  // Copy structured table for Google Docs / Sheets
  const handleCopyForGoogleDocs = async () => {
    try {
      await copyTableToClipboard(markdownCode);
      setCopiedStatus('docs');
      setTimeout(() => setCopiedStatus('none'), 2000);
    } catch {
      navigator.clipboard.writeText(markdownCode);
      setCopiedStatus('docs');
      setTimeout(() => setCopiedStatus('none'), 2000);
    }
  };

  // Download CSV
  const handleDownloadCSV = () => {
    const csvContent = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(tableConfig.title || 'table').toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download PNG
  const handleDownloadPNG = async () => {
    if (!tableContainerRef.current) return;
    try {
      setIsExportingPNG(true);
      const fileName = `${(tableConfig.title || 'table').toLowerCase().replace(/\s+/g, '_')}.png`;
      await exportElementToPng(tableContainerRef.current, fileName, {
        title: tableConfig.title || 'Interactive Table',
        description: tableConfig.description
      });
    } catch (err) {
      console.error('Failed to export table as PNG:', err);
    } finally {
      setIsExportingPNG(false);
    }
  };

  return (
    <div ref={tableContainerRef} className={`${APP_STYLES.widgets.container} rounded-none shadow-sm flex flex-col transition-all`}>
      {/* Table Title Bar */}
      <div className="px-4 py-3 bg-[#f8fafc] dark:bg-black flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <TableIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
              <span>{tableConfig.title || 'Interactive Table'}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                Interactive Table
              </span>
            </h4>
            {tableConfig.description && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                {tableConfig.description}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="w-7 h-7 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 disabled:opacity-30 text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed border-0 shadow-none"
            title="Undo Table Action"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="w-7 h-7 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 disabled:opacity-30 text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed border-0 shadow-none"
            title="Redo Table Action"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={async () => {
              const tableMd = markdownCode || `# ${tableConfig.title || 'Table'}\n\n` + headers.join(' | ') + '\n';
              if (onSaveToNotes) {
                onSaveToNotes(tableMd, tableConfig.title || 'Interactive Table');
              } else {
                await saveSingleNoteToIDB({
                  id: `note_tbl_${Date.now()}`,
                  testId: 'notes_repository',
                  content: tableMd,
                  tag: 'formula',
                  fileName: `${tableConfig.title || 'Table Note'}.md`,
                  createdAt: new Date().toISOString(),
                });
              }
              setIsSavedToNotes(true);
              setTimeout(() => setIsSavedToNotes(false), 2500);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border-0 shadow-none ${
              isSavedToNotes
                ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-transparent text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800/80'
            }`}
            title="Save Table to Notes Repository (NotebookLM style)"
          >
            {isSavedToNotes ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Bookmark className="w-3.5 h-3.5 text-amber-600" />}
            <span className="hidden sm:inline">{isSavedToNotes ? 'Saved to Notes' : 'Save to Notes'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyForGoogleDocs}
            className="px-2.5 py-1 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border-0 shadow-none"
            title="Copy formatted table for pasting into Google Docs or Sheets"
          >
            {copiedStatus === 'docs' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-blue-600" />}
            <span className="hidden sm:inline">Copy for Docs</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCSV}
            className="w-7 h-7 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer border-0 shadow-none"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadPNG}
            disabled={isExportingPNG}
            className="px-2.5 py-1 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55 border-0 shadow-none"
            title="Download Table as PNG Image"
          >
            {isExportingPNG ? (
              <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="hidden sm:inline">{isExportingPNG ? 'Exporting...' : 'Export PNG'}</span>
          </button>

          {/* Code Button */}
          <button
            type="button"
            onClick={() => setShowCodeSection(!showCodeSection)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border-0 shadow-none ${
              showCodeSection
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-slate-700 dark:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800/80'
            }`}
            title="Toggle Table Code View & Live Editor"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code</span>
          </button>

          {onExpandToCanvas && (
            <button
              type="button"
              onClick={onExpandToCanvas}
              className="w-7 h-7 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-blue-600 dark:text-blue-400 flex items-center justify-center transition-colors cursor-pointer border-0 shadow-none"
              title="Expand to Full Canvas Workspace"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: Search + Column/Row actions + Font Size */}
      <div className="px-3 py-2 bg-slate-50/80 dark:bg-[#050505] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search table rows..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white dark:bg-[#1c1e28] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-none"
            />
          </div>

          {/* Table Font Size Toggle: 2 font options (A+ and A++) in a single button */}
          <button
            type="button"
            onClick={() => handleSetFontSize(tableFontSize === 'large' ? 'xlarge' : 'large')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-transparent text-slate-700 dark:text-zinc-200 text-xs font-semibold hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 transition-all cursor-pointer border-0 shadow-none select-none shrink-0"
            title="Toggle table font size (A+ / A++)"
          >
            <span className={tableFontSize === 'large' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}>A+</span>
            <span className="text-slate-300 dark:text-zinc-600 text-[10px]">/</span>
            <span className={tableFontSize === 'xlarge' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}>A++</span>
          </button>
        </div>

        {isEditable && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAddRow}
              className="px-2.5 py-1 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer border-0 shadow-none"
            >
              <Plus className="w-3 h-3 text-blue-600" />
              <span>Row</span>
            </button>

            <button
              type="button"
              onClick={handleAddColumn}
              className="px-2.5 py-1 rounded-md bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer border-0 shadow-none"
            >
              <Columns className="w-3 h-3 text-blue-600" />
              <span>Column</span>
            </button>
          </div>
        )}
      </div>

      {/* Styled Google Docs Table Container with Smooth Scrollbars */}
      <div ref={tableContainerRef} className="table-panel-box overflow-x-auto max-h-[480px] [scrollbar-width:thin] scrollbar-thin touch-auto overscroll-x-contain w-full">
        <table className={`w-full min-w-full border-collapse text-left ${TABLE_FONT_SIZE_CONFIG[tableFontSize].table}`}>
          {/* Header Row */}
          <thead>
            <tr className="bg-slate-100 dark:bg-[#08080a] text-slate-800 dark:text-zinc-200 font-bold select-none">
              {headers.map((header, colIdx) => {
                const isSorted = sortColumnIndex === colIdx;
                const isIndex = colIdx === 0 && (
                  /^(?:q|q\.|q#|#|no|no\.|s\.?no\.?|sr\.?no\.?|sl\.?no\.?|step|item|id|index|idx|question|question\s*no\.?|question\s*number|question\s*#|q\.?\s*no\.?|q\.?\s*#)$/i.test((header || '').replace(/[*_`#]/g, '').trim()) ||
                  /^(?:q|#|question)\s*\d+$/i.test((header || '').replace(/[*_`#]/g, '').trim()) ||
                  (rows.length > 0 && rows.every(r => /^(?:q|#|step|question)?\s*0?\d+$/i.test((r[0] || '').replace(/[*_`]/g, '').trim())))
                );
                const colWidthClass = isIndex
                  ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 py-3 text-center shrink-0'
                  : `${TABLE_FONT_SIZE_CONFIG[tableFontSize].th} min-w-[120px] sm:min-w-[150px]`;

                return (
                  <th
                    key={colIdx}
                    className={`${colWidthClass} font-semibold tracking-wide`}
                  >
                    <div className={`flex items-center ${isIndex ? 'justify-center' : 'justify-between'} gap-1`}>
                      {editingHeaderIndex === colIdx ? (
                        <input
                          type="text"
                          value={editingHeaderValue}
                          onChange={(e) => setEditingHeaderValue(e.target.value)}
                          onBlur={saveEditingHeader}
                          onKeyDown={(e) => e.key === 'Enter' && saveEditingHeader()}
                          autoFocus
                          className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-[#101217] text-xs font-bold focus:outline-none ring-2 ring-blue-500/40"
                        />
                      ) : (
                        <span
                          onClick={() => startEditingHeader(colIdx, header)}
                          title="Click to edit column header"
                          className="cursor-pointer hover:underline"
                        >
                          {header}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSort(colIdx)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#282a39] text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                        title="Sort column"
                      >
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        )}
                      </button>
                    </div>
                  </th>
                );
              })}
              {isEditable && <th className="p-2.5 w-8"></th>}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-[#252834]">
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + (isEditable ? 1 : 0)}
                  className="p-6 text-center text-slate-400 text-xs italic"
                >
                  No table records found.
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors group"
                >
                  {row.map((cell, colIdx) => {
                    const isEditingThisCell =
                      editingCell?.rowIndex === rIdx && editingCell?.colIndex === colIdx;
                    const trimmedCell = (cell || '').trim();
                    const isCheckboxCell = /^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\](?:\s*(.*))?$/.test(trimmedCell);
                    const isIndex = colIdx === 0 && (
                      /^(?:q|q\.|q#|#|no|no\.|s\.?no\.?|sr\.?no\.?|sl\.?no\.?|step|item|id|index|idx|question|question\s*no\.?|question\s*number|question\s*#|q\.?\s*no\.?|q\.?\s*#)$/i.test((headers[0] || '').replace(/[*_`#]/g, '').trim()) ||
                      /^(?:q|#|question)\s*\d+$/i.test((headers[0] || '').replace(/[*_`#]/g, '').trim()) ||
                      (rows.length > 0 && rows.every(r => /^(?:q|#|step|question)?\s*0?\d+$/i.test((r[0] || '').replace(/[*_`]/g, '').trim())))
                    );
                    const cellWidthClass = isIndex
                      ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 py-2.5 sm:py-3 text-center font-bold text-slate-900 dark:text-zinc-100 shrink-0'
                      : `${TABLE_FONT_SIZE_CONFIG[tableFontSize].td} min-w-[120px] sm:min-w-[150px] max-w-[420px]`;

                    return (
                      <td
                        key={colIdx}
                        onClick={() => {
                          if (isCheckboxCell && isEditable) {
                            handleToggleCellCheckbox(rIdx, colIdx, cell);
                          } else {
                            startEditingCell(rIdx, colIdx, cell);
                          }
                        }}
                        className={`${cellWidthClass} text-slate-800 dark:text-zinc-200 cursor-pointer break-words relative group/cell select-text`}
                        title={isCheckboxCell ? 'Click to check/uncheck status' : 'Click to edit formula or text'}
                      >
                        {isEditingThisCell ? (
                          <div className="space-y-1.5 p-2 rounded-xl bg-white dark:bg-[#12141c] border border-blue-500 shadow-md min-w-[220px]" onClick={(e) => e.stopPropagation()}>
                            <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/60 shadow-2xs">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                  <Sparkles className="w-2.5 h-2.5 text-blue-500" />
                                  <span>Live Formula Preview</span>
                                </span>
                                <span className="text-[9px] lowercase font-mono text-slate-400">esc: cancel • ↵: save</span>
                              </div>
                              <div className="text-xs py-0.5">
                                <MathRenderer content={editingValue || '-'} isTableCell />
                              </div>
                            </div>
                            <textarea
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEditingCell();
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              autoFocus
                              rows={2}
                              className="w-full p-2 rounded-xl bg-white dark:bg-[#101217] ring-2 ring-blue-500/40 text-xs focus:outline-none resize-none font-mono text-slate-900 dark:text-zinc-100"
                              placeholder="Edit cell formula (e.g. \Delta t = \sqrt{2h/g})..."
                            />
                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                              {['\\frac{a}{b}', '\\sqrt{x}', 'x^2', '\\Delta', '\\pi', '\\pm', '\\approx'].map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setEditingValue(p => p + (p ? ' ' : '') + s);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-zinc-800 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setEditingCell(null);
                                }}
                                className="px-2 py-0.5 rounded text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  saveEditingCell();
                                }}
                                className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-2xs cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1 w-full min-h-[24px]">
                            <div className="flex-1 min-w-0">
                              <MathRenderer content={cell || '-'} isTableCell />
                            </div>
                            {isEditable && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingCell(rIdx, colIdx, cell);
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 p-1 rounded hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-400 hover:text-blue-500 transition-opacity shrink-0 cursor-pointer"
                                title="Edit cell formula or text"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}


                  {/* Row Delete Button */}
                  {isEditable && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rIdx)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-red-500 transition-opacity cursor-pointer"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer info & Actions */}
      <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-black flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
        <span className="shrink-0 text-[10px] sm:text-[11px]">
          Showing {filteredAndSortedRows.length} of {rows.length} rows
        </span>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar max-w-full">
          {/* Copy Table Button under table */}
          <button
            type="button"
            onClick={handleCopyCodeForDocs}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 shadow-none text-[11px] sm:text-xs font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="Copy Table Markdown / Docs Code"
          >
            {copiedCode ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500" /> : <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            <span>{copiedCode ? 'Copied' : <>Copy<span className="hidden xs:inline sm:inline"> Table</span></>}</span>
          </button>

          {/* Save to Notes Button under table */}
          <button
            type="button"
            onClick={async () => {
              const tableMd = markdownCode || `# ${tableConfig.title || 'Table'}\n\n` + headers.join(' | ') + '\n';
              if (onSaveToNotes) {
                onSaveToNotes(tableMd, tableConfig.title || 'Interactive Table');
              } else {
                await saveSingleNoteToIDB({
                  id: `note_tbl_${Date.now()}`,
                  testId: 'notes_repository',
                  content: tableMd,
                  tag: 'formula',
                  fileName: `${tableConfig.title || 'Table Note'}.md`,
                  createdAt: new Date().toISOString(),
                });
              }
              setIsSavedToNotes(true);
              setTimeout(() => setIsSavedToNotes(false), 2500);
            }}
            className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors cursor-pointer border-0 shadow-none ${
              isSavedToNotes
                ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200'
            }`}
            title="Save Table to Notes Repository"
          >
            {isSavedToNotes ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500" /> : <Bookmark className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            <span>{isSavedToNotes ? 'Saved' : <>Save<span className="hidden xs:inline sm:inline"> to Note</span></>}</span>
          </button>

          {/* Edit with AI Button */}
          <button
            type="button"
            onClick={() => {
              const tableMd = markdownCode || `# ${tableConfig.title || 'Table'}\n\n` + headers.join(' | ') + '\n';
              window.dispatchEvent(new CustomEvent('gemini-open-table-canvas', {
                detail: { markdown: tableMd, title: tableConfig.title || 'Table Canvas' }
              }));
              window.dispatchEvent(new CustomEvent('gemini-edit-element', {
                detail: { type: 'table', content: tableMd, title: tableConfig.title || 'Table' }
              }));
            }}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-transparent hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer border-0 shadow-none text-[11px] sm:text-xs font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="Edit this table with AI"
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500" />
            <span>Edit<span className="hidden xs:inline sm:inline"> with AI</span></span>
          </button>

          {/* Retry Button */}
          <button
            type="button"
            onClick={() => {
              const tableMd = markdownCode || `# ${tableConfig.title || 'Table'}\n\n` + headers.join(' | ') + '\n';
              window.dispatchEvent(new CustomEvent('gemini-retry-table', {
                detail: { markdown: tableMd }
              }));
            }}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-transparent hover:bg-slate-200/60 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer border-0 shadow-none text-[11px] sm:text-xs font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="Regenerate table response with AI"
          >
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      </div>

      {/* Code Display & Live Editor Section under the Table */}
      {showCodeSection && (
        <div className="bg-slate-50/70 dark:bg-[#11131a] p-3.5 sm:p-4 border-t border-slate-200/80 dark:border-zinc-800/80 no-export transition-all">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">Table Code & Editor</span>
              {isEditingCode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  Editing Live Code
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans hidden sm:inline">
                Google Docs Compatible
              </span>

              {/* Edit Code Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  if (!isEditingCode) {
                    setCustomCodeInput(activeCodeDisplay);
                    setCodeErrorMessage(null);
                    setIsEditingCode(true);
                  } else {
                    setIsEditingCode(false);
                    setCodeErrorMessage(null);
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                  isEditingCode
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-slate-200/80 dark:bg-[#1a1c24] text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-[#282b37]'
                }`}
                title="Edit table code directly"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditingCode ? 'Viewing Code' : 'Edit Code'}</span>
              </button>

              {/* Save to Notes Button in Code Section */}
              <button
                type="button"
                onClick={async () => {
                  const tableMd = markdownCode || `# ${tableConfig.title || 'Table'}\n\n` + headers.join(' | ') + '\n';
                  if (onSaveToNotes) {
                    onSaveToNotes(tableMd, tableConfig.title || 'Interactive Table');
                  } else {
                    await saveSingleNoteToIDB({
                      id: `note_tbl_${Date.now()}`,
                      testId: 'notes_repository',
                      content: tableMd,
                      tag: 'formula',
                      fileName: `${tableConfig.title || 'Table Note'}.md`,
                      createdAt: new Date().toISOString(),
                    });
                  }
                  setIsSavedToNotes(true);
                  setTimeout(() => setIsSavedToNotes(false), 2500);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                  isSavedToNotes
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
                title="Save Table to Notes Repository"
              >
                {isSavedToNotes ? <Check className="w-3.5 h-3.5 text-white" /> : <Bookmark className="w-3.5 h-3.5 text-white" />}
                <span>{isSavedToNotes ? 'Saved to Notes' : 'Save to Notes'}</span>
              </button>

              {/* Copy Code Button */}
              <button
                type="button"
                onClick={handleCopyCodeForDocs}
                className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-2xs text-xs font-semibold flex items-center gap-1.5"
                title="Copy table code for Google Docs"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                <span>{copiedCode ? 'Copied Table!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Error notice if code syntax is invalid */}
          {codeErrorMessage && (
            <div className="mb-2.5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{codeErrorMessage}</span>
            </div>
          )}

          <div className="relative">
            {isEditingCode ? (
              <div className="space-y-2">
                <textarea
                  value={customCodeInput}
                  onChange={(e) => {
                    setCustomCodeInput(e.target.value);
                    if (codeErrorMessage) setCodeErrorMessage(null);
                  }}
                  rows={8}
                  placeholder="Edit table code (| Col 1 | Col 2 |)..."
                  className="w-full p-3.5 rounded-none bg-slate-900 text-slate-100 dark:bg-[#0c0d12] text-[11px] sm:text-xs font-mono overflow-x-auto leading-relaxed shadow-inner border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Modify lines directly and click Apply to update the table live.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCodeInput(activeCodeDisplay);
                        setCodeErrorMessage(null);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#1f212a] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCode}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Apply Code Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <pre className="p-3.5 rounded-none bg-slate-900 text-slate-100 dark:bg-[#0c0d12] text-[11px] sm:text-xs font-mono overflow-x-auto max-h-[180px] scrollbar-thin leading-relaxed shadow-inner border border-slate-800">
                <code>{activeCodeDisplay}</code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
