import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  PlusCircle, 
  Sparkles, 
  BarChart3, 
  LogOut, 
  Cloud, 
  Sigma,
  Sun,
  Moon,
  Menu,
  X,
  History,
  ChevronRight,
  CheckCircle2,
  Layers,
  SlidersHorizontal,
  Search,
  Camera,
  Bot,
  Share2,
  ExternalLink,
  Sliders,
  CloudOff,
  HardDrive,
  User as UserIcon,
  FileText,
  Printer,
  Code,
  FileCode
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { 
  androidDrawerLeftVariants, 
  androidDropdownVariants, 
  androidBackdropVariants, 
  androidFastTransition, 
  gpuAcceleratedStyle,
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import type { User } from 'firebase/auth';
import type { ActiveTab } from '../types';
import { type CachedAuthUser, isOfflineLocalOnlyMode } from '../lib/storage';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  cachedUser?: CachedAuthUser | null;
  isAuthLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onCreateNewTest?: () => void;
  onDrawerOpenChange?: (isOpen: boolean) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenSettings?: () => void;
}

// Google multi-colored G logo component
const GoogleLogoIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  cachedUser,
  isAuthLoading,
  onSignIn,
  onSignOut,
  isDarkMode,
  onToggleTheme,
  onCreateNewTest,
  onDrawerOpenChange,
  searchQuery = '',
  onSearchChange,
  onOpenSettings,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Lock body & document scrolling while side drawer is open to prevent background scroll
  useScrollLock(isDrawerOpen);

  const displayUser = currentUser || cachedUser || null;

  const isSearchActive = isSearchOpen || Boolean(searchQuery);

  // Focus search input on activation without triggering browser window scrolling or vertical scrollbar jump
  useEffect(() => {
    if (isSearchActive) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isSearchActive]);

  const toggleDrawer = (open: boolean) => {
    setIsDrawerOpen(open);
    onDrawerOpenChange?.(open);
  };

  // Keyboard shortcut listener (Ctrl+K or '/') to focus top header search input (only when on home screen 'tests')
  useEffect(() => {
    if (activeTab !== 'tests') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape' && isSearchOpen && !searchQuery) {
          setIsSearchOpen(false);
          (target as HTMLInputElement).blur();
        }
        return;
      }

      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || e.key === '/') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => {
          document.getElementById('top-header-search-input')?.focus();
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isSearchOpen, searchQuery]);

  // System gesture & back button integration for Navbar drawer, profile dropdown & search bar
  useBackHandler({
    isOpen: isSearchOpen,
    onBack: () => setIsSearchOpen(false),
    priority: 35,
    id: 'navbar_search',
  });

  useBackHandler({
    isOpen: isDrawerOpen,
    onBack: () => setIsDrawerOpen(false),
    priority: 30,
    id: 'navbar_drawer',
  });

  useBackHandler({
    isOpen: isProfileMenuOpen,
    onBack: () => setIsProfileMenuOpen(false),
    priority: 25,
    id: 'navbar_profile_menu',
  });

  const handleNavClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    toggleDrawer(false);
  };

  return (
    <>
      <header className="bg-[#e5e9f0] dark:bg-[#0b0c10] sticky top-0 z-40 transition-colors duration-200 pt-[calc(env(safe-area-inset-top,0px)+0.4rem)] pb-2">
        <div className="max-w-[1750px] w-full mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-10 sm:h-11">
            {/* Left: Drawer Hamburger Button & Brand Logo */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Drawer Open Button */}
              <button
                id="open-nav-drawer-btn"
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open Navigation Drawer"
                title="Main Menu"
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0"
              >
                <Menu className="w-[18px] h-[18px] text-[#1f1f1f] dark:text-[#e3e3e3]" />
              </button>

              {/* Brand Logo with Google-style Round Icon */}
              <div 
                id="brand-logo"
                className="flex items-center gap-2.5 cursor-pointer select-none group"
                onClick={() => handleNavClick('tests')}
              >
                <div className="w-9 h-9 rounded-full bg-[#bad6ff] dark:bg-[#004a77] group-hover:bg-[#a8cbfd] dark:group-hover:bg-[#005a92] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 border-0 ring-0 shadow-none transition-all">
                  <Sigma className="w-5 h-5 stroke-[2.5] text-[#0b57d0] dark:text-[#a8c7fa]" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-base sm:text-lg text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                      MockMc
                    </span>
                    <span className="text-[9px] sm:text-[10px] px-2 py-0.5 font-bold rounded-full bg-[#bad6ff] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]">
                      PRO
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Controls: Chatbot & Google Login/Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Bot Icon Button */}
              <button
                id="header-chatbot-icon-btn"
                type="button"
                onClick={() => handleNavClick('chatbot')}
                title="Open Theta AI"
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0"
              >
                <Bot className={`w-[18px] h-[18px] ${activeTab === 'chatbot' ? 'text-[#0b57d0] dark:text-[#a8c7fa]' : 'text-[#444746] dark:text-[#c4c7c5]'}`} />
              </button>

              {/* Google Sign-In / Account Profile Trigger */}
              {displayUser ? (
                <div className="relative">
                  <button
                    id="profile-dropdown-trigger"
                    type="button"
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    title={displayUser.displayName || displayUser.email || "Account Profile"}
                    className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-xs flex items-center justify-center border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-0 outline-none transition-all active:scale-95 cursor-pointer overflow-hidden shrink-0"
                  >
                    {displayUser.photoURL && displayUser.photoURL.trim() ? (
                      <img 
                        src={displayUser.photoURL} 
                        alt={displayUser.displayName || "User"} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="uppercase text-xs font-black">
                        {(displayUser.displayName || displayUser.email || 'U')[0]}
                      </span>
                    )}
                  </button>

                  {/* Account Profile Dropdown Menu & Click-Outside Backdrop */}
                  <AnimatePresence>
                    {isProfileMenuOpen && (
                      <>
                        <motion.div 
                          variants={androidBackdropVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          transition={androidFastTransition}
                          style={gpuAcceleratedStyle}
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => setIsProfileMenuOpen(false)}
                        />
                        <motion.div 
                          variants={androidDropdownVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          transition={androidFastTransition}
                          style={gpuAcceleratedStyle}
                          className={`absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] ${APP_STYLES.card.base} overflow-hidden pt-0 pb-2.5 z-50`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-4 py-3.5 bg-slate-100/90 dark:bg-[#16181d] flex items-center gap-3 border-b border-slate-200/80 dark:border-zinc-800">
                            <div className="w-10 h-10 rounded-full bg-[#0b57d0] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs border-0 ring-2 ring-white/60 dark:ring-zinc-700 overflow-hidden">
                              {displayUser.photoURL && displayUser.photoURL.trim() ? (
                                <img src={displayUser.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="uppercase font-black text-sm">{(displayUser.displayName || displayUser.email || 'U')[0]}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 truncate">
                                {displayUser.displayName || 'Google Account'}
                              </p>
                              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 truncate">
                                {displayUser.email || 'Cloud Synced'}
                              </p>
                            </div>
                          </div>

                      <div className="p-2 space-y-1">
                        <div className="flex items-center justify-between px-3 py-2 text-xs font-medium rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#041e49] dark:text-[#c2e7ff]">
                          <div className="flex items-center gap-2">
                            <Cloud className="w-4 h-4 shrink-0 text-[#0b57d0] dark:text-[#a8c7fa]" />
                            <span>Google Cloud Sync</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0b57d0] text-white font-bold">CONNECTED</span>
                        </div>

                        {onOpenSettings && (
                          <button
                            id="profile-settings-btn"
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              onOpenSettings();
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 rounded-full transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Sliders className="w-4 h-4 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                              <span>Settings & Storage</span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                          </button>
                        )}

                        <button
                          id="profile-signout-btn"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            onSignOut();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-full transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
                </div>
              ) : (
                /* Unauthenticated: Google Icon + "Sign In" Button matching search button style */
                <button
                  id="header-google-login-btn"
                  type="button"
                  onClick={onSignIn}
                  disabled={isAuthLoading}
                  title="Sign in with Google"
                  className="h-9 px-3.5 sm:px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] border-0 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-xs sm:text-sm shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 outline-none"
                >
                  <GoogleLogoIcon />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* TOP-LEFT SIDE DRAWER PANEL matching test runner/solution question palette drawer motion */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isDrawerOpen && (
            <motion.div 
              variants={androidBackdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              className="fixed inset-0 bg-black/40 z-50 flex justify-start select-none cursor-pointer"
              onClick={(e) => {
                if (e.target === e.currentTarget) toggleDrawer(false);
              }}
            >
              {/* Navigation Drawer Panel matching test runner/solution palette drawer motion */}
              <motion.div 
                variants={androidDrawerLeftVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={gpuTransformStyle}
                className="bg-white dark:bg-[#1e2024] w-[88vw] max-w-[320px] sm:max-w-sm h-full flex flex-col justify-between shadow-2xl rounded-r-[24px] overflow-hidden touch-pan-y cursor-default drawer-panel relative z-10 text-[#1f1f1f] dark:text-[#e3e3e3] border-0 ring-0"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drawer Top Drag Indicator & Header */}
                <div className="p-4 sm:p-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] bg-white dark:bg-[#1e2024] flex items-center justify-between shrink-0 rounded-tr-[24px] border-b border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 border-0 ring-0 shadow-none">
                      <Sigma className="w-5 h-5 stroke-[2.5] text-[#0b57d0] dark:text-[#a8c7fa]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-base text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                          MockMc
                        </span>
                        <span className="text-[9px] px-2 py-0.5 font-bold rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]">
                          PRO
                        </span>
                      </div>
                      <p className="text-[10.5px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">Navigation & Test Suite</p>
                    </div>
                  </div>
                  <md-icon-button
                    id="close-nav-drawer-btn"
                    onClick={() => toggleDrawer(false)}
                    title="Close navigation drawer"
                  >
                    <X className="w-5 h-5 text-[#1f1f1f] dark:text-[#e3e3e3]" />
                  </md-icon-button>
                </div>

                {/* Drawer Body Items */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1 overscroll-contain bg-white dark:bg-[#1e2024]">
                  {/* Primary Views Section */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider px-3 mb-1">
                      Main Navigation
                    </div>
                    
                    <button
                      id="drawer-item-tests"
                      onClick={() => handleNavClick('tests')}
                      className={`${activeTab === 'tests' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'tests'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <BookOpen className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <span className="text-[17px] font-semibold">Mock Tests Library</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>

                    <button
                      id="drawer-item-analytics"
                      onClick={() => handleNavClick('analytics')}
                      className={`${activeTab === 'analytics' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'analytics'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <BarChart3 className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <span className="text-[17px] font-semibold">Performance Analytics</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>

                    <button
                      id="drawer-item-notes-studio"
                      onClick={() => handleNavClick('notes-repository')}
                      className={`${(activeTab === 'notes-repository' || activeTab === 'html-notes') ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          (activeTab === 'notes-repository' || activeTab === 'html-notes')
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <FileText className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <div className="flex flex-col items-start text-left leading-tight">
                          <span className="font-semibold text-[17px]">Notes Studio</span>
                          <span className={`text-[11px] font-medium ${(activeTab === 'notes-repository' || activeTab === 'html-notes') ? 'text-[#041e49]/80 dark:text-[#c2e7ff]/80' : 'text-[#5e5e5e] dark:text-[#9aa0a6]'}`}>
                            Study Notes & HTML Studio
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>

                    <button
                      id="drawer-item-chatbot"
                      onClick={() => handleNavClick('chatbot')}
                      className={`${activeTab === 'chatbot' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'chatbot'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <Bot className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <div className="flex flex-col items-start text-left leading-tight">
                          <span className="font-semibold text-[17px]">
                            Theta
                          </span>
                          <span className={`text-[11px] font-medium ${activeTab === 'chatbot' ? 'text-[#041e49]/80 dark:text-[#c2e7ff]/80' : 'text-[#5e5e5e] dark:text-[#9aa0a6]'}`}>
                            powered by Gemini
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>
                  </div>

                  <md-divider class="my-2 opacity-50" />

                  {/* Create Test & Studio Suite */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider px-3 mb-1">
                      Test Creators & Studio
                    </div>

                    <button
                      id="drawer-item-create"
                      onClick={() => {
                        toggleDrawer(false);
                        if (onCreateNewTest) onCreateNewTest();
                        else handleNavClick('create');
                      }}
                      className={`${activeTab === 'create' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'create'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <PlusCircle className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <span className="text-[17px] font-semibold">Test Creator Studio</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>

                    <button
                      id="drawer-item-custom-builder"
                      onClick={() => handleNavClick('custom-builder')}
                      className={`${activeTab === 'custom-builder' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'custom-builder'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#ffe088] text-[#241a00] dark:bg-[#5b4300] dark:text-[#ffe088]'
                        }`}>
                          <SlidersHorizontal className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <span className="text-[17px] font-semibold">Custom Test Builder</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>

                    <button
                      id="drawer-item-bulk-print"
                      onClick={() => handleNavClick('bulk-print')}
                      className={`${activeTab === 'bulk-print' ? APP_STYLES.nav.itemActive : APP_STYLES.nav.item} relative overflow-hidden`}
                    >
                      <md-ripple />
                      <div className="flex items-center gap-3">
                        <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'bulk-print'
                            ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                            : 'bg-[#e1e3e1]/60 text-[#1f1f1f] dark:bg-[#282a30] dark:text-[#e3e3e3]'
                        }`}>
                          <Printer className="w-4.5 h-4.5 stroke-[2.2]" />
                        </div>
                        <span className="text-[17px] font-semibold">OMR and Print Studio</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>
                  </div>

                  <md-divider class="my-2 opacity-50" />

                  {/* Settings & Offline Mode Section */}
                  {onOpenSettings && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold text-[#5e5e5e] dark:text-[#9aa0a6] uppercase tracking-wider px-3 mb-1">
                        System & Storage
                      </div>

                      <button
                        id="drawer-item-settings"
                        onClick={() => {
                          toggleDrawer(false);
                          onOpenSettings();
                        }}
                        className="w-full flex items-center justify-between p-3.5 rounded-full text-[17px] font-semibold transition-all cursor-pointer bg-transparent text-[#444746] dark:text-[#c4c7c5] hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 group relative overflow-hidden"
                      >
                        <md-ripple />
                        <div className="flex items-center gap-3">
                          <div className="w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#c4eed0] group-hover:scale-105 transition-transform">
                            <Sliders className="w-4.5 h-4.5 stroke-[2.2]" />
                          </div>
                          <div className="flex flex-col items-start text-left">
                            <span className="flex items-center gap-1.5 text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                              Settings & Storage
                              {isOfflineLocalOnlyMode() && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#c4eed0] text-[#072711] dark:bg-[#0f5223] dark:text-[#c4eed0]">
                                  OFFLINE
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-normal text-[#5e5e5e] dark:text-[#9aa0a6]">
                              Offline mode, cloud backup, display scale
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 opacity-70" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Drawer Bottom Bar: Theme Switcher */}
                <div className="p-4 bg-white dark:bg-[#1e2024] flex items-center justify-between text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] shrink-0 border-t border-slate-100 dark:border-zinc-800/80 rounded-br-[24px]">
                  <div className="flex items-center gap-1.5">
                    <span>MockMc Pro</span>
                    <span className="text-[10px] text-[#5e5e5e] dark:text-[#9aa0a6]">v2.0</span>
                  </div>
                  <button
                    id="drawer-theme-toggle-btn"
                    type="button"
                    onClick={onToggleTheme}
                    className="px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold bg-white dark:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border border-[#e1e3e1] dark:border-[#44474f]/50 shadow-xs hover:bg-[#f0f4f9] dark:hover:bg-[#32353c] active:scale-95 transition-all cursor-pointer relative overflow-hidden"
                  >
                    <md-ripple />
                    {isDarkMode ? (
                      <Sun className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                    ) : (
                      <Moon className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] fill-[#0b57d0]/20 shrink-0" />
                    )}
                    <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
