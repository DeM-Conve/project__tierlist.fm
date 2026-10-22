import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINIMUMS, isValidMinimums, minimumsFromBorders, previewCounts, rangeText, tierRanges, validateMinimums,
} from './tierRanges';

const names = { S: 'T1', A: 'T2', B: 'T3', C: 'TE', D: 'TZ' };
const tierName = (t) => names[t];

describe('validateMinimums', () => {
  it('accepts strictly descending whole scores in range', () => {
    expect(validateMinimums(DEFAULT_MINIMUMS)).toEqual({});
    expect(validateMinimums({ S: 1000, A: 2, B: 1, C: 0 })).toEqual({});
    expect(validateMinimums({ S: '400', A: '300', B: '200', C: '100' })).toEqual({});
  });

  it('names the tier above, by its own name, when a minimum is not below it', () => {
    expect(validateMinimums({ S: 340, A: 340, B: 220, C: 160 }, tierName)).toEqual({ A: "Must be below T1's 340" });
    expect(validateMinimums({ S: 340, A: 280, B: 300, C: 160 }, tierName)).toEqual({ B: "Must be below T2's 280" });
  });

  it('flags empty, fractional and out-of-range values', () => {
    expect(validateMinimums({ S: '', A: 280, B: 220, C: 160 })).toEqual({ S: 'Enter a score' });
    expect(validateMinimums({ S: 340, A: 280.5, B: 220, C: 160 })).toEqual({ A: 'Use a whole number' });
    expect(validateMinimums({ S: 1001, A: 280, B: 220, C: -1 })).toEqual({ S: 'Between 0 and 1000', C: 'Between 0 and 1000' });
    expect(validateMinimums(null)).toEqual({ S: 'Enter a score', A: 'Enter a score', B: 'Enter a score', C: 'Enter a score' });
    // A bad tier doesn't also blame the one under it.
    expect(validateMinimums({ S: '', A: 280, B: 220, C: 160 }).A).toBeUndefined();
    expect(isValidMinimums({ S: 1, A: 2, B: 1, C: 0 })).toBe(false);
  });
});

describe('tierRanges / rangeText', () => {
  it('gives every ranked tier its range, top open above, bottom below the next border', () => {
    const r = tierRanges(DEFAULT_MINIMUMS);
    expect(r.map(rangeText)).toEqual(['340 and up', '280 – 339', '220 – 279', '160 – 219', 'below 160']);
    expect(r.map((x) => x.tier)).toEqual(['S', 'A', 'B', 'C', 'D']);
  });
});

describe('minimumsFromBorders', () => {
  it('starts from the learned borders (shown scale) where the board has them', () => {
    expect(minimumsFromBorders([{ upper: 'S', lower: 'A', score: 35.04 }, { upper: 'A', lower: 'B', score: 29 }]))
      .toEqual({ S: 350, A: 290, B: 220, C: 160 });
  });

  it('falls back to the defaults when the mix would not descend, or there is nothing', () => {
    expect(minimumsFromBorders([{ upper: 'B', lower: 'C', score: 40 }])).toEqual(DEFAULT_MINIMUMS);
    expect(minimumsFromBorders(undefined)).toEqual(DEFAULT_MINIMUMS);
  });
});

describe('previewCounts', () => {
  it('counts ranked songs by their shown score; to-do songs are left out', () => {
    const songs = [{ tier: 'S', mu: 34 }, { tier: 'S', mu: 33.94 }, { tier: 'A', mu: 25 }, { tier: 'B', mu: 2 }, { tier: null, mu: 50 }];
    expect(previewCounts(songs, DEFAULT_MINIMUMS)).toEqual({ S: 1, A: 1, B: 1, C: 0, D: 1 });
  });
});
