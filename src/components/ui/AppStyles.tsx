import React, { forwardRef } from 'react';

/**
 * 🎨 AppStyles: Centralized Design System & UI Style Hub
 * Premium, minimal, and clean design system for your app.
 */

// Surface & Section Layout (Official Google Material 3 Tonal Colors & Shapes)
export const APP_STYLES = {
  // Page Background & Viewport Shell (M3 Surface - Header & Body Identical)
  page: 'bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans antialiased selection:bg-[#0084ff]/20 selection:text-[#0084ff]',

  // Cards (Official Home Screen M3 Elevated & Container Cards with 24px Radii and border-0)
  card: {
    base: 'bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200',
    interactive: 'bg-white dark:bg-[#1e2024] hover:bg-[#fbfcfe] dark:hover:bg-[#23262c] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-all duration-200 cursor-pointer',
    compact: 'bg-white dark:bg-[#1e2024] rounded-[24px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-200',
    activeRing: 'border-0 ring-2 ring-[#0b57d0]',
  },

  // Subcards (Inner M3 Container Blocks)
  subcard: {
    base: 'bg-[#f0f4f9] dark:bg-[#141619] rounded-[24px] p-4 border-0 text-[#1f1f1f] dark:text-[#e3e3e3] transition-all duration-150',
    interactive: 'bg-[#f0f4f9] dark:bg-[#141619] hover:bg-[#e9eef6] dark:hover:bg-[#22252a] rounded-[24px] p-4 border-0 cursor-pointer transition-all duration-150 active:scale-[0.99]',
    active: 'bg-[#0b57d0]/15 dark:bg-[#0b57d0]/25 text-[#0b57d0] dark:text-[#a8c7fa] font-semibold rounded-[24px] border-0 shadow-xs',
  },

  // Buttons (Home Screen Material 3 Buttons: 36px/40px height, rounded-full)
  button: {
    primary: 'h-9 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-0 shadow-[0_2px_6px_rgba(11,87,208,0.25)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none',
    secondary: 'h-9 px-4 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-bold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none',
    chip: 'h-8 px-3.5 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none',
    chipActive: 'h-8 px-3.5 rounded-full bg-[#d3e3fd] text-[#041e49] dark:bg-[#004a77] dark:text-[#c2e7ff] text-xs font-bold border-0 shadow-xs flex items-center justify-center gap-1.5 outline-none select-none',
    icon: 'w-9 h-9 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0 select-none disabled:opacity-40 disabled:pointer-events-none',
    iconSmall: 'w-8 h-8 rounded-full bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0 select-none disabled:opacity-40 disabled:pointer-events-none',
    danger: 'h-9 px-4 rounded-full bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold border-0 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none',
    success: 'h-9 px-4 rounded-full bg-[#1b6d3b] hover:bg-[#12532b] text-white text-xs font-bold border-0 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all outline-none select-none disabled:opacity-40 disabled:pointer-events-none',
  },

  // Pills / Badges / Tags (M3 Tonal Tags)
  pill: {
    neutral: 'px-3.5 py-1.5 rounded-[28px] text-[11px] font-medium bg-transparent text-[#444746] dark:text-[#c4c7c5] border-0 inline-flex items-center gap-1.5',
    blue: 'px-3.5 py-1.5 rounded-[28px] text-[11px] font-medium bg-[#0084ff]/15 dark:bg-[#0084ff]/25 text-[#0084ff] dark:text-[#66b5ff] border-0 inline-flex items-center gap-1.5',
    emerald: 'px-3.5 py-1.5 rounded-[28px] text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-0 inline-flex items-center gap-1.5',
    amber: 'px-3.5 py-1.5 rounded-[28px] text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-0 inline-flex items-center gap-1.5',
    rose: 'px-3.5 py-1.5 rounded-[28px] text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-0 inline-flex items-center gap-1.5',
  },

  // Form Inputs & Search Fields (M3 Search Bar & Text Fields)
  input: {
    text: 'w-full px-5 py-3 rounded-[28px] bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#444746]/80 dark:placeholder:text-[#9aa0a6]/80 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-[#0084ff] dark:focus:ring-[#0084ff] text-sm font-medium transition-all duration-150',
    search: 'w-full pl-10 pr-5 py-3 rounded-[28px] bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#444746]/80 dark:placeholder:text-[#9aa0a6]/80 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-[#0084ff] dark:focus:ring-[#0084ff] text-sm font-medium transition-all duration-150',
  },

  // Dropdown Popovers (M3 Menu)
  dropdown: {
    container: 'relative shrink-0 z-30',
    trigger: 'flex items-center gap-2 px-5 py-2.5 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] border-0 cursor-pointer active:scale-95 transition-all duration-150 outline-none',
    menu: 'absolute left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white dark:bg-[#1e2024] shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-[28px] p-2 z-50 border-0 [scrollbar-width:thin]',
    item: 'w-full px-4 py-2.5 text-xs text-left rounded-[20px] flex items-center justify-between transition-all duration-150 cursor-pointer border-0 text-[#1f1f1f] dark:text-[#e3e3e3] font-medium hover:bg-[#f0f4f9] dark:hover:bg-[#282a30]',
    itemActive: 'w-full px-4 py-2.5 text-xs text-left rounded-[20px] flex items-center justify-between transition-all duration-150 cursor-pointer border-0 bg-[#0084ff]/15 dark:bg-[#0084ff]/25 text-[#0084ff] dark:text-[#66b5ff] font-semibold',
  },

  // Modals & Sheets (M3 Dialog - 28px Radii)
  modal: {
    backdrop: 'fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex flex-col p-0 cursor-default animate-in fade-in duration-200',
    panel: 'bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] w-full h-full max-w-none max-h-none rounded-none flex flex-col shadow-none overflow-hidden',
    dialog: 'w-full max-w-lg bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_8px_28px_rgba(0,0,0,0.18)] overflow-hidden text-[#1f1f1f] dark:text-[#e3e3e3] p-6 sm:p-7 space-y-5',
    header: 'px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-4 bg-transparent border-0 shadow-none shrink-0',
    footer: 'p-4 sm:p-6 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 flex items-center justify-end px-6 shrink-0 gap-2',
  },

  // Navigation Items (M3 Drawer Item with Pill Selection Indicator)
  nav: {
    item: 'w-full flex items-center justify-between p-3.5 rounded-[28px] text-[17px] font-semibold transition-all duration-150 cursor-pointer border-0 bg-transparent text-[#444746] dark:text-[#c4c7c5] hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8',
    itemActive: 'w-full flex items-center justify-between p-3.5 rounded-[28px] text-[17px] font-semibold transition-all duration-150 cursor-pointer border-0 bg-[#0084ff]/15 dark:bg-[#0084ff]/25 text-[#0084ff] dark:text-[#66b5ff]',
  },

  // Surface & Section Layout
  surface: {
    main: 'bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3]',
    muted: 'bg-[#f0f4f9] dark:bg-[#141619] text-[#444746] dark:text-[#c4c7c5]',
    header: 'bg-[#e5e9f0] dark:bg-[#0b0c10] border-0',
    footer: 'bg-[#e5e9f0] dark:bg-[#0b0c10] border-0',
    solutionBox: 'bg-[#f0f4f9] dark:bg-[#1e2024] border-0 rounded-[28px] p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08)]',
  },

  // Centralized TestList View Component Styling (Google M3)
  testList: {
    container: 'w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6',
    topicBar: 'flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-0.5',
    topicButton: 'flex items-center gap-2 px-5 py-2.5 rounded-[28px] bg-white dark:bg-[#1e2024] hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 cursor-pointer active:scale-95 transition-all duration-150 outline-none',
    countPill: 'text-xs font-medium text-[#1f1f1f] dark:text-[#e3e3e3] whitespace-nowrap px-4 py-2 rounded-[28px] bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] shrink-0 ml-auto',
    grid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3',
    card: 'bg-white dark:bg-[#1e2024] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)] rounded-[28px] transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group p-3.5 sm:p-4 space-y-2.5',
    cardTopic: 'text-[11px] font-bold text-[#0084ff] dark:text-[#66b5ff] uppercase tracking-wider truncate',
    cardTitle: 'text-[15px] sm:text-base font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0084ff] dark:group-hover:text-[#66b5ff] transition-colors line-clamp-2 leading-snug tracking-tight',
    cardMeta: 'flex items-center gap-2.5 text-xs text-[#5e5e5e] dark:text-[#c4c7c5] font-medium',
    cardEnterButton: 'w-10 h-10 rounded-[28px] bg-[#0084ff] hover:bg-[#0073e6] text-white flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer border-0 outline-none shrink-0 shadow-xs'
  },

  // Centralized Performance Analytics Styling
  analytics: {
    container: 'w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6',
    header: 'bg-white dark:bg-[#1e2024] p-6 sm:p-7 rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
    title: 'text-lg sm:text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3]',
    subtitle: 'text-xs text-[#5e5e5e] dark:text-[#9aa0a6]',
    grid: 'grid grid-cols-1 md:grid-cols-4 gap-4',
    card: 'p-5 sm:p-6 bg-white dark:bg-[#1e2024] rounded-[28px] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]'
  },

  // Centralized Custom Test Builder Styling
  customBuilder: {
    container: 'h-full w-full flex flex-col overflow-hidden bg-[#e5e9f0] dark:bg-[#0b0c10] font-sans',
    headerArea: 'shrink-0 bg-[#e5e9f0] dark:bg-[#0b0c10] border-0 z-20 shadow-none',
    maxContent: 'max-w-5xl w-full mx-auto px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] pb-2.5 space-y-2',
    card: 'bg-white dark:bg-[#1e2024] hover:bg-[#f8f9fc] dark:hover:bg-[#25282e] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] rounded-[28px] transition-all duration-200 overflow-hidden'
  },

  // Widgets: Common interactive component styles
  widgets: {
    container: 'my-4 w-full overflow-hidden rounded-[28px] border-0 bg-white dark:bg-[#1e2024] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
    canvas: 'w-full h-full relative overflow-hidden select-none touch-none',
    buttonGroup: 'absolute top-3 right-3 flex items-center gap-1.5 z-10',
    caption: 'mt-2 text-xs text-[#5e5e5e] dark:text-[#9aa0a6] text-center font-medium italic'
  },

  // Crop & Picker Tools
  cropTools: {
    overlay: 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs select-none',
    modal: 'relative w-full max-w-2xl bg-[#1e2024] text-[#e3e3e3] rounded-[28px] border border-[#44474f]/40 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden z-10',
    body: 'flex-1 min-h-[260px] sm:min-h-[380px] p-4 flex items-center justify-center bg-[#0b0c10] relative overflow-hidden',
    footer: 'p-4 bg-[#191c20] border-t border-[#44474f]/30 flex flex-wrap items-center justify-between gap-2.5 shrink-0'
  },

  // Specialized Viewers & Lightboxes
  viewers: {
    container: 'my-2.5 w-full select-none',
    lightboxOverlay: 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-150',
    lightboxToolbar: 'absolute top-4 inset-x-4 max-w-2xl mx-auto flex items-center justify-between gap-2 px-5 py-3 rounded-full bg-[#1e2024]/90 border border-[#44474f]/40 text-[#e3e3e3] backdrop-blur-md shadow-2xl z-20'
  },

  // Gemini Canvas and prompt bar components
  geminiCanvas: {
    card: 'bg-[#f0f4f9] dark:bg-[#1e2024] rounded-2xl border-0 shadow-xs p-5 transition-all hover:shadow-md',
    panel: 'w-full h-full flex flex-col overflow-hidden bg-white dark:bg-[#131314]',
    actionCard: 'bg-[#f0f4f9] dark:bg-[#1e2024] hover:bg-[#e2e8f0] dark:hover:bg-[#25282e] border-0 rounded-2xl p-5 transition-all cursor-pointer shadow-xs'
  }
};

