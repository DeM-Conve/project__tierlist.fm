import { DEFAULT_THEME, createTheme, defaultVariantColorsResolver, isLightColor, rem } from '@mantine/core';
import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';
import labPlugin from 'colord/plugins/lab';

extend([mixPlugin, labPlugin]);

// THE single source of truth for every color in the app.
//
// A look is three independent choices, all picked in Settings -> Appearance:
//   THEMES        - the chrome (backgrounds, surfaces, borders, text), dark or light
//   ACCENTS       - buttons / active states / rings (works with any theme)
//   TIER_PALETTES - the S..D colors (+ a neutral TODO)
//
// buildAppearance() turns a choice into (a) CSS variables set on <html>
// (--bg, --surface, --accent, --tier-s, ...) that every component and
// App.css read, and (b) the Mantine theme, so Mantine components match.
// Nothing else in the app should hard-code a color - reference a variable
// (or TIER_COLORS / TIER_INK, which are themselves variables).

// THE spacing scale - every margin, padding and gap in the app is one of
// these keys (Mantine props: gap="2xs", p="md"; CSS: var(--mantine-spacing-2xs)),
// never a hand-typed number. Mantine's own xs..xl (10 12 16 20 32px) stay as
// they are (its components use them), with steps added below xs (Mantine has
// none) and above xl, named by how many steps they sit from xs/xl:
//   5xs 2 · 4xs 4 · 3xs 6 · 2xs 8 · xs 10 · sm 12 · md 16 · lg 20 · xl 32 ·
//   2xl 40 · 3xl 48 · 4xl 64 · 5xl 80   (px at the default 16px root)
// Every key becomes a --mantine-spacing-<key> CSS variable.
export const SPACING = {
  '5xs': rem(2),
  '4xs': rem(4),
  '3xs': rem(6),
  '2xs': rem(8),
  ...DEFAULT_THEME.spacing,
  '2xl': rem(40),
  '3xl': rem(48),
  '4xl': rem(64),
  '5xl': rem(80),
};

// THE type scale - every font size in the app is one of these keys (Mantine
// props: fz="md", size="sm"; CSS: var(--mantine-font-size-md)), never a
// hand-typed number. Set to VS Code's density, not Mantine's roomier
// defaults: 13px body (md - Mantine's default text size), 12px secondary,
// 11px uppercase section labels, modest headings. Mantine's components read
// the same keys, so menus, inputs, tooltips and buttons follow.
//   2xs 10 · xs 11 · sm 12 · md 13 · lg 14 · xl 16 · 2xl 20 · 3xl 26 · 4xl 32
export const FONT_SIZES = {
  '2xs': rem(10),
  xs: rem(11),
  sm: rem(12),
  md: rem(13),
  lg: rem(14),
  xl: rem(16),
  '2xl': rem(20),
  '3xl': rem(26),
  '4xl': rem(32),
};
// Title order -> size: a page title (h1) is 3xl, a section heading (h2)
// xl, a card/sub heading (h3) lg - so a <Title> needs no fz of its own.
export const HEADING_SIZES = {
  h1: { fontSize: FONT_SIZES['3xl'], lineHeight: '1.2' },
  h2: { fontSize: FONT_SIZES.xl, lineHeight: '1.3' },
  h3: { fontSize: FONT_SIZES.lg, lineHeight: '1.35' },
  h4: { fontSize: FONT_SIZES.md, lineHeight: '1.4' },
  h5: { fontSize: FONT_SIZES.sm, lineHeight: '1.4' },
  h6: { fontSize: FONT_SIZES.xs, lineHeight: '1.4' },
};
// Control heights at the same density (VS Code's buttons and inputs are
// ~26-30px, Mantine's default sm is 36px): the default size (sm) is 30px
// with body-size text, xs 26px. Larger sizes keep Mantine's values.
export const CONTROL = {
  sm: { height: rem(30), fz: 'var(--mantine-font-size-md)', padX: 'var(--mantine-spacing-sm)' },
  xs: { height: rem(26), fz: 'var(--mantine-font-size-sm)', padX: 'var(--mantine-spacing-xs)' },
};
const control = (size) => CONTROL[size ?? 'sm'];

