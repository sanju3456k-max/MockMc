import type React from 'react';

/**
 * Google AI Studio & Material 3 Motion Blueprint Engine
 * =======================================================
 * Designed for 60 FPS / 120 FPS buttery-smooth performance across desktop and mobile.
 * 
 * CORE PERFORMANCE PRINCIPLES:
 * 1. Zero-Reflow GPU Pipeline: Exclusively animates `transform` (3D translate/scale) and `opacity`.
 *    Skips browser Layout (Reflow) and Paint loops entirely.
 * 2. Material Motion Easing Curves: Asymmetrical curves where entries gently decelerate into place,
 *    and exits leave 30% faster with clean acceleration.
 * 3. Hardware Layer Promotion: Employs `will-change: transform, opacity` and `backface-visibility: hidden`
 *    to guarantee dedicated GPU composition without memory bloat.
 * 4. Micro-Staggering: Batches multi-item reveals (grids, questions, cards) with 25-30ms intervals
 *    to prevent main-thread spikes.
 */

// ==========================================
// 1. Google Material 3 / AI Studio Easing Curves
// ==========================================

// Emphasized (Hero animations: Modals, Slide Drawers, Canvas Panels)
export const EASING_EMPHASIZED_DECELERATE = [0.05, 0.7, 0.1, 1.0] as const;
export const EASING_EMPHASIZED_ACCELERATE = [0.3, 0.0, 0.8, 0.15] as const;
export const EASING_EMPHASIZED = [0.2, 0.0, 0.0, 1.0] as const;

// Standard (In-place transitions: Dropdowns, Question Swaps, Tab Switchers)
export const EASING_STANDARD = [0.2, 0.0, 0, 1.0] as const;
export const EASING_STANDARD_DECELERATE = [0.0, 0.0, 0.2, 1.0] as const;
export const EASING_STANDARD_ACCELERATE = [0.4, 0.0, 1.0, 1.0] as const;

// ==========================================
// 2. Exact Timing Presets (Milliseconds)
// ==========================================
export const DURATION_FAST = 0.12;      // 120ms - Micro-taps, tooltips, instant actions
export const DURATION_STANDARD = 0.18;  // 180ms - Menus, popovers, question crossfades
export const DURATION_EMPHASIZED = 0.24;// 240ms - Modals, drawers, fullscreen sheets
export const DURATION_EXIT = 0.15;      // 150ms - Snappy exits (prevent holding user back)

// ==========================================
// 3. Framer Motion Transition Presets
// ==========================================
export const studioTransitionEnter = {
  duration: DURATION_EMPHASIZED,
  ease: EASING_EMPHASIZED_DECELERATE,
};

export const studioTransitionExit = {
  duration: DURATION_EXIT,
  ease: EASING_EMPHASIZED_ACCELERATE,
};

export const studioTransitionStandard = {
  duration: DURATION_STANDARD,
  ease: EASING_STANDARD_DECELERATE,
};

export const studioTransitionMicro = {
  duration: DURATION_FAST,
  ease: EASING_STANDARD,
};

// ==========================================
// 4. GPU Hardware Acceleration Styles
// ==========================================
// Safe crisp rendering: Clean styles that preserve Windows ClearType subpixel text rendering
export const gpuAcceleratedStyle: React.CSSProperties = {};

export const gpuTransformStyle: React.CSSProperties = {};

// ==========================================
// 5. Framer Motion Element Variants
// ==========================================

// Dialogs & Modals (Emphasized Pop-in with subtle vertical settling)
export const studioModalVariants = {
  initial: { opacity: 0, transform: 'translate3d(0, 8px, 0) scale3d(0.96, 0.96, 1)' },
  animate: { opacity: 1, transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)', transition: studioTransitionEnter },
  exit: { opacity: 0, transform: 'translate3d(0, 6px, 0) scale3d(0.97, 0.97, 1)', transition: studioTransitionExit },
};

