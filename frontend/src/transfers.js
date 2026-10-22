import { REMOVED_TIER } from './tiers';

// Moving a song to another board ("transfer"): drag it from a tier, hold it
// over another board in the sidebar until that board opens, drop it on a
// tier there. It's a staged change like any move - nothing happens on
// YouTube until Push, which adds it to the target playlist and deletes it
// from the old one.
//
// A transfer is { id, video, fromCategory, fromTier, toCategory, toTier }, plus
// `inserted: true` (and `newItemId`) once a push has added the song to the
// target playlist but couldn't delete the old copy: then the target copy is
// simply part of that board, and only the delete is left to push.
// `id` is the video's playlist item id (unique per copy), so a song that's in
// a playlist twice moves one copy. While the target board is open, the card
// sitting there carries `transfer: id` and *it* says where the song goes
// (dragging it to another tier, undoing the drop or binning it all just
// edit the board as usual) - see effectiveTransfers.

export const transferId = (video) => video.id ?? video.videoId;

// Where each staged transfer really goes right now. On the target board the
// card's own tier wins; a card that's no longer there (drop undone, board
// discarded) or sits in the Remove bin means the transfer is off.
export function effectiveTransfers(transfers, loadedCategory, tierItems) {
  return transfers.flatMap((t) => {
    if (t.toCategory !== loadedCategory || t.inserted) return [t];
    const tier = Object.keys(tierItems).find((k) => (tierItems[k] || []).some((v) => v.transfer === t.id));
    if (!tier || tier === REMOVED_TIER) return [];
    return [tier === t.toTier ? t : { ...t, toTier: tier }];
  });
}

// A board as it looks with the staged transfers: songs moved away are gone
// from their tier, songs moved here sit in theirs (marked `transfer`).
export function overlayTransfers(tierItems, transfers, category) {
  const out = { ...tierItems };
  for (const t of transfers) {
    if (t.fromCategory === category && out[t.fromTier]) {
      out[t.fromTier] = out[t.fromTier].filter((v) => transferId(v) !== t.id);
    }
  }
  for (const t of transfers) {
    if (t.toCategory === category && !t.inserted && out[t.toTier] && !out[t.toTier].some((v) => v.transfer === t.id)) {
      out[t.toTier] = [...out[t.toTier], { ...t.video, transfer: t.id }];
    }
  }
  return out;
}

// Push payload rows (the backend's tier-sync: insert into toPlaylistId, then
// delete fromItemId). `tierGroups` = selectTierGroups. A transfer whose
// target playlist is gone is left out; one already inserted only deletes.
export function transferSyncRows(transfers, tierGroups) {
  return transfers.flatMap((t) => {
    const row = {
      videoId: t.video.videoId,
      title: t.video.title,
      fromItemId: t.video.id,
      fromPlaylistId: tierGroups[t.fromCategory]?.[t.fromTier]?.id ?? null,
    };
    if (t.inserted) return [{ transfer: t, row: { ...row, toPlaylistId: null } }];
    const toPlaylistId = tierGroups[t.toCategory]?.[t.toTier]?.id;
    if (!toPlaylistId) return [];
    return [{ transfer: t, row: { ...row, toPlaylistId } }];
  });
}
