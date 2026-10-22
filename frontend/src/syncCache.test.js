import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './api/queryClient';
import { queryKeys } from './api/queryKeys';
import { SESSION_START } from './api/boardCache';
import { api } from './api/client';
import { makeStore } from './test/render';
import { applySyncOutcome, loadBoard, moveWithFeedback, transferWithFeedback } from './tierActions';
import { itemIdsRebased } from './store/itemIds';
import { syncFailuresRecorded } from './store/tiersSlice';
import { selectPendingMoves, selectTransfers } from './store/selectors';
import { buildSyncPlan } from './syncPlan';
import { playlistItemsQuery } from './api/queries';
import { resetPushLedger } from './api/pushLedger';
import { GONE_REASON, checkItemIds, heldItems, itemIdChanges, preparePush, recordPush } from './syncCache';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('./api/client', () => ({ api: { get: vi.fn() } }));

// The playlists on "YouTube": what GET /api/playlists/:id/items answers.
let youtube;
let reads;
// While set, reads answer this old copy of YouTube instead (its list lags
// behind writes - eventually consistent).
let lagging = null;
function serveYoutube() {
  reads = [];
  api.get.mockImplementation(async (url) => {
    const id = url.match(/playlists\/([^/]+)\/items/)[1];
    reads.push(id);
    return { data: (lagging ?? youtube)[id] };
  });
}
const snapshot = () => structuredClone(youtube);

const song = (videoId, id) => ({ videoId, id, title: `Song ${videoId}` });
const GROUPS = {
  Rock: { S: { id: 'rock-s' }, A: { id: 'rock-a' }, B: { id: 'rock-b' }, C: { id: 'rock-c' } },
  Pop: { S: { id: 'pop-s' }, A: { id: 'pop-a' } },
};

let store;
let qc;
const key = (id) => queryKeys.playlistItems(id);
const cachedIds = (id) => qc.getQueryData(key(id))?.map((v) => v.id);

// The board cache's copy, restored at page load: it predates this session.
const restore = (id, items) => qc.setQueryData(key(id), items, { updatedAt: SESSION_START - 60_000 });
// Read this session.
const fetched = (id, items) => qc.setQueryData(key(id), items);

// Opens a board the way useLoadTierBoard does: from whatever the cache holds.
function openBoard(category) {
  const data = Object.fromEntries(
    Object.entries(GROUPS[category]).map(([tier, p]) => [tier, qc.getQueryData(key(p.id)) || []])
  );
  store.dispatch(loadBoard({ category, data }));
}

// The push App.jsx's runSync does: check the ids (preparePush), send,
// apply the results to the draft, then write them into the cache. `backend`
// answers the tier-sync rows (default: like the real one, YouTube updated).
async function push(category, backend = applyOnYoutube) {
  const planNow = () => {
    const state = store.getState();
    const moves = selectPendingMoves(state);
    const staged = selectTransfers(state);
    return moves.length || staged.length ? buildSyncPlan(moves, staged, GROUPS, category) : null;
  };
  const next = await preparePush(qc, { dispatch: store.dispatch, getState: store.getState, tierGroups: GROUPS, category, planNow });
  const plan = next.plan ?? { payload: [], moves: [], transfers: [] };
  const results = backend(plan.payload);
  store.dispatch(applySyncOutcome(plan, results));
  await recordPush(qc, { state: store.getState(), plan, results, tierGroups: GROUPS, category });
  return { ...next, plan, results };
}

// The backend against the fake YouTube: insert (a new item id), then delete
// fromItemId - a 404 on the delete counts as removed, like the real one.
let nextId = 0;
function youtubeRow(row, { failDelete = false } = {}) {
  let newItemId = null;
  if (row.toPlaylistId) {
    newItemId = `new-${++nextId}`;
    youtube[row.toPlaylistId] = [...youtube[row.toPlaylistId], song(row.videoId, newItemId)];
  }
  if (row.fromItemId && failDelete) {
    return { videoId: row.videoId, success: false, inserted: !!row.toPlaylistId, removed: false, newItemId, step: 'delete', error: 'busy' };
  }
  if (row.fromItemId) {
    const from = Object.keys(youtube).find((id) => youtube[id].some((v) => v.id === row.fromItemId));
    if (from) youtube[from] = youtube[from].filter((v) => v.id !== row.fromItemId);
  }
  return { videoId: row.videoId, success: true, inserted: !!row.toPlaylistId, removed: !!row.fromItemId, newItemId };
}
const applyOnYoutube = (payload) => payload.map((row) => youtubeRow(row));

