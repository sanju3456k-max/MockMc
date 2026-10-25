import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithGoogle, 
  signOutUser, 
  saveTestToFirestore, 
  deleteTestFromFirestore, 
  unmarkDeletedTestInFirestore,
  syncUserProfile,
  checkRedirectResult,
  auth,
  resetGlobalQuotaExceeded,
  checkAndResetQuotaOnNewDay,
  syncStatsRollupToFirestore,
  syncTestHistoriesToFirestore,
  fetchTestsFromFirestore,
  fetchUserAttemptsFromFirestore
} from './lib/firebase';
import { syncHub } from './lib/syncEngine';
import { smartCoordinator } from './lib/smartLocalCoordinator';
import { optimizeTestForFirestore } from './lib/imageOptimization';
import { clearAllNotesFromIDB } from './lib/idbNotes';
import type { User } from 'firebase/auth';
import { normalizeQuestions, type ActiveTab, type MathTest, type TestAttempt, type ActiveTestSession, type UserProfile, type TestHistoryEntry } from './types';
import { triggerBlobDownload } from './lib/omrPrintDownload';
import { Bot, Sparkles, Share2, Play, X } from 'lucide-react';
import { decodeTestFromShareUrl } from './utils/shareUtils';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from './lib/animationConfig';
import { SAMPLE_MATH_TESTS } from './data/sampleTests';
import {
  loadScopedTests,
  saveScopedTests,
  getScopedStorageKeys,
  markTestAsDeletedInScopedStorage,
  unmarkTestAsDeletedInScopedStorage,
  loadScopedAttempts,
  saveScopedAttempts,
  pruneAttemptsToFirstAndLast,
  isAttemptOmrMode,
  loadScopedActiveSession,
  loadAllScopedActiveSessions,
  saveScopedActiveSession,
  clearScopedActiveSession,
  getCachedAuthUser,
  setCachedAuthUser,
  migrateGuestDataToUserAccount,
  loadFullTestOnDemand,
  getAllDeletedTestIds,
  type CachedAuthUser
} from './lib/storage';

// Subcomponents
import { Navbar } from './components/Navbar';
import { TestList } from './components/TestList';
import { TestRunner } from './components/TestRunner';
import { TestResultView } from './components/TestResultView';
import { TestEditor } from './components/TestEditor';
import { CustomTestBuilder } from './components/CustomTestBuilder';
import { OmrExamStudio } from './components/OmrExamStudio';
import { PerformanceAnalytics } from './components/PerformanceAnalytics';
import { ResumeTestModal } from './components/ResumeTestModal';
import { GeminiChatbotView } from './components/GeminiChatbotView';
import { NotesStudio } from './components/notesStudio/NotesStudio';
import { BulkPrintStudio } from './components/BulkPrintStudio';
import { SettingsModal } from './components/SettingsModal';
import { useUIScale } from './hooks/useUIScale';
import { useViewHistory, useBackHandler } from './hooks/useBackNavigation';
import { forceUnlockAllScrollLocks } from './hooks/useScrollLock';

const LOCAL_STORAGE_THEME_KEY = 'math_mock_theme_v1';

