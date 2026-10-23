import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  FileSpreadsheet, 
  Table as TableIcon,
  FileCheck,
  ListOrdered,
  Sliders,
  Columns
} from 'lucide-react';
import { ChatAttachment } from './GeminiChatbotView';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

export interface SessionTableGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  onGenerateTable: (config: {
    title: string;
    topic: string;
    tableType: string;
    rowCount: number;
    customColumns?: string;
    includeContext: boolean;
    additionalNotes?: string;
  }) => void;
  isDarkMode: boolean;
}

const TABLE_PRESETS = [
  { 
    id: 'Formula & Theorem Sheet', 
    label: 'Formula Sheet', 
    columns: 'Concept / Rule | LaTeX Formula | Domain & Constraints | Example' 
  },
  { 
    id: 'Comparison Matrix', 
    label: 'Comparison Matrix', 
    columns: 'Item / Concept | Category | Core Characteristics | Pros | Cons | Best Use Case' 
  },
  { 
    id: 'Dataset & Metrics', 
    label: 'Data & Metrics', 
    columns: 'Metric Name | Measured Value | Benchmark | Delta | Unit | Status' 
  },
  { 
    id: 'Algorithm & Workflow', 
    label: 'Algorithm / Workflow', 
    columns: 'Algorithm | Time Complexity | Space Complexity | Best Case | Invariant' 
  },
];

const PRESET_ROW_COUNTS = [5, 8, 12, 20];

