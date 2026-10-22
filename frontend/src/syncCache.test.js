import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './api/queryClient';
import { queryKeys } from './api/queryKeys';
import { SESSION_START } from './api/boardCache';
import { api } from './api/client';
import { makeStore } from './test/render';
import { loadBoard, moveWithFeedback, transferWithFeedback } from './tierActions';
import { applySyncedMoves, transfersApplied } from './store/tiersSlice';
import { transfersPushed } from './store/transfersSlice';
import { itemIdsRebased } from './store/itemIds';
import { selectPendingMoves, selectTransfers } from './store/selectors';
import { buildSyncPlan, succeeded } from './syncPlan';
import { checkItemIds, heldItems, itemIdChanges, recordPush } from './syncCache';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('./api/client', () => ({ api: { get: vi.fn() } }));

// The playlists on "YouTube": what GET /api/playlists/:id/items answers.
let youtube;
let reads;
function serveYoutube() {
  reads = [];
  api.get.mockImplementation(async (url) => {
    const id = url.match(/playlists\/([^/]+)\/items/)[1];
    reads.push(id);
    return { data: youtube[id] };
  });
}

const song = (videoId, id) => ({ videoId, id, title: `Song ${videoId}` });
const GROUPS = {
  Rock: { S: { id: 'rock-s' }, A: { id: 'rock-a' }, B: { id: 'rock-b' } },
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

// The push App.jsx's runSync does: check the ids, plan, send, apply the
// results to the draft, then write them into the cache. `backend` answers the
// tier-sync rows (default: all succeed, and YouTube is updated to match).
async function push(category, backend = applyOnYoutube) {
  const { renamed, gone } = await checkItemIds(qc, heldItems(store.getState(), GROUPS, category));
  if (Object.keys(renamed).length) store.dispatch(itemIdsRebased(renamed));
  const state = store.getState();
  const moves = selectPendingMoves(state).filter((m) => !gone.has(m.video.id));
  const staged = selectTransfers(state).filter((t) => !gone.has(t.video.id));
  const plan = buildSyncPlan(moves, staged, GROUPS, category);
  const results = backend(plan.payload);
  const done = succeeded(plan, results);
  store.dispatch(applySyncedMoves({ moves: done.moves }));
  store.dispatch(transfersApplied(done.transfers));
  store.dispatch(transfersPushed(done.transfers.map((t) => t.id)));
  await recordPush(qc, { state: store.getState(), plan, results, tierGroups: GROUPS, category });
  return { plan, results, gone };
}

// The backend against the fake YouTube: insert (a new item id), then delete
// fromItemId - which fails, after the insert, if that id isn't there.
let nextId = 0;
function applyOnYoutube(payload) {
  return payload.map((row) => {
    if (row.toPlaylistId) youtube[row.toPlaylistId] = [...youtube[row.toPlaylistId], song(row.videoId, `new-${++nextId}`)];
    if (row.fromItemId) {
      const from = Object.keys(youtube).find((id) => youtube[id].some((v) => v.id === row.fromItemId));
      if (!from) return { videoId: row.videoId, success: false, error: 'playlistItemNotFound' };
      youtube[from] = youtube[from].filter((v) => v.id !== row.fromItemId);
    }
    return { videoId: row.videoId, success: true };
  });
}

const drag = (fromTier, toTier, videoId) =>
  store.dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex: null }]));
// Every copy of a video across one board's playlists on YouTube.
const copies = (category, videoId) =>
  Object.values(GROUPS[category]).flatMap((p) => youtube[p.id].filter((v) => v.videoId === videoId));

beforeEach(() => {
  vi.clearAllMocks();
  store = makeStore();
  qc = createQueryClient();
  nextId = 0;
  youtube = {
    'rock-s': [song('a', 'a1')],
    'rock-a': [song('b', 'b1')],
    'rock-b': [],
    'pop-s': [song('p', 'p1')],
    'pop-a': [],
  };
  serveYoutube();
});

describe('itemIdChanges', () => {
  it('re-points an id YouTube no longer has at the copy of the same video that is there', () => {
    expect(itemIdChanges([song('a', 'old')], [song('a', 'new'), song('b', 'b1')])).toEqual({ renamed: { old: 'new' }, gone: [] });
  });

  it('leaves ids YouTube still has alone', () => {
    expect(itemIdChanges([song('a', 'a1')], [song('a', 'a1')])).toEqual({ renamed: {}, gone: [] });
  });

  it('never points two held copies at one item', () => {
    const held = [song('a', 'a1'), song('a', 'x'), song('a', 'y')];
    const fresh = [song('a', 'a1'), song('a', 'a2')];
    expect(itemIdChanges(held, fresh)).toEqual({ renamed: { x: 'a2' }, gone: ['y'] });
  });

  it('reports a song that left the playlist as gone', () => {
    expect(itemIdChanges([song('a', 'a1')], [])).toEqual({ renamed: {}, gone: ['a1'] });
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

  it('a failed row leaves every touched playlist to be re-read before the next push', async () => {
    drag('S', 'A', 'a');
    await push('Rock', (payload) => payload.map(() => ({ success: false })));
    for (const id of ['rock-s', 'rock-a', 'rock-b']) expect(qc.getQueryState(key(id)).isInvalidated).toBe(true);
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
    openBoard('Rock');
    drag('S', 'A', 'a');
    const { plan, results } = await push('Rock');
    expect(plan.payload[0].fromItemId).toBe('a2');
    expect(results.every((r) => r.success)).toBe(true);
    expect(copies('Rock', 'a').length).toBe(1);
  });

  it('a song the cache still lists but YouTube has moved is left out of the push, not duplicated', async () => {
    // An earlier push moved "b" to B; the cache saved before it landed.
    youtube['rock-a'] = [];
    youtube['rock-b'] = [song('b', 'b9')];
    restore('rock-s', [song('a', 'a1')]);
    restore('rock-a', [song('b', 'b1')]);
    restore('rock-b', []);
    openBoard('Rock');
    drag('A', 'S', 'b');
    const { plan, gone } = await push('Rock');
    expect(gone.has('b1')).toBe(true);
    expect(plan.payload).toEqual([]);
    expect(copies('Rock', 'b').length).toBe(1);
    // still staged, and the playlist is read again before the next push
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'move', to: 'S' })]);
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
    store.dispatch(itemIdsRebased({ a1: 'a2', c1: 'c2' }));
    const { tiers, transfers } = store.getState();
    expect(tiers.tierItems.A[0].id).toBe('a2');
    expect(tiers.originalTierItems.S.map((v) => v.id)).toEqual(['a2', 'c2']);
    expect(tiers.undoStack[0].S.map((v) => v.id)).toEqual(['a2', 'c2']);
    expect(transfers.list[0]).toMatchObject({ id: 'c2', video: { id: 'c2' } });
  });
});
