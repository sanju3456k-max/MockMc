import React, { forwardRef, useEffect, useRef } from 'react';

/**
 * 🏛️ Google Material 3 (Material You / M3) Official Web Components Integration
 * Direct bindings to official Google @material/web custom elements.
 */

// ============================================================================
// 1. MATERIAL 3 COLOR TOKENS & SURFACE ROLES
// ============================================================================
export const M3_TOKENS = {
  colors: {
    surface: 'bg-[#f8f9fa] dark:bg-[#111318] text-[#1f1f1f] dark:text-[#e3e3e3]',
    surfaceDim: 'bg-[#ded8e1] dark:bg-[#111318]',
    surfaceBright: 'bg-[#f8f9fa] dark:bg-[#38393e]',
    surfaceContainerLowest: 'bg-[#ffffff] dark:bg-[#0c0e12]',
    surfaceContainerLow: 'bg-[#f0f4f9] dark:bg-[#191c20]',
    surfaceContainer: 'bg-[#e9eef6] dark:bg-[#1e2024]',
    surfaceContainerHigh: 'bg-[#e3e8ef] dark:bg-[#282a2f]',
    surfaceContainerHighest: 'bg-[#dde3ea] dark:bg-[#33353a]',

    primary: 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]',
    primaryContainer: 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#041e49] dark:text-[#c2e7ff]',
    secondaryContainer: 'bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff]',
    tertiaryContainer: 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0]',
    errorContainer: 'bg-[#ffdad6] dark:bg-[#93000a] text-[#410002] dark:text-[#ffdad6]',

    outline: 'border-[#79747e] dark:border-[#938f99]',
    outlineVariant: 'border-[#e1e3e1] dark:border-[#44474f]',
  },
  shapes: {
    none: 'rounded-none',
    extraSmall: 'rounded-[4px]',
    small: 'rounded-[8px]',
    medium: 'rounded-[12px]',
    large: 'rounded-[16px]',
    extraLarge: 'rounded-[24px]',
    full: 'rounded-full',
  },
  elevation: {
    level0: 'shadow-none',
    level1: 'shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]',
    level2: 'shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]',
    level3: 'shadow-[0_4px_12px_rgba(0,0,0,0.10)]',
  }
};

// ============================================================================
// 2. OFFICIAL M3 BUTTONS (Direct @material/web Custom Elements)
// ============================================================================

export interface M3ButtonProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'filled' | 'tonal' | 'elevated' | 'outlined' | 'text' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
  trailingIcon?: boolean;
}

export const M3Button = forwardRef<HTMLElement, M3ButtonProps>(
  ({ variant = 'filled', disabled, type = 'button', icon, className = '', children, ...props }, ref) => {
    const iconSlot = icon ? <span slot="icon" className="flex items-center justify-center">{icon}</span> : null;

    if (variant === 'tonal') {
      return (
        <md-filled-tonal-button ref={ref} disabled={disabled} type={type} class={className} {...props}>
          {iconSlot}
          {children}
        </md-filled-tonal-button>
      );
    }
    if (variant === 'elevated') {
      return (
        <md-elevated-button ref={ref} disabled={disabled} type={type} class={className} {...props}>
          {iconSlot}
          {children}
        </md-elevated-button>
      );
    }
    if (variant === 'outlined') {
      return (
        <md-outlined-button ref={ref} disabled={disabled} type={type} class={className} {...props}>
          {iconSlot}
          {children}
        </md-outlined-button>
      );
    }
    if (variant === 'text') {
      return (
        <md-text-button ref={ref} disabled={disabled} type={type} class={className} {...props}>
          {iconSlot}
          {children}
        </md-text-button>
      );
    }

    return (
      <md-filled-button ref={ref} disabled={disabled} type={type} class={className} {...props}>
        {iconSlot}
        {children}
      </md-filled-button>
    );
  }
);
M3Button.displayName = 'M3Button';

// ============================================================================
// 2.5. OFFICIAL M3 FLOATING ACTION BUTTON (FAB)
// ============================================================================

export interface M3FabProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'surface' | 'primary' | 'secondary' | 'tertiary';
  size?: 'small' | 'medium' | 'large';
  label?: string;
  lowered?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const M3Fab = forwardRef<HTMLElement, M3FabProps>(
  ({ variant = 'primary', size = 'medium', label, lowered = false, disabled, icon, className = '', children, ...props }, ref) => {
    return (
      <md-fab
        ref={ref}
        variant={variant}
        size={size}
        label={label}
        lowered={lowered}
        disabled={disabled}
        class={className}
        {...props}
      >
        {icon && <span slot="icon" className="flex items-center justify-center">{icon}</span>}
        {children}
      </md-fab>
    );
  }
);
M3Fab.displayName = 'M3Fab';

// ============================================================================
// 3. OFFICIAL M3 ICON BUTTONS (Direct @material/web Custom Elements)
// ============================================================================

export interface M3IconButtonProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  toggle?: boolean;
  selected?: boolean;
}

export const M3IconButton = forwardRef<HTMLElement, M3IconButtonProps>(
  ({ variant = 'standard', disabled, type = 'button', toggle, selected, className = '', children, ...props }, ref) => {
    if (variant === 'filled') {
      return (
        <md-filled-icon-button ref={ref} disabled={disabled} type={type} toggle={toggle} selected={selected} class={className} {...props}>
          {children}
        </md-filled-icon-button>
      );
    }
    if (variant === 'tonal') {
      return (
        <md-filled-tonal-icon-button ref={ref} disabled={disabled} type={type} toggle={toggle} selected={selected} class={className} {...props}>
          {children}
        </md-filled-tonal-icon-button>
      );
    }
    if (variant === 'outlined') {
      return (
        <md-outlined-icon-button ref={ref} disabled={disabled} type={type} toggle={toggle} selected={selected} class={className} {...props}>
          {children}
        </md-outlined-icon-button>
      );
    }
    return (
      <md-icon-button ref={ref} disabled={disabled} type={type} toggle={toggle} selected={selected} class={className} {...props}>
        {children}
      </md-icon-button>
    );
  }
);
M3IconButton.displayName = 'M3IconButton';

