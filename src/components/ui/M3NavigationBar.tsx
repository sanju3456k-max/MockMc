import React from 'react';
import { BookOpen, FileText, FileCode, BarChart3, Bot, Plus, SlidersHorizontal } from 'lucide-react';
import type { ActiveTab } from '../../types';

interface M3NavigationBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onCreateNew?: () => void;
}

export const M3NavigationBar: React.FC<M3NavigationBarProps> = ({
  activeTab,
  onTabChange,
  onCreateNew,
}) => {
  const navItems: { tab: ActiveTab; label: string; icon: React.ReactNode }[] = [
    {
      tab: 'tests',
      label: 'Library',
      icon: <BookOpen className="w-5 h-5 stroke-[2.2]" />,
    },
    {
      tab: 'notes-repository',
      label: 'Notes Studio',
      icon: <FileText className="w-5 h-5 stroke-[2.2]" />,
    },
    {
      tab: 'analytics',
      label: 'Analytics',
      icon: <BarChart3 className="w-5 h-5 stroke-[2.2]" />,
    },
    {
      tab: 'chatbot',
      label: 'Theta AI',
      icon: <Bot className="w-5 h-5 stroke-[2.2]" />,
    },
  ];

  return (
    <>
      {/* Floating Action Button (FAB) for Primary Creations */}
      {onCreateNew && (activeTab === 'tests' || activeTab === 'notes-repository') && (
        <div className="fixed right-4 sm:right-6 bottom-20 sm:bottom-24 z-30 pointer-events-auto">
          <button
            id="m3-main-fab-btn"
            type="button"
            onClick={onCreateNew}
            className="h-14 px-5 rounded-[16px] sm:rounded-[20px] bg-[#d3e3fd] hover:bg-[#c2e7ff] active:bg-[#b3d7ff] dark:bg-[#0842a0] dark:hover:bg-[#0b57d0] text-[#041e49] dark:text-[#d3e3fd] shadow-[0_3px_6px_rgba(0,0,0,0.16)] hover:shadow-[0_6px_14px_rgba(0,0,0,0.24)] active:scale-95 flex items-center gap-2.5 font-bold text-sm transition-all duration-150 cursor-pointer border-0 outline-none select-none"
            title="Create Custom Test"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span className="tracking-wide">Create Test</span>
          </button>
        </div>
      )}

      {/* Official Google Material 3 Navigation Bar (Bottom Docked) */}
      <nav 
        aria-label="Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 bg-[#f3edf7] dark:bg-[#202125] border-0 h-16 sm:h-20 shadow-[0_-1px_3px_rgba(0,0,0,0.06),0_-2px_6px_rgba(0,0,0,0.04)] flex items-center justify-around px-1 sm:px-4 pb-[env(safe-area-inset-bottom,0px)] select-none transition-colors duration-200"
      >
        <div className="w-full max-w-2xl mx-auto flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = activeTab === item.tab || (item.tab === 'notes-repository' && activeTab === 'html-notes');
            return (
              <button
                key={item.tab}
                id={`m3-bottom-nav-${item.tab}`}
                type="button"
                onClick={() => onTabChange(item.tab)}
                className="flex flex-col items-center justify-center flex-1 py-1 gap-1 cursor-pointer border-0 ring-0 outline-none focus:outline-none focus:ring-0 select-none group transition-all"
              >
                {/* Active Indicator Pill (M3 Signature Pill) */}
                <div
                  className={`w-14 sm:w-16 h-8 rounded-full flex items-center justify-center transition-all duration-200 border-0 ring-0 ${
                    isActive
                      ? 'bg-[#d3e3fd] dark:bg-[#0842a0] text-[#041e49] dark:text-[#d3e3fd] shadow-xs'
                      : 'bg-transparent text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:bg-[#1a1b1f]/8 dark:group-hover:bg-[#e3e2e6]/8'
                  }`}
                >
                  {item.icon}
                </div>
                {/* M3 Typography Label */}
                <span
                  className={`text-[11px] leading-tight transition-colors ${
                    isActive
                      ? 'font-bold text-[#041e49] dark:text-[#e3e2e6]'
                      : 'font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