const drag = (fromTier, toTier, videoId) =>
  store.dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex: null }]));
// Every copy of a video across one board's playlists on YouTube.
const copies = (category, videoId) =>
  Object.values(GROUPS[category]).flatMap((p) => youtube[p.id].filter((v) => v.videoId === videoId));

beforeEach(() => {
  vi.clearAllMocks();
  resetPushLedger();
  lagging = null;
  store = makeStore();
  qc = createQueryClient();
  nextId = 0;
  youtube = {
    'rock-s': [song('a', 'a1')],
    'rock-a': [song('b', 'b1')],
    'rock-b': [],
    'rock-c': [],
    'pop-s': [song('p', 'p1')],
    'pop-a': [],
  };
  serveYoutube();
});

describe('itemIdChanges', () => {
  it('re-points an id YouTube no longer has at the copy of the same video that is there', () => {
    expect(itemIdChanges([song('a', 'old')], [song('a', 'new'), song('b', 'b1')])).toEqual({ renamed: { old: 'new' }, gone: [], kept: [] });
  });

  it('leaves ids YouTube still has alone', () => {
    expect(itemIdChanges([song('a', 'a1')], [song('a', 'a1')])).toEqual({ renamed: {}, gone: [], kept: ['a1'] });
  });

  it('never points two held copies at one item', () => {
    const held = [song('a', 'a1'), song('a', 'x'), song('a', 'y')];
    const fresh = [song('a', 'a1'), song('a', 'a2')];
    expect(itemIdChanges(held, fresh)).toEqual({ renamed: { x: 'a2' }, gone: ['y'], kept: ['a1'] });
  });

  it('reports a song that left the playlist as gone', () => {
    expect(itemIdChanges([song('a', 'a1')], [])).toEqual({ renamed: {}, gone: ['a1'], kept: [] });
  });
});

describe('after a push, the cache holds what the push did', () => {
  beforeEach(() => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
  });

  it('a deleted item leaves its playlist\'s cache, the inserted one joins the target - without a refetch', async () => {
    drag('S', 'A', 'a');
    await push('Rock');
    expect(cachedIds('rock-s')).toEqual([]);
    expect(qc.getQueryData(key('rock-a')).map((v) => v.videoId)).toEqual(['b', 'a']);
    expect(reads).toEqual([]);
  });

  // The user's bug: the refetch right after a push lagged behind YouTube's
  // write and put the pre-push items back in the cache as fresh data; the
  // board reopened from it, and the next drag of that song pushed a dead id.
  it('a fetch in flight during the push cannot land the pre-push items over it', async () => {
    let answer;
    let lagging;
    drag('S', 'A', 'a');
    // A read starts while the push request is out (e.g. a prefetch), and
    // YouTube's list hasn't caught up yet when it answers.
    await push('Rock', (payload) => {
      api.get.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
      lagging = qc.fetchQuery({ queryKey: key('rock-s'), queryFn: async () => (await api.get('/api/playlists/rock-s/items')).data, staleTime: 0 }).catch(() => {});
      return applyOnYoutube(payload);
    });
    answer({ data: [song('a', 'a1')] });
    await lagging;
    expect(cachedIds('rock-s')).toEqual([]);
  });

  it('reopening the board, then pushing that song again, deletes the item that exists - no failure, no duplicate', async () => {
    drag('S', 'A', 'a');
    await push('Rock');
    openBoard('Pop');
    openBoard('Rock');
    drag('A', 'B', 'a');
    const { results } = await push('Rock');
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Rock', 'a').length).toBe(1);
    expect(youtube['rock-b'].map((v) => v.videoId)).toEqual(['a']);
  });

  it('pushing the moved song again on the same board uses its new id', async () => {
    drag('S', 'A', 'a');
    await push('Rock');
    drag('A', 'B', 'a');
    const { results } = await push('Rock');
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Rock', 'a').length).toBe(1);
  });

  it('a failed row leaves its own playlists to be re-read before the next push - only those', async () => {
    drag('S', 'A', 'a');
    await push('Rock', (payload) => payload.map(() => ({ success: false })));
    for (const id of ['rock-s', 'rock-a']) expect(qc.getQueryState(key(id)).isInvalidated).toBe(true);
    for (const id of ['rock-b', 'rock-c']) expect(qc.getQueryState(key(id)).isInvalidated).toBe(false);
  });

  it('a request that failed outright does the same', async () => {
    drag('S', 'A', 'a');
    const plan = buildSyncPlan(selectPendingMoves(store.getState()), [], GROUPS, 'Rock');
    await recordPush(qc, { state: store.getState(), plan, results: null, tierGroups: GROUPS, category: 'Rock' });
    expect(qc.getQueryState(key('rock-s')).isInvalidated).toBe(true);
    expect(cachedIds('rock-s')).toEqual(['a1']);
  });
});

