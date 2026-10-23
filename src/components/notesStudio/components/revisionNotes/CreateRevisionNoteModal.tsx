import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Pencil,
  Paperclip,
  ImageIcon,
  FileText,
  Tag,
  Check,
} from 'lucide-react';
import type { MathTest } from '../../../../types';
import type { UserNoteItem } from '../../../DriveFileManager';
import {
  studioBackdropVariants,
  studioModalVariants,
  gpuAcceleratedStyle,
} from '../../../../lib/animationConfig';
import { APP_STYLES } from '../../../ui/AppStyles';

interface CreateRevisionNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tests: MathTest[];
  editingNote?: UserNoteItem | null;
  onSave: (noteData: {
    id?: string;
    content: string;
    tag: 'formula' | 'trick' | 'mistake' | 'general' | 'table';
    testId: string;
    attachedFile: {
      url: string;
      name: string;
      type: 'image' | 'pdf' | 'file';
    } | null;
  }) => void;
}

export const CreateRevisionNoteModal: React.FC<CreateRevisionNoteModalProps> = ({
  isOpen,
  onClose,
  tests,
  editingNote,
  onSave,
}) => {
  const [content, setContent] = useState<string>('');
  const [tag, setTag] = useState<'formula' | 'trick' | 'mistake' | 'general' | 'table'>('general');
  const [testId, setTestId] = useState<string>('all');
  const [attachedFile, setAttachedFile] = useState<{
    url: string;
    name: string;
    type: 'image' | 'pdf' | 'file';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNote) {
      setContent(editingNote.content || '');
      setTag(editingNote.tag || 'general');
      setTestId(editingNote.testId || 'all');
      if (editingNote.fileUrl) {
        setAttachedFile({
          url: editingNote.fileUrl,
          name: editingNote.fileName || 'Attachment',
          type: editingNote.fileType || 'file',
        });
      } else {
        setAttachedFile(null);
      }
    } else {
      setContent('');
      setTag('general');
      setTestId('all');
      setAttachedFile(null);
    }
  }, [editingNote, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        url: reader.result as string,
        name: file.name,
        type: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachedFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !attachedFile) return;

    onSave({
      id: editingNote?.id,
      content: content.trim(),
      tag,
      testId,
      attachedFile,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        variants={studioBackdropVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={APP_STYLES.modal.backdrop}
        onClick={onClose}
      >
        <motion.div
          variants={studioModalVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          onClick={(e) => e.stopPropagation()}
          className={`${APP_STYLES.modal.dialog} mx-4 sm:mx-auto max-w-xl`}
        >
          {/* Header */}
          <div className={APP_STYLES.modal.header}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 border-0 shadow-sm">
                {editingNote ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100">
                  {editingNote ? 'Edit Revision Note' : 'Create Revision Note'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Save formulas, tricks, shortcut methods, and attach diagrams
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={APP_STYLES.button.iconSmall}
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
            {/* Tag Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Note Category / Tag:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'formula', label: 'Formula', color: 'indigo' },
                  { id: 'trick', label: 'Trick', color: 'emerald' },
                  { id: 'mistake', label: 'Mistake', color: 'rose' },
                  { id: 'general', label: 'General', color: 'blue' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTag(item.id as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      tag === item.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Test Association */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Associate with Test (Optional):
              </label>
              <select
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                className={APP_STYLES.input.text}
              >
                <option value="all">General (No specific test)</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Content Textarea with Math KaTeX tips */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Note Content (Supports LaTeX Math $...$):
                </label>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                  e.g., $E = mc^2$
                </span>
              </div>
              <textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your revision note, shortcuts, key formulas, or takeaways..."
                className={`${APP_STYLES.input.text} resize-y min-h-[120px] font-sans`}
              />
            </div>

            {/* Attachment preview / upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Attach Image or PDF (Optional):
              </label>

              {attachedFile ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-white/5">
                  <div className="flex items-center gap-2 truncate">
                    {attachedFile.type === 'image' ? (
                      <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs text-slate-700 dark:text-zinc-200 font-medium truncate">
                      {attachedFile.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveAttachment}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-rose-500 transition-colors border-0 bg-transparent cursor-pointer"
                    title="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 bg-slate-50/50 dark:bg-zinc-800/40 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span>Upload Diagram / PDF File</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className={APP_STYLES.button.secondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!content.trim() && !attachedFile}
                className={`${APP_STYLES.button.primary} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {editingNote ? 'Save Changes' : 'Create Note'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
