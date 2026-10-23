import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  ArrowLeft,
  Search, 
  Sparkles, 
  Send, 
  BookOpen, 
  Clock, 
  GraduationCap, 
  CheckCircle2, 
  Layers, 
  Copy, 
  Check, 
  Play, 
  Bookmark, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Maximize2,
  Minimize2,
  Share2,
  HelpCircle,
  Hash,
  Award
} from 'lucide-react';
import { MathTest, MathQuestion, normalizeQuestions, checkIsOptionCorrect } from '../types';
import { MathRenderer } from './MathRenderer';
import { useBackHandler } from '../hooks/useBackNavigation';

interface GeminiTestCanvasModalProps {
  test: MathTest;
  messageId?: string;
  existingTests?: MathTest[];
  onClose: () => void;
  onEditWithAi: (prompt: string, messageId?: string) => void;
  onSaveTest?: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  isDarkMode?: boolean;
  isLoading?: boolean;
}

export const GeminiTestCanvasModal: React.FC<GeminiTestCanvasModalProps> = ({
  test,
  messageId,
  existingTests = [],
  onClose,
  onEditWithAi,
  onSaveTest,
  onDeleteTest,
  onStartTest,
  onEditTest,
  isDarkMode = false,
  isLoading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSavedLocally, setIsSavedLocally] = useState<boolean | null>(null);
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const questions = useMemo(() => normalizeQuestions(test.questions || []), [test.questions]);

  // Check if test is already in library
  const isAlreadyInLibrary = useMemo(() => {
    return existingTests.some((t) => t.id === test.id || (t.title.trim().toLowerCase() === test.title.trim().toLowerCase()));
  }, [existingTests, test]);

  const isTestSaved = isSavedLocally !== null ? isSavedLocally : isAlreadyInLibrary;

  // Back Navigation Handler
  useBackHandler({
    isOpen: true,
    onBack: onClose,
    priority: 30,
    id: 'gemini_test_canvas_modal'
  });

  // Quick action prompt chips focused purely on test modifications
  const quickPromptChips = [
    `✦ Add 5 more questions to make ${questions.length + 5}`,
    `✦ Add 10 more questions`,
    '✦ Convert all questions to Multiple Choice (MCQ)',
    '✦ Add step-by-step solution explanations',
    '✦ Increase difficulty to Hard / Advanced Olympiad',
    '✦ Add real-world applied math scenario problems',
    '✦ Balance topics across Algebra, Calculus & Geometry',
    '✦ Add formula hints for each question'
  ];

  // Filtered questions based on search query
  const filteredQuestions = useMemo(() => {
    let result = questions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        item => 
          item.text?.toLowerCase().includes(q) ||
          item.options?.some(opt => opt.toLowerCase().includes(q)) ||
          item.explanation?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [questions, searchQuery]);

  const toggleExplanation = (qId: string) => {
    setExpandedExplanations(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(test, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleSaveToLibrary = () => {
    if (isTestSaved) {
      // Toggle off / unsave test from library
      if (onDeleteTest && test.id) {
        onDeleteTest(test.id);
      }
      setIsSavedLocally(false);
      setSavedSuccess(false);
    } else {
      if (onSaveTest) {
        onSaveTest(test);
      }
      setIsSavedLocally(true);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  const handleDoubleClickUnsave = () => {
    if (isTestSaved) {
      if (onDeleteTest && test.id) {
        onDeleteTest(test.id);
      }
      setIsSavedLocally(false);
      setSavedSuccess(false);
    }
  };

  const handleSubmitAiPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || isLoading) return;
    const promptToSend = `Regarding test "${test.title}" (currently ${questions.length} questions):\n${aiPrompt.trim()}`;
    onEditWithAi(promptToSend, messageId);
    setAiPrompt('');
  };

  const handleChipClick = (chip: string) => {
    if (isLoading) return;
    const promptToSend = `Regarding test "${test.title}" (currently ${questions.length} questions):\n${chip.replace('✦ ', '')}`;
    onEditWithAi(promptToSend, messageId);
  };

  // Stats calculation
  const mcqCount = questions.filter(q => q.type !== 'numerical' && (q.options?.length || 0) > 0).length;
  const numCount = questions.length - mcqCount;
  const totalPoints = questions.reduce((acc, q) => acc + (q.points || 1), 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#f8fafc] dark:bg-[#0c0d12] text-slate-900 dark:text-zinc-100 flex flex-col animate-in fade-in duration-150 select-none gpu-accelerated">
      {/* Top Header Bar - Zero Borders */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-[#13141a] flex items-center justify-between gap-2 shrink-0">
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
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {test.title || 'Untitled Test'}
              </h1>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-bold shrink-0 whitespace-nowrap">
                Test Studio
              </span>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-medium uppercase tracking-wider shrink-0">
                {test.category || 'Mathematics'}
              </span>
            </div>
            <p className="hidden xs:block text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate">
              {test.description || `${questions.length} questions • Interactive assessment`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Save to Library Button - Click saves, double-click/click unsaves */}
          {onSaveTest && (
            <button
              type="button"
              onClick={handleSaveToLibrary}
              onDoubleClick={handleDoubleClickUnsave}
              className={`p-2 sm:px-3.5 sm:py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                isTestSaved
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200'
              }`}
              title={isTestSaved ? "Saved in your Test Library (Click or Double Click to Unsave)" : "Save test to your Test Library"}
            >
              {isTestSaved ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">{savedSuccess ? 'Saved!' : 'In Library'}</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="hidden sm:inline">Save</span>
                </>
              )}
            </button>
          )}

          {/* Edit in Studio with AI Button */}
          <button
            type="button"
            onClick={() => {
              if (onEditTest) {
                onEditTest(test, { openAiPrompt: true });
              } else {
                window.dispatchEvent(new CustomEvent('gemini-open-test-editor', {
                  detail: { test, openAiPrompt: true }
                }));
              }
              onClose();
            }}
            className="p-2 sm:px-3.5 sm:py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Edit in Studio with AI assistance"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Edit in Studio with AI</span>
          </button>

          {/* Start Timed Test Button - Play Icon only on Mobile */}
          {onStartTest && (
            <button
              type="button"
              onClick={() => {
                onStartTest(test, 'timed');
                onClose();
              }}
              className="p-2 sm:px-4 sm:py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Start test now in timed exam mode"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Start Test</span>
            </button>
          )}

          {/* Copy JSON */}
          <button
            type="button"
            onClick={handleCopyJson}
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Copy test data as JSON"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
            title="Close (Esc)"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Metric Ribbon & Search Bar - Zero Borders */}
      <div className="px-3 sm:px-6 py-2.5 bg-white/95 dark:bg-[#13141a]/95 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        {/* Quick Metrics */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-[11px] sm:text-xs overflow-x-auto pb-0.5 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-medium shrink-0">
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span><strong>{questions.length}</strong> Qs</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-medium shrink-0">
            <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span><strong>{test.durationMinutes || 30}</strong>m</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-medium shrink-0">
            <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span><strong>{totalPoints}</strong> Pts</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 pl-1 shrink-0">
            <span>{mcqCount} MCQs</span>
            <span>•</span>
            <span>{numCount} Numerical</span>
          </div>
        </div>

        {/* Search & Jump to Question Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial justify-between sm:justify-end min-w-0">
          <div className="relative flex-1 sm:w-56 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
            />
          </div>

          {/* Jump to Question Dropdown Selector */}
          <div className="relative flex items-center shrink-0">
            <select
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const element = document.getElementById(`test-canvas-q-${val}`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                e.target.value = '';
              }}
              className="px-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer transition-all appearance-none pr-7 pl-3"
              title="Jump directly to question"
            >
              <option value="" disabled>Jump to Question...</option>
              {questions.map((_, qIdx) => (
                <option key={qIdx} value={qIdx + 1}>
                  Q{qIdx + 1}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute right-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Questions List Canvas Body - Zero Borders */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 bg-[#f1f5f9] dark:bg-[#090a0f] flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-3.5 sm:space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-zinc-500 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-sm font-medium">No questions matched your search &ldquo;{searchQuery}&rdquo;</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredQuestions.map((q, idx) => {
              const qId = q.id || `q_${idx + 1}`;
              const isExplanationOpen = Boolean(expandedExplanations[qId]);
              const isMcq = Array.isArray(q.options) && q.options.length > 0;

              return (
                <div
                  key={`${qId}_${idx}`}
                  id={`test-canvas-q-${idx + 1}`}
                  className="rounded-3xl bg-white dark:bg-[#13141b] p-4 sm:p-6 space-y-3.5"
                >
                  {/* Question Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        Question {idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-[9px] sm:text-[10px] font-semibold uppercase">
                        {isMcq ? 'Multiple Choice' : 'Numerical Answer'}
                      </span>
                      {q.difficulty && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase ${
                          String(q.difficulty).toLowerCase() === 'hard' || String(q.difficulty).toLowerCase() === 'advanced'
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : String(q.difficulty).toLowerCase() === 'medium'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {q.difficulty}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 dark:text-zinc-500">
                        {q.points || 1} pt{q.points !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Question Content (LaTeX rendered) */}
                  <div className="text-xs sm:text-sm font-medium text-slate-900 dark:text-zinc-100 leading-relaxed overflow-x-auto">
                    <MathRenderer content={q.text || ''} />
                  </div>

                  {/* MCQ Options Grid - Round Option Tags A, B, C, D */}
                  {isMcq && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, optIdx) => {
                        const optLetter = String.fromCharCode(65 + optIdx);
                        const isCorrect = checkIsOptionCorrect(opt, optIdx, q);

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 transition-all ${
                              isCorrect
                                ? 'bg-white dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 font-bold ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-sm shadow-emerald-500/20'
                                : 'bg-white dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 font-normal ring-1 ring-slate-200/80 dark:ring-[#373a46] hover:ring-slate-300 dark:hover:ring-[#52576b]'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCorrect
                                ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                                : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 ring-1 ring-slate-300 dark:ring-zinc-600'
                            }`}>
                              {optLetter}
                            </span>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <MathRenderer content={opt} />
                            </div>
                            {isCorrect && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                                Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Numerical Answer Display - Zero Borders */}
                  {!isMcq && q.correctAnswer !== undefined && (
                    <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-zinc-800/60 text-xs text-slate-800 dark:text-zinc-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Expected Answer:</strong> {q.correctAnswer}</span>
                    </div>
                  )}

                  {/* Solution / Explanation toggle */}
                  {q.explanation && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExplanation(qId)}
                        className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer py-0.5"
                      >
                        <span>{isExplanationOpen ? 'Hide step-by-step solution' : 'Show step-by-step solution'}</span>
                        {isExplanationOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isExplanationOpen && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-zinc-800/60 text-xs text-slate-800 dark:text-zinc-200 space-y-1.5 animate-fadeIn">
                          <div className="font-bold text-blue-700 dark:text-blue-400 text-[11px] uppercase tracking-wider">
                            Step-by-Step Explanation:
                          </div>
                          <MathRenderer content={q.explanation} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Bottom AI Edit Assistant Bar - Zero Borders */}
      <footer className="p-3 sm:p-4 bg-white dark:bg-[#13141a] shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Quick Action Chips - Thin Borders */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="hidden xs:inline">Edit with AI:</span>
            </span>
            {quickPromptChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => handleChipClick(chip)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50/80 dark:bg-zinc-800/80 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300 text-[11px] sm:text-xs font-medium border border-slate-200/80 dark:border-zinc-800 shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Custom Prompt Form - Thin Borders */}
          <form onSubmit={handleSubmitAiPrompt} className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={isLoading}
                placeholder="Ask Gemini to modify this test (e.g. add 5 questions, change difficulty)..."
                className="w-full pl-4 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-2xl bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 border border-slate-200/80 dark:border-zinc-800 focus:outline-none focus:border-blue-500 shadow-xs transition-all disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!aiPrompt.trim() || isLoading}
              className="px-4 py-2.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold border border-blue-500 shadow-xs flex items-center gap-1.5 transition-all text-xs sm:text-sm cursor-pointer active:scale-95 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{isLoading ? 'Updating...' : 'Apply Edit'}</span>
              <span className="xs:hidden">{isLoading ? '...' : 'Apply'}</span>
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
};