describe('a board shown from the board cache (an older session)', () => {
  it('a drag before the refresh lands pushes YouTube\'s current id, not the cached one', async () => {
    // Since the cache was saved, "a" was moved out of S and back (new id).
    youtube['rock-s'] = [song('a', 'a2')];
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', [song('b', 'b1')]);
    restore('rock-b', []);
    restore('rock-c', []);
    openBoard('Rock');
    drag('S', 'A', 'a');
    const { plan, results } = await push('Rock');
    expect(plan.payload[0].fromItemId).toBe('a2');
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Rock', 'a').length).toBe(1);
  });

  it('a song the cache still lists but YouTube has already moved there is settled, not pushed again', async () => {
    // An earlier push moved "b" to B; the cache saved before it landed.
    youtube['rock-a'] = [];
    youtube['rock-b'] = [song('b', 'b9')];
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', [song('b', 'b1')]);
    restore('rock-b', []);
    restore('rock-c', []);
    openBoard('Rock');
    drag('A', 'B', 'b');
    const { plan, settled, skipped } = await push('Rock');
    expect(plan.payload).toEqual([]);
    expect([settled, skipped]).toEqual([1, 0]);
    expect(copies('Rock', 'b').length).toBe(1);
    expect(selectPendingMoves(store.getState())).toEqual([]);
    // and it now knows the song by its real id
    expect(store.getState().tiers.tierItems.B.map((v) => v.id)).toEqual(['b9']);
  });

  it('a song gone from its playlist (and not where it was going) stays staged, with the reason', async () => {
    youtube['rock-a'] = [];
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', [song('b', 'b1')]);
    restore('rock-b', []);
    restore('rock-c', []);
    openBoard('Rock');
    drag('A', 'S', 'b');
    const { plan, skipped } = await push('Rock');
    expect(plan.payload).toEqual([]);
    expect(skipped).toBe(1);
    expect(copies('Rock', 'b').length).toBe(0);
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'move', to: 'S' })]);
    expect(store.getState().tiers.syncFailures.b1).toEqual({ step: 'delete', error: GONE_REASON });
    // and the playlist is read again before the next push
    expect(qc.getQueryState(key('rock-a')).isInvalidated).toBe(true);
  });

  it('a playlist that can\'t be read stops the push', async () => {
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', []);
    restore('rock-b', []);
    openBoard('Rock');
    drag('S', 'A', 'a');
    api.get.mockRejectedValue(new Error('quota'));
    await expect(checkItemIds(qc, heldItems(store.getState(), GROUPS, 'Rock'))).rejects.toThrow('quota');
  });

  it('a playlist read this session is trusted: no extra read', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
    drag('S', 'A', 'a');
    await push('Rock');
    expect(reads).toEqual([]);
  });
});

