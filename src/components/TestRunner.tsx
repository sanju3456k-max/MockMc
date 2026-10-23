import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  Play, 
  Pause, 
  Moon, 
  Sun, 
  Menu, 
  Bookmark,
  Edit3,
  Eraser,
  HelpCircle,
  AlertTriangle,
  Trash2,
  Eye,
  Loader2,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import type { MathTest, QuestionAnswer, TestAttempt, ActiveTestSession, MathQuestion } from '../types';
import { isMcqQuestion, checkIsOptionCorrect, checkIsOptionSelected, normalizeQuestions } from '../types';
import type { User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { UiScale } from '../hooks/useUIScale';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioDrawerRightVariants, 
  studioBackdropVariants, 
  studioModalVariants, 
  studioTabVariants, 
  gpuAcceleratedStyle,
  gpuTransformStyle 
} from '../lib/animationConfig';
import { saveScopedActiveSession, clearScopedActiveSession } from '../lib/storage';
import { APP_STYLES } from './ui/AppStyles';

// ==========================================
// 1. CONFIGURATION & TYPES
// ==========================================
interface TestRunnerProps {
  test: MathTest;
  mode: 'timed' | 'practice';
  initialSession?: ActiveTestSession | null;
  currentUser: User | null;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  uiScale?: string;
  onScaleChange?: (scale: any) => void;
  onFinishTest: (attempt: TestAttempt) => void;
  onExitTest: () => void;
}

interface UserAnswerState {
  selectedOption: string;
  flagged: boolean;
  timeSpent: number;
}

type QuestionFilterTab = 'all' | 'attempted' | 'unattempted' | 'marked';

