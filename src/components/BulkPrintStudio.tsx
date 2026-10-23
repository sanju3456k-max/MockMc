import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Printer, 
  CheckSquare, 
  Square, 
  Search, 
  SlidersHorizontal, 
  FileText, 
  FileCheck2, 
  ArrowLeft, 
  Sparkles, 
  GripHorizontal, 
  ImageIcon, 
  Layers, 
  Camera, 
  CheckCircle2, 
  HelpCircle,
  Clock,
  BookOpen,
  X,
  Scissors,
  Grid,
  Maximize2,
  Layout,
  FileSpreadsheet,
  Plus,
  Trash2,
  Move,
  RotateCcw,
  Filter,
  Eye,
  ChevronDown,
  ChevronUp,
  Info,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MathTest } from '../types';
import { OmrQuestionPaper } from './OmrQuestionPaper';
import { OmrSheetGenerator } from './OmrSheetGenerator';
import { 
  triggerSystemPrint, 
  triggerOmrSheetPrint, 
  exportOmrSheetToPng,
  triggerMultiUpOmrPrint
} from '../lib/omrPrintDownload';
import { renderOmrSheetToCanvas } from '../lib/omrCanvasRenderer';
import { studioTabVariants, gpuAcceleratedStyle } from '../lib/animationConfig';
import { getOmrLayoutConfig } from '../lib/omrGeometry';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { APP_STYLES } from './ui/AppStyles';

// Calculate authentic cut dimension height percentage for a given question count on standard A4 (297mm)
const computeOmrCutHeightPercent = (questionCount: number): number => {
  const config = getOmrLayoutConfig(Math.max(1, questionCount));
  return Math.min(99, Math.max(15, Math.round((config.pageHeightMm / 297) * 100 * 10) / 10));
};

interface BulkPrintStudioProps {
  tests: MathTest[];
  onExit: () => void;
  onLaunchOmrScan?: (test: MathTest, initialTab?: 'print' | 'scan' | 'keys' | 'review') => void;
}

type BulkStudioTab = 'papers' | 'omr-sheets' | 'scan-launcher';

/**
 * Thumbnail generator for A4 Grid cells
 */
const OmrA4Thumbnail: React.FC<{
  questionCount: number;
  title: string;
  sheetFormat?: 'a4' | 'compact';
}> = ({ questionCount, title, sheetFormat = 'compact' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const format: 'a4' | 'compact' = sheetFormat === 'a4' ? 'a4' : 'compact';
      const rendered = renderOmrSheetToCanvas(
        Math.max(1, questionCount || 50),
        title,
        2.5,
        format
      );
      const canvas = canvasRef.current;
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(rendered, 0, 0);
      }
    } catch (err) {
      console.error('Error rendering OMR thumbnail:', err);
    }
  }, [questionCount, title, sheetFormat]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-0 bg-white overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full object-contain block" />
    </div>
  );
};

