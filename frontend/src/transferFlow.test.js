import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelTransfer, loadBoard, transferWithFeedback, undoEdit, moveWithFeedback } from './tierActions';
import { dragStarted } from './store/transfersSlice';
import { discardTierChanges, transfersApplied, applySyncedMoves } from './store/tiersSlice';
import { selectPendingMoves, selectStagedChanges, selectTransfers } from './store/selectors';
import { makeStore } from './test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Song ${videoId}` });
const ROCK = { S: [v('a'), v('b')], A: [v('c')], TODO: [] };
const POP = { S: [v('p')], B: [], TODO: [] };

let store;
const state = () => store.getState();
const tiers = () => state().tiers.tierItems;
const ids = (tier) => (tiers()[tier] || []).map((x) => x.videoId);

// Drag song `videoId` from `tier` on the open board, open `target`, drop on `toTier`.
function dragToBoard(videoId, fromTier, target, targetData, toTier, dropIndex) {
  const video = tiers()[fromTier].find((x) => x.videoId === videoId);
  store.dispatch(dragStarted({ video, fromCategory: state().tiers.loadedCategory, fromTier }));
  store.dispatch(loadBoard({ category: target, data: targetData }));
  store.dispatch(transferWithFeedback(state().transfers.drag, toTier, dropIndex));
}

beforeEach(() => {
  store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
});

describe('moving a song to another board', () => {
  it('lands where it was dropped on the other board, staged', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    expect(state().tiers.loadedCategory).toBe('Pop');
    expect(ids('B')).toEqual(['a']);
    expect(tiers().B[0].transfer).toBe('item-a');
    expect(selectTransfers(state())).toEqual([
      expect.objectContaining({ id: 'item-a', fromCategory: 'Rock', fromTier: 'S', toCategory: 'Pop', toTier: 'B' }),
    ]);
  });

  it('respects the drop position', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'S', 0);
    expect(ids('S')).toEqual(['a', 'p']);
  });

  it('shows in "N pending" as a transfer, not as a move of the target board', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    expect(selectPendingMoves(state())).toEqual([]);
    expect(selectStagedChanges(state())).toEqual([expect.objectContaining({ kind: 'transfer', id: 'item-a', toTier: 'B' })]);
  });

  it('is gone from its old tier when the old board is opened again', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    expect(ids('S')).toEqual(['b']);
    expect(selectPendingMoves(state())).toEqual([]);
    expect(selectStagedChanges(state())).toHaveLength(1);
  });

  it('is back in the other board\'s tier when that board is opened again', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    store.dispatch(loadBoard({ category: 'Pop', data: POP }));
    expect(ids('B')).toEqual(['a']);
  });

  it('dragging the arrived song to another tier re-aims the transfer', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'S', videoId: 'a' }]));
    expect(selectTransfers(state())[0].toTier).toBe('S');
    // ...and the new tier sticks after leaving the board.
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    expect(state().transfers.list[0].toTier).toBe('S');
  });

  it('Undo of the drop cancels the transfer', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(undoEdit({ silent: true }));
    expect(ids('B')).toEqual([]);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('binning the arrived song cancels the transfer', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'REMOVED', videoId: 'a' }]));
    expect(selectTransfers(state())).toEqual([]);
  });

  it('dropping it in the target board\'s Remove bin does nothing', () => {
    const video = tiers().S[0];
    store.dispatch(dragStarted({ video, fromCategory: 'Rock', fromTier: 'S' }));
    store.dispatch(loadBoard({ category: 'Pop', data: POP }));
    store.dispatch(transferWithFeedback(state().transfers.drag, 'REMOVED'));
    expect(state().transfers.list).toEqual([]);
  });

  it('dragged on to a third board, it is re-aimed there (one transfer)', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    dragToBoard('a', 'B', 'Jazz', { S: [], A: [] }, 'A');
    expect(state().transfers.list).toEqual([
      expect.objectContaining({ id: 'item-a', fromCategory: 'Rock', fromTier: 'S', toCategory: 'Jazz', toTier: 'A' }),
    ]);
    expect(tiers().A[0].transfer).toBe('item-a');
  });

  it('dragged back to its own board, it is an ordinary move there', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    dragToBoard('a', 'B', 'Rock', ROCK, 'A');
    expect(state().transfers.list).toEqual([]);
    expect(ids('A')).toEqual(['c', 'a']);
    expect(tiers().A[1].transfer).toBeUndefined();
    expect(selectPendingMoves(state())).toEqual([expect.objectContaining({ kind: 'move', from: 'S', to: 'A' })]);
  });

  it('back to its own board and tier: nothing staged at all', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    dragToBoard('a', 'B', 'Rock', ROCK, 'S');
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('Put back from the review list takes the song off the other board', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(cancelTransfer(selectTransfers(state())[0]));
    expect(ids('B')).toEqual([]);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('Put back while on the old board returns the song to its tier', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    store.dispatch(cancelTransfer(state().transfers.list[0]));
    expect(ids('S')).toEqual(['b', 'a']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('Discard on the target board drops the arrived card (and the transfer with it)', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(discardTierChanges());
    expect(selectTransfers(state())).toEqual([]);
  });

  it('two copies of one song: each copy is its own transfer', () => {
    store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('a'), { ...v('a'), id: 'item-a2' }] } }));
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('a'), { ...v('a'), id: 'item-a2' }] } }));
    expect(tiers().S.map((x) => x.id)).toEqual(['item-a2']);
  });
});

describe('after a push', () => {
  it('on the target board the song is simply in its tier', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    const [t] = selectTransfers(state());
    store.dispatch(applySyncedMoves({ moves: [] }));
    store.dispatch(transfersApplied([t]));
    store.dispatch({ type: 'transfers/transfersPushed', payload: [t.id] });
    expect(tiers().B[0].transfer).toBeUndefined();
    expect(state().tiers.originalTierItems.B.map((x) => x.videoId)).toEqual(['a']);
    expect(state().tiers.originalTierOf.a).toEqual(['B']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('on the source board the song is gone from the baseline (Discard does not bring it back)', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    const [t] = state().transfers.list;
    store.dispatch(transfersApplied([t]));
    store.dispatch({ type: 'transfers/transfersPushed', payload: [t.id] });
    store.dispatch(discardTierChanges());
    expect(ids('S')).toEqual(['b']);
    expect(state().tiers.originalTierOf.a).toBeUndefined();
  });
});
