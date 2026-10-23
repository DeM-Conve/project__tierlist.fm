import { createAction } from '@reduxjs/toolkit';

// Playlist items this browser holds under an id YouTube no longer has,
// re-pointed at the copy of the same video that is in that playlist now (see
// syncCache.js checkItemIds). Payload:
//   renamed: { [playlistId]: { [oldItemId]: newItemId } } - per playlist: the
//     same old id can be held in two playlists (a half-done move leaves the
//     real old item behind while the target's copy waits for its id), and
//     only the holder under the playlist it was checked against may change.
//   tierPlaylist: { [tier]: playlistId } for the loaded board,
//   transferPlaylist: { [transferId]: source playlistId }, dragPlaylist,
//   failureRenames: { old: new } - push failures to re-key (tiersSlice).
// Handled by both the board draft (tiersSlice) and the staged transfers
// (transfersSlice), whose ids are the playlist item ids too.
export const itemIdsRebased = createAction('items/idsRebased');

// One song with its ids re-pointed (`renamed` = one playlist's map): its own
// item id, and on an arrived card the transfer it belongs to (a transfer's id
// is its song's item id).
export function rebaseVideo(video, renamed) {
  if (!video || !renamed) return video;
  const id = video.id != null ? renamed[video.id] : undefined;
  const transfer = video.transfer != null ? renamed[video.transfer] : undefined;
  if (id === undefined && transfer === undefined) return video;
  return { ...video, ...(id !== undefined && { id }), ...(transfer !== undefined && { transfer }) };
}

// `{ [tier]: video[] }` with every song re-pointed under `renamedFor(video, tier)`.
export function rebaseTiers(tiers, renamedFor) {
  if (!tiers) return tiers;
  return Object.fromEntries(
    Object.entries(tiers).map(([tier, list]) => [tier, (list || []).map((v) => rebaseVideo(v, renamedFor(v, tier)))])
  );
}

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