describe('a song moved to another board', () => {
  it('from a board shown from a stale cache: the transfer deletes the item that exists', async () => {
    youtube['rock-s'] = [song('a', 'a2')];
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', []);
    restore('rock-b', []);
    openBoard('Rock');
    const video = store.getState().tiers.tierItems.S[0];
    fetched('pop-s', youtube['pop-s']);
    fetched('pop-a', youtube['pop-a']);
    openBoard('Pop');
    store.dispatch(transferWithFeedback({ video, fromCategory: 'Rock', fromTier: 'S' }, 'A'));
    const { plan, results } = await push('Pop');
    expect(plan.payload).toEqual([expect.objectContaining({ fromItemId: 'a2', toPlaylistId: 'pop-a' })]);
    expect(results.every((r) => r.success)).toBe(true);
    expect(youtube['rock-s']).toEqual([]);
    expect(selectTransfers(store.getState())).toEqual([]);
  });

  it('the source board\'s cache loses the song, so opening it later doesn\'t show (or push) it', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
    const video = store.getState().tiers.tierItems.S[0];
    openBoard('Pop');
    store.dispatch(transferWithFeedback({ video, fromCategory: 'Rock', fromTier: 'S' }, 'A'));
    await push('Pop');
    expect(cachedIds('rock-s')).toEqual([]);
    expect(qc.getQueryData(key('pop-a')).map((v) => v.videoId)).toEqual(['a']);
    openBoard('Rock');
    expect(store.getState().tiers.tierItems.S).toEqual([]);
  });

  it('then moving it again on its new board deletes its new item', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
    const video = store.getState().tiers.tierItems.S[0];
    openBoard('Pop');
    store.dispatch(transferWithFeedback({ video, fromCategory: 'Rock', fromTier: 'S' }, 'A'));
    await push('Pop');
    openBoard('Rock');
    openBoard('Pop');
    store.dispatch(moveWithFeedback([{ fromTier: 'A', toTier: 'S', videoId: 'a', dropIndex: null }]));
    const { results } = await push('Pop');
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Pop', 'a').length).toBe(1);
  });
});

describe('itemIdsRebased', () => {
  it('re-points the draft, its baseline, undo/redo snapshots and staged transfers', () => {
    fetched('rock-s', [song('a', 'a1'), song('c', 'c1')]);
    fetched('rock-a', []);
    fetched('rock-b', []);
    openBoard('Rock');
    drag('S', 'A', 'a');
    const t = { id: 'c1', video: song('c', 'c1'), fromCategory: 'Rock', fromTier: 'S', toCategory: 'Pop', toTier: 'S' };
    store.dispatch({ type: 'transfers/transferStaged', payload: t });
    store.dispatch(itemIdsRebased({
      renamed: { 'rock-s': { a1: 'a2', c1: 'c2' } },
      tierPlaylist: { S: 'rock-s', A: 'rock-a', B: 'rock-b', C: 'rock-c' },
      transferPlaylist: { c1: 'rock-s' },
    }));
    const { tiers, transfers } = store.getState();
    expect(tiers.tierItems.A[0].id).toBe('a2');
    expect(tiers.originalTierItems.S.map((v) => v.id)).toEqual(['a2', 'c2']);
    expect(tiers.undoStack[0].S.map((v) => v.id)).toEqual(['a2', 'c2']);
    expect(transfers.list[0]).toMatchObject({ id: 'c2', video: { id: 'c2' } });
  });
});

// Review findings on the merged sync fixes: each one a way a stale item id
// still reached a push.
describe('reads that lag behind a push (the session ledger)', () => {
  beforeEach(() => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
  });

  it('a re-read before the next push can\'t bring a deleted item back or drop an inserted one', async () => {
    lagging = snapshot(); // YouTube's list stays on the pre-push state
    drag('S', 'A', 'a');
    await push('Rock');
    const s = await qc.fetchQuery({ ...playlistItemsQuery('rock-s'), staleTime: 0 });
    const a = await qc.fetchQuery({ ...playlistItemsQuery('rock-a'), staleTime: 0 });
    expect(s.map((v) => v.id)).toEqual([]);
    expect(a.map((v) => v.id)).toEqual(['b1', 'new-1']);
  });

  it('after a failed row, the re-read of a lagging playlist still lets the moved song move again cleanly', async () => {
    drag('S', 'A', 'a');
    drag('A', 'B', 'b');
    // a's move lands; b's delete fails (its own playlists get re-read)
    await push('Rock', (payload) => payload.map((row) => youtubeRow(row, { failDelete: row.videoId === 'b' })));
    expect(qc.getQueryState(key('rock-a')).isInvalidated).toBe(true);
    lagging = { ...youtube, 'rock-a': [song('b', 'b1')], 'rock-s': [song('a', 'a1')] };
    drag('A', 'C', 'a');
    const { results, skipped } = await push('Rock');
    expect(skipped).toBe(0);
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Rock', 'a').map((v) => v.id)).toEqual(['new-3']);
    expect(copies('Rock', 'b').length).toBe(1);
  });

  it('a board-open refetch of a lagging list is reconciled too', async () => {
    lagging = snapshot();
    drag('S', 'A', 'a');
    await push('Rock');
    await qc.invalidateQueries({ queryKey: key('rock-s') });
    await qc.fetchQuery({ ...playlistItemsQuery('rock-s') });
    openBoard('Pop');
    openBoard('Rock');
    expect(store.getState().tiers.tierItems.S).toEqual([]);
  });
});

