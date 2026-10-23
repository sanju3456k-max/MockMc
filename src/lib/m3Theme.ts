/**
 * Material 3 (M3) Dynamic Color & Tonal Palette Generator
 * Powered by @material/material-color-utilities
 * Produces full Google M3 Light and Dark palettes, elevation levels, and motion tokens.
 */
import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

export interface M3ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  shadow: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
}

export const DEFAULT_M3_SEED_COLOR = '#0084FF'; // Google Brand Blue

/**
 * Generate full M3 Scheme from a seed HEX color
 */
export function generateM3Theme(seedHex: string = DEFAULT_M3_SEED_COLOR) {
  const argb = argbFromHex(seedHex);
  const theme = themeFromSourceColor(argb);

  const convertScheme = (scheme: any): M3ThemeColors => ({
    primary: hexFromArgb(scheme.primary),
    onPrimary: hexFromArgb(scheme.onPrimary),
    primaryContainer: hexFromArgb(scheme.primaryContainer),
    onPrimaryContainer: hexFromArgb(scheme.onPrimaryContainer),
    secondary: hexFromArgb(scheme.secondary),
    onSecondary: hexFromArgb(scheme.onSecondary),
    secondaryContainer: hexFromArgb(scheme.secondaryContainer),
    onSecondaryContainer: hexFromArgb(scheme.onSecondaryContainer),
    tertiary: hexFromArgb(scheme.tertiary),
    onTertiary: hexFromArgb(scheme.onTertiary),
    tertiaryContainer: hexFromArgb(scheme.tertiaryContainer),
    onTertiaryContainer: hexFromArgb(scheme.onTertiaryContainer),
    error: hexFromArgb(scheme.error),
    onError: hexFromArgb(scheme.onError),
    errorContainer: hexFromArgb(scheme.errorContainer),
    onErrorContainer: hexFromArgb(scheme.onErrorContainer),
    background: hexFromArgb(scheme.background),
    onBackground: hexFromArgb(scheme.onBackground),
    surface: hexFromArgb(scheme.surface),
    onSurface: hexFromArgb(scheme.onSurface),
    surfaceVariant: hexFromArgb(scheme.surfaceVariant),
    onSurfaceVariant: hexFromArgb(scheme.onSurfaceVariant),
    outline: hexFromArgb(scheme.outline),
    outlineVariant: hexFromArgb(scheme.outlineVariant),
    shadow: hexFromArgb(scheme.shadow),
    scrim: hexFromArgb(scheme.scrim),
    inverseSurface: hexFromArgb(scheme.inverseSurface),
    inverseOnSurface: hexFromArgb(scheme.inverseOnSurface),
    inversePrimary: hexFromArgb(scheme.inversePrimary),
    surfaceDim: hexFromArgb(scheme.surfaceDim || scheme.surface),
    surfaceBright: hexFromArgb(scheme.surfaceBright || scheme.surface),
    surfaceContainerLowest: hexFromArgb(scheme.surfaceContainerLowest || scheme.surface),
    surfaceContainerLow: hexFromArgb(scheme.surfaceContainerLow || scheme.surfaceVariant),
    surfaceContainer: hexFromArgb(scheme.surfaceContainer || scheme.surfaceVariant),
    surfaceContainerHigh: hexFromArgb(scheme.surfaceContainerHigh || scheme.surfaceVariant),
    surfaceContainerHighest: hexFromArgb(scheme.surfaceContainerHighest || scheme.surfaceVariant),
  });

  return {
    light: convertScheme(theme.schemes.light),
    dark: convertScheme(theme.schemes.dark),
  };
}

/**
 * Apply generated M3 CSS custom properties to the document root
 */
export function applyM3ThemeToDOM(seedHex: string = DEFAULT_M3_SEED_COLOR) {
  if (typeof document === 'undefined') return;

  const { light, dark } = generateM3Theme(seedHex);
  const root = document.documentElement;

  const setProperties = (scheme: M3ThemeColors, prefix: string) => {
    Object.entries(scheme).forEach(([key, value]) => {
      // kebab-case conversion
      const kebab = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
      root.style.setProperty(`--${prefix}-${kebab}`, value);
    });
  };

  setProperties(light, 'md-sys-color-light');
  setProperties(dark, 'md-sys-color-dark');
}
