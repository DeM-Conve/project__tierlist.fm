import { transferSyncRows } from './transfers';

// What Push sends to the backend's tier-sync (insert into toPlaylistId, then
// delete fromItemId - per-item results in the same order): the open board's
// staged moves / removals / duplicates, then every staged transfer to
// another board. -> { payload, moves, transfers } where moves[i] /
// transfers[j] are the changes behind payload rows i and moves.length + j.
export function buildSyncPlan(pendingMoves, transfers, tierGroups, category) {
  const tiers = tierGroups[category] || {};
  const moveRows = pendingMoves.map((m) => ({
    videoId: m.video.videoId,
    title: m.video.title,
    fromItemId: m.video.id,
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

// Which of the plan's changes the backend applied. `results` = its
// per-item results, in payload order.
export function succeeded(plan, results = []) {
  const ok = (i) => results[i]?.success === true;
  return {
    moves: plan.moves.filter((_, i) => ok(i)),
    transfers: plan.transfers.filter((_, j) => ok(plan.moves.length + j)),
  };
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