function areTestsEqual(a: MathTest[], b: MathTest[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const bMap = new Map<string, MathTest>();
  for (let i = 0; i < b.length; i++) {
    const item = b[i];
    if (item && item.id) {
      bMap.set(item.id, item);
    }
  }
  if (bMap.size !== a.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    if (!itemA || !itemA.id) return false;
    const itemB = bMap.get(itemA.id);
    if (!itemB) return false;
    if (itemA.updatedAt !== itemB.updatedAt || itemA.title !== itemB.title || itemA.questions?.length !== itemB.questions?.length) {
      return false;
    }
  }
  return true;
}

function areAttemptsEqual(a: TestAttempt[], b: TestAttempt[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const bMap = new Map<string, TestAttempt>();
  for (let i = 0; i < b.length; i++) {
    const item = b[i];
    if (item && item.id) {
      bMap.set(item.id, item);
    }
  }
  if (bMap.size !== a.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    if (!itemA || !itemA.id) return false;
    const itemB = bMap.get(itemA.id);
    if (!itemB) return false;
    const timeA = itemA.completedAt || itemA.createdAt;
    const timeB = itemB.completedAt || itemB.createdAt;
    if (timeA !== timeB || itemA.score !== itemB.score) {
      return false;
    }
  }
  return true;
}

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>('tests');
  const [tabHistory, setTabHistory] = useState<ActiveTab[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [chatbotInitialPrompt, setChatbotInitialPrompt] = useState<string | null>(null);

  const setActiveTab = useCallback((newTab: ActiveTab | ((prev: ActiveTab) => ActiveTab)) => {
    setActiveTabState((prev) => {
      const resolvedTab = typeof newTab === 'function' ? newTab(prev) : newTab;
      if (prev !== resolvedTab) {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          if (document.documentElement) document.documentElement.scrollTop = 0;
          if (document.body) document.body.scrollTop = 0;
        }
        setTimeout(() => {
          setTabHistory((history) => {
            if (history[history.length - 1] === prev) return history;
            return [...history, prev];
          });
        }, 0);
      }
      return resolvedTab;
    });
  }, []);

  const goBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    setTabHistory((history) => {
      if (history.length === 0) {
        setTimeout(() => setActiveTabState('tests'), 0);
        return [];
      }
      const newHistory = [...history];
      const previous = newHistory.pop()!;
      setTimeout(() => setActiveTabState(previous), 0);
      return newHistory;
    });
  }, []);

  const [returnTabAfterResults, setReturnTabAfterResults] = useState<ActiveTab>('tests');
  const [omrInitialTab, setOmrInitialTab] = useState<'print' | 'scan' | 'keys' | 'review'>('print');

  // Instant synchronous auth hydration from local cache to prevent awakening/flickering effect
  const [cachedUser, setCachedUser] = useState<CachedAuthUser | null>(() => getCachedAuthUser());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // Pagination for attempt history (on-demand loading)
  const [attemptsLimit, setAttemptsLimit] = useState<number>(30);
  const [hasMoreAttempts, setHasMoreAttempts] = useState<boolean>(false);
  const [isLoadingMoreAttempts, setIsLoadingMoreAttempts] = useState<boolean>(false);

  // Pagination for test library (on-demand loading)
  const [testsLimit, setTestsLimit] = useState<number>(40);
  const [hasMoreTests, setHasMoreTests] = useState<boolean>(false);
  const [isLoadingMoreTests, setIsLoadingMoreTests] = useState<boolean>(false);

  // Shared test link import confirmation state
  const [pendingImportedTest, setPendingImportedTest] = useState<MathTest | null>(null);

  // Detect share test parameter in URL on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shareParam = urlParams.get('shareTest') || urlParams.get('importTest');
      const hashMatch = window.location.hash.match(/shareTest=([^&]+)/);
      const shortHashMatch = window.location.hash.match(/s=([^&]+)/);
      const shortQueryMatch = urlParams.get('s');
      const shortId = shortQueryMatch || (shortHashMatch ? shortHashMatch[1] : null);

      if (shortId) {
        fetch(`/api/share/${encodeURIComponent(shortId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.title && Array.isArray(data.questions)) {
              setPendingImportedTest({
                id: `shared_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                title: String(data.title),
                description: data.description || 'Shared Practice Assessment',
                topic: data.topic || 'General Mathematics',
                timeLimitMinutes: typeof data.timeLimitMinutes === 'number' ? data.timeLimitMinutes : (data.time || 15),
                passingScorePercentage: typeof data.passingScorePercentage === 'number' ? data.passingScorePercentage : 60,
                questions: data.questions,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isPublic: true,
              });
            }
          })
          .catch(() => {});
      } else {
        const rawParam = shareParam || (hashMatch ? hashMatch[1] : null);
        if (rawParam) {
          const decodedTest = decodeTestFromShareUrl(rawParam);
          if (decodedTest) {
            setPendingImportedTest(decodedTest);
          }
        }
      }
    } catch (err) {
      console.warn('Error checking share test parameter:', err);
    }
  }, []);

  // Track the previous user UID and currently loaded data scope to safely switch scoped storage on auth transitions
  const initialUid = getCachedAuthUser()?.uid || null;
  const prevUserIdRef = useRef<string | null | undefined>(initialUid);
  const loadedUserIdRef = useRef<string | null>(initialUid);
  const hasMigratedUserUidRef = useRef<string | null>(null);
  const hasCalculatedRollupRef = useRef(false);

  // System navigation back gestures and browser history tracking across all devices
  const { navigateBack } = useViewHistory<ActiveTab>(activeTab, setActiveTab, 'tests');

  // Guarantee clean scroll behavior and instant scroll refresh across all top-level tab transitions
  useEffect(() => {
    forceUnlockAllScrollLocks();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [activeTab]);

  // UI Scale & Font Resolution management
  const { 
    scaleConfig, 
    updateScaleConfig, 
    resetToDefaults, 
    scale: uiScale, 
    setScale: setUiScale 
  } = useUIScale();
  
  // Theme state (Dark / Light)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
      if (savedTheme) return savedTheme === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem(LOCAL_STORAGE_THEME_KEY, 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem(LOCAL_STORAGE_THEME_KEY, 'light');
      }
      window.dispatchEvent(new Event('theme-changed'));

      // Dynamically update status bar theme-color to match app page header background exactly
      // Gemini Chatbot header: #ffffff (light) / #131314 (dark)
      // Note Studio header: #ffffff (light) / #0b0c10 (dark)
      // All other page headers: #e5e9f0 (light) / #0b0c10 (dark)
      let statusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
      if (activeTab === 'chatbot') {
        statusBarColor = isDarkMode ? '#131314' : '#ffffff';
      } else if (activeTab === 'html-notes' || activeTab === 'notes-repository') {
        statusBarColor = isDarkMode ? '#0b0c10' : '#ffffff';
      } else {
        statusBarColor = isDarkMode ? '#0b0c10' : '#e5e9f0';
      }

      const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
      if (metaThemeColors.length > 0) {
        metaThemeColors.forEach((el) => {
          el.removeAttribute('media');
          el.setAttribute('content', statusBarColor);
        });
      } else {
        const newMeta = document.createElement('meta');
        newMeta.name = 'theme-color';
        newMeta.content = statusBarColor;
        document.head.appendChild(newMeta);
      }

      // Update iOS status bar appearance
      const appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (appleStatusBar) {
        appleStatusBar.setAttribute('content', isDarkMode ? 'black-translucent' : 'default');
      }
    } catch (e) {
      console.warn('Theme storage and status bar sync error:', e);
    }
  }, [isDarkMode, activeTab]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  // Synchronize theme when theme-changed event is dispatched from subcomponents
  useEffect(() => {
    const handleThemeChanged = () => {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
        if (saved === 'dark') setIsDarkMode(true);
        else if (saved === 'light') setIsDarkMode(false);
        else if (typeof document !== 'undefined') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      } catch (e) {}
    };
    window.addEventListener('theme-changed', handleThemeChanged);
    return () => window.removeEventListener('theme-changed', handleThemeChanged);
  }, []);
  
  // Scoped app data state (isolated between guest local mode & individual user accounts)
  // Hydrates immediately with the active account's dataset on frame 0
  const [tests, setTests] = useState<MathTest[]>(() => {
    const initialUser = getCachedAuthUser();
    return loadScopedTests(initialUser?.uid);
  });
  const [attempts, setAttempts] = useState<TestAttempt[]>(() => {
    const initialUser = getCachedAuthUser();
    return loadScopedAttempts(initialUser?.uid);
  });

  const lastSavedTestsRef = useRef<MathTest[]>(tests);
  const lastSavedAttemptsRef = useRef<TestAttempt[]>(attempts);

  // Active session state for taking or reviewing tests
  const [activeSessionsMap, setActiveSessionsMap] = useState<Record<string, ActiveTestSession>>(() => {
    const initialUser = getCachedAuthUser();
    return loadAllScopedActiveSessions(initialUser?.uid);
  });
  const [activeTestSession, setActiveTestSession] = useState<ActiveTestSession | null>(() => {
    const initialUser = getCachedAuthUser();
    return loadScopedActiveSession(initialUser?.uid);
  });
  const [resumedSession, setResumedSession] = useState<ActiveTestSession | null>(null);
  const [pendingStartTest, setPendingStartTest] = useState<{ test: MathTest; mode: 'timed' | 'practice' } | null>(null);
  const [showResumeModal, setShowResumeModal] = useState<boolean>(false);

  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentTest, setCurrentTest] = useState<MathTest | null>(null);
  const [testMode, setTestMode] = useState<'timed' | 'practice'>('timed');
  const [editingTest, setEditingTest] = useState<MathTest | null>(null);
  const [editorAiPromptOpen, setEditorAiPromptOpen] = useState<boolean>(false);
  const [lastAttempt, setLastAttempt] = useState<TestAttempt | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isFirestoreQuotaExceeded, setIsFirestoreQuotaExceeded] = useState<boolean>(false);
  const [hasDismissedQuotaBanner, setHasDismissedQuotaBanner] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('firebase_quota_banner_dismissed_session') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismissQuotaBanner = useCallback(() => {
    setHasDismissedQuotaBanner(true);
    try {
      sessionStorage.setItem('firebase_quota_banner_dismissed_session', 'true');
    } catch {}
  }, []);

  // Show temporary toast notification
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  // Listen for automatic URL Deep-Links from Official Gemini App or Shared Test links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importParam = params.get('importJson') || params.get('importData') || params.get('importCode');

    if (importParam) {
      try {
        const decoded = decodeURIComponent(importParam);
        const parsed = JSON.parse(decoded);
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          const deepTest: MathTest = {
            ...parsed,
            id: parsed.id || `gemini_link_${Date.now()}`,
            title: parsed.title || 'Imported Gemini Test',
            description: parsed.description || 'Test imported from Official Gemini Chat',
            topic: parsed.topic || 'General Math',
            difficulty: parsed.difficulty || 'Medium',
            timeLimitMinutes: parsed.timeLimitMinutes || 15,
            passingScorePercentage: parsed.passingScorePercentage || 60,
            questions: parsed.questions,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setTests((prev) => {
            const exists = prev.some((t) => t.id === deepTest.id);
            return exists ? prev : [deepTest, ...prev];
          });
          showToast(`Imported test "${deepTest.title}" from Gemini URL!`, 'success');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        console.warn('Deep link import parsing error:', err);
      }
    }
  }, [showToast]);

  // Save to account-scoped storage whenever tests change (only if they correspond to the currently active loaded user scope)
  useEffect(() => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    if (loadedUserIdRef.current === targetUid) {
      if (areTestsEqual(lastSavedTestsRef.current, tests)) return;
      lastSavedTestsRef.current = tests;
      saveScopedTests(targetUid, tests);
    }
  }, [tests, currentUser?.uid, cachedUser?.uid]);

  // Save to account-scoped storage whenever attempts change (only if they correspond to the currently active loaded user scope)
  useEffect(() => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    if (loadedUserIdRef.current === targetUid) {
      if (areAttemptsEqual(lastSavedAttemptsRef.current, attempts)) return;
      lastSavedAttemptsRef.current = attempts;
      saveScopedAttempts(targetUid, attempts);
    }
  }, [attempts, currentUser?.uid, cachedUser?.uid]);

  // Handle account switching / login / logout state isolation
  useEffect(() => {
    const currentUid = currentUser?.uid || cachedUser?.uid || null;

    // Only switch data if account state actually transitioned
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentUid) {
      // Reload tests and attempts from the newly active scope
      const scopedTests = loadScopedTests(currentUid);
      const scopedAttempts = loadScopedAttempts(currentUid);
      const scopedSessions = loadAllScopedActiveSessions(currentUid);
      lastSavedTestsRef.current = scopedTests;
      lastSavedAttemptsRef.current = scopedAttempts;
      setTests(scopedTests);
      setAttempts(scopedAttempts);
      setActiveSessionsMap(scopedSessions);
      setActiveTestSession(loadScopedActiveSession(currentUid));
      loadedUserIdRef.current = currentUid;
    }
    prevUserIdRef.current = currentUid;
  }, [currentUser?.uid, cachedUser?.uid]);

  // Reusable callback to process a newly authenticated user account and migrate any offline guest work
  const handleUserAuthenticated = useCallback((user: User) => {
    setCurrentUser(user);
    const cachePayload: CachedAuthUser = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };
    setCachedUser(cachePayload);
    setCachedAuthUser(cachePayload);
    setIsAuthLoading(false);

    // 1. Perform guest-to-user scoped local migration of tests and attempts (only once per session)
    if (hasMigratedUserUidRef.current === user.uid) {
      return;
    }
    hasMigratedUserUidRef.current = user.uid;

    const { migratedTests, migratedAttempts } = migrateGuestDataToUserAccount(
      user.uid,
      user.displayName,
      user.email
    );

    // 2. Feed migrated records directly into state locally (ZERO network writes)
    if (migratedTests.length > 0) {
      setTests((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const added = migratedTests.filter((t) => !seen.has(t.id));
        return [...added, ...prev];
      });
    }

    if (migratedAttempts.length > 0) {
      setAttempts((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const added = migratedAttempts.filter((a) => !seen.has(a.id));
        const combined = [...added, ...prev];
        combined.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
        return combined;
      });
    }

    // 3. Register or merge user profile stats in Firestore background
    syncUserProfile(user).catch((err) => {
      console.warn('Background sync user profile warning:', err);
    });

    // 4. Ensure app-initial-splash placeholder is removed if present
    const splashEl = document.getElementById('app-initial-splash');
    if (splashEl && splashEl.parentNode) {
      splashEl.parentNode.removeChild(splashEl);
    }
  }, []);

  // Firebase Auth Listener & Mobile Redirect Result Check
  useEffect(() => {
    checkRedirectResult().then((user) => {
      if (user) {
        handleUserAuthenticated(user);
        showToast(`Signed in as ${user.displayName || user.email}. Cloud sync enabled.`, 'success');
      }
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          handleUserAuthenticated(user);
          syncHub.startSyncHub(user.uid);
          smartCoordinator.flushWriteQueue().catch(() => {});
        } else {
          setCurrentUser(null);
          setCachedUser(null);
          setCachedAuthUser(null);
          setUserProfile(null);
          syncHub.stopSyncHub();
          const guestTests = loadScopedTests(null);
          const guestAttempts = loadScopedAttempts(null);
          const guestSessions = loadAllScopedActiveSessions(null);
          setTests(guestTests);
          setAttempts(guestAttempts);
          setActiveSessionsMap(guestSessions);
          setActiveTestSession(loadScopedActiveSession(null));
          loadedUserIdRef.current = null;
          prevUserIdRef.current = null;
        }
        setIsAuthLoading(false);
      },
      (error) => {
        console.warn('Firebase Auth state change error:', error);
        setIsAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, [showToast, handleUserAuthenticated]);

  // Global listener for firestore quota limit exhaustion
  useEffect(() => {
    const handleQuotaExceeded = () => {
      setIsFirestoreQuotaExceeded(true);
    };
    window.addEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  // Periodic timer to automatically detect a new calendar day and reset daily quota states
  useEffect(() => {
    const interval = setInterval(() => {
      const didReset = checkAndResetQuotaOnNewDay();
      if (didReset) {
        setIsFirestoreQuotaExceeded(false);
        setHasDismissedQuotaBanner(false);
        try {
          sessionStorage.removeItem('firebase_quota_banner_dismissed_session');
        } catch {}
        smartCoordinator.flushWriteQueue();
        if (currentUser?.uid) {
          syncHub.startSyncHub(currentUser.uid);
        }
        showToast('A new day has started! Resetting daily database limits. Resuming cloud synchronization.', 'success');
      }
    }, 60000); // Check once per minute
    return () => clearInterval(interval);
  }, [showToast, currentUser?.uid]);

  // 0. Single-Bus Reactive Data Subscriptions (Tests, Attempts, Preferences)
  useEffect(() => {
    const unsubTests = syncHub.subscribe('tests', (testsList) => {
      if (Array.isArray(testsList)) {
        setTests((prev) => {
          if (areTestsEqual(prev, testsList)) return prev;
          lastSavedTestsRef.current = testsList;
          return testsList;
        });
      }
    });
    const unsubAttempts = syncHub.subscribe('attempts', (attemptsList) => {
      if (Array.isArray(attemptsList)) {
        setAttempts((prev) => {
          if (areAttemptsEqual(prev, attemptsList)) return prev;
          lastSavedAttemptsRef.current = attemptsList;
          return attemptsList;
        });
      }
    });
    const unsubPref = syncHub.subscribe('preferences', (prof) => {
      if (prof) {
        setUserProfile(prof);
      }
    });
    return () => {
      unsubTests();
      unsubAttempts();
      unsubPref();
    };
  }, []);

  // Listen for IndexedDB background hydration and updates to ensure UI displays all data
  useEffect(() => {
    const handleStorageHydrated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeUid = currentUser?.uid || cachedUser?.uid || null;
      const eventUid = customEvent?.detail?.userId;
      if (eventUid === undefined || eventUid === activeUid) {
        const loadedTests = loadScopedTests(activeUid);
        setTests((prev) => {
          if (areTestsEqual(prev, loadedTests)) return prev;
          lastSavedTestsRef.current = loadedTests;
          return loadedTests;
        });

        const loadedAttempts = loadScopedAttempts(activeUid);
        setAttempts((prev) => {
          if (areAttemptsEqual(prev, loadedAttempts)) return prev;
          lastSavedAttemptsRef.current = loadedAttempts;
          return loadedAttempts;
        });

        setActiveSessionsMap(loadAllScopedActiveSessions(activeUid));
      }
    };

    const handleTestsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail?.source === 'saveScopedTests') return;
      const activeUid = currentUser?.uid || cachedUser?.uid || null;
      const eventUid = customEvent?.detail?.userId;
      if (eventUid === undefined || eventUid === activeUid) {
        const loaded = loadScopedTests(activeUid);
        setTests((prev) => {
          if (areTestsEqual(prev, loaded)) return prev;
          lastSavedTestsRef.current = loaded;
          return loaded;
        });
      }
    };

    const handleAttemptsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail?.source === 'saveScopedAttempts') return;
      const activeUid = currentUser?.uid || cachedUser?.uid || null;
      const eventUid = customEvent?.detail?.userId;
      if (eventUid === undefined || eventUid === activeUid) {
        const loaded = loadScopedAttempts(activeUid);
        setAttempts((prev) => {
          if (areAttemptsEqual(prev, loaded)) return prev;
          lastSavedAttemptsRef.current = loaded;
          return loaded;
        });
      }
    };

    window.addEventListener('app-storage-hydrated', handleStorageHydrated);
    window.addEventListener('tests-updated', handleTestsUpdated);
    window.addEventListener('attempts-updated', handleAttemptsUpdated);

    return () => {
      window.removeEventListener('app-storage-hydrated', handleStorageHydrated);
      window.removeEventListener('tests-updated', handleTestsUpdated);
      window.removeEventListener('attempts-updated', handleAttemptsUpdated);
    };
  }, [currentUser?.uid, cachedUser?.uid]);

  // Reset scroll position to top whenever active tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  const deletedIdsHash = (userProfile?.deletedTestIds || []).join(',');

  // 1. Tests Catalog Synchronization (Non-destructive through SmartLocalCoordinator)
  const refreshTestsCatalog = useCallback(async (limitCount = testsLimit, force = false) => {
    const activeUid = currentUser?.uid || cachedUser?.uid || null;
    const deletedIds = getAllDeletedTestIds(activeUid);
    if (userProfile?.deletedTestIds && Array.isArray(userProfile.deletedTestIds)) {
      const currentLocalTests = loadScopedTests(activeUid);
      const activeOrPendingIds = new Set(
        currentLocalTests
          .filter((t) => t && (t._syncStatus === 'pending' || smartCoordinator.isPending('tests', t.id)))
          .map((t) => t.id)
      );

      userProfile.deletedTestIds.forEach((id) => {
        if (id && !activeOrPendingIds.has(id)) {
          deletedIds.add(id);
          markTestAsDeletedInScopedStorage(activeUid, id);
        }
      });
    }

    try {
      const cloudTests = await fetchTestsFromFirestore(limitCount, force);
      setHasMoreTests(cloudTests.length >= limitCount);
      const reconciled = smartCoordinator.reconcileTests(activeUid, cloudTests, deletedIds);
      setTests((prev) => (areTestsEqual(prev, reconciled) ? prev : reconciled));
    } catch (err) {
      console.warn('Could not fetch cloud tests:', err);
    }
  }, [currentUser?.uid, cachedUser?.uid, deletedIdsHash, testsLimit]);

  // 2. Attempts History Synchronization (Non-destructive through SmartLocalCoordinator)
  const refreshAttemptsHistory = useCallback(async (limitCount = attemptsLimit, force = false) => {
    const activeUid = currentUser?.uid;
    if (!activeUid || isFirestoreQuotaExceeded) return;

    try {
      const cloudAttempts = await fetchUserAttemptsFromFirestore(activeUid, limitCount, force);
      setHasMoreAttempts(cloudAttempts.length >= limitCount);
      const reconciled = smartCoordinator.reconcileAttempts(activeUid, cloudAttempts);
      setAttempts((prev) => (areAttemptsEqual(prev, reconciled) ? prev : reconciled));
    } catch (err) {
      console.warn('Could not fetch cloud attempts:', err);
    }
  }, [currentUser?.uid, isFirestoreQuotaExceeded, attemptsLimit]);

  // Reset pagination limit when authenticated user switches and flush coordinator outbox queue
  useEffect(() => {
    setAttemptsLimit(30);
    setTestsLimit(40);
    if (currentUser?.uid) {
      smartCoordinator.flushWriteQueue().catch(() => {});
    }
  }, [currentUser?.uid]);

  // Flush any queued outbox writes when network returns or component boots
  useEffect(() => {
    smartCoordinator.flushWriteQueue().catch(() => {});
  }, []);

  // Real-time synchronization of First & Latest attempts from userProfile.testHistories across devices (0 reads from attempts collection!)
  const testHistoriesHash = ((): string => {
    if (!userProfile?.testHistories) return '';
    try {
      const keys = Object.keys(userProfile.testHistories).sort();
      return keys.map((k) => {
        const entry = userProfile.testHistories[k];
        return `${k}:${entry?.firstAttempt?.id || ''}:${entry?.lastAttempt?.id || ''}:${entry?.lastAttempt?.score ?? ''}`;
      }).join('|');
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (!currentUser?.uid || !userProfile?.testHistories) return;
    const activeUid = currentUser.uid;

    const crossSynced: TestAttempt[] = [];
    ((Object.values(userProfile.testHistories) as (TestHistoryEntry | undefined)[]) || []).forEach((entry) => {
      if (!entry) return;
      if (entry.firstAttempt) crossSynced.push(entry.firstAttempt);
      if (entry.lastAttempt && entry.lastAttempt.id !== entry.firstAttempt?.id) {
        crossSynced.push(entry.lastAttempt);
      }
    });

    if (crossSynced.length === 0) return;

    setAttempts((prev) => {
      const prevMap = new Map<string, TestAttempt>(prev.map((a) => [a.id, a]));
      let hasChange = false;
      for (const a of crossSynced) {
        if (!a || !a.id) continue;
        const existing = prevMap.get(a.id);
        if (!existing || existing.completedAt !== a.completedAt || existing.score !== a.score) {
          hasChange = true;
          break;
        }
      }
      if (!hasChange) return prev;

      const seen = new Map<string, TestAttempt>();
      // Preserve existing attempts
      prev.forEach((a) => {
        if (a && a.id) seen.set(a.id, a);
      });
      // Add or update with cross-synced first and latest attempts
      crossSynced.forEach((a) => {
        if (a && a.id) seen.set(a.id, a);
      });
      const merged = Array.from(seen.values());
      merged.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
      lastSavedAttemptsRef.current = merged;
      setTimeout(() => {
        saveScopedAttempts(activeUid, merged);
      }, 0);
      return merged;
    });
  }, [currentUser?.uid, testHistoriesHash]);

  const handleLoadMoreAttempts = useCallback(async () => {
    setIsLoadingMoreAttempts(true);
    try {
      const nextLimit = attemptsLimit + 10;
      setAttemptsLimit(nextLimit);
      await refreshAttemptsHistory(nextLimit, true);
    } finally {
      setIsLoadingMoreAttempts(false);
    }
  }, [attemptsLimit, refreshAttemptsHistory]);

  const handleLoadMoreTests = useCallback(async () => {
    setIsLoadingMoreTests(true);
    try {
      const nextLimit = testsLimit + 10;
      setTestsLimit(nextLimit);
      await refreshTestsCatalog(nextLimit, true);
    } finally {
      setIsLoadingMoreTests(false);
    }
  }, [testsLimit, refreshTestsCatalog]);

  // Auth Action Handlers
  const handleSignIn = async () => {
    if (isAuthLoading) return;
    setIsAuthLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        setCurrentUser(user);
        const cachePayload: CachedAuthUser = {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
        };
        setCachedUser(cachePayload);
        setCachedAuthUser(cachePayload);
        showToast(`Signed in as ${user.displayName || user.email}!`, 'success');
      }
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = (err?.message || '').toLowerCase();
      if (
        errCode !== 'auth/popup-closed-by-user' &&
        errCode !== 'auth/cancelled-popup-request' &&
        !errMsg.includes('cancelled-popup-request') &&
        !errMsg.includes('closed-by-user')
      ) {
        showToast(err?.message || 'Google sign-in failed. Please try again.', 'error');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      await clearAllNotesFromIDB();
      syncHub.stopSyncHub();
      setCurrentUser(null);
      setCachedUser(null);
      setCachedAuthUser(null);
      setUserProfile(null);

      // Explicitly reload state strictly from guest scope
      const guestTests = loadScopedTests(null);
      const guestAttempts = loadScopedAttempts(null);
      const guestSessions = loadAllScopedActiveSessions(null);
      setTests(guestTests);
      setAttempts(guestAttempts);
      setActiveSessionsMap(guestSessions);
      setActiveTestSession(loadScopedActiveSession(null));
      setEditingTest(null);
      setCurrentTest(null);
      loadedUserIdRef.current = null;
      prevUserIdRef.current = null;

      showToast('Signed out successfully. Switched to local device storage.', 'info');
    } catch (err: any) {
      showToast('Error signing out', 'error');
    }
  };

  // Test Runner Handlers
  const handleStartTest = async (test: MathTest, mode: 'timed' | 'practice') => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const fullTest = (test.questions && test.questions.length > 0)
      ? test
      : (await loadFullTestOnDemand(test.id, tests, targetUid)) || test;

    const existingSession = loadScopedActiveSession(targetUid, fullTest.id);

    // Verify if this session is truly an unfinished in-progress session with actual progress
    const hasAnswers = existingSession && existingSession.answers && Object.values(existingSession.answers).some((a) => a && a.selectedOption && a.selectedOption.trim() !== '');
    const hasMeaningfulTime = existingSession && (existingSession.elapsedTime || 0) > 5;
    const isValidInProgressSession = Boolean(
      existingSession && 
      existingSession.testId === fullTest.id && 
      existingSession.hasStarted && 
      (hasAnswers || hasMeaningfulTime)
    );

    // ONLY prompt resume if there is a real unfinished in-progress session for THIS EXACT TEST
    if (isValidInProgressSession && existingSession) {
      setActiveTestSession(existingSession);
      setPendingStartTest({ test: fullTest, mode });
      setShowResumeModal(true);
      return;
    }

    // No valid saved session -> clean any stale remnants and start fresh immediately!
    clearScopedActiveSession(targetUid, fullTest.id);
    clearScopedActiveSession(null, fullTest.id);
    clearScopedActiveSession('guest-user', fullTest.id);
    setActiveSessionsMap((prev) => {
      const next = { ...prev };
      delete next[fullTest.id];
      return next;
    });
    setActiveTestSession(null);
    setResumedSession(null);
    setCurrentTest(fullTest);
    setTestMode(mode);
    setActiveTab('take-test');
  };

  const handleStartOmrTest = async (test: MathTest, initialTab: 'print' | 'scan' | 'keys' | 'review' = 'print') => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const fullTest = (test.questions && test.questions.length > 0)
      ? test
      : (await loadFullTestOnDemand(test.id, tests, targetUid)) || test;

    setLastAttempt(null);
    setCurrentTest(fullTest);
    setOmrInitialTab(initialTab);
    setActiveTab('omr-test');
  };

  const handleResumeSession = async (specificTestId?: string) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const targetTestId = specificTestId || pendingStartTest?.test.id || activeTestSession?.testId;
    const session = (targetTestId ? loadScopedActiveSession(targetUid, targetTestId) : null) || activeTestSession;

    if (session && session.test) {
      let testFromLib = tests.find((t) => t.id === session.testId) || session.test;
      if (!testFromLib.questions || testFromLib.questions.length === 0) {
        testFromLib = (await loadFullTestOnDemand(testFromLib.id, tests, targetUid)) || testFromLib;
      }
      const hydratedSession: ActiveTestSession = {
        ...session,
        test: testFromLib,
      };

      setCurrentTest(testFromLib);
      setTestMode(session.mode);
      setResumedSession(hydratedSession);
      setActiveTab('take-test');
    } else if (pendingStartTest) {
      let fullPendingTest = pendingStartTest.test;
      if (!fullPendingTest.questions || fullPendingTest.questions.length === 0) {
        fullPendingTest = (await loadFullTestOnDemand(fullPendingTest.id, tests, targetUid)) || fullPendingTest;
      }
      clearScopedActiveSession(targetUid, pendingStartTest.test.id);
      clearScopedActiveSession(null, pendingStartTest.test.id);
      clearScopedActiveSession('guest-user', pendingStartTest.test.id);
      setActiveSessionsMap((prev) => {
        const next = { ...prev };
        delete next[pendingStartTest.test.id];
        return next;
      });
      setActiveTestSession(null);
      setResumedSession(null);
      setCurrentTest(fullPendingTest);
      setTestMode(pendingStartTest.mode);
      setActiveTab('take-test');
    }
    setShowResumeModal(false);
    setPendingStartTest(null);
  };

  const handleStartNewTest = () => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    if (pendingStartTest) {
      clearScopedActiveSession(targetUid, pendingStartTest.test.id);
      clearScopedActiveSession(null, pendingStartTest.test.id);
      clearScopedActiveSession('guest-user', pendingStartTest.test.id);
      setActiveSessionsMap((prev) => {
        const next = { ...prev };
        delete next[pendingStartTest.test.id];
        return next;
      });
      setActiveTestSession(null);
      setResumedSession(null);
      setCurrentTest(pendingStartTest.test);
      setTestMode(pendingStartTest.mode);
      setActiveTab('take-test');
    }
    setShowResumeModal(false);
    setPendingStartTest(null);
  };

  const handleFinishTest = (attempt: TestAttempt) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    clearScopedActiveSession(targetUid, attempt.testId);
    clearScopedActiveSession(null, attempt.testId);
    clearScopedActiveSession('guest-user', attempt.testId);
    setActiveSessionsMap((prev) => {
      const next = { ...prev };
      delete next[attempt.testId];
      return next;
    });
    setActiveTestSession(null);
    setResumedSession(null);
    setShowResumeModal(false);
    setPendingStartTest(null);

    // Determine authenticated identity
    const activeUid = (currentUser?.uid && currentUser.uid !== 'anonymous' && currentUser.uid !== 'guest-user')
      ? currentUser.uid
      : ((targetUid && targetUid !== 'anonymous' && targetUid !== 'guest-user') 
          ? targetUid 
          : (attempt.userId && attempt.userId !== 'anonymous' && attempt.userId !== 'guest-user' ? attempt.userId : null));

    const activeEmail = (currentUser?.email && currentUser.email.includes('@'))
      ? currentUser.email
      : (attempt.userEmail && attempt.userEmail.includes('@') ? attempt.userEmail : (cachedUser?.email || ''));

    const validatedAttempt: TestAttempt = {
      ...attempt,
      userId: activeUid || 'guest-user',
      userEmail: activeEmail,
      userName: attempt.userName || currentUser?.displayName || activeEmail.split('@')[0] || 'Learner',
    };

    // Compute pruned attempts (keeping only First Attempt and Latest Attempt per test)
    const storageUid = activeUid || null;
    const currentScoped = loadScopedAttempts(storageUid);
    const rawList = [validatedAttempt, ...currentScoped.filter((p) => p.id !== validatedAttempt.id)];
    const { pruned } = pruneAttemptsToFirstAndLast(rawList);

    // Add to local state immediately and sync via local coordinator & syncHub (both online and OMR mode)
    setAttempts(pruned);
    setLastAttempt(validatedAttempt);
    syncHub.addAttempt(validatedAttempt);

    // Update local userProfile immediately so test detail modal and stats refresh without lag
    const safeKey = (validatedAttempt.testId || 'test').replace(/[./[\]*~#$]/g, '_');
    setUserProfile((prev) => {
      if (!prev) return prev;
      const currentHistories = prev.testHistories || {};
      const allHistories = (Object.values(currentHistories) as (TestHistoryEntry | undefined)[]) || [];
      const existingEntry = currentHistories[safeKey] || allHistories.find((e) => e?.testId === validatedAttempt.testId);
      const firstAtt = existingEntry?.firstAttempt || validatedAttempt;
      const newCount = (existingEntry?.attemptCount || 0) + 1;

      return {
        ...prev,
        testHistories: {
          ...currentHistories,
          [safeKey]: {
            testId: validatedAttempt.testId,
            testTitle: validatedAttempt.testTitle || '',
            firstAttempt: firstAtt,
            lastAttempt: validatedAttempt,
            attemptCount: newCount,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

    // Save to scoped storage immediately (local device persistence)
    saveScopedAttempts(storageUid, pruned);

    setReturnTabAfterResults('tests');
    setActiveTab('results');
    showToast(`Test completed! Your score: ${attempt.percentage}%`, attempt.passed ? 'success' : 'info');
  };

  const handleExitTest = () => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const allSessions = loadAllScopedActiveSessions(targetUid);
    setActiveSessionsMap(allSessions);
    setActiveTestSession(loadScopedActiveSession(targetUid));
    setResumedSession(null);
    setCurrentTest(null);
    setActiveTab('tests');
  };

  // Test Editor Handlers
  const handleCreateNew = () => {
    setEditingTest(null);
    setEditorAiPromptOpen(false);
    setActiveTab('create');
  };

  const handleEditTest = async (test: MathTest, options?: { openAiPrompt?: boolean }) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const fullTest = (test.questions && test.questions.length > 0)
      ? test
      : (await loadFullTestOnDemand(test.id, tests, targetUid)) || test;
    setEditingTest(fullTest);
    setEditorAiPromptOpen(Boolean(options?.openAiPrompt));
    setActiveTab('create');
  };

  const handleSaveTest = async (test: MathTest) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || auth.currentUser?.uid || null;
    let validatedTest: MathTest = {
      ...test,
      authorId: (test.authorId && test.authorId !== 'anonymous' && test.authorId !== 'guest-user')
        ? test.authorId
        : (targetUid || 'anonymous'),
      authorName: test.authorName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Teacher',
      authorEmail: currentUser?.email || cachedUser?.email || '',
      isPublic: true,
      id: test.id || `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: test.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: normalizeQuestions(Array.isArray(test.questions) ? test.questions : []),
    };

    // Auto-compress heavy diagram payloads if document approaches Firestore 1MB limits
    try {
      validatedTest = await optimizeTestForFirestore(validatedTest);
    } catch (e) {
      console.warn('Image optimization skipped on save:', e);
    }

    // Unmark from deleted storage if it was previously marked as deleted
    unmarkTestAsDeletedInScopedStorage(targetUid, validatedTest.id);
    syncHub.addOrUpdateTest(validatedTest);

    // Update local state immediately (0ms instant optimistic update)
    setTests((prev) => {
      const exists = prev.some((t) => t.id === validatedTest.id);
      const updated = exists ? prev.map((t) => (t.id === validatedTest.id ? validatedTest : t)) : [validatedTest, ...prev];
      lastSavedTestsRef.current = updated;
      setTimeout(() => {
        saveScopedTests(targetUid, updated);
      }, 0);
      return updated;
    });

    setEditingTest(validatedTest);
    // Stay in test creation studio stage
    showToast(`Test "${validatedTest.title}" saved successfully!`, 'success');
  };

  const handleConfirmAddImportedTest = useCallback((testToAdd: MathTest, startImmediately: boolean) => {
    handleSaveTest(testToAdd);
    setPendingImportedTest(null);

    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (startImmediately) {
      handleStartTest(testToAdd, 'timed');
    } else {
      setActiveTab('tests');
    }
  }, [handleSaveTest, handleStartTest, setActiveTab]);

  const handleDeleteTest = (testId: string) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    // Mark as deleted in scoped storage and guest fallback so it stays deleted even on page reload or sample re-hydration
    markTestAsDeletedInScopedStorage(targetUid, testId);
    markTestAsDeletedInScopedStorage(null, testId);
    syncHub.deleteTest(testId);
    if (targetUid && targetUid !== 'anonymous' && targetUid !== 'guest-user') {
      deleteTestFromFirestore(testId, targetUid).catch(() => {});
    }

    clearScopedActiveSession(targetUid, testId);
    clearScopedActiveSession(null, testId);
    setActiveSessionsMap((prev) => {
      const next = { ...prev };
      delete next[testId];
      return next;
    });
    setTests((prev) => {
      const updated = prev.filter((t) => t.id !== testId);
      lastSavedTestsRef.current = updated;
      setTimeout(() => {
        saveScopedTests(targetUid, updated);
        if (targetUid) {
          saveScopedTests(null, loadScopedTests(null).filter((t) => t.id !== testId));
        }
      }, 0);
      return updated;
    });

    showToast('Test removed from your library.', 'info');
  };

  const handleClearAttempts = () => {
    setAttempts([]);
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    saveScopedAttempts(targetUid, []);
    showToast('Test attempt history cleared.', 'info');
  };

  // JSON Import & Export Handlers
  const handleImportTests = (imported: MathTest[]) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    imported.forEach((t) => {
      if (t.id) {
        unmarkTestAsDeletedInScopedStorage(targetUid, t.id);
        if (targetUid && targetUid !== 'anonymous' && targetUid !== 'guest-user') {
          unmarkDeletedTestInFirestore(t.id, targetUid).catch(() => {});
        }
      }
    });

    imported.forEach((t) => {
      const validated: MathTest = {
        ...t,
        authorId: targetUid || 'anonymous',
        authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
      };
      syncHub.addOrUpdateTest(validated);
    });

    setTests((prev) => {
      const testMap = new Map<string, MathTest>();
      prev.forEach((t) => testMap.set(t.id, t));
      imported.forEach((t) => testMap.set(t.id, t));
      const updated = Array.from(testMap.values());
      lastSavedTestsRef.current = updated;
      setTimeout(() => {
        saveScopedTests(targetUid, updated);
      }, 0);
      return updated;
    });

    // Stay at Test Studio ('create') if already there or importing into studio
    if (activeTab === 'create') {
      if (imported.length > 0) {
        setEditingTest(imported[0]);
      }
    } else {
      // If triggered from elsewhere, stay on current tab or test studio as appropriate
    }
    showToast(`Successfully imported ${imported.length} math test${imported.length > 1 ? 's' : ''}!`, 'success');
  };

  const handleExtractPhotoSuccess = (extractedTest: MathTest) => {
    const targetUid = currentUser?.uid || cachedUser?.uid || null;
    const validated: MathTest = {
      ...extractedTest,
      authorId: targetUid || 'anonymous',
      authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Teacher',
    };
    syncHub.addOrUpdateTest(validated);
    setTests((prev) => [validated, ...prev]);
    setEditingTest(validated);
    setActiveTab('create');
    showToast(`Extracted ${validated.questions.length} math questions from photo scan!`, 'success');
  };

  const handleExportJson = (test: MathTest) => {
    const jsonStr = JSON.stringify(test, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const safeTitle = test.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    triggerBlobDownload(blob, `${safeTitle || 'math-test'}.json`);
    showToast(`Exported "${test.title}" as JSON file`, 'info');
  };

  // Analytics View Action
  const handleViewAttemptResult = (attempt: TestAttempt) => {
    setReturnTabAfterResults(activeTab === 'analytics' ? 'analytics' : 'tests');
    const foundTest = tests.find((t) => t.id === attempt.testId);
    let targetTest = foundTest;
    if (!targetTest) {
      // Create minimal fallback test structure from attempt
      targetTest = {
        id: attempt.testId,
        title: attempt.testTitle,
        description: 'Completed mock test assessment',
        topic: attempt.testTopic,
        difficulty: 'Medium',
        timeLimitMinutes: 0,
        passingScorePercentage: 60,
        authorId: 'archived',
        authorName: 'Math Mock',
        isPublic: true,
        questions: Object.values(attempt.answers || {}).map((ans, idx) => ({
          id: ans.questionId,
          text: `Question #${idx + 1}`,
          type: 'mcq',
          options: [ans.selectedOption || 'Option A'],
          correctAnswer: ans.selectedOption || 'Option A',
          explanation: 'Refer to original exam rubric for full derivation.',
          points: 1,
        })),
        createdAt: attempt.createdAt,
        updatedAt: attempt.completedAt,
      };
    }
    setCurrentTest(targetTest);
    setLastAttempt(attempt);

    if (activeTab !== 'results' && activeTab !== 'omr-test') {
      setReturnTabAfterResults(activeTab);
    }

    const isOmr = isAttemptOmrMode(attempt);
    if (isOmr) {
      setOmrInitialTab('scan');
      setActiveTab('omr-test');
    } else {
      setActiveTab('results');
    }
  };

  const handleRetakeTestFromId = (testId: string) => {
    const found = tests.find((t) => t.id === testId);
    if (found) {
      handleStartTest(found, 'timed');
    } else {
      showToast('Original test was deleted or unavailable.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#ededed] dark:bg-[#111318] text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col font-sans antialiased selection:bg-[#0b57d0]/20 selection:text-[#0b57d0] dark:selection:text-[#a8c7fa] transition-colors duration-200">
      {/* Toast Notification */}
      {notification && (
        <div 
          id="app-toast-notification"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs sm:text-sm font-medium animate-in slide-in-from-bottom-5 duration-200 ${
            notification.type === 'error'
              ? 'bg-rose-900 text-rose-50 border-rose-700'
              : notification.type === 'info'
              ? 'bg-slate-900 text-slate-50 border-slate-700'
              : 'bg-emerald-900 text-emerald-50 border-emerald-700'
          }`}
        >
          <span>{notification.message}</span>
          <button 
            onClick={() => setNotification(null)}
            className="text-white/70 hover:text-white text-base leading-none font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Header - Hidden during active test attempts, test creator, review solution mode, custom builder, performance analytics, notes repository, html notes studio, and bulk print */}
      {activeTab !== 'take-test' && activeTab !== 'omr-test' && activeTab !== 'create' && activeTab !== 'results' && activeTab !== 'custom-builder' && activeTab !== 'chatbot' && activeTab !== 'analytics' && activeTab !== 'notes-repository' && activeTab !== 'bulk-print' && activeTab !== 'html-notes' && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          cachedUser={cachedUser}
          isAuthLoading={isAuthLoading}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onCreateNewTest={handleCreateNew}
          onDrawerOpenChange={setIsNavDrawerOpen}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />
      )}

      {/* Main App Bar / Navigation Header */}

      {/* Full-Screen Focused Views - Rendered outside transformed container so position: fixed elements anchor to screen viewport */}
      {activeTab === 'take-test' && currentTest && (
        <TestRunner
          test={currentTest}
          mode={testMode}
          initialSession={resumedSession}
          currentUser={currentUser}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          uiScale={uiScale}
          onScaleChange={setUiScale}
          onFinishTest={handleFinishTest}
          onExitTest={handleExitTest}
        />
      )}

      {activeTab === 'omr-test' && currentTest && (
        <OmrExamStudio
          key={`omr-${currentTest.id}-${omrInitialTab}-${omrInitialTab === 'scan' ? (lastAttempt?.id || 'view') : 'fresh'}`}
          test={currentTest}
          currentUser={currentUser}
          isDarkMode={isDarkMode}
          initialAttempt={omrInitialTab === 'scan' && lastAttempt?.testId === currentTest.id ? lastAttempt : null}
          initialTab={omrInitialTab}
          onFinishTest={(attempt) => {
            handleFinishTest(attempt);
            setActiveTab('results');
          }}
          onExit={() => {
            goBack();
          }}
        />
      )}

      {activeTab === 'results' && lastAttempt && (
        <TestResultView
          test={currentTest || tests.find((t) => t.id === lastAttempt.testId) || {
            id: lastAttempt.testId,
            title: lastAttempt.testTitle,
            topic: lastAttempt.testTopic,
            description: '',
            difficulty: 'Medium',
            timeLimitMinutes: 0,
            passingScorePercentage: 60,
            questions: []
          }}
          attempt={lastAttempt}
          currentUser={currentUser}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onRetakeTest={() => {
            const t = currentTest || tests.find((t) => t.id === lastAttempt.testId);
            if (t) handleStartTest(t, 'timed');
          }}
          onBackToDashboard={() => setActiveTab(returnTabAfterResults)}
          onCreateNew={() => {
            setEditingTest(null);
            setActiveTab('create');
          }}
        />
      )}

      {activeTab === 'create' && (
        <TestEditor
          initialTest={editingTest}
          initialOpenAiPrompt={editorAiPromptOpen}
          allTests={tests}
          currentUser={currentUser}
          onSaveTest={handleSaveTest}
          onDeleteTest={(testId) => {
            handleDeleteTest(testId);
            setEditingTest(null);
          }}
          onCancel={() => {
            setEditingTest(null);
            setEditorAiPromptOpen(false);
            goBack();
          }}
          onExportJson={handleExportJson}
          onImportTests={handleImportTests}
          onOpenCustomPanel={() => setActiveTab('custom-builder')}
          onUnloadTest={() => {
            setEditingTest(null);
            setEditorAiPromptOpen(false);
          }}
        />
      )}

      {activeTab === 'custom-builder' && (
        <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30">
          <CustomTestBuilder
            tests={tests}
            attempts={attempts}
            currentUser={currentUser}
            onStartCustomTest={(customTest, mode) => {
              handleSaveTest(customTest);
              handleStartTest(customTest, mode);
            }}
            onStartOmrCustomTest={(customTest) => {
              handleSaveTest(customTest);
              handleStartOmrTest(customTest);
            }}
            onSaveCustomTest={(customTest) => {
              handleSaveTest(customTest);
            }}
            onCancel={() => goBack()}
          />
        </div>
      )}

      {/* Main Content Area */}
      {activeTab !== 'take-test' && activeTab !== 'omr-test' && activeTab !== 'results' && activeTab !== 'create' && activeTab !== 'custom-builder' && (
        <main className="flex-1 min-w-0 bg-[#e5e9f0] dark:bg-[#0b0c10]">
          {/* Mock Tests Library */}
          {activeTab === 'tests' && (
            <TestList
              tests={tests}
              attempts={attempts}
              currentUser={currentUser}
              userProfile={userProfile}
              activeSession={activeTestSession}
              activeSessionsMap={activeSessionsMap}
              onResumeSession={handleResumeSession}
              onStartTest={handleStartTest}
              onStartOmrTest={handleStartOmrTest}
              onEditTest={handleEditTest}
              onDeleteTest={handleDeleteTest}
              onViewAttemptResult={handleViewAttemptResult}
              onExportJson={handleExportJson}
              onCreateNew={handleCreateNew}
              onSignIn={handleSignIn}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              hasMoreTests={hasMoreTests}
              isLoadingMoreTests={isLoadingMoreTests}
              onLoadMoreTests={handleLoadMoreTests}
              onOpenBulkPrint={() => setActiveTab('bulk-print')}
            />
          )}

      {/* Performance Analytics */}
      {activeTab === 'analytics' && (
        <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-y-auto flex flex-col z-30">
          <PerformanceAnalytics
            tests={tests}
            attempts={attempts}
            currentUser={currentUser}
            userProfile={userProfile}
            onLoadMoreAttempts={handleLoadMoreAttempts}
            hasMoreAttempts={hasMoreAttempts}
            isLoadingMoreAttempts={isLoadingMoreAttempts}
            onViewAttemptResult={handleViewAttemptResult}
            onRetakeTest={handleRetakeTestFromId}
            onNavigateToTests={() => goBack()}
            onBack={() => goBack()}
            onOpenCustomBuilder={() => setActiveTab('custom-builder')}
            onSignIn={handleSignIn}
            onGenerateThetaCourse={(prompt) => {
              setChatbotInitialPrompt(prompt);
              setActiveTab('chatbot');
            }}
            onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
          />
        </div>
      )}

          {/* Dedicated Gemini Multi-Turn Chatbot */}
          {activeTab === 'chatbot' && (
            <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30">
              <GeminiChatbotView 
                isDarkMode={isDarkMode} 
                tests={tests}
                attempts={attempts}
                userProfile={userProfile}
                initialPrompt={chatbotInitialPrompt}
                onClearInitialPrompt={() => setChatbotInitialPrompt(null)}
                onSaveTest={handleSaveTest}
                onDeleteTest={handleDeleteTest}
                onStartTest={handleStartTest}
                onEditTest={handleEditTest}
                onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
              />
            </div>
          )}

          {/* Unified Notes Studio (Formula Notes, Study Repository & HTML Notes with Google Drive Sync) */}
          {activeTab === 'notes-repository' && (
            <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30">
              <NotesStudio
                tests={tests}
                currentUser={currentUser}
                initialMode="repository"
                onBack={() => goBack()}
                onStartTest={(test) => handleStartTest(test, 'timed')}
                isDarkMode={isDarkMode}
                toggleTheme={toggleTheme}
              />
            </div>
          )}

          {/* Unified Notes Studio - HTML Projects & Code Mode */}
          {activeTab === 'html-notes' && (
            <div className="fixed inset-0 bg-[#e5e9f0] dark:bg-[#0b0c10] h-[100dvh] max-h-screen overflow-hidden flex flex-col z-30">
              <NotesStudio
                tests={tests}
                currentUser={currentUser}
                initialMode="html"
                onBack={() => goBack()}
                onStartTest={(test) => handleStartTest(test, 'timed')}
                isDarkMode={isDarkMode}
                toggleTheme={toggleTheme}
              />
            </div>
          )}

          {/* Bulk Print & OMR Studio */}
          {activeTab === 'bulk-print' && (
            <BulkPrintStudio
              tests={tests}
              onExit={() => goBack()}
              onLaunchOmrScan={(test, tab) => handleStartOmrTest(test, tab || 'scan')}
            />
          )}
        </main>
      )}

      {/* Resume Confirmation Modal */}
      {showResumeModal && activeTestSession && (
        <ResumeTestModal
          isOpen={showResumeModal}
          activeSession={activeTestSession}
          pendingTestTitle={pendingStartTest?.test?.title}
          onResume={handleResumeSession}
          onStartNew={handleStartNewTest}
          onClose={() => {
            setShowResumeModal(false);
            setPendingStartTest(null);
          }}
        />
      )}

      {/* Settings & Offline Storage Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        uiScale={uiScale}
        onScaleChange={setUiScale}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        currentUser={currentUser}
        onDataChanged={() => {
          const activeUid = currentUser?.uid || null;
          const freshTests = loadScopedTests(activeUid);
          setTests(freshTests);
          const freshAttempts = loadScopedAttempts(activeUid);
          setAttempts(freshAttempts);
          const freshSessions = loadAllScopedActiveSessions(activeUid);
          setActiveSessionsMap(freshSessions);
          setActiveTestSession(loadScopedActiveSession(activeUid));
          lastSavedTestsRef.current = freshTests;
          lastSavedAttemptsRef.current = freshAttempts;
        }}
      />

      {/* SHARED TEST IMPORT CONFIRMATION MODAL */}
      <AnimatePresence>
        {pendingImportedTest && (
          <motion.div
            variants={studioBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuAcceleratedStyle}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          >
            <motion.div
              variants={studioModalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={gpuTransformStyle}
              className="bg-[#f8fafc] dark:bg-[#1a1c23] w-full max-w-md rounded-3xl shadow-2xl border border-slate-200/80 dark:border-[#272932] p-5 sm:p-6 space-y-4 text-slate-900 dark:text-zinc-100 text-left"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-[#272932]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center font-bold shrink-0">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">Add Shared Test?</h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">Someone shared a practice test with you</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingImportedTest(null);
                    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                      window.history.replaceState({}, '', window.location.pathname);
                    }
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#272932] text-slate-500 dark:text-zinc-400 flex items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-[#343744] transition-colors border-0 outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#0b0c10] border border-slate-200/80 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]">
                    {pendingImportedTest.topic}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-zinc-400 font-semibold">
                    {pendingImportedTest.questions?.length || 0} Questions
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 leading-snug">
                  {pendingImportedTest.title}
                </h4>
                {pendingImportedTest.description && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2">
                    {pendingImportedTest.description}
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-zinc-400 text-center font-medium">
                Would you like to save this test to your Test Library?
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleConfirmAddImportedTest(pendingImportedTest, false)}
                  className="w-full sm:flex-1 py-2.5 text-xs font-bold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-[#272932] hover:bg-slate-200 dark:hover:bg-[#343744] rounded-full cursor-pointer transition-colors shadow-2xs border-0 outline-none"
                >
                  Save Test
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmAddImportedTest(pendingImportedTest, true)}
                  className="w-full sm:flex-1 py-2.5 text-xs font-bold text-white bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:text-[#041e49] rounded-full shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5 border-0 outline-none"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Save Test & Attempt</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
