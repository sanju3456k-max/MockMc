/**
 * Centralized Application UI Theme Configuration & Style Utility Helpers
 * Allows controlling and configuring buttons, cards, badges, inputs, and UI theme data
 * from a single typed file across all React components.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'active'
  | 'inactive'
  | 'mute'
  | 'muteActive'
  | 'preview'
  | 'danger'
  | 'dangerGhost'
  | 'success'
  | 'icon'
  | 'chip'
  | 'chipActive'
  | 'aiMode'
  | 'aiModeActive'
  | 'm3Filled'
  | 'm3Tonal'
  | 'm3Outlined'
  | 'm3Text';

export type CardVariant = 'base' | 'interactive' | 'flat' | 'bordered' | 'm3Elevated' | 'm3Filled' | 'm3Outlined';

export type BadgeVariant = 'blue' | 'emerald' | 'amber' | 'purple' | 'slate' | 'm3Primary' | 'm3Tertiary' | 'm3Error';

export const THEME_TOKENS = {
  colors: {
    primary: '#0b57d0',
    primaryHover: '#0842a0',
    accent: '#006a60',
    accentHover: '#00564e',
    bgLight: '#f8f9fa',
    bgDark: '#111318',
    surfaceLight: '#ffffff',
    surfaceDark: '#1e2024',
    cardLight: '#ffffff',
    cardDark: '#1e2024',
    borderLight: '#e1e3e1',
    borderDark: '#44474f',
  },
  radii: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '28px',
    full: '9999px',
  },
  shadows: {
    level0: 'none',
    level1: '0 1px 3px 1px rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.12)',
    level2: '0 2px 6px 2px rgba(0, 0, 0, 0.10), 0 1px 2px 0 rgba(0, 0, 0, 0.12)',
    level3: '0 4px 8px 3px rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.14)',
    level4: '0 6px 10px 4px rgba(0, 0, 0, 0.14), 0 2px 3px 0 rgba(0, 0, 0, 0.15)',
    level5: '0 8px 14px 6px rgba(0, 0, 0, 0.16), 0 4px 4px 0 rgba(0, 0, 0, 0.18)',
    card: '0 4px 20px -4px rgba(15, 23, 42, 0.04), 0 16px 80px -10px rgba(15, 23, 42, 0.07)',
    cardHover: '0 6px 24px -4px rgba(15, 23, 42, 0.05), 0 24px 80px -8px rgba(15, 23, 42, 0.1)',
  },
};

/**
 * Pre-compiled Class strings for Button Variants
 */
export const BUTTON_THEME_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  active: 'btn-active',
  inactive: 'btn-inactive',
  mute: 'btn-mute',
  muteActive: 'btn-mute-active',
  preview: 'btn-preview',
  danger: 'btn-danger',
  dangerGhost: 'btn-danger-ghost',
  success: 'btn-success',
  icon: 'btn-icon',
  chip: 'btn-chip',
  chipActive: 'btn-chip-active',
  aiMode: 'btn-ai-mode',
  aiModeActive: 'btn-ai-mode-active',
  m3Filled: 'btn-primary',
  m3Tonal: 'btn-secondary',
  m3Outlined: 'border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-zinc-100 px-4 py-2 rounded-full font-bold text-sm transition-all',
  m3Text: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-[#0084ff] dark:text-[#9ecaff] px-3 py-1.5 rounded-full font-bold text-sm transition-all',
};

/**
 * Pre-compiled Class strings for Card Variants
 */
export const CARD_THEME_CLASSES: Record<CardVariant, string> = {
  base: 'app-card p-4 sm:p-5',
  interactive: 'app-card-interactive p-4 sm:p-5',
  flat: 'bg-slate-50 dark:bg-[#161822] border border-slate-200 dark:border-[#262837] rounded-xl p-4',
  bordered: 'bg-white dark:bg-[#151720] border-2 border-slate-200 dark:border-[#272a39] rounded-2xl p-4',
  m3Elevated: 'md-card-elevated p-4 sm:p-5',
  m3Filled: 'md-card-filled p-4 sm:p-5',
  m3Outlined: 'md-card-outlined p-4 sm:p-5',
};

/**
 * Pre-compiled Class strings for Badge Variants
 */
export const BADGE_THEME_CLASSES: Record<BadgeVariant, string> = {
  blue: 'app-badge-blue',
  emerald: 'app-badge-emerald',
  amber: 'app-badge-amber',
  purple: 'app-badge-purple',
  slate: 'app-badge-slate',
  m3Primary: 'app-badge-blue',
  m3Tertiary: 'app-badge-emerald',
  m3Error: 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold leading-none bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 whitespace-nowrap',
};

/**
 * Input & Form Style Classes
 */
export const INPUT_THEME_CLASSES = {
  input: 'app-input',
  select: 'app-select',
};

/**
 * Helper utility function to retrieve button class strings with custom overrides
 */
export function getButtonThemeClass(variant: ButtonVariant, extraClasses: string = ''): string {
  const baseClass = BUTTON_THEME_CLASSES[variant] || BUTTON_THEME_CLASSES.secondary;
  return extraClasses ? `${baseClass} ${extraClasses}` : baseClass;
}

/**
 * Helper utility function to retrieve card class strings
 */
export function getCardThemeClass(variant: CardVariant = 'base', extraClasses: string = ''): string {
  const baseClass = CARD_THEME_CLASSES[variant] || CARD_THEME_CLASSES.base;
  return extraClasses ? `${baseClass} ${extraClasses}` : baseClass;
}

/**
 * Helper utility function to retrieve badge class strings
 */
export function getBadgeThemeClass(variant: BadgeVariant = 'blue', extraClasses: string = ''): string {
  const baseClass = BADGE_THEME_CLASSES[variant] || BADGE_THEME_CLASSES.blue;
  return extraClasses ? `${baseClass} ${extraClasses}` : baseClass;
}
