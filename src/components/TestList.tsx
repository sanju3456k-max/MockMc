import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Clock, 
  Layers, 
  SlidersHorizontal,
  Search, 
  X, 
  BookOpen, 
  ChevronDown, 
  ChevronRight,
  Check,
  FileCode,
  FileCheck2,
  Award,
  TrendingUp,
  Loader2,
  Printer,
  Share2,
  Sparkles,
  Zap,
  ArrowUpRight,
  Package
} from 'lucide-react';
import type { MathTest, TestAttempt, ActiveTestSession, UserProfile, TestHistoryEntry } from '../types';
import { getAllAvailableTopics } from '../utils/topics';
import { isAttemptOmrMode, pruneAttemptsToFirstAndLast } from '../lib/storage';
import { searchCloudTests } from '../lib/firebase';
import { createShareUrlAsync, formatTestShareMessage } from '../utils/shareUtils';
import type { User } from 'firebase/auth';
import { useScrollLock } from '../hooks/useScrollLock';
import { useBackHandler } from '../hooks/useBackNavigation';
import { 
  studioStaggerContainer, 
  studioStaggerItem, 
  studioModalVariants, 
  studioDropdownVariants, 
  studioBackdropVariants, 
  gpuAcceleratedStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';

interface TestListProps {
  tests: MathTest[];
  attempts?: TestAttempt[];
  currentUser: User | null;
  userProfile?: UserProfile | null;
  activeSession?: ActiveTestSession | null;
  activeSessionsMap?: Record<string, ActiveTestSession>;
  onResumeSession?: () => void;
  onStartTest: (test: MathTest, mode: 'timed' | 'practice') => void;
  onStartOmrTest?: (test: MathTest) => void;
  onEditTest: (test: MathTest) => void;
  onDeleteTest: (testId: string) => void;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
  onExportJson?: (test: MathTest) => void;
  onCreateNew?: () => void;
  onSignIn: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  hasMoreTests?: boolean;
  isLoadingMoreTests?: boolean;
  onLoadMoreTests?: () => void;
  onOpenBulkPrint?: () => void;
}

// Google Material 3 topic tokens and icons resolver
const getTopicM3Tokens = (topic?: string) => {
  const t = (topic || '').toLowerCase();
  if (t.includes('algebra') || t.includes('linear')) {
    return {
      icon: 'functions',
      badgeClass: 'bg-[#e8ddff] text-[#21005d] dark:bg-[#381e72] dark:text-[#e8ddff]',
      borderClass: 'border-[#d0bcff]/40',
      headerBg: 'bg-gradient-to-br from-[#f3edff] to-[#e8ddff] dark:from-[#21005d] dark:to-[#381e72]',
      accentColor: '#6750a4',
      tonalBg: '#e8ddff',
      tonalText: '#21005d',
      tonalDarkBg: '#381e72',
      tonalDarkText: '#e8ddff',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('geometry') || t.includes('mensuration') || t.includes('conic')) {
    return {
      icon: 'shapes',
      badgeClass: 'bg-[#c4eed0] text-[#00210f] dark:bg-[#07381a] dark:text-[#c4eed0]',
      borderClass: 'border-[#7edab3]/40',
      headerBg: 'bg-gradient-to-br from-[#e8f8ed] to-[#c4eed0] dark:from-[#00210f] dark:to-[#07381a]',
      accentColor: '#146c2e',
      tonalBg: '#c4eed0',
      tonalText: '#00210f',
      tonalDarkBg: '#07381a',
      tonalDarkText: '#c4eed0',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('calculus') || t.includes('dynamics') || t.includes('statics')) {
    return {
      icon: 'trending_up',
      badgeClass: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
      borderClass: 'border-[#a8c7fa]/40',
      headerBg: 'bg-gradient-to-br from-[#ecf3fe] to-[#d3e3fd] dark:from-[#041e49] dark:to-[#004a77]',
      accentColor: '#0b57d0',
      tonalBg: '#d3e3fd',
      tonalText: '#041e49',
      tonalDarkBg: '#004a77',
      tonalDarkText: '#c2e7ff',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('trigonometry')) {
    return {
      icon: 'change_history',
      badgeClass: 'bg-[#ffd8e4] text-[#31111d] dark:bg-[#492532] dark:text-[#ffd8e4]',
      borderClass: 'border-[#f2b8b5]/40',
      headerBg: 'bg-gradient-to-br from-[#fdf0f4] to-[#ffd8e4] dark:from-[#31111d] dark:to-[#492532]',
      accentColor: '#b3261e',
      tonalBg: '#ffd8e4',
      tonalText: '#31111d',
      tonalDarkBg: '#492532',
      tonalDarkText: '#ffd8e4',
      accentOn: '#ffffff',
    };
  }
  if (t.includes('statistic') || t.includes('probability')) {
    return {
      icon: 'analytics',
      badgeClass: 'bg-[#ffe088] text-[#241a00] dark:bg-[#443200] dark:text-[#ffe088]',
      borderClass: 'border-[#ffba08]/40',
      headerBg: 'bg-gradient-to-br from-[#fef7da] to-[#ffe088] dark:from-[#241a00] dark:to-[#443200]',
      accentColor: '#785900',
      tonalBg: '#ffe088',
      tonalText: '#241a00',
      tonalDarkBg: '#443200',
      tonalDarkText: '#ffe088',
      accentOn: '#ffffff',
    };
  }
  // Default general math
  return {
    icon: 'calculate',
    badgeClass: 'bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff]',
    borderClass: 'border-[#a8c7fa]/40',
    headerBg: 'bg-gradient-to-br from-[#edf2f7] to-[#e1e3e1] dark:from-[#1e2024] dark:to-[#282a30]',
    accentColor: '#0b57d0',
    tonalBg: '#d3e3fd',
    tonalText: '#041e49',
    tonalDarkBg: '#004a77',
    tonalDarkText: '#c2e7ff',
    accentOn: '#ffffff',
  };
};

export const TestList: React.FC<TestListProps> = ({
  tests,
  attempts = [],
  currentUser,
  userProfile,
  activeSession,
  activeSessionsMap,
  onResumeSession,
  onStartTest,
  onStartOmrTest,
  onViewAttemptResult,
  searchQuery: propSearchQuery,
  setSearchQuery: propSetSearchQuery,
  hasMoreTests,
  isLoadingMoreTests,
  onLoadMoreTests,
  onOpenBulkPrint,
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const setSearchQuery = propSetSearchQuery || setLocalSearchQuery;

  const [selectedTopic, setSelectedTopic] = useState('All Topics');
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isTopicPopupOpen, setIsTopicPopupOpen] = useState(false);
  const [savedTopicsVersion, setSavedTopicsVersion] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTopicPopupOpen(false);
      }
    };
    if (isTopicPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isTopicPopupOpen]);

  // Cloud search results for queries that match tests not yet in the initial loaded batch
  const [cloudSearchResults, setCloudSearchResults] = useState<MathTest[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState<boolean>(false);

  useEffect(() => {
    const handleUpdate = () => {
      setSavedTopicsVersion((v) => v + 1);
    };
    window.addEventListener('custom-topics-updated', handleUpdate);
    return () => window.removeEventListener('custom-topics-updated', handleUpdate);
  }, []);

  // Background read-only search to discover matching unloaded tests from Firestore (ZERO writes)
  useEffect(() => {
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery || cleanQuery.length < 3) {
      setCloudSearchResults([]);
      setIsSearchingCloud(false);
      return;
    }

    // Check if local tests in memory already have adequate matches
    const qLower = cleanQuery.toLowerCase();
    const localMatches = tests.filter((t) => {
      const titleMatch = (t.title || '').toLowerCase().includes(qLower);
      const topicMatch = (t.topic || '').toLowerCase().includes(qLower);
      return titleMatch || topicMatch;
    });

    if (localMatches.length >= 3) {
      setCloudSearchResults([]);
      setIsSearchingCloud(false);
      return;
    }

    setIsSearchingCloud(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchCloudTests(cleanQuery, selectedTopic, 15);
        setCloudSearchResults(results);
      } catch (err) {
        console.warn('Cloud search notice:', err);
      } finally {
        setIsSearchingCloud(false);
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedTopic, tests]);

  const availableTopics = useMemo(() => {
    const rawTopics = getAllAvailableTopics(tests);
    return ['All Topics', ...rawTopics.filter((t) => t.toLowerCase() !== 'all topics')];
  }, [tests, savedTopicsVersion]);

  // Selected test for Test Details & Attempt Records Modal
  const [detailedTest, setDetailedTest] = useState<MathTest | null>(null);
  const [isCopiedDetailedTest, setIsCopiedDetailedTest] = useState<boolean>(false);

  const handleShareDetailedTest = async (e: React.MouseEvent, testToShare: MathTest) => {
    e.stopPropagation();
    try {
      const shareUrl = await createShareUrlAsync(testToShare);
      const shareMessage = formatTestShareMessage(testToShare.title, shareUrl);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setIsCopiedDetailedTest(true);
      setTimeout(() => setIsCopiedDetailedTest(false), 2000);
    } catch (err) {
      console.warn('Failed to copy share URL:', err);
    }
  };

  // Lock body scroll strictly when full page modal is open
  useScrollLock(!!detailedTest);

  // System navigation back gesture & button handling for modals
  useBackHandler({
    isOpen: !!detailedTest,
    onBack: () => setDetailedTest(null),
    priority: 30,
    id: 'test_details_modal',
  });

  // Group attempts by testId, normalized test identifier, and test title
  const attemptsByTestId = useMemo(() => {
    const map = new Map<string, TestAttempt[]>();
    attempts.forEach((att) => {
      if (!att) return;
      if (att.testId) {
        const list = map.get(att.testId) || [];
        list.push(att);
        map.set(att.testId, list);

        const normId = att.testId.replace(/[-_]/g, '').toLowerCase();
        if (normId !== att.testId) {
          const normList = map.get(normId) || [];
          normList.push(att);
          map.set(normId, normList);
        }
      }
      if (att.testTitle) {
        const titleKey = `title:${att.testTitle.trim().toLowerCase()}`;
        const titleList = map.get(titleKey) || [];
        titleList.push(att);
        map.set(titleKey, titleList);
      }
    });

    map.forEach((list) => {
      list.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());
    });
    return map;
  }, [attempts]);

  // Comprehensive resolver for a test's attempts ensuring local and cloud sources sync immediately
  const getTestAttempts = (test: MathTest | null): TestAttempt[] => {
    if (!test) return [];

    // 1. Primary Cross-Device Source: userProfile.testHistories
    let cloudHistoryEntry: TestHistoryEntry | null = null;
    if (userProfile?.testHistories) {
      const safeKey = (test.id || '').replace(/[./[\]*~#$]/g, '_');
      if (userProfile.testHistories[safeKey]) {
        cloudHistoryEntry = userProfile.testHistories[safeKey];
      } else if (userProfile.testHistories[test.id]) {
        cloudHistoryEntry = userProfile.testHistories[test.id];
      } else {
        const historiesList = (Object.values(userProfile.testHistories) as (TestHistoryEntry | undefined)[]) || [];
        const found = historiesList.find((e): e is TestHistoryEntry => {
          if (!e) return false;
          if (e.testId === test.id) return true;
          if (e.testTitle && test.title && e.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase()) return true;
          return false;
        });
        if (found) cloudHistoryEntry = found;
      }
    }

    // 2. Query pre-indexed maps
    const directMatches = attemptsByTestId.get(test.id) || [];
    const normId = test.id ? test.id.replace(/[-_]/g, '').toLowerCase() : '';
    const normMatches = normId ? attemptsByTestId.get(normId) || [] : [];
    const titleKey = test.title ? `title:${test.title.trim().toLowerCase()}` : '';
    const titleMatches = titleKey ? attemptsByTestId.get(titleKey) || [] : [];

    const fallbackMatches = (attempts || []).filter((att) => {
      if (!att) return false;
      const attId = (att.testId || '').trim();
      const attNormId = attId.replace(/[-_]/g, '').toLowerCase();
      if (attId && test.id && (attId === test.id || attNormId === normId)) return true;
      if (att.testTitle && test.title && att.testTitle.trim().toLowerCase() === test.title.trim().toLowerCase()) return true;
      return false;
    });

    // Combine and deduplicate
    const combinedMap = new Map<string, TestAttempt>();
    if (cloudHistoryEntry?.firstAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.firstAttempt.id, cloudHistoryEntry.firstAttempt);
    }
    if (cloudHistoryEntry?.lastAttempt?.id) {
      combinedMap.set(cloudHistoryEntry.lastAttempt.id, cloudHistoryEntry.lastAttempt);
    }

    [...directMatches, ...normMatches, ...titleMatches, ...fallbackMatches].forEach((att) => {
      if (att && att.id && !combinedMap.has(att.id)) {
        combinedMap.set(att.id, att);
      }
    });

    const list = Array.from(combinedMap.values());
    const { pruned } = pruneAttemptsToFirstAndLast(list);
    pruned.sort((a, b) => new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime());
    return pruned;
  };

  const filteredTests = useMemo(() => {
    const seenIds = new Set<string>();
    const allCandidates = [...tests, ...cloudSearchResults];
    const cleanSearch = searchQuery.trim().toLowerCase();
    const cleanTopic = selectedTopic.trim().toLowerCase();

    const list = allCandidates.filter((test) => {
      if (!test || !test.id) return false;
      if (seenIds.has(test.id)) return false;
      seenIds.add(test.id);

      const matchesSearch = 
        cleanSearch === '' ||
        (test.title || '').toLowerCase().includes(cleanSearch) ||
        (test.topic || '').toLowerCase().includes(cleanSearch) ||
        (test.description || '').toLowerCase().includes(cleanSearch);

      const matchesTopic = 
        cleanTopic === 'all topics' || 
        (test.topic || '').toLowerCase() === cleanTopic;

      return matchesSearch && matchesTopic;
    });

    return [...list].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [tests, cloudSearchResults, searchQuery, selectedTopic]);

  return (
    <div className="w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 pt-1 sm:pt-2 pb-10 sm:pb-12 space-y-2.5 sm:space-y-3">
      {/* Google Material 3 Search & Filter Controls Header */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* ROW 1: All Topics Button (left) + Tests Available Count immediately to its right & Search on far right */}
        <div className="flex items-center justify-between gap-2.5">
          {/* Left Container: All Topics Button + Tests Available Count immediately to its right */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Simple Topic Dropdown Button (Without Grid Icon) */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                id="topic-dropdown-trigger-btn"
                onClick={() => setIsTopicPopupOpen(!isTopicPopupOpen)}
                className="inline-flex items-center gap-2 h-9 px-3.5 sm:px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] text-xs font-semibold cursor-pointer select-none transition-all duration-200 active:scale-98 outline-none relative overflow-hidden group"
              >
                <md-ripple />
                <span className="truncate max-w-[140px] sm:max-w-[220px] text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors">
                  {selectedTopic}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0 transition-transform duration-200 ${isTopicPopupOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Card Menu */}
              <AnimatePresence>
                {isTopicPopupOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white dark:bg-[#1e2024] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.65)] rounded-[24px] p-2 z-50 [scrollbar-width:thin]"
                  >
                    {availableTopics.map((topic) => {
                      const isSelected = selectedTopic === topic;
                      const topicTokens = getTopicM3Tokens(topic === 'All Topics' ? '' : topic);
                      const chipIcon = topic === 'All Topics' ? 'apps' : topicTokens.icon;
                      return (
                        <button
                          key={topic}
                          onClick={() => {
                            setSelectedTopic(topic);
                            setIsTopicPopupOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-xs text-left rounded-[20px] flex items-center justify-between gap-2.5 transition-all duration-150 cursor-pointer border-0 outline-none select-none relative overflow-hidden my-0.5 ${
                            isSelected
                              ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] font-bold shadow-xs'
                              : 'text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] font-semibold'
                          }`}
                        >
                          <md-ripple />
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-[18px] shrink-0" style={{ color: isSelected ? undefined : topicTokens.accentColor }}>
                              {chipIcon}
                            </span>
                            <span className="truncate">{topic}</span>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#041e49] dark:text-[#c2e7ff] shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Test Numbers Count shifted immediately to the right of All Topics button */}
            <div className="flex items-center gap-1.5 select-none text-[12px] sm:text-[12.5px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">
              <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{filteredTests.length}</span>
              <span>{filteredTests.length === 1 ? 'Test available' : 'Tests available'}</span>
            </div>
          </div>

          {/* Right: Search Toggle & Grid/List Toggle Button all in one row */}
          <div className="flex items-center gap-2 min-w-0 justify-end">
            {isSearchExpanded || searchQuery ? (
              <motion.div 
                initial={{ width: 40, opacity: 0 }}
                animate={{ width: '100%', opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative flex-1 max-w-xs sm:max-w-md"
              >
                <div className="h-9 w-full rounded-full bg-white dark:bg-[#1e2024] flex items-center px-3 gap-2 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all">
                  <span className="material-symbols-outlined text-[#0b57d0] dark:text-[#a8c7fa] text-[17px] shrink-0 select-none">
                    search
                  </span>
                  <input
                    id="m3-main-search-input"
                    type="text"
                    autoFocus
                    placeholder="Search mock tests, topics, or formulas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#444746]/70 dark:placeholder-[#9aa0a6]/70 border-0 outline-none focus:ring-0 font-normal"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchExpanded(false);
                    }}
                    title="Close Search"
                    className="w-6 h-6 rounded-full hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] flex items-center justify-center text-[#5e5e5e] dark:text-[#9aa0a6] cursor-pointer shrink-0 transition-colors border-0 outline-none"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <button
                id="search-icon-toggle-btn"
                type="button"
                onClick={() => setIsSearchExpanded(true)}
                title="Search Tests"
                className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0"
              >
                <span className="material-symbols-outlined text-[17px]">search</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Indicator */}
        {isSearchingCloud && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff] text-[11px] font-semibold border-0 ring-0">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>Searching cloud...</span>
            </div>
          </div>
        )}
      </div>

      {/* Tests Grid/List: Minor Tone Effect Google Material 3 Cards */}
      {filteredTests.length === 0 ? (
        isSearchingCloud ? (
          <div className="text-center py-20 px-4 bg-[#f8fafd] dark:bg-[#1a1d22] rounded-[24px] space-y-3.5 border border-[#dce3ee] dark:border-[#383b42] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-12 h-12 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border-0 shadow-none">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Searching cloud library...</h3>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto">
              Checking cloud tests for matching keywords and topics.
            </p>
          </div>
        ) : (
          <div className="text-center py-20 px-4 bg-[#f8fafd] dark:bg-[#1a1d22] rounded-[24px] space-y-3.5 border border-[#dce3ee] dark:border-[#383b42] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-12 h-12 rounded-full bg-[#edf2f8] dark:bg-[#25282f] text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center justify-center mx-auto border-0 shadow-none">
              <BookOpen className="w-5 h-5 stroke-[2.2]" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              {searchQuery ? `No mock tests found matching "${searchQuery}"` : 'No matching mock tests'}
            </h3>
            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto">
              {searchQuery 
                ? 'We checked all local and cloud tests. Try searching with different keywords or clearing your filters.' 
                : 'Try adjusting your search keywords or topic filter.'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
              {(searchQuery || selectedTopic !== 'All Topics') && (
                <md-filled-tonal-button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTopic('All Topics');
                  }}
                  style={{ '--md-filled-tonal-button-container-shape': '9999px' } as React.CSSProperties}
                >
                  Reset Filters
                </md-filled-tonal-button>
              )}
            </div>
          </div>
        )
      ) : (
        /* Unified Responsive Test Cards Grid (Title always in 1st row, Qs & Time always in bottom row) */
        <motion.div 
          variants={studioStaggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3"
        >
          {filteredTests.map((test, index) => {
            const questionCount = test.questions?.length ?? test.questionCount ?? 0;
            const timeDisplay = test.timeLimitMinutes > 0 ? `${test.timeLimitMinutes}m` : 'Untimed';

            return (
              <motion.div
                key={test.id ? `test-card-${test.id}-${index}` : `test-card-index-${index}`}
                id={`test-row-${test.id || index}`}
                variants={studioStaggerItem}
                style={gpuAcceleratedStyle}
                whileTap={{ scale: 0.99 }}
                onClick={() => setDetailedTest(test)}
                className="p-3.5 sm:p-4 rounded-[24px] bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 relative overflow-hidden cursor-pointer group flex flex-col justify-between gap-2.5"
              >
                <md-ripple />
                {/* Row 1: Topic tag above title & Title */}
                <div className="w-full pointer-events-none space-y-0.5">
                  {test.topic && (
                    <span className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa] block truncate">
                      {test.topic}
                    </span>
                  )}
                  <h3 className="text-[17px] sm:text-[17px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words">
                    {test.title}
                  </h3>
                </div>

                {/* Row 2: Question count and time always in the next bottom row */}
                <div className="flex items-center justify-between w-full pt-0.5 pointer-events-none">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] font-medium leading-none">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                      <Package className="w-3.5 h-3.5 text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none">{questionCount} Qs</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#444746] dark:text-[#c4c7c5] px-1 py-0.5 leading-none">
                      <Clock className="w-3.5 h-3.5 text-[#6750a4] dark:text-[#d0bcff] shrink-0" strokeWidth={2.2} />
                      <span className="leading-none">{timeDisplay}</span>
                    </span>
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-[#747775] dark:text-[#8e918f] group-hover:translate-x-0.5 transition-transform shrink-0" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* On-Demand Paginated "Load More Tests" Control with Tonal Style */}
      {hasMoreTests && onLoadMoreTests && (
        <div className="pt-3 pb-1 text-center">
          <md-filled-tonal-button
            id="load-more-tests-btn"
            onClick={() => onLoadMoreTests()}
            disabled={isLoadingMoreTests}
            style={{ '--md-filled-tonal-button-container-shape': '9999px' } as React.CSSProperties}
          >
            {isLoadingMoreTests ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" slot="icon" />
                <span>Loading more tests...</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5 mr-1.5" slot="icon" />
                <span>Load more tests (+10)</span>
              </>
            )}
          </md-filled-tonal-button>
        </div>
      )}

      {/* DETAILED TEST & ATTEMPT RECORDS FULL PAGE OVERLAY */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {detailedTest && (
            <motion.div 
              variants={studioBackdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuAcceleratedStyle}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex flex-col p-0 cursor-default"
              onClick={() => setDetailedTest(null)}
            >
              <motion.div 
                variants={studioModalVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={gpuAcceleratedStyle}
                className="bg-[#e5e9f0] dark:bg-[#111318] text-[#1f1f1f] dark:text-[#e3e3e3] w-full h-full max-w-none max-h-none rounded-none flex flex-col shadow-none overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Full-View Header */}
                <div className="px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-4 bg-transparent border-0 shadow-none shrink-0">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="min-w-0">
                      <h2 className="font-bold text-base sm:text-xl text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight truncate">
                        {detailedTest.title}
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <md-icon-button
                      id="share-detailed-test-modal-btn"
                      onClick={(e) => handleShareDetailedTest(e, detailedTest)}
                      title={isCopiedDetailedTest ? 'Share link copied!' : 'Share Test Link'}
                    >
                      {isCopiedDetailedTest ? (
                        <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Share2 className="w-5 h-5 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                      )}
                    </md-icon-button>
                    <md-icon-button
                      id="close-detailed-modal-btn"
                      onClick={() => setDetailedTest(null)}
                      title="Close"
                    >
                      <X className="w-5 h-5 text-[#5e5e5e] dark:text-[#9aa0a6]" />
                    </md-icon-button>
                  </div>
                </div>

                {/* Full-View Scrollable Content */}
                <div className="p-3.5 sm:p-6 space-y-4 overflow-y-auto flex-1 max-w-7xl mx-auto w-full">
                  {/* Test Overview Banner / Metadata Cards (Grid of 3 cards) */}
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
                    <div className="p-4 sm:p-5 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-col items-center justify-center text-center">
                      <div className="text-[10px] sm:text-xs font-bold tracking-widest text-[#5e5e5e] dark:text-[#9aa0a6] uppercase mb-0.5 flex items-center justify-center gap-1">
                        <FileCode className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                        <span>Questions</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                        {detailedTest.questions?.length ?? detailedTest.questionCount ?? 0}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-col items-center justify-center text-center">
                      <div className="text-[10px] sm:text-xs font-bold tracking-widest text-[#5e5e5e] dark:text-[#9aa0a6] uppercase mb-0.5 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Time</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                        {detailedTest.timeLimitMinutes > 0 ? `${detailedTest.timeLimitMinutes}:00` : 'Untimed'}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex flex-col items-center justify-center text-center">
                      <div className="text-[10px] sm:text-xs font-bold tracking-widest text-[#5e5e5e] dark:text-[#9aa0a6] uppercase mb-0.5 flex items-center justify-center gap-1">
                        <Award className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                        <span>Total Attempts</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] font-mono mt-0.5">
                        {(() => {
                          const safeKey = (detailedTest.id || '').replace(/[./[\]*~#$]/g, '_');
                          const allHistories = (Object.values(userProfile?.testHistories || {}) as (TestHistoryEntry | undefined)[]) || [];
                          const cloudHist = userProfile?.testHistories?.[safeKey] ||
                            allHistories.find((e): e is TestHistoryEntry => {
                              if (!e) return false;
                              return e.testId === detailedTest.id || Boolean(e.testTitle && detailedTest.title && e.testTitle.trim().toLowerCase() === detailedTest.title.trim().toLowerCase());
                            }) || null;
                          return Math.max(cloudHist?.attemptCount || 0, getTestAttempts(detailedTest).length);
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Attempt History Section */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                        <TrendingUp className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                        <span>Attempt History & Metrics</span>
                      </div>
                    </div>

                    {(() => {
                      const testAttempts = getTestAttempts(detailedTest);
                      const safeTestKey = (detailedTest.id || '').replace(/[./[\]*~#$]/g, '_');
                      const allHistories = (Object.values(userProfile?.testHistories || {}) as (TestHistoryEntry | undefined)[]) || [];
                      const cloudHistory = userProfile?.testHistories?.[safeTestKey] ||
                        allHistories.find((e): e is TestHistoryEntry => {
                          if (!e) return false;
                          return e.testId === detailedTest.id || Boolean(e.testTitle && detailedTest.title && e.testTitle.trim().toLowerCase() === detailedTest.title.trim().toLowerCase());
                        }) || null;

                      const recordedAttemptCount = Math.max(cloudHistory?.attemptCount || 0, testAttempts.length);
                      const first = testAttempts.length > 0 ? testAttempts[0] : (cloudHistory?.firstAttempt || null);
                      const rawLast = testAttempts.length > 1
                        ? testAttempts[testAttempts.length - 1]
                        : (cloudHistory?.lastAttempt || null);
                      const hasMultipleAttempts = Boolean(
                        first && rawLast && first.id !== rawLast.id && recordedAttemptCount > 1
                      );
                      const last = hasMultipleAttempts ? rawLast : null;

                      if (!first && !last && testAttempts.length === 0) {
                        return (
                          <div className="p-6 sm:p-8 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] text-center space-y-2.5">
                            <div className="w-12 h-12 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center mx-auto border-0">
                              <BookOpen className="w-5 h-5 stroke-[2.2]" />
                            </div>
                            <h4 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                              You haven't attempted this test yet
                            </h4>
                            <p className="text-xs text-[#5e5e5e] dark:text-[#9aa0a6] font-normal max-w-md mx-auto leading-relaxed">
                              Start your first attempt to record baseline accuracy metrics, review detailed step-by-step solutions, and track performance!
                            </p>
                          </div>
                        );
                      }

                      const formatDateTime = (dateStr?: string) => {
                        if (!dateStr) return 'Recent attempt';
                        try {
                          const d = new Date(dateStr);
                          if (isNaN(d.getTime())) return 'Recent attempt';
                          const m = d.getMonth() + 1;
                          const day = d.getDate();
                          const yr = d.getFullYear();
                          const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          return `${m}/${day}/${yr} • ${time}`;
                        } catch {
                          return 'Recent attempt';
                        }
                      };

                      const renderAttemptCard = (attempt: TestAttempt, label: string) => {
                        const answersList = Object.values(attempt.answers || {}) as { 
                          selectedOption?: string; 
                          isCorrect?: boolean; 
                        }[];

                        const totalQs = detailedTest.questions?.length || detailedTest.questionCount || answersList.length || 10;
                        const correctCount = answersList.filter(a => a.isCorrect).length || Math.round((attempt.score / (attempt.totalPoints || 1)) * totalQs);
                        const answeredCount = answersList.filter(a => a.selectedOption && a.selectedOption.trim() !== '').length || correctCount;
                        const precision = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 100;
                        const isOmr = isAttemptOmrMode(attempt);
                        const modeLabel = isOmr ? 'OMR' : 'Online';

                        return (
                          <div 
                            key={label}
                            className="p-4 sm:p-5 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3 transition-all flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold tracking-widest text-[#5e5e5e] dark:text-[#9aa0a6] uppercase truncate flex-1 min-w-0">
                                  {label}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-[28px] text-[10.5px] font-bold tracking-wider uppercase border-0 outline-none shadow-none shrink-0 ${
                                  isOmr
                                    ? 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0]'
                                    : 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]'
                                }`}>
                                  {modeLabel}
                                </span>
                              </div>

                              <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl sm:text-3xl font-black font-mono text-[#1f1f1f] dark:text-[#e3e3e3]">
                                  {attempt.percentage}%
                                </span>
                                <span className="px-2.5 py-0.5 rounded-[28px] text-[11px] font-semibold bg-transparent text-[#5e5e5e] dark:text-[#9aa0a6] border-0">
                                  {precision}% precision
                                </span>
                              </div>

                              <div className="text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                                Correct Answers: <strong className="font-bold">{correctCount}</strong> / {totalQs} Questions
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] pt-1">
                                <div>
                                  Answered: <strong className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{answeredCount}/{totalQs}</strong>
                                </div>
                                <div className="px-2.5 py-0.5 rounded-[28px] bg-transparent text-[#5e5e5e] dark:text-[#9aa0a6] font-mono text-[11px] font-semibold border-0">
                                  {formatDateTime(attempt.completedAt || attempt.createdAt)}
                                </div>
                              </div>
                            </div>

                            {onViewAttemptResult && (
                              <button
                                id={`view-attempt-btn-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                                onClick={() => {
                                  setDetailedTest(null);
                                  onViewAttemptResult(attempt);
                                }}
                                className="w-full mt-2 py-2.5 px-4 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/30 dark:border-[#a8c7fa]/30 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_2px_6px_rgba(0,0,0,0.05)] cursor-pointer active:scale-98"
                              >
                                <Search className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                                <span>View Solutions & Attempt Details</span>
                              </button>
                            )}
                          </div>
                        );
                      };

                      if (!last) {
                        return (
                          <div className="grid grid-cols-1 gap-2.5 sm:gap-3.5">
                            {first && renderAttemptCard(first, 'FIRST ATTEMPT')}
                          </div>
                        );
                      }

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5">
                          {first && renderAttemptCard(first, 'FIRST ATTEMPT')}
                          {last && renderAttemptCard(last, 'LAST ATTEMPT')}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Full-View Footer Bar - Seamless in Body Color */}
                <div className="p-4 sm:p-5 bg-transparent dark:bg-transparent border-0 flex items-center justify-end px-4 sm:px-6 shrink-0">
                  <div className="flex flex-row items-center gap-2.5 sm:gap-3 w-full sm:w-auto justify-end">
                    {onStartOmrTest && (
                      <button
                        type="button"
                        id="fullview-footer-omr-test-btn"
                        onClick={() => {
                          const t = detailedTest;
                          setDetailedTest(null);
                          onStartOmrTest(t);
                        }}
                        className={`${APP_STYLES.button.secondary} flex-1 sm:flex-initial justify-center whitespace-nowrap`}
                      >
                        <FileCheck2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                        <span className="truncate">Attempt OMR Mode</span>
                      </button>
                    )}
                    <button
                      type="button"
                      id="fullview-footer-start-test-btn"
                      onClick={() => {
                        const t = detailedTest;
                        setDetailedTest(null);
                        onStartTest(t, 'timed');
                      }}
                      style={{ backgroundColor: '#0b57d0' }}
                      className={`${APP_STYLES.button.primary} !bg-[#0b57d0] hover:!bg-[#0842a0] active:!bg-[#063380] dark:!bg-[#0b57d0] dark:hover:!bg-[#0842a0] flex-1 sm:flex-initial justify-center whitespace-nowrap`}
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span className="truncate">Start Online Test</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
