import { useEffect } from 'react';

/**
 * Module-level state for robust multi-consumer scroll locking.
 * Handles nested modals, overlapping drawers, and rapid view transitions without leaking locks.
 */
let activeLocksCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';
let globalTouchMoveHandler: ((e: TouchEvent) => void) | null = null;

function applyScrollLock(): void {
  if (typeof document === 'undefined') return;

  if (activeLocksCount === 0) {
    // Only capture original styles if they aren't already 'hidden'
    const curBody = document.body.style.overflow;
    const curHtml = document.documentElement.style.overflow;
    savedBodyOverflow = curBody !== 'hidden' ? curBody : '';
    savedHtmlOverflow = curHtml !== 'hidden' ? curHtml : '';

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    if (!globalTouchMoveHandler) {
      globalTouchMoveHandler = (e: TouchEvent) => {
        const target = e.target as HTMLElement | null;
        // Allow scrolling inside designated scrollable containers
        if (target && target.closest('.overflow-y-auto, .overflow-x-auto, .overflow-auto, [data-scrollable="true"]')) {
          return;
        }
        if (e.cancelable) {
          e.preventDefault();
        }
      };
      document.addEventListener('touchmove', globalTouchMoveHandler, { passive: false });
    }
  }

  activeLocksCount++;
}

function releaseScrollLock(): void {
  if (typeof document === 'undefined') return;

  activeLocksCount = Math.max(0, activeLocksCount - 1);

  if (activeLocksCount === 0) {
    document.body.style.overflow = savedBodyOverflow || '';
    document.documentElement.style.overflow = savedHtmlOverflow || '';
    savedBodyOverflow = '';
    savedHtmlOverflow = '';

    if (globalTouchMoveHandler) {
      document.removeEventListener('touchmove', globalTouchMoveHandler);
      globalTouchMoveHandler = null;
    }
  }
}

/**
 * Emergency fail-safe function to forcefully clear any lingering scroll locks,
 * reset document overflow to empty string, and remove global touch blockers.
 */
export function forceUnlockAllScrollLocks(): void {
  if (typeof document === 'undefined') return;

  activeLocksCount = 0;
  savedBodyOverflow = '';
  savedHtmlOverflow = '';

  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';

  if (globalTouchMoveHandler) {
    document.removeEventListener('touchmove', globalTouchMoveHandler);
    globalTouchMoveHandler = null;
  }
}

/**
 * Custom hook to lock body & html scrolling when a modal, drawer, or popup is open.
 * Uses reference counting so multiple simultaneous locks release cleanly.
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;

    applyScrollLock();

    return () => {
      releaseScrollLock();
    };
  }, [isLocked]);
}
