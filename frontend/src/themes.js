import { DEFAULT_THEME, createTheme, defaultVariantColorsResolver, isLightColor } from '@mantine/core';
import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';

extend([mixPlugin]);

// THE single source of truth for every color in the app.
//
// A look is three independent choices, all picked in Settings -> Appearance:
//   THEMES        - the chrome (backgrounds, surfaces, borders, text), dark or light
//   ACCENTS       - buttons / active states / rings (works with any theme)
//   TIER_PALETTES - the T1..TZ colors
//
// buildAppearance() turns a choice into (a) CSS variables set on <html>
// (--bg, --surface, --accent, --tier-t1, ...) that every component and
// App.css read, and (b) the Mantine theme, so Mantine components match.
// Nothing else in the app should hard-code a color - reference a variable
// (or TIER_COLORS / TIER_INK, which are themselves variables).

export const THEMES = {
  graphite: {
    label: 'Graphite',
    scheme: 'dark',
    bg: '#0e0f12', surface: '#15171c', surface2: '#1c1f26', surface3: '#252932',
    border: '#2a2e38', borderSoft: '#20232b',
    text: '#eceef3', textDim: '#9ba1ad', textFaint: '#5f6573',
  },
  oled: {
    label: 'Pure black',
    scheme: 'dark',
    bg: '#000000', surface: '#0a0a0a', surface2: '#141414', surface3: '#1e1e1e',
    border: '#262626', borderSoft: '#181818',
    text: '#fafafa', textDim: '#a1a1a1', textFaint: '#5e5e5e',
  },
  // The app's original look (pair with the Amber accent for the exact original).
  charcoal: {
    label: 'Warm charcoal',
    scheme: 'dark',
    bg: '#131110', surface: '#1c1915', surface2: '#241f1a', surface3: '#2c2620',
    border: '#332c23', borderSoft: '#2a251e',
    text: '#f3efe8', textDim: '#94897a', textFaint: '#5c5548',
  },
  paper: {
    label: 'Paper',
    scheme: 'light',
    bg: '#f4f5f7', surface: '#ffffff', surface2: '#eceef2', surface3: '#e1e4ea',
    border: '#d5d9e0', borderSoft: '#e6e9ee',
    text: '#15171c', textDim: '#5b6270', textFaint: '#9aa1ad',
  },
  sand: {
    label: 'Sand',
    scheme: 'light',
    bg: '#f6f1e8', surface: '#fffcf6', surface2: '#eee6d8', surface3: '#e4d9c6',
    border: '#d9ccb6', borderSoft: '#e9dfce',
    text: '#241d14', textDim: '#6d6150', textFaint: '#a39580',
  },
  // Ethan Schoonover's Solarized Light palette (base3/base2 backgrounds,
  // base02/base01/base1 text).
  solarized: {
    label: 'Solarized Light',
    scheme: 'light',
    bg: '#fdf6e3', surface: '#fffbee', surface2: '#eee8d5', surface3: '#e4dcc3',
    border: '#d6cdb2', borderSoft: '#e9e2cc',
    text: '#073642', textDim: '#586e75', textFaint: '#93a1a1',
  },
};

