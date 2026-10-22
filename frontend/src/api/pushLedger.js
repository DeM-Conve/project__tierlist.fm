// What this session's pushes did to each playlist, so any later read of a
// playlist is reconciled with it (playlistItemsQuery's queryFn): YouTube's
// list is eventually consistent and can lag behind a push for a while, and a
// lagging read used to land in the cache (and the board cache in IndexedDB)
// as fresh data - bringing back items the push deleted (a later move of the
// song then re-inserted it and failed on the delete: a duplicate) and losing
// the ones it inserted.
//
// `deleted`: item ids a push removed (item ids are unique across YouTube, so
// one set serves every playlist). `inserted`: per playlist, the items a push
// added - with their real new id only, never a placeholder - until a read
// shows them. In memory only: by the next session YouTube has caught up.
const deleted = new Set();
const inserted = new Map(); // playlistId -> Map(itemId -> video)

export function recordDeleted(itemId) {
  if (itemId == null) return;
  deleted.add(itemId);
  for (const items of inserted.values()) items.delete(itemId);
}

export function recordInserted(playlistId, video) {
  if (!playlistId || video?.id == null) return;
  if (!inserted.has(playlistId)) inserted.set(playlistId, new Map());
  inserted.get(playlistId).set(video.id, video);
}

// A read of one playlist, as it is after this session's pushes: deleted
// items dropped, inserted ones the read hasn't caught up with appended (an
// insert appends on YouTube too). An insert the read does show is done.
export function reconcileItems(playlistId, items) {
  if (!Array.isArray(items)) return items;
  const out = items.filter((v) => !deleted.has(v.id));
  const pending = inserted.get(playlistId);
  if (pending) {
    const seen = new Set(items.map((v) => v.id));
    for (const [id, video] of pending) {
      if (seen.has(id)) pending.delete(id);
      else out.push(video);
    }
  }
  return out;
}

// Tests (and logout: another account's pushes say nothing about this one's).
export function resetPushLedger() {
  deleted.clear();
  inserted.clear();
}
