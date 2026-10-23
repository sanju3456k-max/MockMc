import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Printer, 
  Camera, 
  Upload, 
  Clock, 
  FileText, 
  FileCheck2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  ArrowLeft, 
  Sparkles, 
  Award, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Check, 
  X, 
  SlidersHorizontal,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Eye,
  Edit3,
  HelpCircle,
  Plus,
  Maximize2,
  BookOpen,
  Lightbulb,
  CheckCircle,
  HelpCircle as QuestionIcon,
  Crop,
  Image as ImageIcon,
  FileDown,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  type MathTest, 
  type TestAttempt, 
  type QuestionAnswer, 
  type OmrScanResult, 
  type OmrQuestionDetection,
  getQuestionExplanation 
} from '../types';
import type { User } from 'firebase/auth';
import { OmrQuestionPaper } from './OmrQuestionPaper';
import { getOmrLayoutConfig } from '../lib/omrGeometry';
import { OmrSheetGenerator } from './OmrSheetGenerator';
import { OmrCropModal } from './OmrCropModal';
import { evaluateScannedOmrImage, redrawOmrOverlay } from '../lib/omrScannerEngine';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { useBackHandler } from '../hooks/useBackNavigation';
import { triggerSystemPrint, triggerOmrSheetPrint, exportOmrSheetToPng } from '../lib/omrPrintDownload';
import { studioTabVariants, gpuAcceleratedStyle } from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface OmrExamStudioProps {
  test: MathTest;
  currentUser: User | null;
  isDarkMode?: boolean;
  initialAttempt?: TestAttempt | null;
  initialTab?: OmrTab;
  onFinishTest: (attempt: TestAttempt) => void;
  onExit: () => void;
}

type OmrTab = 'print' | 'timer' | 'scan' | 'keys' | 'review';

