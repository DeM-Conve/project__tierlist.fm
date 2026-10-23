import { queryKeys } from './api/queryKeys';
import { SESSION_START } from './api/boardCache';
import { bumpItemCounts, playlistItemsQuery } from './api/queries';
import { recordDeleted, recordInserted } from './api/pushLedger';
import { touchedPlaylists } from './syncPlan';
import { itemIdsRebased } from './store/itemIds';
import { syncFailuresRecorded } from './store/tiersSlice';
import { applySyncOutcome } from './tierActions';

// A push names playlist items by id (tier-sync deletes `fromItemId`), and an
// id is only good until the push that deleted it. Two places can hand one
// back after that: the query cache (and the board cache, its copy in
// IndexedDB), and the board draft loaded from it. So:
//
// 1. After a push (recordPush), the cached items of the playlists it
//    touched are *patched* with what it did - deleted items out, inserted
//    ones (with their real new id) in - instead of refetched, and the same
//    is written to the session's push ledger (api/pushLedger.js), which
//    every later read of a playlist is reconciled with. A read right after
//    a write can lag behind it (YouTube's list is eventually consistent):
//    unreconciled, it put the pre-push items back in the cache as fresh
//    data, and a drag of such a song inserted a copy, then failed to delete
//    the dead id - a failed push and a duplicate. A read already in flight
//    is cancelled first. Whatever isn't known for sure (a row with no
//    answer, an insert with no new id) marks that row's own playlists
//    invalidated, so the next push re-reads them (2).
// 2. Before a push (preparePush), every playlist whose ids it would send is
//    re-read if its cached copy isn't known good - restored from the board
//    cache and not yet refreshed (a drag before the refresh landed), marked
//    invalidated by (1), or mid-fetch - and the ids the browser holds are
//    compared with it, playlist by playlist: an id YouTube no longer has is
//    re-pointed, by video, at the copy that is there now (itemIdsRebased,
//    only for what is held under that playlist). A change whose item is
//    gone is settled rather than left staged for ever: a delete-only change
//    (duplicate, Remove bin, a half-done transfer) is simply done; a move
//    whose song is already in its target is done; anything else stays
//    staged, unsent, with the reason shown.

const itemKey = (playlistId) => queryKeys.playlistItems(playlistId);

export const GONE_REASON = 'This song is no longer in that playlist on YouTube.';

// Pure. `held`: the items this browser would name in one playlist; `fresh`:
// that playlist on YouTube. -> { renamed: { oldId: newId }, gone: [oldId], kept: [id] }.
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
  const kept = [];
  const seen = new Set();
  for (const v of held) {
    if (v.id == null || seen.has(v.id)) continue;
    seen.add(v.id);
    if (freshIds.has(v.id)) {
      kept.push(v.id);
      continue;
    }
    const next = spare.get(v.videoId)?.shift();
    if (next) renamed[v.id] = next;
    else gone.push(v.id);
  }
  return { renamed, gone, kept };
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

const read = (queryClient, playlistId) =>
  needsRead(queryClient, playlistId)
    ? queryClient.fetchQuery({ ...playlistItemsQuery(playlistId), staleTime: 0 })
    : Promise.resolve(queryClient.getQueryData(itemKey(playlistId)));

// `held` = heldItems(...). Throws if a playlist can't be read - pushing on
// ids we couldn't check is what this exists to stop.
// -> { renamed: { [playlistId]: { old: new } }, gone: { [playlistId]: Set },
//      failureRenames: { old: new } } - the last only for ids no other
//      playlist still holds as they are (a failure belongs to one change).
export async function checkItemIds(queryClient, held) {
  const ids = Object.keys(held);
  await Promise.all(ids.filter((id) => needsRead(queryClient, id)).map((id) => read(queryClient, id)));
  const renamed = {};
  const gone = {};
  const kept = new Set();
  for (const id of ids) {
    const fresh = queryClient.getQueryData(itemKey(id)) || [];
    const c = itemIdChanges(held[id], fresh);
    if (Object.keys(c.renamed).length) renamed[id] = c.renamed;
    if (c.gone.length) gone[id] = new Set(c.gone);
    c.kept.forEach((k) => kept.add(k));
    // Maybe YouTube just hasn't caught up: read it again before the next push.
    if (c.gone.length) queryClient.invalidateQueries({ queryKey: itemKey(id), refetchType: 'none' });
  }
  const failureRenames = {};
  for (const map of Object.values(renamed)) {
    for (const [old, next] of Object.entries(map)) if (!kept.has(old)) failureRenames[old] = next;
  }
  return { renamed, gone, failureRenames };
}

// The rows of `plan` (buildSyncPlan) whose index passes `keep`, as a plan.
export function subPlan(plan, keep) {
  const n = plan.moves.length;
  const idx = plan.payload.map((_, i) => i).filter(keep);
  return {
    payload: idx.map((i) => plan.payload[i]),
    moves: idx.filter((i) => i < n).map((i) => plan.moves[i]),
    transfers: idx.filter((i) => i >= n).map((i) => plan.transfers[i - n]),
  };
}