export const BulkPrintStudio: React.FC<BulkPrintStudioProps> = ({
  tests,
  onExit,
  onLaunchOmrScan,
}) => {
  const [activeTab, setActiveTab] = useState<BulkStudioTab>('papers');
  
  // Selection State - Defaulted to unselected so selection is according to need
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(() => new Set<string>());

  // Selected Tests List
  const selectedTests = useMemo(() => {
    return tests.filter(t => selectedTestIds.has(t.id));
  }, [tests, selectedTestIds]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isScanSearchExpanded, setIsScanSearchExpanded] = useState<boolean>(false);
  const [previewingPaperTest, setPreviewingPaperTest] = useState<MathTest | null>(null);

  // Lock background scroll when viewing full question paper
  // Guarantee clean scroll reset on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  useScrollLock(Boolean(previewingPaperTest));

  useBackHandler({
    isOpen: Boolean(previewingPaperTest),
    onBack: () => setPreviewingPaperTest(null),
    priority: 50,
    id: 'bulk_print_preview_fullview_back',
  });

  // Print Settings State
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [showQuestionPapers, setShowQuestionPapers] = useState<boolean>(false);

  // Universal OMR State (Defaulting to Universal Master OMR mode for custom sheet design)
  const [omrMode, setOmrMode] = useState<'selected' | 'universal'>('universal');
  const [universalQuestionCount, setUniversalQuestionCount] = useState<number>(30);
  const [customQuestionInput, setCustomQuestionInput] = useState<string>('30');
  const [hideUniversalTitle, setHideUniversalTitle] = useState<boolean>(false);
  const [customUniversalTitle, setCustomUniversalTitle] = useState<string>('');
  const [isOmrConfigOpen, setIsOmrConfigOpen] = useState<boolean>(true);

  // Page Orientation (Default portrait locked)
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Custom Draggable OMR Layout State with Multi-Page & Full A4 Width with Cutline Boundaries
  const [activePreviewPage, setActivePreviewPage] = useState<number>(1);
  const [customOmrItems, setCustomOmrItems] = useState<Array<{
    id: string;
    page: number; // 1-indexed page number (1, 2, 3...)
    x: number; // percentage (full A4 width = 0)
    y: number; // percentage 0 - 100
    width: number; // percentage (full A4 width = 100)
    height: number; // cut dimension percentage based on question count
    questionCount: number;
    title: string;
  }>>(() => {
    const initialH = computeOmrCutHeightPercent(30);
    return [
      { id: '1', page: 1, x: 0, y: 1.0, width: 100, height: initialH, questionCount: 30, title: '' }
    ];
  });
  const [selectedOmrId, setSelectedOmrId] = useState<string>('1');

  // Compute total pages in layout
  const maxPageNumber = useMemo(() => {
    if (customOmrItems.length === 0) return 1;
    return Math.max(1, ...customOmrItems.map(i => i.page || 1));
  }, [customOmrItems]);

  // Keep activePreviewPage within bounds
  useEffect(() => {
    if (activePreviewPage > maxPageNumber) {
      setActivePreviewPage(maxPageNumber);
    }
  }, [maxPageNumber, activePreviewPage]);

  // Container ref for pointer/drag tracking
  const a4ContainerRef = useRef<HTMLDivElement>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const customOmrItemsRef = useRef(customOmrItems);
  customOmrItemsRef.current = customOmrItems;

  const dragStartRef = useRef<{ mouseY: number; initialY: number; initialH: number }>({
    mouseY: 0, initialY: 0, initialH: 0
  });

  // Quick preset chips for question counts
  const PRESET_QUESTION_COUNTS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 120, 150, 200];

  // Topics extraction
  const topics = useMemo(() => {
    const set = new Set<string>();
    tests.forEach(t => {
      if (t.topic) set.add(t.topic);
    });
    return ['All', ...Array.from(set)];
  }, [tests]);

  // Filtered tests list
  const filteredTests = useMemo(() => {
    return tests.filter(t => {
      const matchSearch = searchQuery.trim() === '' || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.topic && t.topic.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchTopic = selectedTopic === 'All' || t.topic === selectedTopic;
      const matchDifficulty = selectedDifficulty === 'All' || t.difficulty === selectedDifficulty;
      return matchSearch && matchTopic && matchDifficulty;
    });
  }, [tests, searchQuery, selectedTopic, selectedDifficulty]);

  // Toggle single test selection
  const toggleTestSelection = (id: string) => {
    setSelectedTestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all filtered
  const toggleSelectAllFiltered = () => {
    const allFilteredSelected = filteredTests.every(t => selectedTestIds.has(t.id));
    setSelectedTestIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredTests.forEach(t => next.delete(t.id));
      } else {
        filteredTests.forEach(t => next.add(t.id));
      }
      return next;
    });
  };

  const handleCustomQuestionChange = (valStr: string) => {
    setCustomQuestionInput(valStr);
    const parsed = parseInt(valStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setUniversalQuestionCount(Math.min(200, Math.max(1, parsed)));
    }
  };

  const handlePresetQuestionClick = (count: number) => {
    setUniversalQuestionCount(count);
    setCustomQuestionInput(count.toString());
  };

  const tilesCount = customOmrItems.length;
  const paperSavedPercentage = tilesCount > 1 ? Math.round((1 - 1 / tilesCount) * 100) : 0;

  const handleMultiUpPrintAction = async () => {
    setIsPrinting(true);
    try {
      let items: Array<{ totalQuestions: number; title: string }> = [];

      if (omrMode === 'universal') {
        const titleToUse = hideUniversalTitle ? '' : customUniversalTitle;
        items = [{ totalQuestions: universalQuestionCount, title: titleToUse }];
      } else {
        if (selectedTests.length === 0) return;
        items = selectedTests.map(t => ({
          totalQuestions: t.questions?.length || 50,
          title: t.title,
        }));
      }

      await triggerMultiUpOmrPrint(items, {
        cols: 1,
        rows: Math.max(1, customOmrItems.length),
        orientation: pageOrientation,
        showCutLines: false,
        customItems: customOmrItems.length > 0 ? customOmrItems.map(ci => ({
          id: ci.id,
          page: ci.page || 1,
          x: ci.x,
          y: ci.y,
          width: ci.width,
          height: ci.height,
          totalQuestions: ci.questionCount,
          title: ci.title,
        })) : undefined,
      });
    } catch (err) {
      console.error('Error in multi-up print:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  // Unified Window-Level Pointer & Drag Handlers (Prevents mobile page scrolling while dragging)
  const handleItemStartDrag = (id: string, e: React.PointerEvent<HTMLDivElement> | React.MouseEvent | React.TouchEvent) => {
    // If user tapped a button (page shift, delete), do not trigger drag
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    e.stopPropagation();
    setSelectedOmrId(id);
    setDraggingItemId(id);

    let clientY = 0;
    if ('clientY' in e) {
      clientY = e.clientY;
    } else if ('touches' in e && e.touches.length > 0) {
      clientY = e.touches[0].clientY;
    }

    const item = customOmrItemsRef.current.find(i => i.id === id);
    if (item) {
      dragStartRef.current = {
        mouseY: clientY,
        initialY: item.y,
        initialH: item.height,
      };
    }
  };

  // Step nudge helper for precise pixel-level mobile adjustment
  const nudgeOmrItem = (id: string, deltaPercent: number) => {
    setCustomOmrItems(prev => {
      const item = prev.find(i => i.id === id);
      if (!item) return prev;
      const activePage = item.page || 1;
      const samePageItems = prev.filter(i => (i.page || 1) === activePage && i.id !== id);
      let minY = 0.5;
      let maxY = 99.5 - item.height;
      samePageItems.forEach(other => {
        if (other.y + other.height <= item.y + 0.1) {
          minY = Math.max(minY, other.y + other.height + 0.8);
        } else if (other.y >= item.y + item.height - 0.1) {
          maxY = Math.min(maxY, other.y - item.height - 0.8);
        }
      });
      const newY = Math.max(minY, Math.min(maxY, item.y + deltaPercent));
      return prev.map(i => i.id === id ? { ...i, y: Math.round(newY * 10) / 10 } : i);
    });
  };

  // Window-level dragging effect: locks native body scrolling and tracks drag movement smoothly
  useEffect(() => {
    if (!draggingItemId) return;

    // Prevent any webpage scrolling while dragging an OMR sheet on touch devices
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;
    const originalUserSelect = document.body.style.userSelect;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (e: PointerEvent | MouseEvent | TouchEvent) => {
      if (!a4ContainerRef.current) return;
      const rect = a4ContainerRef.current.getBoundingClientRect();
      if (rect.height === 0) return;

      let clientY = 0;
      if ('clientY' in e) {
        clientY = e.clientY;
      } else if ('touches' in e && e.touches.length > 0) {
        clientY = e.touches[0].clientY;
      } else {
        return;
      }

      // Calculate vertical movement percentage on A4 canvas
      const deltaY = ((clientY - dragStartRef.current.mouseY) / rect.height) * 100;

      const activeItem = customOmrItemsRef.current.find(i => i.id === draggingItemId);
      if (!activeItem) return;

      const itemH = activeItem.height;
      const requestedY = dragStartRef.current.initialY + deltaY;

      // Filter items on the SAME page to apply vertical collision resistance
      const activePage = activeItem.page || 1;
      const samePageItems = customOmrItemsRef.current.filter(i => (i.page || 1) === activePage && i.id !== draggingItemId);

      let minY = 0.5;
      let maxY = 99.5 - itemH;

      samePageItems.forEach(other => {
        // If other item is positioned ABOVE active item
        if (other.y + other.height <= dragStartRef.current.initialY + 0.1) {
          minY = Math.max(minY, other.y + other.height + 0.8);
        }
        // If other item is positioned BELOW active item
        else if (other.y >= dragStartRef.current.initialY + dragStartRef.current.initialH - 0.1) {
          maxY = Math.min(maxY, other.y - itemH - 0.8);
        }
        // Fallback relative placement
        else if (other.y < dragStartRef.current.initialY) {
          minY = Math.max(minY, other.y + other.height + 0.8);
        } else {
          maxY = Math.min(maxY, other.y - itemH - 0.8);
        }
      });

      const clampedY = Math.max(minY, Math.min(maxY, requestedY));

      setCustomOmrItems(prev => prev.map(item => {
        if (item.id !== draggingItemId) return item;
        return {
          ...item,
          x: 0, // Full A4 width
          width: 100,
          y: Math.round(clampedY * 10) / 10,
        };
      }));
    };

    const handlePointerUp = () => {
      setDraggingItemId(null);
    };

    // Extra touchmove preventDefault safeguard for iOS Safari & Android
    const handleTouchMovePrevent = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handleTouchMovePrevent, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
      document.body.style.userSelect = originalUserSelect;

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMovePrevent);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [draggingItemId]);

  // Add OMR Item: if active page cannot fit the new sheet's cutline dimension, automatically create a NEW PAGE!
  const addOmrItem = () => {
    let qCount = universalQuestionCount;
    let titleToDisplay = hideUniversalTitle ? '' : customUniversalTitle;
    if (omrMode === 'selected' && selectedTests.length > 0) {
      const last = selectedTests[customOmrItems.length % selectedTests.length];
      qCount = last.questions?.length || 50;
      titleToDisplay = last.title;
    }

    const cutH = computeOmrCutHeightPercent(qCount);
    const targetPage = activePreviewPage;
    const pageItems = customOmrItems.filter(i => (i.page || 1) === targetPage);

    let assignedPage = targetPage;
    let assignedY = 1.0;

    if (pageItems.length > 0) {
      const maxYOnPage = Math.max(...pageItems.map(i => i.y + i.height));
      const gap = 1.5;
      if (maxYOnPage + gap + cutH <= 99.5) {
        assignedY = Math.round((maxYOnPage + gap) * 10) / 10;
      } else {
        // Space is full on active page! Automatically create next page
        assignedPage = maxPageNumber + 1;
        assignedY = 1.0;
      }
    }

    const newItem = {
      id: `omr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      page: assignedPage,
      x: 0,
      y: assignedY,
      width: 100,
      height: cutH,
      questionCount: qCount,
      title: titleToDisplay,
    };

    setCustomOmrItems(prev => [...prev, newItem]);
    setSelectedOmrId(newItem.id);
    setActivePreviewPage(assignedPage);
  };

  const removeOmrItem = (id: string) => {
    setCustomOmrItems(prev => {
      const next = prev.filter(i => i.id !== id);
      if (next.length > 0) setSelectedOmrId(next[0].id);
      return next;
    });
  };

  const moveOmrToPage = (id: string, targetPage: number) => {
    setCustomOmrItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        page: targetPage,
        y: 1.0, // Reset to top of target page
      };
    }));
    setActivePreviewPage(targetPage);
  };

  const autoStackVerticallyOnActivePage = () => {
    const pageItems = customOmrItems
      .filter(i => (i.page || 1) === activePreviewPage)
      .sort((a, b) => a.y - b.y);
    const count = pageItems.length;
    if (count === 0) return;

    const totalSheetsHeight = pageItems.reduce((acc, item) => acc + item.height, 0);
    const remainingSpace = Math.max(0, 100 - totalSheetsHeight);
    const gap = remainingSpace / (count + 1);

    let currentY = gap;
    const updatedPositions = new Map<string, number>();

    pageItems.forEach(item => {
      updatedPositions.set(item.id, Math.round(currentY * 10) / 10);
      currentY += item.height + gap;
    });

    setCustomOmrItems(prev => prev.map(item => {
      if (updatedPositions.has(item.id)) {
        return {
          ...item,
          x: 0,
          width: 100,
          y: updatedPositions.get(item.id)!,
        };
      }
      return item;
    }));
  };

  // Summary Metrics
  const totalQuestions = useMemo(() => {
    return selectedTests.reduce((acc, t) => acc + (t.questions?.length || 0), 0);
  }, [selectedTests]);

  const totalMarks = useMemo(() => {
    return selectedTests.reduce((acc, t) => {
      return acc + ((t.questions || []).reduce((qAcc, q) => qAcc + (q.points || 1), 0) || t.questionCount || 0);
    }, 0);
  }, [selectedTests]);

  // Print Handler
  const handleBulkPrintPapers = async () => {
    if (selectedTests.length === 0) return;
    setIsPrinting(true);
    try {
      await triggerSystemPrint(
        'bulk-question-papers-render-root',
        `Bulk_Question_Papers_${selectedTests.length}_Tests_A4`,
        210,
        297
      );
    } catch (err) {
      console.error('Error printing bulk papers:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBulkPrintOmrSheets = async () => {
    if (omrMode === 'selected') {
      if (selectedTests.length === 0) return;
      setIsPrinting(true);
      try {
        await triggerSystemPrint(
          'bulk-omr-sheets-render-root',
          `Bulk_OMR_Sheets_${selectedTests.length}_Tests_A4`,
          210,
          297
        );
      } catch (err) {
        console.error('Error printing bulk OMR sheets:', err);
      } finally {
        setIsPrinting(false);
      }
    } else {
      const titleToUse = hideUniversalTitle ? '' : customUniversalTitle;
      await triggerOmrSheetPrint(universalQuestionCount, titleToUse);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 h-[100dvh] max-h-screen pb-[calc(max(0.5rem,env(safe-area-inset-bottom,0px)))] overflow-hidden flex flex-col z-40 font-sans"
    >
      {/* Top Bar Navigation - Matched with Attempt OMR Mode */}
      <header className="px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] pb-2 flex items-center justify-between shrink-0 z-30 bg-transparent">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#21222e] text-slate-800 dark:text-zinc-100 hover:bg-slate-100 dark:hover:bg-[#282a39] flex items-center justify-center transition-all active:scale-95 border-0 ring-0 outline-none shadow-xs cursor-pointer shrink-0"
            title="Exit OMR Print Studio"
          >
            <ArrowLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-zinc-100">
            OMR Print Studio
          </span>
        </div>
      </header>

      {/* Mode Navigation Tabs - Styled matching OMR Exam Studio */}
      <div className="bg-transparent px-3 sm:px-6 pb-2 shrink-0 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-center gap-1.5 bg-white dark:bg-[#21222e] p-1.5 rounded-full border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('papers')}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] border-0 ring-0 outline-none shrink-0 ${
              activeTab === 'papers'
                ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#222634]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">Papers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('omr-sheets')}
            className={`flex-[1.2] sm:flex-1 min-w-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] border-0 ring-0 outline-none shrink-0 ${
              activeTab === 'omr-sheets'
                ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#222634]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">OMR Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scan-launcher')}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] border-0 ring-0 outline-none shrink-0 ${
              activeTab === 'scan-launcher'
                ? 'bg-emerald-600 text-white shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#222634]'
            }`}
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">Scan</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-[1500px] w-full mx-auto">
        {/* ========================================================
            TAB 1: BULK QUESTION PAPERS
            ======================================================== */}
        {activeTab === 'papers' && (
          <div className="space-y-4">
            {/* Top Toolbar & Filter Controls */}
            <div className="bg-white dark:bg-[#1e2024] p-4 sm:p-5 rounded-[28px] border-0 ring-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                {/* Left End: All Topics Filter & Select All */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* All Topics Filter at left end */}
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="max-w-[120px] sm:max-w-[150px] truncate px-3.5 py-1.5 bg-[#eaedf3] dark:bg-[#222634] border-0 ring-0 rounded-full text-xs font-bold text-slate-800 dark:text-zinc-200 focus:outline-none cursor-pointer shadow-none"
                  >
                    {topics.map(tp => (
                      <option key={tp} value={tp}>{tp === 'All' ? 'All Topics' : tp}</option>
                    ))}
                  </select>

                  {/* Select All Button */}
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-800 dark:text-zinc-200 rounded-full text-xs font-extrabold transition-all cursor-pointer active:scale-95 shrink-0 border-0 ring-0 outline-none shadow-none"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Select All</span>
                  </button>
                </div>

                {/* Right End: Search Button / Expandable Search */}
                <div className="flex items-center justify-end flex-1 max-w-xs ml-auto">
                  {!isSearchExpanded && !searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setIsSearchExpanded(true)}
                      className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-200 flex items-center justify-center cursor-pointer transition-all border-0 ring-0 outline-none shrink-0 shadow-none"
                      title="Search tests"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="relative w-full flex items-center">
                      <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus={isSearchExpanded}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tests..."
                        className="w-full pl-8 pr-7 py-1.5 bg-[#eaedf3] dark:bg-[#222634] border-0 ring-0 shadow-none rounded-full text-xs font-medium text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setIsSearchExpanded(false);
                        }}
                        className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Selection Summary Banner & Print CTA */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap text-xs font-bold">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-extrabold border-0 ring-0">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{selectedTests.length} Selected</span>
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#eaedf3] dark:bg-[#222634] text-slate-700 dark:text-zinc-300 font-bold border-0 ring-0">
                    {totalQuestions} Qs
                  </span>
                  <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold border-0 ring-0">
                    {totalMarks} Marks
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-between sm:justify-end">
                  {/* Include Solutions Checkbox */}
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeSolutions}
                      onChange={(e) => setIncludeSolutions(e.target.checked)}
                      className="rounded text-[#0b57d0] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Solutions</span>
                  </label>

                  {/* Bulk Print Button */}
                  <button
                    type="button"
                    onClick={handleBulkPrintPapers}
                    disabled={selectedTests.length === 0 || isPrinting}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] disabled:opacity-50 rounded-full text-xs font-extrabold transition-all duration-150 border-0 ring-0 outline-none shadow-sm shadow-[#0b57d0]/25 active:scale-[0.97] cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isPrinting ? 'Preparing...' : `Print Papers (${selectedTests.length})`}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Test Selection Grid - Matched with Home Screen Test List Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
              {filteredTests.map((test) => {
                const isSelected = selectedTestIds.has(test.id);
                const qCount = test.questions?.length || 0;
                const marks = (test.questions || []).reduce((acc, q) => acc + (q.points || 1), 0) || test.questionCount || 0;

                return (
                  <div
                    key={test.id}
                    onClick={() => toggleTestSelection(test.id)}
                    className={`p-3.5 sm:p-4 rounded-[28px] transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5 border-0 ring-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-md ${
                      isSelected
                        ? 'bg-blue-50/90 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 ring-2 ring-[#0b57d0]'
                        : 'bg-white dark:bg-[#1e2024] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e]'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10.5px] sm:text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider truncate block">
                        {test.topic || 'General Math'}
                      </span>
                      <h4 className="text-[17px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] line-clamp-2 leading-snug tracking-tight">
                        {test.title}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-0 ring-0">
                      <div className="flex items-center gap-2.5 text-xs text-[#5e5e5e] dark:text-[#c4c7c5] font-medium">
                        <div className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>{qCount} Qs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{marks} Mks</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Always visible Eye Button to view question paper */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewingPaperTest(test);
                          }}
                          className="w-8 h-8 rounded-full bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer border-0 ring-0 outline-none shrink-0 shadow-none"
                          title="View Question Paper"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Round Select Checkmark Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTestSelection(test.id);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all border-0 ring-0 outline-none cursor-pointer ${
                            isSelected 
                              ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs' 
                              : 'bg-[#eaedf3] dark:bg-[#222634] text-slate-400 hover:bg-slate-200 dark:hover:bg-[#2c3245]'
                          }`}
                          title={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTests.length === 0 && (
              <div className="p-10 bg-white dark:bg-[#21222e] rounded-2xl sm:rounded-3xl text-center space-y-2 border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">No tests found matching search criteria</p>
                <p className="text-xs text-slate-400">Try clearing search keywords or filters</p>
              </div>
            )}

            {/* Printable Container Render Root & Dropdown Preview Interface */}
            <div id="bulk-question-papers-render-root" className="space-y-6 pt-2">
              {/* On-screen Dropdown Preview Interface */}
              <AnimatePresence>
                {showQuestionPapers && selectedTests.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden print:hidden"
                  >
                    <div className="p-4 sm:p-5 bg-white dark:bg-[#21222e] rounded-2xl sm:rounded-3xl border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl transition-all duration-200 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                              Selected Question Papers Preview ({selectedTests.length} Papers)
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-zinc-400">
                              Viewing authentic 2-column examination paper layouts formatted for standard A4
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowQuestionPapers(false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eaedf3] dark:bg-[#222634] hover:bg-slate-200 dark:hover:bg-[#2c3245] text-slate-600 dark:text-zinc-300 rounded-full text-xs font-semibold self-start sm:self-auto cursor-pointer border-0 ring-0 shadow-none"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Collapse Preview</span>
                        </button>
                      </div>

                      {/* Stacked Paper Previews */}
                      <div className="space-y-8">
                        {selectedTests.map((t, idx) => (
                          <div key={t.id} className="space-y-3 pb-6 border-b last:border-b-0 border-slate-100 dark:border-zinc-800/80">
                            <div className="flex items-center justify-between px-2 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                              <span className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] flex items-center justify-center text-[10px] font-bold">
                                  {idx + 1}
                                </span>
                                <span>{t.title}</span>
                              </span>
                              <span className="text-slate-400 font-normal">
                                {t.questions?.length || 0} Questions &bull; {t.topic || 'General'}
                              </span>
                            </div>
                            <div className="overflow-x-auto pb-2 flex justify-center">
                              <OmrQuestionPaper test={t} hideHeaderContainer={true} showSolutions={includeSolutions} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hidden Print Target (Always rendered for triggerSystemPrint cloning even when dropdown is closed on screen) */}
              <div className="hidden print:block space-y-6">
                {selectedTests.map((t, idx) => (
                  <div key={t.id} className="space-y-4">
                    <OmrQuestionPaper test={t} hideHeaderContainer={true} showSolutions={includeSolutions} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: OMR SHEETS GENERATOR (Space Optimization & Universal)
            ======================================================== */}
        {activeTab === 'omr-sheets' && (
          <div className="space-y-4">
            {/* Top OMR Controls */}
            <div className="bg-white dark:bg-[#21222e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                {/* Mode Selector - Minimal "Selected" and "Universal OMR" buttons & Dropdown Toggle */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-[#eaedf3] dark:bg-[#222634] p-1 rounded-full border-0 ring-0 shadow-none">
                    <button
                      type="button"
                      onClick={() => setOmrMode('selected')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 shadow-none outline-none ${
                        omrMode === 'selected'
                          ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Selected ({selectedTests.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOmrMode('universal')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 shadow-none outline-none ${
                        omrMode === 'universal'
                          ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Universal OMR
                    </button>
                  </div>

                  {/* Header Card Interface Dropdown Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsOmrConfigOpen(prev => !prev)}
                    className="flex items-center gap-1 px-3.5 py-1.5 bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-300 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 shadow-none"
                    title={isOmrConfigOpen ? "Collapse options" : "Expand options"}
                  >
                    <span>{isOmrConfigOpen ? 'Hide' : 'Options'}</span>
                    {isOmrConfigOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Universal Mode Configuration & Options */}
              <AnimatePresence>
                {isOmrConfigOpen && omrMode === 'universal' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 bg-[#eaedf3] dark:bg-[#222634] p-4 sm:p-5 rounded-2xl border-0 ring-0 shadow-none">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {/* Custom Question Count Input */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                            <span>Question Count (1 - 200):</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={200}
                              value={customQuestionInput}
                              onChange={(e) => handleCustomQuestionChange(e.target.value)}
                              className="w-full px-3.5 py-2 bg-white dark:bg-[#21222e] border-0 ring-0 rounded-full text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none shadow-none"
                            />
                            <span className="text-xs font-bold text-slate-500 shrink-0">Qs</span>
                          </div>
                        </div>

                        {/* Header Title Customization */}
                        <div className="space-y-1 md:col-span-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                              Exam Header Title:
                            </label>
                            <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-zinc-400 font-semibold cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={hideUniversalTitle}
                                onChange={(e) => setHideUniversalTitle(e.target.checked)}
                                className="rounded text-[#0b57d0] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                              />
                              <span>Blank Header</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            disabled={hideUniversalTitle}
                            value={customUniversalTitle}
                            onChange={(e) => setCustomUniversalTitle(e.target.value)}
                            placeholder="e.g. MATHEMATICS GENERAL EVALUATION"
                            className="w-full px-4 py-2 bg-white dark:bg-[#21222e] border-0 ring-0 rounded-full text-xs font-medium text-slate-900 dark:text-zinc-100 disabled:opacity-40 outline-none shadow-none"
                          />
                        </div>
                      </div>

                      {/* Preset Chips */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Quick Presets:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {PRESET_QUESTION_COUNTS.map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => handlePresetQuestionClick(cnt)}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 outline-none shadow-none ${
                                universalQuestionCount === cnt
                                  ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                                  : 'bg-white dark:bg-[#21222e] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#2c3245]'
                              }`}
                            >
                              {cnt} Qs
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* OMR Studio Toolbar & Print Actions Bar - Compact Layout with PDF & Print at Right End */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80 w-full">
                {/* Left: Compact Add OMR and Auto Buttons */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                  <button
                    type="button"
                    onClick={addOmrItem}
                    className="flex items-center gap-1 px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-full text-xs font-bold cursor-pointer transition-all shadow-sm shadow-[#0b57d0]/25 active:scale-95 shrink-0 border-0 ring-0"
                    title={`Add new ${universalQuestionCount}-question OMR Sheet`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add OMR</span>
                  </button>

                  <button
                    type="button"
                    onClick={autoStackVerticallyOnActivePage}
                    className="flex items-center gap-1 px-4 py-2 bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-300 rounded-full text-xs font-bold cursor-pointer transition-all shrink-0 border-0 ring-0 shadow-none"
                    title="Evenly auto-distribute spacing between sheets"
                  >
                    <Layout className="w-3.5 h-3.5" />
                    <span>Auto</span>
                  </button>

                  {tilesCount > 1 && (
                    <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] text-xs font-bold shrink-0 border-0 ring-0 shadow-none">
                      {tilesCount} Sheets ({paperSavedPercentage}% Saved)
                    </span>
                  )}
                </div>

                {/* Right End: Compact Print Button */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={handleMultiUpPrintAction}
                    disabled={isPrinting || customOmrItems.length === 0}
                    className="flex items-center gap-1 sm:gap-1.5 px-5 py-2 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] disabled:opacity-50 text-white dark:text-[#041e49] rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm shadow-[#0b57d0]/25 shrink-0 border-0 ring-0"
                    title="Print OMR Sheets"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isPrinting ? 'Preparing...' : 'Print'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Live A4 Paper Space Multi-Page Canvas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300 px-1 flex-wrap gap-2">
                <span className="flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <span>A4 Canvas &bull; Page {activePreviewPage} of {maxPageNumber}</span>
                </span>

                <span className="text-[11px] text-slate-400 font-medium">
                  Drag sheets vertically to customize spacing
                </span>
              </div>

              {/* Multi-Page Navigation Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 px-1">
                {Array.from({ length: maxPageNumber }, (_, idx) => idx + 1).map(pNum => {
                  const pageItemCount = customOmrItems.filter(i => (i.page || 1) === pNum).length;
                  const isCurrent = activePreviewPage === pNum;
                  return (
                    <button
                      key={pNum}
                      type="button"
                      onClick={() => setActivePreviewPage(pNum)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border-0 ring-0 outline-none cursor-pointer shrink-0 shadow-none ${
                        isCurrent
                          ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                          : 'bg-white dark:bg-[#21222e] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#20222e]'
                      }`}
                    >
                      <span>Page {pNum}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isCurrent ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-[#222634] text-slate-600 dark:text-zinc-400'
                      }`}>
                        {pageItemCount}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const newPage = maxPageNumber + 1;
                    setActivePreviewPage(newPage);
                  }}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white dark:bg-[#21222e] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-[#20222e] transition-all border-0 ring-0 shadow-none outline-none cursor-pointer shrink-0"
                  title="Create a new A4 page"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Page</span>
                </button>
              </div>

              {/* Authentic A4 Paper Sheet (Canvas with Pure A4 Dimensions) */}
              <div className="w-full flex justify-center py-2 select-none overflow-x-auto">
                <div 
                  ref={a4ContainerRef}
                  style={{
                    width: '100%',
                    maxWidth: '680px',
                    touchAction: draggingItemId ? 'none' : 'auto',
                  }}
                  className={`bg-white text-slate-900 rounded-none p-0 relative overflow-hidden transition-all duration-300 border border-slate-300 dark:border-zinc-800 shadow-none ring-0 aspect-[210/297] ${
                    draggingItemId ? 'touch-none select-none' : ''
                  }`}
                >
                  {/* Subtle Grid Dot Canvas Overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

                  {/* Clean A4 Page Dimension Marker */}
                  <div className="absolute top-2 left-3 pointer-events-none text-[10px] font-mono font-bold tracking-wider text-slate-300 select-none">
                    A4 &bull; 210 &times; 297 mm &bull; Page {activePreviewPage} of {maxPageNumber}
                  </div>

                  {/* Render items belonging to activePreviewPage */}
                  {customOmrItems.filter(i => (i.page || 1) === activePreviewPage).length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                      <Scissors className="w-8 h-8 mb-2 opacity-50 text-slate-300" />
                      <p className="text-xs font-bold text-slate-500">Page {activePreviewPage} is empty</p>
                      <button
                        type="button"
                        onClick={addOmrItem}
                        className="mt-3 px-4 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-xl text-xs font-bold cursor-pointer border-0 shadow-none ring-0 transition-all"
                      >
                        Add {universalQuestionCount} Qs OMR Sheet to Page {activePreviewPage}
                      </button>
                    </div>
                  ) : (
                    customOmrItems
                      .filter(cItem => (cItem.page || 1) === activePreviewPage)
                      .map((cItem) => {
                        const isSelected = selectedOmrId === cItem.id;
                        const curPage = cItem.page || 1;
                        return (
                          <div
                            key={cItem.id}
                            onPointerDown={(e) => {
                              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                              handleItemStartDrag(cItem.id, e);
                            }}
                            onMouseDown={(e) => handleItemStartDrag(cItem.id, e)}
                            onTouchStart={(e) => handleItemStartDrag(cItem.id, e)}
                            onClick={(e) => { e.stopPropagation(); setSelectedOmrId(cItem.id); }}
                            style={{
                              left: '0%',
                              top: `${cItem.y}%`,
                              width: '100%',
                              height: `${cItem.height}%`,
                              touchAction: 'none',
                              userSelect: 'none',
                            }}
                            className={`absolute cursor-ns-resize overflow-hidden group p-0 bg-white select-none touch-none ${
                              isSelected 
                                ? 'border-2 border-[#0b57d0] z-20 shadow-md ring-0' 
                                : 'hover:border hover:border-slate-400 z-10'
                            }`}
                          >
                            {/* OMR Canvas Thumbnail */}
                            <div className="w-full h-full overflow-hidden bg-white pointer-events-none">
                              <OmrA4Thumbnail
                                questionCount={cItem.questionCount}
                                title={cItem.title}
                                sheetFormat="compact"
                              />
                            </div>

                            {/* Center Drag Handle Visual Indicator */}
                            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-900/80 text-white text-[9px] font-bold backdrop-blur-xs z-30 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                              <GripHorizontal className="w-3 h-3 text-sky-400" />
                              <span className="hidden sm:inline">Drag to move</span>
                            </div>

                            {/* Top-Right Badge: Question count indicator */}
                            <div className="absolute top-1.5 right-2 flex items-center gap-1 z-30 pointer-events-none">
                              <span className="px-2 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-mono font-bold backdrop-blur-xs shadow-none">
                                {cItem.questionCount} Qs
                              </span>
                            </div>

                            {/* Single-tap Precision Nudge Controls (ideal for mobile touch) */}
                            {isSelected && (
                              <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5 z-30 bg-slate-900/90 text-white rounded-full p-0.5 text-[10px] font-bold backdrop-blur-xs shadow-none">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    nudgeOmrItem(cItem.id, -2);
                                  }}
                                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-700 active:scale-90 transition-all cursor-pointer border-0 shadow-none ring-0 text-white text-xs"
                                  title="Nudge Up 2%"
                                >
                                  ▲
                                </button>
                                <span className="text-[9px] font-mono px-1 select-none text-slate-300">
                                  {Math.round(cItem.y)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    nudgeOmrItem(cItem.id, 2);
                                  }}
                                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-700 active:scale-90 transition-all cursor-pointer border-0 shadow-none ring-0 text-white text-xs"
                                  title="Nudge Down 2%"
                                >
                                  ▼
                                </button>
                              </div>
                            )}

                            {/* Corner Quick Control Buttons (Shift to Previous Page, Shift to Next Page, and Delete) */}
                            <div className="absolute top-1.5 left-2 flex items-center gap-1 z-30">
                              {curPage > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveOmrToPage(cItem.id, curPage - 1);
                                  }}
                                  className="px-2 py-0.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-bold backdrop-blur-xs transition-all cursor-pointer border-0 shadow-none ring-0"
                                  title={`Shift to Page ${curPage - 1}`}
                                >
                                  &lsaquo; P{curPage - 1}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveOmrToPage(cItem.id, curPage + 1);
                                }}
                                className="px-2 py-0.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-bold backdrop-blur-xs transition-all cursor-pointer border-0 shadow-none ring-0"
                                title={`Shift to Page ${curPage + 1}`}
                              >
                                P{curPage + 1} &rsaquo;
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeOmrItem(cItem.id);
                                }}
                                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all cursor-pointer border-0 shadow-none ring-0"
                                title="Remove Sheet"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            {/* Hidden printable root for high-res system printing */}
            <div id="bulk-omr-sheets-render-root" className="hidden" />
          </div>
        )}

        {/* ========================================================
            TAB 3: SCAN (Dedicated Test Views with Direct Scan Launch Buttons)
            ======================================================== */}
        {activeTab === 'scan-launcher' && (
          <div className="space-y-4">
            {/* Minimal Search & Topic Toolbar */}
            <div className="bg-white dark:bg-[#21222e] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-between gap-2">
              {/* Topic Filter Button */}
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="max-w-[130px] sm:max-w-[160px] truncate px-3.5 py-1.5 bg-[#eaedf3] dark:bg-[#222634] rounded-full text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none border-0 ring-0 cursor-pointer shrink-0 shadow-none"
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'All Topics' : t}
                  </option>
                ))}
              </select>

              {/* Expandable Search Button / Field */}
              <div className="flex items-center justify-end flex-1 max-w-xs ml-auto">
                {!isScanSearchExpanded && !searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setIsScanSearchExpanded(true)}
                    className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-200 flex items-center justify-center cursor-pointer transition-all border-0 ring-0 shrink-0 shadow-none outline-none"
                    title="Search tests for scanning"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="relative w-full flex items-center">
                    <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus={isScanSearchExpanded}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tests..."
                      className="w-full pl-8 pr-7 py-1.5 bg-[#eaedf3] dark:bg-[#222634] border-0 ring-0 rounded-full text-xs font-medium text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none shadow-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setIsScanSearchExpanded(false);
                      }}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Test Cards View with Scan Buttons - Matched with Home Screen Test List Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
              {filteredTests.map((test) => {
                const qCount = test.questions?.length || 0;
                const marks = (test.questions || []).reduce((acc, q) => acc + (q.points || 1), 0) || test.questionCount || 0;

                return (
                  <div
                    key={test.id}
                    onClick={() => onLaunchOmrScan && onLaunchOmrScan(test, 'scan')}
                    className="p-3.5 sm:p-4 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e] transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5 border-0 ring-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-md group"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10.5px] sm:text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider truncate block">
                        {test.topic || 'General Math'}
                      </span>

                      <h4 className="text-[18px] sm:text-[18px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors line-clamp-2 leading-snug tracking-tight">
                        {test.title}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-0 ring-0">
                      <div className="flex items-center gap-2.5 text-xs text-[#5e5e5e] dark:text-[#c4c7c5] font-medium">
                        <div className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>{qCount} Qs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{marks} Mks</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Always visible Eye Button to view question paper */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewingPaperTest(test);
                          }}
                          className="w-8 h-8 rounded-full bg-[#eaedf3] hover:bg-slate-200 dark:bg-[#222634] dark:hover:bg-[#2c3245] text-slate-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer border-0 ring-0 outline-none shrink-0 shadow-none"
                          title="View Question Paper"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchOmrScan && onLaunchOmrScan(test, 'scan');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full text-xs font-bold transition-all shadow-2xs border-0 ring-0 shrink-0 cursor-pointer"
                          title={`Launch camera scanner for ${test.title}`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Scan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTests.length === 0 && (
              <div className="p-12 bg-white dark:bg-[#21222e] rounded-2xl sm:rounded-3xl text-center space-y-2 border-0 ring-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <Camera className="w-8 h-8 mx-auto text-slate-300 opacity-60" />
                <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">No tests found for scanning</p>
                <p className="text-xs text-slate-400">Try adjusting your search terms or filters above</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Individual Question Paper Full View - Open full viewport, not card container */}
      <AnimatePresence>
        {previewingPaperTest && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 w-screen h-screen flex flex-col bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 overflow-hidden"
          >
            {/* Clean Top Navigation Bar - Matching main body background without white header & no duplicate X button */}
            <header className="px-3 sm:px-6 py-3 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 flex items-center justify-between gap-3 shrink-0 z-20 shadow-none">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setPreviewingPaperTest(null)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-slate-900 dark:text-zinc-100 flex items-center justify-center transition-all cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:scale-95 shrink-0"
                  title="Back to Studio Cards"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-zinc-100 truncate">
                    {previewingPaperTest.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
                    <span>{previewingPaperTest.topic || 'General Math'}</span>
                    <span>&bull;</span>
                    <span>{previewingPaperTest.questions?.length || 0} Questions</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerSystemPrint(
                      `single-test-paper-${previewingPaperTest.id}`,
                      `${previewingPaperTest.title}_Question_Paper`,
                      210,
                      297
                    );
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] active:scale-95 text-white dark:text-[#041e49] rounded-full text-xs font-bold transition-all cursor-pointer border-0 ring-0 shadow-xs"
                  title="Print this question paper (A4)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Paper</span>
                </button>
              </div>
            </header>

            {/* Paper Full View Content Area */}
            <main id={`single-test-paper-${previewingPaperTest.id}`} className="flex-1 overflow-y-auto [webkit-overflow-scrolling:touch] touch-auto overscroll-y-contain p-3 sm:p-6 md:p-8 flex justify-center items-start">
              <div className="w-full max-w-5xl">
                <OmrQuestionPaper test={previewingPaperTest} hideHeaderContainer={true} showSolutions={includeSolutions} />
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
