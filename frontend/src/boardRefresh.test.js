import { beforeEach, describe, expect, it, vi } from 'vitest';
import { landBoardRefresh, loadBoard, moveWithFeedback } from './tierActions';
import { applySyncedMoves, setSyncStatus } from './store/tiersSlice';
import { selectPendingMoves } from './store/selectors';
import { makeStore } from './test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// A board opened from the board cache (IndexedDB) shows that copy at once;
// the fresh copy from YouTube replaces it when it lands - but never over an
// edit the user made meanwhile.
const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Song ${videoId}` });
const CACHED = { S: [v('a')], A: [v('b')], TODO: [] };
const FRESH = { S: [v('a'), v('new')], A: [v('b')], TODO: [] };
const CACHED_AT = 1000;
const FRESH_AT = 2000;

let store;
const tiers = () => store.getState().tiers;
const ids = (tier) => (tiers().tierItems[tier] || []).map((x) => x.videoId);

beforeEach(() => {
  store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: CACHED, refreshingSince: CACHED_AT }));
});

describe('a board shown from the board cache', () => {
  it('waits for its refresh', () => {
    expect(tiers().awaitingRefresh).toEqual({ category: 'Rock', since: CACHED_AT });
    expect(ids('S')).toEqual(['a']);
  });

  it('takes the fresh copy when nothing was edited', () => {
    store.dispatch(landBoardRefresh({ category: 'Rock', data: FRESH, dataUpdatedAt: FRESH_AT }));
    expect(ids('S')).toEqual(['a', 'new']);
    expect(tiers().originalTierItems.S.map((x) => x.videoId)).toEqual(['a', 'new']);
    expect(tiers().awaitingRefresh).toBeNull();
  });

  it('keeps an unsynced drag: the refresh does not clobber it', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'a', dropIndex: null }]));
    store.dispatch(landBoardRefresh({ category: 'Rock', data: FRESH, dataUpdatedAt: FRESH_AT }));
    expect(ids('S')).toEqual([]);
    expect(ids('A')).toEqual(['b', 'a']);
    expect(selectPendingMoves(store.getState())).toEqual([
      expect.objectContaining({ kind: 'move', from: 'S', to: 'A' }),
    ]);
    expect(tiers().undoStack).toHaveLength(1);
    // and the wait is over - a later refetch never lands over the draft
    expect(tiers().awaitingRefresh).toBeNull();
  });

  it('keeps the draft while a sync is in flight', () => {
    store.dispatch(setSyncStatus('syncing'));
    store.dispatch(landBoardRefresh({ category: 'Rock', data: FRESH, dataUpdatedAt: FRESH_AT }));
    expect(ids('S')).toEqual(['a']);
  });

  it('still takes the fresh copy when only auto-staged duplicate removals are pending', () => {
    const dupes = { S: [v('a')], A: [v('a'), v('b')], TODO: [] };
    store.dispatch(loadBoard({ category: 'Rock', data: dupes, refreshingSince: CACHED_AT }));
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'dedupe' })]);
    store.dispatch(landBoardRefresh({ category: 'Rock', data: FRESH, dataUpdatedAt: FRESH_AT }));
    expect(ids('S')).toEqual(['a', 'new']);
  });

  it('a failed refresh (nothing newer) keeps the cached board and stops waiting', () => {
    store.dispatch(landBoardRefresh({ category: 'Rock', data: CACHED, dataUpdatedAt: CACHED_AT }));
    expect(ids('S')).toEqual(['a']);
    expect(tiers().awaitingRefresh).toBeNull();
  });

  it('ignores a refresh for another board', () => {
    store.dispatch(landBoardRefresh({ category: 'Pop', data: FRESH, dataUpdatedAt: FRESH_AT }));
    expect(ids('S')).toEqual(['a']);
    expect(tiers().awaitingRefresh).not.toBeNull();
  });
});

describe('a board loaded from data fetched this session', () => {
  it('never takes a later refetch - e.g. one lagging behind a sync', () => {
    store.dispatch(loadBoard({ category: 'Rock', data: CACHED }));
    store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'a', dropIndex: null }]));
    store.dispatch(applySyncedMoves({ moves: selectPendingMoves(store.getState()) }));
    expect(tiers().awaitingRefresh).toBeNull();
    store.dispatch(landBoardRefresh({ category: 'Rock', data: CACHED, dataUpdatedAt: FRESH_AT }));
    expect(ids('A')).toEqual(['b', 'a']);
  });
});
