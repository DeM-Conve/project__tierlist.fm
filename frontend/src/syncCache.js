import { queryKeys } from './api/queryKeys';
import { SESSION_START } from './api/boardCache';
import { playlistItemsQuery } from './api/queries';
import { touchedPlaylists } from './syncPlan';

// A push names playlist items by id (tier-sync deletes `fromItemId`), and an
// id is only good until the push that deleted it. Two places can hand one
// back after that: the query cache (and the board cache, its copy in
// IndexedDB), and the board draft loaded from it. So:
//
// 1. After a push (recordPush), the cached items of every playlist it
//    touched are *patched* with what it did - deleted items out, inserted
//    ones in - instead of refetched. A refetch right after a write can lag
//    behind it (YouTube's list is eventually consistent), and it used to land
//    the pre-push items in the cache as fresh data, where reopening the board
//    (or the next session) picked them up: a drag of such a song inserted a
//    copy, then failed to delete the dead id - a failed push and a duplicate.
//    A fetch already in flight is cancelled first, or it would land the
//    pre-push items over the patch. Whatever isn't known for sure (a failed
//    row, an inserted item whose new id we don't have) marks the playlist
//    invalidated, so the next push re-reads it (2).
// 2. Before a push (checkItemIds), every playlist whose ids it would send is
//    re-read if its cached copy isn't known good - restored from the board
//    cache and not yet refreshed (a drag before the refresh landed), marked
//    invalidated by (1), or mid-fetch - and the ids the browser holds are
//    compared with it: an id YouTube no longer has is re-pointed, by video,
//    at the copy that is there now (itemIdsRebased, the draft and the staged
//    transfers alike); one with no copy left is reported `gone`, and the push
//    leaves that change out rather than insert a copy it can't delete.

const itemKey = (playlistId) => queryKeys.playlistItems(playlistId);

// Pure. `held`: the items this browser would name in one playlist; `fresh`:
// that playlist on YouTube. -> { renamed: { oldId: newId }, gone: [oldId] }.
// A held id YouTube doesn't have takes a copy of the same video that no held
// item already points at (a playlist may hold a video twice).
export function itemIdChanges(held, fresh) {
  const freshIds = new Set(fresh.map((v) => v.id));
  const heldIds = new Set(held.map((v) => v.id));
  const spare = new Map();
  for (const v of fresh) {
    if (heldIds.has(v.id)) continue;
    if (!spare.has(v.videoId)) spare.set(v.videoId, []);
    spare.get(v.videoId).push(v.id);
  }
  const renamed = {};
  const gone = [];
  const seen = new Set();
  for (const v of held) {
    if (v.id == null || freshIds.has(v.id) || seen.has(v.id)) continue;
    seen.add(v.id);
    const next = spare.get(v.videoId)?.shift();
    if (next) renamed[v.id] = next;
    else gone.push(v.id);
  }
  return { renamed, gone };
}

// Every playlist item a push from `category` could name, by playlist id: the
// open board's baseline (what's on YouTube as far as it knows, extra copies
// included - its draft holds the same items) and each staged transfer's song.
export function heldItems(state, tierGroups, category) {
  const out = {};
  const add = (playlistId, video) => {
    if (!playlistId || video?.id == null) return;
    (out[playlistId] ??= []).push(video);
  };
  const { loadedCategory, originalTierItems, duplicateCopies } = state.tiers;
  if (loadedCategory === category) {
    for (const [tier, playlist] of Object.entries(tierGroups[category] || {})) {
      for (const v of [...(originalTierItems[tier] || []), ...(duplicateCopies[tier] || [])]) add(playlist.id, v);
    }
  }
  for (const t of state.transfers.list) add(tierGroups[t.fromCategory]?.[t.fromTier]?.id, t.video);
  return out;
}

