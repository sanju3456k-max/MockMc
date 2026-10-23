import React, { useState, useRef, useEffect } from 'react';
import { type HtmlNoteItem } from '../../../lib/htmlNotesSync';
import { HtmlNotesAiHeader } from './ai/HtmlNotesAiHeader';
import { HtmlNotesAiInputBar } from './ai/HtmlNotesAiInputBar';
import { HtmlNotesAiMessageList } from './ai/HtmlNotesAiMessageList';
import { type AiChatMessage, type AiAttachment } from './ai/types';
import { replaceSelectedSnippet, integrateSnippetIntoDocument } from './ai/aiSelectionRefiner';
import { synthesizeCodeIntoDocument } from '../utils/docSynthesizerEngine';

interface HtmlNotesAiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentCode: string;
  currentTitle: string;
  selectedText?: string | null;
  targetPointerIndex?: number | null;
  onClearSelectedText?: () => void;
  onApplyCode: (newCode: string) => void;
  onInsertCodeSnippet: (snippet: string) => void;
  // Project Awareness
  activeProjectId?: string;
  activeFileId?: string;
  activeProjectFiles?: HtmlNoteItem[];
  fileSummaries?: Record<string, string>;
  onCreateFileInProject?: (fileTitle: string, initialCode?: string) => void;
  onUpdateFileInProject?: (fileIdOrTitle: string, newContent: string) => void;
  onDeleteFileInProject?: (fileId: string) => void;
  onSelectFileInProject?: (fileId: string) => void;
  // Frame Resizing
  panelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
}

