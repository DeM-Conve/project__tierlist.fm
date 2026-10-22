import { transferSyncRows } from './transfers';

// What Push sends to the backend's tier-sync (insert into toPlaylistId, then
// delete fromItemId - per-item results in the same order): the open board's
// staged moves / removals / duplicates (each row also names fromPlaylistId), then every staged transfer to
// another board. -> { payload, moves, transfers } where moves[i] /
// transfers[j] are the changes behind payload rows i and moves.length + j.
export function buildSyncPlan(pendingMoves, transfers, tierGroups, category) {
  const tiers = tierGroups[category] || {};
  const moveRows = pendingMoves.map((m) => ({
    videoId: m.video.videoId,
    title: m.video.title,
    fromItemId: m.video.id,
    // The playlist the item is in now, so the backend can run writes on the
    // same playlists one after another (YouTube answers 409 otherwise).
    fromPlaylistId: tiers[m.kind === 'dedupe' ? m.tier : m.from]?.id ?? null,
    // A dedupe or a Remove-bin entry has nothing to insert - it only
    // deletes that playlist item, so toPlaylistId is left out entirely.
    toPlaylistId: m.kind === 'move' ? tiers[m.to]?.id : null,
  }));
  const transferRows = transferSyncRows(transfers, tierGroups);
  return {
    payload: [...moveRows, ...transferRows.map((r) => r.row)],
    moves: pendingMoves,
    transfers: transferRows.map((r) => r.transfer),
  };
}

// Just these songs' staged tier moves (a Move on Suggested moves pushes at
// once): never their removals or duplicates, never another song's edit.
export function songMoves(pendingMoves, videoIds) {
  return pendingMoves.filter((m) => m.kind === 'move' && videoIds.includes(m.video.videoId));
}

// What the backend did with each of the plan's changes. `results` = its
// per-item results, in payload order. Each result may say `inserted` (the
// song was added to the target playlist, with `newItemId` - its new
// playlist-item id), `removed` (the source item is gone) and, on failure,
// `step` ('insert' | 'delete') and `error`. An older backend sends only
// `success`, which then stands for both steps.
//   moves / transfers: fully done (inserted where there was something to
//     insert, and the source item gone).
//   insertedMoves / insertedTransfers: half done - the song is in its new
//     playlist but the old copy is still there, so only the delete is left
//     (it must never be inserted again).
//   newIds: { [old item id]: new item id } for every insert that ran.
//   unknownIds: [{ oldId, videoId, playlistId }] - inserts YouTube returned
//     no id for (newItemId null): the caller refetches that playlist to
//     find it (tiersSlice.itemIdsResolved).
//   failures: { [old item id]: { step, error } } for everything not fully done.
export function syncOutcome(plan, results = []) {
  const out = { moves: [], transfers: [], insertedMoves: [], insertedTransfers: [], newIds: {}, unknownIds: [], failures: {} };
  plan.payload.forEach((row, i) => {
    const r = (results || [])[i];
    const isMove = i < plan.moves.length;
    const change = isMove ? plan.moves[i] : plan.transfers[i - plan.moves.length];
    const inserts = !!row.toPlaylistId;
    const ok = r?.success === true;
    const inserted = inserts && (r?.inserted ?? ok) === true;
    // A row with nothing to delete has nothing left behind either.
    const removed = !row.fromItemId || (r?.removed ?? ok) === true;
    if (inserted && r?.newItemId) out.newIds[row.fromItemId] = r.newItemId;
    // Inserted, but YouTube gave no id back: look it up (unknownIds).
    else if (inserted && row.fromItemId) out.unknownIds.push({ oldId: row.fromItemId, videoId: row.videoId, playlistId: row.toPlaylistId });
    if (ok || (removed && (inserted || !inserts))) {
      (isMove ? out.moves : out.transfers).push(change);
      return;
    }
    if (inserted) (isMove ? out.insertedMoves : out.insertedTransfers).push(change);
    out.failures[row.fromItemId] = {
      step: r?.step ?? (inserts && !inserted ? 'insert' : 'delete'),
      error: r?.error || (r ? null : 'No answer from the server for this song.'),
    };
  });
  return out;
}

// The new item ids of `unknownIds` (syncOutcome), found in freshly fetched
// playlists (`itemsOf`: { [playlistId]: video[] }): the copy of that video
// that isn't the old item - the last one, as an insert appends.
// -> { [old item id]: new item id } for those found.
export function resolveItemIds(unknownIds, itemsOf) {
  const out = {};
  for (const u of unknownIds) {
    const match = [...(itemsOf[u.playlistId] || [])].reverse().find((v) => v.videoId === u.videoId && v.id !== u.oldId);
    if (match) out[u.oldId] = match.id;
  }
  return out;
}

// Which of the plan's changes the backend fully applied.
export function succeeded(plan, results = []) {
  const { moves, transfers } = syncOutcome(plan, results);
  return { moves, transfers };
}

// Every playlist a plan touches (to refetch after the push).
export function touchedPlaylists(plan, tierGroups, category) {
  const ids = new Set(Object.values(tierGroups[category] || {}).map((p) => p.id));
  for (const t of plan.transfers) {
    const from = tierGroups[t.fromCategory]?.[t.fromTier]?.id;
    const to = tierGroups[t.toCategory]?.[t.toTier]?.id;
    if (from) ids.add(from);
    if (to) ids.add(to);
  }
  return [...ids];
}
