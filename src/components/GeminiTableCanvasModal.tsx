import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  ArrowLeft,
  Search, 
  Copy, 
  FileSpreadsheet, 
  Sparkles, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Send,
  Code2,
  Edit3,
  CheckCheck,
  RotateCcw,
  AlertCircle,
  Terminal,
  FileCode2,
  ZoomIn,
  ZoomOut,
  Bookmark
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { useBackHandler } from '../hooks/useBackNavigation';
import { saveSingleNoteToIDB } from '../lib/idbNotes';
import { copyTableToClipboard, copyFormattedTextToClipboard } from '../lib/tableClipboard';
import { 
  getPreferredTableFontSize, 
  setPreferredTableFontSize, 
  TABLE_FONT_SIZE_CONFIG, 
  TableFontSize, 
  splitMarkdownTableCells 
} from '../lib/tablePreferences';

interface GeminiTableCanvasModalProps {
  markdown: string;
  messageId?: string;
  isLoading?: boolean;
  onClose: () => void;
  onEditWithAi: (prompt: string, messageId?: string) => void;
}

export const GeminiTableCanvasModal: React.FC<GeminiTableCanvasModalProps> = ({
  markdown,
  messageId,
  isLoading = false,
  onClose,
  onEditWithAi
}) => {
  const [effectiveMarkdown, setEffectiveMarkdown] = useState<string>(markdown);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedSheets, setCopiedSheets] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Table Font Size Controls: 'compact' | 'normal' | 'large' | 'xlarge'
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

  // Inline Cell Editing
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Zoom state & pinch-to-zoom gesture handling
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const zoomLevelRef = useRef<number>(zoomLevel);
  zoomLevelRef.current = zoomLevel;

  // Code drawer & live editor state
  const [showCodeDrawer, setShowCodeDrawer] = useState<boolean>(false);
  const [isEditingCode, setIsEditingCode] = useState<boolean>(false);
  const [customCodeInput, setCustomCodeInput] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [codeErrorMessage, setCodeErrorMessage] = useState<string | null>(null);
  const [isSavedToNotes, setIsSavedToNotes] = useState<boolean>(false);

  // Back Navigation Handlers
  useBackHandler({
    isOpen: showCodeDrawer,
    onBack: () => setShowCodeDrawer(false),
    priority: 32,
    id: 'gemini_table_canvas_code_drawer'
  });

  useBackHandler({
    isOpen: true,
    onBack: onClose,
    priority: 30,
    id: 'gemini_table_canvas_modal'
  });

  // Mobile pinch-to-zoom and desktop trackpad/Ctrl+wheel zoom support
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container) return;

    let initialDist = 0;
    let initialScale = 1;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialScale = zoomLevelRef.current;
        setIsPinching(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / initialDist;
        const nextZoom = Math.min(3.0, Math.max(0.4, Number((initialScale * factor).toFixed(2))));
        setZoomLevel(nextZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDist = 0;
        setIsPinching(false);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel(prev => Math.min(3.0, Math.max(0.4, Number((prev + delta).toFixed(2)))));
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Sync effectiveMarkdown if prop changes
  useEffect(() => {
    setEffectiveMarkdown(markdown);
  }, [markdown]);

  const tableRef = useRef<HTMLDivElement>(null);

  // Clean and robustly parse markdown table or tabular content from effectiveMarkdown
  const { headers, alignments, rows, summaryRow, hasValidTable } = useMemo(() => {
    if (!effectiveMarkdown || typeof effectiveMarkdown !== 'string') {
      return { headers: [], alignments: [], rows: [], summaryRow: null, hasValidTable: false };
    }

    // Strip markdown code block wrappers if any
    let cleanText = effectiveMarkdown.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    const rawLines = cleanText.split('\n');
    
    // Find all lines that contain '|' or tab characters
    const tableLines = rawLines.filter(l => l.includes('|') || l.includes('\t'));

    if (tableLines.length < 2) {
      return { headers: [], alignments: [], rows: [], summaryRow: null, hasValidTable: false };
    }

    // Find the header line and separator line
    let headerIdx = -1;
    let separatorIdx = -1;

    for (let i = 0; i < tableLines.length - 1; i++) {
      const nextLine = tableLines[i + 1];
      // Separator line matches patterns like |---|---| or :--- | ---: or ---|---
      if (/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(nextLine) || (nextLine.includes('-') && nextLine.includes('|') && !/[a-zA-Z0-9]/.test(nextLine))) {
        headerIdx = i;
        separatorIdx = i + 1;
        break;
      }
    }

    // If no explicit separator found, treat line 0 as header
    if (headerIdx === -1) {
      headerIdx = 0;
      separatorIdx = -1;
    }

    const rawHeaders = splitMarkdownTableCells(tableLines[headerIdx]);
    if (rawHeaders.length === 0 || rawHeaders.every(h => !h)) {
      return { headers: [], alignments: [], rows: [], summaryRow: null, hasValidTable: false };
    }

    const startRowIdx = separatorIdx !== -1 ? separatorIdx + 1 : headerIdx + 1;

    // Scan all data rows to find the maximum column count so formula columns are never truncated
    let maxCols = rawHeaders.length;
    for (let i = startRowIdx; i < tableLines.length; i++) {
      const rCells = splitMarkdownTableCells(tableLines[i]);
      if (rCells.length > maxCols) {
        maxCols = rCells.length;
      }
    }

    // Pad headers if data rows have more columns
    while (rawHeaders.length < maxCols) {
      rawHeaders.push(`Column ${rawHeaders.length + 1}`);
    }

    // Parse alignment from separator if available
    let rawAlignments: string[] = [];
    if (separatorIdx !== -1) {
      const sepCells = splitMarkdownTableCells(tableLines[separatorIdx]);
      rawAlignments = sepCells.map(c => {
        if (c.startsWith(':') && c.endsWith(':')) return 'text-center';
        if (c.endsWith(':')) return 'text-right';
        return 'text-left';
      });
    }
    while (rawAlignments.length < rawHeaders.length) {
      rawAlignments.push('text-left');
    }

    const dataRows: string[][] = [];
    let summary: string[] | null = null;

    for (let i = startRowIdx; i < tableLines.length; i++) {
      const cells = splitMarkdownTableCells(tableLines[i]);
      if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;
      
      // Pad to match header count
      while (cells.length < rawHeaders.length) {
        cells.push('');
      }
      
      const firstCell = cells[0]?.replace(/[*_`$]/g, '').toLowerCase() || '';
      const isSummary = /^(total|average|summary|sum|net|overall|mean)/i.test(firstCell);
      
      if (isSummary && (i === tableLines.length - 1 || i === tableLines.length - 2)) {
        summary = cells.slice(0, rawHeaders.length);
      } else {
        dataRows.push(cells.slice(0, rawHeaders.length));
      }
    }

    return {
      headers: rawHeaders,
      alignments: rawAlignments,
      rows: dataRows,
      summaryRow: summary,
      hasValidTable: true
    };
  }, [effectiveMarkdown]);

  // Clean table representation
  const activeCodeDisplay = useMemo(() => {
    return effectiveMarkdown.trim();
  }, [effectiveMarkdown]);

  // Keep customCodeInput synced when not actively editing
  useEffect(() => {
    if (!isEditingCode) {
      setCustomCodeInput(activeCodeDisplay);
      setCodeErrorMessage(null);
    }
  }, [activeCodeDisplay, isEditingCode]);

  // Apply custom edited code back to effectiveMarkdown
  const handleApplyCustomCode = () => {
    setCodeErrorMessage(null);
    try {
      const trimmed = customCodeInput.trim();
      if (!trimmed.includes('|')) {
        setCodeErrorMessage('Invalid Table format. Columns must be separated with pipes (|).');
        return;
      }
      setEffectiveMarkdown(trimmed);
      setIsEditingCode(false);
    } catch (err: any) {
      setCodeErrorMessage(err?.message || 'Failed to parse code syntax.');
    }
  };

  // Inline cell editing handlers
  const handleStartEditCell = (rIdx: number, cIdx: number, val: string) => {
    setEditingCell({ rowIndex: rIdx, colIndex: cIdx });
    setEditingValue(val || '');
  };

  const handleSaveEditCell = () => {
    if (!editingCell) return;
    const { rowIndex, colIndex } = editingCell;
    const targetRow = sortedRows[rowIndex];
    if (!targetRow) return;

    const origRowIndex = rows.indexOf(targetRow);
    if (origRowIndex === -1) return;

    const updatedRows = rows.map((r, rI) => {
      if (rI !== origRowIndex) return r;
      const newRow = [...r];
      newRow[colIndex] = editingValue;
      return newRow;
    });

    const headerLine = '| ' + headers.join(' | ') + ' |';
    const sepLine = '| ' + headers.map((_, i) => alignments[i] === 'text-center' ? ':---:' : alignments[i] === 'text-right' ? '---:' : ':---').join(' | ') + ' |';
    const bodyLines = updatedRows.map(r => '| ' + r.map(c => (c || '-').replace(/(?<!\\)\|/g, '\\|')).join(' | ') + ' |');
    const newMarkdown = [headerLine, sepLine, ...bodyLines].join('\n');
    setEffectiveMarkdown(newMarkdown);
    setEditingCell(null);
  };

  const handleToggleCheckbox = (viewRowIndex: number, colIndex: number, currentVal: string): boolean => {
    const trimmed = (currentVal || '').trim();
    const match = trimmed.match(/^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\](?:\s*(.*))?$/);
    if (!match) return false;

    const prefix = match[1] || '';
    const mark = match[2];
    const rest = match[3] !== undefined && match[3] !== '' ? ` ${match[3]}` : '';
    const isChecked = mark === 'x' || mark === 'X' || mark === '✓' || mark === '✔';
    const newMark = isChecked ? ' ' : 'x';
    const newVal = `${prefix}[${newMark}]${rest}`;

    const targetRow = sortedRows[viewRowIndex];
    if (!targetRow) return false;
    const origRowIndex = rows.indexOf(targetRow);
    if (origRowIndex === -1) return false;

    const updatedRows = rows.map((r, rI) => {
      if (rI !== origRowIndex) return r;
      const newRow = [...r];
      newRow[colIndex] = newVal;
      return newRow;
    });

    const headerLine = '| ' + headers.join(' | ') + ' |';
    const sepLine = '| ' + headers.map((_, i) => alignments[i] === 'text-center' ? ':---:' : alignments[i] === 'text-right' ? '---:' : ':---').join(' | ') + ' |';
    const bodyLines = updatedRows.map(r => '| ' + r.map(c => (c || '-').replace(/(?<!\\)\|/g, '\\|')).join(' | ') + ' |');
    const newMarkdown = [headerLine, sepLine, ...bodyLines].join('\n');
    setEffectiveMarkdown(newMarkdown);
    return true;
  };

  // Helper to generate rich HTML table and clean Markdown table for clipboard
  const generateClipboardTableData = () => {
    const activeRows = sortedRows.length > 0 ? sortedRows : rows;

    const formatCellForHtml = (rawCell: string): string => {
      let cell = (rawCell || '').trim();
      if (!cell) return '-';

      // Format stars: [stars:4] -> clean Unicode stars
      cell = cell.replace(/\[stars\s*:\s*([0-9.]+)\]/gi, (_, n) => {
        const num = parseFloat(n) || 0;
        const full = Math.min(5, Math.max(0, Math.floor(num)));
        const hasHalf = num % 1 >= 0.4 && num % 1 <= 0.8;
        const empty = Math.max(0, 5 - full - (hasHalf ? 1 : 0));
        const starsStr = '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(empty);
        return `${starsStr} (${num}/5)`;
      });

      // Format progress bar: [bar:80%] -> clean percentage
      cell = cell.replace(/\[bar\s*:\s*(\d+)%?\]/gi, (_, val) => {
        return `${val}%`;
      });

      // Format trend indicators: [trend:up]
      cell = cell.replace(/\[trend\s*:\s*([^\]]+)\]/gi, (_, tVal) => {
        const t = tVal.trim().toLowerCase();
        if (t === 'up' || t.startsWith('+') || t.startsWith('inc') || t.startsWith('pos')) {
          return `▲ ${tVal.trim()}`;
        } else if (t === 'down' || t.startsWith('-') || t.startsWith('dec') || t.startsWith('neg')) {
          return `▼ ${tVal.trim()}`;
        }
        return `▬ ${tVal.trim()}`;
      });

      // Format color badges: [color:amber] Boundary -> clean text without highlight
      cell = cell.replace(/\[color\s*:\s*([a-zA-Z0-9_-]+)\]\s*([^<]*)/gi, (_, _colorName, textAfter) => {
        const label = textAfter.trim();
        if (!label) return '';
        return label;
      });

      // Format bold and code
      cell = cell.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      cell = cell.replace(/`([^`]+)`/g, '<code style="font-family: Consolas, Monaco, monospace; color: #1e293b;">$1</code>');
      cell = cell.replace(/\n/g, '<br />');

      return cell;
    };

    let html = `<table style="border-collapse: collapse; width: 100%; border: 1px solid #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #0f172a;">\n<thead>\n<tr>\n`;
    headers.forEach((h, i) => {
      const align = alignments[i] === 'text-center' ? 'center' : alignments[i] === 'text-right' ? 'right' : 'left';
      html += `  <th style="border: 1px solid #cbd5e1; padding: 10px 14px; text-align: ${align}; background-color: #f8fafc; color: #0f172a; font-weight: 700;">${formatCellForHtml(h)}</th>\n`;
    });
    html += `</tr>\n</thead>\n<tbody>\n`;
    activeRows.forEach((row) => {
      html += `<tr>\n`;
      row.forEach((cell, i) => {
        const align = alignments[i] === 'text-center' ? 'center' : alignments[i] === 'text-right' ? 'right' : 'left';
        html += `  <td style="border: 1px solid #cbd5e1; padding: 10px 14px; text-align: ${align}; vertical-align: top; color: #1e293b;">${formatCellForHtml(cell)}</td>\n`;
      });
      html += `</tr>\n`;
    });
    if (summaryRow) {
      html += `<tr>\n`;
      summaryRow.forEach((cell, i) => {
        const align = alignments[i] === 'text-center' ? 'center' : alignments[i] === 'text-right' ? 'right' : 'left';
        html += `  <td style="border: 1px solid #cbd5e1; padding: 10px 14px; text-align: ${align}; vertical-align: top; color: #0f172a; font-weight: 700; background-color: #f8fafc;">${formatCellForHtml(cell)}</td>\n`;
      });
      html += `</tr>\n`;
    }
    html += `</tbody>\n</table>`;

    // Generate clean Markdown table with pipes and alignment markers
    let mdTable = '';
    if (hasValidTable && headers.length > 0) {
      const sep = headers.map((_, i) => {
        const align = alignments[i];
        if (align === 'text-center') return ':---:';
        if (align === 'text-right') return '---:';
        return ':---';
      });
      const headerLine = `| ${headers.map(h => h.trim()).join(' | ')} |`;
      const sepLine = `| ${sep.join(' | ')} |`;
      const bodyLines = activeRows.map(r => `| ${r.map(c => (c || '').trim()).join(' | ')} |`);
      const allLines = [headerLine, sepLine, ...bodyLines];
      if (summaryRow && summaryRow.length > 0) {
        allLines.push(`| ${summaryRow.map(c => (c || '').trim()).join(' | ')} |`);
      }
      mdTable = allLines.join('\n');
    } else {
      mdTable = effectiveMarkdown.trim();
    }

    // TSV table for Sheets / Excel pasting
    const tsv = [
      headers.join('\t'),
      ...activeRows.map(r => r.map(c => (c || '').replace(/\[color:\w+\]/g, '').replace(/\[bar:\d+%?\]/g, '').replace(/[*_`]/g, '').trim()).join('\t')),
      ...(summaryRow ? [summaryRow.map(c => (c || '').replace(/\[color:\w+\]/g, '').replace(/\[bar:\d+%?\]/g, '').replace(/[*_`]/g, '').trim()).join('\t')] : [])
    ].join('\n');

    return { html, tsv, markdown: mdTable };
  };

  // Copy with rich HTML + Markdown plain text so pasting creates a formatted native table everywhere
  const handleCopyCodeForDocs = async () => {
    const textToCopy = isEditingCode ? customCodeInput : activeCodeDisplay;
    const { markdown: mdTable } = generateClipboardTableData();
    const tableToCopy = mdTable || textToCopy;

    try {
      await copyTableToClipboard(tableToCopy);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(tableToCopy);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } catch (err) {
        console.warn('Failed to copy table code:', err);
      }
    }
  };

  // Filter rows by search query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(row => row.some(cell => cell.toLowerCase().includes(q)));
  }, [rows, searchQuery]);

  // Sort rows numerically or alphabetically
  const sortedRows = useMemo(() => {
    if (sortCol === null) return filteredRows;
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const cellA = a[sortCol] || '';
      const cellB = b[sortCol] || '';

      const cleanA = cellA.replace(/[$€£¥,%\s*`_]/g, '');
      const cleanB = cellB.replace(/[$€£¥,%\s*`_]/g, '');
      const numA = parseFloat(cleanA);
      const numB = parseFloat(cleanB);

      let comp = 0;
      if (!isNaN(numA) && !isNaN(numB) && cleanA !== '' && cleanB !== '') {
        comp = numA - numB;
      } else {
        comp = cellA.localeCompare(cellB, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? comp : -comp;
    });
    return sorted;
  }, [filteredRows, sortCol, sortDir]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colIdx);
      setSortDir('asc');
    }
  };

  const handleCopyMarkdown = async () => {
    const { markdown: mdTable } = generateClipboardTableData();
    try {
      await copyTableToClipboard(mdTable);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(mdTable);
        setCopiedMd(true);
        setTimeout(() => setCopiedMd(false), 2000);
      } catch (err) {
        console.warn('Failed to copy table to clipboard:', err);
      }
    }
  };

  const handleOpenSheets = () => {
    if (hasValidTable && headers.length > 0) {
      const tsvRows: string[] = [headers.join('\t')];
      rows.forEach(r => {
        const cleaned = r.map(c => c.replace(/[*_`]/g, '').trim());
        tsvRows.push(cleaned.join('\t'));
      });
      if (summaryRow) {
        tsvRows.push(summaryRow.map(c => c.replace(/[*_`]/g, '').trim()).join('\t'));
      }
      navigator.clipboard.writeText(tsvRows.join('\n'));
    } else {
      navigator.clipboard.writeText(markdown);
    }
    setCopiedSheets(true);
    setTimeout(() => setCopiedSheets(false), 3000);
    window.open('https://sheets.new', '_blank');
  };

  const handleDownloadCsv = () => {
    let csvContent = '';
    if (hasValidTable && headers.length > 0) {
      const csvRows: string[] = [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')
      ];
      rows.forEach(r => {
        const rowStr = r.map(c => {
          const clean = c.replace(/[*_`]/g, '').trim();
          return `"${clean.replace(/"/g, '""')}"`;
        }).join(',');
        csvRows.push(rowStr);
      });
      if (summaryRow) {
        csvRows.push(summaryRow.map(c => `"${c.replace(/"/g, '""')}"`).join(','));
      }
      csvContent = csvRows.join('\n');
    } else {
      csvContent = markdown;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `table-canvas-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitAiPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    const promptToSend = `Regarding this table:\n\`\`\`markdown\n${markdown}\n\`\`\`\n\nRequest: ${aiPrompt.trim()}`;
    onEditWithAi(promptToSend, messageId);
    onClose();
  };

  const quickPromptChips = [
    '✦ Add Total & Average Row',
    '✦ Calculate Growth / % Change',
    '✦ Sort by Highest Value',
    '✦ Add Summary Insights',
    '✦ Convert into Visual Chart'
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#f8fafc] dark:bg-[#0c0d12] text-slate-900 dark:text-zinc-100 flex flex-col animate-in fade-in duration-200 select-none"
    >
      {/* Top Header Bar - Zero Borders */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-[#13141a] shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer active:scale-95 shrink-0 -ml-1 mr-0.5"
            title="Back to Chat (Esc)"
            aria-label="Back to Chat"
          >
            <ArrowLeft className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Table Canvas Studio
              </h1>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold shrink-0 whitespace-nowrap">
                Interactive Live View
              </span>
            </div>
            <p className="hidden xs:block text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate">
              {hasValidTable ? `${sortedRows.length} ${sortedRows.length === 1 ? 'row' : 'rows'} • ${headers.length} columns` : 'Formatted Data View'}
              {searchQuery && ` (filtered from ${rows.length})`}
            </p>
          </div>
        </div>

        {/* Center/Right Toolbar - Zero Borders */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Table Font Size Toggle: 2 font options (A+ and A++) in a single button */}
          <button
            type="button"
            onClick={() => handleSetFontSize(tableFontSize === 'large' ? 'xlarge' : 'large')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs select-none active:scale-95"
            title="Toggle table font size (A+ / A++)"
          >
            <span className={tableFontSize === 'large' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}>A+</span>
            <span className="text-slate-300 dark:text-zinc-600 text-[10px]">/</span>
            <span className={tableFontSize === 'xlarge' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500 font-normal'}>A++</span>
          </button>

          {/* Search Input */}
          {hasValidTable && (
            <div className="relative flex items-center min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search table..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-24 xs:w-32 sm:w-48 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Code Button */}
          <button
            type="button"
            onClick={() => setShowCodeDrawer(!showCodeDrawer)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 ${
              showCodeDrawer
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200'
            }`}
            title="Toggle Table Code & Live Editor"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-500" />
            <span>Code</span>
          </button>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="p-2 sm:px-3.5 sm:py-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Copy Table"
          >
            {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />}
            <span className="hidden md:inline">{copiedMd ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Desktop Zoom Controls (Hidden on Mobile, shown on Desktop md screens and up) */}
          <div className="hidden md:flex items-center p-0.5 rounded-full bg-slate-100 dark:bg-zinc-800/80">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.4, Number((prev - 0.2).toFixed(2))))}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Zoom Out (or Ctrl+Scroll / Pinch on mobile)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              title="Reset Zoom (100%)"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(3.0, Number((prev + 0.2).toFixed(2))))}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Zoom In (or Ctrl+Scroll / Pinch on mobile)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Full-Page Table Viewer and Side Code Drawer */}
      <div className="flex-1 overflow-hidden relative flex bg-white dark:bg-[#090a0f]">
        {/* Main Table Content with Pinch-to-Zoom and Pan Support */}
        <main 
          ref={mainContainerRef}
          className="flex-1 overflow-y-auto overflow-x-auto p-3 sm:p-6 lg:p-8 flex flex-col items-center select-text touch-pan-x touch-pan-y"
        >
          <div 
            className="w-full max-w-7xl min-w-0"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: zoomLevel < 1 ? 'top center' : 'top left',
              width: zoomLevel < 1 ? `${(100 / zoomLevel).toFixed(1)}%` : '100%',
              transition: isPinching ? 'none' : 'transform 0.15s ease-out'
            }}
          >
            <div 
              ref={tableRef}
              className="w-full min-w-0 bg-white dark:bg-[#090a0f]"
            >
            {hasValidTable && headers.length > 0 ? (
              <div className="w-full rounded-none border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-[#0c0d14] overflow-hidden shadow-xs">
                <div className="overflow-x-auto w-full max-w-full pb-1 touch-auto [scrollbar-width:thin] scrollbar-thin">
                  <table className={`w-full min-w-full text-left border-collapse ${TABLE_FONT_SIZE_CONFIG[tableFontSize].table}`}>
                    <thead className="bg-slate-50/90 dark:bg-[#12141c]/90 text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider select-none sticky top-0 z-10 border-b border-slate-200/70 dark:border-zinc-800/80 backdrop-blur-xs">
                      <tr>
                        {headers.map((head, idx) => {
                          const isSorted = sortCol === idx;
                          const isIndex = idx === 0 && (
                            /^(?:q|q\.|q#|#|no|no\.|s\.?no\.?|sr\.?no\.?|sl\.?no\.?|step|item|id|index|idx|question|question\s*no\.?|question\s*number|question\s*#|q\.?\s*no\.?|q\.?\s*#)$/i.test((head || '').replace(/[*_`#]/g, '').trim()) ||
                            /^(?:q|#|question)\s*\d+$/i.test((head || '').replace(/[*_`#]/g, '').trim()) ||
                            (rows.length > 0 && rows.every(r => /^(?:q|#|step|question)?\s*0?\d+$/i.test((r[0] || '').replace(/[*_`]/g, '').trim())))
                          );
                          const align = isIndex ? 'text-center' : (alignments[idx] || 'text-left');
                          const widthClass = isIndex 
                            ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 py-3 text-center shrink-0' 
                            : `${TABLE_FONT_SIZE_CONFIG[tableFontSize].th} ${TABLE_FONT_SIZE_CONFIG[tableFontSize].minColWidth}`;

                          return (
                            <th
                              key={idx}
                              onClick={() => handleSort(idx)}
                              className={`${widthClass} cursor-pointer hover:bg-slate-100/60 dark:hover:bg-zinc-800/50 transition-colors ${align}`}
                              title="Click to sort column"
                            >
                              <div className={`inline-flex items-center ${isIndex ? 'justify-center' : ''} gap-1.5 flex-wrap`}>
                                <MathRenderer content={head} isTableCell />
                                <span className={`no-export text-xs ${isSorted ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                                  {isSorted ? (
                                    sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                                  )}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40">
                      {sortedRows.length === 0 ? (
                        <tr>
                          <td colSpan={headers.length} className="text-center py-16 text-slate-400 dark:text-zinc-400 text-xs">
                            No matching records found for "{searchQuery}"
                          </td>
                        </tr>
                      ) : (
                        sortedRows.map((row, rIdx) => (
                          <tr 
                            key={rIdx} 
                            className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/20 transition-colors group"
                          >
                            {row.map((cell, cIdx) => {
                              const isEditingThisCell = editingCell?.rowIndex === rIdx && editingCell?.colIndex === cIdx;
                              const isIndex = cIdx === 0 && (
                                /^(?:q|q\.|q#|#|no|no\.|s\.?no\.?|sr\.?no\.?|sl\.?no\.?|step|item|id|index|idx|question|question\s*no\.?|question\s*number|question\s*#|q\.?\s*no\.?|q\.?\s*#)$/i.test((headers[0] || '').replace(/[*_`#]/g, '').trim()) ||
                                /^(?:q|#|question)\s*\d+$/i.test((headers[0] || '').replace(/[*_`#]/g, '').trim()) ||
                                (rows.length > 0 && rows.every(r => /^(?:q|#|step|question)?\s*0?\d+$/i.test((r[0] || '').replace(/[*_`]/g, '').trim())))
                              );
                              const align = isIndex ? 'text-center' : (alignments[cIdx] || 'text-left');
                              const cellWidthClass = isIndex
                                ? 'w-[48px] min-w-[48px] max-w-[64px] px-1.5 py-2.5 sm:py-3 text-center font-bold text-slate-900 dark:text-zinc-100 shrink-0'
                                : `${TABLE_FONT_SIZE_CONFIG[tableFontSize].td} ${TABLE_FONT_SIZE_CONFIG[tableFontSize].minColWidth} max-w-[480px] break-words`;

                              return (
                                <td 
                                  key={cIdx} 
                                  className={`${cellWidthClass} align-top text-slate-800 dark:text-zinc-200 ${align}`}
                                >
                                  {isEditingThisCell ? (
                                    <div className="space-y-2 min-w-[240px] max-w-full p-2.5 rounded-2xl bg-white dark:bg-[#12141c] border border-blue-500/80 shadow-md animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                                      {/* 1. Live Formula KaTeX Render Preview at top of edit mode */}
                                      <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-zinc-800/70 border border-slate-200/70 dark:border-zinc-700/60 shadow-2xs">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider mb-1">
                                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                                            <Sparkles className="w-3 h-3 text-blue-500" />
                                            <span>Live Formula Rendering</span>
                                          </div>
                                          <span className="text-[9.5px] font-mono lowercase text-slate-400 dark:text-zinc-500">esc: cancel • ↵: save</span>
                                        </div>
                                        <div className="text-xs sm:text-[13px] py-0.5 text-slate-900 dark:text-zinc-100 min-h-[24px] flex items-center">
                                          <MathRenderer content={editingValue || '-'} isTableCell />
                                        </div>
                                      </div>

                                      {/* 2. Sleek Monospace Input */}
                                      <textarea
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSaveEditCell();
                                          } else if (e.key === 'Escape') {
                                            setEditingCell(null);
                                          }
                                        }}
                                        rows={2}
                                        autoFocus
                                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#090a0f] text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-inner resize-y"
                                        placeholder="Formula or cell text (e.g. \Delta t = \sqrt{2h/g} or $x^2$)..."
                                      />

                                      {/* 3. Quick Math Symbol Helper Chips */}
                                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                                        {[
                                          { label: 'frac', insert: '\\frac{a}{b}' },
                                          { label: 'sqrt', insert: '\\sqrt{x}' },
                                          { label: 'x²', insert: '^2' },
                                          { label: 'x₀', insert: '_0' },
                                          { label: 'Δ', insert: '\\Delta ' },
                                          { label: 'λ', insert: '\\lambda ' },
                                          { label: 'θ', insert: '\\theta ' },
                                          { label: 'π', insert: '\\pi ' },
                                          { label: '±', insert: '\\pm ' },
                                          { label: '·', insert: '\\cdot ' },
                                          { label: '≈', insert: '\\approx ' }
                                        ].map((snip) => (
                                          <button
                                            key={snip.label}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              setEditingValue(prev => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + snip.insert);
                                            }}
                                            className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-mono hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-zinc-700 transition-colors cursor-pointer shrink-0"
                                            title={`Insert ${snip.insert}`}
                                          >
                                            {snip.label}
                                          </button>
                                        ))}
                                      </div>

                                      {/* 4. Action Buttons */}
                                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                                        <button
                                          type="button"
                                          onClick={() => setEditingCell(null)}
                                          className="px-2.5 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handleSaveEditCell}
                                          className="px-3.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
                                        >
                                          <Check className="w-3 h-3" />
                                          <span>Save Formula</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div 
                                      onClick={() => {
                                        const trimmed = (cell || '').trim();
                                        const isCheckbox = /^(\s*-\s*)?\[\s*([xX✓✔\s])\s*\](?:\s*(.*))?$/.test(trimmed);
                                        if (isCheckbox) {
                                          handleToggleCheckbox(rIdx, cIdx, cell);
                                        } else {
                                          handleStartEditCell(rIdx, cIdx, cell);
                                        }
                                      }} 
                                      className="cursor-pointer group/cell relative min-h-[26px] rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-slate-100/60 dark:hover:bg-zinc-800/40"
                                      title="Click to toggle status or edit formula"
                                    >
                                      {isIndex ? (
                                        <span className="inline-flex items-center justify-center font-semibold text-slate-800 dark:text-zinc-200">
                                          {cell.trim()}
                                        </span>
                                      ) : (
                                        <MathRenderer content={cell || ''} isTableCell />
                                      )}
                                      <span 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartEditCell(rIdx, cIdx, cell);
                                        }}
                                        className="opacity-0 group-hover/cell:opacity-100 absolute right-1 top-1 p-1 rounded-md text-slate-400 hover:text-blue-500 bg-white/90 dark:bg-zinc-800/90 shadow-2xs transition-opacity"
                                        title="Edit formula or cell content"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                      {/* Summary Row */}
                      {summaryRow && (
                        <tr className="bg-slate-50/90 dark:bg-[#1a1c26] font-bold">
                          {summaryRow.map((cell, cIdx) => (
                            <td 
                              key={cIdx} 
                              className={`${TABLE_FONT_SIZE_CONFIG[tableFontSize].td} align-top font-bold text-slate-900 dark:text-white ${TABLE_FONT_SIZE_CONFIG[tableFontSize].minColWidth} max-w-[480px] break-words ${alignments[cIdx] || 'text-left'}`}
                            >
                              <MathRenderer content={cell || ''} isTableCell />
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Fallback view: Full math/markdown render if table has custom format or prose */
              <div className="math-markdown-content text-slate-800 dark:text-zinc-200 text-sm leading-relaxed p-2 sm:p-4 overflow-x-auto w-full">
                <MathRenderer content={effectiveMarkdown} />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Side Code Drawer & Live Editor Panel */}
      {showCodeDrawer && (
        <aside className="absolute inset-0 z-20 sm:static sm:w-[420px] lg:w-[480px] bg-slate-50/90 dark:bg-[#11131a] p-3.5 sm:p-4 border-l border-slate-200/80 dark:border-zinc-800/80 flex flex-col shrink-0 text-xs font-mono overflow-hidden animate-in slide-in-from-right duration-200 shadow-xl sm:shadow-none">
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-zinc-800/60">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
              <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Table Source Code</span>
              {isEditingCode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  Editing
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCodeDrawer(false)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 text-xs cursor-pointer transition-colors"
              title="Close Code Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans">
              Google Docs & Markdown Compatible
            </span>

            {/* Action Buttons: Edit Code, Save to Notes & Copy Code */}
            <div className="flex items-center gap-1.5">
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
                <span>{isEditingCode ? 'Viewing' : 'Edit'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await saveSingleNoteToIDB({
                    id: `note_tbl_${Date.now()}`,
                    testId: 'notes_repository',
                    content: effectiveMarkdown || activeCodeDisplay,
                    tag: 'formula',
                    fileName: `Table Note ${new Date().toLocaleDateString()}.md`,
                    createdAt: new Date().toISOString(),
                  });
                  setIsSavedToNotes(true);
                  setTimeout(() => setIsSavedToNotes(false), 2500);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                  isSavedToNotes
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
                title="Save table to Notes Repository"
              >
                {isSavedToNotes ? <Check className="w-3.5 h-3.5 text-white" /> : <Bookmark className="w-3.5 h-3.5 text-white" />}
                <span>{isSavedToNotes ? 'Saved to Notes' : 'Save to Notes'}</span>
              </button>

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

          {/* Validation Error Alert */}
          {codeErrorMessage && (
            <div className="my-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{codeErrorMessage}</span>
            </div>
          )}

          {/* Code Body */}
          <div className="flex-1 overflow-y-auto py-1 flex flex-col">
            {isEditingCode ? (
              <div className="flex-1 flex flex-col space-y-2">
                <textarea
                  value={customCodeInput}
                  onChange={(e) => {
                    setCustomCodeInput(e.target.value);
                    if (codeErrorMessage) setCodeErrorMessage(null);
                  }}
                  rows={14}
                  placeholder="Enter table code (| Col 1 | Col 2 |)..."
                  className="flex-1 w-full p-3 rounded-none bg-slate-900 text-slate-100 dark:bg-[#0c0d12] text-[11px] font-mono overflow-auto leading-relaxed shadow-inner border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none scrollbar-thin"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Edit and apply to update the live canvas.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCodeInput(activeCodeDisplay);
                        setCodeErrorMessage(null);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#1f212a] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCustomCode}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Apply Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <pre className="flex-1 p-3.5 rounded-none bg-slate-900 text-slate-100 dark:bg-[#0c0d12] text-[11px] font-mono overflow-auto leading-relaxed shadow-inner scrollbar-thin whitespace-pre border border-slate-800">
                <code>{activeCodeDisplay}</code>
              </pre>
            )}
          </div>

          <div className="pt-2.5 text-[10px] text-slate-500 dark:text-zinc-500 flex items-center justify-between">
            <span>Supports live Markdown, JSON, HTML & CSV formatting</span>
            <span>Live Sync Active</span>
          </div>
        </aside>
      )}
    </div>

      {/* Bottom Floating AI Prompt Bar - Zero Borders */}
      <footer className="p-3 sm:p-4 bg-white dark:bg-[#13141a] shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Quick chips with thin borders */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="hidden xs:inline">Edit with AI:</span>
            </span>
            {quickPromptChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  const promptToSend = `Regarding this table:\n\`\`\`markdown\n${effectiveMarkdown}\n\`\`\`\n\nRequest: ${chip.replace('✦ ', '')}`;
                  onEditWithAi(promptToSend, messageId);
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50/80 dark:bg-zinc-800/80 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300 text-[11px] sm:text-xs font-medium border border-slate-200/80 dark:border-zinc-800 shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Prompt input with thin borders */}
          <form onSubmit={handleSubmitAiPrompt} className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ask Gemini to modify this table (e.g. add growth rate column, recalculate totals)..."
                className="w-full pl-4 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-2xl bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 border border-slate-200/80 dark:border-zinc-800 focus:outline-none focus:border-blue-500 shadow-xs transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!aiPrompt.trim()}
              className="px-4 py-2.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold border border-blue-500 shadow-xs flex items-center gap-1.5 transition-all text-xs sm:text-sm cursor-pointer active:scale-95 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Apply</span>
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
};