// 10-shade scales (0 = lightest). `onDark` / `onLight` = which shade is used
// for filled buttons in a dark / light theme; `text*` = the shade used for
// accent-colored text and focus rings (var(--accent)).
export const ACCENTS = {
  violet: {
    label: 'Violet',
    scale: ['#f1efff', '#e2ddff', '#c6bcff', '#a999fb', '#9585f8', '#8b7cf6', '#7a69ee', '#6856d9', '#5646b8', '#443893'],
    onDark: 6, onLight: 7, textDark: 5, textLight: 7,
  },
  fuchsia: {
    label: 'Fuchsia',
    scale: ['#fdf0ff', '#f8d9fd', '#f0b0fa', '#e785f5', '#de5ff0', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75'],
    onDark: 6, onLight: 7, textDark: 4, textLight: 7,
  },
  cyan: {
    label: 'Cyan',
    scale: ['#e3fafc', '#c5f6fa', '#99e9f2', '#66d9e8', '#3bc9db', '#22b8cf', '#15aabf', '#1098ad', '#0c8599', '#0b7285'],
    onDark: 5, onLight: 8, textDark: 4, textLight: 8,
  },
  // The original accent (amber) - sits between T2 and T3, so it's opt-in.
  amber: {
    label: 'Amber',
    scale: ['#fdf3e0', '#f7e6c2', '#f0d5a0', '#e9c37d', '#e2b15c', '#d6a24c', '#c48f3a', '#a97a2f', '#8a6326', '#6b4c1d'],
    onDark: 5, onLight: 7, textDark: 5, textLight: 8,
  },
  // Popular accents straight from Mantine's own tested default palettes
  // (same shade conventions Mantine uses: filled 6 light / 8 dark).
  ...Object.fromEntries(
    [
      ['blue', 'Blue'],
      ['indigo', 'Indigo'],
      ['teal', 'Teal'],
      ['green', 'Green'],
      ['pink', 'Pink'],
      ['red', 'Red'],
      ['orange', 'Orange'],
    ].map(([key, label]) => [
      key,
      { label, scale: [...DEFAULT_THEME.colors[key]], onDark: 7, onLight: 6, textDark: 4, textLight: 7 },
    ])
  ),
  mono: {
    label: 'Mono',
    scale: ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b'],
    onDark: 1, onLight: 9, textDark: 2, textLight: 9,
  },
};

export const TIER_PALETTES = {
  vivid: {
    label: 'Vivid',
    colors: { T1: '#ff5a5f', T2: '#ff9f43', T3: '#ffd43b', TE: '#7bd88f', TZ: '#4dabf7' },
  },
  classic: {
    label: 'TierMaker classic',
    colors: { T1: '#ff7f7f', T2: '#ffbf7f', T3: '#ffdf7f', TE: '#bfff7f', TZ: '#7fdfff' },
  },
  heat: {
    label: 'Heat',
    colors: { T1: '#e8503a', T2: '#e8823a', T3: '#e8b93a', TE: '#b9c93a', TZ: '#4caf6e' },
  },
};

// Colors drawn *over media* (album art, the video frame) rather than over the
// theme - identical in every theme on purpose, but still tokens.
export const MEDIA = {
  '--media-bg': '#000000', // letterbox behind the video
  '--media-fg': '#ffffff', // text/icons on top of art or video
  '--media-scrim': 'rgba(0, 0, 0, 0.55)', // top shade behind hover controls on art
  '--media-scrim-soft': 'rgba(0, 0, 0, 0.25)',
  '--media-control-bg': 'rgba(0, 0, 0, 0.75)', // floating buttons/pills over video/art
  '--media-control-border': 'rgba(255, 255, 255, 0.3)',
  '--media-control-shadow': 'rgba(0, 0, 0, 0.6)',
};

// Placeholder "album art" gradients for the signed-out landing page mock.
export const DEMO_ART = [
  ['#2b2350', '#8b7cf6'],
  ['#1e3140', '#4dabf7'],
  ['#3d1f33', '#e0609a'],
  ['#1f3a2e', '#5cc98a'],
  ['#3a2a1c', '#e89a4c'],
  ['#232838', '#7d8bb0'],
  ['#3a1f24', '#e0595f'],
  ['#2f3320', '#c9c25a'],
];

export const DEFAULT_APPEARANCE = { theme: 'graphite', accent: 'violet', tierPalette: 'vivid' };

// Color math comes from libraries (colord's mix plugin, Mantine's
// isLightColor) rather than hand-rolled hex arithmetic.
const mix = (a, b, t) => colord(a).mix(b, t).toHex();

// Neutral 10-shade scale (0 = lightest) in the order Mantine expects for
// both its `dark` (dark scheme) and `gray` (light scheme) palettes.
function neutralScale(t) {
  if (t.scheme === 'dark') {
    return [t.text, mix(t.text, t.textDim, 0.5), t.textDim, t.textFaint, t.border, t.surface3, t.surface2, t.surface, mix(t.surface, t.bg, 0.5), t.bg];
  }
  return [t.surface2, t.surface3, t.borderSoft, t.border, t.border, t.textFaint, t.textDim, mix(t.textDim, t.text, 0.5), mix(t.textDim, t.text, 0.8), t.text];
}

export function resolveAppearance(choice) {
  return {
    theme: THEMES[choice?.theme] ? choice.theme : DEFAULT_APPEARANCE.theme,
    accent: ACCENTS[choice?.accent] ? choice.accent : DEFAULT_APPEARANCE.accent,
    tierPalette: TIER_PALETTES[choice?.tierPalette] ? choice.tierPalette : DEFAULT_APPEARANCE.tierPalette,
  };
}

export function buildAppearance(choice) {
  const c = resolveAppearance(choice);
  const t = THEMES[c.theme];
  const a = ACCENTS[c.accent];
  const tiers = TIER_PALETTES[c.tierPalette].colors;
  const dark = t.scheme === 'dark';
  const fill = a.scale[dark ? a.onDark : a.onLight];
  const accentText = a.scale[dark ? a.textDark : a.textLight];

  const cssVars = {
    '--bg': t.bg,
    '--surface': t.surface,
    '--surface-2': t.surface2,
    '--surface-3': t.surface3,
    '--border': t.border,
    '--border-soft': t.borderSoft,
    '--text': t.text,
    '--text-dim': t.textDim,
    '--text-faint': t.textFaint,
    '--accent': accentText,
    '--accent-fill': fill,
    '--accent-hover': a.scale[Math.min(9, (dark ? a.onDark : a.onLight) + 1)],
    '--accent-on': isLightColor(fill, 0.55) ? '#111111' : '#ffffff',
    // Shadows/scrims are black in dark themes, a soft ink in light ones.
    '--shadow': dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(20, 24, 33, 0.16)',
    '--overlay': dark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(20, 24, 33, 0.35)',
    '--tier-t1': tiers.T1,
    '--tier-t2': tiers.T2,
    '--tier-t3': tiers.T3,
    '--tier-te': tiers.TE,
    '--tier-tz': tiers.TZ,
    // Text/icons drawn on top of a tier color - every palette is bright.
    '--tier-ink': '#101114',
    ...MEDIA,
  };

  const scale = neutralScale(t);
  const mantineTheme = createTheme({
    primaryColor: 'accent',
    primaryShade: { dark: a.onDark, light: a.onLight },
    colors: { dark: scale, gray: scale, accent: a.scale },
    // Type and shape are variables too (index.css :root).
    fontFamily: 'var(--font-body)',
    headings: { fontFamily: 'var(--font-display)', fontWeight: '800' },
    defaultRadius: 'var(--radius)',
    variantColorResolver,
    components: {
      // Check marks sit on the accent fill too.
      Checkbox: { defaultProps: { iconColor: 'var(--accent-on)' } },
      Radio: { defaultProps: { iconColor: 'var(--accent-on)' } },
    },
    black: dark ? t.bg : t.text,
    white: dark ? t.text : t.surface,
  });

  return { choice: c, scheme: t.scheme, cssVars, mantineTheme };
}

// Mantine's documented hook for variant colors: text on any *filled*
// surface comes from our variables - var(--accent-on) on the accent (dark
// text on a white "Mono" accent, white on violet...) and var(--tier-ink) on
// a tier color - so filled buttons/badges/icons are readable in every theme.
function variantColorResolver(input) {
  const base = defaultVariantColorsResolver(input);
  if (input.variant !== 'filled') return base;
  const color = input.color || input.theme.primaryColor;
  if (color === 'accent') return { ...base, color: 'var(--accent-on)' };
  if (typeof color === 'string' && color.startsWith('var(--tier-')) return { ...base, color: 'var(--tier-ink)' };
  return base;
}

// Points Mantine's own color variables at ours, so there is exactly one set
// of color variables in the app (ours) and Mantine just reads them.
export function cssVariablesResolver() {
  const shared = {
    '--mantine-color-body': 'var(--bg)',
    '--mantine-color-text': 'var(--text)',
    '--mantine-color-dimmed': 'var(--text-dim)',
    '--mantine-color-placeholder': 'var(--text-faint)',
    '--mantine-color-anchor': 'var(--accent)',
    '--mantine-color-default': 'var(--surface-2)',
    '--mantine-color-default-hover': 'var(--surface-3)',
    '--mantine-color-default-color': 'var(--text)',
    '--mantine-color-default-border': 'var(--border)',
    '--mantine-primary-color-contrast': 'var(--accent-on)',
  };
  return { variables: {}, dark: shared, light: shared };
}

export function applyCssVars(cssVars) {
  const root = document.documentElement;
  Object.entries(cssVars).forEach(([k, v]) => root.style.setProperty(k, v));
}
