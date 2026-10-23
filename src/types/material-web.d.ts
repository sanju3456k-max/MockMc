import type * as React from 'react';

type M3BaseProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  class?: string;
  className?: string;
};

export type MaterialWebCustomElements = {
  'md-filled-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    hasIcon?: boolean;
    trailingIcon?: boolean;
  };
  'md-elevated-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    hasIcon?: boolean;
    trailingIcon?: boolean;
  };
  'md-filled-tonal-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    hasIcon?: boolean;
    trailingIcon?: boolean;
  };
  'md-outlined-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    hasIcon?: boolean;
    trailingIcon?: boolean;
  };
  'md-text-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    hasIcon?: boolean;
    trailingIcon?: boolean;
  };
  'md-fab': M3BaseProps & {
    disabled?: boolean;
    label?: string;
    lowered?: boolean;
    size?: 'small' | 'medium' | 'large';
    variant?: 'surface' | 'primary' | 'secondary' | 'tertiary';
  };
  'md-branded-fab': M3BaseProps & {
    disabled?: boolean;
    label?: string;
    lowered?: boolean;
    size?: 'small' | 'medium' | 'large';
  };
  'md-icon-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    toggle?: boolean;
    selected?: boolean;
  };
  'md-filled-icon-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    toggle?: boolean;
    selected?: boolean;
  };
  'md-filled-tonal-icon-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    toggle?: boolean;
    selected?: boolean;
  };
  'md-outlined-icon-button': M3BaseProps & {
    disabled?: boolean;
    href?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    toggle?: boolean;
    selected?: boolean;
  };
  'md-chip-set': M3BaseProps;
  'md-filter-chip': M3BaseProps & {
    disabled?: boolean;
    elevated?: boolean;
    label?: string;
    selected?: boolean;
    removable?: boolean;
    hasIcon?: boolean;
  };
  'md-assist-chip': M3BaseProps & {
    disabled?: boolean;
    elevated?: boolean;
    label?: string;
    href?: string;
    target?: string;
    hasIcon?: boolean;
  };
  'md-suggestion-chip': M3BaseProps & {
    disabled?: boolean;
    elevated?: boolean;
    label?: string;
    hasIcon?: boolean;
  };
  'md-input-chip': M3BaseProps & {
    disabled?: boolean;
    elevated?: boolean;
    label?: string;
    selected?: boolean;
    removeOnly?: boolean;
    avatar?: boolean;
  };
  'md-list': M3BaseProps;
  'md-list-item': M3BaseProps & {
    disabled?: boolean;
    type?: 'text' | 'button' | 'link';
    href?: string;
    target?: string;
    headline?: string;
    supportingText?: string;
    active?: boolean;
  };
  'md-menu': M3BaseProps & {
    open?: boolean;
    anchor?: string | HTMLElement;
    positioning?: 'absolute' | 'fixed' | 'document' | 'popover';
    quick?: boolean;
  };
  'md-menu-item': M3BaseProps & {
    disabled?: boolean;
    headline?: string;
    keepOpen?: boolean;
    selected?: boolean;
  };
  'md-outlined-select': M3BaseProps & {
    disabled?: boolean;
    error?: boolean;
    errorText?: string;
    label?: string;
    supportingText?: string;
    value?: string;
  };
  'md-filled-select': M3BaseProps & {
    disabled?: boolean;
    error?: boolean;
    errorText?: string;
    label?: string;
    supportingText?: string;
    value?: string;
  };
  'md-select-option': M3BaseProps & {
    disabled?: boolean;
    selected?: boolean;
    value?: string;
    headline?: string;
  };
  'md-dialog': M3BaseProps & {
    open?: boolean;
    type?: 'alert' | 'confirm';
    quick?: boolean;
  };
  'md-divider': M3BaseProps & {
    inset?: boolean;
    insetStart?: boolean;
    insetEnd?: boolean;
  };
  'md-linear-progress': M3BaseProps & {
    value?: number;
    max?: number;
    indeterminate?: boolean;
    fourColor?: boolean;
  };
  'md-circular-progress': M3BaseProps & {
    value?: number;
    max?: number;
    indeterminate?: boolean;
    fourColor?: boolean;
  };
  'md-switch': M3BaseProps & {
    disabled?: boolean;
    selected?: boolean;
    icons?: boolean;
    showOnlySelectedIcon?: boolean;
    name?: string;
    value?: string;
  };
  'md-checkbox': M3BaseProps & {
    checked?: boolean;
    disabled?: boolean;
    indeterminate?: boolean;
    name?: string;
    value?: string;
  };
  'md-radio': M3BaseProps & {
    checked?: boolean;
    disabled?: boolean;
    name?: string;
    value?: string;
  };
  'md-slider': M3BaseProps & {
    disabled?: boolean;
    min?: number;
    max?: number;
    value?: number;
    valueStart?: number;
    valueEnd?: number;
    range?: boolean;
    step?: number;
    ticks?: boolean;
    labeled?: boolean;
  };
  'md-tabs': M3BaseProps & {
    activeTabIndex?: number;
    autoActivate?: boolean;
  };
  'md-primary-tab': M3BaseProps & {
    active?: boolean;
    inlineIcon?: boolean;
  };
  'md-secondary-tab': M3BaseProps & {
    active?: boolean;
  };
  'md-outlined-text-field': M3BaseProps & {
    disabled?: boolean;
    error?: boolean;
    errorText?: string;
    label?: string;
    placeholder?: string;
    prefixText?: string;
    suffixText?: string;
    supportingText?: string;
    type?: string;
    value?: string;
    readOnly?: boolean;
    rows?: number;
  };
  'md-filled-text-field': M3BaseProps & {
    disabled?: boolean;
    error?: boolean;
    errorText?: string;
    label?: string;
    placeholder?: string;
    prefixText?: string;
    suffixText?: string;
    supportingText?: string;
    type?: string;
    value?: string;
    readOnly?: boolean;
    rows?: number;
  };
  'md-ripple': M3BaseProps & {
    disabled?: boolean;
  };
  'md-elevation': M3BaseProps;
  'md-icon': M3BaseProps;
  'md-tooltip': M3BaseProps & {
    for?: string;
    anchor?: string | HTMLElement;
  };
};

declare global {
  namespace JSX {
    interface IntrinsicElements extends MaterialWebCustomElements {}
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends MaterialWebCustomElements {}
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends MaterialWebCustomElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends MaterialWebCustomElements {}
  }
}