// ============================================================================
// Reusable React UI Components
// ============================================================================

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'base' | 'interactive' | 'compact';
  active?: boolean;
}

export const AppCard = forwardRef<HTMLDivElement, AppCardProps>(
  ({ variant = 'base', active = false, className = '', children, ...props }, ref) => {
    const baseStyle = APP_STYLES.card[variant] || APP_STYLES.card.base;
    const activeStyle = active ? APP_STYLES.card.activeRing : '';
    return (
      <div
        ref={ref}
        className={`${baseStyle} ${activeStyle} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppCard.displayName = 'AppCard';

export interface AppSubcardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'base' | 'interactive' | 'active';
}

export const AppSubcard = forwardRef<HTMLDivElement, AppSubcardProps>(
  ({ variant = 'base', className = '', children, ...props }, ref) => {
    const baseStyle = APP_STYLES.subcard[variant] || APP_STYLES.subcard.base;
    return (
      <div
        ref={ref}
        className={`${baseStyle} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AppSubcard.displayName = 'AppSubcard';

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'chip' | 'chipActive' | 'danger' | 'success';
}

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'primary', className = '', children, type = 'button', ...props }, ref) => {
    const style = APP_STYLES.button[variant] || APP_STYLES.button.primary;
    return (
      <button
        ref={ref}
        type={type}
        className={`${style} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);
AppButton.displayName = 'AppButton';

export interface AppIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'normal' | 'small';
}

export const AppIconButton = forwardRef<HTMLButtonElement, AppIconButtonProps>(
  ({ size = 'normal', className = '', children, type = 'button', ...props }, ref) => {
    const style = size === 'small' ? APP_STYLES.button.iconSmall : APP_STYLES.button.icon;
    return (
      <button
        ref={ref}
        type={type}
        className={`${style} ${className}`.trim()}
        {...props}
      >
        {children}
      </button>
    );
  }
);
AppIconButton.displayName = 'AppIconButton';

export interface AppPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose';
}

export const AppPill = forwardRef<HTMLSpanElement, AppPillProps>(
  ({ variant = 'neutral', className = '', children, ...props }, ref) => {
    const style = APP_STYLES.pill[variant] || APP_STYLES.pill.neutral;
    return (
      <span
        ref={ref}
        className={`${style} ${className}`.trim()}
        {...props}
      >
        {children}
      </span>
    );
  }
);
AppPill.displayName = 'AppPill';

// Direct Material 3 primitives re-export
export {
  M3_TOKENS,
  M3Button,
  M3Fab,
  M3IconButton,
  M3Card,
  M3Chip,
  M3SearchBar,
} from './Material3';
export type {
  M3ButtonProps,
  M3FabProps,
  M3IconButtonProps,
  M3CardProps,
  M3ChipProps,
  M3SearchBarProps,
} from './Material3';
