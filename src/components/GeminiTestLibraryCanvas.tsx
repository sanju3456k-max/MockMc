import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Sparkles, 
  Play, 
  Flame, 
  Edit3, 
  Trash2, 
  Clock, 
  Layers, 
  Check, 
  Target, 
  Award, 
  ChevronRight, 
  Plus, 
  HelpCircle,
  TrendingUp,
  Pin,
  Save,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { MathTest, MathQuestion, TestAttempt, normalizeQuestions, checkIsOptionCorrect } from '../types';
import { MathRenderer } from './MathRenderer';

interface GeminiTestLibraryCanvasProps {
  tests: MathTest[];
  attempts?: TestAttempt[];
  selectedTestId?: string | null;
  onSelectTest: (testId: string) => void;
  onSaveTest?: (test: MathTest) => void;
  onDeleteTest?: (testId: string) => void;
  onStartTest?: (test: MathTest, mode: 'timed' | 'practice') => void;
  onEditTest?: (test: MathTest) => void;
  onAskGeminiPrompt: (promptText: string) => void;
  isDarkMode?: boolean;
}

export const GeminiTestLibraryCanvas: React.FC<GeminiTestLibraryCanvasProps> = ({
  tests,
  attempts = [],
  selectedTestId,
  onSelectTest,
  onSaveTest,
  onDeleteTest,
  onStartTest,
  onEditTest,
  onAskGeminiPrompt,
  isDarkMode
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedQuestionText, setEditedQuestionText] = useState<string>('');
  const [editedCorrectAnswer, setEditedCorrectAnswer] = useState<string>('');

  // Extract unique topics from test library
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t) => {
      if (t.topic) set.add(t.topic);
    });
    return ['All', ...Array.from(set)];
  }, [tests]);

  // Filter tests by search and topic
  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesTopic = selectedTopic === 'All' || t.topic === selectedTopic;
      const matchesSearch = !searchQuery || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.topic && t.topic.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesTopic && matchesSearch;
    });
  }, [tests, selectedTopic, searchQuery]);

  // Active focused test
  const activeTest = useMemo(() => {
    let target: MathTest | null = null;
    if (selectedTestId) {
      const found = tests.find((t) => t.id === selectedTestId);
      if (found) target = found;
    }
    if (!target) {
      target = filteredTests.length > 0 ? filteredTests[0] : (tests.length > 0 ? tests[0] : null);
    }
    if (!target) return null;
    return {
      ...target,
      questions: normalizeQuestions(target.questions || [])
    };
  }, [tests, filteredTests, selectedTestId]);

  // Attempts for active test
  const activeTestAttempts = useMemo(() => {
    if (!activeTest) return [];
    return attempts.filter((a) => a.testId === activeTest.id);
  }, [attempts, activeTest]);

  const bestScore = useMemo(() => {
    if (activeTestAttempts.length === 0) return null;
    return Math.max(...activeTestAttempts.map((a) => a.percentage));
  }, [activeTestAttempts]);

  // Quick save inline question edit
  const handleSaveInlineQuestion = (qId: string) => {
    if (!activeTest || !onSaveTest) return;
    const updatedQuestions = (activeTest.questions || []).map((q) => {
      if (q.id === qId) {
        return {
          ...q,
          text: editedQuestionText,
          correctAnswer: editedCorrectAnswer
        };
      }
      return q;
    });

    const updatedTest: MathTest = {
      ...activeTest,
      questions: updatedQuestions,
      updatedAt: new Date().toISOString()
    };

    onSaveTest(updatedTest);
    setEditingQuestionId(null);
  };

  const getDifficultyColor = (diff?: string) => {
    switch (diff) {
      case 'Easy':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
      case 'Medium':
        return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
      case 'Hard':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800';
      case 'Advanced':
        return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800';
      default:
        return 'text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-[#222530] border-slate-200 dark:border-[#2e3240]';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Top Header & Search Bar */}
      <div className="space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Test Library Workspace ({tests.length})</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Browse, inspect, edit, or ask Gemini to enhance any test
            </p>
          </div>

          <button
            onClick={() => {
              onAskGeminiPrompt("Please create a brand new, challenging 10-question test on Advanced Calculus with step-by-step LaTeX proofs and solutions.");
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Generate Test</span>
          </button>
        </div>

        {/* Search & Topic Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tests by title, topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {availableTopics.length > 2 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="py-1.5 px-2 text-xs bg-slate-50 dark:bg-[#12141a] border border-slate-200 dark:border-zinc-800/60 rounded-xl text-slate-800 dark:text-zinc-200 focus:outline-none font-bold"
            >
              {availableTopics.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Split Body: Left List / Right Inspection View */}
      {tests.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-[#12141a] rounded-2xl border border-dashed border-slate-300 dark:border-[#2e3240] my-auto">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="font-bold text-xs text-slate-700 dark:text-zinc-300">Your test library is empty</p>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
            Ask Gemini in the chat to generate a test or import sample tests.
          </p>
          <button
            onClick={() => onAskGeminiPrompt("Create a 5-question test on Linear Algebra and Matrices with LaTeX equations.")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            Create First Test with Gemini
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Test Selector Sidebar (4 Cols) */}
          <div className="md:col-span-4 flex flex-col space-y-1.5 overflow-y-auto pr-1 border-r border-slate-200/60 dark:border-[#252834]">
            {filteredTests.map((test) => {
              const isSelected = activeTest?.id === test.id;
              const qCount = Array.isArray(test.questions) ? test.questions.length : 0;
              return (
                <div
                  key={test.id}
                  onClick={() => onSelectTest(test.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-2xs'
                      : 'bg-white dark:bg-[#1b1e28] border-slate-200/80 dark:border-[#282b38] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-xs text-slate-900 dark:text-zinc-100 line-clamp-1">
                      {test.title}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0 ${getDifficultyColor(test.difficulty)}`}>
                      {test.difficulty || 'Med'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                    <span className="truncate">{test.topic || 'General'}</span>
                    <span className="shrink-0 font-medium">{qCount} Qs • {test.timeLimitMinutes || test.time || 15}m</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Test Detail & Question Inspector (8 Cols) */}
          {activeTest ? (
            <div className="md:col-span-8 flex flex-col h-full space-y-3 overflow-y-auto pl-1 pr-2">
              {/* Active Test Card Header */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#14161f] border border-slate-200/80 dark:border-zinc-800/60 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-zinc-100">
                      {activeTest.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      {activeTest.description || 'No description provided.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onAskGeminiPrompt(`I am working on the test "${activeTest.title}" (ID: ${activeTest.id}). Please analyze this test, review all questions for mathematical clarity, and suggest improvements.`);
                    }}
                    className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    title="Focus & Analyze in Chat"
                  >
                    <Pin className="w-3.5 h-3.5 fill-current" />
                    <span>Focus in Chat</span>
                  </button>
                </div>

                {/* Metadata & Best Score */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  <span>Topic: <b className="text-slate-800 dark:text-zinc-200">{activeTest.topic || 'General'}</b></span>
                  <span aria-hidden="true">•</span>
                  <span className={`font-bold ${
                    activeTest.difficulty === 'Easy' ? 'text-emerald-600 dark:text-emerald-400' :
                    activeTest.difficulty === 'Hard' ? 'text-orange-600 dark:text-orange-400' :
                    activeTest.difficulty === 'Advanced' ? 'text-purple-600 dark:text-purple-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {activeTest.difficulty || 'Medium'}
                  </span>
                  <span aria-hidden="true">•</span>
                  <span>{activeTest.questions?.length || 0} Questions</span>
                  <span aria-hidden="true">•</span>
                  <span>{activeTest.timeLimitMinutes || activeTest.time || 15} Mins</span>
                  {bestScore !== null && (
                    <>
                      <span aria-hidden="true">•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" />
                        Best: {bestScore}%
                      </span>
                    </>
                  )}
                </div>

                {/* AI Quick Prompts Toolbar */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-[#252834] space-y-1.5">
                  <div className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-500" />
                    <span>Gemini AI Operations on this Test:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        onAskGeminiPrompt(`Please add 3 challenging, high-yield questions with rigorous step-by-step LaTeX solutions to the test "${activeTest.title}" (ID: ${activeTest.id}) and provide the updated test in \`\`\`test-action block.`);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#202330] text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 cursor-pointer"
                    >
                      + Add 3 Harder Questions
                    </button>
                    <button
                      onClick={() => {
                        onAskGeminiPrompt(`Please upgrade the difficulty of test "${activeTest.title}" (ID: ${activeTest.id}) to Advanced level, add rigorous proofs and derivations, and output the updated test in \`\`\`test-action block.`);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#202330] text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900 hover:bg-purple-50 cursor-pointer"
                    >
                      ⚡ Upgrade to Advanced
                    </button>
                    <button
                      onClick={() => {
                        onAskGeminiPrompt(`Please check all questions, options, and solutions in test "${activeTest.title}" (ID: ${activeTest.id}) for mathematical correctness, fix any LaTeX notation issues, and output the polished test in \`\`\`test-action block.`);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#202330] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 cursor-pointer"
                    >
                      ✅ Audit & Fix Formulas
                    </button>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-[#252834]">
                  {onStartTest && (
                    <>
                      <button
                        onClick={() => onStartTest(activeTest, 'practice')}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Practice Mode</span>
                      </button>
                      <button
                        onClick={() => onStartTest(activeTest, 'timed')}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        <span>Take Exam</span>
                      </button>
                    </>
                  )}

                  {onEditTest && (
                    <button
                      onClick={() => onEditTest(activeTest)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100/80 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                      title="Edit in Studio with AI assistance"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                      <span>Edit in Studio with AI</span>
                    </button>
                  )}

                  {onDeleteTest && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete test "${activeTest.title}" from your library?`)) {
                          onDeleteTest(activeTest.id);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#222530] text-red-600 dark:text-red-400 border border-slate-200 dark:border-[#2e3240] hover:bg-red-50 ml-auto cursor-pointer"
                      title="Delete Test"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Questions List & Formula Inspector */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Questions & Solutions ({activeTest.questions?.length || 0})
                  </span>
                </div>

                {(activeTest.questions || []).map((q, idx) => {
                  const isEditing = editingQuestionId === q.id;
                  return (
                    <div
                      key={`library-q-${activeTest.id || 'test'}-${q.id || 'q'}-${idx}`}
                      className="p-3 rounded-xl bg-white dark:bg-[#21222e] border border-slate-200/80 dark:border-[#282b38] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-zinc-200">
                        <span className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold">
                            {idx + 1}
                          </span>
                          <span>Question {idx + 1}</span>
                          <span className="text-[10px] text-slate-400">({q.type || 'mcq'})</span>
                        </span>

                        <button
                          onClick={() => {
                            if (isEditing) {
                              setEditingQuestionId(null);
                            } else {
                              setEditingQuestionId(q.id || `q_${idx+1}`);
                              setEditedQuestionText(q.text);
                              setEditedCorrectAnswer(q.correctAnswer || '');
                            }
                          }}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{isEditing ? 'Cancel' : 'Quick Edit'}</span>
                        </button>
                      </div>

                      {/* Question Text */}
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">Question Text (LaTeX):</label>
                          <textarea
                            value={editedQuestionText}
                            onChange={(e) => setEditedQuestionText(e.target.value)}
                            rows={2}
                            className="w-full p-2 text-xs font-mono bg-slate-50 dark:bg-[#12141a] border border-slate-300 dark:border-[#2c3040] rounded-lg"
                          />
                          <label className="text-[10px] font-bold text-slate-500">Correct Answer:</label>
                          <input
                            type="text"
                            value={editedCorrectAnswer}
                            onChange={(e) => setEditedCorrectAnswer(e.target.value)}
                            className="w-full p-2 text-xs font-mono bg-slate-50 dark:bg-[#12141a] border border-slate-300 dark:border-[#2c3040] rounded-lg"
                          />
                          <button
                            onClick={() => handleSaveInlineQuestion(q.id || `q_${idx+1}`)}
                            className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Save Changes</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-slate-900 dark:text-zinc-100 font-medium">
                          <MathRenderer content={q.text} />
                        </div>
                      )}

                      {/* MCQ Options */}
                      {Array.isArray(q.options) && q.options.length > 0 && !isEditing && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = checkIsOptionCorrect(opt, oIdx, q);
                            return (
                              <div
                                key={oIdx}
                                className={`p-1.5 rounded-lg text-[11px] border flex items-center gap-1.5 ${
                                  isCorrect
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 font-bold'
                                    : 'bg-slate-50 dark:bg-[#1d202b] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-[#2b2e3c]'
                                }`}
                              >
                                <span className="font-mono text-[10px] text-slate-400">{String.fromCharCode(65 + oIdx)}.</span>
                                <div className="truncate"><MathRenderer content={opt} /></div>
                                {isCorrect && <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 ml-auto shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Correct Answer Display */}
                      {(!q.options || q.options.length === 0) && !isEditing && (
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          Correct Answer: <span className="font-mono">{q.correctAnswer}</span>
                        </div>
                      )}

                      {/* Step-by-step Solution */}
                      {(q.explanation || q.solution) && !isEditing && (
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#14161f] border border-slate-200/60 dark:border-[#252834] text-[11px] text-slate-600 dark:text-zinc-400">
                          <span className="font-bold text-slate-700 dark:text-zinc-300">Derivation / Solution: </span>
                          <MathRenderer content={q.explanation || q.solution || ''} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
