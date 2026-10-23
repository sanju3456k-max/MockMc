import React, { useState } from 'react';
import { Terminal, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface PythonCodeDrawerProps {
  code: string;
  language?: string;
  isDarkMode: boolean;
}

export const PythonCodeDrawer: React.FC<PythonCodeDrawerProps> = ({ code, language = 'PYTHON' }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#3c4043] bg-[#f8fafc] dark:bg-[#18191a] overflow-hidden my-3 shadow-2xs">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/90 dark:bg-[#202124] border-b border-slate-200 dark:border-[#3c4043] cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 tracking-wider">
            {language.toUpperCase()} EXECUTION CODE
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-[#2a2b2e] text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Copy code"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>
      {isOpen && (
        <pre className="p-3.5 text-xs font-mono overflow-x-auto text-slate-800 dark:text-zinc-200 bg-[#f1f5f9] dark:bg-[#131415] leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
};
