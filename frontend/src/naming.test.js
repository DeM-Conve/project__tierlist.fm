import { describe, expect, it } from 'vitest';
import {
  customTokens,
  detectNaming,
  exampleTitle,
  normalizeName,
  parseTitle,
  renderTitle,
  sameLabels,
  templateTokens,
  validateDisplayNames,
  validateTemplate,
  validateTierLabels,
} from './naming';
import { DEFAULT_TIER_LABELS } from './tiers';

const DEFAULT = { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS };
// A naming like a real user's: an own token in brackets, custom tier names
// and a to-do name full of symbols.
const CUSTOM = {
  template: '[{tag}] {category} {tier}',
  tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ', TODO: '(**TODO**)' },
};

describe('normalizeName', () => {
  it('folds case, accents, punctuation and underscores', () => {
    expect(normalizeName('Jazz_Cozy - TODO')).toBe('jazz cozy todo');
    expect(normalizeName('  Café  Músic ')).toBe('cafe music');
    expect(normalizeName('R&B')).toBe('r b');
  });
  it('is empty for symbols only', () => {
    expect(normalizeName('(**)')).toBe('');
  });
  it('keeps non-latin letters and digits', () => {
    expect(normalizeName('K-Pop 2024')).toBe('k pop 2024');
    expect(normalizeName('日本 ロック')).toBe('日本 ロック');
  });
});

describe('templateTokens / customTokens', () => {
  it('lists tokens in order', () => {
    expect(templateTokens('[{tag}] {category} {tier}')).toEqual(['tag', 'category', 'tier']);
  });
  it('custom tokens exclude category and tier', () => {
    expect(customTokens('[{tag}] {category} {tier} {mood}')).toEqual(['tag', 'mood']);
    expect(customTokens('{category} {tier}')).toEqual([]);
  });
});

describe('validateTemplate', () => {
  it('accepts the presets and a template with own tokens', () => {
    expect(validateTemplate('{category} {tier}')).toEqual([]);
    expect(validateTemplate('[{tag}] {category} {tier}')).toEqual([]);
    expect(validateTemplate('{tier} | {category}')).toEqual([]);
  });
  it('rejects empty', () => {
    expect(validateTemplate('   ')).toEqual(['Enter a template']);
  });
  it('requires {category} and {tier} exactly once', () => {
    expect(validateTemplate('{category}')).toContain('Must contain {tier}');
    expect(validateTemplate('{tier}')).toContain('Must contain {category}');
    expect(validateTemplate('{category} {category} {tier}')).toContain('{category} can only appear once');
    expect(validateTemplate('{category} {tier} {tier}')).toContain('{tier} can only appear once');
  });
  it('rejects bad or repeated own tokens', () => {
    expect(validateTemplate('{my tag} {category} {tier}').some((e) => e.includes("isn't a valid token"))).toBe(true);
    expect(validateTemplate('{1tag} {category} {tier}').some((e) => e.includes("isn't a valid token"))).toBe(true);
    expect(validateTemplate('{} {category} {tier}').some((e) => e.includes("isn't a valid token"))).toBe(true);
    expect(validateTemplate('{x} {x} {category} {tier}')).toContain('{x} can only appear once');
  });
  it('rejects unmatched braces', () => {
    expect(validateTemplate('{category} {tier} }')).toContain('Unmatched { or }');
    expect(validateTemplate('{ {category} {tier}')).toContain('Unmatched { or }');
  });
  it('rejects over 200 characters', () => {
    expect(validateTemplate(`${'x'.repeat(190)} {category} {tier}`)).toContain('At most 200 characters');
  });
});