// Dark themes follow widely used editor/terminal palettes so each has a
// clearly different character; `accent` = its signature accent, applied when
// the theme is picked (the user can still change the accent after).
export const THEMES = {
  // Tokyo Night (enkia) - deep indigo night with a blue accent.
  tokyo: {
    label: 'Tokyo Night',
    scheme: 'dark',
    accent: 'blue',
    bg: '#16161e', surface: '#1a1b26', surface2: '#24283b', surface3: '#292e42',
    border: '#3b4261', borderSoft: '#292e42',
    text: '#c0caf5', textDim: '#a9b1d6', textFaint: '#565f89',
  },
  // Dracula (draculatheme.com) - purple-grey with its signature purple.
  dracula: {
    label: 'Dracula',
    scheme: 'dark',
    accent: 'violet',
    bg: '#21222c', surface: '#282a36', surface2: '#343746', surface3: '#44475a',
    border: '#4d5066', borderSoft: '#383a4a',
    text: '#f8f8f2', textDim: '#c3c6de', textFaint: '#6272a4',
  },
  // The app's original look (pair with the Amber accent for the exact original).
  charcoal: {
    label: 'Warm charcoal',
    scheme: 'dark',
    accent: 'amber',
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
// The 8 most common accent choices. Most reuse Mantine's own tested default
// palettes; Violet and Amber are custom scales (Amber = the app's original).
const mantineAccent = (key, label) => ({
  label,
  scale: [...DEFAULT_THEME.colors[key]],
  onDark: 7, onLight: 6, textDark: 4, textLight: 7,
});

export const ACCENTS = {
  blue: mantineAccent('blue', 'Blue'),
  violet: {
    label: 'Violet',
    scale: ['#f1efff', '#e2ddff', '#c6bcff', '#a999fb', '#9585f8', '#8b7cf6', '#7a69ee', '#6856d9', '#5646b8', '#443893'],
    onDark: 6, onLight: 7, textDark: 5, textLight: 7,
  },
  teal: mantineAccent('teal', 'Teal'),
  green: mantineAccent('green', 'Green'),
  pink: mantineAccent('pink', 'Pink'),
  red: mantineAccent('red', 'Red'),
  orange: mantineAccent('orange', 'Orange'),
  amber: {
    label: 'Amber',
    scale: ['#fdf3e0', '#f7e6c2', '#f0d5a0', '#e9c37d', '#e2b15c', '#d6a24c', '#c48f3a', '#a97a2f', '#8a6326', '#6b4c1d'],
    onDark: 5, onLight: 7, textDark: 5, textLight: 8,
  },
};

export const TIER_PALETTES = {
  vivid: {
    label: 'Vivid',
    colors: { S: '#ff5a5f', A: '#ff9f43', B: '#ffd43b', C: '#7bd88f', D: '#4dabf7', TODO: '#c3c8d2' },
  },
  classic: {
    label: 'TierMaker classic',
    colors: { S: '#ff7f7f', A: '#ffbf7f', B: '#ffdf7f', C: '#bfff7f', D: '#7fdfff', TODO: '#d4d4d4' },
  },
  heat: {
    label: 'Heat',
    colors: { S: '#e8503a', A: '#e8823a', B: '#e8b93a', C: '#b9c93a', D: '#4caf6e', TODO: '#c8c2b8' },
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

export const DEFAULT_APPEARANCE = { theme: 'tokyo', accent: 'blue', tierPalette: 'vivid' };

// Color math comes from libraries (colord's mix plugin, Mantine's
// isLightColor) rather than hand-rolled hex arithmetic.
const mix = (a, b, t) => colord(a).mix(b, t).toHex();

// `base` moved toward `target` until it looks `delta` different (colord's
// CIEDE2000 delta, 0..1) - a perceptual step, so the same `delta` reads the
// same in every theme, dark or light, with no per-theme numbers.
function step(base, target, delta) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (colord(base).delta(mix(base, target, t)) < delta) lo = t;
    else hi = t;
  }
  return mix(base, target, hi);
}

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
  const editor = t.surface;
  // The shell, VS Code-style, computed at run time from the theme's own
  // page and ink colors by one rule - each layer a fixed perceptual step
  // further from the page (step()) - measured off the user's VS Code
  // (editor #1E1E1E, side panel #252525, activity strip #333, frame
  // #3C3C3C): the side panel, then the activity strip (the left part of the
  // side panel's card), then the frame every card sits on. The same steps
  // give the same visible difference in any theme.
  // Like a VS Code theme, a theme may name any of these itself (THEMES
  // entry `side` / `activity` / `chrome`); only what it leaves out is derived.
  const side = t.side ?? step(editor, t.text, 0.025);
  const activity = t.activity ?? step(editor, t.text, 0.055);
  const chrome = t.chrome ?? step(editor, t.text, 0.08);

  const cssVars = {
    '--bg': t.bg,
    //   --editor  the page card (VS Code editor) - and Mantine's body color,
    //             so a Paper/Card inside it is flat, drawn by its border.
    //   --side    the side panel card (VS Code side bar).
    //   --chrome  the window frame: activity bar, gaps between the cards.
    // List rows, the filter input, borders and muted text are the side card
    // mixed toward the text, VS Code-style.
    '--editor': editor,
    '--side': side,
    '--activity': activity,
    '--chrome': chrome,
    '--chrome-border': mix(side, t.text, 0.1),
    '--chrome-fg-muted': mix(chrome, t.text, 0.7),
    '--chrome-hover': mix(side, t.text, 0.05),
    '--chrome-selected': mix(side, t.text, 0.1),
    '--chrome-input': mix(side, t.text, 0.06),
    // The sash's grip dots: a few shades above the frame (VS Code #767676
    // on #3C3C3C).
    '--sash-dot': step(chrome, t.text, 0.12),
    '--chrome-input-border': mix(side, t.text, 0.14),
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
    '--accent-on': isLightColor(fill, 0.3) ? '#111111' : '#ffffff', // 0.3 = Mantine's own default threshold
    // Shadows/scrims are black in dark themes, a soft ink in light ones.
    '--shadow': dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(20, 24, 33, 0.16)',
    '--overlay': dark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(20, 24, 33, 0.35)',
    '--tier-s': tiers.S,
    '--tier-a': tiers.A,
    '--tier-b': tiers.B,
    '--tier-c': tiers.C,
    '--tier-d': tiers.D,
    '--tier-todo': tiers.TODO, // neutral: not rated yet
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
    headings: { fontFamily: 'var(--font-display)', fontWeight: '700', sizes: HEADING_SIZES },
    fontSizes: FONT_SIZES,
    defaultRadius: 'var(--radius)',
    spacing: SPACING,
    variantColorResolver,
    components: {
      // Check marks sit on the accent fill too.
      Checkbox: { defaultProps: { iconColor: 'var(--accent-on)' } },
      Radio: { defaultProps: { iconColor: 'var(--accent-on)' } },
      // Control density (CONTROL above).
      Button: {
        vars: (_, { size }) => {
          const c = control(size);
          return c ? { root: { '--button-height': c.height, '--button-fz': c.fz, '--button-padding-x': c.padX } } : { root: {} };
        },
      },
      Input: {
        vars: (_, { size }) => {
          const c = control(size);
          return c ? { wrapper: { '--input-height': c.height, '--input-fz': c.fz } } : { wrapper: {} };
        },
      },
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
    '--mantine-color-body': 'var(--editor)',
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