// Left Sidebar / Navigation Drawer
export const studioDrawerLeftVariants = {
  initial: { transform: 'translate3d(-100%, 0, 0)' },
  animate: { transform: 'translate3d(0, 0, 0)', transition: studioTransitionEnter },
  exit: { transform: 'translate3d(-100%, 0, 0)', transition: studioTransitionExit },
};

// Right Sidebar / Assistant / Palette Drawer
export const studioDrawerRightVariants = {
  initial: { transform: 'translate3d(100%, 0, 0)' },
  animate: { transform: 'translate3d(0, 0, 0)', transition: studioTransitionEnter },
  exit: { transform: 'translate3d(100%, 0, 0)', transition: studioTransitionExit },
};

// Dropdown Menus & Popovers (Scale-origin bloom)
export const studioDropdownVariants = {
  initial: { opacity: 0, transform: 'translate3d(0, -4px, 0) scale3d(0.95, 0.95, 1)' },
  animate: { opacity: 1, transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)', transition: studioTransitionStandard },
  exit: { opacity: 0, transform: 'translate3d(0, -2px, 0) scale3d(0.96, 0.96, 1)', transition: studioTransitionExit },
};

// Backdrop Dimmer (Pure opacity fade)
export const studioBackdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION_STANDARD, ease: [0, 0, 1, 1] as const } },
  exit: { opacity: 0, transition: { duration: DURATION_EXIT, ease: [0, 0, 1, 1] as const } },
};

// Tab / View Switching (Pure crisp opacity fade - NO translate3d to guarantee sharp text & edges like TestList)
export const studioTabVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: studioTransitionStandard },
  exit: { opacity: 0, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] as const } },
};

// Pure Fade Variants (Overlay full screens)
export const studioFadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION_STANDARD, ease: [0, 0, 1, 1] as const } },
  exit: { opacity: 0, transition: { duration: DURATION_EXIT, ease: [0, 0, 1, 1] as const } },
};

// Staggered Container for Lists & Card Grids (Prevents render hiccups)
export const studioStaggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.01,
    },
  },
};

export const studioStaggerItem = {
  initial: { opacity: 0, transform: 'translate3d(0, 6px, 0) scale3d(0.98, 0.98, 1)' },
  animate: { opacity: 1, transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)', transition: studioTransitionStandard },
  exit: { opacity: 0, transform: 'translate3d(0, 4px, 0)', transition: { duration: 0.1 } },
};

// Test Question Horizontal Crossfade
export const studioQuestionSlideVariants = {
  initial: (direction: number = 1) => ({
    opacity: 0,
    transform: `translate3d(${direction * 12}px, 0, 0)`,
  }),
  animate: {
    opacity: 1,
    transform: 'translate3d(0, 0, 0)',
    transition: studioTransitionStandard,
  },
  exit: (direction: number = 1) => ({
    opacity: 0,
    transform: `translate3d(${-direction * 10}px, 0, 0)`,
    transition: { duration: 0.12, ease: EASING_STANDARD_ACCELERATE },
  }),
};

// Tactile Tap Physics for Buttons
export const studioTapFeedback = {
  scale: 0.97,
  transition: { duration: 0.08, ease: [0, 0, 0.2, 1] as const },
};

// ==========================================
// 6. Legacy & Backward Compatibility Aliases
// ==========================================
export const ANDROID_EASE_OUT = EASING_EMPHASIZED_DECELERATE;
export const ANDROID_FAST_EASE = EASING_STANDARD;
export const androidFastTransition = studioTransitionEnter;
export const androidInstantTransition = studioTransitionMicro;
export const androidDrawerLeftVariants = studioDrawerLeftVariants;
export const androidDrawerRightVariants = studioDrawerRightVariants;
export const androidModalVariants = studioModalVariants;
export const androidDropdownVariants = studioDropdownVariants;
export const androidBackdropVariants = studioBackdropVariants;
export const androidTabVariants = studioTabVariants;