describe('validateTierLabels', () => {
  it('accepts defaults and custom names with symbols', () => {
    expect(validateTierLabels(DEFAULT_TIER_LABELS)).toEqual({});
    expect(validateTierLabels(CUSTOM.tierLabels)).toEqual({});
  });
  it('flags each broken slot', () => {
    const errors = validateTierLabels({ S: '', A: ' A', B: '***', C: 'x'.repeat(21), D: 'D{', TODO: 'TODO' });
    expect(errors.S).toBe('Enter a name');
    expect(errors.A).toBe('No spaces at the start or end');
    expect(errors.B).toBe('Needs a letter or digit');
    expect(errors.C).toMatch(/At most/);
    expect(errors.D).toBe('No { or }');
    expect(errors.TODO).toBeUndefined();
  });
  it('flags names that are the same once normalized', () => {
    const errors = validateTierLabels({ ...DEFAULT_TIER_LABELS, A: 's' });
    expect(errors.A).toBe('Same as S');
  });
  it('treats missing labels as empty', () => {
    expect(Object.keys(validateTierLabels(undefined))).toHaveLength(6);
  });
});

describe('validateDisplayNames', () => {
  it('allows null/empty and duplicates', () => {
    expect(validateDisplayNames({ S: null, A: '', B: 'Good', C: 'Good' })).toEqual({});
  });
  it('flags bad names', () => {
    const errors = validateDisplayNames({ S: ' x', A: '!!', B: 'a{b}', C: 'y'.repeat(21) });
    expect(errors.S).toBeDefined();
    expect(errors.A).toBeDefined();
    expect(errors.B).toBeDefined();
    expect(errors.C).toBeDefined();
  });
});

describe('sameLabels', () => {
  it('compares all six slots', () => {
    expect(sameLabels(DEFAULT_TIER_LABELS, { ...DEFAULT_TIER_LABELS })).toBe(true);
    expect(sameLabels(DEFAULT_TIER_LABELS, { ...DEFAULT_TIER_LABELS, TODO: 'Later' })).toBe(false);
  });
});

describe('parseTitle - default naming', () => {
  const parse = (t) => parseTitle(t, [DEFAULT]);
  it('reads category and tier', () => {
    expect(parse('Rap S')).toMatchObject({ category: 'Rap', tier: 'S', fields: {} });
    expect(parse('Jazz_Cozy D')).toMatchObject({ category: 'Jazz_Cozy', tier: 'D' });
  });
  it('reads a multi-word category', () => {
    expect(parse('Rap Album A')).toMatchObject({ category: 'Rap Album', tier: 'A' });
    expect(parse('Indo Normal B')).toMatchObject({ category: 'Indo Normal', tier: 'B' });
  });
  it('reads the to-do list', () => {
    expect(parse('Rap TODO')).toMatchObject({ category: 'Rap', tier: 'TODO' });
  });
  it('tolerates extra and surrounding spaces', () => {
    expect(parse('  Rap   S ')).toMatchObject({ category: 'Rap', tier: 'S' });
  });
  it('is case-sensitive about tier names (matched exactly)', () => {
    expect(parse('Rap s')).toBeNull();
    expect(parse('Rap todo')).toBeNull();
  });
  it('ignores non-matching playlists', () => {
    expect(parse('Liked videos')).toBeNull();
    expect(parse('S')).toBeNull();
    expect(parse('Rap')).toBeNull();
    expect(parse('Rap X')).toBeNull();
  });
});

describe('parseTitle - own token and symbol tier names', () => {
  const parse = (t) => parseTitle(t, [CUSTOM]);
  it('reads the own token, category and tier', () => {
    expect(parse('[G] Rock T1')).toMatchObject({ fields: { tag: 'G' }, category: 'Rock', tier: 'S' });
    expect(parse('[Chill] Indo_Normal TZ')).toMatchObject({ fields: { tag: 'Chill' }, category: 'Indo_Normal', tier: 'D' });
  });
  it('reads the to-do name literally, symbols and all', () => {
    expect(parse('[G] Rock (**TODO**)')).toMatchObject({ category: 'Rock', tier: 'TODO' });
    expect(parse('[G] Indo Normal (**TODO**)')).toMatchObject({ category: 'Indo Normal', tier: 'TODO' });
  });
  it('does not match a loosely named to-do list', () => {
    expect(parse('[G] Rock TODO')).toBeNull();
    expect(parse('[G] Rock (TODO)')).toBeNull();
    expect(parse('Rock (**TODO**)')).toBeNull();
  });
  it('does not confuse TE with T and a longer label', () => {
    expect(parse('[G] Rock TE')).toMatchObject({ tier: 'C' });
  });
  it('a multi-word category with spaces still parses', () => {
    expect(parse('[G] Rap Album T2')).toMatchObject({ category: 'Rap Album', tier: 'A' });
  });
});