export const TestRunner: React.FC<TestRunnerProps> = ({
  test,
  mode: initialMode,
  initialSession,
  currentUser,
  isDarkMode = false,
  onToggleTheme,
  onFinishTest,
  onExitTest,
}) => {
  // ==========================================
  // 2. STATE MANAGEMENT & QUESTION NORMALIZATION
  // ==========================================
  // Ensure all questions are guaranteed to have unique non-empty IDs
  const normalizedQuestions = useMemo(() => {
    return normalizeQuestions(test.questions || []);
  }, [test.questions]);

  const questionsCount = normalizedQuestions.length;

  const [hasStarted, setHasStarted] = useState<boolean>(() => initialSession?.hasStarted ?? false);
  const [mode, setMode] = useState<'timed' | 'practice'>(() => initialSession?.mode || initialMode);
  const [isPaused, setIsPaused] = useState(false);

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const rawIdx = initialSession?.currentIndex ?? 0;
    return Math.max(0, Math.min(rawIdx, Math.max(0, (test.questions?.length || 1) - 1)));
  });

  const [answers, setAnswers] = useState<Record<string, UserAnswerState>>(() => {
    const initial: Record<string, UserAnswerState> = {};
    if (initialSession?.answers) {
      const raw = initialSession.answers;
      (test.questions || []).forEach((q, idx) => {
        const qId = (q && q.id && typeof q.id === 'string' && q.id.trim() !== '') ? q.id.trim() : `q_${idx + 1}`;
        const saved = raw[qId] || (q.id ? raw[q.id] : null) || raw[`q_${idx + 1}`] || raw[String(idx)];
        if (saved) {
          initial[qId] = saved;
        }
      });
      if (Object.keys(initial).length > 0) {
        return initial;
      }
    }
    return {};
  });
  const [numericalInput, setNumericalInput] = useState('');
  
  // Modals & Drawers
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isQuestionPanelOpen, setIsQuestionPanelOpen] = useState(false);
  const [panelFilter, setPanelFilter] = useState<QuestionFilterTab>('all');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Timer states
  const totalSeconds = (test.timeLimitMinutes > 0 && mode === 'timed') ? test.timeLimitMinutes * 60 : 0;
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (initialSession?.timeLeft !== undefined) {
      return initialSession.timeLeft;
    }
    if (initialSession?.elapsedTime !== undefined && totalSeconds > 0) {
      return Math.max(0, totalSeconds - initialSession.elapsedTime);
    }
    return totalSeconds;
  });
  const [elapsedTime, setElapsedTime] = useState<number>(() => initialSession?.elapsedTime || 0);

  // Scratchpad drawing states
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#0084ff');
  const [penWidth, setPenWidth] = useState(3);
  const [isEraserMode, setIsEraserMode] = useState(false);

  // Guard to prevent re-saving active session once test is submitted
  const isSubmittedRef = useRef<boolean>(false);

  // ==========================================
  // 3. BACK NAVIGATION & HARDWARE HANDLERS
  // ==========================================
  useBackHandler({
    isOpen: showExitConfirm,
    onBack: () => setShowExitConfirm(false),
    priority: 60,
    id: 'test_exit_confirm_modal',
  });

  useBackHandler({
    isOpen: isSubmitModalOpen,
    onBack: () => setIsSubmitModalOpen(false),
    priority: 60,
    id: 'test_submit_modal',
  });

  useBackHandler({
    isOpen: isQuestionPanelOpen,
    onBack: () => setIsQuestionPanelOpen(false),
    priority: 35,
    id: 'test_question_panel',
  });

  useBackHandler({
    isOpen: showHint,
    onBack: () => setShowHint(false),
    priority: 30,
    id: 'test_hint_sheet',
  });

  const isAnyOverlayOpen = showExitConfirm || isSubmitModalOpen || showScratchpad || isQuestionPanelOpen || showHint;
  useBackHandler({
    isOpen: hasStarted && !isAnyOverlayOpen,
    onBack: () => setShowExitConfirm(true),
    priority: 15,
    id: 'test_active_exam_back',
  });

  useBackHandler({
    isOpen: !hasStarted,
    onBack: () => onExitTest(),
    priority: 15,
    id: 'test_briefing_back',
  });

  // ==========================================
  // 4. CANVAS & SCROLL LOCK SETUP
  // ==========================================
  useEffect(() => {
    if (!showScratchpad) return;

    const setupCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    const timer = setTimeout(setupCanvas, 50);
    window.addEventListener('resize', setupCanvas);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', setupCanvas);
    };
  }, [showScratchpad]);

  useScrollLock(isQuestionPanelOpen || isSubmitModalOpen || showExitConfirm || isPaused);

  // Status bar theme color synchronization for Test Runner header (#e5e9f0 light / #0b0c10 dark)
  useEffect(() => {
    const testRunnerStatusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
    const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
    if (metaThemeColors.length > 0) {
      metaThemeColors.forEach((el) => {
        el.removeAttribute('media');
        el.setAttribute('content', testRunnerStatusBarColor);
      });
    } else {
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = testRunnerStatusBarColor;
      document.head.appendChild(newMeta);
    }

    const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatusBar) {
      appleStatusBar.setAttribute('content', isDarkMode ? 'black-translucent' : 'default');
    }

    return () => {
      // Revert back to default app status bar color on exit (#e5e9f0 light / #0b0c10 dark)
      const defaultStatusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
      const currentMetas = document.querySelectorAll('meta[name="theme-color"]');
      currentMetas.forEach((el) => {
        el.removeAttribute('media');
        el.setAttribute('content', defaultStatusBarColor);
      });
    };
  }, [isDarkMode]);

  const currentQuestion: MathQuestion = normalizedQuestions[currentIndex] || normalizedQuestions[0] || {
    id: 'q_1',
    text: '',
    correctAnswer: '',
  };

  // ==========================================
  // 5. INITIALIZATIONS & QUESTION SYNC
  // ==========================================
  const questionTimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const initial: Record<string, UserAnswerState> = {};
    const initialTime: Record<string, number> = {};
    
    normalizedQuestions.forEach((q, idx) => {
      const qId = q.id || `q_${idx + 1}`;
      const savedAns = 
        initialSession?.answers?.[qId] || 
        (test.questions[idx]?.id ? initialSession?.answers?.[test.questions[idx].id!] : null) ||
        initialSession?.answers?.[`q_${idx + 1}`] || 
        initialSession?.answers?.[String(idx)];

      initial[qId] = savedAns || { selectedOption: '', flagged: false, timeSpent: 0 };
      initialTime[qId] = savedAns?.timeSpent || 0;
    });

    setAnswers((prev) => {
      const next: Record<string, UserAnswerState> = { ...initial };
      // Preserve any previously user-modified answers in local state for valid question IDs
      Object.entries(prev).forEach(([k, val]) => {
        const v = val as Partial<UserAnswerState> | undefined;
        if (k && k !== 'undefined' && k !== '' && v) {
          next[k] = {
            selectedOption: v.selectedOption || '',
            flagged: Boolean(v.flagged),
            timeSpent: v.timeSpent || 0,
          };
        }
      });
      return next;
    });
    questionTimeRef.current = initialTime;
  }, [normalizedQuestions, initialSession]);

  // Session State Ref & Coalesced Persistence Engine
  // Maintains an in-memory session reference continuously updated with 0 disk I/O
  const sessionRef = useRef<ActiveTestSession | null>(null);
  const saveDebounceTimerRef = useRef<any>(null);

  // Keep sessionRef synchronized continuously in-memory without disk overhead
  useEffect(() => {
    if (!hasStarted || isSubmittedRef.current) return;

    sessionRef.current = {
      testId: test.id,
      test: {
        ...test,
        questions: normalizedQuestions,
      },
      mode,
      hasStarted: true,
      currentIndex,
      answers,
      elapsedTime,
      timeLeft,
      updatedAt: new Date().toISOString(),
    };
  }, [hasStarted, test, normalizedQuestions, mode, currentIndex, answers, elapsedTime, timeLeft]);

  // Coalesced persistence on question navigation or answer modifications (1000ms debounce window)
  useEffect(() => {
    if (!hasStarted || isSubmittedRef.current) {
      return;
    }

    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }

    saveDebounceTimerRef.current = setTimeout(() => {
      saveDebounceTimerRef.current = null;
      if (sessionRef.current && !isSubmittedRef.current) {
        saveScopedActiveSession(currentUser?.uid, sessionRef.current, test.id);
      }
    }, 1000);

    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
    };
  }, [hasStarted, currentIndex, answers, test.id, currentUser?.uid]);

  // Guaranteed instant flush on page unload/hide (registered ONCE on mount, 0 listener churn)
  useEffect(() => {
    const handleImmediateSave = () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
      if (sessionRef.current && !isSubmittedRef.current) {
        saveScopedActiveSession(currentUser?.uid, sessionRef.current, test.id);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleImmediateSave();
      }
    };

    window.addEventListener('beforeunload', handleImmediateSave);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleImmediateSave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser?.uid, test.id]);

  useEffect(() => {
    if (currentQuestion && currentQuestion.id) {
      setNumericalInput(answers[currentQuestion.id]?.selectedOption || '');
      setShowHint(false);
    }
  }, [currentIndex, currentQuestion]);

  // Refs for event listeners & timers
  const currentQuestionRef = useRef(currentQuestion);
  currentQuestionRef.current = currentQuestion;

  const currentQuestionIdRef = useRef(currentQuestion?.id);
  currentQuestionIdRef.current = currentQuestion?.id;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const questionsCountRef = useRef(questionsCount);
  questionsCountRef.current = questionsCount;

  const handleSelectOptionRef = useRef<(opt: string) => void>(() => {});
  const handleToggleFlagRef = useRef<() => void>(() => {});
  const handleSubmitTestRef = useRef<() => void>(() => {});

  // ==========================================
  // 6. KEYBOARD SHORTCUTS & BROWSER INTERCEPT
  // ==========================================
  useEffect(() => {
    if (!hasStarted) return;

    window.history.pushState({ testInProgress: true }, '');

    const handlePopState = () => {
      window.history.pushState({ testInProgress: true }, '');
      setShowExitConfirm(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          (target.getAttribute && target.getAttribute('role') === 'textbox'))
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isQuestionPanelOpen) {
          setIsQuestionPanelOpen(false);
        } else if (isSubmitModalOpen) {
          setIsSubmitModalOpen(false);
        } else {
          setShowExitConfirm(true);
        }
        return;
      }

      if (isPausedRef.current || isSubmitModalOpen) return;

      const key = e.key.toLowerCase();
      const code = e.code;

      if (key === 'p' || code === 'KeyP') {
        e.preventDefault();
        setIsQuestionPanelOpen((prev) => !prev);
        return;
      }

      if (isQuestionPanelOpen) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(questionsCountRef.current - 1, prev + 1));
      } else if (key === 'm' || code === 'KeyM') {
        e.preventDefault();
        handleToggleFlagRef.current();
      } else {
        // Option selection keys: A, B, C, D, E, F or 1, 2, 3, 4, 5, 6
        let optIdx: number | null = null;
        if (key === 'a' || code === 'KeyA' || key === '1' || code === 'Digit1' || code === 'Numpad1') optIdx = 0;
        else if (key === 'b' || code === 'KeyB' || key === '2' || code === 'Digit2' || code === 'Numpad2') optIdx = 1;
        else if (key === 'c' || code === 'KeyC' || key === '3' || code === 'Digit3' || code === 'Numpad3') optIdx = 2;
        else if (key === 'd' || code === 'KeyD' || key === '4' || code === 'Digit4' || code === 'Numpad4') optIdx = 3;
        else if (key === 'e' || code === 'KeyE' || key === '5' || code === 'Digit5' || code === 'Numpad5') optIdx = 4;
        else if (key === 'f' || code === 'KeyF' || key === '6' || code === 'Digit6' || code === 'Numpad6') optIdx = 5;

        if (optIdx !== null) {
          const q = currentQuestionRef.current;
          if (q && isMcqQuestion(q) && Array.isArray(q.options) && optIdx < q.options.length) {
            e.preventDefault();
            handleSelectOptionRef.current(q.options[optIdx]);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasStarted, isQuestionPanelOpen, isSubmitModalOpen]);

  // ==========================================
  // 7. ROBUST TIMER & TRACKING ENGINE
  // ==========================================
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);
  const initialElapsedRef = useRef<number>(initialSession?.elapsedTime || 0);

  useEffect(() => {
    if (hasStarted) {
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      pauseStartRef.current = 0;
      initialElapsedRef.current = initialSession?.elapsedTime || 0;
    }
  }, [hasStarted, initialSession]);

  useEffect(() => {
    if (isPaused) {
      pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current > 0) {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
  }, [isPaused]);

  useEffect(() => {
    if (!hasStarted || isPaused) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const currentRunSecs = Math.floor((now - startTimeRef.current - pausedDurationRef.current) / 1000);
      const totalElapsedSecs = initialElapsedRef.current + currentRunSecs;
      
      setElapsedTime(totalElapsedSecs);

      const activeQId = currentQuestionIdRef.current;
      if (activeQId) {
        questionTimeRef.current[activeQId] = (questionTimeRef.current[activeQId] || 0) + 1;
      }

      if (mode === 'timed' && totalSeconds > 0) {
        const remaining = Math.max(0, totalSeconds - totalElapsedSecs);
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          handleSubmitTestRef.current();
        }
      }

      // Periodically persist session every 60 seconds to minimize disk I/O
      if (totalElapsedSecs > 0 && totalElapsedSecs % 60 === 0) {
        if (sessionRef.current && !isSubmittedRef.current) {
          saveScopedActiveSession(currentUser?.uid, {
            ...sessionRef.current,
            elapsedTime: totalElapsedSecs,
            timeLeft: mode === 'timed' && totalSeconds > 0 ? Math.max(0, totalSeconds - totalElapsedSecs) : timeLeft,
            updatedAt: new Date().toISOString(),
          }, test.id);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [hasStarted, isPaused, mode, totalSeconds]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  // ==========================================
  // 8. HANDLERS (SELECTION, SUBMISSION)
  // ==========================================
  const handleStartExam = () => setHasStarted(true);

  const handleSelectOption = (option: string) => {
    const q = currentQuestionRef.current;
    if (!q || !q.id) return;
    const qId = q.id;
    setAnswers((prev) => {
      const currentSelected = prev[qId]?.selectedOption;
      const nextOption = currentSelected === option ? '' : option;
      return {
        ...prev,
        [qId]: {
          selectedOption: nextOption,
          flagged: prev[qId]?.flagged || false,
          timeSpent: prev[qId]?.timeSpent || 0,
        },
      };
    });
  };
  handleSelectOptionRef.current = handleSelectOption;

  const handleNumericalChange = (value: string) => {
    setNumericalInput(value);
    const q = currentQuestionRef.current;
    if (!q || !q.id) return;
    const qId = q.id;
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        selectedOption: value,
        flagged: prev[qId]?.flagged || false,
        timeSpent: prev[qId]?.timeSpent || 0,
      },
    }));
  };

  const handleToggleFlag = () => {
    const q = currentQuestionRef.current;
    if (!q || !q.id) return;
    const qId = q.id;
    setAnswers((prev) => {
      const currentEntry = prev[qId] || { selectedOption: '', flagged: false, timeSpent: 0 };
      return {
        ...prev,
        [qId]: {
          ...currentEntry,
          flagged: !currentEntry.flagged,
        },
      };
    });
  };
  handleToggleFlagRef.current = handleToggleFlag;

  const handleSubmitTest = () => {
    if (isSubmittingTest) return;
    setIsSubmittingTest(true);
    setIsSubmitModalOpen(false);

    try {
      let score = 0;
      let totalPoints = 0;
      const formattedAnswers: Record<string, QuestionAnswer> = {};

      normalizedQuestions.forEach((q) => {
        const qPoints = q.points || 1;
        totalPoints += qPoints;
        const rawAns = answers[q.id]?.selectedOption;
        const userAns = String(rawAns !== undefined && rawAns !== null ? rawAns : '').trim();

        let isCorrect = false;
        if (isMcqQuestion(q) && q.options && q.options.length > 0) {
          isCorrect = q.options.some((opt, idx) => 
            checkIsOptionSelected(opt, idx, userAns, q.options) && checkIsOptionCorrect(opt, idx, q)
          ) || checkIsOptionCorrect(userAns, -1, q);
        } else {
          const userNum = parseFloat(userAns);
          const correctNum = parseFloat(String(q.correctAnswer ?? ''));
          if (!isNaN(userNum) && !isNaN(correctNum)) {
            isCorrect = Math.abs(userNum - correctNum) < 0.001;
          } else {
            isCorrect = checkIsOptionCorrect(userAns, -1, q);
          }
        }

        if (isCorrect) score += qPoints;

        formattedAnswers[q.id] = {
          questionId: q.id,
          selectedOption: userAns,
          isCorrect,
          flagged: Boolean(answers[q.id]?.flagged),
          timeSpentSeconds: Number(questionTimeRef.current[q.id] || answers[q.id]?.timeSpent || 0),
        };
      });

      const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
      const passed = percentage >= (test.passingScorePercentage || 60);

      const activeUser = currentUser || auth.currentUser;
      const attemptUid = activeUser?.uid || 'guest-user';
      const attemptEmail = activeUser?.email || '';
      const attemptName = activeUser?.displayName || (attemptEmail ? attemptEmail.split('@')[0] : 'Guest');

      const attempt: TestAttempt = {
        id: `attempt_online_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        testId: test.id,
        testTitle: test.title,
        testTopic: test.topic,
        userId: attemptUid,
        userEmail: attemptEmail,
        userName: attemptName,
        score,
        totalPoints,
        percentage,
        passed,
        timeSpentSeconds: elapsedTime,
        answers: formattedAnswers,
        attemptMode: 'online',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      isSubmittedRef.current = true;
      clearScopedActiveSession(attemptUid !== 'guest-user' ? attemptUid : null, test.id);
      clearScopedActiveSession(null, test.id);
      clearScopedActiveSession('guest-user', test.id);
      onFinishTest(attempt);
    } catch (err) {
      console.error('Error during handleSubmitTest evaluation:', err);
      // Fallback submission to ensure user never gets stuck
      const activeUser = currentUser || auth.currentUser;
      const fallbackUid = activeUser?.uid || 'guest-user';
      const fallbackEmail = activeUser?.email || '';
      const fallbackAttempt: TestAttempt = {
        id: `attempt_online_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        testId: test.id,
        testTitle: test.title,
        testTopic: test.topic,
        userId: fallbackUid,
        userEmail: fallbackEmail,
        userName: activeUser?.displayName || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Guest'),
        score: 0,
        totalPoints: normalizedQuestions.length,
        percentage: 0,
        passed: false,
        timeSpentSeconds: elapsedTime,
        answers: {},
        attemptMode: 'online',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      isSubmittedRef.current = true;
      clearScopedActiveSession(currentUser?.uid, test.id);
      clearScopedActiveSession(null, test.id);
      clearScopedActiveSession('guest-user', test.id);
      onFinishTest(fallbackAttempt);
    } finally {
      setIsSubmittingTest(false);
    }
  };
  handleSubmitTestRef.current = handleSubmitTest;

  // ==========================================
  // 9. METRICS & COMPUTED VALUES
  // ==========================================
  const markedCount = useMemo(() => {
    return normalizedQuestions.filter((q) => !!answers[q.id]?.flagged).length;
  }, [normalizedQuestions, answers]);

  const unattemptedCount = useMemo(() => {
    return normalizedQuestions.filter((q) => !answers[q.id]?.selectedOption).length;
  }, [normalizedQuestions, answers]);

  const attemptedCount = normalizedQuestions.length - unattemptedCount;

  const filteredQuestionList = useMemo(() => {
    return normalizedQuestions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
      const ans = answers[q.id];
      const isAttempted = !!ans?.selectedOption;
      const isMarked = !!ans?.flagged;

      if (panelFilter === 'attempted') return isAttempted;
      if (panelFilter === 'unattempted') return !isAttempted;
      if (panelFilter === 'marked') return isMarked;
      return true;
    });
  }, [normalizedQuestions, answers, panelFilter]);

  // ==========================================
  // 10. RENDER: BRIEFING SCREEN (VIEW 1)
  // ==========================================
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col justify-between transition-colors duration-200">
        {/* Top Header */}
        <header className="bg-[#e5e9f0] dark:bg-[#0b0c10] border-b-0 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2.5 sm:pb-3 flex items-center justify-between gap-2.5 max-w-full shrink-0 sticky top-0 z-20 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            <span className="w-3 h-3 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate min-w-0" title={test.title}>
              {test.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] font-mono text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <span>{test.timeLimitMinutes > 0 ? `${test.timeLimitMinutes.toString().padStart(2, '0')}:00` : 'Untimed'}</span>
            </div>

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                title="Toggle Theme"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0"
              >
                {isDarkMode ? <Sun className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#0b57d0]" />}
              </button>
            )}

            <button
              onClick={onExitTest}
              title="Exit to Dashboard"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0"
            >
              <X className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        {/* Main Briefing Content */}
        <main className="max-w-md w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center items-center">
          <div className="bg-white dark:bg-[#1e2024] rounded-[24px] p-8 sm:p-10 w-full text-center space-y-6 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 ring-0">
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] text-[11px] font-bold uppercase tracking-wider border-0 ring-0">
                {test.topic || test.title}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              {test.title}
            </h2>

            <p className="text-[#5e5e5e] dark:text-[#9aa0a6] text-sm sm:text-base font-normal leading-relaxed max-w-sm mx-auto">
              {test.description || 'Practice and improve your skills with comprehensive questions and solutions.'}
            </p>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-[#f0f4f9] dark:bg-[#141619] p-5 sm:p-6 rounded-[20px] border-0 ring-0 text-center flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider block mb-1">
                  QUESTIONS
                </span>
                <span className="text-2xl sm:text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono">
                  {test.questions.length}
                </span>
              </div>

              <div className="bg-[#f0f4f9] dark:bg-[#141619] p-5 sm:p-6 rounded-[20px] border-0 ring-0 text-center flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider block mb-1">
                  TIME
                </span>
                <span className="text-2xl sm:text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono">
                  {test.timeLimitMinutes > 0 ? `${test.timeLimitMinutes.toString().padStart(2, '0')}:00` : 'Untimed'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                id="start-exam-btn"
                onClick={handleStartExam}
                className="w-full sm:w-auto px-9 py-3.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#062e6f] active:scale-95 font-bold text-base rounded-full transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.12)] border-0 ring-0 outline-none relative overflow-hidden group"
              >
                <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                <span>Start</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="py-4 text-center text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
          MockMc Assessment Platform
        </footer>
      </div>
    );
  }

  // ==========================================
  // 11. RENDER: ACTIVE TEST SCREEN (VIEW 2)
  // ==========================================
  return (
    <div className="fixed inset-0 z-30 bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col h-[100dvh] max-h-screen overflow-hidden transition-colors duration-200">
      {/* Top Active Header */}
      <header className="bg-[#e5e9f0] dark:bg-[#0b0c10] px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2.5 sm:pb-3 flex items-center justify-between gap-2.5 shrink-0 z-20 transition-colors max-w-full border-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          <span className="w-3 h-3 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate min-w-0" title={test.title}>
            {test.title}
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {mode === 'timed' && totalSeconds > 0 ? (
            <div className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 ring-0 font-mono text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <span>{formatTime(timeLeft)}</span>
            </div>
          ) : (
            <div className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 ring-0 font-mono text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <span>{formatTime(elapsedTime)}</span>
            </div>
          )}

          {mode === 'timed' && (
            <button
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume Test" : "Pause Test"}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${
                isPaused 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
              }`}
            >
              {isPaused ? <Play className="w-4.5 h-4.5 sm:w-5 sm:h-5 fill-current ml-0.5" /> : <Pause className="w-4.5 h-4.5 sm:w-5 sm:h-5 fill-current" />}
            </button>
          )}

          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={isDarkMode ? "Light mode" : "Dark mode"}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0"
            >
              {isDarkMode ? <Sun className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#0b57d0]" />}
            </button>
          )}

          <button
            onClick={() => setIsQuestionPanelOpen(true)}
            title="Open Question Palette & Settings"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center transition-all active:scale-95 shrink-0 relative cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0"
          >
            <Menu className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Exit Confirmation Dialog */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] p-6 sm:p-7 rounded-[24px] max-w-sm w-full text-center space-y-4 shadow-[0_2px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] border-0 ring-0"
            >
              <div className="w-11 h-11 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">Leave Active Test?</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Your test session will be saved so you can resume anytime.
              </p>
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-[#222634] text-[#1d283a] dark:text-zinc-200 font-semibold text-xs rounded-full hover:bg-[#dedcd6] dark:hover:bg-[#282a39] transition-all cursor-pointer"
                >
                  Continue Test
                </button>
                <button
                  onClick={() => {
                    setShowExitConfirm(false);
                    saveScopedActiveSession(currentUser?.uid, {
                      testId: test.id,
                      test,
                      mode,
                      hasStarted: true,
                      currentIndex,
                      answers,
                      elapsedTime,
                      timeLeft,
                      updatedAt: new Date().toISOString(),
                    }, test.id);
                    onExitTest();
                  }}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-full transition-all cursor-pointer"
                >
                  Exit & Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paused Fullscreen Shield */}
      <AnimatePresence>
        {isPaused && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 bg-slate-100/90 dark:bg-[#0b0c10]/95 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] p-7 sm:p-9 rounded-[24px] max-w-md w-full text-center space-y-5 shadow-[0_2px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] border-0 ring-0"
            >
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Pause className="w-7 h-7 fill-current" />
              </div>
              
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Exam Paused</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                  The test timer is paused and question content is concealed. Resume when you're ready to proceed.
                </p>
              </div>

              <div className="bg-slate-100 dark:bg-[#222634] text-[#1d283a] dark:text-zinc-200 p-3.5 rounded-2xl flex items-center justify-around text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold block">Remaining Time</span>
                  <span className="font-mono text-base font-bold text-slate-800 dark:text-zinc-200">
                    {mode === 'timed' ? formatTime(timeLeft) : formatTime(elapsedTime)}
                  </span>
                </div>
                <div className="h-7 w-px bg-[#e2e5ec] dark:bg-[#343845]" />
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold block">Current Item</span>
                  <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">
                    Q{currentIndex + 1} / {normalizedQuestions.length}
                  </span>
                </div>
              </div>

              <button
                id="resume-test-btn"
                onClick={() => setIsPaused(false)}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Exam</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Question Display Area */}
      <main className={`max-w-3xl w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-6 flex-1 overflow-y-auto min-h-0 flex flex-col justify-start overflow-x-hidden ${isPaused ? 'invisible pointer-events-none' : ''}`}>
        <div 
          id={`active-question-card-${currentIndex}`}
          className="bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] p-4 sm:p-6 relative space-y-4 max-w-full"
        >
          <div className="text-[#1f1f1f] dark:text-[#e3e3e3] text-[18px] sm:text-[19px] font-medium leading-relaxed max-w-full">
            <div className="flex items-start gap-1 sm:gap-1.5 max-w-full">
              <span className="font-bold shrink-0 text-[18px] sm:text-[19px] pt-0.5 select-none text-[#0b57d0] dark:text-[#a8c7fa]">
                {currentIndex + 1}.
              </span>
              <div className="flex-1 min-w-0 max-w-full text-[18px] sm:text-[19px] font-medium leading-relaxed overflow-x-auto overflow-y-hidden">
                <MathRenderer content={currentQuestion.text} />
              </div>
            </div>

            {/* Question Diagram / Image (Statics, Dynamics, Conic Sections, etc.) */}
            {(currentQuestion.imageUrl || (Array.isArray(currentQuestion.imageUrls) && currentQuestion.imageUrls.some(Boolean))) && (
              <QuestionDiagramViewer 
                imageUrl={currentQuestion.imageUrl} 
                imageUrls={currentQuestion.imageUrls}
                imageWidths={currentQuestion.imageWidths}
                alt={`Question ${currentIndex + 1} Diagram`} 
                width={currentQuestion.imageWidth}
              />
            )}
          </div>

            {isMcqQuestion(currentQuestion) && currentQuestion.options && (
              <div className="space-y-2.5 pt-1 max-w-full">
                {currentQuestion.options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isSelected = checkIsOptionSelected(opt, idx, answers[currentQuestion.id]?.selectedOption, currentQuestion.options);
                  const userSelectedOpt = answers[currentQuestion.id]?.selectedOption;
                  const isPractice = mode === 'practice';
                  
                  const isCorrectOpt = checkIsOptionCorrect(opt, idx, currentQuestion);
                  const isUserChoice = isSelected;

                  let optionClasses = 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-medium border border-slate-300 dark:border-zinc-700 shadow-none';
                  let badgeClasses = 'bg-white dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border border-slate-300 dark:border-zinc-700';
                  let statusBadge = null;

                  if (isPractice && userSelectedOpt) {
                    if (isCorrectOpt) {
                      optionClasses = 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0] font-bold border border-[#1b6d3b] dark:border-emerald-400 shadow-none';
                      badgeClasses = 'bg-[#1b6d3b] text-white font-black border-0';
                      statusBadge = (
                        <span className="px-3 py-1 rounded-full bg-[#1b6d3b] text-white text-[11px] font-bold flex items-center gap-1 shrink-0 ml-auto">
                          <Check className="w-3 h-3 stroke-[3]" /> Correct
                        </span>
                      );
                    } else if (isUserChoice && !isCorrectOpt) {
                      optionClasses = 'bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200 font-bold border border-rose-600 dark:border-rose-400 shadow-none';
                      badgeClasses = 'bg-rose-600 dark:bg-rose-500 text-white font-black border-0';
                      statusBadge = (
                        <span className="px-3 py-1 rounded-full bg-rose-600 dark:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 ml-auto">
                          <X className="w-3 h-3 stroke-[3]" /> Incorrect
                        </span>
                      );
                    }
                  } else if (isSelected) {
                    optionClasses = 'bg-[#d3e3fd]/80 dark:bg-[#004a77]/60 text-[#041e49] dark:text-[#c2e7ff] font-bold border border-[#0b57d0] dark:border-[#a8c7fa] shadow-none';
                    badgeClasses = 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#062e6f] font-black border-0';
                  }

                  return (
                    <button
                      key={`${currentQuestion.id || currentIndex}-opt-${idx}`}
                      onClick={() => handleSelectOption(opt)}
                      style={{ borderWidth: '1px' }}
                      className={`w-full max-w-full box-border text-left px-4 py-3 min-h-[44px] rounded-[20px] transition-all flex items-start gap-3 cursor-pointer select-none active:scale-[0.99] ${optionClasses}`}
                    >
                      <div
                        className={`w-7.5 h-7.5 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 ${badgeClasses}`}
                      >
                        {letter}
                      </div>

                      <div className="flex-1 min-w-0 max-w-full text-[17px] sm:text-[18px] font-medium leading-snug py-0.5">
                        <MathRenderer content={opt} />
                      </div>

                      {statusBadge && <div className="shrink-0 ml-auto mt-0.5">{statusBadge}</div>}
                    </button>
                  );
                })}
              </div>
            )}

            {!isMcqQuestion(currentQuestion) && (
              <div className="space-y-3 p-5 bg-[#f0f4f9] dark:bg-[#141619] rounded-[20px] border border-slate-200/90 dark:border-zinc-700/60 ring-1 ring-slate-200/50 dark:ring-zinc-700/30">
                <label className="text-sm font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] block">
                  Enter numerical answer:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4 or 3.14"
                  value={numericalInput}
                  onChange={(e) => handleNumericalChange(e.target.value)}
                  className="w-full max-w-sm px-5 py-3 text-[19px] sm:text-[20px] font-medium bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] rounded-full focus:outline-none focus:ring-2 focus:ring-[#0b57d0] border border-slate-200 dark:border-zinc-700"
                />
              </div>
            )}

            {mode === 'practice' && currentQuestion.hint && (
              <div className="mt-4 pt-4">
                {showHint ? (
                  <div className="p-5 bg-[#ffe088]/20 dark:bg-[#5b4300]/30 rounded-[20px] text-[19px] sm:text-[20px] font-medium text-[#241a00] dark:text-[#ffe088] leading-relaxed border border-amber-300/60 dark:border-amber-700/40">
                    <span className="font-bold block mb-1">💡 Solution Hint:</span>
                    <MathRenderer content={currentQuestion.hint} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowHint(true)}
                    className="flex items-center gap-2 text-sm sm:text-base text-[#0b57d0] dark:text-[#a8c7fa] hover:underline font-semibold cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>Show Hint</span>
                  </button>
                )}
              </div>
            )}
          </div>
      </main>

      {/* Fixed Non-Scrollable Bottom Navigation Bar */}
      <footer className="shrink-0 z-40 py-2.5 px-3 pb-[calc(max(0.75rem,env(safe-area-inset-bottom,0px))+0.25rem)] sm:pb-3 sm:px-4 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 shadow-none">
        <div className="w-full max-w-md mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <motion.button
            type="button"
            id="test-prev-btn"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            whileTap={currentIndex > 0 ? { scale: 0.95 } : undefined}
            className="w-[125px] sm:w-[140px] h-10 px-4 rounded-full bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] disabled:opacity-38 disabled:pointer-events-none flex items-center justify-center gap-1.5 font-medium text-xs sm:text-sm transition-all cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Previous</span>
          </motion.button>

          <motion.button
            type="button"
            id="test-mark-review-btn"
            onClick={handleToggleFlag}
            whileTap={{ scale: 0.92 }}
            title={answers[currentQuestion?.id]?.flagged ? "Marked for Review (Click to Unmark)" : "Mark for Review"}
            aria-label={answers[currentQuestion?.id]?.flagged ? "Marked for Review" : "Mark for Review"}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer select-none border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${
              answers[currentQuestion?.id]?.flagged
                ? 'bg-[#ffe088] text-[#241a00] dark:bg-[#5b4300] dark:text-[#ffe088]'
                : 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]'
            }`}
          >
            <motion.div
              key={answers[currentQuestion?.id]?.flagged ? 'flagged' : 'unflagged'}
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center"
            >
              <Bookmark className={`w-4 h-4 shrink-0 ${answers[currentQuestion?.id]?.flagged ? 'fill-current stroke-[2.2]' : 'stroke-[2.2]'}`} />
            </motion.div>
          </motion.button>

          {currentIndex < normalizedQuestions.length - 1 ? (
            <motion.button
              type="button"
              id="test-next-btn"
              onClick={() => setCurrentIndex((prev) => prev + 1)}
              whileTap={{ scale: 0.95 }}
              className="w-[125px] sm:w-[140px] h-10 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#041e49] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#062e6f] flex items-center justify-center gap-1.5 font-medium text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              id="test-submit-btn"
              onClick={() => setIsSubmitModalOpen(true)}
              whileTap={{ scale: 0.95 }}
              className="w-[125px] sm:w-[140px] h-10 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#041e49] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#062e6f] flex items-center justify-center gap-1.5 font-medium text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shrink-0 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Submit</span>
            </motion.button>
          )}
        </div>
      </footer>

      {renderQuestionPanel()}

      {/* Confirmation Submit Modal with Google Motion */}
      <AnimatePresence>
        {isSubmitModalOpen && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] rounded-[24px] max-w-md w-full p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.5)] space-y-5 border-0 ring-0"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 text-center">
                Submit Test for Evaluation?
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 text-center">
                Review your question attempts summary before finalizing your submission.
              </p>

              <div className="bg-slate-100 dark:bg-[#222634] rounded-2xl p-4 space-y-2.5 text-xs text-slate-700 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span>Total Questions:</span>
                  <span className="font-bold text-slate-900 dark:text-zinc-100">{normalizedQuestions.length}</span>
                </div>
                <div className="flex justify-between text-blue-600 dark:text-blue-400 font-semibold">
                  <span>Attempted:</span>
                  <span>{attemptedCount}</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-semibold">
                  <span>Unattempted:</span>
                  <span>{unattemptedCount}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-semibold">
                  <span>Marked for Review:</span>
                  <span>{markedCount}</span>
                </div>
                <div className="flex justify-between text-slate-900 dark:text-zinc-100 pt-2 font-mono font-bold">
                  <span>Time Spent:</span>
                  <span>{formatTime(elapsedTime)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingTest}
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-[#1d283a] dark:text-zinc-200 bg-slate-100 dark:bg-[#222634] hover:bg-[#dedcd6] dark:hover:bg-[#282a39] disabled:opacity-50 rounded-full transition-colors text-center cursor-pointer"
                >
                  Continue Test
                </button>
                <button
                  type="button"
                  disabled={isSubmittingTest}
                  onClick={handleSubmitTest}
                  className="flex-1 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-full shadow-md transition-all active:scale-98 text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingTest ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Confirm & Submit</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ==========================================
  // 12. QUESTION PALETTE DRAWER COMPONENT
  // ==========================================
  function renderQuestionPanel() {
    const progressPercentage = normalizedQuestions.length > 0 
      ? Math.round((attemptedCount / normalizedQuestions.length) * 100) 
      : 0;

    return typeof document !== 'undefined' ? createPortal(
      <AnimatePresence>
        {isQuestionPanelOpen && (
          <motion.div 
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 bg-black/40 flex justify-end z-50 cursor-pointer select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsQuestionPanelOpen(false);
            }}
          >
            <motion.div 
              variants={studioDrawerRightVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] w-[88vw] max-w-[340px] sm:max-w-sm h-full flex flex-col justify-between shadow-2xl rounded-l-[24px] overflow-hidden touch-pan-y cursor-default drawer-panel relative border-0 ring-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Section */}
              <div className="p-4 sm:p-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] shrink-0 space-y-3.5 border-b border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                      Question Palette
                    </h3>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff]">
                      {progressPercentage}%
                    </span>
                  </div>
                  <button
                    onClick={() => setIsQuestionPanelOpen(false)}
                    title="Close Panel"
                    className="w-8 h-8 rounded-full bg-[#f0f4f9] hover:bg-[#e2e8f0] dark:bg-[#282a30] dark:hover:bg-[#343740] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-colors cursor-pointer border-0 ring-0 shadow-xs"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-semibold text-[#0b57d0] dark:text-[#a8c7fa]">
                      <span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" /> {attemptedCount} Done
                    </span>
                    <span className="text-[#5e5e5e] opacity-40">•</span>
                    <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400" /> {unattemptedCount} Left
                    </span>
                    {markedCount > 0 && (
                      <>
                        <span className="text-[#5e5e5e] opacity-40">•</span>
                        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400" /> {markedCount} Marked
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{attemptedCount}/{normalizedQuestions.length}</span>
                </div>

                {/* Filter Pills */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    onClick={() => setPanelFilter('all')}
                    className={`py-1.5 px-2 rounded-full text-xs font-semibold text-center transition-all truncate cursor-pointer border-0 ring-0 outline-none ${
                      panelFilter === 'all'
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs font-bold'
                        : 'bg-[#f0f4f9] dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e2e8f0] dark:hover:bg-[#343740]'
                    }`}
                  >
                    All ({normalizedQuestions.length})
                  </button>

                  <button
                    onClick={() => setPanelFilter('attempted')}
                    className={`py-1.5 px-2 rounded-full text-xs font-semibold text-center transition-all truncate cursor-pointer border-0 ring-0 outline-none ${
                      panelFilter === 'attempted'
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs font-bold'
                        : 'bg-[#f0f4f9] dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e2e8f0] dark:hover:bg-[#343740]'
                    }`}
                  >
                    Attempted ({attemptedCount})
                  </button>

                  <button
                    onClick={() => setPanelFilter('unattempted')}
                    className={`py-1.5 px-2 rounded-full text-xs font-semibold text-center transition-all truncate cursor-pointer border-0 ring-0 outline-none ${
                      panelFilter === 'unattempted'
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs font-bold'
                        : 'bg-[#f0f4f9] dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e2e8f0] dark:hover:bg-[#343740]'
                    }`}
                  >
                    Unattempted ({unattemptedCount})
                  </button>

                  <button
                    onClick={() => setPanelFilter('marked')}
                    className={`py-1.5 px-2 rounded-full text-xs font-semibold text-center transition-all truncate cursor-pointer border-0 ring-0 outline-none ${
                      panelFilter === 'marked'
                        ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs font-bold'
                        : 'bg-[#f0f4f9] dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e2e8f0] dark:hover:bg-[#343740]'
                    }`}
                  >
                    Marked ({markedCount})
                  </button>
                </div>
              </div>

              {/* Middle Section: Questions Grid directly in white card paper */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 bg-white dark:bg-[#1e2024]">
                {filteredQuestionList.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      No questions in the "{panelFilter}" filter.
                    </p>
                    <button
                      onClick={() => setPanelFilter('all')}
                      className="px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:text-[#062e6f] text-xs font-bold rounded-full cursor-pointer border-0 ring-0 outline-none shadow-xs"
                    >
                      Show All Questions
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2.5 sm:gap-3 justify-items-center py-1">
                    {filteredQuestionList.map(({ q, idx }) => {
                      const ans = answers[q.id];
                      const isAttempted = !!ans?.selectedOption;
                      const isMarked = !!ans?.flagged;
                      const isCurrent = idx === currentIndex;

                      let circleColor = 'bg-rose-500 text-white';
                      if (isAttempted && isMarked) {
                        circleColor = 'bg-purple-600 text-white';
                      } else if (isAttempted) {
                        circleColor = 'bg-[#0b57d0] text-white';
                      } else if (isMarked) {
                        circleColor = 'bg-amber-500 text-white';
                      }

                      return (
                        <button
                          key={`runner-drawer-${q.id}-${idx}`}
                          onClick={() => {
                            setCurrentIndex(idx);
                            setIsQuestionPanelOpen(false);
                            if (!hasStarted) setHasStarted(true);
                          }}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center transition-all cursor-pointer border-0 ring-0 ${circleColor} ${
                            isCurrent 
                              ? 'font-extrabold scale-110 ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] ring-offset-2 ring-offset-white dark:ring-offset-[#1e2024] shadow-md' 
                              : 'hover:scale-105 shadow-xs'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Submit Action */}
              <div className="p-4 sm:p-5 pt-3 pb-[calc(max(1rem,env(safe-area-inset-bottom,0px))+0.5rem)] shrink-0 border-t border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-[#1e2024]">
                <button
                  onClick={() => {
                    setIsQuestionPanelOpen(false);
                    setIsSubmitModalOpen(true);
                  }}
                  className="w-full py-3.5 bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#041e49] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#062e6f] font-bold text-sm rounded-full transition-all active:scale-98 text-center cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.12)] border-0 ring-0 outline-none"
                >
                  Submit ({attemptedCount}/{normalizedQuestions.length})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    ) : null;
  }
};