import React, { useState, useMemo, useEffect } from 'react';
import { 
  Sparkles, 
  BookOpen, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Trash2, 
  CheckCircle2, 
  GraduationCap,
  FileCheck,
  AlertCircle,
  RotateCcw,
  Maximize2,
  Loader2,
  Play,
  Check
} from 'lucide-react';
import { MathTest, normalizeQuestions, checkIsOptionCorrect } from '../types';
import { MathRenderer } from './MathRenderer';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { APP_STYLES } from './ui/AppStyles';

export interface ParsedTestAction {
  action: 'CREATE_TEST' | 'UPDATE_TEST' | 'DELETE_TEST';
  summary?: string;
  test: MathTest;
}

interface GeminiTestActionCardProps {
  actionData: ParsedTestAction;
  existingTests?: MathTest[];
  messageId?: string;
  onSaveTest?: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest, options?: { openAiPrompt?: boolean }) => void;
  onInspectInCanvas?: (test: MathTest) => void;
  isDarkMode?: boolean;
}

export const GeminiTestActionCard: React.FC<GeminiTestActionCardProps> = ({
  actionData,
  existingTests = [],
  messageId,
  onSaveTest,
  onDeleteTest,
  onStartTest,
  onEditTest,
  onInspectInCanvas,
  isDarkMode
}) => {
  const { action, summary, test } = actionData;

  const isDelete = action === 'DELETE_TEST';
  const isUpdate = action === 'UPDATE_TEST';

  const [showInlineAiEdit, setShowInlineAiEdit] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState('');

  // Find corresponding existing test in user's library by ID or Title
  const existingTest = useMemo(() => {
    return existingTests.find(
      (t) => (test.id && t.id === test.id) || 
             (t.title && test.title && t.title.trim().toLowerCase() === test.title.trim().toLowerCase() && test.title.length > 3)
    );
  }, [existingTests, test.id, test.title]);

  // Compute reconciled test: merges question additions/edits so existing questions are never wiped out
  const effectiveTest = useMemo<MathTest>(() => {
    if (!existingTest || !isUpdate) {
      return {
        ...test,
        id: test.id || `test_${Date.now()}`,
        questions: normalizeQuestions(test.questions || [])
      };
    }

    const existingQuestions = Array.isArray(existingTest.questions) ? existingTest.questions : [];
    const proposedQuestions = Array.isArray(test.questions) ? test.questions : [];

    // Intelligently merge: update matching questions in-place and append new ones without wiping out or duplicating
    let mergedQuestions: any[] = [];
    if (proposedQuestions.length >= existingQuestions.length && proposedQuestions.length > 0) {
      // Gemini provided the complete updated test questions list (e.g. expanding from 20 to 25 questions)
      mergedQuestions = proposedQuestions.map((pq, idx) => {
        const match = existingQuestions.find(
          (eq) => (eq.id && pq.id && eq.id === pq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        );
        return {
          ...(match || {}),
          ...pq,
          id: pq.id || match?.id || `q_${existingTest.id}_${idx + 1}`
        };
      });
    } else {
      // Gemini provided only the delta questions (e.g. 5 new questions to append to existing 20)
      mergedQuestions = [...existingQuestions];
      for (const pq of proposedQuestions) {
        const matchIdx = mergedQuestions.findIndex(
          (eq) => (pq.id && eq.id && pq.id === eq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        );
        if (matchIdx >= 0) {
          mergedQuestions[matchIdx] = { ...mergedQuestions[matchIdx], ...pq };
        } else {
          mergedQuestions.push({
            ...pq,
            id: pq.id || `q_${existingTest.id}_${mergedQuestions.length + 1}`
          });
        }
      }
    }

    return {
      ...existingTest,
      ...test,
      id: existingTest.id,
      questions: normalizeQuestions(mergedQuestions),
      updatedAt: new Date().toISOString()
    };
  }, [existingTest, isUpdate, test]);

  const questionsCount = Array.isArray(effectiveTest.questions) ? effectiveTest.questions.length : 0;
  const existingQuestionsCount = existingTest && Array.isArray(existingTest.questions) ? existingTest.questions.length : 0;
  const newlyAddedCount = isUpdate && questionsCount > existingQuestionsCount ? questionsCount - existingQuestionsCount : 0;

  // Determine if this update or test is already fully applied in existingTests
  const isAlreadyApplied = useMemo(() => {
    if (isDelete) {
      return !existingTests.some((t) => t.id === test.id);
    }
    if (isUpdate) {
      if (!existingTest) return false;
      const proposedQuestions = Array.isArray(test.questions) ? test.questions : [];
      if (proposedQuestions.length === 0) return false;
      // If library test has fewer questions than the reconciled test, it is NOT yet updated!
      if ((existingTest.questions?.length || 0) < effectiveTest.questions.length) {
        return false;
      }
      // Check if all proposed questions exist in existingTest
      return proposedQuestions.every((pq) =>
        existingTest.questions?.some(
          (eq) => (pq.id && eq.id && pq.id === eq.id) ||
                  (eq.text && pq.text && eq.text.trim().toLowerCase() === pq.text.trim().toLowerCase())
        )
      );
    }
    // For CREATE_TEST: true only if already present in library with matching question count
    return existingTests.some(
      (t) => (t.id === test.id || (t.title.trim().toLowerCase() === test.title.trim().toLowerCase() && test.title.length > 3)) &&
             (t.questions?.length || 0) >= (test.questions?.length || 0)
    );
  }, [existingTests, existingTest, isDelete, isUpdate, test, effectiveTest]);

  const [isSaved, setIsSaved] = useState<boolean>(isAlreadyApplied);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showAllQuestions, setShowAllQuestions] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Sync state if external existingTests updates
  useEffect(() => {
    setIsSaved(isAlreadyApplied);
  }, [isAlreadyApplied]);

  const handleSaveOrApply = () => {
    setIsApplying(true);
    setTimeout(() => {
      if (isDelete) {
        if (onDeleteTest && effectiveTest.id) {
          onDeleteTest(effectiveTest.id);
        }
        setIsSaved(true);
        setSaveSuccessNotice(`Test removed from library.`);
      } else {
        if (onSaveTest) {
          onSaveTest(effectiveTest);
        }
        setIsSaved(true);
        setSaveSuccessNotice(
          isUpdate 
            ? `Test "${effectiveTest.title}" successfully updated with ${effectiveTest.questions.length} questions!`
            : `Test "${effectiveTest.title}" saved to your test library!`
        );
      }
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      setIsApplying(false);
    }, 450);
  };

  const handleUnsaveTest = () => {
    if (onDeleteTest && effectiveTest.id) {
      onDeleteTest(effectiveTest.id);
    }
    setIsSaved(false);
    setSaveSuccessNotice(`Test removed from library.`);
    setTimeout(() => setSaveSuccessNotice(null), 3000);
  };

  const getActionBadge = () => {
    switch (action) {
      case 'CREATE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-0 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>AI Test Generated</span>
          </span>
        );
      case 'UPDATE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-0 shadow-xs">
            <RotateCcw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{isSaved ? 'Test Updated' : 'Test Update Proposed'}</span>
          </span>
        );
      case 'DELETE_TEST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-0 shadow-xs">
            <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span>Delete Test</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="my-3 p-4 rounded-2xl bg-[#f0f4f9] dark:bg-[#1e2024] space-y-3 text-slate-900 dark:text-zinc-100 border-0 shadow-xs">
      {/* Top Header Row with Badges - Sharp Borders */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          {getActionBadge()}
          {isSaved ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-0 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isDelete ? 'Deleted' : isUpdate ? 'Updated' : 'Saved in Library'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-0 shadow-xs">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{isDelete ? 'Ready to Delete' : isUpdate ? 'Ready to Update' : 'Ready to Save'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {effectiveTest.id && (
            <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-zinc-400 px-2.5 py-0.5 rounded-xl bg-white dark:bg-[#282a2d] border-0 shadow-xs">
              #{effectiveTest.id}
            </span>
          )}
        </div>
      </div>

      {/* Test Title & Description */}
      <div className="space-y-2">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 shadow-none border border-blue-200/60 dark:border-blue-900/40">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base sm:text-lg text-slate-900 dark:text-zinc-100 tracking-tight leading-snug">
              <MathRenderer content={effectiveTest.title} />
            </h4>
            {effectiveTest.description && (
              <div className="text-xs text-slate-600 dark:text-zinc-400 mt-1 font-normal leading-relaxed">
                <MathRenderer content={effectiveTest.description} />
              </div>
            )}
          </div>
        </div>

        {summary && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#21222e] text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-medium flex items-start gap-2.5 shadow-none border border-slate-300 dark:border-zinc-700">
            <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center text-[10px] shrink-0 font-bold border border-blue-200/60 dark:border-blue-900/40">AI</span>
            <div className="flex-1"><MathRenderer content={summary} /></div>
          </div>
        )}

        {saveSuccessNotice && (
          <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2 animate-fade-in shadow-none border border-emerald-200/80 dark:border-emerald-800/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}
      </div>

      {/* Metadata Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#21222e] text-slate-700 dark:text-zinc-200 flex items-center gap-1.5 shadow-none border border-slate-300 dark:border-zinc-700">
          <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
          <span><MathRenderer content={effectiveTest.topic || 'General Math'} /></span>
        </span>

        <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#21222e] text-slate-700 dark:text-zinc-200 flex items-center gap-1.5 shadow-none border border-slate-300 dark:border-zinc-700">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            {questionsCount} Questions
            {newlyAddedCount > 0 && (
              <span className="ml-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                (+{newlyAddedCount} new)
              </span>
            )}
          </span>
        </span>

        <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#21222e] text-slate-700 dark:text-zinc-200 flex items-center gap-1.5 shadow-none border border-slate-300 dark:border-zinc-700">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>{effectiveTest.timeLimitMinutes || effectiveTest.time || 15} mins</span>
        </span>
      </div>

      {/* Questions & Solutions Preview Section - Sharp Borders Clean Accordion */}
      {questionsCount > 0 && (
        <div className={`${APP_STYLES.widgets.container} overflow-hidden shadow-none`}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#202124] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-blue-500" />
              <span>{isExpanded ? 'Hide Questions & Solutions' : `Preview Questions & Solutions (${questionsCount})`}</span>
            </span>
            <span className="flex items-center gap-1 text-slate-500 text-[11px]">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {isExpanded && (
            <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
              {(showAllQuestions ? effectiveTest.questions : effectiveTest.questions.slice(0, 3)).map((q, idx) => {
                const isNewQuestion = isUpdate && existingTest && !existingTest.questions?.some(
                  (eq) => (eq.id && q.id && eq.id === q.id) || (eq.text && q.text && eq.text.trim().toLowerCase() === q.text.trim().toLowerCase())
                );
                return (
                  <div 
                    key={`test-action-q-${effectiveTest.id || 'test'}-${q.id || 'q'}-${idx}`}
                    className="w-full p-3.5 rounded-xl bg-white dark:bg-[#12131a] text-xs space-y-2.5 shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-zinc-200">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-100/70 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-semibold shadow-none border border-blue-200/60 dark:border-blue-900/40">
                          Question {idx + 1} • {q.type === 'numerical' ? 'Numerical Answer' : 'Multiple Choice'}
                        </span>
                        {isNewQuestion && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold shadow-none border border-emerald-200/60 dark:border-emerald-800/40">
                            New Addition
                          </span>
                        )}
                      </div>
                      {q.points && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          {q.points} pt{q.points > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    
                    {/* Question Text with Full LaTeX Math Rendering */}
                    <div className="text-slate-900 dark:text-zinc-100 font-normal text-[13px] leading-relaxed pl-0.5">
                      <MathRenderer content={q.text} />
                    </div>

                    {/* Question Diagram / Image */}
                    {(q.imageUrl || (q as any).paperLayout?.imageUrl || (Array.isArray(q.imageUrls) && q.imageUrls.some(Boolean))) && (
                      <div className="my-2.5 max-w-full flex justify-center">
                        <QuestionDiagramViewer
                          imageUrl={q.imageUrl || (q as any).paperLayout?.imageUrl}
                          imageUrls={q.imageUrls}
                          imageWidths={q.imageWidths}
                          alt={`Question ${idx + 1} Diagram`}
                          width={q.imageWidth || (q as any).paperLayout?.imageWidth}
                          allowZoom={true}
                          className="my-0!"
                        />
                      </div>
                    )}

                    {/* Options (MCQ) with MathRenderer */}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5 w-full">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = checkIsOptionCorrect(opt, oIdx, q);
                          return (
                            <div 
                              key={oIdx} 
                              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-none border ${
                                isCorrect
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-semibold border-emerald-500 dark:border-emerald-400'
                                  : 'bg-white dark:bg-[#21222e] text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0 shadow-none ${
                                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-[#282a2d] text-slate-600 dark:text-zinc-300'
                              }`}>
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <div className="truncate flex-1 font-normal"><MathRenderer content={String(opt)} /></div>
                              {isCorrect && (
                                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                  Correct
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Numerical Answer with MathRenderer */}
                    {(!q.options || q.options.length === 0) && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold text-xs flex items-center gap-2 w-full shadow-none border border-emerald-200/80 dark:border-emerald-800/60">
                        <span>Correct Answer:</span>
                        <div className="font-mono px-2 py-0.5 rounded-lg bg-white dark:bg-[#21222e] text-emerald-700 dark:text-emerald-300 shadow-none border border-emerald-300 dark:border-emerald-800">
                          <MathRenderer content={String(q.correctAnswer)} />
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Solution with MathRenderer */}
                    {(q.explanation || q.solution) && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-zinc-800/60 text-xs text-slate-700 dark:text-zinc-200 space-y-1 w-full">
                        <div className="font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          <span>Step-by-Step Solution:</span>
                        </div>
                        <div className="leading-relaxed font-normal text-slate-700 dark:text-zinc-300">
                          <MathRenderer content={q.explanation || q.solution || ''} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {effectiveTest.questions.length > 3 && (
                <button
                  onClick={() => setShowAllQuestions(!showAllQuestions)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-100/70 dark:hover:bg-[#181a24] py-2.5 w-full text-center cursor-pointer transition-colors rounded-xl shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                >
                  {showAllQuestions ? 'Show fewer questions' : `Show all ${effectiveTest.questions.length} questions...`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Options Underneath - Sharp Borders */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* 1. Save to Library / Update Button */}
        <button
          onClick={() => {
            if (isSaved) {
              handleUnsaveTest();
            } else {
              handleSaveOrApply();
            }
          }}
          onDoubleClick={handleUnsaveTest}
          disabled={isApplying}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-none border flex items-center gap-1.5 ${
            isApplying
              ? 'bg-indigo-500 text-white border-indigo-500 opacity-90 cursor-wait'
              : isSaved
              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
              : isDelete
              ? 'bg-red-600 border-red-600 hover:bg-red-700 text-white'
              : isUpdate
              ? 'bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-blue-600 border-blue-600 hover:bg-blue-700 text-white'
          }`}
          title={
            isApplying
              ? 'Updating test...'
              : isSaved
              ? 'Saved to library (Double-click to unsave)'
              : isUpdate
              ? `Update test in library to ${effectiveTest.questions.length} questions`
              : 'Save to Library'
          }
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{isUpdate ? 'Updating...' : 'Saving...'}</span>
            </>
          ) : isSaved ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isDelete ? 'Deleted' : isUpdate ? 'Updated' : 'Saved'}</span>
            </>
          ) : isDelete ? (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete from Library</span>
            </>
          ) : isUpdate ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Update Test ({effectiveTest.questions.length} Questions)</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Save to Library</span>
            </>
          )}
        </button>

        {/* 2. Take Test Button */}
        {onStartTest && !isDelete && effectiveTest.questions.length > 0 && (
          <button
            onClick={() => onStartTest(effectiveTest, 'timed')}
            className="p-2 sm:px-4 sm:py-2 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-[#21222e] dark:hover:bg-[#282a2d] text-slate-800 dark:text-zinc-100 transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 shadow-none border border-slate-300 dark:border-zinc-700"
            title="Take Test"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Take Test</span>
          </button>
        )}

        {/* Unified Edit in Studio with AI Button */}
        {!isDelete && (
          <button
            type="button"
            onClick={() => {
              if (onEditTest) {
                onEditTest(effectiveTest, { openAiPrompt: true });
              } else {
                window.dispatchEvent(new CustomEvent('gemini-open-test-canvas', {
                  detail: {
                    test: effectiveTest,
                    actionData,
                    messageId
                  }
                }));
              }
            }}
            className="px-4 py-2 rounded-full text-xs font-semibold bg-blue-50 hover:bg-blue-100/90 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 shadow-none border border-blue-200/80 dark:border-blue-800/60"
            title="Edit this test in Studio with AI assistance"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>Edit in Studio with AI</span>
          </button>
        )}
      </div>

      {/* Inline AI Edit Panel - Updates this specific message directly */}
      {showInlineAiEdit && (
        <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 space-y-3 animate-fadeIn shadow-none border border-blue-200/80 dark:border-blue-800/60">
          <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Edit this Test with AI</span>
            </span>
            <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400">
              Response directly updates this message
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              placeholder="e.g. Add 5 more questions to make 25, make questions harder, add explanations..."
              className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#21222e] text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-none border border-blue-200/80 dark:border-blue-800/60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && inlinePrompt.trim()) {
                  e.preventDefault();
                  const promptToSend = inlinePrompt.trim();
                  window.dispatchEvent(new CustomEvent('gemini-edit-element', {
                    detail: {
                      type: 'test',
                      content: JSON.stringify(effectiveTest, null, 2),
                      title: effectiveTest.title,
                      targetMessageId: messageId,
                      prompt: promptToSend
                    }
                  }));
                  setShowInlineAiEdit(false);
                  setInlinePrompt('');
                }
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                const promptToSend = inlinePrompt.trim();
                if (!promptToSend) return;
                window.dispatchEvent(new CustomEvent('gemini-edit-element', {
                  detail: {
                    type: 'test',
                    content: JSON.stringify(effectiveTest, null, 2),
                    title: effectiveTest.title,
                    targetMessageId: messageId,
                    prompt: promptToSend
                  }
                }));
                setShowInlineAiEdit(false);
                setInlinePrompt('');
              }}
              disabled={!inlinePrompt.trim()}
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer disabled:opacity-50 active:scale-95 transition-all shrink-0 shadow-none border border-blue-600"
            >
              Update Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
