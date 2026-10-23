import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  X, 
  ArrowLeft,
  Image as ImageIcon, 
  Palette,
  Layout,
  Code2,
  FileCheck
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

export interface SessionImageGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFiles: ChatAttachment[];
  onGenerateImage: (config: {
    prompt: string;
    style: string;
    aspectRatio: string;
    includeContext: boolean;
    usePythonPlot: boolean;
  }) => void;
  isDarkMode: boolean;
}

const STYLE_OPTIONS = [
  { id: 'math_diagram', label: 'Diagram' },
  { id: 'infographic', label: 'Infographic' },
  { id: 'photorealistic', label: '3D Render' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'scifi', label: 'Sci-Fi / HUD' },
];

const ASPECT_RATIOS = ['Free Size', '16:9', '1:1', '4:3', '9:16', '3:2'];

export const SessionImageGeneratorModal: React.FC<SessionImageGeneratorModalProps> = ({
  isOpen,
  onClose,
  sessionFiles,
  onGenerateImage,
}) => {
  const [prompt, setPrompt] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('math_diagram');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('Free Size');
  const [includeContext, setIncludeContext] = useState<boolean>(sessionFiles.length > 0);
  const [usePythonPlot, setUsePythonPlot] = useState<boolean>(true);

  // Back Navigation Handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 25,
    id: 'session_image_generator_modal'
  });

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setSelectedStyle('math_diagram');
      setSelectedAspectRatio('Free Size');
      setIncludeContext(sessionFiles.length > 0);
      setUsePythonPlot(true);
    }
  }, [isOpen, sessionFiles.length]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    onGenerateImage({
      prompt: prompt.trim(),
      style: selectedStyle,
      aspectRatio: selectedAspectRatio,
      includeContext,
      usePythonPlot,
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
            {/* Modern Rounded Header - Sharp Border */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
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
            <div className="w-9 h-9 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-none border border-purple-200/60 dark:border-purple-900/40">
              <ImageIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Generate Visual Image
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Mathematical diagrams, plots & AI illustrations
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

        {/* Modern Form */}
        <form onSubmit={handleGenerate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Prompt Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Description
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. 3D surface plot of z = sin(x)*cos(y), Transformer attention map, or geometric proof..."
              rows={3}
              required
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-2xl bg-slate-50 dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-all resize-none shadow-none border border-slate-200/80 dark:border-zinc-800/80"
            />
          </div>

          {/* Style Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-none border border-purple-200/60 dark:border-purple-900/40">
                <Palette className="w-3 h-3" />
              </div>
              <span>Style</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer shadow-none ${
                    selectedStyle === style.id
                      ? 'bg-purple-600 text-white font-semibold border border-purple-600'
                      : 'bg-slate-50 dark:bg-[#282a2d] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio & Format Row */}
          <div className="space-y-3 pt-0.5">
            {/* Aspect Ratio - With Free Size option */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-none border border-purple-200/60 dark:border-purple-900/40">
                    <Layout className="w-3 h-3" />
                  </div>
                  <span>Aspect Ratio</span>
                </label>
                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                  {selectedAspectRatio === 'Free Size' ? 'Auto Free Canvas Size' : selectedAspectRatio}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setSelectedAspectRatio(ratio)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold text-center transition-all cursor-pointer shadow-none ${
                      selectedAspectRatio === ratio
                        ? 'bg-purple-600 text-white font-bold border border-purple-600'
                        : 'bg-slate-50 dark:bg-[#282a2d] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#35373b] border border-slate-200/80 dark:border-zinc-800/80'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Format Engine Option */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-none border border-purple-200/60 dark:border-purple-900/40">
                  <Code2 className="w-3 h-3" />
                </div>
                <span>Format Engine</span>
              </label>
              <div className="p-2.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/40 flex items-center justify-between gap-3 text-xs text-purple-900 dark:text-purple-200 shadow-none border border-purple-200/60 dark:border-purple-900/40">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse shrink-0" />
                  <span className="font-bold">Python Plot (Rendered Image & Code)</span>
                </div>
                <span className="text-[10px] font-semibold opacity-80 bg-purple-200/60 dark:bg-purple-900/60 px-2 py-0.5 rounded-full shadow-none border border-purple-300/60 dark:border-purple-800/60">
                  Matplotlib
                </span>
              </div>
            </div>
          </div>

          {/* Context Grounding (Only if session files exist) */}
          {sessionFiles.length > 0 && (
            <label className="flex items-center justify-between p-2.5 rounded-full bg-slate-50 dark:bg-[#282a2d] cursor-pointer hover:bg-slate-100/80 dark:hover:bg-[#35373b] transition-colors shadow-none border border-slate-200/80 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5 min-w-0 pl-1">
                <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-none border border-purple-200/60 dark:border-purple-900/40">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate">
                  Reference {sessionFiles.length} uploaded file{sessionFiles.length !== 1 ? 's' : ''}
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded-full text-purple-600 focus:ring-0 h-4 w-4 cursor-pointer mr-1"
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
              disabled={!prompt.trim()}
              className={`${APP_STYLES.button.primary} !bg-purple-600 !border-purple-600 !hover:bg-purple-700`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Visual</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
