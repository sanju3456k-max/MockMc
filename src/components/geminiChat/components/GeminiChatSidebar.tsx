import React from 'react';
import { 
  Sparkles, 
  ArrowLeft, 
  Plus, 
  Search, 
  RotateCcw, 
  Trash2, 
  MessageSquare, 
  Cloud, 
  CloudOff 
} from 'lucide-react';
import { ChatSession, GeminiModelTier } from '../types';

interface GeminiChatSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  historySearchQuery: string;
  setHistorySearchQuery: (query: string) => void;
  handleNewChat: () => void;
  handleClearCurrentChat: () => void;
  handleDeleteAllSessions: () => void;
  filteredSessions: ChatSession[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  setSelectedModel: (model: GeminiModelTier) => void;
  handleToggleSessionCloudSync: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  activeSessionHasMessages: boolean;
  hasSessions: boolean;
}

export const GeminiChatSidebar: React.FC<GeminiChatSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  historySearchQuery,
  setHistorySearchQuery,
  handleNewChat,
  handleClearCurrentChat,
  handleDeleteAllSessions,
  filteredSessions,
  activeSessionId,
  setActiveSessionId,
  setSelectedModel,
  handleToggleSessionCloudSync,
  handleDeleteSession,
  activeSessionHasMessages,
  hasSessions
}) => {
  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto h-full w-72 lg:w-80 bg-[#f0f4f9] dark:bg-[#1e1f20] border-r border-slate-200/80 dark:border-[#282a2d] flex flex-col shrink-0 transition-transform duration-200 ease-out drawer-panel ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
      }`}
    >
      {/* Sidebar Header & New Chat Button */}
      <div className="pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] px-3.5 pb-3.5 space-y-3 border-b border-slate-200/80 dark:border-[#282a2d] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-800 dark:text-zinc-100">
              Chat History
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-[#282a2d] cursor-pointer transition-colors"
            title="Back to conversation (Esc)"
            aria-label="Back to conversation"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-white dark:bg-[#21222e] text-slate-800 dark:text-zinc-100 hover:bg-blue-50 dark:hover:bg-[#20222e] border border-slate-300 dark:border-zinc-700 text-xs font-bold transition-all shadow-none cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>New Chat</span>
        </button>

        {/* Search conversations */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search chats..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-[#21222e] border border-slate-300 dark:border-zinc-700 shadow-none rounded-full pl-8.5 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
          {activeSessionHasMessages && (
            <button
              onClick={handleClearCurrentChat}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shrink-0 cursor-pointer shadow-none border border-slate-300 dark:border-zinc-700"
              title="Clear messages in current chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {hasSessions && (
            <button
              onClick={handleDeleteAllSessions}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer shadow-none border border-slate-300 dark:border-zinc-700"
              title="Delete all chat history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No conversations found.
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => {
                  setActiveSessionId(session.id);
                  if (session.modelTier) {
                    setSelectedModel(session.modelTier);
                  }
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    if (document.documentElement) document.documentElement.scrollTop = 0;
                    if (document.body) document.body.scrollTop = 0;
                    if (window.innerWidth < 1024) {
                      setIsSidebarOpen(false);
                    }
                  }
                }}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#d3e3fd] dark:bg-[#282a2d] text-blue-900 dark:text-blue-300 font-bold shadow-2xs'
                    : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-[#282a2d]/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  <span className="truncate">{session.title || 'New Conversation'}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSessionCloudSync(session.id);
                    }}
                    className={`w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      session.cloudSyncEnabled
                        ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100/70 dark:hover:bg-blue-900/40'
                        : 'opacity-50 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-[#3c4043]'
                    }`}
                    title={
                      session.cloudSyncEnabled
                        ? 'Cloud Sync: Enabled (Click to disable)'
                        : 'Cloud Sync: Disabled (Click to enable)'
                    }
                    aria-label="Toggle cloud sync for this chat"
                  >
                    {session.cloudSyncEnabled ? (
                      <Cloud className="w-3.5 h-3.5" />
                    ) : (
                      <CloudOff className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="w-6.5 h-6.5 rounded-full flex items-center justify-center opacity-60 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-[#3c4043] transition-all cursor-pointer"
                    title="Delete chat"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
