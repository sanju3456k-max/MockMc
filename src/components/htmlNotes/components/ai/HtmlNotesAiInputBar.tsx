import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Target, 
  X, 
  Send, 
  Square, 
  Paperclip, 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  Mic, 
  MicOff 
} from 'lucide-react';
import { type AiAttachment } from './types';
import { 
  getSpeechRecognition, 
  extractCleanSpeechFromEvent, 
  mergeSpeechChunks, 
  cleanSpeechTranscript,
  ensureMicrophonePermission 
} from '../../../../lib/geminiSpeechEngine';

interface HtmlNotesAiInputBarProps {
  inputPrompt: string;
  setInputPrompt: (val: string | ((prev: string) => string)) => void;
  isLoading: boolean;
  selectedText?: string | null;
  onClearSelectedText?: () => void;
  onSendPrompt: (promptText?: string, attachmentsToSend?: AiAttachment[]) => void;
  onCancelRequest?: () => void;
  attachments?: AiAttachment[];
  onAddAttachments?: (newAttachments: AiAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments?: () => void;
}

const PRESET_QUICK_CHIPS = [
  { label: 'Refine & Polish', prompt: 'Refine and improve the clarity, formatting, and mathematical precision of this note.' },
  { label: 'Simplify Text', prompt: 'Simplify the explanation to make it intuitive and easier to understand for students.' },
  { label: 'Add KaTeX Math', prompt: 'Add KaTeX math equations (using $...$ for inline and $$...$$ for block display) to clarify formulas.' },
  { label: 'Fix HTML Syntax', prompt: 'Check and fix any HTML tag, styling, or structural errors in this note.' },
  { label: 'Summary Table', prompt: 'Create a clean responsive HTML summary table highlighting key formulas and rules.' },
  { label: 'Format Cards', prompt: 'Restructure key key points into modern responsive card blocks with clean borders.' },
];

export const HtmlNotesAiInputBar: React.FC<HtmlNotesAiInputBarProps> = ({
  inputPrompt,
  setInputPrompt,
  isLoading,
  selectedText,
  onClearSelectedText,
  onSendPrompt,
  onCancelRequest,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  onClearAttachments,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Speech Recognition (Microphone Voice Typing) state & instance
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const basePromptBeforeSpeechRef = useRef<string>('');

  // Stop microphone and cancel speech recognition
  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        const rec = recognitionRef.current;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Close attach popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAttachMenu]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeechRecognition();
    };
  }, [stopSpeechRecognition]);

  // Toggle Voice Dictation via Web Speech API with real-time live word transcription
  const toggleSpeechRecognition = async () => {
    if (isListening) {
      stopSpeechRecognition();
      return;
    }

    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const permitted = await ensureMicrophonePermission();
    if (!permitted) {
      alert('Microphone permission was denied. Please allow microphone access in your browser settings.');
      return;
    }

    try {
      stopSpeechRecognition();

      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true; // Displays words as user is speaking
      rec.lang = 'en-US';

      // Capture whatever text was in the box before speaking
      basePromptBeforeSpeechRef.current = inputPrompt.trim();

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        // Real-time incremental speech transcription parsing
        const sessionSpeech = extractCleanSpeechFromEvent(event);
        if (!sessionSpeech) return;

        const base = basePromptBeforeSpeechRef.current;
        const total = base ? mergeSpeechChunks([base, sessionSpeech]) : sessionSpeech;
        const cleaned = cleanSpeechTranscript(total);

        if (cleaned) {
          setInputPrompt(cleaned);
        }
      };

      rec.onerror = (event: any) => {
        const err = event?.error;
        if (err === 'no-speech' || err === 'aborted') return;
        console.warn('Speech recognition error:', err);
        stopSpeechRecognition();
      };

      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      stopSpeechRecognition();
    }
  };

  // Wrapper for sending prompt: guarantees microphone is immediately turned off
  const handleTriggerSend = (promptToSend?: string) => {
    // 1. Instantly turn off the microphone when sending message
    if (isListening || recognitionRef.current) {
      stopSpeechRecognition();
    }

    // 2. Dispatch prompt sending
    onSendPrompt(promptToSend);
  };

  // Auto-focus input bar only once when input bar mounts
  useEffect(() => {
    // Avoid stealing focus when selectedText changes in preview/editor as focus shift collapses DOM selection
    const timer = setTimeout(() => {
      if (!textareaRef.current) return;
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body) {
        textareaRef.current.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        handleTriggerSend();
      }
    }
  };

  // Convert files into Base64 AiAttachment items
  const processFiles = (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (!fileList.length) return;

    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        if (dataUrl) {
          const newAtt: AiAttachment = {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            data: dataUrl,
          };
          onAddAttachments?.([newAtt]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
    setShowAttachMenu(false);
  };

  const handleDocInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
    setShowAttachMenu(false);
  };

  // Drag-and-drop handling for files, images, and text
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
      return;
    }

    const droppedText = e.dataTransfer.getData('text/plain');
    if (droppedText) {
      setInputPrompt((prev) => (prev ? `${prev}\n${droppedText}` : droppedText));
    }
  };

  // Clipboard paste support for images or files
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-3.5 sm:p-4 bg-white dark:bg-[#141619] shrink-0 z-10 transition-colors ${
        isDragOver ? 'bg-[#f0f4f9] dark:bg-[#1f2128]' : ''
      }`}
    >
      {/* Hidden File Inputs for Image vs Document Selection */}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleImageInputChange}
        className="hidden"
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept="application/pdf,.txt,.md,.html,.csv,.json,.doc,.docx"
        onChange={handleDocInputChange}
        className="hidden"
      />

      {/* Drag Over Active Notification Banner */}
      {isDragOver && (
        <div className="mb-2 p-2 rounded-xl bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold flex items-center justify-center gap-2 animate-pulse">
          <Paperclip className="w-3.5 h-3.5" />
          <span>Drop images, PDFs, or text here to attach</span>
        </div>
      )}

      {/* Targeted Selection Badge */}
      {selectedText && (
        <div className="mb-2 px-3 py-1.5 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Target className="w-3.5 h-3.5 shrink-0" />
            <span className="font-bold shrink-0">Selected Area:</span>
            <span className="truncate italic font-mono text-[11px] opacity-90">
              "{selectedText}"
            </span>
          </div>
          <button
            type="button"
            onClick={onClearSelectedText}
            className="w-5 h-5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-current flex items-center justify-center shrink-0 cursor-pointer border-0 transition-colors"
            title="Clear targeted selection filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Attached Files Chips Bar */}
      {attachments.length > 0 && (
        <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {attachments.map((att) => {
            const isImg = att.mimeType.startsWith('image/');
            const isPdf = att.mimeType === 'application/pdf';

            return (
              <div
                key={att.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 text-[11px] font-medium shrink-0"
              >
                {isImg ? (
                  <ImageIcon className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                ) : isPdf ? (
                  <FileText className="w-3.5 h-3.5 text-[#ba1a1a] dark:text-[#ffb4ab] shrink-0" />
                ) : (
                  <FileCode className="w-3.5 h-3.5 text-[#1b6d3b] dark:text-[#a6f0b9] shrink-0" />
                )}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(att.id)}
                  className="w-4 h-4 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer border-0 text-[#5e5e5e] hover:text-[#1f1f1f] dark:text-[#a8a8a8] dark:hover:text-white"
                  title="Remove file"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onClearAttachments}
            className="text-[10px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline px-1 cursor-pointer shrink-0 border-0 bg-transparent"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Quick Preset Action Chips in clean gray rounded-full styling */}
      <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {PRESET_QUICK_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isLoading}
            onClick={() => handleTriggerSend(chip.prompt)}
            className="h-8 px-3.5 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] hover:bg-[#e2e7ef] dark:hover:bg-[#34373f] text-[#444746] hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:text-white text-xs font-semibold border-0 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Prompt Input Form Matching Clean Rounded Styling */}
      <div className="relative flex items-end gap-1.5 bg-[#f0f4f9] dark:bg-[#1f2128] rounded-[24px] p-1.5 transition-all focus-within:ring-2 focus-within:ring-[#0b57d0] shadow-xs">
        {/* Upload File Button with Menu Popover */}
        <div className="relative shrink-0" ref={attachMenuRef}>
          <button
            type="button"
            onClick={() => setShowAttachMenu((prev) => !prev)}
            disabled={isLoading}
            className="w-9 h-9 rounded-full bg-white dark:bg-[#282a30] hover:bg-[#e2e7ef] dark:hover:bg-[#34373f] text-[#5e5e5e] dark:text-[#c4c7c5] border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 disabled:opacity-40"
            title="Attach Image or File"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Popover Menu: Choose Image or Document */}
          {showAttachMenu && (
            <div className="absolute bottom-11 left-0 z-50 w-44 bg-white dark:bg-[#282a30] rounded-2xl p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.18)] border border-black/[0.06] dark:border-white/[0.08] animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  imageInputRef.current?.click();
                  setShowAttachMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#34373f] cursor-pointer border-0 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>
                <span>Upload Image</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  docInputRef.current?.click();
                  setShowAttachMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#34373f] cursor-pointer border-0 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-full bg-[#ba1a1a]/10 text-[#ba1a1a] dark:text-[#ffb4ab] flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span>Upload File / PDF</span>
              </button>
            </div>
          )}
        </div>

        {/* Textarea for Prompt */}
        <textarea
          ref={textareaRef}
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            isListening
              ? 'Listening... Speak now...'
              : selectedText
              ? 'Tell Theta how to refine the selected text...'
              : attachments.length > 0
              ? 'Ask questions about attached file(s)...'
              : 'Ask Theta Notes Assistant to write, refine, style'
          }
          rows={1}
          disabled={isLoading}
          className="flex-1 bg-transparent text-[17px] text-slate-900 dark:text-zinc-100 placeholder-[#757575] dark:placeholder-[#9e9e9e] font-medium border-0 outline-none resize-none px-2.5 py-2 max-h-32 font-sans [scrollbar-width:none] leading-relaxed"
        />

        {/* Microphone Voice-to-Text Button */}
        <button
          type="button"
          onClick={toggleSpeechRecognition}
          disabled={isLoading}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 border-0 ${
            isListening
              ? 'bg-[#ba1a1a] text-white shadow-[0_2px_6px_rgba(186,26,26,0.3)] animate-pulse'
              : 'bg-white dark:bg-[#282a30] hover:bg-[#e2e7ef] dark:hover:bg-[#34373f] text-[#5e5e5e] dark:text-[#c4c7c5] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
          }`}
          title={isListening ? 'Stop voice typing' : 'Voice input (Click to speak)'}
        >
          {isListening ? (
            <MicOff className="w-4 h-4 fill-current" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        {/* Stop Button when Loading, or Send Button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onCancelRequest}
            className="w-9 h-9 rounded-full bg-[#ba1a1a] hover:bg-[#93000a] text-white flex items-center justify-center shrink-0 cursor-pointer transition-all shadow-[0_2px_6px_rgba(186,26,26,0.3)] active:scale-95 border-0"
            title="Stop generating response"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!inputPrompt.trim() && attachments.length === 0}
            onClick={() => handleTriggerSend()}
            className="w-9 h-9 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_6px_rgba(11,87,208,0.25)] active:scale-95 border-0"
            title="Send Prompt (Enter)"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        )}
      </div>
    </div>
  );
};
