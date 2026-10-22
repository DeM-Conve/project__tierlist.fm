import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { applySyncOutcome, cancelTransfer, loadBoard, moveWithFeedback, redoEdit, transferWithFeedback, undoEdit } from './tierActions';
import { buildSyncPlan } from './syncPlan';
import { dragStarted } from './store/transfersSlice';
import { addSyncedVideo, removeSyncedVideo } from './store/tiersSlice';
import { selectPendingMoves, selectStagedChanges, selectTransfers } from './store/selectors';
import { REMOVED_TIER } from './tiers';
import { makeStore } from './test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// The rule: an undo / redo never quietly puts back a song YouTube no longer
// has, or takes off one it now has (tiersSlice rebaseHistory). Pushes go
// through applySyncOutcome with backend-shaped per-row results.
const groups = {
  Rock: { S: { id: 'rock-s' }, A: { id: 'rock-a' }, B: { id: 'rock-b' }, TODO: { id: 'rock-todo' } },
  Pop: { S: { id: 'pop-s' }, B: { id: 'pop-b' } },
};
const ok = (row) => ({
  videoId: row.videoId,
  success: true,
  inserted: !!row.toPlaylistId,
  removed: !!row.fromItemId,
  ...(row.toPlaylistId ? { newItemId: `new-${row.videoId}-${row.toPlaylistId}` } : {}),
});
const failed = (row) => ({ videoId: row.videoId, success: false, inserted: false, removed: false, step: 'insert', error: 'nope' });

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Song ${videoId}` });
const ROCK = { S: [v('a'), v('b')], A: [v('c')], B: [], TODO: [] };
const POP = { S: [v('p')], B: [v('q')] };

let store;
const state = () => store.getState();
const tiers = () => state().tiers.tierItems;
const ids = (tier) => (tiers()[tier] || []).map((x) => x.videoId);
const onBoard = () =>
  Object.entries(tiers())
    .filter(([t]) => t !== REMOVED_TIER)
    .flatMap(([, list]) => list.map((x) => x.videoId))
    .sort();
function push(answer = ok) {
  const p = buildSyncPlan(selectPendingMoves(state()), selectTransfers(state()), groups, state().tiers.loadedCategory);
  store.dispatch(applySyncOutcome(p, p.payload.map(answer)));
  return p;
}
const move = (videoId, fromTier, toTier) => store.dispatch(moveWithFeedback([{ fromTier, toTier, videoId }]));
const undo = () => store.dispatch(undoEdit({ silent: true }));
const redo = () => store.dispatch(redoEdit({ silent: true }));
function dragToBoard(videoId, fromTier, target, targetData, toTier) {
  const video = tiers()[fromTier].find((x) => x.videoId === videoId);
  store.dispatch(dragStarted({ video, fromCategory: state().tiers.loadedCategory, fromTier }));
  store.dispatch(loadBoard({ category: target, data: targetData }));
  store.dispatch(transferWithFeedback(state().transfers.drag, toTier));
}

beforeEach(() => {
  vi.clearAllMocks();
  store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
});

describe('undo after a pushed removal', () => {
  it('never shows the removed song again', () => {
    move('a', 'S', REMOVED_TIER);
    push();
    expect(onBoard()).toEqual(['b', 'c']);
    undo();
    expect(onBoard()).toEqual(['b', 'c']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('the removal is no longer a step: Ctrl+Z undoes the edit before it, minus the song', () => {
    move('b', 'S', 'A');
    move('a', 'S', REMOVED_TIER);
    push();
    expect(state().tiers.undoStack).toHaveLength(1);
    expect(notifications.hide).toHaveBeenCalledWith('tier-edit');
    undo();
    // Back to before the move: b in S again (a staged move), a still gone.
    expect(ids('S')).toEqual(['b']);
    expect(onBoard()).toEqual(['b', 'c']);
    expect(selectPendingMoves(state())).toEqual([expect.objectContaining({ kind: 'move', from: 'A', to: 'S' })]);
    undo(); // nothing left: a no-op
    expect(ids('S')).toEqual(['b']);
  });

  it('an edit made after the push is still undone normally', () => {
    move('a', 'S', REMOVED_TIER);
    push();
    move('b', 'S', 'A');
    undo();
    expect(ids('S')).toEqual(['b']);
    expect(onBoard()).toEqual(['b', 'c']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('a removal undone while its push was in flight is still gone once it lands', () => {
    move('a', 'S', REMOVED_TIER);
    const p = buildSyncPlan(selectPendingMoves(state()), selectTransfers(state()), groups, 'Rock');
    undo();
    store.dispatch(applySyncOutcome(p, p.payload.map(ok)));
    expect(onBoard()).toEqual(['b', 'c']);
    redo();
    expect(onBoard()).toEqual(['b', 'c']);
    expect(tiers()[REMOVED_TIER] || []).toEqual([]);
  });

  it('a removal that failed stays undoable as before', () => {
    move('a', 'S', REMOVED_TIER);
    push(failed);
    undo();
    expect(ids('S')).toEqual(['a', 'b']);
  });
});

describe('undo after a pushed transfer, on its new board', () => {
  it('undoing the drop keeps the song (it is on YouTube there now)', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    push();
    expect(ids('B')).toEqual(['q', 'a']);
    undo();
    expect(ids('B')).toEqual(['q', 'a']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('undoing an edit made before the drop keeps it too', () => {
    store.dispatch(loadBoard({ category: 'Pop', data: POP }));
    move('p', 'S', 'B');
    store.dispatch(loadBoard({ category: 'Rock', data: ROCK }));
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    move('q', 'B', 'S');
    push();
    undo(); // q back to B (a staged move after the push)
    expect(ids('B')).toEqual(['q', 'a']);
    expect(onBoard()).toEqual(['a', 'p', 'q']);
    undo(); // the drop: nothing left to undo for it
    expect(onBoard()).toEqual(['a', 'p', 'q']);
    expect(tiers().B.find((x) => x.videoId === 'a')).toEqual(expect.objectContaining({ id: 'new-a-pop-b' }));
  });
});

describe('undo after an Add songs filing', () => {
  it('undoing the move before it keeps the filed song on the board', () => {
    move('a', 'S', 'A');
    store.dispatch(addSyncedVideo({ tier: 'B', video: { ...v('n'), id: 'added-n' } }));
    undo();
    expect(ids('S')).toEqual(['a', 'b']);
    expect(ids('B')).toEqual(['n']);
    expect(selectStagedChanges(state())).toEqual([]);
  });

  it('a filing taken back is never brought back by an undo', () => {
    store.dispatch(addSyncedVideo({ tier: 'B', video: { ...v('n'), id: 'added-n' } }));
    move('n', 'B', 'S');
    store.dispatch(removeSyncedVideo({ tier: 'S', videoId: 'n' }));
    undo();
    expect(onBoard()).toEqual(['a', 'b', 'c']);
  });
});

describe('a transfer put back', () => {
  it('undo never brings its card back', () => {
    dragToBoard('a', 'S', 'Pop', POP, 'B');
    move('q', 'B', 'S');
    store.dispatch(cancelTransfer(state().transfers.list[0]));
    undo();
    expect(onBoard()).toEqual(['p', 'q']);
  });
});