// ============================================================================
// 4. OFFICIAL M3 CHIPS (Direct @material/web Custom Elements)
// ============================================================================

export interface M3ChipProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'filter' | 'assist' | 'suggestion';
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  elevated?: boolean;
  icon?: React.ReactNode;
}

export const M3Chip = forwardRef<HTMLElement, M3ChipProps>(
  ({ variant = 'filter', label, selected = false, disabled, elevated, icon, className = '', children, ...props }, ref) => {
    const iconSlot = icon ? <span slot="icon" className="flex items-center justify-center">{icon}</span> : null;

    if (variant === 'assist') {
      return (
        <md-assist-chip ref={ref} label={label} disabled={disabled} elevated={elevated} class={className} {...props}>
          {iconSlot}
          {children}
        </md-assist-chip>
      );
    }
    if (variant === 'suggestion') {
      return (
        <md-suggestion-chip ref={ref} label={label} disabled={disabled} elevated={elevated} class={className} {...props}>
          {iconSlot}
          {children}
        </md-suggestion-chip>
      );
    }
    return (
      <md-filter-chip ref={ref} label={label} selected={selected} disabled={disabled} elevated={elevated} class={className} {...props}>
        {iconSlot}
        {children}
      </md-filter-chip>
    );
  }
);
M3Chip.displayName = 'M3Chip';

// ============================================================================
// 5. OFFICIAL M3 SWITCH (Direct @material/web Custom Elements)
// ============================================================================

export interface M3SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  icons?: boolean;
}

export const M3Switch: React.FC<M3SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  id,
  icons = true,
}) => {
  const switchRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = switchRef.current;
    if (!el) return;
    const handleChange = (e: Event) => {
      const target = e.target as any;
      if (target && typeof target.checked !== 'undefined') {
        onChange(target.checked);
      } else if (target && typeof target.selected !== 'undefined') {
        onChange(target.selected);
      }
    };
    el.addEventListener('change', handleChange);
    return () => el.removeEventListener('change', handleChange);
  }, [onChange]);

  return (
    <md-switch
      ref={switchRef}
      id={id}
      selected={checked}
      disabled={disabled}
      icons={icons}
      class={className}
      onClick={() => onChange(!checked)}
    />
  );
};

// ============================================================================
// 6. OFFICIAL M3 DIVIDER (Direct @material/web Custom Elements)
// ============================================================================

export const M3Divider: React.FC<{ inset?: boolean; className?: string }> = ({ inset = false, className = '' }) => (
  <md-divider inset={inset} class={className} />
);

// ============================================================================
// 7. OFFICIAL M3 CARDS & SURFACES
// ============================================================================

export interface M3CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined';
  interactive?: boolean;
}

export const M3Card = forwardRef<HTMLDivElement, M3CardProps>(
  ({ variant = 'elevated', interactive = false, className = '', children, ...props }, ref) => {
    let cardStyle = '';
    
    switch (variant) {
      case 'filled':
        cardStyle = 'bg-[#f0f4f9] dark:bg-[#191c20] text-[#1f1f1f] dark:text-[#e3e3e3] border border-[#e1e3e1]/40 dark:border-[#44474f]/20';
        break;
      case 'outlined':
        cardStyle = 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border border-[#e1e3e1]/70 dark:border-[#44474f]/40';
        break;
      case 'elevated':
      default:
        cardStyle = 'bg-white dark:bg-[#1e2024] text-[#1f1f1f] dark:text-[#e3e3e3] border border-[#e1e3e1]/60 dark:border-[#44474f]/30 shadow-[0_1px_3px_rgba(0,0,0,0.06)]';
        break;
    }

    const interactiveStyle = interactive 
      ? 'cursor-pointer hover:bg-[#f8f9fc] dark:hover:bg-[#25282e] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.99] transition-all duration-200' 
      : 'transition-all duration-200';

    return (
      <div
        ref={ref}
        className={`rounded-[24px] p-5 sm:p-6 overflow-hidden ${cardStyle} ${interactiveStyle} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
M3Card.displayName = 'M3Card';

// ============================================================================
// 8. M3 SEARCH BAR
// ============================================================================

export interface M3SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const M3SearchBar = forwardRef<HTMLInputElement, M3SearchBarProps>(
  ({ leadingIcon, trailingIcon, className = '', ...props }, ref) => {
    return (
      <div className={`h-12 sm:h-14 w-full rounded-full bg-[#edf2f7] dark:bg-[#1e2024] border border-[#e1e3e1]/60 dark:border-[#44474f]/30 flex items-center px-4 gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] focus-within:border-[#0b57d0] dark:focus-within:border-[#a8c7fa] focus-within:shadow-[0_2px_8px_rgba(11,87,208,0.12)] transition-all ${className}`.trim()}>
        {leadingIcon && <div className="text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">{leadingIcon}</div>}
        <input
          ref={ref}
          type="text"
          className="w-full bg-transparent text-sm sm:text-base text-[#1f1f1f] dark:text-[#e3e3e3] placeholder:text-[#5e5e5e]/70 dark:placeholder:text-[#9aa0a6]/70 border-0 outline-none focus:ring-0"
          {...props}
        />
        {trailingIcon && <div className="text-[#5e5e5e] dark:text-[#9aa0a6] shrink-0">{trailingIcon}</div>}
      </div>
    );
  }
);
M3SearchBar.displayName = 'M3SearchBar';