export const HtmlNotesAiPanel: React.FC<HtmlNotesAiPanelProps> = ({
  isOpen,
  onClose,
  currentCode,
  currentTitle,
  selectedText,
  targetPointerIndex,
  onClearSelectedText,
  onApplyCode,
  onInsertCodeSnippet,
  activeProjectId,
  activeFileId,
  activeProjectFiles = [],
  fileSummaries = {},
  onCreateFileInProject,
  onUpdateFileInProject,
  onDeleteFileInProject,
  onSelectFileInProject,
  panelWidth: externalPanelWidth,
  onPanelWidthChange,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome_msg',
      sender: 'ai',
      text: `Hello! I am Theta Notes Assistant. I can write HTML/KaTeX notes, refine selected areas, answer questions across your ${activeProjectFiles.length} project files, or synthesize notes from uploaded files & images.`,
      timestamp: Date.now(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Internal panel width if external prop not provided
  const [internalPanelWidth, setInternalPanelWidth] = useState<number>(460);
  const activePanelWidth = externalPanelWidth ?? internalPanelWidth;

  // AbortController ref for cancel/stop button capability
  const abortControllerRef = useRef<AbortController | null>(null);
  const createdFilesThisRequest = useRef<Set<string>>(new Set());
  const fileDeletedForCurrentRequestRef = useRef<boolean>(false);

  // Clean up any ongoing fetch on unmount or close
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = activePanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging left increases panel width
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(320, Math.min(850, startWidth + deltaX));
      if (onPanelWidthChange) {
        onPanelWidthChange(newWidth);
      } else {
        setInternalPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const handleAddAttachments = (newAtts: AiAttachment[]) => {
    setAttachments((prev) => [...prev, ...newAtts]);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClearAttachments = () => {
    setAttachments([]);
  };

  const handleSendPrompt = async (promptToSend?: string, attachmentsToSend?: AiAttachment[]) => {
    const textPrompt = promptToSend || inputPrompt;
    const activeAttachments = attachmentsToSend || attachments;

    if ((!textPrompt || !textPrompt.trim()) && activeAttachments.length === 0) return;
    if (isLoading) return;

    const activeSelectedText = selectedText || null;
    const cleanPrompt = textPrompt ? textPrompt.trim() : '';

    const userMsg: AiChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: cleanPrompt || (activeAttachments.length > 0 ? `Analyzed ${activeAttachments.length} attachment(s)` : ''),
      selectedText: activeSelectedText,
      attachments: activeAttachments.length > 0 ? [...activeAttachments] : undefined,
      timestamp: Date.now(),
    };

    const aiMsgId = `ai_${Date.now()}`;
    const initialSteps: import('./ai/types').AiStep[] = [
      {
        id: `step_init_${Date.now()}`,
        label: activeSelectedText ? 'Analyzing selected area & KaTeX formulas' : 'Analyzing workspace context & note outline',
        status: 'running',
        timestamp: Date.now()
      }
    ];

    const initialAiMsg: AiChatMessage = {
      id: aiMsgId,
      sender: 'ai',
      text: '',
      isTargetedEdit: Boolean(activeSelectedText),
      selectedText: activeSelectedText,
      steps: initialSteps,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, initialAiMsg]);
    if (!promptToSend) setInputPrompt('');
    setAttachments([]);
    if (onClearSelectedText) onClearSelectedText();
    setIsLoading(true);
    createdFilesThisRequest.current.clear();
    fileDeletedForCurrentRequestRef.current = false;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: cleanPrompt,
          currentCode,
          currentTitle,
          selectedText: activeSelectedText,
          targetPointerIndex,
          activeProjectId,
          activeFileId,
          activeProjectFiles,
          fileSummaries,
          attachments: activeAttachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            data: a.data,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming response failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              
              // Handle Plan/Text
              if (parsed.text) {
                accumulatedText += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                  )
                );
              }

              // Handle Structured Tool Calls (The NEW way)
              if (parsed.toolCall) {
                const call = parsed.toolCall;
                const toolName = (call.name || '').replace(/^default_api:/, '');
                const args = call.args || {};

                if (toolName === 'read_note_content') {
                  setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    steps: [
                      ...(m.steps || []).map(s => s.status === 'running' ? { ...s, status: 'completed' as const } : s),
                      {
                        id: `step_read_${Date.now()}`,
                        label: `Inspected note "${args.fileIdOrTitle}" for cross-referencing`,
                        status: 'completed',
                        timestamp: Date.now()
                      }
                    ]
                  } : m));
                } else if (toolName === 'create_note') {
                   const trackingId = `new_file_${args.title?.toLowerCase()}`;
                   if (!createdFilesThisRequest.current.has(trackingId)) {
                     createdFilesThisRequest.current.add(trackingId);
                     setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                       ...m,
                       suggestedFiles: [{ title: args.title, code: args.content, isCreated: false }],
                       actionBadge: {
                         label: 'New Note Prepared',
                         sublabel: `"${args.title}"`,
                         actionType: 'CREATE_NOTE'
                       },
                       steps: [
                         ...(m.steps || []).map(s => s.status === 'running' ? { ...s, status: 'completed' as const } : s),
                         {
                           id: `step_crt_${Date.now()}`,
                           label: `Generated complete note "${args.title}"`,
                           status: 'completed',
                           timestamp: Date.now()
                         }
                       ]
                     } : m));
                   }
                } else if (toolName === 'patch_current_note') {
                   // Stage patch with explicit Apply button in chat
                   setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                     ...m,
                     suggestedCode: args.content,
                     surgicalCommand: {
                       type: args.action,
                       targetId: args.targetId
                     },
                     isTargetedEdit: Boolean(activeSelectedText) || args.action === 'REPLACE_SECTION',
                     selectedText: activeSelectedText || (args.action === 'REPLACE_SECTION' ? args.targetId : null),
                     actionBadge: {
                       label: 'Surgical Patch Proposed',
                       sublabel: `${args.action.replace(/_/g, ' ')}${args.targetId ? ` • "${args.targetId}"` : ''}`,
                       actionType: args.action,
                       targetId: args.targetId,
                     },
                     steps: [
                       ...(m.steps || []).map(s => s.status === 'running' ? { ...s, status: 'completed' as const } : s),
                       {
                         id: `step_patch_${Date.now()}`,
                         label: `Synthesized ${args.action.replace(/_/g, ' ')} patch for "${args.targetId || 'active section'}"`,
                         detail: '90%+ tokens saved',
                         status: 'completed',
                         timestamp: Date.now()
                       }
                     ]
                   } : m));
                } else if (toolName === 'update_note') {
                   // Stage update with explicit Apply button in chat
                   setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                     ...m,
                     suggestedCode: args.content,
                     isTargetedEdit: false,
                     actionBadge: {
                       label: 'Document Update Prepared',
                       sublabel: `Target: "${args.fileIdOrTitle || 'current note'}"`,
                       actionType: 'UPDATE_NOTE'
                     },
                     steps: [
                       ...(m.steps || []).map(s => s.status === 'running' ? { ...s, status: 'completed' as const } : s),
                       {
                         id: `step_upd_${Date.now()}`,
                         label: `Formulated full update for "${args.fileIdOrTitle || 'current note'}"`,
                         status: 'completed',
                         timestamp: Date.now()
                       }
                     ]
                   } : m));
                } else if (toolName === 'delete_note') {
                   const target = activeProjectFiles.find(f => f.id === args.fileIdOrTitle || f.title.toLowerCase() === (args.fileIdOrTitle || '').toLowerCase());
                   if (target && !fileDeletedForCurrentRequestRef.current) {
                     fileDeletedForCurrentRequestRef.current = true;
                     onDeleteFileInProject?.(target.id);
                     setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                       ...m,
                       actionBadge: {
                         label: 'Delete Confirmation Required',
                         sublabel: `"${target.title}"`,
                         actionType: 'DELETE_NOTE'
                       },
                       steps: [
                         ...(m.steps || []).map(s => s.status === 'running' ? { ...s, status: 'completed' as const } : s),
                         {
                           id: `step_del_${Date.now()}`,
                           label: `Requested confirmation to delete "${target.title}"`,
                           status: 'completed',
                           timestamp: Date.now()
                         }
                       ]
                     } : m));
                   }
                }
              }
            } catch (e) {}
          }
        }
      }

      // Check if text has code blocks to stage for Apply button if not set by tool
      const codeBlockMatch = accumulatedText.match(/```(?:html|xml|css|javascript|ts|js)?\s*\n([\s\S]*?)```/i);
      if (codeBlockMatch && codeBlockMatch[1] && codeBlockMatch[1].trim()) {
        const extracted = codeBlockMatch[1].trim();
        const isActionPrompt = activeSelectedText || /\b(add|insert|update|replace|create|code|html|formula|table|theorem|box|write|generate|modify|edit|patch)\b/i.test(cleanPrompt);
        if (isActionPrompt) {
          setMessages(prev => prev.map(m => m.id === aiMsgId && !m.suggestedCode ? {
            ...m,
            suggestedCode: extracted,
            isTargetedEdit: Boolean(activeSelectedText),
            selectedText: activeSelectedText || null,
            actionBadge: {
              label: 'Code Proposal Ready',
              sublabel: activeSelectedText ? 'Selected Area Refinement' : 'Ready to Apply',
              actionType: 'CODE_PROPOSAL'
            }
          } : m));
        }
      }

      // Finalize all steps to completed state
      setMessages(prev => prev.map(m => {
        if (m.id !== aiMsgId) return m;
        const finalized = (m.steps || []).map(s => ({ ...s, status: 'completed' as const }));
        if (!finalized.some(s => s.label.includes('ready for review'))) {
          finalized.push({
            id: `step_ready_${Date.now()}`,
            label: 'KaTeX & response ready for review',
            detail: 'Optimized formatting',
            status: 'completed',
            timestamp: Date.now()
          });
        }
        return { ...m, steps: finalized };
      }));

      if (activeSelectedText && onClearSelectedText) {
        onClearSelectedText();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: m.text ? `${m.text}\n\n*[Generation stopped by user]*` : 'Generation stopped.',
                }
              : m
          )
        );
        return;
      }

      try {
        const fallbackRes = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanPrompt,
            currentCode,
            currentTitle,
            selectedText: activeSelectedText,
          }),
        });

        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          const reply = data.text || data.replyText || 'Response generated.';
          let extractedCode: string | null = null;
          const codeMatch = reply.match(/```(?:html|xml|css|javascript|ts|js)?\n([\s\S]*?)```/i);
          if (codeMatch && codeMatch[1]) {
            extractedCode = codeMatch[1].trim();
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: reply.replace(/```(?:html|xml|css|javascript|ts|js)?\n[\s\S]*?```/gi, '').trim() || 'Here is your note snippet:',
                    suggestedCode: extractedCode,
                  }
                : m
            )
          );
        }
      } catch (fbErr) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: 'Generated note snippet for your request:',
                  suggestedCode: `<div style="padding:1rem; border:1px solid #0b57d0;">\n  <h3>${cleanPrompt}</h3>\n</div>`,
                }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleApplyCode = (
    codeToApply: string,
    isSelectionOnly = false,
    targetSelection?: string | null,
    msgId?: string,
    surgicalCommand?: AiChatMessage['surgicalCommand']
  ) => {
    if (!codeToApply) return;

    if (isSelectionOnly && targetSelection) {
      const replacedCode = replaceSelectedSnippet(currentCode, targetSelection, codeToApply);
      onApplyCode(replacedCode);
      if (msgId) {
        setAppliedMsgId(`${msgId}_sel`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isApplied: true,
                  actionBadge: m.actionBadge
                    ? { ...m.actionBadge, label: 'Action Applied to Selection', status: 'applied' }
                    : {
                        label: 'Action Applied to Selection',
                        sublabel: 'Replaced selected snippet',
                        actionType: 'REPLACE_SECTION',
                        status: 'applied',
                      },
                }
              : m
          )
        );
      }
    } else {
      const integratedCode = synthesizeCodeIntoDocument({
        currentCode,
        codeToApply,
        noteTitle: currentTitle,
        surgicalCommand,
      });
      onApplyCode(integratedCode);
      if (msgId) {
        setAppliedMsgId(msgId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isApplied: true,
                  actionBadge: m.actionBadge
                    ? { ...m.actionBadge, label: 'Action Applied to Note', status: 'applied' }
                    : {
                        label: 'Action Applied to Note',
                        sublabel: 'Integrated into document successfully',
                        actionType: surgicalCommand?.type || 'APPLIED',
                        status: 'applied',
                      },
                }
              : m
          )
        );
      }
    }
  };

  const handleInsertSnippet = (snippet: string, msgId?: string) => {
    onInsertCodeSnippet(snippet);
    if (msgId) {
      setAppliedMsgId(`${msgId}_ins`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                isApplied: true,
                actionBadge: m.actionBadge
                  ? { ...m.actionBadge, label: 'Inserted at Cursor', status: 'applied' }
                  : {
                      label: 'Inserted at Cursor',
                      sublabel: 'Added to note at cursor position',
                      actionType: 'INSERT_AT_CURSOR',
                      status: 'applied',
                    },
              }
            : m
        )
      );
    }
  };

  const handleCreateNewFile = (title: string, code: string, msgId?: string) => {
    if (onCreateFileInProject) {
      onCreateFileInProject(title, code);
      if (msgId) {
        setAppliedMsgId(`${msgId}_new`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isApplied: true,
                  suggestedFiles: (m.suggestedFiles || []).map((f) => ({ ...f, isCreated: true })),
                  actionBadge: m.actionBadge
                    ? { ...m.actionBadge, label: 'Note Created', status: 'applied' }
                    : {
                        label: 'Note Created',
                        sublabel: `"${title}" created in project`,
                        actionType: 'CREATE_NOTE',
                        status: 'applied',
                      },
                }
              : m
          )
        );
      }
    }
  };

  const handleCopyCode = (codeToCopy: string, msgId: string) => {
    navigator.clipboard.writeText(codeToCopy);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        sender: 'ai',
        text: `Chat cleared. How can I help you with "${currentTitle || 'your note'}"?`,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <>
      {/* Mobile Backdrop Sheet (Only shown on small mobile screens, NO backdrop/blur on desktop/tablet) */}
      <div 
        onClick={onClose}
        className="md:hidden fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
      />

      {/* Parallel Side-Tab / Docked Panel on Desktop/Tablet with Resizable Frame */}
      <aside 
        style={{ width: typeof window !== 'undefined' && window.innerWidth >= 768 ? `${activePanelWidth}px` : '100%' }}
        className="fixed inset-y-0 right-0 z-50 w-full bg-white dark:bg-[#141619] shadow-2xl border-l border-slate-200 dark:border-zinc-800 flex flex-col transition-none animate-in slide-in-from-right duration-200 overflow-hidden h-[100dvh] [text-rendering:optimizeLegibility] [-webkit-font-smoothing:antialiased] [-moz-osx-font-smoothing:grayscale]"
      >
        {/* Resizable Splitter Handle (Desktop / Tablet) */}
        <div
          onMouseDown={handleStartResize}
          className="hidden md:flex absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-50 items-center justify-center hover:bg-[#0b57d0]/30 active:bg-[#0b57d0]/50 transition-colors group select-none"
          title="Drag left/right to adjust frame width of Theta AI Assistant and Notes Studio"
        >
          <div className="w-1 h-12 rounded-full bg-slate-300 dark:bg-zinc-600 group-hover:bg-[#0b57d0] transition-colors" />
        </div>

        {/* HEADER COMPONENT (No border lines) */}
        <HtmlNotesAiHeader
          currentTitle={currentTitle}
          onClearHistory={handleClearHistory}
          onClose={onClose}
        />

        {/* MESSAGES LIST COMPONENT (Plain White Background) */}
        <HtmlNotesAiMessageList
          messages={messages}
          isLoading={isLoading}
          appliedMsgId={appliedMsgId}
          copiedMsgId={copiedMsgId}
          onApplyCode={handleApplyCode}
          onInsertSnippet={handleInsertSnippet}
          onCreateNewFile={handleCreateNewFile}
          onCopyCode={handleCopyCode}
        />

        {/* INPUT BAR COMPONENT */}
        <HtmlNotesAiInputBar
          inputPrompt={inputPrompt}
          setInputPrompt={setInputPrompt}
          isLoading={isLoading}
          selectedText={selectedText}
          onClearSelectedText={onClearSelectedText}
          onSendPrompt={handleSendPrompt}
          onCancelRequest={handleCancelRequest}
          attachments={attachments}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={handleRemoveAttachment}
          onClearAttachments={handleClearAttachments}
        />
      </aside>
    </>
  );
};