describe('parseTitle - longest label first', () => {
  it('prefers "A+" over "A"', () => {
    const naming = { template: '{category} {tier}', tierLabels: { S: 'A+', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
    expect(parseTitle('Rap A+', [naming])).toMatchObject({ category: 'Rap', tier: 'S' });
    expect(parseTitle('Rap A', [naming])).toMatchObject({ category: 'Rap', tier: 'A' });
  });
  it('a tier label with a space matches any run of spaces', () => {
    const naming = { template: '{category} - {tier}', tierLabels: { S: '5 stars', A: '4 stars', B: '3 stars', C: '2 stars', D: '1 star', TODO: 'later' } };
    expect(parseTitle('Rap - 5  stars', [naming])).toMatchObject({ category: 'Rap', tier: 'S' });
  });
});

describe('parseTitle - several namings', () => {
  it('tries the active naming first, then the old one', () => {
    const old = { template: '{category} {tier}', tierLabels: DEFAULT_TIER_LABELS };
    expect(parseTitle('[G] Rap T1', [CUSTOM, old])).toMatchObject({ tier: 'S', naming: CUSTOM });
    expect(parseTitle('Rap S', [CUSTOM, old])).toMatchObject({ tier: 'S', naming: old });
  });
  it('returns null when nothing matches', () => {
    expect(parseTitle('whatever', [CUSTOM, DEFAULT])).toBeNull();
  });
});

describe('renderTitle', () => {
  it('fills tokens', () => {
    expect(renderTitle(DEFAULT, { category: 'Rap', tier: 'S' })).toBe('Rap S');
    expect(renderTitle(CUSTOM, { fields: { tag: 'G' }, category: 'Rock', tier: 'TODO' })).toBe('[G] Rock (**TODO**)');
  });
  it('drops an own token with no value and its empty brackets', () => {
    expect(renderTitle(CUSTOM, { category: 'Rock', tier: 'S' })).toBe('Rock T1');
  });
  it('collapses whitespace', () => {
    expect(renderTitle(DEFAULT, { category: 'Rap  Album', tier: 'A' })).toBe('Rap Album A');
  });
  it('round-trips with parseTitle for every tier', () => {
    for (const tier of ['S', 'A', 'B', 'C', 'D', 'TODO']) {
      for (const category of ['Rock', 'Indo Normal', 'Indo_Normal', 'R&B', 'K-Pop']) {
        const title = renderTitle(CUSTOM, { fields: { tag: 'G' }, category, tier });
        expect(parseTitle(title, [CUSTOM])).toMatchObject({ category, tier, fields: { tag: 'G' } });
      }
    }
  });
});

describe('detectNaming', () => {
  it('finds the default naming', () => {
    expect(detectNaming(['Rap S', 'Rap A', 'Jazz B'])).toMatchObject({ template: '{category} {tier}' });
  });
  it('keeps the current template with its own tokens when it fits', () => {
    const titles = ['[G] Rock T1', '[G] Rock T2', '[H] Rap TZ'];
    expect(detectNaming(titles, CUSTOM)).toEqual(CUSTOM);
  });
  it('finds a preset with the letter presets', () => {
    const found = detectNaming(['Rap - S', 'Rap - A', 'Jazz - F'], DEFAULT);
    expect(found.template).toBe('{category} - {tier}');
  });
  it('keeps the to-do name from the current naming', () => {
    const found = detectNaming(['Rap S'], { template: '{category} {tier}', tierLabels: { ...DEFAULT_TIER_LABELS, TODO: 'Later' } });
    expect(found.tierLabels.TODO).toBe('Later');
  });
  it('falls back to the current naming when nothing matches', () => {
    expect(detectNaming(['Liked videos'], CUSTOM)).toEqual(CUSTOM);
  });
});

describe('exampleTitle', () => {
  it('keeps own tokens as placeholders', () => {
    expect(exampleTitle(CUSTOM, 'Rap', 'S')).toBe('[{tag}] Rap T1');
  });
});
