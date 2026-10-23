import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { ActiveTestSession } from '../types';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';

import { 
  androidModalVariants, 
  androidBackdropVariants, 
  androidFastTransition, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import { M3Button } from './ui/Material3';

interface ResumeTestModalProps {
  isOpen: boolean;
  activeSession: ActiveTestSession;
  pendingTestTitle?: string;
  onResume: () => void;
  onStartNew: () => void;
  onClose: () => void;
}

export const ResumeTestModal: React.FC<ResumeTestModalProps> = ({
  isOpen,
  activeSession,
  pendingTestTitle,
  onResume,
  onStartNew,
  onClose,
}) => {
  useScrollLock(isOpen);

  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 80,
    id: 'resume_test_modal',
  });

  if (!isOpen || !activeSession || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          {/* Backdrop */}
          <motion.div
            variants={androidBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={androidFastTransition}
            style={gpuAcceleratedStyle}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Minimal Modal Dialog Card matching Google Material 3 Dialog */}
          <motion.div
            variants={androidModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={androidFastTransition}
            style={gpuAcceleratedStyle}
            className="relative w-full max-w-md p-6 sm:p-7 z-10 overflow-hidden bg-[#f7f2fa] dark:bg-[#202125] text-[#1a1b1f] dark:text-[#e3e2e6] rounded-[28px] shadow-[0_8px_28px_rgba(0,0,0,0.28)] space-y-4"
          >
            {/* Modal Header Metadata */}
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#44474f] dark:text-[#c4c6d0]">
              <span className="uppercase tracking-wider font-bold text-[#1a1b1f] dark:text-[#e3e2e6]">
                In-Progress Session
              </span>
              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">
                {activeSession.mode === 'practice' ? 'Practice Mode' : 'Timed Exam'}
              </span>
            </div>

            {/* Heading */}
            <h2 className="text-xl sm:text-2xl font-bold text-[#1a1b1f] dark:text-[#e3e2e6] pt-2 pb-1 leading-tight line-clamp-2">
              {activeSession.test?.title || pendingTestTitle || 'Continue previous session?'}
            </h2>

            {/* Subtext */}
            <p className="text-[#44474f] dark:text-[#c4c6d0] text-sm font-normal leading-relaxed">
              A saved in-progress session for this test was found ({Object.keys(activeSession.answers || {}).length} of {activeSession.test?.questions?.length || 0} questions answered).
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <M3Button
                type="button"
                onClick={onStartNew}
                variant="tonal"
                className="h-10 px-5 text-sm"
              >
                Start New
              </M3Button>

              <M3Button
                type="button"
                onClick={onResume}
                variant="filled"
                className="h-10 px-6 text-sm"
              >
                Continue
              </M3Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
