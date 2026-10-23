import React, { useState } from 'react';
import {
  Tag,
  Calendar,
  Trash2,
  Pencil,
  Copy,
  Check,
  Paperclip,
  ImageIcon,
  FileText,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import type { UserNoteItem } from '../../../DriveFileManager';
import { MathRenderer } from '../../../MathRenderer';
import { APP_STYLES } from '../../../ui/AppStyles';

interface RevisionNoteCardProps {
  note: UserNoteItem;
  associatedTestTitle?: string;
  onEdit: (note: UserNoteItem) => void;
  onDelete: (id: string) => void;
  onPreviewAttachment?: (note: UserNoteItem) => void;
}

const TAG_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  formula: {
    label: 'Formula',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200/60 dark:border-indigo-800/40',
  },
  trick: {
    label: 'Trick / Shortcut',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200/60 dark:border-emerald-800/40',
  },
  mistake: {
    label: 'Mistake Diary',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200/60 dark:border-rose-800/40',
  },
  table: {
    label: 'Data Table',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200/60 dark:border-purple-800/40',
  },
  general: {
    label: 'Revision Note',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
  },
};

export const RevisionNoteCard: React.FC<RevisionNoteCardProps> = ({
  note,
  associatedTestTitle,
  onEdit,
  onDelete,
  onPreviewAttachment,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const tagCfg = TAG_CONFIG[note.tag] || TAG_CONFIG.general;

  const handleCopy = () => {
    navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <article
      className="group relative flex flex-col justify-between rounded-2xl bg-white dark:bg-[#1a1c22] p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] border border-slate-100 dark:border-white/5 transition-all duration-200"
    >
      <div>
        {/* Top Badges & Meta */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tagCfg.bg} ${tagCfg.text} ${tagCfg.border}`}
            >
              <Tag className="w-3 h-3 stroke-[2.2]" />
              <span>{tagCfg.label}</span>
            </span>

            {associatedTestTitle && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 truncate max-w-[180px]">
                <BookOpen className="w-3 h-3 text-slate-400" />
                <span className="truncate">{associatedTestTitle}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500">
            <Calendar className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Note Body (with KaTeX Math rendering) */}
        <div className="text-sm text-slate-800 dark:text-zinc-200 font-normal leading-relaxed whitespace-pre-wrap break-words overflow-hidden max-h-60 overflow-y-auto pr-1">
          <MathRenderer content={note.content} />
        </div>

        {/* Attachment Pill (if any) */}
        {note.fileUrl && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => onPreviewAttachment?.(note)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-white/5 cursor-pointer transition-colors max-w-full truncate"
            >
              {note.fileType === 'image' ? (
                <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              ) : note.fileType === 'pdf' ? (
                <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
              ) : (
                <Paperclip className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <span className="truncate">{note.fileName || 'View Attachment'}</span>
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 ml-auto" />
            </button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-4 pt-3 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer transition-colors border-0 bg-transparent"
          title="Copy note content"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(note)}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border-0 bg-transparent"
            title="Edit note"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer border-0 bg-transparent"
            title="Delete note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};
