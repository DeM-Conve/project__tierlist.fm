import { describe, expect, it } from 'vitest';
import { makeStore } from '../test/render';
import { loadBoard, moveWithFeedback } from '../tierActions';
import { selectDuelLayout } from './selectors';
import { requestPlayerPause } from './focusSlice';
import { BOARD, IDS, NAMING } from '../test/duelFixtures';

const board = () => {
  const store = makeStore({ playlists: [], naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data: BOARD }));
  return store;
};

describe('selectDuelLayout', () => {
  it('is the board as tier -> ids, in board order, tiers in S..D, TODO order', () => {
    const { layout } = selectDuelLayout(board().getState());
    expect(Object.keys(layout.tiers)).toEqual(['S', 'A', 'TODO']);
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

describe('requestPlayerPause', () => {
  it('counts up, so every request reaches the dock', () => {
    const store = board();
    expect(store.getState().focus.pauseRequest).toBe(0);
    store.dispatch(requestPlayerPause());
    store.dispatch(requestPlayerPause());
    expect(store.getState().focus.pauseRequest).toBe(2);
  });
});
