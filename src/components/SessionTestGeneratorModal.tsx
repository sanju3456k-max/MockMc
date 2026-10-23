import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  FileText, 
  Image as ImageIcon, 
  CheckCircle2, 
  BookOpen,
  GraduationCap,
  ListOrdered
} from 'lucide-react';
import { ChatAttachment } from './GeminiChatbotView';
import { DifficultyLevel } from '../types';
import { DEFAULT_TOPICS, getSavedCustomTopics, saveCustomTopic } from '../utils/topics';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

export interface SessionTestGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  messageCount?: number;
  onGenerateTest: (config: {
    title: string;
    topic: string;
    questionCount: number;
    difficulty: DifficultyLevel;
    questionType: 'all' | 'mcq' | 'numerical';
    selectedFileNames: string[];
    additionalNotes?: string;
  }) => void;
  isDarkMode: boolean;
}

const QUESTION_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES: DifficultyLevel[] = ['Easy', 'Medium', 'Hard'];
const QUESTION_TYPES = [
  { id: 'all', label: 'Mixed' },
  { id: 'mcq', label: 'MCQ' },
  { id: 'numerical', label: 'Numerical' }
];

export const SessionTestGeneratorModal: React.FC<SessionTestGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateTest,
}) => {
  const [title, setTitle] = useState<string>('Comprehensive Practice Test');
  const [topic, setTopic] = useState<string>('Calculus');
  const [isCustomTopicActive, setIsCustomTopicActive] = useState<boolean>(false);
  const [customTopicInput, setCustomTopicInput] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState<string>('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Medium');
  const [questionType, setQuestionType] = useState<'all' | 'mcq' | 'numerical'>('all');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => {
    return new Set(sessionFiles.map(f => f.id || f.name));
  });
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  const [savedTopicsVersion, setSavedTopicsVersion] = useState(0);

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_test_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setTitle('Comprehensive Practice Test');
      setTopic('Calculus');
      setIsCustomTopicActive(false);
      setCustomTopicInput('');
      setQuestionCount(10);
      setCustomCount('');
      setDifficulty('Medium');
      setQuestionType('all');
      setSelectedFileIds(new Set(sessionFiles.map(f => f.id || f.name)));
      setAdditionalNotes('');
    }
  }, [isOpen, sessionFiles]);

  useEffect(() => {
    const handleUpdate = () => {
      setSavedTopicsVersion((v) => v + 1);
    };
    window.addEventListener('custom-topics-updated', handleUpdate);
    return () => window.removeEventListener('custom-topics-updated', handleUpdate);
  }, []);

  const savedCustomTopics = useMemo(() => getSavedCustomTopics(), [savedTopicsVersion]);

  if (!isOpen) return null;

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCount = customCount ? Math.max(1, Math.min(50, parseInt(customCount, 10) || 10)) : questionCount;
    const selectedFiles = sessionFiles.filter(f => selectedFileIds.has(f.id || f.name));
    const selectedFileNames = selectedFiles.map(f => f.name);

    const finalTopic = isCustomTopicActive ? (customTopicInput.trim() || 'Custom Topic') : topic;
    if (isCustomTopicActive && customTopicInput.trim()) {
      saveCustomTopic(customTopicInput.trim());
    }

    onGenerateTest({
      title: title.trim() || 'Practice Test',
      topic: finalTopic.trim() || 'General Mathematics',
      questionCount: finalCount,
      difficulty,
      questionType,
      selectedFileNames,
      additionalNotes: additionalNotes.trim() || undefined
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          id="session-test-generator-modal-backdrop" 
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={`${APP_STYLES.modal.backdrop} flex items-center justify-center p-3 sm:p-4`}
          onClick={onClose}
        >
          <motion.div 
            id="session-test-generator-modal-container"
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuTransformStyle}
            className={`${APP_STYLES.customBuilder.card} w-full max-w-lg overflow-hidden flex flex-col modal-content-smooth`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Round Modern Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80 -ml-1 mr-0.5"
                  title="Back to Chat (Esc)"
                  aria-label="Back to Chat"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-none border border-blue-200/60 dark:border-blue-900/40">
                  <GraduationCap className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Generate Practice Test
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Custom questions with step-by-step LaTeX solutions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#282a2d] transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rounded Modern Form */}
            <form onSubmit={handleGenerate} className="p-5 space-y-4 text-left text-sm overflow-y-auto max-h-[80vh]">
              {/* Test Title & Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Test Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Calculus Final Exam Review"
                    className="w-full px-3.5 py-2.5 rounded-full bg-slate-50 dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 focus:outline-none text-xs transition-all shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Topic
                  </label>
                  <select
                    id="session-generator-topic-select"
                    value={isCustomTopicActive ? '__CUSTOM__' : topic}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        setIsCustomTopicActive(true);
                        const initialVal = DEFAULT_TOPICS.some(dt => dt.toLowerCase() === topic.toLowerCase()) ? '' : topic;
                        setCustomTopicInput(initialVal);
                      } else {
                        setIsCustomTopicActive(false);
                        setTopic(val);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-full bg-slate-50 dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 focus:outline-none text-xs cursor-pointer transition-all shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                  >
                    <option value="__CUSTOM__" className="font-bold text-blue-600 dark:text-blue-400">+ Custom Topic...</option>
                    <optgroup label="Standard Topics">
                      {DEFAULT_TOPICS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                    {savedCustomTopics.length > 0 && (
                      <optgroup label="Custom Topics">
                        {savedCustomTopics.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {isCustomTopicActive && (
                    <div className="mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      <input
                        id="session-generator-custom-topic-input"
                        type="text"
                        value={customTopicInput}
                        onChange={(e) => setCustomTopicInput(e.target.value)}
                        placeholder="Enter topic name..."
                        className="w-full px-3.5 py-2 rounded-full bg-blue-50/70 dark:bg-blue-950/40 text-slate-900 dark:text-zinc-100 focus:outline-none text-xs transition-all shadow-none border border-blue-200/80 dark:border-blue-800/60"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Included Session Files (Only if present) */}
              {sessionFiles.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>Reference Documents ({selectedFileIds.size}/{sessionFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFileIds(new Set(sessionFiles.map(f => f.id || f.name)))}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                    >
                      Select All
                    </button>
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {sessionFiles.map((file) => {
                      const fileId = file.id || file.name;
                      const isSelected = selectedFileIds.has(fileId);
                      const isPdf = file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');

                      return (
                        <button
                          key={fileId}
                          type="button"
                          onClick={() => toggleFileSelection(fileId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer truncate max-w-full shadow-none ${
                            isSelected 
                              ? 'bg-blue-600 text-white font-medium border border-blue-600' 
                              : 'bg-slate-50 dark:bg-[#282a2d] text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                          }`}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                          ) : isPdf ? (
                            <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Number of Questions */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Questions Count
                </label>
                <div className="flex items-center gap-1.5">
                  {QUESTION_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        setQuestionCount(count);
                        setCustomCount('');
                      }}
                      className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all text-center cursor-pointer shadow-none ${
                        questionCount === count && !customCount
                          ? 'bg-blue-600 text-white border border-blue-600'
                          : 'bg-slate-50 dark:bg-[#282a2d] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                      }`}
                    >
                      {count} Qs
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="Custom"
                    value={customCount}
                    onChange={(e) => setCustomCount(e.target.value)}
                    className={`w-20 px-3 py-2 rounded-full text-xs text-center font-medium bg-slate-50 dark:bg-[#282a2d] focus:outline-none shadow-none border ${
                      customCount
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 font-bold border-blue-400 dark:border-blue-600'
                        : 'text-slate-800 dark:text-zinc-200 border-slate-200/80 dark:border-zinc-800/80'
                    }`}
                  />
                </div>
              </div>

              {/* Difficulty and Question Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {DIFFICULTIES.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDifficulty(lvl)}
                        className={`py-2 rounded-full text-xs font-semibold text-center transition-all cursor-pointer shadow-none ${
                          difficulty === lvl
                            ? 'bg-blue-600 text-white border border-blue-600'
                            : 'bg-slate-50 dark:bg-[#282a2d] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Format
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {QUESTION_TYPES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setQuestionType(item.id as any)}
                        className={`py-2 rounded-full text-xs font-semibold text-center transition-all cursor-pointer shadow-none ${
                          questionType === item.id
                            ? 'bg-blue-600 text-white border border-blue-600'
                            : 'bg-slate-50 dark:bg-[#282a2d] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional Instructions */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Additional Directives (Optional)
                </label>
                <input
                  type="text"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="e.g. Focus on integration by parts; include edge cases"
                  className="w-full px-3.5 py-2.5 rounded-full bg-slate-50 dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 focus:outline-none text-xs transition-all shadow-none border border-slate-200/80 dark:border-zinc-800/80"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className={APP_STYLES.button.secondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${APP_STYLES.button.primary} !bg-blue-600 !border-blue-600 !hover:bg-blue-700`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Test</span>
                </button>
              </div>
            </form>
          </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