describe('changes whose item is gone are settled, not stuck', () => {
  it('a duplicate copy that is already gone is simply done', async () => {
    youtube['rock-s'] = [song('a', 'a1')];
    restore('rock-s', [song('a', 'a1'), song('a', 'a1x')]);
    restore('rock-a', []);
    restore('rock-b', []);
    restore('rock-c', []);
    openBoard('Rock');
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'dedupe' })]);
    const { settled, skipped, plan } = await push('Rock');
    expect([settled, skipped, plan.payload.length]).toEqual([1, 0, 0]);
    expect(selectPendingMoves(store.getState())).toEqual([]);
    expect(youtube['rock-s'].map((v) => v.id)).toEqual(['a1']);
  });

  it('a half-done transfer whose old copy was deleted by hand is done', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
    const video = store.getState().tiers.tierItems.S[0];
    openBoard('Pop');
    store.dispatch(transferWithFeedback({ video, fromCategory: 'Rock', fromTier: 'S' }, 'A'));
    await push('Pop', (payload) => payload.map((row) => youtubeRow(row, { failDelete: true })));
    expect(selectTransfers(store.getState())).toEqual([expect.objectContaining({ inserted: true })]);
    youtube['rock-s'] = []; // deleted by hand on YouTube
    await qc.invalidateQueries({ queryKey: key('rock-s'), refetchType: 'none' });
    const { settled, skipped } = await push('Pop');
    expect([settled, skipped]).toEqual([1, 0]);
    expect(selectTransfers(store.getState())).toEqual([]);
    expect(copies('Pop', 'a').length).toBe(1);
  });
});

describe('ids are re-pointed only under their own playlist', () => {
  it('a half-done move with no new id: the next push deletes the old copy, never the new one', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Rock');
    drag('S', 'A', 'a');
    // inserted, delete failed, and (older backend) no new id came back
    await push('Rock', (payload) => payload.map((row) => ({ ...youtubeRow(row, { failDelete: true }), newItemId: null })));
    // the half-done move: the old copy is a leftover duplicate in S
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'dedupe', tier: 'S' })]);
    const { plan, results } = await push('Rock');
    expect(plan.payload).toEqual([expect.objectContaining({ fromItemId: 'a1', fromPlaylistId: 'rock-s' })]);
    expect(results.every((r) => r.success)).toBe(true);
    expect(youtube['rock-a'].map((v) => v.id)).toEqual(['b1', 'new-1']);
    expect(youtube['rock-s']).toEqual([]);
    expect(store.getState().tiers.tierItems.A.find((v) => v.videoId === 'a').id).toBe('new-1');
  });

  it('a failure follows its change to the new id', () => {
    fetched('rock-s', [song('a', 'a1')]);
    openBoard('Rock');
    store.dispatch(syncFailuresRecorded({ attempted: [], failures: { a1: { step: 'delete', error: 'busy' } } }));
    store.dispatch(itemIdsRebased({ renamed: { 'rock-s': { a1: 'a2' } }, tierPlaylist: { S: 'rock-s' }, failureRenames: { a1: 'a2' } }));
    expect(store.getState().tiers.syncFailures).toEqual({ a2: { step: 'delete', error: 'busy' } });
  });
});

describe('a transfer to a board that is not open', () => {
  it('its target\'s cache gets the new item id the backend returned, not the deleted one', async () => {
    Object.entries(youtube).forEach(([id, items]) => fetched(id, items));
    openBoard('Pop');
    const video = store.getState().tiers.tierItems.S[0];
    openBoard('Rock');
    store.dispatch(transferWithFeedback({ video, fromCategory: 'Pop', fromTier: 'S' }, 'A'));
    openBoard('Pop'); // the push runs from the source board
    await push('Pop');
    expect(cachedIds('rock-a')).toEqual(['b1', 'new-1']);
    expect(qc.getQueryState(key('rock-a')).isInvalidated).toBe(false);
  });
});
