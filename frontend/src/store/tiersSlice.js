import { createSlice, current, isDraft, original } from '@reduxjs/toolkit';
import { REMOVED_TIER } from '../tiers';
import { overlayTransfers, transferId } from '../transfers';
import { itemIdsRebased, rebaseTiers } from './itemIds';

const UNDO_LIMIT = 50;

// dropIndex omitted (null/undefined) means "append to the end of the target tier".
function applyMove(state, { fromTier, toTier, videoId, dropIndex }) {
  const sourceArr = state.tierItems[fromTier] || [];
  const video = sourceArr.find((v) => v.videoId === videoId);
  if (!video) return;

  if (fromTier === toTier) {
    if (dropIndex == null) return;
    const originalIndex = sourceArr.findIndex((v) => v.videoId === videoId);
    const withoutVideo = sourceArr.filter((v) => v.videoId !== videoId);
    let index = originalIndex < dropIndex ? dropIndex - 1 : dropIndex;
    index = Math.max(0, Math.min(index, withoutVideo.length));
    withoutVideo.splice(index, 0, video);
    state.tierItems[fromTier] = withoutVideo;
    return;
  }

  const targetArr = [...(state.tierItems[toTier] || [])];
  const index = dropIndex == null ? targetArr.length : Math.max(0, Math.min(dropIndex, targetArr.length));
  targetArr.splice(index, 0, video);
  state.tierItems[fromTier] = sourceArr.filter((v) => v.videoId !== videoId);
  state.tierItems[toTier] = targetArr;
}

// Every user edit snapshots the pre-edit tierItems first, so Ctrl+Z / a
// toast's "Undo" can restore it exactly (positions included). `original`
// hands back Immer's frozen base object, so this is structural sharing,
// not a deep copy per edit.
function pushUndo(state) {
  state.undoStack.push(original(state.tierItems));
  if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
  state.redoStack = [];
}

// `fn(video)` -> the video to keep in its place (the same object when
// unchanged). Returns `board` itself when nothing changed.
function mapBoard(board, fn) {
  if (!board) return board;
  let changed = false;
  const out = {};
  for (const [tier, list] of Object.entries(board)) {
    out[tier] = (list || []).map((v) => {
      const next = fn(v);
      if (next !== v) changed = true;
      return next;
    });
  }
  return changed ? out : board;
}

// Rewrites videos in the draft *and* every undo/redo snapshot - so after a
// push no copy anywhere still carries an item id YouTube has since deleted
// (an undo would otherwise bring that stale id back into the next push).
function mapEveryBoard(state, fn) {
  const plain = (x) => (isDraft(x) ? current(x) : x);
  const draft = plain(state.tierItems);
  const nextDraft = mapBoard(draft, fn);
  if (nextDraft !== draft) state.tierItems = nextDraft;
  for (const key of ['undoStack', 'redoStack']) {
    const stack = plain(state[key]);
    const next = stack.map((b) => mapBoard(b, fn));
    if (next.some((b, i) => b !== stack[i])) state[key] = next;
  }
}

// A pushed move's song now lives in its new playlist under a new item id
// (`newIds`: old item id -> new one, see syncPlan.syncOutcome).
const withNewId = (video, newIds) => (newIds[video.id] ? { ...video, id: newIds[video.id] } : video);