// Changes whose item is gone (see the top, 2). `held` = a plan of just those.
// -> { plan, results } to apply as if pushed (applySyncOutcome), and
// `failures` ({ [itemId]: { step, error } }) for the ones left staged.
export async function settleGone(queryClient, held) {
  const targets = [...new Set(held.payload.map((r) => r.toPlaylistId).filter(Boolean))];
  const lists = await Promise.allSettled(targets.map((id) => read(queryClient, id)));
  const itemsOf = Object.fromEntries(targets.map((id, i) => [id, lists[i].value ?? []]));
  const results = [];
  const failures = {};
  const done = [];
  held.payload.forEach((row, i) => {
    if (!row.toPlaylistId) {
      // Only a delete was left, and the item is already gone.
      done.push(i);
      results.push({ videoId: row.videoId, success: true, inserted: false, removed: true });
      return;
    }
    const there = itemsOf[row.toPlaylistId].find((v) => v.videoId === row.videoId);
    if (there) {
      // Moved already (a push whose answer was lost, or by hand).
      done.push(i);
      results.push({ videoId: row.videoId, success: true, inserted: true, removed: true, newItemId: there.id });
      return;
    }
    failures[row.fromItemId] = { step: 'delete', error: GONE_REASON };
  });
  const plan = subPlan(held, (i) => done.includes(i));
  return { plan, results, failures };
}

// Step 2 (see the top), dispatching what it finds. `planNow()` = the full
// plan from the store as it is now (or null). -> { plan (to send, or null),
// skipped (changes left staged with a reason), settled (changes done
// without sending) }.
export async function preparePush(queryClient, { dispatch, getState, tierGroups, category, planNow }) {
  const { renamed, gone, failureRenames } = await checkItemIds(queryClient, heldItems(getState(), tierGroups, category));
  if (Object.keys(renamed).length) {
    const state = getState();
    const board = tierGroups[state.tiers.loadedCategory] || {};
    const sourceOf = (t) => tierGroups[t.fromCategory]?.[t.fromTier]?.id;
    const drag = state.transfers.drag;
    dispatch(itemIdsRebased({
      renamed,
      tierPlaylist: Object.fromEntries(Object.entries(board).map(([tier, p]) => [tier, p.id])),
      transferPlaylist: Object.fromEntries(state.transfers.list.map((t) => [t.id, sourceOf(t)])),
      dragPlaylist: drag ? sourceOf(drag) : null,
      failureRenames,
    }));
  }
  const full = planNow();
  if (!full) return { plan: null, skipped: 0, settled: 0 };
  const isGone = (i) => !!gone[full.payload[i].fromPlaylistId]?.has(full.payload[i].fromItemId);
  const send = subPlan(full, (i) => !isGone(i));
  const held = subPlan(full, isGone);
  let settled = 0;
  let skipped = 0;
  if (held.payload.length) {
    const s = await settleGone(queryClient, held);
    if (s.plan.payload.length) dispatch(applySyncOutcome(s.plan, s.results));
    skipped = Object.keys(s.failures).length;
    if (skipped) dispatch(syncFailuresRecorded({ attempted: [], failures: s.failures }));
    settled = s.plan.payload.length;
  }
  return { plan: send.payload.length ? send : null, skipped, settled };
}

// The id a pushed song has in the playlist it was inserted into: the
// backend's `newItemId`, else the board's baseline after the push - or null
// when neither knows it (it is then left out of the cache, never written
// under the deleted id).
function insertedId(state, tierGroups, category, row, result) {
  if (result?.newItemId) return result.newItemId;
  if (state.tiers.loadedCategory !== category) return null;
  const tier = Object.keys(tierGroups[category] || {}).find((t) => tierGroups[category][t].id === row.toPlaylistId);
  const copy = tier && (state.tiers.originalTierItems[tier] || []).find((v) => v.videoId === row.videoId);
  return copy && copy.id !== row.fromItemId ? copy.id : null;
}

// Step 1 (see the top). Call once the push's results are in the store
// (applySyncOutcome), with the plan that was sent and the backend's per-row
// results - or results = null when the request itself failed (nothing is
// known: every touched playlist is re-read before the next push).
export async function recordPush(queryClient, { state, plan, results, tierGroups, category }) {
  const touched = touchedPlaylists(plan, tierGroups, category);
  await Promise.all(touched.map((id) => queryClient.cancelQueries({ queryKey: itemKey(id) })));
  const unsure = new Set();
  if (!results) touched.forEach((id) => unsure.add(id));

  const videos = [...plan.moves.map((m) => m.video), ...plan.transfers.map((t) => t.video)];
  const deleted = new Set();
  const inserted = {};
  // Each playlist's song count moves with what the push did (the playlists
  // list isn't re-read for it: quota, and a whole-app re-render).
  const counts = {};
  const count = (id, by) => {
    if (id) counts[id] = (counts[id] ?? 0) + by;
  };
  plan.payload.forEach((row, i) => {
    if (!results) return;
    const r = results[i];
    const ok = r?.success === true;
    // Same reading as syncPlan.syncOutcome: an older backend sends only `success`.
    const didInsert = !!row.toPlaylistId && (r?.inserted ?? ok) === true;
    const didRemove = !!row.fromItemId && (r?.removed ?? ok) === true;
    if (!ok) {
      // Maybe half done: re-read this row's own playlists.
      if (row.fromPlaylistId) unsure.add(row.fromPlaylistId);
      else touched.forEach((id) => unsure.add(id));
      if (row.toPlaylistId) unsure.add(row.toPlaylistId);
    }
    if (didRemove) {
      deleted.add(row.fromItemId);
      recordDeleted(row.fromItemId);
      count(row.fromPlaylistId, -1);
    }
    if (!didInsert) return;
    count(row.toPlaylistId, 1);
    const newId = insertedId(state, tierGroups, category, row, r);
    if (!newId) {
      unsure.add(row.toPlaylistId);
      return;
    }
    const { transfer: _, ...video } = videos[i];
    const item = { ...video, id: newId };
    (inserted[row.toPlaylistId] ??= []).push(item);
    recordInserted(row.toPlaylistId, item);
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
  bumpItemCounts(queryClient, counts);
}
