import { describe, expect, it } from 'vitest';
import { queueMove, queueSlot } from './queueTimeline';

// Combined list with 3 played songs: [h0 h1 h2 NOW u0 u1 u2]
const H = 3;

describe('queueSlot', () => {
  it('maps the combined index to history / now / upcoming', () => {
    expect(queueSlot(H, 0)).toEqual({ section: 'history', index: 0 });
    expect(queueSlot(H, 2)).toEqual({ section: 'history', index: 2 });
    expect(queueSlot(H, 3)).toBeNull();
    expect(queueSlot(H, 4)).toEqual({ section: 'upcoming', index: 0 });
    expect(queueSlot(H, 6)).toEqual({ section: 'upcoming', index: 2 });
  });
});

describe('queueMove', () => {
  it('no move, or the playing song -> null', () => {
    expect(queueMove(H, 4, 4)).toBeNull();
    expect(queueMove(H, 3, 5)).toBeNull();
  });

  it('reorders Up next', () => {
    // u2 to the top of Up next: [h0 h1 h2 NOW u2 u0 u1]
    expect(queueMove(H, 6, 4)).toEqual({ from: { section: 'upcoming', index: 2 }, to: { section: 'upcoming', index: 0 } });
    expect(queueMove(H, 4, 6)).toEqual({ from: { section: 'upcoming', index: 0 }, to: { section: 'upcoming', index: 2 } });
  });

  it('reorders history', () => {
    expect(queueMove(H, 0, 2)).toEqual({ from: { section: 'history', index: 0 }, to: { section: 'history', index: 2 } });
  });

  it('a played song dragged just below the playing one plays next', () => {
    // [h1 h2 NOW h0 u0 ...]: h0 at final index 3
    expect(queueMove(H, 0, 3)).toEqual({ from: { section: 'history', index: 0 }, to: { section: 'upcoming', index: 0 } });
    expect(queueMove(H, 1, 6)).toEqual({ from: { section: 'history', index: 1 }, to: { section: 'upcoming', index: 3 } });
  });

  it('an upcoming song dragged above the playing one counts as played', () => {
    // [h0 h1 h2 u1 NOW u0 u2]: u1 at final index 3 -> end of history
    expect(queueMove(H, 5, 3)).toEqual({ from: { section: 'upcoming', index: 1 }, to: { section: 'history', index: 3 } });
    expect(queueMove(H, 4, 0)).toEqual({ from: { section: 'upcoming', index: 0 }, to: { section: 'history', index: 0 } });
  });

  it('works with no history', () => {
    // [NOW u0 u1]: u1 above NOW
    expect(queueMove(0, 2, 0)).toEqual({ from: { section: 'upcoming', index: 1 }, to: { section: 'history', index: 0 } });
    expect(queueMove(0, 2, 1)).toEqual({ from: { section: 'upcoming', index: 1 }, to: { section: 'upcoming', index: 0 } });
  });
});
