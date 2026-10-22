import { createAction } from '@reduxjs/toolkit';

// `{ [oldItemId]: newItemId }`: playlist items this browser holds under an id
// YouTube no longer has, re-pointed at the copy of the same video that is in
// that playlist now (see syncCache.js checkItemIds). Handled by both the
// board draft (tiersSlice) and the staged transfers (transfersSlice), whose
// ids are the playlist item ids too.
export const itemIdsRebased = createAction('items/idsRebased');

// One song with its ids re-pointed: its own item id, and on an arrived card
// the transfer it belongs to (a transfer's id is its song's item id).
export function rebaseVideo(video, renamed) {
  if (!video) return video;
  const id = video.id != null ? renamed[video.id] : undefined;
  const transfer = video.transfer != null ? renamed[video.transfer] : undefined;
  if (id === undefined && transfer === undefined) return video;
  return { ...video, ...(id !== undefined && { id }), ...(transfer !== undefined && { transfer }) };
}

// `{ [tier]: video[] }` with every song re-pointed.
export function rebaseTiers(tiers, renamed) {
  if (!tiers) return tiers;
  return Object.fromEntries(Object.entries(tiers).map(([tier, list]) => [tier, (list || []).map((v) => rebaseVideo(v, renamed))]));
}
