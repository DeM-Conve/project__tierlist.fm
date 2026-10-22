import { describe, expect, it } from 'vitest';
import reducer, { setLearnedBorders, setOwnRanges } from './duelSettingsSlice';
import { settingsLoaded } from './settingsActions';

const init = () => reducer(undefined, { type: '@@test/init' });
const mine = { S: 400, A: 300, B: 200, C: 100 };

describe('duelSettingsSlice', () => {
  it('starts with learned borders', () => {
    expect(init()).toEqual({ tierBorders: 'learned', tierMinimums: null });
  });

  it('your own ranges, then back to learned keeps them', () => {
    let s = reducer(init(), setOwnRanges(mine));
    expect(s).toEqual({ tierBorders: 'custom', tierMinimums: mine });
    s = reducer(s, setLearnedBorders());
    expect(s).toEqual({ tierBorders: 'learned', tierMinimums: mine });
  });

  it('ignores invalid ranges', () => {
    expect(reducer(init(), setOwnRanges({ S: 100, A: 300, B: 200, C: 100 }))).toEqual(init());
  });

  it('adopts the account row; a bad or partial row falls back to learned', () => {
    expect(reducer(init(), settingsLoaded({ duels: { tierBorders: 'custom', tierMinimums: mine } }))).toEqual({ tierBorders: 'custom', tierMinimums: mine });
    expect(reducer(init(), settingsLoaded({ duels: { tierBorders: 'custom', tierMinimums: null } }))).toEqual(init());
    expect(reducer(init(), settingsLoaded({ duels: { tierBorders: 'custom', tierMinimums: { S: 1 } } }))).toEqual(init());
    const s = reducer(init(), setOwnRanges(mine));
    expect(reducer(s, settingsLoaded({ appearance: {} }))).toBe(s);
  });
});
