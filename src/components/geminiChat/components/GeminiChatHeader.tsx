import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  GraduationCap, 
  ChevronDown, 
  Check, 
  Cloud, 
  CloudOff, 
  Sparkles, 
  Clock, 
  Sliders 
} from 'lucide-react';
import { GeminiModelTier } from '../types';
import { MODEL_OPTIONS, PRESET_ROLES } from '../constants/rolesAndPresets';

interface GeminiChatHeaderProps {
  selectedModel: GeminiModelTier;
  setSelectedModel: (model: GeminiModelTier) => void;
  showModelDropdown: boolean;
  setShowModelDropdown: (show: boolean) => void;
  selectedRole: string;
  setSelectedRole: (role: string) => void;
  showRolePickerModal: boolean;
  setShowRolePickerModal: (show: boolean) => void;
  cloudSyncActive: boolean;
  onToggleCloudSync: () => void;
  onNavigateTab?: (tab: string) => void;
  onToggleSidebar: () => void;
  updateActiveSessionModel: (model: GeminiModelTier) => void;
}

export const GeminiChatHeader: React.FC<GeminiChatHeaderProps> = ({
  selectedModel,
  setSelectedModel,
  showModelDropdown,
  setShowModelDropdown,
  selectedRole,
  setSelectedRole,
  showRolePickerModal,
  setShowRolePickerModal,
  cloudSyncActive,
  onToggleCloudSync,
  onNavigateTab,
  onToggleSidebar,
  updateActiveSessionModel
}) => {
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const currentModelConfig = MODEL_OPTIONS.find((m) => m.id === selectedModel) || MODEL_OPTIONS[0];
  const activeRoleObj = PRESET_ROLES.find((r) => r.id === selectedRole) || PRESET_ROLES[0];

  return (
    <header className="relative z-30 flex items-center justify-between gap-1 sm:gap-2 px-3 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 bg-white dark:bg-[#131314] shrink-0 border-0 shadow-none">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0">
        {onNavigateTab && (
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
              }
              onNavigateTab('tests');
            }}
            className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#1f1f1f] dark:text-[#e3e3e3] bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] border-0 shadow-none transition-all cursor-pointer active:scale-95 shrink-0"
            title="Back to Tests Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex flex-col justify-center ml-0.5 shrink-0 leading-tight">
          <span className="font-bold text-sm sm:text-base tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent leading-none">
            Theta
          </span>
          <span className="text-[9.5px] sm:text-[10.5px] font-medium text-slate-500 dark:text-zinc-400 mt-0.5 leading-none whitespace-nowrap">
            powered by <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent font-semibold">Gemini</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Model Selector Pill Dropdown */}
        <div className="relative shrink-0" ref={modelDropdownRef}>
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border-0 shadow-none transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <div className="p-0.5 rounded-full text-emerald-600 dark:text-emerald-400 shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
            <span className="hidden sm:inline text-xs">Gemini 3.5</span>
            <span className="sm:hidden text-xs">{currentModelConfig.label.split(' ')[1] || '3.5'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          <AnimatePresence>
            {showModelDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
                  onClick={() => setShowModelDropdown(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] sm:absolute sm:right-0 sm:left-auto sm:translate-x-0 sm:top-full sm:mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-80 max-h-[75vh] overflow-y-auto bg-white dark:bg-[#1e2024] rounded-[28px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-slate-200 dark:border-zinc-700 p-3 z-50 space-y-1 modal-content-smooth"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    Select Gemini Model
                  </div>
                  {MODEL_OPTIONS.map((m) => {
                    const Icon = m.icon;
                    const isSelected = selectedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setShowModelDropdown(false);
                          updateActiveSessionModel(m.id);
                        }}
                        className={`p-2.5 rounded-[20px] cursor-pointer transition-all flex items-start gap-2.5 border ${
                          isSelected
                            ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-semibold border-blue-400/50'
                            : 'bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        <div className="p-1.5 rounded-full bg-white dark:bg-[#141619] shrink-0 mt-0.5 shadow-xs">
                          <Icon className={`w-4 h-4 ${m.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs flex items-center justify-between gap-1.5">
                            <span className="truncate">{m.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-tight">{m.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Cloud Sync Button */}
        <button
          onClick={onToggleCloudSync}
          className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-0 shadow-none transition-all cursor-pointer active:scale-95 ${
            cloudSyncActive
              ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-[#20222e]'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282a30]'
          }`}
          title={cloudSyncActive ? 'Cloud Sync Enabled' : 'Cloud Sync Disabled'}
        >
          {cloudSyncActive ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
        </button>

        {/* Preset Role Button */}
        <button
          onClick={() => setShowRolePickerModal(true)}
          className="p-1.5 sm:px-2.5 sm:py-1 rounded-full bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border-0 shadow-none transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          title="Switch Tutor Persona / Role"
        >
          <Sliders className="w-3.5 h-3.5 text-purple-500" />
          <span className="hidden md:inline text-xs truncate max-w-[100px]">{activeRoleObj.name}</span>
        </button>

        {/* Chat History Sidebar Drawer Toggle */}
        <button
          onClick={onToggleSidebar}
          className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#1f1f1f] dark:text-[#e3e3e3] bg-transparent hover:bg-slate-100 dark:hover:bg-[#282a30] border-0 shadow-none transition-all cursor-pointer active:scale-95 shrink-0"
          title="Open Conversation History"
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
