import { afterEach, describe, expect, it } from 'vitest';
import { colord } from 'colord';
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  DEMO_ART,
  MEDIA,
  THEMES,
  TIER_PALETTES,
  applyCssVars,
  buildAppearance,
  cssVariablesResolver,
  resolveAppearance,
} from './themes';

// Every variable CLAUDE.md promises buildAppearance() sets on <html>.
const REQUIRED_VARS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--border',
  '--border-soft',
  '--text',
  '--text-dim',
  '--text-faint',
  '--accent',
  '--accent-fill',
  '--accent-hover',
  '--accent-on',
  '--shadow',
  '--overlay',
  '--tier-s',
  '--tier-a',
  '--tier-b',
  '--tier-c',
  '--tier-d',
  '--tier-todo',
  '--tier-ink',
  ...Object.keys(MEDIA),
];

const combos = Object.keys(THEMES).flatMap((theme) =>
  Object.keys(ACCENTS).flatMap((accent) => Object.keys(TIER_PALETTES).map((tierPalette) => ({ theme, accent, tierPalette })))
);

describe('catalogue', () => {
  it('3 dark + 3 light themes, 8 accents, 3 tier palettes', () => {
    const schemes = Object.values(THEMES).map((t) => t.scheme);
    expect(schemes.filter((s) => s === 'dark')).toHaveLength(3);
    expect(schemes.filter((s) => s === 'light')).toHaveLength(3);
    expect(Object.keys(ACCENTS)).toHaveLength(8);
    expect(Object.keys(TIER_PALETTES)).toHaveLength(3);
  });

  it('every theme color is a valid color', () => {
    for (const [key, t] of Object.entries(THEMES)) {
      for (const f of ['bg', 'surface', 'surface2', 'surface3', 'border', 'borderSoft', 'text', 'textDim', 'textFaint']) {
        expect(colord(t[f]).isValid(), `${key}.${f}`).toBe(true);
      }
      expect(t.label).toBeTruthy();
    }
  });

  it('a dark theme’s signature accent exists', () => {
    for (const t of Object.values(THEMES)) if (t.accent) expect(ACCENTS[t.accent]).toBeDefined();
  });

  it('every accent has a 10-shade valid scale and in-range shade indexes', () => {
    for (const [key, a] of Object.entries(ACCENTS)) {
      expect(a.scale, key).toHaveLength(10);
      a.scale.forEach((c) => expect(colord(c).isValid(), key).toBe(true));
      for (const i of [a.onDark, a.onLight, a.textDark, a.textLight]) {
        expect(i >= 0 && i <= 9, key).toBe(true);
      }
    }
  });

  it('every tier palette has S..D + TODO, all valid', () => {
    for (const [key, p] of Object.entries(TIER_PALETTES)) {
      expect(Object.keys(p.colors).sort(), key).toEqual(['A', 'B', 'C', 'D', 'S', 'TODO']);
      Object.values(p.colors).forEach((c) => expect(colord(c).isValid()).toBe(true));
    }
  });

  it('media colors and demo art are valid colors', () => {
    Object.values(MEDIA).forEach((c) => expect(colord(c).isValid()).toBe(true));
    DEMO_ART.flat().forEach((c) => expect(colord(c).isValid()).toBe(true));
  });

  it('default look is Tokyo Night + Blue + Vivid', () => {
    expect(DEFAULT_APPEARANCE).toEqual({ theme: 'tokyo', accent: 'blue', tierPalette: 'vivid' });
  });
});

