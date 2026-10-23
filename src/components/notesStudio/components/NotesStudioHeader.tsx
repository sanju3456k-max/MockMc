import React from 'react';
import {
  ArrowLeft,
  FileText,
  FileCode,
  RefreshCw,
  Cloud,
  FolderPlus,
  Download,
  Sun,
  Moon,
  Plus,
} from 'lucide-react';
import type { NotesStudioMode } from '../types';
import { APP_STYLES } from '../../ui/AppStyles';

interface NotesStudioHeaderProps {
  currentMode: NotesStudioMode;
  onModeChange: (mode: NotesStudioMode) => void;
  onBack: () => void;
  onAddNewNote?: () => void;
  onAddFileToProject?: () => void;
  googleToken: string | null;
  isTokenExpired: boolean;
  isConnectingDrive: boolean;
  onConnectDrive: () => void;
  onSignOutDrive: () => void;
  onCreateNewProject?: () => void;
  onImportClick?: () => void;
  isDark?: boolean;
  toggleTheme?: () => void;
}

export const NotesStudioHeader: React.FC<NotesStudioHeaderProps> = ({
  currentMode,
  onModeChange,
  onBack,
  onAddNewNote,
  onAddFileToProject,
  googleToken,
  isTokenExpired,
  isConnectingDrive,
  onConnectDrive,
  onSignOutDrive,
  onCreateNewProject,
  onImportClick,
  isDark,
  toggleTheme,
}) => {
  return (
    <header className={`sticky top-0 z-40 px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] pb-2 flex flex-col gap-2.5 ${APP_STYLES.surface.header} shrink-0 border-0 shadow-none`}>
      {/* Top Row: Back, Title & Google Drive Sync */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex flex-col justify-center">
            <h1 className="text-[17px] font-semibold text-slate-900 dark:text-zinc-100 tracking-tight leading-tight flex items-center gap-1.5 m-0">
              <span>Notes Studio</span>
            </h1>
          </div>
        </div>

        {/* Right Controls: Firebase Cloud */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="flex items-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-xs font-semibold shadow-xs text-blue-700 dark:text-blue-300 whitespace-nowrap">
            <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-[11px] font-bold">Firebase Cloud Storage</span>
          </div>
        </div>
      </div>

      {/* 2. Mode Toggle Row: ONLY Notes and HTML Notes toggle button */}
      <div className="w-full flex justify-center pt-0.5">
        <nav
          aria-label="Notes Studio modes"
          className="inline-flex p-1 bg-white dark:bg-[#1e2024] rounded-[24px] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 w-full max-w-[300px] sm:max-w-[340px] mx-auto items-center"
        >
          {/* 1. Notes (Repository / Study Files) */}
          <button
            type="button"
            onClick={() => onModeChange('repository')}
            className={`flex-1 h-9 px-3 rounded-[20px] text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer border-0 outline-none select-none active:scale-[0.98] ${
              currentMode === 'repository'
                ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 bg-transparent font-medium'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2] shrink-0 ${
              currentMode === 'repository' ? 'text-white' : 'text-slate-500 dark:text-zinc-400'
            }`} />
            <span>Notes</span>
          </button>

          {/* 2. HTML Notes */}
          <button
            type="button"
            onClick={() => onModeChange('html')}
            className={`flex-1 h-9 px-3 rounded-[20px] text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer border-0 outline-none select-none active:scale-[0.98] ${
              currentMode === 'html'
                ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)] font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 bg-transparent font-medium'
            }`}
          >
            <FileCode className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2] shrink-0 ${
              currentMode === 'html' ? 'text-white' : 'text-slate-500 dark:text-zinc-400'
            }`} />
            <span>HTML Notes</span>
          </button>
        </nav>
      </div>

      {/* 3. Bottom Row under the toggle button: Actions shifted rightwards (Shown in HTML Notes mode, hidden in Notes mode) */}
      {currentMode === 'html' && (
        <div className="w-full flex items-center justify-end gap-1.5 sm:gap-2 pt-0.5 pb-0.5">
          {onCreateNewProject && (
            <button
              type="button"
              onClick={onCreateNewProject}
              className="h-8.5 px-3.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap"
              title="Create a new Project Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New project</span>
            </button>
          )}
          {onAddFileToProject && (
            <button
              type="button"
              onClick={onAddFileToProject}
              className="h-8.5 px-3.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#1e2024] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap"
              title="Add a new note to current project"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New note</span>
            </button>
          )}
          {onImportClick && (
            <button
              type="button"
              onClick={onImportClick}
              className="h-8.5 px-3.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-xs flex items-center gap-1.5 border-0 cursor-pointer active:scale-95 transition-all outline-none shadow-xs whitespace-nowrap"
              title="Import .html file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
          )}
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8.5 h-8.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-xs border-0 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all outline-none"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </header>
  );
};
