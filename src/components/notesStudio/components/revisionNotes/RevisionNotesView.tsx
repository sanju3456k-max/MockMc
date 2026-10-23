import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  BookOpen,
  Sparkles,
  FileText,
  Tag,
  Check,
  FolderOpen,
  X,
} from 'lucide-react';
import type { MathTest } from '../../../../types';
import type { UserNoteItem } from '../../../DriveFileManager';
import { RevisionNoteCard } from './RevisionNoteCard';
import { APP_STYLES } from '../../../ui/AppStyles';

interface RevisionNotesViewProps {
  notes: UserNoteItem[];
  tests: MathTest[];
  onAddNewNote: () => void;
  onEditNote: (note: UserNoteItem) => void;
  onDeleteNote: (id: string) => void;
  onPreviewAttachment: (note: UserNoteItem) => void;
}

export const RevisionNotesView: React.FC<RevisionNotesViewProps> = ({
  notes,
  tests,
  onAddNewNote,
  onEditNote,
  onDeleteNote,
  onPreviewAttachment,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<
    'all' | 'formula' | 'trick' | 'mistake' | 'general'
  >('all');
  const [selectedTestId, setSelectedTestId] = useState<string>('all');

  // Filter notes based on search, tag, and testId
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Exclude seed or tombstoned notes if any slipped through
      if (n.id?.startsWith('seed_') || n.id?.startsWith('auto_')) return false;

      // Filter by tag
      if (selectedTag !== 'all' && n.tag !== selectedTag) return false;

      // Filter by test
      if (selectedTestId !== 'all') {
        if (n.testId !== selectedTestId) return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const contentMatch = n.content?.toLowerCase().includes(query);
        const fileNameMatch = n.fileName?.toLowerCase().includes(query);
        if (!contentMatch && !fileNameMatch) return false;
      }

      return true;
    });
  }, [notes, selectedTag, selectedTestId, searchQuery]);

  // Build map of test titles for quick lookup
  const testTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    tests.forEach((t) => map.set(t.id, t.title));
    return map;
  }, [tests]);

  return (
    <div className="w-full max-w-[1500px] mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
      {/* Top Filter and Search Bar matching Home Screen Card Style */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-[#1e2024] p-3.5 sm:p-5 rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        {/* Search Input Box */}
        <div className="relative flex-1">
          <div className="h-9.5 sm:h-10 w-full rounded-full bg-[#f0f4f9] dark:bg-[#141619] flex items-center px-3.5 sm:px-4 gap-2.5 border-0 shadow-none transition-all">
            <Search className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 stroke-[2.2]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search revision notes, formulas, or keywords..."
              className="w-full bg-transparent text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#5e5e5e]/70 dark:placeholder-[#9aa0a6]/70 border-0 outline-none focus:ring-0 font-normal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-7 h-7 rounded-full bg-transparent hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center justify-center transition-all cursor-pointer border-0"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls: Tag Chips & Test Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tag Filter Chips */}
          <div className="inline-flex p-1 bg-[#f0f4f9] dark:bg-[#141619] rounded-full border-0">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'formula', label: 'Formulas' },
                { id: 'trick', label: 'Tricks' },
                { id: 'mistake', label: 'Mistakes' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedTag(item.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border-0 ${
                  selectedTag === item.id
                    ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 bg-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Test Selector Dropdown */}
          <select
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
            className="h-9 px-3.5 rounded-full text-xs font-semibold bg-[#f0f4f9] dark:bg-[#282a30] border-0 text-slate-700 dark:text-zinc-300 focus:outline-none cursor-pointer max-w-[200px] truncate"
          >
            <option value="all">All Tests & Topics</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <RevisionNoteCard
              key={note.id}
              note={note}
              associatedTestTitle={testTitleMap.get(note.testId)}
              onEdit={onEditNote}
              onDelete={onDeleteNote}
              onPreviewAttachment={onPreviewAttachment}
            />
          ))}
        </div>
      ) : (
        /* Empty State Bottom Card matching UI Card Style */
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 mb-1">
            {notes.length === 0 ? 'No revision notes yet' : 'No notes match your filters'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md mb-5 leading-relaxed">
            {notes.length === 0
              ? 'Save high-yield formulas, problem shortcuts, mistake reminders, and diagrams for fast revision.'
              : 'Try clearing your search query or switching your tag filters above.'}
          </p>
          <button
            type="button"
            onClick={onAddNewNote}
            className="px-5 py-2.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-[0_2px_6px_rgba(11,87,208,0.25)] flex items-center gap-2 cursor-pointer active:scale-95 transition-all border-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Note</span>
          </button>
        </div>
      )}
    </div>
  );
};
