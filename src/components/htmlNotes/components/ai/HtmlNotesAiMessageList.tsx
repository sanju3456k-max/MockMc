import React, { useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Check, 
  Copy, 
  Code, 
  Loader2, 
  Target, 
  Wand2, 
  FileCode,
  FileText,
  Plus,
  Image as ImageIcon
} from 'lucide-react';
import { MathRenderer } from '../../../MathRenderer';
import { type AiChatMessage } from './types';

export { type AiChatMessage };

interface HtmlNotesAiMessageListProps {
  messages: AiChatMessage[];
  isLoading: boolean;
  appliedMsgId: string | null;
  copiedMsgId: string | null;
  onApplyCode: (newCode: string, isSelectionOnly?: boolean, selectedText?: string | null, msgId?: string, surgicalCommand?: AiChatMessage['surgicalCommand']) => void;
  onInsertSnippet: (snippet: string, msgId?: string) => void;
  onCreateNewFile: (title: string, code: string, msgId?: string) => void;
  onCopyCode: (codeToCopy: string, msgId: string) => void;
}

export const HtmlNotesAiMessageList: React.FC<HtmlNotesAiMessageListProps> = ({
  messages,
  isLoading,
  appliedMsgId,
  copiedMsgId,
  onApplyCode,
  onInsertSnippet,
  onCreateNewFile,
  onCopyCode,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-6 bg-white dark:bg-[#141619] scrollbar-thin [text-rendering:optimizeLegibility] [-webkit-font-smoothing:antialiased] [-moz-osx-font-smoothing:grayscale]">
      {messages.map((msg) => {
        const isUser = msg.sender === 'user';

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
          >
            {/* Sender Label (Only shown for User prompts, not above AI responses) */}
            {isUser && (
              <div className="flex items-center gap-1.5 mb-1.5 px-1 text-xs font-medium text-[#5e5e5e] dark:text-[#a8a8a8]">
                <span>You</span>
              </div>
            )}

            {/* Attached user files (if any) */}
            {isUser && msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5 justify-end max-w-[90%]">
                {msg.attachments.map((att) => {
                  const isImg = att.mimeType.startsWith('image/');
                  const isPdf = att.mimeType === 'application/pdf';

                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 p-2 pr-3 bg-[#f0f4f9] dark:bg-[#282a30] rounded-2xl text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] font-medium"
                    >
                      {isImg ? (
                        <ImageIcon className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      ) : isPdf ? (
                        <FileText className="w-4 h-4 text-[#ba1a1a] dark:text-[#ffb4ab] shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-[#1b6d3b] dark:text-[#a6f0b9] shrink-0" />
                      )}
                      <span className="max-w-[150px] truncate">{att.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Targeted Selection Pill Indicator on User Messages */}
            {isUser && msg.selectedText && (
              <div className="mb-2 max-w-[85%] px-3.5 py-1.5 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-medium flex items-center gap-2 truncate">
                <Target className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium shrink-0">Selected Area:</span>
                <span className="truncate italic opacity-90">"{msg.selectedText}"</span>
              </div>
            )}

            {/* 
              Message Presentation:
              - User Prompt: Soft gray rounded bubble
              - Theta AI Response: Rendered with MathRenderer for clean headings, bullet points, and KaTeX math (no raw markdown hashes)
            */}
            {isUser ? (
              <div className="bg-[#f0f4f9] dark:bg-[#282a2d] text-slate-900 dark:text-zinc-100 rounded-[22px] px-4.5 py-3 text-[17px] leading-relaxed max-w-[90%] sm:max-w-[85%] break-words font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
              </div>
            ) : (
              <div className="w-full text-[17px] leading-[1.75] text-slate-900 dark:text-zinc-100 font-medium space-y-3.5">
                {/* 1. Dynamic Live Progress & Optimization Stepper (Audio 1) */}
                {msg.steps && msg.steps.length > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/70 dark:bg-[#181a20]/70 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />
                        <span>Execution & Optimization Progress</span>
                      </div>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                        {msg.steps.filter(s => s.status === 'completed').length} / {msg.steps.length} done
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      {msg.steps.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 text-[12px]">
                          {st.status === 'running' ? (
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                          <span className={`font-medium ${st.status === 'running' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-zinc-300'}`}>
                            {st.label}
                          </span>
                          {st.detail && (
                            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 truncate max-w-[160px]">
                              ({st.detail})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Enhanced Action Applied / Action Proposed Badge */}
                {(msg.actionBadge || msg.surgicalCommand) && (() => {
                  const isBadgeApplied = Boolean(msg.isApplied || msg.actionBadge?.status === 'applied' || appliedMsgId === msg.id || appliedMsgId === `${msg.id}_sel`);

                  return (
                    <div className="flex flex-wrap items-center gap-2 p-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:from-blue-500/15 dark:via-indigo-500/15 dark:to-purple-500/15 border border-blue-200/80 dark:border-blue-900/60 text-xs shadow-xs">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                        isBadgeApplied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 dark:bg-blue-500 text-white'
                      }`}>
                        {isBadgeApplied ? (
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-zinc-100 text-[12.5px]">
                          <span>
                            {isBadgeApplied
                              ? 'Action Applied to Note'
                              : (msg.actionBadge?.label || 'Surgical Patch Proposed')}
                          </span>
                          {(msg.surgicalCommand?.type || msg.actionBadge?.actionType) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300">
                              {(msg.surgicalCommand?.type || msg.actionBadge?.actionType || '').replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                          {isBadgeApplied
                            ? 'Changes are live in editor and preview. Use Undo (Ctrl+Z) to revert anytime.'
                            : (msg.actionBadge?.sublabel || (msg.surgicalCommand?.targetId ? `Target: "${msg.surgicalCommand.targetId}"` : 'Ready to apply to document'))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Clean Formatted Markdown with MathRenderer */}
                <div className="math-markdown-content font-sans px-0.5 tracking-[-0.01em]">
                  <MathRenderer content={msg.text} />
                </div>

                {/* AI Suggested Code / HTML / KaTeX Snippet in Clean Elevated Card */}
                {msg.suggestedCode && !msg.suggestedFiles && (
                  <div className="mt-3.5 rounded-[24px] overflow-hidden bg-[#f0f4f9] dark:bg-[#1e2024] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all">
                    {/* Code Header Bar */}
                    <div className="px-4.5 py-3 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between text-xs text-[#5e5e5e] dark:text-[#a8a8a8]">
                      <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-zinc-100">
                        <Code className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                        <span>{msg.isTargetedEdit ? 'Refined Selection Snippet' : 'Generated Note HTML'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopyCode(msg.suggestedCode!, msg.id)}
                        className="flex items-center gap-1.5 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors cursor-pointer border-0 bg-transparent font-medium"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Code Preview Box */}
                    <pre className="p-4.5 overflow-x-auto max-h-64 text-xs sm:text-[13px] leading-relaxed text-slate-900 dark:text-zinc-100 font-mono font-normal scrollbar-thin m-0">
                      <code>{msg.suggestedCode}</code>
                    </pre>

                    {/* Actions Panel - Single unified Apply button */}
                    <div className="p-3.5 bg-black/[0.03] dark:bg-white/[0.04] flex flex-wrap items-center gap-2.5">
                      {(() => {
                        const isApplied = Boolean(msg.isApplied || appliedMsgId === msg.id || appliedMsgId === `${msg.id}_sel` || appliedMsgId === `${msg.id}_ins`);

                        return (
                          <>
                            {/* Targeted Selection Replacement Mode */}
                            {msg.selectedText ? (
                              isApplied ? (
                                <div className="h-9 px-4.5 rounded-full text-xs sm:text-sm font-bold bg-[#1b6d3b] text-white flex items-center justify-center gap-2 select-none shadow-xs">
                                  <Check className="w-4 h-4 stroke-[2.5]" />
                                  <span>Selection Replaced ✓</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onApplyCode(msg.suggestedCode!, true, msg.selectedText, msg.id, msg.surgicalCommand)}
                                  className="h-9 px-4.5 rounded-full text-xs sm:text-sm font-bold border-0 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all outline-none select-none bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]"
                                  title="Replaces ONLY the selected portion of your note"
                                >
                                  <Wand2 className="w-4 h-4" />
                                  <span>Apply to Selected Area ✨</span>
                                </button>
                              )
                            ) : (
                              /* Default Action: Single Apply to Note button - AI synthesizer automatically finds placement */
                              isApplied ? (
                                <div className="h-9 px-4.5 rounded-full text-xs sm:text-sm font-bold bg-[#1b6d3b] text-white flex items-center justify-center gap-2 select-none shadow-xs">
                                  <Check className="w-4 h-4 stroke-[2.5]" />
                                  <span>Applied to Note ✓</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onApplyCode(msg.suggestedCode!, false, undefined, msg.id, msg.surgicalCommand)}
                                  className="h-9 px-5 rounded-full text-xs sm:text-sm font-bold border-0 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all outline-none select-none bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]"
                                  title="Applies the AI additions/modifications directly into your note at the optimal location"
                                >
                                  <Sparkles className="w-4 h-4" />
                                  <span>Apply to Note ✨</span>
                                </button>
                              )
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Multiple Suggested Files */}
                {msg.suggestedFiles && msg.suggestedFiles.length > 0 && (
                  <div className="space-y-4 w-full mt-2">
                    {msg.suggestedFiles.map((file, fIdx) => (
                      <div key={fIdx} className="rounded-[24px] overflow-hidden bg-[#f0f4f9] dark:bg-[#1e2024] shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-slate-200 dark:border-zinc-800">
                        <div className="px-4.5 py-3 bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-zinc-100">
                            <FileCode className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                            <span className="font-bold">File: {file.title}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onCopyCode(file.code, `${msg.id}_f${fIdx}`)}
                            className="flex items-center gap-1.5 hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors border-0 bg-transparent text-[#5e5e5e] dark:text-[#a8a8a8]"
                          >
                            {copiedMsgId === `${msg.id}_f${fIdx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Copy</span>
                          </button>
                        </div>
                        <pre className="p-4 max-h-48 overflow-auto text-xs font-mono m-0 bg-white/50 dark:bg-black/20">
                          <code>{file.code}</code>
                        </pre>
                        <div className="p-3 bg-black/[0.02] flex items-center gap-2">
                          <button
                            onClick={() => onCreateNewFile(file.title, file.code, `${msg.id}_f${fIdx}`)}
                            disabled={file.isCreated}
                            className={`h-8 px-4 rounded-full text-xs font-medium border-0 flex items-center gap-2 cursor-pointer transition-all ${
                              (appliedMsgId === `${msg.id}_f${fIdx}` || file.isCreated)
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                            }`}
                          >
                            {(appliedMsgId === `${msg.id}_f${fIdx}` || file.isCreated) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>{(appliedMsgId === `${msg.id}_f${fIdx}` || file.isCreated) ? 'Created' : 'Create File'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Loading State matching Plain Surface UI */}
      {isLoading && (
        <div className="flex flex-col items-start max-w-full space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 px-1 text-xs sm:text-sm font-medium text-[#0b57d0] dark:text-[#a8c7fa]">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>Theta is thinking...</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#f0f4f9] dark:bg-[#282a30] text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Formulating response, equations &amp; HTML note structures...</span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};
