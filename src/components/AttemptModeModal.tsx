import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, FileCheck2, Clock, CheckCircle2, ArrowRight, X, Sparkles } from 'lucide-react';
import type { MathTest } from '../types';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { studioModalVariants, studioBackdropVariants } from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface AttemptModeModalProps {
  isOpen: boolean;
  test: MathTest | null;
  onClose: () => void;
  onSelectOnlineMode: (test: MathTest) => void;
  onSelectOmrMode: (test: MathTest) => void;
}

export const AttemptModeModal: React.FC<AttemptModeModalProps> = ({
  isOpen,
  test,
  onClose,
  onSelectOnlineMode,
  onSelectOmrMode,
}) => {
  useScrollLock(isOpen);
  useBackHandler({ isOpen, onBack: onClose });

  if (!isOpen || !test) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="attempt-mode-backdrop"
        variants={studioBackdropVariants}
        initial="closed"
        animate="open"
        exit="closed"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          key="attempt-mode-dialog"
          variants={studioModalVariants}
          initial="closed"
          animate="open"
          exit="closed"
          onClick={(e) => e.stopPropagation()}
          className={APP_STYLES.modal.dialog}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
                SELECT ATTEMPT MODE
              </span>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                How would you like to take this test?
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 font-medium">
                {test.title} • {test.questions?.length || 0} Questions
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={APP_STYLES.button.icon}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Options Grid: Matching Home Screen Crisp Card Surfaces */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            {/* Option 1: Online Mode */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectOnlineMode(test);
              }}
              className={`p-4 sm:p-5 text-left flex flex-col justify-between space-y-3.5 group ${APP_STYLES.card.interactive}`}
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-[28px] bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] flex items-center justify-center font-bold border-0 ring-0 shadow-none">
                  <Monitor className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors">
                  Online Digital Mode
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-normal">
                  Interactive CBT exam with live stopwatch, palette navigation, and instant digital submission.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] pt-2 border-0">
                <span>Start Online Test</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Option 2: OMR Paper & Scan Mode */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectOmrMode(test);
              }}
              className={`p-4 sm:p-5 text-left flex flex-col justify-between space-y-3.5 group ${APP_STYLES.card.interactive}`}
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-[28px] bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold border-0 ring-0 shadow-none">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors">
                  OMR Paper & Scan Mode
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-normal">
                  Print 2-column A4 question paper & bubble sheet, then scan via camera to evaluate and sync marks.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] pt-2 border-0">
                <span>Attempt OMR Mode</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
