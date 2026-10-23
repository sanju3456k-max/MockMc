import React from 'react';
import {
  X,
  FileCode,
  Download,
  Printer,
  RefreshCw,
  Trash2,
  Sun,
  Moon,
  AlertTriangle,
  Check,
  Cloud,
  CloudUpload,
  ExternalLink,
  History,
  Sparkles,
  FolderArchive,
  ImagePlus
} from 'lucide-react';
import { type DriveSyncStatus } from '../../../lib/htmlNotesDriveSync';

interface HtmlNotesModalsProps {
  isMobileMoreOpen: boolean;
  setIsMobileMoreOpen: (open: boolean) => void;
  onImportClick: () => void;
  onTriggerInsertImage?: () => void;
  onExportHtml: () => void;
  onExportFullProject?: () => void;
  activeProjectName?: string;
  projectFilesCount?: number;
  onPrintDocument: () => void;
  isPrinting: boolean;
  onOpenDeleteModal: () => void;
  toggleTheme: () => void;
  isDark: boolean;
  // Google Drive
  isDriveConnected: boolean;
  driveSyncStatus: DriveSyncStatus;
  onConnectDrive: () => void;
  onTriggerDriveSync: () => void;
  onExportNoteToDrive: () => void;
  onDeduplicateDrive?: () => void;
  driveToastMessage?: string | null;
  // Version History
  onOpenVersionHistory?: () => void;
  // Delete confirm modal
  showDeleteConfirmModal: boolean;
  setShowDeleteConfirmModal: (open: boolean) => void;
  onConfirmDelete: () => void;
  noteTitle: string;
  deleteTargetType?: 'file' | 'project';
  // Saved toast feedback
  savedSuccess: boolean;
  // Print modal url
  printModalUrl: string | null;
  setPrintModalUrl: (url: string | null) => void;
  // Hidden inputs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imageUploadRef: React.RefObject<HTMLInputElement | null>;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const HtmlNotesModals: React.FC<HtmlNotesModalsProps> = ({
  isMobileMoreOpen,
  setIsMobileMoreOpen,
  onImportClick,
  onTriggerInsertImage,
  onExportHtml,
  onExportFullProject,
  activeProjectName,
  projectFilesCount,
  onPrintDocument,
  isPrinting,
  onOpenDeleteModal,
  toggleTheme,
  isDark,
  isDriveConnected,
  driveSyncStatus,
  onConnectDrive,
  onTriggerDriveSync,
  onExportNoteToDrive,
  onDeduplicateDrive,
  driveToastMessage,
  onOpenVersionHistory,
  showDeleteConfirmModal,
  setShowDeleteConfirmModal,
  onConfirmDelete,
  noteTitle,
  deleteTargetType = 'file',
  savedSuccess,
  printModalUrl,
  setPrintModalUrl,
  fileInputRef,
  imageUploadRef,
  onImportFile,
  onImageUpload
}) => {
  return (
    <>
      {/* SAVED TOAST FEEDBACK */}
      {savedSuccess && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-1.5 rounded-full bg-slate-900/90 dark:bg-zinc-800/95 text-white backdrop-blur-md border border-slate-700/60 dark:border-zinc-700/60 text-xs font-semibold shadow-xl flex items-center gap-1.5 pointer-events-none transition-all duration-200">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Saved</span>
        </div>
      )}

      {/* DRIVE TOAST FEEDBACK */}
      {driveToastMessage && (
        <div className="fixed bottom-14 right-4 z-50 px-3.5 py-2 rounded-xl bg-blue-900/95 dark:bg-blue-950/95 text-white backdrop-blur-md border border-blue-500/50 text-xs font-medium shadow-2xl flex items-center gap-2 max-w-sm pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
          <Cloud className="w-4 h-4 text-blue-300 shrink-0" />
          <span>{driveToastMessage}</span>
        </div>
      )}

      {/* STUDIO OPTIONS MODAL POPOVER */}
      {isMobileMoreOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-end p-3 sm:p-4 cursor-default animate-in fade-in duration-150"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setIsMobileMoreOpen(false)}
        >
          <div 
            className="mt-12 mr-1 w-76 max-w-[calc(100vw-32px)] bg-white dark:bg-[#1e2024] rounded-2xl p-3.5 shadow-2xl border border-slate-200/80 dark:border-zinc-800 space-y-2 animate-in fade-in zoom-in-95 duration-150 text-[#1f1f1f] dark:text-[#e3e3e3]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Studio Options
              </span>
              <button
                onClick={() => setIsMobileMoreOpen(false)}
                className="w-6 h-6 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 flex items-center justify-center border-0 outline-none cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 text-xs font-medium pt-1">
              {/* Firebase Cloud Storage Section */}
              <div className="px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 space-y-1 mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Firebase Storage
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    Realtime Sync
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 m-0 leading-tight">
                  All projects & notes synced directly via Firebase.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onImportClick();
                  setIsMobileMoreOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
              >
                <FileCode className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Import .html File</span>
              </button>

              {onTriggerInsertImage && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMoreOpen(false);
                    onTriggerInsertImage();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span>Insert Image</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">Upload, Web URL, or Stock Photos</span>
                  </div>
                </button>
              )}

              {/* Download Full Project (All files in active project bundled into .zip) */}
              {onExportFullProject && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMoreOpen(false);
                    onExportFullProject();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-blue-50/90 hover:bg-blue-100/90 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border border-blue-200/80 dark:border-blue-900/60 outline-none transition-all cursor-pointer group active:scale-[0.98]"
                  title="Download all files in this project as a ZIP archive"
                >
                  <FolderArchive className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-between gap-1">
                      <span>Download Full Project</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-[#0b57d0] text-white rounded font-mono font-bold shrink-0">ZIP</span>
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal truncate">
                      {projectFilesCount ? `${projectFilesCount} files included (${activeProjectName || 'Project'})` : 'All project files with README (.zip)'}
                    </span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onExportHtml();
                  setIsMobileMoreOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span>Download .html File</span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">Current active note</span>
                </div>
              </button>

              {onOpenVersionHistory && (
                <button
                  onClick={() => {
                    setIsMobileMoreOpen(false);
                    onOpenVersionHistory();
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
                >
                  <History className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Version History</span>
                </button>
              )}

              <button
                onClick={() => {
                  onPrintDocument();
                  setIsMobileMoreOpen(false);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
              >
                {isPrinting ? (
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                ) : (
                  <Printer className="w-4 h-4 text-blue-500 shrink-0" />
                )}
                <span>Print Document</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  onOpenDeleteModal();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2.5 text-left font-semibold border-0 outline-none transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Delete Note</span>
              </button>

            </div>
          </div>
        </div>
      )}

      {/* DIRECT PRINT POPUP BANNER */}
      {printModalUrl && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-500 shadow-2xl flex flex-col gap-2 max-w-sm">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-xs flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <Printer className="w-4 h-4" />
              <span>Print Ready</span>
            </div>
            <button
              onClick={() => setPrintModalUrl(null)}
              className="round-icon"
              style={{ width: '20px', height: '20px', border: 0 }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-zinc-300 m-0">
            If your browser popup blocker paused the print dialog, click below:
          </p>
          <div className="flex items-center gap-2 mt-1">
            <a
              href={printModalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setPrintModalUrl(null)}
              className="flex-1 py-1.5 px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Open & Print</span>
            </a>
            <button
              onClick={() => {
                onExportHtml();
                setPrintModalUrl(null);
              }}
              style={{ padding: '6px 10px', fontSize: '11px' }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save File</span>
            </button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION POPUP MODAL */}
      {showDeleteConfirmModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowDeleteConfirmModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#0b0c10] rounded-2xl p-5 shadow-2xl border border-slate-200/80 dark:border-zinc-800 space-y-4 animate-in zoom-in-95 duration-150 text-[#1f1f1f] dark:text-[#e3e3e3]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                  {deleteTargetType === 'project' ? 'Delete Project' : 'Delete / Close Tab'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 m-0">Confirmation required</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed m-0">
              Are you sure you want to {deleteTargetType === 'project' ? 'delete' : 'close and delete tab'} <span className="font-bold text-slate-900 dark:text-white">"{noteTitle || 'Untitled Note'}"</span>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#282a30] dark:hover:bg-[#32353c] text-slate-700 dark:text-zinc-300 font-semibold text-xs border-0 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  onConfirmDelete();
                }}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs border-0 shadow-xs cursor-pointer transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Import & Image Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        style={{
          position: 'fixed',
          top: '-10000px',
          left: '-10000px',
          opacity: 0,
          width: '1px',
          height: '1px',
          pointerEvents: 'none'
        }}
        accept=".html,.htm,.txt"
        onChange={onImportFile}
      />
      <input
        ref={imageUploadRef}
        type="file"
        style={{
          position: 'fixed',
          top: '-10000px',
          left: '-10000px',
          opacity: 0,
          width: '1px',
          height: '1px',
          pointerEvents: 'none'
        }}
        accept="image/*"
        onChange={onImageUpload}
      />
    </>
  );
};