describe('resolveAppearance', () => {
  it('keeps a valid choice', () => {
    expect(resolveAppearance({ theme: 'sand', accent: 'pink', tierPalette: 'classic' })).toEqual({
      theme: 'sand',
      accent: 'pink',
      tierPalette: 'classic',
    });
  });

  it('falls back per field', () => {
    expect(resolveAppearance({ theme: 'x', accent: 'teal' })).toEqual({ theme: 'tokyo', accent: 'teal', tierPalette: 'vivid' });
  });

  it('null / undefined / junk -> defaults', () => {
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance('tokyo')).toEqual(DEFAULT_APPEARANCE);
  });

  it('drops extra fields', () => {
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE, extra: 1 })).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('buildAppearance', () => {
  it(`covers all ${combos.length} theme x accent x palette combinations`, () => {
    expect(combos).toHaveLength(6 * 8 * 3);
  });

  it.each(combos)('$theme / $accent / $tierPalette sets every variable, none undefined', (choice) => {
    const { cssVars, choice: c, scheme, mantineTheme } = buildAppearance(choice);
    expect(c).toEqual(choice);
    expect(scheme).toBe(THEMES[choice.theme].scheme);
    for (const name of REQUIRED_VARS) {
      expect(cssVars[name], name).toBeTypeOf('string');
      expect(cssVars[name].length, name).toBeGreaterThan(0);
      expect(cssVars[name], name).not.toContain('undefined');
    }
    for (const [k, val] of Object.entries(cssVars)) {
      expect(val, k).not.toBeUndefined();
      expect(val, k).not.toBeNull();
      expect(colord(val).isValid(), `${k}=${val}`).toBe(true);
    }
    expect(mantineTheme.primaryColor).toBe('accent');
    expect(mantineTheme.colors.accent).toEqual(ACCENTS[choice.accent].scale);
    expect(mantineTheme.colors.dark).toHaveLength(10);
    expect(mantineTheme.colors.gray).toHaveLength(10);
    mantineTheme.colors.dark.forEach((col) => expect(colord(col).isValid()).toBe(true));
  });

  it('tier variables are the palette colors', () => {
    const { cssVars } = buildAppearance({ theme: 'paper', accent: 'blue', tierPalette: 'heat' });
    const p = TIER_PALETTES.heat.colors;
    expect([cssVars['--tier-s'], cssVars['--tier-a'], cssVars['--tier-b'], cssVars['--tier-c'], cssVars['--tier-d'], cssVars['--tier-todo']]).toEqual([
      p.S,
      p.A,
      p.B,
      p.C,
      p.D,
      p.TODO,
    ]);
  });

  it('chrome variables are the theme colors', () => {
    const t = THEMES.dracula;
    const { cssVars } = buildAppearance({ theme: 'dracula' });
    expect(cssVars['--bg']).toBe(t.bg);
    expect(cssVars['--surface-2']).toBe(t.surface2);
    expect(cssVars['--border-soft']).toBe(t.borderSoft);
    expect(cssVars['--text-faint']).toBe(t.textFaint);
  });

  it('accent fill uses the dark / light shade by scheme', () => {
    const a = ACCENTS.violet;
    expect(buildAppearance({ theme: 'tokyo', accent: 'violet' }).cssVars['--accent-fill']).toBe(a.scale[a.onDark]);
    expect(buildAppearance({ theme: 'paper', accent: 'violet' }).cssVars['--accent-fill']).toBe(a.scale[a.onLight]);
    expect(buildAppearance({ theme: 'tokyo', accent: 'violet' }).cssVars['--accent']).toBe(a.scale[a.textDark]);
    expect(buildAppearance({ theme: 'paper', accent: 'violet' }).cssVars['--accent']).toBe(a.scale[a.textLight]);
  });

  it('accent-on is dark or white text', () => {
    for (const c of combos) expect(['#111111', '#ffffff']).toContain(buildAppearance(c).cssVars['--accent-on']);
  });

  it('shadow and overlay differ between dark and light schemes', () => {
    const dark = buildAppearance({ theme: 'tokyo' }).cssVars;
    const light = buildAppearance({ theme: 'paper' }).cssVars;
    expect(dark['--shadow']).not.toBe(light['--shadow']);
    expect(dark['--overlay']).not.toBe(light['--overlay']);
  });

  it('media colors are the same in every theme', () => {
    for (const c of combos) {
      const { cssVars } = buildAppearance(c);
      for (const [k, val] of Object.entries(MEDIA)) expect(cssVars[k]).toBe(val);
    }
  });

  it('an invalid choice builds the default look', () => {
    expect(buildAppearance({ theme: 'nope', accent: 'nope', tierPalette: 'nope' }).cssVars).toEqual(buildAppearance(DEFAULT_APPEARANCE).cssVars);
    expect(buildAppearance(undefined).choice).toEqual(DEFAULT_APPEARANCE);
  });

  it('variantColorResolver: readable text on filled accent and tier colors', () => {
    const { mantineTheme } = buildAppearance(DEFAULT_APPEARANCE);
    const theme = mergeMantineTheme(DEFAULT_THEME, mantineTheme);
    const resolve = (color, variant = 'filled') => theme.variantColorResolver({ color, variant, theme });
    expect(resolve('accent').color).toBe('var(--accent-on)');
    expect(resolve('var(--tier-s)').color).toBe('var(--tier-ink)');
    expect(resolve('accent', 'light').color).not.toBe('var(--accent-on)');
  });
});

describe('cssVariablesResolver', () => {
  it('points Mantine’s colors at our variables, same in both schemes', () => {
    const r = cssVariablesResolver();
    expect(r.dark).toEqual(r.light);
    expect(r.dark['--mantine-color-body']).toBe('var(--bg)');
    expect(r.dark['--mantine-color-text']).toBe('var(--text)');
    Object.values(r.dark).forEach((val) => expect(val).toMatch(/^var\(--[a-z0-9-]+\)$/));
  });
});

describe('applyCssVars', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('sets each variable on <html>', () => {
    const { cssVars } = buildAppearance({ theme: 'sand', accent: 'amber', tierPalette: 'classic' });
    applyCssVars(cssVars);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg')).toBe(THEMES.sand.bg);
    expect(style.getPropertyValue('--tier-s')).toBe(TIER_PALETTES.classic.colors.S);
    expect(style.getPropertyValue('--tier-ink')).toBe('#101114');
  });
});
