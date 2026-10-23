import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  FileText,
  BarChart2,
  Bot,
  Bookmark,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { 
  androidModalVariants, 
  androidBackdropVariants, 
  androidFastTransition, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import { deleteUserAccountAndAllData, type DeleteAccountProgress } from '../lib/firebase';
import { getLocalDataStorageStats } from '../lib/storage';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAccountDeleted?: () => void;
}

type StepNumber = 1 | 2 | 3;

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAccountDeleted,
}) => {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [ackTests, setAckTests] = useState(false);
  const [ackChats, setAckChats] = useState(false);
  const [ackAccount, setAckAccount] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState<DeleteAccountProgress>({
    step: 'idle',
    message: '',
  });

  // Calculate local data stats for preview
  const storageStats = getLocalDataStorageStats(currentUser?.uid || null);

  useScrollLock(isOpen);

  useBackHandler({
    isOpen,
    onBack: () => {
      if (!isDeleting) {
        if (currentStep > 1 && progress.step !== 'completed') {
          setCurrentStep((prev) => (prev - 1) as StepNumber);
        } else {
          onClose();
        }
      }
    },
    priority: 60,
    id: 'delete_account_modal_back',
  });

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setTypedConfirmation('');
      setAckTests(false);
      setAckChats(false);
      setAckAccount(false);
      setIsDeleting(false);
      setProgress({ step: 'idle', message: '' });
    }
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  const requiredConfirmText = currentUser.email ? currentUser.email.toLowerCase() : 'DELETE';
  const isTypedMatch = typedConfirmation.trim().toLowerCase() === requiredConfirmText || typedConfirmation.trim().toUpperCase() === 'DELETE';
  const isStep2Valid = ackTests && ackChats && ackAccount && isTypedMatch;

  const handleStartFinalDeletion = async () => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const res = await deleteUserAccountAndAllData(currentUser, (prog) => {
        setProgress(prog);
      });

      if (res.success) {
        setTimeout(() => {
          onAccountDeleted?.();
          onClose();
        }, 2200);
      } else {
        setIsDeleting(false);
      }
    } catch (err: any) {
      setIsDeleting(false);
      setProgress({
        step: 'error',
        message: err?.message || 'Failed to complete deletion.',
        error: String(err),
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={gpuAcceleratedStyle}
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center z-60 select-none p-3 sm:p-5"
        onClick={() => {
          if (!isDeleting && progress.step !== 'completed') onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          style={gpuAcceleratedStyle}
          className={`text-slate-900 dark:text-zinc-100 flex flex-col relative overflow-hidden max-w-lg w-full p-5 sm:p-6 ${APP_STYLES.card.base}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* TOP HEADER */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-zinc-800/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border-0">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                  Delete Account & Data
                </h3>
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  3-Step Permanent Wipe Safeguard
                </p>
              </div>
            </div>

            {/* Close button (disabled during deletion execution) */}
            {!isDeleting && progress.step !== 'completed' && (
              <button
                id="close-delete-account-modal-btn"
                onClick={onClose}
                className={APP_STYLES.button.icon}
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* STEP PROGRESS INDICATOR */}
          <div className="pt-3 pb-2 flex items-center justify-between gap-2">
            {[
              { num: 1, label: 'Data Impact' },
              { num: 2, label: 'Acknowledgements' },
              { num: 3, label: 'Permanent Wipe' },
            ].map((s) => {
              const isPassed = currentStep > s.num || progress.step === 'completed';
              const isCurrent = currentStep === s.num && progress.step !== 'completed';
              return (
                <div key={s.num} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-center w-full">
                    <div
                      className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                        isPassed
                          ? 'bg-rose-600 dark:bg-rose-500'
                          : isCurrent
                          ? 'bg-rose-500/60 dark:bg-rose-500/50'
                          : 'bg-slate-200 dark:bg-[#252834]'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isPassed
                          ? 'bg-rose-600 text-white'
                          : isCurrent
                          ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-200 dark:bg-[#252834] text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      {s.num}
                    </span>
                    <span
                      className={`hidden sm:inline ${
                        isCurrent
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : 'text-slate-400 dark:text-zinc-500'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DYNAMIC STEP CONTENT */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* STEP 1: IMPACT OVERVIEW */}
            {currentStep === 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="p-3.5 bg-rose-100/80 dark:bg-rose-950/50 rounded-2xl flex items-start gap-2.5 border-0 shadow-xs">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-950 dark:text-rose-200 leading-relaxed">
                    <strong>Step 1 of 3: Data Impact Review.</strong> You are about to permanently delete your account and all associated cloud and local data for{' '}
                    <span className="font-mono font-bold underline">{currentUser.email || currentUser.uid}</span>.
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">
                    The following items will be wiped forever:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* Item 1: Tests */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#252834] flex items-center gap-3 border-0 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/70 text-[#0084ff] dark:text-blue-300 flex items-center justify-center shrink-0 border-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-zinc-100 truncate">Created Tests</div>
                        <div className="text-[10px] text-slate-600 dark:text-zinc-400">
                          {storageStats.testsCount} authored test papers
                        </div>
                      </div>
                    </div>

                    {/* Item 2: Attempts */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#252834] flex items-center gap-3 border-0 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 border-0">
                        <BarChart2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-zinc-100 truncate">Exam Attempts</div>
                        <div className="text-[10px] text-slate-600 dark:text-zinc-400">
                          {storageStats.attemptsCount} scored submissions
                        </div>
                      </div>
                    </div>

                    {/* Item 3: AI Chat History */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#252834] flex items-center gap-3 border-0 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 border-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-zinc-100 truncate">AI Assistant Chats</div>
                        <div className="text-[10px] text-slate-600 dark:text-zinc-400">
                          All conversations & formulas
                        </div>
                      </div>
                    </div>

                    {/* Item 4: Bookmarks & Profile */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#252834] flex items-center gap-3 border-0 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 border-0">
                        <Bookmark className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-zinc-100 truncate">Notes & Auth Profile</div>
                        <div className="text-[10px] text-slate-600 dark:text-zinc-400">
                          Bookmarks, tricks & credentials
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: ACKNOWLEDGEMENTS & CONFIRMATION TYPING */}
            {currentStep === 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="p-3.5 bg-amber-100/80 dark:bg-amber-950/50 rounded-2xl flex items-start gap-2.5 border-0 shadow-xs">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                    <strong>Step 2 of 3: Safety Acknowledgements.</strong> Please check each safeguard box below to verify your intent.
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 text-xs">
                  <label className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#252834] dark:hover:bg-[#2d3140] border-0 flex items-start gap-3 cursor-pointer transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={ackTests}
                      onChange={(e) => setAckTests(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-rose-600 rounded border-slate-300 focus:outline-none cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-zinc-200 leading-tight">
                      I understand that all my tests, exam attempts, and performance statistics in Google Cloud Firestore will be permanently deleted.
                    </span>
                  </label>

                  <label className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#252834] dark:hover:bg-[#2d3140] border-0 flex items-start gap-3 cursor-pointer transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={ackChats}
                      onChange={(e) => setAckChats(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-rose-600 rounded border-slate-300 focus:outline-none cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-zinc-200 leading-tight">
                      I understand my Gemini AI chats, question bookmarks, revision notes, and device cache cannot be recovered.
                    </span>
                  </label>

                  <label className="p-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#252834] dark:hover:bg-[#2d3140] border-0 flex items-start gap-3 cursor-pointer transition-colors shadow-xs">
                    <input
                      type="checkbox"
                      checked={ackAccount}
                      onChange={(e) => setAckAccount(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-rose-600 rounded border-slate-300 focus:outline-none cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-zinc-200 leading-tight">
                      I understand my Firebase user account will be deleted and I will be signed out immediately.
                    </span>
                  </label>
                </div>

                {/* Type to confirm */}
                <div className="pt-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                    Type <span className="font-mono text-rose-600 dark:text-rose-400 select-all font-bold">{currentUser.email || 'DELETE'}</span> or <span className="font-mono text-rose-600 font-bold">DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={typedConfirmation}
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                    placeholder={`Type ${currentUser.email || 'DELETE'}`}
                    className="w-full px-4 py-2.5 text-xs bg-slate-100 dark:bg-[#252834] border-0 rounded-2xl focus:outline-none text-slate-900 dark:text-zinc-100 font-mono shadow-xs"
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 3: FINAL EXECUTION & LIVE STATUS */}
            {currentStep === 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {progress.step === 'idle' && (
                  <div className="p-4 bg-rose-100/80 dark:bg-rose-950/50 rounded-2xl text-center space-y-2 border-0 shadow-xs">
                    <div className="w-12 h-12 rounded-full bg-rose-200/80 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 mx-auto flex items-center justify-center">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-rose-950 dark:text-rose-100">
                      Ready to Permanently Wipe Data
                    </h4>
                    <p className="text-xs text-rose-900 dark:text-rose-200 max-w-sm mx-auto leading-relaxed">
                      Clicking the button below will immediately execute the deletion process across all Google Cloud Firestore databases, Firebase Authentication, and local device storage.
                    </p>
                  </div>
                )}

                {/* PROGRESS MONITOR */}
                {isDeleting && (
                  <div className="p-4 bg-slate-100 dark:bg-[#252834] rounded-2xl space-y-3 border-0 shadow-xs">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-5 h-5 text-rose-600 animate-spin shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                          Deleting Account & Cloud Data...
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5">
                          {progress.message || 'Processing deletion requests...'}
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        className="bg-rose-600 h-full rounded-full"
                        animate={{
                          width:
                            progress.step === 'deleting_firestore'
                              ? '40%'
                              : progress.step === 'clearing_local'
                              ? '70%'
                              : progress.step === 'deleting_auth'
                              ? '90%'
                              : '100%',
                        }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}

                {/* SUCCESS COMPLETION */}
                {progress.step === 'completed' && (
                  <div className="p-4 bg-emerald-100/80 dark:bg-emerald-950/50 rounded-2xl text-center space-y-2 border-0 shadow-xs">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
                    <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      Account & Data Deleted
                    </h4>
                    <p className="text-xs text-emerald-900 dark:text-emerald-200">
                      {progress.message} You have been switched to Guest Mode.
                    </p>
                  </div>
                )}

                {/* ERROR STATE */}
                {progress.step === 'error' && (
                  <div className="p-3.5 bg-rose-100/80 dark:bg-rose-950/50 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200 border-0 shadow-xs">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-bold">Deletion Error</div>
                      <div>{progress.message}</div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* BOTTOM CONTROLS / STEP NAVIGATION */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between gap-2.5 shrink-0">
            {/* Left back / cancel button */}
            {!isDeleting && progress.step !== 'completed' && (
              <button
                type="button"
                onClick={() => {
                  if (currentStep > 1) {
                    setCurrentStep((prev) => (prev - 1) as StepNumber);
                  } else {
                    onClose();
                  }
                }}
                className="px-4 py-2 rounded-full text-xs font-bold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-[#252834] hover:bg-slate-200 dark:hover:bg-[#282a39] transition-colors flex items-center gap-1.5 cursor-pointer border-0 outline-none shadow-none"
              >
                {currentStep > 1 ? (
                  <>
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </>
                ) : (
                  <span>Cancel</span>
                )}
              </button>
            )}

            {/* Right forward / action button */}
            <div className="ml-auto flex items-center gap-2">
              {currentStep === 1 && (
                <button
                  id="delete-account-step1-continue-btn"
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 border-0 outline-none"
                >
                  <span>Continue to Step 2</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 2 && (
                <button
                  id="delete-account-step2-continue-btn"
                  type="button"
                  disabled={!isStep2Valid}
                  onClick={() => setCurrentStep(3)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 outline-none border-0 ${
                    isStep2Valid
                      ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs active:scale-95'
                      : 'bg-slate-100 dark:bg-[#222634] text-slate-400 dark:text-zinc-600 cursor-not-allowed opacity-60 shadow-none'
                  }`}
                >
                  <span>Proceed to Final Step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {currentStep === 3 && progress.step !== 'completed' && (
                <button
                  id="delete-account-final-confirm-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={handleStartFinalDeletion}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 border-0 outline-none ${
                    isDeleting
                      ? 'bg-rose-400 text-white cursor-wait'
                      : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs active:scale-95'
                  }`}
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting Everything...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Permanently Delete My Account & Wipe Data</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