export const OmrExamStudio: React.FC<OmrExamStudioProps> = ({
  test,
  currentUser,
  isDarkMode = false,
  initialAttempt,
  initialTab,
  onFinishTest,
  onExit,
}) => {
  const [activeTab, setActiveTab] = useState<OmrTab>(initialTab || (initialAttempt ? 'scan' : 'print'));
  const [printSubTab, setPrintSubTab] = useState<'paper' | 'sheet'>('paper');
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [activeTab]);

  const isMobileOrTablet = windowWidth < 1024;

  // Hydrate initial attempt if viewing solutions/attempt details in OMR mode
  useEffect(() => {
    if (!initialAttempt) {
      setActiveTab(initialTab || 'print');
      setIsSaved(false);
      setScanResult(null);
      setCapturedImageUrl(null);
      setRawOriginalImageUrl(null);
      rawOriginalImageRef.current = '';
      cleanImageRef.current = '';
      setEditableDetections([]);
      return;
    }

    if (initialAttempt && initialAttempt.answers) {
      setIsSaved(true);
      setActiveTab('scan');
      if (initialAttempt.omrScannedImageUrl) {
        setCapturedImageUrl(initialAttempt.omrScannedImageUrl);
      }

      const detections: OmrQuestionDetection[] = (test.questions || []).map((q, idx) => {
        const qKey = q.id || idx.toString();
        const ans = initialAttempt.answers[qKey] || initialAttempt.answers[idx.toString()] || Object.values(initialAttempt.answers)[idx];

        let detectedOpt: string | null = null;
        if (ans && ans.selectedOption !== undefined && ans.selectedOption !== null) {
          const optText = String(ans.selectedOption).trim();
          if (optText.startsWith('Option ')) {
            detectedOpt = optText.replace('Option ', '').trim().toUpperCase();
          } else {
            const foundIdx = (q.options || []).findIndex((o) => String(o).trim() === optText);
            if (foundIdx >= 0) {
              detectedOpt = String.fromCharCode(65 + foundIdx);
            } else if (optText.length === 1 && optText.toUpperCase() >= 'A' && optText.toUpperCase() <= 'Z') {
              detectedOpt = optText.toUpperCase();
            }
          }
        }

        let correctOpt = 'A';
        if (q.correctAnswer !== undefined && q.correctAnswer !== null) {
          const corrStr = String(q.correctAnswer).trim();
          const foundCorrIdx = (q.options || []).findIndex((o) => String(o).trim() === corrStr);
          if (foundCorrIdx >= 0) {
            correctOpt = String.fromCharCode(65 + foundCorrIdx);
          } else if (corrStr.length === 1 && corrStr.toUpperCase() >= 'A' && corrStr.toUpperCase() <= 'Z') {
            correctOpt = corrStr.toUpperCase();
          } else if (!isNaN(Number(corrStr)) && Number(corrStr) >= 0 && Number(corrStr) < (q.options?.length || 4)) {
            correctOpt = String.fromCharCode(65 + Number(corrStr));
          }
        }

        return {
          questionNumber: idx + 1,
          questionId: q.id,
          detectedOption: detectedOpt || '',
          actualCorrectOption: correctOpt,
          isCorrect: Boolean(ans?.isCorrect),
          isMultipleMarked: false,
          isAmbiguous: false,
          bubbleReadings: [],
          confidence: 0.99,
        };
      });

      setEditableDetections(detections);

      const totalQs = detections.length;
      const attempted = detections.filter((d) => Boolean(d.detectedOption)).length;
      const correct = detections.filter((d) => d.isCorrect).length;
      const incorrect = attempted - correct;
      const unattempted = totalQs - attempted;

      if (initialAttempt.omrScannedImageUrl) {
        setCapturedImageUrl(initialAttempt.omrScannedImageUrl);
        setRawOriginalImageUrl(initialAttempt.omrScannedImageUrl);
        rawOriginalImageRef.current = initialAttempt.omrScannedImageUrl;
        cleanImageRef.current = initialAttempt.omrScannedImageUrl;
      }

      setScanResult({
        processedImageDataUrl: initialAttempt.omrScannedImageUrl || '',
        questionDetections: detections,
        totalQuestions: totalQs,
        attemptedCount: attempted,
        correctCount: correct,
        incorrectCount: Math.max(0, incorrect),
        unattemptedCount: unattempted,
        score: initialAttempt.score,
        totalPoints: initialAttempt.totalPoints,
        percentage: initialAttempt.percentage,
        passed: initialAttempt.passed,
      });
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialAttempt, test, initialTab]);

  // Timer State for Offline Exam
  const totalMinutes = test.timeLimitMinutes > 0 ? test.timeLimitMinutes : (test.time > 0 ? test.time : (test.questions?.length || 60));
  const [timerSeconds, setTimerSeconds] = useState<number>(totalMinutes * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Scanner & Camera State
  const defaultTotalQuestions = test.questions?.length || 50;
  const [scanQuestionCount, setScanQuestionCount] = useState<number>(defaultTotalQuestions);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('Evaluating Optical Bubbles...');
  const [scanResult, setScanResult] = useState<OmrScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [rawOriginalImageUrl, setRawOriginalImageUrl] = useState<string | null>(null);
  const rawOriginalImageRef = useRef<string>('');
  const cleanImageRef = useRef<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [editableDetections, setEditableDetections] = useState<OmrQuestionDetection[]>([]);
  const [selectedReviewQIndex, setSelectedReviewQIndex] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(Boolean(initialAttempt));

  // Solution Modal & Dropdown State
  const [solutionModalQIndex, setSolutionModalQIndex] = useState<number | null>(null);
  const [expandedDropdownRows, setExpandedDropdownRows] = useState<Set<number>>(new Set());
  const [isImageFullscreen, setIsImageFullscreen] = useState<boolean>(false);

  const toggleRowSolutionDropdown = (questionIndex: number) => {
    setExpandedDropdownRows((prev) => {
      const next = new Set(prev);
      if (next.has(questionIndex)) {
        next.delete(questionIndex);
      } else {
        next.add(questionIndex);
      }
      return next;
    });
  };

  const toggleAllDropdowns = () => {
    if (expandedDropdownRows.size === editableDetections.length) {
      setExpandedDropdownRows(new Set());
    } else {
      const all = new Set<number>();
      editableDetections.forEach((_, idx) => all.add(idx));
      setExpandedDropdownRows(all);
    }
  };

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-level Back navigation handler
  const handleBackAction = () => {
    if (isCropModalOpen) {
      setIsCropModalOpen(false);
      return;
    }
    if (isImageFullscreen) {
      setIsImageFullscreen(false);
      return;
    }
    if (solutionModalQIndex !== null) {
      setSolutionModalQIndex(null);
      return;
    }
    if (activeTab === 'scan') {
      setActiveTab('timer');
      return;
    }
    if (activeTab === 'timer') {
      setActiveTab('print');
      return;
    }
    onExit();
  };

  useBackHandler({ isOpen: true, onBack: handleBackAction });

  // Timer countdown interval
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            if (soundEnabled) {
              try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.8);
              } catch {}
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerSeconds, soundEnabled]);

  // Handle Photo Capture from System Camera or Gallery
  // Directly opens the Crop page so the user can crop the sheet manually
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaved(false);
    setScanError(null);
    setScanResult(null);
    setEditableDetections([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setRawOriginalImageUrl(dataUrl);
        rawOriginalImageRef.current = dataUrl;
        setCapturedImageUrl(dataUrl);
        cleanImageRef.current = dataUrl;

        // Open crop page directly for manual user cropping without auto-calibration
        setIsScanning(false);
        setIsCropModalOpen(true);
      }
    };
    reader.onerror = () => {
      setScanError('Failed to read image file. Please try again.');
    };
    reader.readAsDataURL(file);
    // Reset file input value
    e.target.value = '';
  };

  // Execute Optical Bubble Recognition
  const processOmrImage = async (source: HTMLImageElement | HTMLCanvasElement) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const result = await evaluateScannedOmrImage(source, test, scanQuestionCount);
      setScanResult(result);
      setEditableDetections(result.questionDetections);
      if (result.cleanImageDataUrl) {
        cleanImageRef.current = result.cleanImageDataUrl;
      }
    } catch (err: any) {
      console.error('OMR Evaluation error:', err);
      setScanError(err.message || 'Error processing sheet image. Please ensure your photo is clear.');
    } finally {
      setIsScanning(false);
    }
  };

  // Re-evaluate image when question count changes
  const handleSelectScanQuestionCount = (qCount: number) => {
    setScanQuestionCount(qCount);
    if (capturedImageUrl) {
      const img = new Image();
      let handled = false;
      const runEval = async () => {
        if (handled) return;
        handled = true;
        setIsScanning(true);
        setScanError(null);
        try {
          const result = await evaluateScannedOmrImage(img, test, qCount);
          setScanResult(result);
          setEditableDetections(result.questionDetections);
          if (result.cleanImageDataUrl) {
            cleanImageRef.current = result.cleanImageDataUrl;
          }
        } catch (err: any) {
          console.error('OMR Evaluation error on count switch:', err);
          setScanError(err.message || 'Error re-evaluating sheet with new question count.');
        } finally {
          setIsScanning(false);
        }
      };
      img.onload = runEval;
      img.src = capturedImageUrl;
      if (img.complete && img.naturalWidth > 0) {
        runEval();
      }
    }
  };

  // Manual Bubble Adjustment
  const handleManualBubbleChange = (questionNumber: number, optionLetter: string) => {
    setEditableDetections((prev) => {
      const updated = prev.map((d) => {
        if (d.questionNumber === questionNumber) {
          const newOpt = d.detectedOption === optionLetter ? '' : optionLetter;
          const isCorrect = newOpt !== '' && newOpt === d.actualCorrectOption;
          return {
            ...d,
            detectedOption: newOpt,
            isCorrect,
            isAmbiguous: false,
            isMultipleMarked: false,
          };
        }
        return d;
      });

      // Synchronously update the scanned sheet overlay image if clean image is available
      const cleanImgSrc = cleanImageRef.current || capturedImageUrl;
      if (cleanImgSrc) {
        const img = new Image();
        img.onload = () => {
          const updatedUrl = redrawOmrOverlay(img, updated, scanQuestionCount, scanResult?.refinedCenters);
          if (updatedUrl) {
            setScanResult((prevRes) => prevRes ? { ...prevRes, processedImageDataUrl: updatedUrl, questionDetections: updated } : null);
          }
        };
        img.src = cleanImgSrc;
      }

      return updated;
    });
  };

  // Compute Live Metrics following test questions points distribution
  const liveStats = useMemo(() => {
    const totalQs = Math.max(1, test.questions?.length || 10);
    const attemptedCount = editableDetections.filter((d) => d.detectedOption !== '' || d.isMultipleMarked).length;
    const correctCount = editableDetections.filter((d) => d.isCorrect && !d.isMultipleMarked).length;
    const incorrectCount = editableDetections.filter((d) => (d.detectedOption !== '' || d.isMultipleMarked) && !d.isCorrect).length;
    const unattemptedCount = Math.max(0, totalQs - attemptedCount);

    let score = 0;
    let totalPoints = 0;

    (test.questions || []).forEach((q, idx) => {
      const qPoints = q.points || 1;
      totalPoints += qPoints;
      const det = editableDetections[idx];
      if (det && det.isCorrect && !det.isMultipleMarked) {
        score += qPoints;
      }
    });

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passingScore = test.passingScorePercentage || 60;
    const passed = percentage >= passingScore;

    return {
      totalQuestions: totalQs,
      attemptedCount,
      correctCount,
      incorrectCount,
      unattemptedCount,
      score,
      totalPoints,
      percentage,
      passed,
    };
  }, [editableDetections, test]);

  // Compress OMR scanned image to lightweight JPEG thumbnail (< 50KB) to ensure instant UI loads and zero quota bloat
  const compressOmrImage = async (url?: string): Promise<string | undefined> => {
    if (!url) return undefined;
    if (!url.startsWith('data:image')) return url;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.65);
            resolve(compressed);
            return;
          }
        } catch {
          // fallback to original if canvas fails
        }
        resolve(url.length > 50000 ? url.substring(0, 50000) : url);
      };
      img.onerror = () => resolve(undefined);
      img.src = url;
    });
  };

  // Finalize and Save to Storage / Firebase
  const handleFinalizeAndSubmit = async () => {
    setIsScanning(true);
    const compressedImage = await compressOmrImage(capturedImageUrl || undefined);
    setIsScanning(false);

    const totalTimeSpent = (totalMinutes * 60) - timerSeconds;
    const timePerQ = Math.max(5, Math.floor(Math.max(1, totalTimeSpent) / Math.max(1, test.questions.length)));

    const answersRecord: Record<string, QuestionAnswer> = {};

    editableDetections.forEach((d) => {
      const q = test.questions[d.questionNumber - 1];
      const qId = q?.id || d.questionId;
      
      let selectedOptionText = '';
      if (d.detectedOption) {
        const optIdx = d.detectedOption.charCodeAt(0) - 65;
        if (q?.options && q.options[optIdx]) {
          selectedOptionText = q.options[optIdx];
        } else {
          selectedOptionText = `Option ${d.detectedOption}`;
        }
      }

      answersRecord[qId] = {
        questionId: qId,
        selectedOption: selectedOptionText,
        isCorrect: d.isCorrect,
        flagged: false,
        timeSpentSeconds: timePerQ,
      };
    });

    const finalAttempt: TestAttempt = {
      id: `attempt_omr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      testId: test.id,
      testTitle: test.title,
      testTopic: test.topic,
      userId: currentUser?.uid || 'guest-user',
      userEmail: currentUser?.email || '',
      userName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Learner',
      score: liveStats.score,
      totalPoints: liveStats.totalPoints,
      percentage: liveStats.percentage,
      passed: liveStats.passed,
      timeSpentSeconds: Math.max(60, totalTimeSpent),
      answers: answersRecord,
      attemptMode: 'omr',
      omrScannedImageUrl: compressedImage,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      _syncStatus: 'pending',
    };

    setIsSaved(true);
    onFinishTest(finalAttempt);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div 
      className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 h-[100dvh] max-h-screen pb-[calc(max(0.5rem,env(safe-area-inset-bottom,0px)))] overflow-hidden flex flex-col z-40 font-sans"
    >
      {/* Top Header Navigation (Clean & Simple: OMR Mode & Back Button) */}
      <header className="bg-transparent px-3.5 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] pb-2.5 sm:py-3 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 border-0 outline-none shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
            title="Exit OMR Mode"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-zinc-100">
            OMR Mode
          </span>
        </div>
      </header>

      {/* Tab Segment Switcher & Scan Action Bar */}
      <div className="px-3.5 sm:px-6 pt-1 pb-1 max-w-[1400px] mx-auto w-full">
        {/* Fixed Center Mode Segment Switcher (Print / Timer / Scan) */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white dark:bg-[#1e2024] p-1.5 rounded-full border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('print')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer active:scale-95 border-0 outline-none shrink-0 ${
              activeTab === 'print'
                ? 'bg-[#0b57d0] text-white shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timer')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer active:scale-95 border-0 outline-none shrink-0 ${
              activeTab === 'timer'
                ? 'bg-[#0b57d0] text-white shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer active:scale-95 border-0 outline-none shrink-0 ${
              activeTab === 'scan'
                ? 'bg-[#0b57d0] text-white shadow-none'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto [webkit-overflow-scrolling:touch] touch-auto overscroll-y-contain mx-auto w-full transition-all p-1.5 sm:p-3 max-w-[1400px]">
        {/* ========================================================
            TAB 1: PRINT QUESTION PAPER & OMR BUBBLE SHEET
            ======================================================== */}
        {activeTab === 'print' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Unified Container for Test Details (Title, Portion, Marks, Minutes, Question Details) */}
            <div className="p-5 sm:p-6 rounded-[24px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
                    {test.title || 'Question Paper & OMR Sheet'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                    Portion: {test.topic || 'Mathematics Assessment'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                  <span className="px-3.5 py-1.5 rounded-[28px] bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] border-0">
                    {(test.questions || []).reduce((acc, q) => acc + (q.points || 1), 0) || (test as any).totalMarks || test.questionCount || 0} Marks
                  </span>
                  <span className="px-3.5 py-1.5 rounded-[28px] bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-0">
                    {test.timeLimitMinutes > 0 ? test.timeLimitMinutes : (test.time > 0 ? test.time : (test.questions?.length || 60))} Mins
                  </span>
                  <span className="px-3.5 py-1.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] text-slate-700 dark:text-zinc-300 border-0">
                    {test.questions?.length || test.questionCount || 0} Questions
                  </span>
                </div>
              </div>
            </div>

            {/* View Mode Selector (Single static view with subtabs for Question Paper and OMR Bubble Sheet) */}
            <div className="overflow-hidden print:hidden">
              <div className="flex items-center justify-center max-w-md mx-auto mb-4">
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white dark:bg-[#1e2024] p-1.5 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] w-full">
                  <button
                    type="button"
                    onClick={() => setPrintSubTab('paper')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-[28px] text-xs font-extrabold transition-all duration-150 cursor-pointer active:scale-[0.97] border-0 outline-none shrink-0 ${
                      printSubTab === 'paper'
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-none'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Question Paper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrintSubTab('sheet')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-[28px] text-xs font-extrabold transition-all duration-150 cursor-pointer active:scale-[0.97] border-0 outline-none shrink-0 ${
                      printSubTab === 'sheet'
                        ? 'bg-emerald-600 text-white shadow-none'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>OMR Bubble Sheet</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Single Static Document View */}
            <div className="space-y-4">
              <div className={printSubTab === 'paper' ? 'space-y-3' : 'hidden'}>
                <div className="flex justify-end gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={async () => {
                      const cleanTitle = (test.title || 'Question_Paper').replace(/[^a-zA-Z0-9_-]/g, '_');
                      await triggerSystemPrint('question-paper-printable-root', `${cleanTitle}_Question_Paper_A4`, 210, 297);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-full text-xs font-bold transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-xs hover:shadow-sm border-0 ring-0 cursor-pointer active:scale-[0.97]"
                    title="Print Question Paper"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
                <OmrQuestionPaper test={test} hideHeaderContainer={true} />
              </div>

              <div className={printSubTab === 'sheet' ? 'space-y-3' : 'hidden'}>
                <div className="flex justify-end gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={async () => {
                      const totalQs = test.questions?.length || test.questionCount || 50;
                      await triggerOmrSheetPrint(totalQs, test.title || '');
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-full text-xs font-bold transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-xs hover:shadow-sm border-0 ring-0 cursor-pointer active:scale-[0.97]"
                    title="Open default printer interface to print or save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const totalQs = test.questions?.length || test.questionCount || 50;
                      const cleanTitle = (test.title || 'OMR_Sheet').replace(/[^a-zA-Z0-9_-]/g, '_');
                      await exportOmrSheetToPng(totalQs, test.title || '', `${cleanTitle}_OMR_Sheet_A4.png`);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-xs hover:shadow-sm border-0 ring-0 cursor-pointer active:scale-[0.97]"
                    title="Export high-resolution OMR PNG image"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Download PNG</span>
                  </button>
                </div>
                <OmrSheetGenerator test={test} hideHeaderContainer={true} />
              </div>
            </div>

            {/* Bottom Next Action Helper Banner */}
            <div className="p-5 sm:p-6 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="space-y-0.5">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Ready to begin your physical pen & paper exam?
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Download or print your sheets, start the exam countdown timer, and return here to scan!
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('timer')}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-[28px] transition-all shadow-xs hover:shadow-sm border-0 active:scale-95 cursor-pointer"
              >
                <span>Proceed to Exam Timer</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: OFFLINE EXAM STOPWATCH / TIMER
            ======================================================== */}
        {activeTab === 'timer' && (
          <div className="max-w-2xl mx-auto py-3 sm:py-6 animate-in fade-in duration-200 space-y-4">
            {/* Top Timer Card */}
            <div className="bg-white dark:bg-[#1e2024] p-6 sm:p-7 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] text-center flex flex-col items-center justify-between space-y-5">
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-left">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-zinc-100 leading-snug">
                      {test.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <div className="px-3.5 py-1.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 border-0">
                      <BookOpen className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      <span>{test.questions?.length ?? test.questionCount ?? 0} Qs</span>
                    </div>
                    <div className="px-3.5 py-1.5 rounded-[28px] bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 flex items-center gap-1.5 border-0">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>{totalMinutes > 0 ? `${totalMinutes} Mins` : 'Untimed'}</span>
                    </div>
                  </div>
                </div>

                {/* Rectangular Timer Clock Box */}
                <div className="w-full h-36 sm:h-44 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] flex flex-col items-center justify-center p-4 border-0 shadow-none">
                  <div className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-slate-900 dark:text-zinc-100">
                    {formatTime(timerSeconds)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400 mt-2 font-bold flex items-center justify-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{isTimerRunning ? 'Exam in progress' : 'Ready / Paused'}</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3 flex-wrap w-full">
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-[28px] text-xs sm:text-sm font-extrabold text-white transition-all shadow-sm border-0 active:scale-95 cursor-pointer ${
                    isTimerRunning
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isTimerRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>{timerSeconds === totalMinutes * 60 ? 'Start Timer' : 'Resume'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setTimerSeconds((prev) => prev + 300)}
                  className="px-5 py-3 rounded-[28px] bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-800 dark:text-zinc-200 text-xs font-extrabold transition-all border-0 outline-none active:scale-95 cursor-pointer"
                  title="Add 5 Minutes"
                >
                  +5 Min
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerSeconds(totalMinutes * 60);
                  }}
                  className="w-11 h-11 rounded-[28px] bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-800 dark:text-zinc-200 flex items-center justify-center transition-all border-0 outline-none active:scale-95 cursor-pointer"
                  title="Reset Timer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="w-11 h-11 rounded-[28px] bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-800 dark:text-zinc-200 flex items-center justify-center transition-all border-0 outline-none active:scale-95 cursor-pointer"
                  title={soundEnabled ? 'Mute Alert Sound' : 'Enable Alert Sound'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                </button>
              </div>

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setActiveTab('scan');
                  cameraInputRef.current?.click();
                }}
                className="w-full px-8 py-3.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-[28px] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm border-0 active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Exam Completed &bull; Scan Sheet</span>
              </button>
            </div>

            {/* Instructions Card Under Timer Card */}
            <div className="bg-white dark:bg-[#1e2024] p-5 sm:p-6 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Offline Exam Instructions</span>
              </h4>
              <div className="space-y-2.5 text-xs text-slate-700 dark:text-zinc-300 font-medium">
                <div className="p-3.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] flex items-start gap-3 border-0 shadow-none">
                  <span className="w-5 h-5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Keep your printed OMR sheet and question paper ready before starting the countdown timer.</span>
                </div>
                <div className="p-3.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] flex items-start gap-3 border-0 shadow-none">
                  <span className="w-5 h-5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>Darken your chosen response bubbles completely using a dark blue or black ballpoint pen.</span>
                </div>
                <div className="p-3.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] flex items-start gap-3 border-0 shadow-none">
                  <span className="w-5 h-5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>Scan your sheet honestly as soon as timer countdown expires.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: SCAN, OPTICAL EVALUATION & REVIEW
            ======================================================== */}
        {activeTab === 'scan' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Hidden Camera & File Inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelected}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelected}
              className="hidden"
            />

            {/* Scanning Loader */}
            {isScanning && (
              <div className="p-8 text-center space-y-3 bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                <RefreshCw className="w-8 h-8 text-[#0b57d0] dark:text-[#a8c7fa] animate-spin mx-auto" />
                <h4 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                  {scanStatusMessage}
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                  Evaluating marked bubbles & calculating score...
                </p>
              </div>
            )}

            {/* Scan Error Message */}
            {scanError && (
              <div className="p-4 rounded-[28px] bg-rose-50 dark:bg-rose-950/40 border-0 shadow-xs flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-extrabold">Evaluation Notice:</div>
                  <div>{scanError}</div>
                </div>
              </div>
            )}

            {/* Initial Empty Prompt State (Body Card Only) */}
            {!capturedImageUrl && !scanResult && !isScanning && (
              <div className="p-10 text-center space-y-4 bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] max-w-lg mx-auto my-6">
                <div className="w-14 h-14 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border-0 shadow-none">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black text-slate-900 dark:text-zinc-100">
                    Capture or Upload Your OMR Sheet
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium max-w-sm mx-auto">
                    Take a clear photo of your filled OMR sheet, adjust the outer boundary lines, and get instant evaluation results.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-[28px] text-xs font-extrabold transition-all shadow-sm border-0 cursor-pointer active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-800 dark:text-zinc-100 rounded-[28px] text-xs font-extrabold transition-all cursor-pointer active:scale-95 border-0 outline-none"
                  >
                    <Upload className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Upload</span>
                  </button>
                </div>
              </div>
            )}

            {/* Loaded Image Preview if not yet evaluated or after error */}
            {capturedImageUrl && !scanResult && !isScanning && (
              <div className="p-5 sm:p-6 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      Loaded Image Preview
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Adjust boundary lines with Crop, retry with another photo, or evaluate now
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#d3e3fd] hover:bg-[#c2e7ff] text-[#041e49] dark:bg-[#004a77] dark:hover:bg-[#00385a] dark:text-[#c2e7ff] rounded-[28px] text-xs font-bold transition-all shadow-xs hover:shadow-sm border-0 cursor-pointer active:scale-95"
                      title="Retake photo with camera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Retake</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-800 dark:text-zinc-100 rounded-[28px] text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs hover:shadow-sm border-0"
                      title="Upload a different image"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      <span>Upload New</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCropModalOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] rounded-[28px] text-xs font-bold transition-all shadow-xs hover:shadow-sm border-0 cursor-pointer active:scale-95"
                      title="Adjust boundary lines"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Adjust Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!capturedImageUrl) return;
                        const img = new Image();
                        let handled = false;
                        const runEval = () => {
                          if (handled) return;
                          handled = true;
                          processOmrImage(img);
                        };
                        img.onload = runEval;
                        img.src = capturedImageUrl;
                        if (img.complete && img.naturalWidth > 0) {
                          runEval();
                        }
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[28px] text-xs font-bold transition-all shadow-xs hover:shadow-sm border-0 cursor-pointer active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Evaluate Now</span>
                    </button>
                  </div>
                </div>

                <div 
                  className="relative rounded-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#141619] overflow-hidden w-full flex items-center justify-center shadow-xs cursor-pointer group p-0"
                  onClick={() => setIsCropModalOpen(true)}
                  title="Click image to open Crop tool"
                >
                  {capturedImageUrl && capturedImageUrl.trim() ? (
                    <img
                      src={capturedImageUrl}
                      alt="Loaded OMR Preview"
                      className="w-full h-auto object-contain block rounded-none bg-white shadow-none group-hover:opacity-90 transition-all"
                    />
                  ) : null}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-none pointer-events-none">
                    <span className="px-3.5 py-1.5 bg-black/75 text-white rounded-full text-xs font-bold flex items-center gap-1.5">
                      <Crop className="w-3.5 h-3.5" />
                      Click to Adjust Crop
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Results & Verification Section */}
            {scanResult && editableDetections.length > 0 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column (Desktop Sticky): Scanned OMR Sheet Image & Legend */}
                  {scanResult.processedImageDataUrl && (
                    <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-4 space-y-3 bg-white dark:bg-[#1e2024] p-5 sm:p-6 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <Camera className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                            <span>Scanned OMR Sheet</span>
                          </h4>
                        </div>

                        {!isSaved && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              className="px-3 py-1 bg-[#d3e3fd] hover:bg-[#c2e7ff] text-[#041e49] dark:bg-[#004a77] dark:hover:bg-[#00385a] dark:text-[#c2e7ff] rounded-[28px] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs border-0"
                              title="Take new photo with camera"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Retake</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-3 py-1 bg-[#f0f4f9] dark:bg-[#141619] hover:bg-slate-200 dark:hover:bg-[#282a30] text-slate-700 dark:text-zinc-300 rounded-[28px] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs border-0"
                              title="Upload a different sheet image"
                            >
                              <Upload className="w-3 h-3 text-[#0b57d0] dark:text-[#a8c7fa]" />
                              <span>Upload</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setIsCropModalOpen(true)}
                              className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 rounded-[28px] text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs border-0"
                              title="Re-crop Sheet Image"
                            >
                              <Crop className="w-3.5 h-3.5" />
                              <span>Re-crop</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Legend: Green (Correct), Red (Wrong), Yellow (Answer Key) */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] sm:text-xs">
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-[28px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-medium border-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span>Green: Correct</span>
                        </div>
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-[28px] bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 font-medium border-0">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span>Red: Wrong</span>
                        </div>
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-[28px] bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-medium border-0">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span>Yellow: Answer Key</span>
                        </div>
                      </div>

                      {/* Image Frame - Exact dimensions of frame as of image with straight sharp corners */}
                      <div className="w-full overflow-hidden relative flex items-center justify-center rounded-none border border-slate-300 dark:border-zinc-700/80 bg-white dark:bg-[#141619] p-0 shadow-xs">
                        {scanResult.processedImageDataUrl && scanResult.processedImageDataUrl.trim() ? (
                          <img
                            src={scanResult.processedImageDataUrl}
                            alt="Scanned OMR Sheet with Detected Bubbles"
                            className="w-full h-auto object-contain block rounded-none bg-white cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => setIsImageFullscreen(true)}
                          />
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Right Column: Scorecard & Solutions Table */}
                  <div className={`space-y-4 sm:space-y-6 ${scanResult.processedImageDataUrl ? 'lg:col-span-7 xl:col-span-7' : 'lg:col-span-12'}`}>
                    {/* Score Card */}
                    <div className="p-5 sm:p-6 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
                        <div>
                          <span className="text-[10px] font-extrabold tracking-widest text-slate-400 dark:text-zinc-500 uppercase font-mono block">
                            Scorecard
                          </span>
                          <div className="flex items-baseline gap-2.5 mt-0.5">
                            <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-zinc-100">
                              {liveStats.score} <span className="text-xs sm:text-sm text-slate-400 font-sans font-normal">/ {liveStats.totalPoints} Marks</span>
                            </span>
                            <span className="text-lg sm:text-xl font-bold font-mono text-[#0b57d0] dark:text-[#a8c7fa]">
                              ({liveStats.percentage}%)
                            </span>
                          </div>
                        </div>

                        {isSaved ? (
                          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-0 rounded-[28px] text-xs sm:text-sm font-bold shadow-xs flex items-center gap-1.5 ml-auto sm:ml-0">
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                            <span>Saved & Synced</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleFinalizeAndSubmit}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[28px] text-xs sm:text-sm font-bold shadow-xs hover:shadow-sm border-0 flex items-center gap-2 active:scale-95 cursor-pointer transition-all ml-auto sm:ml-0"
                          >
                            <Check className="w-4 h-4" />
                            <span>Save & Sync</span>
                          </button>
                        )}
                      </div>

                      {/* 4 Stat Boxes: Correct, Wrong, Left, Accuracy */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                        <div className="p-3.5 sm:p-4 bg-emerald-100 dark:bg-emerald-950/80 rounded-[28px] text-center shadow-xs border-0">
                          <div className="text-xs font-black text-emerald-950 dark:text-emerald-100 uppercase tracking-wider">
                            Correct (✓)
                          </div>
                          <div className="text-2xl sm:text-3xl font-black text-emerald-950 dark:text-emerald-100 font-mono mt-1">
                            {liveStats.correctCount}
                          </div>
                        </div>

                        <div className="p-3.5 sm:p-4 bg-rose-100 dark:bg-rose-950/80 rounded-[28px] text-center shadow-xs border-0">
                          <div className="text-xs font-black text-rose-950 dark:text-rose-100 uppercase tracking-wider">
                            Wrong (✗)
                          </div>
                          <div className="text-2xl sm:text-3xl font-black text-rose-950 dark:text-rose-100 font-mono mt-1">
                            {liveStats.incorrectCount}
                          </div>
                        </div>

                        <div className="p-3.5 sm:p-4 bg-[#f0f4f9] dark:bg-[#141619] rounded-[28px] text-center shadow-xs border-0">
                          <div className="text-xs font-black text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                            Left (○)
                          </div>
                          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-100 font-mono mt-1">
                            {liveStats.unattemptedCount}
                          </div>
                        </div>

                        <div className="p-3.5 sm:p-4 bg-blue-100 dark:bg-blue-950/80 rounded-[28px] text-center shadow-xs border-0">
                          <div className="text-xs font-black text-blue-950 dark:text-blue-100 uppercase tracking-wider">
                            Accuracy
                          </div>
                          <div className="text-2xl sm:text-3xl font-black text-[#0066cc] dark:text-blue-200 font-mono mt-1">
                            {liveStats.attemptedCount > 0 ? Math.round((liveStats.correctCount / liveStats.attemptedCount) * 100) : 0}%
                          </div>
                        </div>
                      </div>
                    </div>

                {/* Evaluation Table in White Background Card */}
                <div className="bg-white dark:bg-[#1e2024] p-5 sm:p-6 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        OMR Evaluation & Solutions
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Marked choices, correct keys, and dropdown step-by-step solutions
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400 hidden xs:inline">
                        {editableDetections.length} Questions
                      </span>

                      <button
                        type="button"
                        onClick={toggleAllDropdowns}
                        className="flex items-center gap-1 px-3.5 py-1.5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] hover:bg-slate-200 dark:hover:bg-[#282a30] text-slate-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs border-0"
                      >
                        {expandedDropdownRows.size === editableDetections.length ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Collapse</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Expand All</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 4-Column Table */}
                  <div className="rounded-[28px] overflow-hidden bg-white dark:bg-[#1e2024] shadow-none border-0">
                    <table className="w-full text-left text-xs border-collapse table-fixed bg-white dark:bg-[#1e2024]">
                      <thead>
                        <tr className="bg-[#f0f4f9] dark:bg-[#141619] text-slate-800 dark:text-zinc-100 font-black border-b border-slate-100 dark:border-zinc-800/80">
                          <th className="py-3 px-2 sm:px-3 text-center w-[16%] sm:w-[14%] font-mono text-xs">
                            Q.
                          </th>
                          <th className="py-3 px-2 sm:px-3 text-center w-[28%] sm:w-[28%] text-xs">
                            Marked
                          </th>
                          <th className="py-3 px-2 sm:px-3 text-center w-[28%] sm:w-[28%] text-xs">
                            Correct
                          </th>
                          <th className="py-3 px-2 sm:px-3 text-right w-[28%] sm:w-[30%] text-xs">
                            Solution
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                        {editableDetections.map((det, idx) => {
                          const q = test.questions[det.questionNumber - 1];
                          const isUnattempted = det.detectedOption === '';
                          const isCorrect = det.isCorrect;
                          const isExpanded = expandedDropdownRows.has(idx);

                          return (
                            <React.Fragment key={det.questionNumber}>
                              <tr
                                className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-[#222634]/40 ${
                                  isUnattempted
                                    ? 'bg-transparent'
                                    : isCorrect
                                    ? 'bg-emerald-50/30 dark:bg-emerald-950/20'
                                    : 'bg-rose-50/30 dark:bg-rose-950/20'
                                }`}
                              >
                                {/* 1. Q. (Round Icon, Borderless) */}
                                <td className="py-3 px-1.5 sm:px-3 text-center">
                                  <div className="w-8 h-8 rounded-full bg-[#f0f4f9] dark:bg-[#141619] text-slate-900 dark:text-zinc-100 font-mono font-bold text-xs flex items-center justify-center mx-auto shadow-none border-0">
                                    {det.questionNumber}
                                  </div>
                                </td>

                                {/* 2. Marked Option */}
                                <td className="py-3 px-1 sm:px-3 text-center">
                                  {det.isMultipleMarked ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[28px] text-[10.5px] sm:text-[11px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-0" title="Multiple options filled: 0 marks awarded">
                                      <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                                      <span>Double Mark (0)</span>
                                    </span>
                                  ) : isUnattempted ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[28px] text-[10.5px] sm:text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                      <span className="hidden sm:inline">Unattempted</span>
                                      <span className="sm:hidden">—</span>
                                    </span>
                                  ) : isCorrect ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[28px] text-[10.5px] sm:text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-mono border-0">
                                      <Check className="w-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5] shrink-0" />
                                      <span className="hidden sm:inline">Opt </span>{det.detectedOption}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[28px] text-[10.5px] sm:text-[11px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-mono border-0">
                                      <X className="w-3 text-rose-600 dark:text-rose-400 stroke-[2.5] shrink-0" />
                                      <span className="hidden sm:inline">Opt </span>{det.detectedOption}
                                    </span>
                                  )}
                                </td>

                                {/* 3. Correct Option (Answer Key - Blue Option Tag matching online mode) */}
                                <td className="py-3 px-1 sm:px-3 text-center">
                                  <span 
                                    className="inline-flex items-center gap-0.5 sm:gap-1 px-2.5 py-1 rounded-[28px] text-[10.5px] sm:text-[11px] font-extrabold bg-blue-100 dark:bg-blue-900/70 text-blue-800 dark:text-blue-200 font-mono border-0"
                                    title={`Correct Answer Key: Option ${det.actualCorrectOption}`}
                                  >
                                    <span className="hidden sm:inline">Opt </span>{det.actualCorrectOption}
                                  </span>
                                </td>

                                {/* 4. View Solution Dropdown Toggle Button */}
                                <td className="py-3 px-1.5 sm:px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => toggleRowSolutionDropdown(idx)}
                                    className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-[28px] text-[10.5px] sm:text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs border-0 ${
                                      isExpanded
                                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                                        : 'bg-[#d3e3fd] hover:bg-[#c2e7ff] text-[#041e49] dark:bg-[#004a77] dark:hover:bg-[#00385a] dark:text-[#c2e7ff]'
                                    }`}
                                    title={`Toggle Solution Dropdown for Question ${det.questionNumber}`}
                                  >
                                    <BookOpen className="w-3 h-3 shrink-0" />
                                    <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Solution'}</span>
                                    <span className="sm:hidden">{isExpanded ? 'Hide' : 'Sol'}</span>
                                    {isExpanded ? (
                                       <ChevronUp className="w-3 h-3 shrink-0" />
                                    ) : (
                                       <ChevronDown className="w-3 h-3 shrink-0" />
                                    )}
                                  </button>
                                </td>
                              </tr>

                              {/* Question & Solution Dropdown Row */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={4} className="p-0 border-b border-slate-100 dark:border-zinc-800/80">
                                    <div className="bg-[#f0f4f9] dark:bg-[#141619] p-4 sm:p-5 space-y-3.5 rounded-[28px] my-2">
                                      {/* Question Statement Header */}
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                                            Question {det.questionNumber}:
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setSolutionModalQIndex(idx)}
                                            className="text-xs font-bold text-[#0b57d0] hover:text-[#0842a0] dark:text-[#a8c7fa] flex items-center gap-1 cursor-pointer border-0 shadow-none"
                                          >
                                            <Maximize2 className="w-3 h-3" />
                                            <span className="hidden sm:inline">Open in Modal</span>
                                          </button>
                                        </div>

                                        <div className="p-4 rounded-[28px] bg-white dark:bg-[#1e2024] shadow-[0_2px_6px_rgba(0,0,0,0.08)] border-0 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 font-medium leading-relaxed overflow-x-auto">
                                          {q ? (
                                            <MathRenderer text={q.text || (q as any).question || ''} />
                                          ) : (
                                            <span>Question #{det.questionNumber}</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Options List with Answer Highlights */}
                                      {q?.options && q.options.length > 0 && (
                                        <div className="space-y-2">
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {q.options.map((optText, optIdx) => {
                                              const letter = String.fromCharCode(65 + optIdx);
                                              const isActualCorrect = letter === det.actualCorrectOption;
                                              const isUserMarked = letter === det.detectedOption;

                                              return (
                                                <div
                                                  key={optIdx}
                                                  className={`p-3 rounded-[28px] text-xs flex items-start gap-2.5 transition-all text-left border-0 ${
                                                    isActualCorrect
                                                      ? 'bg-blue-100/90 dark:bg-blue-950/80 text-slate-900 dark:text-blue-100 font-bold shadow-xs'
                                                      : isUserMarked && !isActualCorrect
                                                      ? 'bg-rose-100/90 dark:bg-rose-950/60 text-rose-950 dark:text-rose-100 font-semibold shadow-xs'
                                                      : 'bg-white dark:bg-[#1e2024] text-slate-700 dark:text-zinc-300 shadow-xs'
                                                  }`}
                                                >
                                                  <div
                                                    className={`w-6 h-6 rounded-full font-mono font-bold flex items-center justify-center shrink-0 text-xs shadow-none border-0 ${
                                                      isActualCorrect
                                                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-black'
                                                        : isUserMarked && !isActualCorrect
                                                        ? 'bg-rose-600 text-white font-black'
                                                        : 'bg-[#f0f4f9] dark:bg-[#141619] text-slate-700 dark:text-zinc-300'
                                                    }`}
                                                  >
                                                    {letter}
                                                  </div>

                                                  <div className="flex-1 min-w-0 pt-0.5 overflow-x-auto text-[11.5px] sm:text-xs">
                                                    <MathRenderer text={optText} />
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {/* Step-by-Step Derivation & Explanation (No Background Card) */}
                                      <div className="space-y-2 py-1">
                                        <div className="flex items-center gap-1.5 text-[#0b57d0] dark:text-[#a8c7fa]">
                                          <Lightbulb className="w-3.5 h-3.5" />
                                          <span className="text-xs font-bold uppercase tracking-wider">
                                            Step-by-Step Solution Derivation
                                          </span>
                                        </div>

                                        <div className="text-xs leading-relaxed text-slate-800 dark:text-zinc-200 pl-3 border-l-2 border-[#0b57d0]/40 dark:border-[#a8c7fa]/40 overflow-x-auto">
                                          {q && getQuestionExplanation(q) ? (
                                            <MathRenderer text={getQuestionExplanation(q)} />
                                          ) : (
                                            <p className="italic text-slate-500 dark:text-zinc-400">
                                              Standard mathematical solution for {test.topic || 'Mathematics'}. Correct option is {det.actualCorrectOption}.
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Question Formula / Hint if available */}
                                      {q?.hint && (
                                        <div className="p-3.5 rounded-[28px] bg-amber-50/80 dark:bg-amber-950/30 shadow-none border-0 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                                          <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                                          <div className="overflow-x-auto">
                                            <span className="font-bold">Key Formula / Hint: </span>
                                            <MathRenderer text={q.hint} />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
          </div>
        )}
      </main>

      {/* ========================================================
          DETAILED QUESTION SOLUTION MODAL
          ======================================================== */}
      <AnimatePresence>
        {solutionModalQIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.18)] flex flex-col"
            >
              {/* Modal Top Header */}
              {(() => {
                const currentDet = editableDetections[solutionModalQIndex];
                const currentQ = test.questions[solutionModalQIndex];
                const totalQCount = editableDetections.length;
                const isCorrect = currentDet?.isCorrect;
                const isUnattempted = currentDet?.detectedOption === '';

                return (
                  <>
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#1e2024]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100 truncate">
                        Question {solutionModalQIndex + 1} Solution
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSolutionModalQIndex(null)}
                        className="w-9 h-9 rounded-full bg-[#f0f4f9] hover:bg-slate-200 dark:bg-[#141619] dark:hover:bg-[#282a30] text-slate-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shrink-0 border-0 outline-none"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Modal Scrollable Content */}
                    <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-zinc-200">
                      {/* Question Text */}
                      <div className="p-4 sm:p-5 rounded-[28px] bg-[#f0f4f9] dark:bg-[#141619] border-0 shadow-none">
                        <div className="text-sm sm:text-base font-semibold leading-relaxed text-slate-900 dark:text-zinc-100 overflow-x-auto">
                          {currentQ ? (
                            <MathRenderer text={currentQ.text || (currentQ as any).question || ''} />
                          ) : (
                            <p>Question not available</p>
                          )}
                        </div>
                        {(currentQ?.imageUrl || currentQ?.imageUrls) && (
                          <QuestionDiagramViewer
                            imageUrl={currentQ.imageUrl}
                            imageUrls={currentQ.imageUrls}
                            imageWidths={currentQ.imageWidths}
                            alt="Question Diagram"
                            width={currentQ.imageWidth}
                          />
                        )}
                      </div>

                      {/* Options List with Highlighted Correct & Marked Choices */}
                      {currentQ?.options && currentQ.options.length > 0 && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-2">
                            {currentQ.options.map((optText, optIdx) => {
                              const letter = String.fromCharCode(65 + optIdx);
                              const isActualCorrect = letter === currentDet?.actualCorrectOption;
                              const isUserMarked = letter === currentDet?.detectedOption;

                              return (
                                <div
                                  key={optIdx}
                                  className={`p-3 rounded-[28px] text-xs flex items-start gap-3 transition-all border-0 ${
                                    isActualCorrect
                                      ? 'bg-blue-100/90 dark:bg-blue-950/80 text-slate-900 dark:text-blue-100 font-bold shadow-xs'
                                      : isUserMarked
                                      ? 'bg-rose-100/90 dark:bg-rose-950/80 text-slate-900 dark:text-rose-100 font-bold shadow-xs'
                                      : 'bg-white dark:bg-[#1e2024] text-slate-700 dark:text-zinc-300 shadow-xs'
                                  }`}
                                >
                                  <div className={`w-6 h-6 rounded-full font-mono font-bold flex items-center justify-center shrink-0 text-xs border-0 ${
                                    isActualCorrect
                                      ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] font-black'
                                      : isUserMarked
                                      ? 'bg-rose-600 text-white font-black'
                                      : 'bg-[#f0f4f9] dark:bg-[#141619] text-slate-700 dark:text-zinc-300'
                                  }`}>
                                    {letter}
                                  </div>

                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <MathRenderer text={optText} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Step-by-Step Derivation & Explanation (No Background Card) */}
                      <div className="space-y-2 py-1">
                        <div className="flex items-center gap-2 text-[#0b57d0] dark:text-[#a8c7fa]">
                          <Lightbulb className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            Step-by-Step Solution Derivation
                          </span>
                        </div>

                        <div className="text-xs leading-relaxed text-slate-800 dark:text-zinc-200 pl-4 border-l-2 border-[#0b57d0]/40 dark:border-[#a8c7fa]/40">
                          {currentQ && getQuestionExplanation(currentQ) ? (
                            <MathRenderer text={getQuestionExplanation(currentQ)} />
                          ) : (
                            <p className="italic text-slate-500 dark:text-zinc-400">
                              Standard mathematical solution derived by following step-by-step principles for {test.topic || 'Mathematics'}. Correct option is {currentDet?.actualCorrectOption}.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Question Hint if available */}
                      {currentQ?.hint && (
                        <div className="p-3.5 rounded-[28px] bg-amber-50/80 dark:bg-amber-950/20 border-0 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                          <Sparkles className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                          <div>
                            <span className="font-bold">Key Formula / Hint: </span>
                            <MathRenderer text={currentQ.hint} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Modal Footer Navigation */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 shrink-0 bg-[#e5e9f0] dark:bg-[#141619]">
                      <button
                        type="button"
                        onClick={() => setSolutionModalQIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                        disabled={solutionModalQIndex === 0}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-[28px] text-xs font-bold text-slate-700 dark:text-zinc-300 bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer border-0 shadow-xs"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                      </button>

                      <div className="text-xs font-mono text-slate-500 dark:text-zinc-400 font-bold">
                        {solutionModalQIndex + 1} / {totalQCount}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSolutionModalQIndex((prev) => (prev !== null && prev < totalQCount - 1 ? prev + 1 : prev))}
                        disabled={solutionModalQIndex === totalQCount - 1}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-[28px] text-xs font-bold text-white dark:text-[#041e49] bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer border-0 shadow-xs"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          FULLSCREEN SCANNED OMR IMAGE MODAL
          ======================================================== */}
      <AnimatePresence>
        {isImageFullscreen && scanResult?.processedImageDataUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-slate-950 rounded-3xl overflow-hidden flex flex-col border-0 ring-0 shadow-none"
            >
              <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between text-white bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-bold">Scanned OMR Full Resolution Verification</h4>
                  <div className="hidden sm:flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Green: Correct
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800 font-medium">
                      <span className="w-2 h-2 rounded-full bg-rose-400" /> Red: Wrong
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> Yellow: Answer Key
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImageFullscreen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-all cursor-pointer border-0 ring-0 shadow-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black">
                {scanResult.processedImageDataUrl && scanResult.processedImageDataUrl.trim() ? (
                  <img
                    src={scanResult.processedImageDataUrl}
                    alt="Scanned OMR Fullscreen"
                    className="max-w-full max-h-full object-contain rounded-none shadow-none border border-zinc-800"
                  />
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* ========================================================
          INTERACTIVE 8-HANDLE OMR CROP & ALIGNMENT MODAL
          ======================================================== */}
      {(() => {
        const totalQs = Math.max(1, test.questions?.length || 50);
        const layoutConfig = getOmrLayoutConfig(totalQs, undefined, 'a4');
        return (
          <OmrCropModal
            isOpen={isCropModalOpen}
            imageUrl={rawOriginalImageUrl || rawOriginalImageRef.current || cleanImageRef.current || capturedImageUrl || ''}
            onClose={() => setIsCropModalOpen(false)}
            targetWidthMm={layoutConfig.pageWidthMm}
            targetHeightMm={layoutConfig.pageHeightMm}
            bottomFiducialY_mm={layoutConfig.bottomFiducialY_mm}
            onApplyCrop={async (croppedUrl) => {
              setIsSaved(false);
              setCapturedImageUrl(croppedUrl);
              cleanImageRef.current = croppedUrl;
              setIsScanning(true);
              setScanStatusMessage('Evaluating Optical Bubbles...');
              setScanError(null);

              const img = new Image();
              let handled = false;
              const runScan = async () => {
                if (handled) return;
                handled = true;
                await processOmrImage(img);
              };

              img.onload = runScan;
              img.onerror = (err) => {
                console.error("Failed loading cropped OMR image:", err);
                setIsScanning(false);
                setScanError("Unable to load cropped image for OMR scanning. Please try scanning again.");
              };

              img.src = croppedUrl;

              if (img.complete && img.naturalWidth > 0) {
                runScan();
              }
            }}
          />
        );
      })()}
    </div>
  );
};

