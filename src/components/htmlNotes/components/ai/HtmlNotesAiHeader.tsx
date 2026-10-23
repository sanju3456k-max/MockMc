import React from 'react';
import { X, Trash2 } from 'lucide-react';

interface HtmlNotesAiHeaderProps {
  currentTitle: string;
  onClearHistory: () => void;
  onClose: () => void;
}

export const HtmlNotesAiHeader: React.FC<HtmlNotesAiHeaderProps> = ({
  currentTitle,
  onClearHistory,
  onClose,
}) => {
  return (
    <header className="px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-3 bg-white dark:bg-[#141619] flex items-center justify-between shrink-0 z-10 select-none border-0 shadow-none">
      {/* Brand & Assistant Identity: Exactly Matching the Requested Style */}
      <div className="flex flex-col justify-center min-w-0 leading-tight">
        <span className="font-bold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent leading-none">
          Theta
        </span>
        <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400 mt-1 leading-none whitespace-nowrap">
          powered by <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent font-semibold">Gemini</span>
        </span>
      </div>

      {/* Header Actions: Clean Gray Circular Buttons Without Border */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onClearHistory}
          className="w-8 h-8 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] hover:bg-[#e2e7ef] dark:hover:bg-[#34373f] text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#a8a8a8] dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors border-0 outline-none select-none"
          title="Clear Conversation History"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] hover:bg-[#e2e7ef] dark:hover:bg-[#34373f] text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#a8a8a8] dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors border-0 outline-none select-none"
          title="Close Assistant (Esc)"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>
    </header>
  );
};
