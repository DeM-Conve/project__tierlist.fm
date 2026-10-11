import { describe, expect, it } from 'vitest';
import { splitIntoColumns } from './shortcutsLayout';

describe('splitIntoColumns', () => {
  it('keeps the order and balances by weight', () => {
    const items = [5, 1, 1, 1, 2];
    const cols = splitIntoColumns(items, 2, (x) => x);
    expect(cols.flat()).toEqual(items);
    expect(cols).toEqual([[5], [1, 1, 1, 2]]);
  });

  it('minimises the tallest column', () => {
    const cols = splitIntoColumns([3, 3, 2, 2, 2], 2, (x) => x);
    expect(cols.map((c) => c.reduce((a, b) => a + b, 0))).toEqual([6, 6]);
  });

  it('never makes more columns than items, and none empty', () => {
    expect(splitIntoColumns(['a'], 3)).toEqual([['a']]);
    expect(splitIntoColumns([], 2)).toEqual([]);
    expect(splitIntoColumns(['a', 'b', 'c'], 3)).toEqual([['a'], ['b'], ['c']]);
  });

  it('one column is everything', () => {
    expect(splitIntoColumns([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
  });
});