const tiersSlice = createSlice({
  name: 'tiers',
  initialState: {
    tierItems: {}, // { [tier]: video[] } - current, possibly locally-edited state
    tierLoading: {}, // { [tier]: boolean }
    // Snapshot of what's actually on YouTube right now, taken whenever a
    // board loads/reloads. originalTierItems powers "Discard"; originalTierOf
    // is `{ [videoId]: tier[] }` (plain array, not a Set, so it stays
    // serializable in the store) and powers the pending/duplicate logic -
    // a video whose current tier isn't in this list has genuinely moved.
    originalTierItems: {},
    originalTierOf: {},
    // `{ [tier]: video[] }`: extra copies of a video already in that same
    // playlist (YouTube lets a playlist hold one video twice). The board
    // shows one copy; these stay off it and are auto-staged for removal
    // (selectPendingMoves), like a copy in a lower tier.
    duplicateCopies: {},
    syncStatus: 'idle', // idle | syncing | done | partial | error
    // Why the last push of each change failed: `{ [item id]: { step, error } }`
    // (step 'insert' | 'delete', error the backend's plain-language reason).
    // Keyed by the item id the push sent, so it shows next to that change in
    // the review list for as long as it's still staged - see
    // selectStagedFailures. Not tied to the open board: transfers fail too.
    syncFailures: {},
    draggedVideoId: null,
    dragOverTier: null,
    // Which category's data tierItems currently holds. Lets a routed page
    // component tell "I need to fetch this board" apart from "this board is
    // already loaded, possibly with local edits (a duel result, a drag) that
    // a redundant refetch would silently discard" - the router remounts the
    // tier board page every time you navigate back to it (e.g. after a
    // duel), which must NOT re-trigger a fetch for the same category.
    loadedCategory: null,
    // `{ category, since }` while the loaded board shows data that is being
    // refreshed in the background (a copy from the board cache): `since` is
    // that data's dataUpdatedAt. The fresh copy replaces the board once, and
    // only if nothing was edited meanwhile - see tierActions' landBoardRefresh.
    awaitingRefresh: null,
    // Snapshots of tierItems before each local edit (drag, menu move, bulk
    // move, rating, duel result) - newest last. Cleared when the board is
    // reloaded or discarded, since those replace the baseline itself.
    undoStack: [],
    // Snapshots undone by Ctrl+Z, newest last, for Ctrl+Shift+Z / Ctrl+Y.
    // Only valid while tierItems is exactly what the last undo/redo left:
    // a new edit (pushUndo) or anything else that rewrites tierItems (a
    // load, sync, transfer, discard) clears it - see dropRedo.
    redoStack: [],
  },
  reducers: {
    resetTierBoard: (state, action) => {
      state.redoStack = [];
      const { presentTiers } = action.payload;
      state.tierItems = {};
      state.tierLoading = Object.fromEntries(presentTiers.map((t) => [t, true]));
      state.originalTierItems = {};
      state.originalTierOf = {};
      state.duplicateCopies = {};
      state.undoStack = [];
    },
    // Deliberately separate from resetTierBoard: this marks "the mirror
    // effect has finished applying fresh query data for this category" and
    // must only be set once that's actually true, not the moment a reset/
    // refetch starts - see the useLoadTierBoard hook in App.jsx.
    setLoadedCategory: (state, action) => {
      state.loadedCategory = action.payload;
    },
    setAwaitingRefresh: (state, action) => {
      state.awaitingRefresh = action.payload;
    },
    setTierForCategory: (state, action) => {
      state.redoStack = [];
      const { tier, videos: all } = action.payload;
      const seen = new Set();
      const videos = [];
      const copies = [];
      all.forEach((v) => {
        if (seen.has(v.videoId)) copies.push(v);
        else {
          seen.add(v.videoId);
          videos.push(v);
        }
      });
      state.duplicateCopies[tier] = copies;
      state.tierItems[tier] = videos;
      state.tierLoading[tier] = false;
      state.originalTierItems[tier] = videos;
      videos.forEach((v) => {
        const existing = state.originalTierOf[v.videoId] || [];
        if (!existing.includes(tier)) state.originalTierOf[v.videoId] = [...existing, tier];
      });
    },
    setTierItems: (state, action) => {
      state.redoStack = [];
      state.tierItems = action.payload;
    },
    // Applies a sync's succeeded moves straight to the local draft instead
    // of waiting on a refetch of YouTube's own playlist API to reflect
    // them. That refetch can lag a moment behind the write that just
    // happened (or, before this, a stale-while-revalidate cache would serve
    // pre-sync data as "fresh" the instant loadedCategory was cleared,
    // stopping any later real refresh from ever landing - see the comment
    // in App.jsx's syncChanges). The local draft already shows the intended
    // end state - a dedupe's duplicate copy or a moved video is already
    // sitting where the user put it - so this just makes that the new
    // baseline (dropping it from `originalTierOf`/`originalTierItems`, and
    // for a dedupe, actually removing the now-deleted duplicate) rather
    // than re-deriving it from a server round trip.
    //
    // `newIds` (old item id -> new one): a moved song now has a new playlist
    // item, so every copy of it in the draft, the baseline and the undo/redo
    // snapshots takes that id - a later move must delete *that* item, never
    // the one this push already deleted (that re-inserted the song and then
    // failed on the delete, leaving a duplicate).
    // `inserted`: moves that were only half done - the song is in its new
    // playlist (so that copy joins the baseline) but its old copy is still
    // there. The old copy becomes a hidden duplicate (`duplicateCopies`,
    // auto-staged as a delete-only dedupe), so the next push only deletes
    // it and never inserts the song again. The undo history is dropped: it
    // can't describe a board that YouTube only half matches.
    applySyncedMoves: (state, action) => {
      state.redoStack = [];
      const { moves, newIds = {}, inserted = [] } = action.payload;
      if (Object.keys(newIds).length) mapEveryBoard(state, (v) => withNewId(v, newIds));
      const toBaseline = (m) => {
        state.originalTierItems[m.from] = (state.originalTierItems[m.from] || []).filter(
          (v) => v.videoId !== m.video.videoId
        );
        const target = state.originalTierItems[m.to] || [];
        if (!target.some((v) => v.videoId === m.video.videoId)) {
          state.originalTierItems[m.to] = [...target, withNewId(m.video, newIds)];
        }
        state.originalTierOf[m.video.videoId] = [m.to];
      };
      moves.forEach((m) => {
        if (m.kind === 'remove') {
          const drop = (list) => (list || []).filter((v) => v.videoId !== m.video.videoId);
          state.tierItems[REMOVED_TIER] = drop(state.tierItems[REMOVED_TIER]);
          state.originalTierItems[m.from] = drop(state.originalTierItems[m.from]);
          state.originalTierOf[m.video.videoId] = (state.originalTierOf[m.video.videoId] || []).filter(
            (t) => t !== m.from
          );
          if (!state.originalTierOf[m.video.videoId].length) delete state.originalTierOf[m.video.videoId];
        } else if (m.kind === 'dedupe' && (state.duplicateCopies[m.tier] || []).some((v) => v.id === m.video.id)) {
          // A hidden copy (same playlist twice, or left behind by a half
          // done move): only that playlist item is gone, the board's copy
          // stays.
          state.duplicateCopies[m.tier] = (state.duplicateCopies[m.tier] || []).filter((v) => v.id !== m.video.id);
        } else if (m.kind === 'dedupe') {
          state.tierItems[m.tier] = (state.tierItems[m.tier] || []).filter(
            (v) => v.videoId !== m.video.videoId
          );
          state.originalTierItems[m.tier] = (state.originalTierItems[m.tier] || []).filter(
            (v) => v.videoId !== m.video.videoId
          );
          state.originalTierOf[m.video.videoId] = (state.originalTierOf[m.video.videoId] || []).filter(
            (t) => t !== m.tier
          );
        } else {
          toBaseline(m);
        }
      });
      inserted.forEach((m) => {
        toBaseline(m);
        state.duplicateCopies[m.from] = [...(state.duplicateCopies[m.from] || []), m.video];
      });
      if (inserted.length) state.undoStack = [];
    },
    // Item ids a push couldn't report (YouTube returned none), found by
    // refetching the target playlist: { [old item id]: new item id }. Same
    // rewrite as applySyncedMoves' newIds, baseline included. Hidden copies
    // (`duplicateCopies`) keep theirs - a half-done move's old copy really
    // is the old item.
    itemIdsResolved: (state, action) => {
      const newIds = action.payload;
      if (!Object.keys(newIds).length) return;
      mapEveryBoard(state, (v) => withNewId(v, newIds));
      const base = current(state.originalTierItems);
      const next = mapBoard(base, (v) => withNewId(v, newIds));
      if (next !== base) state.originalTierItems = next;
    },
    // A song filed from Add songs is already on YouTube, so it joins the
    // loaded board's draft *and* its baseline - it's not a pending change.
    addSyncedVideo: (state, action) => {
      state.redoStack = [];
      const { tier, video } = action.payload;
      state.tierItems[tier] = [...(state.tierItems[tier] || []), video];
      state.originalTierItems[tier] = [...(state.originalTierItems[tier] || []), video];
      state.originalTierOf[video.videoId] = [...(state.originalTierOf[video.videoId] || []), tier];
    },
    // Undo of addSyncedVideo (the playlist item was deleted again).
    removeSyncedVideo: (state, action) => {
      state.redoStack = [];
      const { tier, videoId } = action.payload;
      state.tierItems[tier] = (state.tierItems[tier] || []).filter((v) => v.videoId !== videoId);
      state.originalTierItems[tier] = (state.originalTierItems[tier] || []).filter((v) => v.videoId !== videoId);
      state.originalTierOf[videoId] = (state.originalTierOf[videoId] || []).filter((t) => t !== tier);
      if (!state.originalTierOf[videoId].length) delete state.originalTierOf[videoId];
    },
    discardTierChanges: (state) => {
      state.redoStack = [];
      state.tierItems = JSON.parse(JSON.stringify(state.originalTierItems));
      state.syncStatus = 'idle';
      state.syncFailures = {};
      state.undoStack = [];
    },
    setSyncStatus: (state, action) => {
      state.syncStatus = action.payload;
    },
    // A push finished: `attempted` = the item ids it sent (their old reasons
    // go), `failures` = why some of them failed this time.
    syncFailuresRecorded: (state, action) => {
      const { attempted, failures } = action.payload;
      attempted.forEach((id) => delete state.syncFailures[id]);
      Object.assign(state.syncFailures, failures);
    },
    setDraggedVideoId: (state, action) => {
      state.draggedVideoId = action.payload;
    },
    setDragOverTier: (state, action) => {
      state.dragOverTier = action.payload;
    },
    moveVideoToTier: (state, action) => {
      pushUndo(state);
      applyMove(state, action.payload);
    },
    // A batch (bulk "Move to", a duel result, ...) is one undo step.
    moveVideos: (state, action) => {
      pushUndo(state);
      action.payload.moves.forEach((m) => applyMove(state, m));
    },
    // Refills the ranked tiers as one undoable edit (a finished duel run).
    // Merged, not replaced: the result doesn't include the unranked TODO.
    applyTierOrder: (state, action) => {
      pushUndo(state);
      state.tierItems = { ...state.tierItems, ...action.payload };
    },
    // A song arriving from another board (transfers.js), dropped on `tier`:
    // one undoable edit, like any drop. Not in the baseline - it's staged.
    transferArrived: (state, action) => {
      const { tier, video, dropIndex } = action.payload;
      pushUndo(state);
      const list = [...(state.tierItems[tier] || [])];
      const index = dropIndex == null ? list.length : Math.max(0, Math.min(dropIndex, list.length));
      list.splice(index, 0, video);
      state.tierItems[tier] = list;
    },
    // The board just loaded, as it looks with the staged transfers.
    transfersOverlaid: (state, action) => {
      state.redoStack = [];
      const { transfers, category } = action.payload;
      state.tierItems = overlayTransfers(state.tierItems, transfers, category);
    },
    // A transfer taken back on the open board: the arrived card leaves, or
    // the song that left comes back to its tier.
    transferUndone: (state, action) => {
      state.redoStack = [];
      const t = action.payload;
      for (const tier of Object.keys(state.tierItems)) {
        state.tierItems[tier] = state.tierItems[tier].filter((v) => v.transfer !== t.id);
      }
      if (state.loadedCategory === t.fromCategory && !(state.tierItems[t.fromTier] || []).some((v) => transferId(v) === t.id)) {
        state.tierItems[t.fromTier] = [...(state.tierItems[t.fromTier] || []), t.video];
      }
    },
    // Pushed transfers become the open board's new baseline: an arrived song
    // is simply in its tier now, under its new item id (`newIds`, like
    // applySyncedMoves); a song that left is gone from the baseline.
    // `inserted`: transfers only half done (added to the target, the old copy
    // still there) - their target side is applied the same way now, the
    // source side stays staged in the transfer list (transfersInserted).
    // Payload: { transfers, newIds, inserted }, or just the transfers.
    transfersApplied: (state, action) => {
      state.redoStack = [];
      const { transfers, newIds = {}, inserted = [] } = Array.isArray(action.payload)
        ? { transfers: action.payload }
        : action.payload;
      const arrived = (t) => {
        if (state.loadedCategory !== t.toCategory || t.inserted) return;
        const fix = (v) => {
          if (v.transfer !== t.id) return v;
          const { transfer: _, ...video } = v;
          return withNewId(video, newIds);
        };
        mapEveryBoard(state, fix);
        const was = state.originalTierItems[t.toTier] || [];
        if (!was.some((v) => v.videoId === t.video.videoId)) {
          state.originalTierItems[t.toTier] = [...was, withNewId(t.video, newIds)];
        }
        const tiersOf = state.originalTierOf[t.video.videoId] || [];
        if (!tiersOf.includes(t.toTier)) state.originalTierOf[t.video.videoId] = [...tiersOf, t.toTier];
      };
      for (const t of transfers) {
        if (state.loadedCategory === t.fromCategory) {
          state.originalTierItems[t.fromTier] = (state.originalTierItems[t.fromTier] || []).filter((v) => transferId(v) !== t.id);
          const left = (state.originalTierOf[t.video.videoId] || []).filter((x) => x !== t.fromTier);
          if (left.length) state.originalTierOf[t.video.videoId] = left;
          else delete state.originalTierOf[t.video.videoId];
        }
        arrived(t);
      }
      inserted.forEach(arrived);
      if (inserted.length) state.undoStack = [];
    },
    undoLastEdit: (state) => {
      const previous = state.undoStack.pop();
      if (!previous) return;
      state.redoStack.push(original(state.tierItems));
      state.tierItems = previous;
    },
    // The inverse of undoLastEdit: re-applies the last undone edit, and it
    // can be undone again.
    redoLastEdit: (state) => {
      const next = state.redoStack.pop();
      if (!next) return;
      state.undoStack.push(original(state.tierItems));
      if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
      state.tierItems = next;
    },
  },
  extraReducers: (builder) => {
    // Stale playlist item ids re-pointed at YouTube's current ones (see
    // syncCache.js): everywhere a song is held - the draft, its baseline,
    // the hidden duplicate copies and every undo / redo snapshot - so no
    // later push, undo or redo brings back an id that no longer exists.
    builder.addCase(itemIdsRebased, (state, action) => {
      const { renamed, tierPlaylist = {}, transferPlaylist = {}, failureRenames = {} } = action.payload;
      const base = original(state.originalTierItems);
      const holds = (tier, id) => (base[tier] || []).some((x) => x.id === id);
      // The playlist a shown song's id belongs to: a card from another
      // board, its transfer's source; else the baseline tier holding that id
      // (its own tier first - a half-done move's id is held in two).
      const ownerOf = (v, tier) => {
        if (v.transfer != null) return transferPlaylist[v.transfer];
        const t = holds(tier, v.id) ? tier : Object.keys(base).find((k) => holds(k, v.id));
        return t && tierPlaylist[t];
      };
      const shown = (v, tier) => renamed[ownerOf(v, tier)];
      const own = (_, tier) => renamed[tierPlaylist[tier]];
      state.tierItems = rebaseTiers(original(state.tierItems), shown);
      state.originalTierItems = rebaseTiers(base, own);
      state.duplicateCopies = rebaseTiers(original(state.duplicateCopies), own);
      state.undoStack = original(state.undoStack).map((snap) => rebaseTiers(snap, shown));
      state.redoStack = original(state.redoStack).map((snap) => rebaseTiers(snap, shown));
      for (const [old, next] of Object.entries(failureRenames)) {
        if (!(old in state.syncFailures)) continue;
        state.syncFailures[next] = state.syncFailures[old];
        delete state.syncFailures[old];
      }
    });
  },
});

export const {
  resetTierBoard,
  setLoadedCategory,
  setAwaitingRefresh,
  setTierForCategory,
  setTierItems,
  applySyncedMoves,
  itemIdsResolved,
  addSyncedVideo,
  removeSyncedVideo,
  discardTierChanges,
  setSyncStatus,
  syncFailuresRecorded,
  setDraggedVideoId,
  setDragOverTier,
  moveVideoToTier,
  moveVideos,
  applyTierOrder,
  undoLastEdit,
  redoLastEdit,
  transferArrived,
  transfersOverlaid,
  transferUndone,
  transfersApplied,
} = tiersSlice.actions;
export default tiersSlice.reducer;