export const SessionTableGeneratorModal: React.FC<SessionTableGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateTable,
}) => {
  const [topic, setTopic] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('Formula & Theorem Sheet');
  const [rowCount, setRowCount] = useState<number>(8);
  const [isCustomRowsCols, setIsCustomRowsCols] = useState<boolean>(false);
  const [customRowsInput, setCustomRowsInput] = useState<string>('');
  const [customColumnCountInput, setCustomColumnCountInput] = useState<string>('');
  
  // Custom Columns Prompt Bar is blank by default and optional to fill
  const [customColumns, setCustomColumns] = useState<string>('');
  const [includeContext, setIncludeContext] = useState<boolean>(sessionFiles.length > 0);
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_table_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setTopic('');
      setTitle('');
      setSelectedPreset('Formula & Theorem Sheet');
      setRowCount(8);
      setIsCustomRowsCols(false);
      setCustomRowsInput('');
      setCustomColumnCountInput('');
      setCustomColumns('');
      setIncludeContext(sessionFiles.length > 0);
      setAdditionalNotes('');
    }
  }, [isOpen, sessionFiles.length]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const finalRowCount = isCustomRowsCols && customRowsInput.trim()
      ? Math.max(1, Math.min(100, parseInt(customRowsInput, 10) || 8))
      : rowCount;

    let finalCustomColumns = customColumns.trim();
    if (isCustomRowsCols && customColumnCountInput.trim()) {
      const colNum = parseInt(customColumnCountInput, 10);
      if (colNum > 0 && !finalCustomColumns) {
        finalCustomColumns = `Table with exactly ${colNum} customized columns`;
      }
    }

    onGenerateTable({
      title: title.trim() || topic.trim(),
      topic: topic.trim(),
      tableType: selectedPreset || 'Custom Table',
      rowCount: finalRowCount,
      customColumns: finalCustomColumns || undefined,
      includeContext,
      additionalNotes: additionalNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className={`${APP_STYLES.modal.backdrop} flex items-center justify-center p-3 sm:p-4`}
          onClick={onClose}
        >
          <motion.div 
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuTransformStyle}
            className={`${APP_STYLES.customBuilder.card} max-w-lg w-full overflow-hidden flex flex-col modal-content-smooth`}
            onClick={(e) => e.stopPropagation()}
          >
        {/* Modern Header - Round Out Icon without shadow */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer -ml-1 mr-0.5 shadow-none border border-slate-200/80 dark:border-zinc-800/80"
              title="Back to Chat (Esc)"
              aria-label="Back to Chat"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/40">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Generate Data Table
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Formula sheets, comparison matrices & custom structured datasets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer shadow-none border border-slate-200/80 dark:border-zinc-800/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleGenerate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Table Topic */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span>Topic / Subject</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                if (!title || title === topic) setTitle(e.target.value);
              }}
              placeholder="e.g. Calculus Standard Derivatives & Integrals, Sorting Algorithms..."
              required
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 shadow-none focus:outline-none transition-all"
            />
          </div>

          {/* Preset Structure Options */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/40">
                <TableIcon className="w-3 h-3" />
              </div>
              <span>Column Structure Presets</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TABLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-2.5 rounded-full text-xs font-medium text-center transition-all cursor-pointer truncate shadow-none ${
                    selectedPreset === preset.id
                      ? 'bg-emerald-600 text-white font-semibold border border-emerald-600'
                      : 'bg-slate-50 dark:bg-[#1f2024] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200/80 dark:border-zinc-800/80'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Blank / Optional Column Text Prompt Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/40">
                  <Columns className="w-3 h-3" />
                </div>
                <span>Custom Columns Text Prompt Bar</span>
              </label>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 shadow-none border border-slate-200/80 dark:border-zinc-800/80">
                Optional
              </span>
            </div>
            <input
              type="text"
              value={customColumns}
              onChange={(e) => setCustomColumns(e.target.value)}
              placeholder="Leave blank or enter custom columns (e.g. Concept | Formula | Example)"
              className="w-full px-3.5 py-2.5 text-xs rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 shadow-none focus:outline-none transition-all"
            />
            {customColumns.trim() && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pl-2 font-medium">
                <Sparkles className="w-3 h-3" />
                <span>Custom column prompt specified</span>
              </p>
            )}
          </div>

          {/* Target Rows with Custom Rows & Columns Button */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/40">
                <ListOrdered className="w-3 h-3" />
              </div>
              <span>Target Rows & Layout</span>
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_ROW_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setRowCount(count);
                    setIsCustomRowsCols(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-none ${
                    !isCustomRowsCols && rowCount === count
                      ? 'bg-emerald-600 text-white border border-emerald-600'
                      : 'bg-slate-50 dark:bg-[#1f2024] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200/80 dark:border-zinc-800/80'
                  }`}
                >
                  {count} Rows
                </button>
              ))}

              {/* Custom Rows & Columns Button */}
              <button
                type="button"
                onClick={() => setIsCustomRowsCols(true)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-none ${
                  isCustomRowsCols
                    ? 'bg-emerald-600 text-white border border-emerald-600'
                    : 'bg-slate-50 dark:bg-[#1f2024] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200/80 dark:border-zinc-800/80'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Custom Rows / Columns</span>
              </button>
            </div>

            {/* Custom Rows & Columns Input Fields */}
            {isCustomRowsCols && (
              <div className="pt-2 animate-in fade-in duration-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium pl-1">Row Count</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={customRowsInput}
                    onChange={(e) => setCustomRowsInput(e.target.value)}
                    placeholder="Custom rows (e.g. 15)"
                    autoFocus
                    className="w-full px-3.5 py-2 text-xs rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100 shadow-none focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium pl-1">Column Count</span>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={customColumnCountInput}
                    onChange={(e) => setCustomColumnCountInput(e.target.value)}
                    placeholder="Custom columns (e.g. 5)"
                    className="w-full px-3.5 py-2 text-xs rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100 shadow-none focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Optional Additional Directives */}
          <div className="space-y-1.5 pt-0.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Additional Directives (Optional)
            </label>
            <input
              type="text"
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="e.g. Include 3D plot formulas, add time complexity comparison column..."
              className="w-full px-3.5 py-2.5 text-xs rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 shadow-none focus:outline-none transition-all"
            />
          </div>

          {/* Context Grounding */}
          {sessionFiles.length > 0 && (
            <label className="flex items-center justify-between p-2.5 rounded-full bg-slate-50 dark:bg-[#1f2024] border border-slate-200/80 dark:border-zinc-800/80 shadow-none cursor-pointer hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0 pl-1">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/40">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate">
                  Extract from {sessionFiles.length} uploaded file{sessionFiles.length !== 1 ? 's' : ''}
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded-full text-emerald-600 focus:ring-0 h-4 w-4 cursor-pointer mr-1"
              />
            </label>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className={APP_STYLES.button.secondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim()}
              className={`${APP_STYLES.button.primary} !bg-emerald-600 !border-emerald-600 !hover:bg-emerald-700`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Table</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