// Is the cached copy of this playlist one a push can trust? Not when it came
// from the board cache and hasn't been refreshed, was invalidated, is being
// fetched (the fetch is newer) or isn't there.
function needsRead(queryClient, playlistId) {
  const s = queryClient.getQueryState(itemKey(playlistId));
  return !s || s.data === undefined || s.isInvalidated || s.fetchStatus === 'fetching' || s.dataUpdatedAt < SESSION_START;
}

// Step 2 (see the top). `held` = heldItems(...). Throws if a playlist can't be
// read - pushing on ids we couldn't check is what this exists to stop.
// -> { renamed, gone: Set } (dispatch itemIdsRebased(renamed) when non-empty).
export async function checkItemIds(queryClient, held) {
  const ids = Object.keys(held);
  await Promise.all(
    ids
      .filter((id) => needsRead(queryClient, id))
      .map((id) => queryClient.fetchQuery({ ...playlistItemsQuery(id), staleTime: 0 }))
  );
  const renamed = {};
  const gone = new Set();
  for (const id of ids) {
    const fresh = queryClient.getQueryData(itemKey(id)) || [];
    const c = itemIdChanges(held[id], fresh);
    Object.assign(renamed, c.renamed);
    c.gone.forEach((g) => gone.add(g));
    // Maybe YouTube just hasn't caught up: read it again before the next push.
    if (c.gone.length) queryClient.invalidateQueries({ queryKey: itemKey(id), refetchType: 'none' });
  }
  return { renamed, gone };
}

// The id a pushed song has in the playlist it was inserted into, as the board
// knows it after the push (its baseline) - or null when that isn't known to
// differ from the deleted one (another board, or no new id came back).
function insertedId(state, tierGroups, category, row) {
  if (state.tiers.loadedCategory !== category) return null;
  const tier = Object.keys(tierGroups[category] || {}).find((t) => tierGroups[category][t].id === row.toPlaylistId);
  const copy = tier && (state.tiers.originalTierItems[tier] || []).find((v) => v.videoId === row.videoId);
  return copy && copy.id !== row.fromItemId ? copy.id : null;
}

// Step 1 (see the top). Call once the push's results are in the store
// (applySyncedMoves / transfersApplied), with the plan that was sent and the
// backend's per-row results - or results = null when the request itself
// failed (nothing is known: every touched playlist is re-read before the next
// push).
export async function recordPush(queryClient, { state, plan, results, tierGroups, category }) {
  const touched = touchedPlaylists(plan, tierGroups, category);
  await Promise.all(touched.map((id) => queryClient.cancelQueries({ queryKey: itemKey(id) })));
  const unsure = new Set();
  if (!results) touched.forEach((id) => unsure.add(id));

  const videos = [...plan.moves.map((m) => m.video), ...plan.transfers.map((t) => t.video)];
  const deleted = new Set();
  const inserted = {};
  plan.payload.forEach((row, i) => {
    if (!results) return;
    if (results[i]?.success !== true) {
      // Half done, maybe (inserted, then the delete failed): re-read both ends.
      touched.forEach((id) => unsure.add(id));
      return;
    }
    if (row.fromItemId) deleted.add(row.fromItemId);
    if (!row.toPlaylistId) return;
    const newId = insertedId(state, tierGroups, category, row);
    if (!newId) unsure.add(row.toPlaylistId);
    const { transfer: _, ...video } = videos[i];
    (inserted[row.toPlaylistId] ??= []).push({ ...video, id: newId ?? video.id });
  });

  for (const id of touched) {
    const old = queryClient.getQueryData(itemKey(id));
    if (!old) continue; // never read: opening it fetches it
    const kept = old.filter((v) => !deleted.has(v.id));
    const have = new Set(kept.map((v) => v.id));
    const added = (inserted[id] || []).filter((v) => !have.has(v.id));
    // Untouched playlists keep their copy as is (writing one would also
    // clear an invalidation that asks for it to be re-read).
    if (kept.length === old.length && !added.length) continue;
    queryClient.setQueryData(itemKey(id), [...kept, ...added]);
  }
  unsure.forEach((id) => queryClient.invalidateQueries({ queryKey: itemKey(id), refetchType: 'none' }));
}
