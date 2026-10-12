import { describe, expect, it } from 'vitest';
import { makeStore } from '../test/render';
import { loadBoard, moveWithFeedback } from '../tierActions';
import { selectDuelLayout } from './selectors';
import { holdPlayer, releasePlayer } from './focusSlice';
import { BOARD, IDS, NAMING } from '../test/duelFixtures';

const board = () => {
  const store = makeStore({ playlists: [], naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data: BOARD }));
  return store;
};

describe('selectDuelLayout', () => {
  it('is the board as tier -> ids, in board order, tiers in S..D, TODO order', () => {
    const { layout } = selectDuelLayout(board().getState());
    // The to-do list goes too, so the backend knows which songs to leave out of duels.
    expect(Object.keys(layout.tiers)).toEqual(['S', 'A', 'B', 'TODO']);
    expect(layout.tiers.A).toEqual([IDS.mid, IDS.mid2]);
  });

  it('is memoized, and its key changes exactly when the board does (staged edits included)', () => {
    const store = board();
    const first = selectDuelLayout(store.getState());
    expect(selectDuelLayout(store.getState())).toBe(first);
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'A', videoId: IDS.todo }], { quiet: true }));
    const moved = selectDuelLayout(store.getState());
    expect(moved.key).not.toBe(first.key);
    expect(moved.layout.tiers.A).toContain(IDS.todo);
  });
});

describe('holdPlayer / releasePlayer', () => {
  it('a matchup holds the dock and lets it go', () => {
    const store = board();
    expect(store.getState().focus.playerHeld).toBe(false);
    store.dispatch(holdPlayer());
    expect(store.getState().focus.playerHeld).toBe(true);
    store.dispatch(releasePlayer());
    expect(store.getState().focus.playerHeld).toBe(false);
  });
});
