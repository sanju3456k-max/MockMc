import { useEffect, useRef, useCallback } from 'react';

// Centralized Back Navigation Stack
type BackHandler = () => boolean | void;

interface StackItem {
  id: string;
  priority: number;
  handler: BackHandler;
}

const backStack: StackItem[] = [];
let isInitialized = false;

// Trigger the topmost back handler. Returns true if an action was handled.
export function triggerBack(): boolean {
  if (backStack.length > 0) {
    // Sort descending by priority
    const sorted = [...backStack].sort((a, b) => b.priority - a.priority);
    const top = sorted[0];
    
    // Execute handler
    const result = top.handler();
    // If result is explicitly false, it declined to handle; otherwise consider handled
    if (result !== false) {
      return true;
    }
  }
  return false;
}

/**
 * Initializes global event listeners for:
 * 1. window popstate (Android system back button/gesture, browser back button, mouse back button, Alt+Left)
 * 2. Keyboard Escape and Backspace on desktops
 *
 * NOTE: Artificial touchstart/touchend swipe listeners are avoided here to prevent
 * accidental back navigation when users are scrolling or swiping their fingers across the screen in Chrome.
 * The native Android/iOS system back gesture is dispatched natively via popstate.
 */
function initGlobalListeners() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. Popstate listener (System back gestures, Android back button, Browser back button)
  window.addEventListener('popstate', () => {
    // Check if a modal/overlay in our back stack wants to consume this
    if (backStack.length > 0) {
      triggerBack();
    }
  });

  // 2. Desktop Keyboard Navigation (Escape key & Backspace when outside inputs)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const handled = triggerBack();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (e.key === 'Backspace' && !isInputFocused()) {
      // If user presses backspace while not typing in an input
      const handled = triggerBack();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    active.hasAttribute('contenteditable')
  );
}

/**
 * Hook for registering a back handler for a specific modal, drawer, or overlay.
 * When `isOpen` is true:
 * - Registers handler in the back stack
 * - Pushes a history anchor to capture Android / browser back gestures
 * - When back is pressed or Escape is pressed, calls `onBack`
 */
export function useBackHandler(options: {
  isOpen: boolean;
  onBack: () => void;
  priority?: number;
  id?: string;
}): void {
  const { isOpen, onBack, priority = 10, id } = options;
  const idRef = useRef<string>(id || `handler_${Math.random().toString(36).slice(2, 9)}`);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    initGlobalListeners();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const currentId = idRef.current;
    const item: StackItem = {
      id: currentId,
      priority,
      handler: () => {
        onBackRef.current();
        return true;
      },
    };

    // Push to stack
    backStack.push(item);

    // Push a dummy history state to catch browser/device back gesture
    try {
      window.history.pushState({ mockmc_layer: currentId }, '');
    } catch {
      // Ignore in environments where pushState might fail
    }

    return () => {
      // Remove from stack
      const index = backStack.findIndex((i) => i.id === currentId);
      if (index !== -1) {
        backStack.splice(index, 1);
      }
    };
  }, [isOpen, priority]);
}

/**
 * Hook to coordinate top-level app view navigation and browser history.
 */
export function useViewHistory<T extends string>(
  currentView: T,
  onViewChange: (view: T) => void,
  defaultView: T
) {
  const isNavigatingBackRef = useRef(false);
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;

  useEffect(() => {
    initGlobalListeners();

    // Initial state setup
    try {
      if (!window.history.state?.mockmc_view) {
        window.history.replaceState({ mockmc_view: defaultView, mockmc_root: true }, '');
      }
    } catch {}

    const handlePopState = (e: PopStateEvent) => {
      // If a modal/drawer overlay handled it, don't change view
      if (backStack.length > 0) return;

      const stateView = e.state?.mockmc_view as T | undefined;
      if (stateView && stateView !== currentViewRef.current) {
        isNavigatingBackRef.current = true;
        onViewChange(stateView);
        setTimeout(() => {
          isNavigatingBackRef.current = false;
        }, 50);
      } else if (currentViewRef.current !== defaultView) {
        isNavigatingBackRef.current = true;
        onViewChange(defaultView);
        try {
          window.history.replaceState({ mockmc_view: defaultView, mockmc_root: true }, '');
        } catch {}
        setTimeout(() => {
          isNavigatingBackRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onViewChange, defaultView]);

  // When currentView changes organically from user interaction, push to browser history
  useEffect(() => {
    if (isNavigatingBackRef.current) return;
    try {
      if (window.history.state?.mockmc_view !== currentView) {
        window.history.pushState({ mockmc_view: currentView }, '');
      }
    } catch {}
  }, [currentView]);

  // Programmatic back function that triggers history.back or default view
  const navigateBack = useCallback(() => {
    if (backStack.length > 0) {
      triggerBack();
    } else if (currentViewRef.current !== defaultView) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else {
        onViewChange(defaultView);
      }
    }
  }, [defaultView, onViewChange]);

  return { navigateBack };
}
