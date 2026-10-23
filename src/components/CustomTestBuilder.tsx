import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  studioTabVariants,
  studioStaggerContainer,
  studioStaggerItem,
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { 
  Layers, 
  SlidersHorizontal,
  Check, 
  CheckSquare, 
  Square, 
  Clock, 
  Play, 
  FileCheck2,
  Save, 
  ArrowLeft, 
  ChevronDown, 
  ChevronUp, 
  Bookmark, 
  XCircle, 
  CheckCircle2, 
  Filter,
  Sparkles,
  RotateCcw,
  BookOpen,
  Search,
  Zap,
  Shuffle,
  Keyboard,
  HelpCircle,
  Target,
  X
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import type { MathTest, MathQuestion, TestAttempt } from '../types';
import type { User } from 'firebase/auth';
import { useBackHandler } from '../hooks/useBackNavigation';
import { APP_STYLES } from './ui/AppStyles';

interface CustomTestBuilderProps {
  tests: MathTest[];
  attempts: TestAttempt[];
  currentUser: User | null;
  onStartCustomTest: (test: MathTest, mode: 'timed' | 'practice') => void;
  onStartOmrCustomTest?: (test: MathTest) => void;
  onSaveCustomTest: (test: MathTest) => void;
  onCancel: () => void;
}

type QuestionCategory = 'all' | 'wrong' | 'marked' | 'unattempted';

export const CustomTestBuilder: React.FC<CustomTestBuilderProps> = ({
  tests,
  attempts,
  currentUser,
  onStartCustomTest,
  onStartOmrCustomTest,
  onSaveCustomTest,
  onCancel,
}) => {
  const [customTitle, setCustomTitle] = useState('Custom Revision Test');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [expandedTestIds, setExpandedTestIds] = useState<Set<string>>(() => new Set());
  const [activeFilterTopic, setActiveFilterTopic] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState<boolean>(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<boolean>(false);
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Time Limit: 1 min per question default (dynamically tracked unless manually edited)
  const [isManualTime, setIsManualTime] = useState<boolean>(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0);

  const topicDropdownRef = useRef<HTMLDivElement | null>(null);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(e.target as Node)) {
        setIsTopicDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // System navigation back gesture & button handling
  useBackHandler({
    isOpen: isFilterDropdownOpen,
    onBack: () => setIsFilterDropdownOpen(false),
    priority: 26,
    id: 'custom_builder_filter_dropdown',
  });

  useBackHandler({
    isOpen: isTopicDropdownOpen,
    onBack: () => setIsTopicDropdownOpen(false),
    priority: 25,
    id: 'custom_builder_topic_dropdown',
  });

  useBackHandler({
    isOpen: !isTopicDropdownOpen && !isFilterDropdownOpen,
    onBack: () => onCancel(),
    priority: 15,
    id: 'custom_builder_base_back',
  });

  // Synchronize default time limit: 1 min per question when questions change (unless manually customized)
  const selectedCount = selectedQuestionIds.size;
  useEffect(() => {
    if (!isManualTime) {
      setTimeLimitMinutes(Math.max(1, selectedCount));
    }
  }, [selectedCount, isManualTime]);

  // Keyboard shortcut listener for maximum productivity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.shiftKey && e.key.toLowerCase() === 's' && selectedCount > 0) {
        e.preventDefault();
        handleLaunchTest('timed');
      } else if (e.shiftKey && e.key.toLowerCase() === 'p' && selectedCount > 0) {
        e.preventDefault();
        handleLaunchTest('practice');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCount]);

  // Group latest attempt for each test
  const latestAttemptsByTestId = useMemo(() => {
    const map = new Map<string, TestAttempt>();
    attempts.forEach((att) => {
      const existing = map.get(att.testId);
      if (!existing || new Date(att.completedAt || att.createdAt).getTime() > new Date(existing.completedAt || existing.createdAt).getTime()) {
        map.set(att.testId, att);
      }
    });
    return map;
  }, [attempts]);

  // Unique topics across all tests with counts
  const topicsWithCounts = useMemo(() => {
    const counts: Record<string, number> = { All: tests.length };
    tests.forEach((t) => {
      const topicName = t.topic || 'General Mathematics';
      counts[topicName] = (counts[topicName] || 0) + 1;
    });
    const topicList = Object.keys(counts).filter(t => t !== 'All');
    return {
      allList: ['All', ...topicList],
      counts,
    };
  }, [tests]);

  // Filtered tests by topic
  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesTopic = activeFilterTopic === 'All' || (t.topic || 'General Mathematics') === activeFilterTopic;
      
      if (!matchesTopic) return false;

      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const inTitle = t.title.toLowerCase().includes(query);
      const inTopic = t.topic.toLowerCase().includes(query);
      const inQuestions = (t.questions || []).some(q => q.text.toLowerCase().includes(query));
      return inTitle || inTopic || inQuestions;
    });
  }, [tests, activeFilterTopic, searchQuery]);

  // Categorize questions in a test based on the latest attempt
  const getCategorizedQuestions = (test: MathTest) => {
    const attempt = latestAttemptsByTestId.get(test.id);
    const allQs = test.questions || [];
    
    if (!attempt || !attempt.answers) {
      return {
        all: allQs,
        wrong: [],
        marked: [],
        unattempted: allQs,
        attempt: null,
      };
    }

    const wrong: MathQuestion[] = [];
    const marked: MathQuestion[] = [];
    const unattempted: MathQuestion[] = [];

    allQs.forEach((q) => {
      const ans = attempt.answers[q.id];
      if (!ans || !ans.selectedOption || ans.selectedOption.trim() === '') {
        unattempted.push(q);
      } else if (!ans.isCorrect) {
        wrong.push(q);
      }

      if (ans?.flagged) {
        marked.push(q);
      }
    });

    return {
      all: allQs,
      wrong,
      marked,
      unattempted,
      attempt,
    };
  };

  const getQuestionKey = (testId: string, qId?: string) => `${testId}:::${qId || ''}`;

  // Toggle selection of a specific question
  const toggleQuestion = (testId: string, questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      const key = getQuestionKey(testId, questionId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Select all questions in a specific category for a test
  const selectCategoryForTest = (test: MathTest, category: QuestionCategory) => {
    const { all, wrong, marked, unattempted } = getCategorizedQuestions(test);
    let targetQs: MathQuestion[] = [];
    if (category === 'all') targetQs = all;
    if (category === 'wrong') targetQs = wrong;
    if (category === 'marked') targetQs = marked;
    if (category === 'unattempted') targetQs = unattempted;

    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      const isTargetAll = category === 'all';
      const allTargetSelected = targetQs.length > 0 && targetQs.every((q) => next.has(getQuestionKey(test.id, q.id)));
      const selectedCountForThisTest = all.filter((q) => next.has(getQuestionKey(test.id, q.id))).length;
      const isExclusivelyTargetSelected = allTargetSelected && selectedCountForThisTest === targetQs.length;

      if (isExclusivelyTargetSelected || (isTargetAll && allTargetSelected)) {
        // Toggle off if already selected for this category
        targetQs.forEach((q) => next.delete(getQuestionKey(test.id, q.id)));
      } else {
        // Clear all previous selections for this test and select the target category questions
        all.forEach((q) => next.delete(getQuestionKey(test.id, q.id)));
        targetQs.forEach((q) => next.add(getQuestionKey(test.id, q.id)));
      }
      return next;
    });
  };

  // Global counts for wrong, marked, unattempted, and all questions across tests
  const globalQuestionStats = useMemo(() => {
    let totalWrong = 0;
    let totalMarked = 0;
    let totalUnattempted = 0;
    let totalQuestions = 0;

    tests.forEach((t) => {
      const { wrong, marked, unattempted, all } = getCategorizedQuestions(t);
      totalWrong += wrong.length;
      totalMarked += marked.length;
      totalUnattempted += unattempted.length;
      totalQuestions += all.length;
    });

    return { totalWrong, totalMarked, totalUnattempted, totalQuestions };
  }, [tests, latestAttemptsByTestId]);

  // Quick select all wrong questions across all tests
  const selectAllWrongAcrossAllTests = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      tests.forEach((t) => {
        const { wrong } = getCategorizedQuestions(t);
        wrong.forEach((q) => next.add(getQuestionKey(t.id, q.id)));
      });
      return next;
    });
    setIsFilterDropdownOpen(false);
  };

  // Quick select all marked questions across all tests
  const selectAllMarkedAcrossAllTests = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      tests.forEach((t) => {
        const { marked } = getCategorizedQuestions(t);
        marked.forEach((q) => next.add(getQuestionKey(t.id, q.id)));
      });
      return next;
    });
    setIsFilterDropdownOpen(false);
  };

  // Quick select all unattempted questions across all tests
  const selectAllUnattemptedAcrossAllTests = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      tests.forEach((t) => {
        const { unattempted } = getCategorizedQuestions(t);
        unattempted.forEach((q) => next.add(getQuestionKey(t.id, q.id)));
      });
      return next;
    });
    setIsFilterDropdownOpen(false);
  };

  // Quick select all questions across all tests
  const selectAllQuestionsAcrossAllTests = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      tests.forEach((t) => {
        (t.questions || []).forEach((q) => next.add(getQuestionKey(t.id, q.id)));
      });
      return next;
    });
    setIsFilterDropdownOpen(false);
  };

  // Clear all selections
  const clearSelections = () => {
    setSelectedQuestionIds(new Set());
  };

  // Toggle card expansion
  const toggleExpandTest = (testId: string) => {
    setExpandedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  };

  // Map selected questions into a new MathTest object
  const buildCustomTest = (): MathTest | null => {
    if (selectedQuestionIds.size === 0) return null;

    const chosenQuestions: MathQuestion[] = [];
    const seenNewQIds = new Set<string>();

    tests.forEach((t) => {
      (t.questions || []).forEach((q, idx) => {
        const key = getQuestionKey(t.id, q.id || `q_${idx + 1}`);
        if (selectedQuestionIds.has(key)) {
          let newQId = `${t.id}-${q.id || idx + 1}`;
          if (seenNewQIds.has(newQId)) {
            newQId = `${t.id}-${q.id || idx + 1}-${idx}`;
          }
          seenNewQIds.add(newQId);
          chosenQuestions.push({
            ...q,
            id: newQId,
          });
        }
      });
    });

    if (chosenQuestions.length === 0) return null;

    return {
      id: `custom-${Date.now()}`,
      title: customTitle.trim() || 'Custom Revision Test',
      description: `Custom curated practice test comprising ${chosenQuestions.length} selected questions from multiple assessments.`,
      topic: activeFilterTopic !== 'All' ? activeFilterTopic : 'General Mathematics',
      difficulty: 'Medium',
      timeLimitMinutes: Number(timeLimitMinutes) || Math.max(1, chosenQuestions.length),
      passingScorePercentage: 60,
      authorId: currentUser?.uid || 'custom-user',
      authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
      isPublic: true,
      questions: chosenQuestions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const handleLaunchTest = (mode: 'timed' | 'practice') => {
    const test = buildCustomTest();
    if (!test) return;
    onStartCustomTest(test, mode);
  };

  const handleLaunchOmrTest = () => {
    const test = buildCustomTest();
    if (!test) return;
    if (onStartOmrCustomTest) {
      onStartOmrCustomTest(test);
    } else {
      onStartCustomTest(test, 'timed');
    }
  };

  const handleSaveOnly = () => {
    const test = buildCustomTest();
    if (!test) return;
    onSaveCustomTest(test);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  return (
    <div className={APP_STYLES.customBuilder.container}>
      {/* Top Header & Topic/Search Controls Area (Fixed at top) */}
      <div className={APP_STYLES.customBuilder.headerArea}>
        <div className={APP_STYLES.customBuilder.maxContent}>
        {/* Header Bar with clean icon badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-0.5 sm:pb-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            title="Back to Tests"
            className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 ring-0 outline-none select-none active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Custom Test Generator
            </h1>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5 font-medium">
              Build high-yield custom exams from your question bank by category, topic, or wrong answers.
            </p>
          </div>
        </div>

        {/* Global Quick Bulk Selection & Status Filters Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              id="custom-test-bulk-filter-btn"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex items-center gap-2 px-4 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] border-0 ring-0 outline-none select-none text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] cursor-pointer active:scale-95 transition-all duration-200 shrink-0"
              title="Bulk filter and select questions by status"
            >
              <Filter className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>Select by Status</span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {isFilterDropdownOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#1e2024] rounded-[28px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-2.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100 border-0 ring-0">
                <div className="px-3 py-1.5 text-[10px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">
                  Bulk Select by Question Status
                </div>

                {/* 1. All Wrong / Incorrect Questions */}
                <button
                  type="button"
                  id="filter-select-all-wrong-btn"
                  onClick={selectAllWrongAcrossAllTests}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-[20px] text-xs font-medium text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[#1f1f1f] dark:text-[#e3e3e3] hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer group border-0 ring-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <XCircle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-rose-600 dark:group-hover:text-rose-400">
                        All Wrong Questions
                      </div>
                      <div className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6]">Previously incorrect</div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-[28px] font-mono font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    {globalQuestionStats.totalWrong}
                  </span>
                </button>

                {/* 2. All Marked Questions */}
                <button
                  type="button"
                  id="filter-select-all-marked-btn"
                  onClick={selectAllMarkedAcrossAllTests}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-[20px] text-xs font-medium text-left hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[#1f1f1f] dark:text-[#e3e3e3] hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer group border-0 ring-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Bookmark className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-amber-600 dark:group-hover:text-amber-400">
                        All Marked Questions
                      </div>
                      <div className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6]">Flagged for review</div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-[28px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    {globalQuestionStats.totalMarked}
                  </span>
                </button>

                {/* 3. All Unattempted Questions */}
                <button
                  type="button"
                  id="filter-select-all-unattempted-btn"
                  onClick={selectAllUnattemptedAcrossAllTests}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-[20px] text-xs font-medium text-left hover:bg-sky-50 dark:hover:bg-sky-950/40 text-[#1f1f1f] dark:text-[#e3e3e3] hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer group border-0 ring-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-sky-600 dark:group-hover:text-sky-400">
                        All Unattempted Questions
                      </div>
                      <div className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6]">Never practiced or solved</div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-[28px] font-mono font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                    {globalQuestionStats.totalUnattempted}
                  </span>
                </button>

                <div className="my-1 bg-[#f0f4f9] dark:bg-[#2c3040] h-px" />

                {/* 4. Select All Available Questions */}
                <button
                  type="button"
                  id="filter-select-all-questions-btn"
                  onClick={selectAllQuestionsAcrossAllTests}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-[20px] text-xs font-medium text-left hover:bg-[#d3e3fd]/40 dark:hover:bg-[#004a77]/30 text-[#1f1f1f] dark:text-[#e3e3e3] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors cursor-pointer group border-0 ring-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] flex items-center justify-center shrink-0">
                      <CheckSquare className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa]">
                        Select All Questions
                      </div>
                      <div className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6]">Entire question bank</div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-[28px] font-mono font-bold bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff]">
                    {globalQuestionStats.totalQuestions}
                  </span>
                </button>

                {/* 5. Clear All */}
                {selectedCount > 0 && (
                  <button
                    type="button"
                    id="filter-deselect-all-btn"
                    onClick={() => {
                      clearSelections();
                      setIsFilterDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-[20px] text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer border-0 ring-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Deselect All ({selectedCount})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={clearSelections}
              className="h-9 px-4 text-xs font-bold rounded-full bg-white dark:bg-[#1e2024] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 outline-none shrink-0"
              title="Clear all selected questions"
            >
              Clear ({selectedCount})
            </button>
          )}
        </div>
      </div>

      {/* SEARCH & TOPIC FILTER CONTROLS (Topic on Left, Search on Right) */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 px-0.5 py-0.5">
        {/* Topic Dropdown Button (Left Side) */}
        <div className="relative shrink-0" ref={topicDropdownRef}>
          <button
            type="button"
            id="choose-topic-btn"
            onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
            className="flex items-center justify-between gap-2 px-4 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] border-0 ring-0 outline-none select-none text-[#1f1f1f] dark:text-[#e3e3e3] max-w-[170px] sm:max-w-none text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] cursor-pointer active:scale-95 transition-all duration-200 shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" />
            <div className="flex items-center gap-1 truncate">
              <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-medium hidden sm:inline">Topic:</span>
              <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">{activeFilterTopic}</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] transition-transform shrink-0 ${isTopicDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu Popover */}
          {isTopicDropdownOpen && (
            <div className="absolute top-full left-0 right-auto mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto bg-white dark:bg-[#1e2024] rounded-[24px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-2.5 z-40 space-y-1 animate-in fade-in duration-100 border-0 ring-0">
              <div className="px-3 py-1.5 text-[10px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider mb-1">
                Filter Assessments by Topic
              </div>
              {topicsWithCounts.allList.map((topicName) => {
                const isSelected = activeFilterTopic === topicName;
                const count = topicsWithCounts.counts[topicName] || 0;
                return (
                  <button
                    key={topicName}
                    type="button"
                    onClick={() => {
                      setActiveFilterTopic(topicName);
                      setIsTopicDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[16px] text-xs text-left transition-colors cursor-pointer border-0 ring-0 outline-none select-none ${
                      isSelected
                        ? 'bg-[#0b57d0] text-white font-bold shadow-xs'
                        : 'text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold hover:bg-[#f8f9fc] dark:hover:bg-[#282a30]'
                    }`}
                  >
                    <span className="truncate">{topicName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-[18px] font-mono font-bold ${
                        isSelected 
                          ? 'bg-white/20 text-white' 
                          : 'bg-[#f0f4f9] dark:bg-[#141619] text-[#1f1f1f] dark:text-[#e3e3e3]'
                      }`}>
                        {count} {count === 1 ? 'test' : 'tests'}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Search Box (Right Side) matching Test Card Style */}
        <div className="relative flex-1 max-w-xs sm:max-w-sm flex items-center h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e] border-0 ring-0 outline-none shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] px-4 transition-all duration-200">
          <Search className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="w-full pl-2 pr-2 py-1 bg-transparent border-0 ring-0 outline-none focus:outline-none focus:ring-0 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#5e5e5e]/70 dark:placeholder:text-[#9aa0a6]/70"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="w-5 h-5 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer transition-colors border-0 ring-0 outline-none shrink-0"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  </div>

      {/* Scrollable Test Card Area / Test Body (Only this area scrolls) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-3 max-w-5xl w-full mx-auto overscroll-contain">
        <div className="space-y-3 sm:space-y-4 pb-6">
        {filteredTests.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2024] border-0 ring-0 rounded-[28px] text-center py-12 px-4 shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            <BookOpen className="w-8 h-8 text-[#5e5e5e] dark:text-[#9aa0a6] mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              No matching tests found
            </p>
            <button
              onClick={() => {
                setActiveFilterTopic('All');
                setSearchQuery('');
              }}
              className="mt-3 px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold rounded-[28px] shadow-xs cursor-pointer border-0 ring-0"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredTests.map((test) => {
            const { all, wrong, marked, unattempted, attempt } = getCategorizedQuestions(test);
            const isExpanded = expandedTestIds.has(test.id);
            const testQKeys = all.map((q) => getQuestionKey(test.id, q.id));
            const selectedInThisTest = testQKeys.filter((key) => selectedQuestionIds.has(key)).length;
            const isAllSelected = all.length > 0 && selectedInThisTest === all.length;
            const isWrongActive = wrong.length > 0 && selectedInThisTest === wrong.length && wrong.every((q) => selectedQuestionIds.has(getQuestionKey(test.id, q.id)));
            const isMarkedActive = marked.length > 0 && selectedInThisTest === marked.length && marked.every((q) => selectedQuestionIds.has(getQuestionKey(test.id, q.id)));
            const isUnattemptedActive = unattempted.length > 0 && selectedInThisTest === unattempted.length && unattempted.every((q) => selectedQuestionIds.has(getQuestionKey(test.id, q.id)));

            return (
              <motion.div
                key={test.id}
                variants={studioStaggerItem}
                style={gpuAcceleratedStyle}
                className={APP_STYLES.customBuilder.card}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Test Info & Attempt Badge */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] tracking-wide uppercase">
                        {test.topic}
                      </span>
                      <h3 className="text-[17px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate w-full leading-snug">
                        {test.title}
                      </h3>
                    </div>

                    {/* Attempt History Status matching Performance Analytics */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">
                      <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{all.length} Total Qs</span>
                      <span>&bull;</span>
                      {attempt ? (
                        <div className="inline-flex items-center gap-2 text-[11px] font-medium text-[#1f1f1f] dark:text-[#e3e3e3] flex-wrap">
                          <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-normal">Last Attempt:</span>
                          <span className="inline-flex items-center gap-1 font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                            <Target className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] stroke-[2.2] shrink-0" />
                            <span>{attempt.percentage}%</span>
                          </span>
                          <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-light">•</span>
                          <div className="flex items-center gap-1.5 text-[#0b57d0] dark:text-[#a8c7fa]" title="Correct Questions">
                            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                            <span>
                              <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{all.length - wrong.length - unattempted.length}</strong> <span>correct</span>
                            </span>
                          </div>
                          <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-light">•</span>
                          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400" title="Incorrect Questions">
                            <XCircle className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                            <span>
                              <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{wrong.length}</strong> <span>wrong</span>
                            </span>
                          </div>
                          {marked.length > 0 && (
                            <>
                              <span className="text-[#5e5e5e] dark:text-[#9aa0a6] font-light">•</span>
                              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400" title="Marked Questions">
                                <Bookmark className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                                <span>
                                  <strong className="font-extrabold text-[#1f1f1f] dark:text-[#e3e3e3]">{marked.length}</strong> <span>marked</span>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#5e5e5e] dark:text-[#9aa0a6] italic text-[11px]">Not yet attempted</span>
                      )}
                    </div>
                  </div>

                  {/* Center / Right: Category Selector Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Category Chip: All */}
                    <button
                      type="button"
                      onClick={() => selectCategoryForTest(test, 'all')}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-[28px] transition-all flex items-center gap-1.5 cursor-pointer border-0 ring-0 outline-none ${
                        isAllSelected
                          ? 'bg-[#0b57d0] text-white shadow-xs'
                          : 'bg-white hover:bg-[#f8f9fc] dark:bg-[#1e2024] dark:hover:bg-[#25282e] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
                      }`}
                    >
                      <span>All ({all.length})</span>
                    </button>

                    {/* Category Chip: Wrong */}
                    {wrong.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectCategoryForTest(test, 'wrong')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-[28px] transition-all flex items-center gap-1 cursor-pointer border-0 ring-0 outline-none ${
                          isWrongActive
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Wrong ({wrong.length})</span>
                      </button>
                    )}

                    {/* Category Chip: Marked */}
                    {marked.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectCategoryForTest(test, 'marked')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-[28px] transition-all flex items-center gap-1 cursor-pointer border-0 ring-0 outline-none ${
                          isMarkedActive
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Marked ({marked.length})</span>
                      </button>
                    )}

                    {/* Category Chip: Unattempted */}
                    {unattempted.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectCategoryForTest(test, 'unattempted')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-[28px] transition-all flex items-center gap-1 cursor-pointer border-0 ring-0 outline-none ${
                          isUnattemptedActive
                            ? 'bg-slate-800 dark:bg-zinc-700 text-white shadow-xs'
                            : 'bg-white hover:bg-[#f8f9fc] dark:bg-[#1e2024] dark:hover:bg-[#25282e] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
                        }`}
                      >
                        <span>Unattempted ({unattempted.length})</span>
                      </button>
                    )}

                    {/* Expand Individual Questions toggle styled matching white card */}
                    <button
                      type="button"
                      onClick={() => toggleExpandTest(test.id)}
                      title={isExpanded ? 'Hide Questions' : 'View & Pick Specific Questions'}
                      className="w-8 h-8 rounded-full bg-white hover:bg-[#f8f9fc] dark:bg-[#1e2024] dark:hover:bg-[#25282e] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all ml-1 cursor-pointer border-0 ring-0 shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] active:scale-95"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expandable Individual Question Picker */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 space-y-2 bg-[#f0f4f9] dark:bg-[#141619] border-t border-slate-200/40 dark:border-zinc-800/60 rounded-b-[28px]">
                    <div className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider">
                      Select Individual Questions ({selectedInThisTest}/{all.length} chosen)
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {all.map((q, qIndex) => {
                        const isSelected = selectedQuestionIds.has(getQuestionKey(test.id, q.id));
                        const isWrong = wrong.some((wq) => wq.id === q.id);
                        const isMarked = marked.some((mq) => mq.id === q.id);

                        return (
                          <div
                            key={`custom-q-${test.id}-${q.id || 'qid'}-${qIndex}`}
                            onClick={() => toggleQuestion(test.id, q.id)}
                            className={`p-3.5 rounded-[22px] sm:rounded-[24px] text-xs cursor-pointer flex items-start gap-2.5 transition-all outline-none border ring-0 ${
                              isSelected
                                ? 'bg-[#d3e3fd]/50 dark:bg-[#004a77]/35 border-[#0b57d0] dark:border-[#a8c7fa] text-[#1f1f1f] dark:text-[#e3e3e3]'
                                : 'bg-white dark:bg-[#1e2024] border-slate-200/80 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700 text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e]'
                            }`}
                          >
                            <div className="pt-0.5 shrink-0">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                              ) : (
                                <Square className="w-4 h-4 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 font-mono text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6] mb-0.5">
                                <span>Q{qIndex + 1}</span>
                                {isWrong && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 font-bold border-0 ring-0">
                                    Wrong
                                  </span>
                                )}
                                {isMarked && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 font-bold border-0 ring-0">
                                    Marked
                                  </span>
                                )}
                              </div>
                              <div className="line-clamp-2">
                                <MathRenderer content={q.text} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
        </div>
      </div>

      {/* Fixed Bottom Custom Generator Bar with Optimized Layout and Mobile Safe Insets */}
      <div className="shrink-0 bg-white dark:bg-[#1e2024] p-3 sm:p-4 pb-[calc(max(0.85rem,env(safe-area-inset-bottom,0px))+0.5rem)] sm:pb-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.4)] border-0 ring-0 z-30">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3.5">
          {/* Title, Time limit & Count selection group - Forced single row on mobile */}
          <div className="flex flex-row items-center gap-1.5 sm:gap-2 w-full md:w-auto flex-1 min-w-0">
            {/* Test title input */}
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-[#f0f4f9] dark:bg-[#141619] border-0 ring-0 px-4 py-2 rounded-[24px] shadow-none h-9">
              <Sparkles className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 hidden sm:inline" />
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Test Title"
                className="w-full text-xs font-bold bg-transparent text-[#1f1f1f] dark:text-[#e3e3e3] outline-none border-0 ring-0 focus:outline-none focus:ring-0 placeholder-slate-400 dark:placeholder-zinc-500 truncate"
              />
            </div>

            {/* Time limit selector */}
            <div className="flex items-center gap-1.5 px-3 bg-[#f0f4f9] dark:bg-[#141619] border-0 ring-0 rounded-full text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] shrink-0 max-w-[140px] sm:max-w-none shadow-none h-9">
              <Clock className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
              <select
                value={timeLimitMinutes}
                onChange={(e) => {
                  setIsManualTime(true);
                  setTimeLimitMinutes(Number(e.target.value));
                }}
                className="bg-transparent border-0 ring-0 outline-none focus:outline-none focus:ring-0 text-[11px] sm:text-xs font-bold cursor-pointer text-[#1f1f1f] dark:text-[#e3e3e3] truncate w-full"
              >
                <option value={Math.max(1, selectedCount)} className="bg-white dark:bg-[#1e2024]">
                  1m/Q ({Math.max(1, selectedCount)}m)
                </option>
                <option value={Math.max(1, Math.round(selectedCount * 1.5))} className="bg-white dark:bg-[#1e2024]">
                  1.5m/Q ({Math.max(1, Math.round(selectedCount * 1.5))}m)
                </option>
                <option value={Math.max(1, selectedCount * 2)} className="bg-white dark:bg-[#21222e]">
                  2m/Q ({Math.max(1, selectedCount * 2)}m)
                </option>
                <option value={10} className="bg-white dark:bg-[#1e2024]">10 min</option>
                <option value={15} className="bg-white dark:bg-[#1e2024]">15 min</option>
                <option value={20} className="bg-white dark:bg-[#1e2024]">20 min</option>
                <option value={30} className="bg-white dark:bg-[#1e2024]">30 min</option>
                <option value={45} className="bg-white dark:bg-[#1e2024]">45 min</option>
                <option value={60} className="bg-white dark:bg-[#1e2024]">60 min</option>
                <option value={0} className="bg-white dark:bg-[#1e2024]">Untimed</option>
              </select>
            </div>

            {/* Questions badge */}
            <div className="h-9 px-3.5 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] font-mono text-xs font-bold shrink-0 whitespace-nowrap border-0 flex items-center">
              {selectedCount} Qs
            </div>
          </div>

          {/* Action Buttons: Save, OMR, Start Exam - Standardized to Home Screen Pill Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={selectedCount === 0}
              className="flex-1 md:flex-initial h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 cursor-pointer outline-none"
              title="Save custom test to your library"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavedToast ? 'Saved!' : 'Save'}</span>
            </button>

            {onStartOmrCustomTest && (
              <button
                type="button"
                onClick={handleLaunchOmrTest}
                disabled={selectedCount === 0}
                className="flex-1 md:flex-initial h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 cursor-pointer outline-none"
                title="Open in OMR Mode (Print Question Paper & Optical Evaluation)"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>OMR Mode</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleLaunchTest('timed')}
              disabled={selectedCount === 0}
              className="flex-1 md:flex-initial h-9 px-5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 cursor-pointer outline-none"
              title="Launch test in timed assessment mode"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Online</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

