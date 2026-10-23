import React, { useState } from 'react';
import {
  History,
  X,
  RotateCcw,
  Check,
  Clock,
  FileText,
  Eye,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { type NoteVersion } from '../utils/versionHistory';

interface HtmlNotesVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: NoteVersion[];
  currentCode: string;
  noteTitle: string;
  onRestoreVersion: (version: NoteVersion) => void;
}

export const HtmlNotesVersionModal: React.FC<HtmlNotesVersionModalProps> = ({
  isOpen,
  onClose,
  versions,
  currentCode,
  noteTitle,
  onRestoreVersion
}) => {
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  if (!isOpen) return null;

  const activePreviewVer = versions.find((v) => v.id === previewVersionId) || (versions.length > 0 ? versions[0] : null);

  const handleRestore = (ver: NoteVersion) => {
    onRestoreVersion(ver);
    setRestoredId(ver.id);
    setTimeout(() => {
      setRestoredId(null);
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#0b0c10] rounded-2xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 text-[#1f1f1f] dark:text-[#e3e3e3]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-5 py-4 bg-[#e5e9f0] dark:bg-[#16181d] border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0b57d0]/10 text-[#0b57d0] dark:bg-[#a8c7fa]/20 dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white m-0 flex items-center gap-2">
                <span>Version History</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                  Last 2 Saved
                </span>
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 m-0 truncate max-w-xs sm:max-w-md">
                Note: <span className="font-semibold">{noteTitle || 'Untitled Note'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/60 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 flex items-center justify-center border-0 cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 scrollbar-thin">
          {versions.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 mx-auto flex items-center justify-center text-slate-400">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300 m-0">
                No Previous Versions Saved Yet
              </h4>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 m-0 max-w-sm mx-auto">
                Snapshots are automatically created when you edit and save changes to your document. Your last 2 versions will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* VERSIONS CARDS */}
              {versions.map((ver, idx) => {
                const isRestored = restoredId === ver.id;
                const safeCurrentCode = (currentCode || '').trim();
                const safeVerCode = (ver?.code || '').trim();
                const isCurrentCode = safeCurrentCode.length > 0 && safeCurrentCode === safeVerCode;

                return (
                  <div
                    key={ver.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between transition-all ${
                      activePreviewVer?.id === ver.id
                        ? 'border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 shadow-md'
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121318] hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-blue-500" />
                          <span>Version {ver.versionNumber || versions.length - idx}</span>
                        </span>
                        {isCurrentCode && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            Current Active
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 pt-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{ver.dateTimeStr}</span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Saved {ver.timeAgo}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-zinc-300 pt-1 font-mono bg-slate-100/70 dark:bg-zinc-900 px-2 py-1 rounded-lg">
                          {ver.modificationSummary}
                        </div>
                      </div>

                      {/* CODE SNIPPET PREVIEW BOX */}
                      <div className="mt-2 text-[10px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-slate-200/60 dark:border-zinc-800 max-h-24 overflow-hidden text-ellipsis whitespace-pre-wrap leading-tight">
                        {(ver?.code || '').substring(0, 180)}...
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setPreviewVersionId(ver.id)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-0 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>

                      <button
                        onClick={() => handleRestore(ver)}
                        disabled={isRestored}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border-0 shadow-xs cursor-pointer transition-all active:scale-95 ${
                          isRestored
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#0b57d0] hover:bg-blue-700 text-white dark:bg-[#a8c7fa] dark:text-[#041e49] dark:hover:bg-blue-200'
                        }`}
                      >
                        {isRestored ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Restored!</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore This Version</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FULL INSPECTION PREVIEW IF SELECTED */}
          {activePreviewVer && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Inspecting Content — Version {activePreviewVer.versionNumber} ({activePreviewVer.dateTimeStr})</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activePreviewVer.charCount} chars
                </span>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap leading-snug border border-slate-800 scrollbar-thin">
                {activePreviewVer.code}
              </pre>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-[#121318] border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-zinc-400">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Last 2 versions preserved safely on demand.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold border-0 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
