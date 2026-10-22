import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { Provider } from 'react-redux';
import { renderHook } from '@testing-library/react';
import {
  applySyncOutcome,
  loadBoard,
  moveWithFeedback,
  redoEdit,
  syncRequestFailed,
  transferWithFeedback,
  undoEdit,
  useTierDnd,
} from './tierActions';
import { buildSyncPlan } from './syncPlan';
import { dragStarted, transfersDiscarded } from './store/transfersSlice';
import { addSyncedVideo, discardTierChanges, itemIdsResolved } from './store/tiersSlice';
import { selectPendingMoves, selectStagedChanges, selectStagedFailures, selectTransfers } from './store/selectors';
import { makeStore } from './test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// Push, round trip included: what App's runSync does, with the backend's
// answer for each payload row given by `answer(row)`.
const groups = {
  Rock: { S: { id: 'rock-s' }, A: { id: 'rock-a' }, B: { id: 'rock-b' }, TODO: { id: 'rock-todo' } },
  Pop: { S: { id: 'pop-s' }, B: { id: 'pop-b' } },
};
const newId = (row) => `new-${row.videoId}-${row.toPlaylistId}`;
const ok = (row) => ({
  videoId: row.videoId,
  success: true,
  inserted: !!row.toPlaylistId,
  removed: !!row.fromItemId,
  ...(row.toPlaylistId ? { newItemId: newId(row) } : {}),
});
// The insert lands, the delete doesn't (e.g. YouTube's 409).
const deleteFails = (row) =>
  row.toPlaylistId
    ? { videoId: row.videoId, success: false, inserted: true, removed: false, newItemId: newId(row), step: 'delete', error: 'YouTube was busy with this playlist - try again.' }
    : ok(row);

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Song ${videoId}` });
const ROCK = { S: [v('a'), v('b')], A: [v('c')], B: [], TODO: [] };
const POP = { S: [v('p')], B: [] };

let store;
const state = () => store.getState();
const tiers = () => state().tiers.tierItems;
const ids = (tier) => (tiers()[tier] || []).map((x) => x.videoId);
const plan = (category = state().tiers.loadedCategory) =>
  buildSyncPlan(selectPendingMoves(state()), selectTransfers(state()), groups, category);
function push(answer = ok, category) {
  const p = plan(category);
  store.dispatch(applySyncOutcome(p, p.payload.map(answer)));
  return p;
}
const move = (videoId, fromTier, toTier) => store.dispatch(moveWithFeedback([{ fromTier, toTier, videoId }]));
function dragToBoard(videoId, fromTier, target, targetData, toTier) {
  const video = tiers()[fromTier].find((x) => x.videoId === videoId);
  store.dispatch(dragStarted({ video, fromCategory: state().tiers.loadedCategory, fromTier }));
  store.dispatch(loadBoard({ category: target, data: targetData }));
  store.dispatch(transferWithFeedback(state().transfers.drag, toTier));
}

beforeEach(() => {
  store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
});

describe('a song moved again after a push', () => {
  it('the second push deletes the item the first one created, not the old one', () => {
    move('a', 'S', 'A');
    const first = push();
    expect(first.payload).toEqual([
      { videoId: 'a', title: 'Song a', fromItemId: 'item-a', fromPlaylistId: 'rock-s', toPlaylistId: 'rock-a' },
    ]);
    expect(selectStagedChanges(state())).toEqual([]);

    move('a', 'A', 'B');
    expect(plan().payload).toEqual([
      { videoId: 'a', title: 'Song a', fromItemId: 'new-a-rock-a', fromPlaylistId: 'rock-a', toPlaylistId: 'rock-b' },
    ]);
  });

  it('the baseline carries the new id too (Discard, then move again)', () => {
    move('a', 'S', 'A');
    push();
    expect(state().tiers.originalTierItems.A.find((x) => x.videoId === 'a').id).toBe('new-a-rock-a');
    store.dispatch(discardTierChanges());
    move('a', 'A', 'S');
    expect(plan().payload[0].fromItemId).toBe('new-a-rock-a');
  });

  it('moved again while the push was in flight: the new id follows the song', () => {
    move('a', 'S', 'A');
    const p = plan();
    move('a', 'A', 'B');
    store.dispatch(applySyncOutcome(p, p.payload.map(ok)));
    expect(plan().payload).toEqual([expect.objectContaining({ fromItemId: 'new-a-rock-a', toPlaylistId: 'rock-b' })]);
  });

  it('Ctrl+Z after the push stages the way back with the new id', () => {
    move('a', 'S', 'A');
    push();
    store.dispatch(undoEdit({ silent: true }));
    expect(ids('S')).toEqual(['a', 'b']);
    expect(plan().payload).toEqual([expect.objectContaining({ fromItemId: 'new-a-rock-a', toPlaylistId: 'rock-s' })]);
  });

  it('redo after an undo after the push keeps the new id', () => {
    move('a', 'S', 'A');
    move('b', 'S', 'B');
    push();
    store.dispatch(undoEdit({ silent: true }));
    store.dispatch(redoEdit({ silent: true }));
    expect(selectStagedChanges(state())).toEqual([]);
    move('b', 'B', 'S');
    expect(plan().payload[0].fromItemId).toBe('new-b-rock-b');
  });

  it('a song filed from Add songs and then moved deletes its own new item', () => {
    store.dispatch(addSyncedVideo({ tier: 'B', video: { ...v('n'), id: 'added-n' } }));
    move('n', 'B', 'S');
    expect(plan().payload).toEqual([expect.objectContaining({ fromItemId: 'added-n', fromPlaylistId: 'rock-b' })]);
  });

  it('an id YouTube did not return is filled in once the playlist is refetched', () => {
    move('a', 'S', 'A');
    push((row) => ({ ...ok(row), newItemId: null }));
    store.dispatch(itemIdsResolved({ 'item-a': 'found-a' }));
    move('a', 'A', 'S');
    expect(plan().payload[0].fromItemId).toBe('found-a');
  });
});

describe('a half-done push (inserted, delete failed)', () => {
  beforeEach(() => {
    move('a', 'S', 'A');
    push(deleteFails);
  });

  it('the song is in its new tier, under its new id; only the old copy\'s delete is staged', () => {
    expect(ids('A')).toEqual(['c', 'a']);
    expect(tiers().A[1].id).toBe('new-a-rock-a');
    expect(selectPendingMoves(state())).toEqual([
      expect.objectContaining({ kind: 'dedupe', tier: 'S', keptTier: 'A', video: expect.objectContaining({ id: 'item-a' }) }),
    ]);
  });

  it('the next push only deletes - never inserts the song again', () => {
    expect(plan().payload).toEqual([
      { videoId: 'a', title: 'Song a', fromItemId: 'item-a', fromPlaylistId: 'rock-s', toPlaylistId: null },
    ]);
    push();
    expect(selectStagedChanges(state())).toEqual([]);
    expect(state().tiers.duplicateCopies.S).toEqual([]);
    move('a', 'A', 'S');
    expect(plan().payload[0].fromItemId).toBe('new-a-rock-a');
  });

  it('Discard keeps the leftover delete (the song really is on YouTube twice)', () => {
    store.dispatch(discardTierChanges());
    expect(ids('A')).toEqual(['c', 'a']);
    expect(ids('S')).toEqual(['b']);
    expect(plan().payload).toEqual([expect.objectContaining({ fromItemId: 'item-a', toPlaylistId: null })]);
  });

  it('there is nothing to undo into a board YouTube only half matches', () => {
    expect(state().tiers.undoStack).toEqual([]);
  });

  it('keeps why it failed, until the leftover is pushed', () => {
    expect(selectStagedFailures(state())).toEqual([
      expect.objectContaining({ kind: 'dedupe', failure: { step: 'delete', error: 'YouTube was busy with this playlist - try again.' } }),
    ]);
    push();
    expect(selectStagedFailures(state())).toEqual([]);
    expect(state().tiers.syncFailures).toEqual({});
  });
});

describe('a song moved to another board, pushed, then moved again', () => {
  it('moving it on its new board deletes the item the transfer created', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    push();
    expect(state().transfers.list).toEqual([]);
    expect(tiers().B[0]).toEqual(expect.objectContaining({ videoId: 'a', id: 'new-a-pop-b' }));
    expect(tiers().B[0].transfer).toBeUndefined();
    move('a', 'B', 'S');
    expect(plan().payload).toEqual([expect.objectContaining({ fromItemId: 'new-a-pop-b', fromPlaylistId: 'pop-b', toPlaylistId: 'pop-s' })]);
  });

  it('moving it back to its old board deletes the new item too', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    push();
    dragToBoard('a', 'B', 'Rock', { ...ROCK, S: [v('b')] }, 'A');
    expect(plan().payload).toEqual([
      expect.objectContaining({ fromItemId: 'new-a-pop-b', fromPlaylistId: 'pop-b', toPlaylistId: 'rock-a' }),
    ]);
  });
});

describe('a half-done transfer', () => {
  beforeEach(() => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    push(deleteFails);
  });

  it('the song is part of its new board; the transfer only deletes the old copy now', () => {
    expect(tiers().B).toEqual([expect.objectContaining({ id: 'new-a-pop-b' })]);
    expect(tiers().B[0].transfer).toBeUndefined();
    expect(state().transfers.list).toEqual([expect.objectContaining({ id: 'item-a', inserted: true, newItemId: 'new-a-pop-b' })]);
    expect(plan().payload).toEqual([
      { videoId: 'a', title: 'Song a', fromItemId: 'item-a', fromPlaylistId: 'rock-s', toPlaylistId: null },
    ]);
  });

  it('reopening either board shows the song once, where it went', () => {
    store.dispatch(loadBoard({ category: 'Pop', data: { ...POP, B: [{ ...v('a'), id: 'new-a-pop-b' }] } }));
    expect(ids('B')).toEqual(['a']);
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    expect(ids('S')).toEqual(['b']);
    expect(selectStagedChanges(state())).toEqual([expect.objectContaining({ kind: 'transfer', inserted: true })]);
  });

  it('Discard keeps it; pushing it finishes the transfer', () => {
    store.dispatch(discardTierChanges());
    store.dispatch(transfersDiscarded());
    expect(state().transfers.list).toHaveLength(1);
    push();
    expect(state().transfers.list).toEqual([]);
    expect(ids('B')).toEqual(['a']);
    expect(state().tiers.originalTierItems.B.map((x) => x.videoId)).toEqual(['a']);
  });
});

describe('a push that never reached the backend', () => {
  it('every change it sent says why, and stays staged', () => {
    move('a', 'S', 'A');
    store.dispatch(syncRequestFailed(plan(), 'The app couldn’t reach the server.'));
    expect(selectStagedFailures(state())).toEqual([
      expect.objectContaining({ kind: 'move', failure: { step: null, error: 'The app couldn’t reach the server.' } }),
    ]);
    // Put back: resolved, so the reason goes with it.
    move('a', 'A', 'S');
    expect(selectStagedFailures(state())).toEqual([]);
  });
});

describe('dragging the playing song from the Tier Rail', () => {
  it('carries the board\'s copy (its id after a push), not the player\'s older snapshot', () => {
    move('a', 'S', 'A');
    push();
    const { result } = renderHook(() => useTierDnd(), { wrapper: ({ children }) => createElement(Provider, { store }, children) });
    const e = { dataTransfer: { setData: vi.fn() } };
    result.current.onDragStart(e, v('a'), 'A'); // the snapshot still says item-a
    expect(state().transfers.drag.video.id).toBe('new-a-rock-a');
  });
});
