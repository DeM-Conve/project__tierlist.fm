import { createSlice, original } from '@reduxjs/toolkit';

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
}

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
    syncStatus: 'idle', // idle | syncing | done | partial | error
    draggedVideoId: null,
    dragOverTier: null,
    // Which category's data tierItems currently holds. Lets a routed page
    // component tell "I need to fetch this board" apart from "this board is
    // already loaded, possibly with local edits (a duel result, a drag) that
    // a redundant refetch would silently discard" - the router remounts the
    // tier board page every time you navigate back to it (e.g. after a
    // duel), which must NOT re-trigger a fetch for the same category.
    loadedCategory: null,
    // Snapshots of tierItems before each local edit (drag, menu move, bulk
    // move, rating, duel result) - newest last. Cleared when the board is
    // reloaded or discarded, since those replace the baseline itself.
    undoStack: [],
  },
  reducers: {
    resetTierBoard: (state, action) => {
      const { presentTiers } = action.payload;
      state.tierItems = {};
      state.tierLoading = Object.fromEntries(presentTiers.map((t) => [t, true]));
      state.originalTierItems = {};
      state.originalTierOf = {};
      state.undoStack = [];
    },
    // Deliberately separate from resetTierBoard: this marks "the mirror
    // effect has finished applying fresh query data for this category" and
    // must only be set once that's actually true, not the moment a reset/
    // refetch starts - see the useLoadTierBoard hook in App.jsx.
    setLoadedCategory: (state, action) => {
      state.loadedCategory = action.payload;
    },
    setTierForCategory: (state, action) => {
      const { tier, videos } = action.payload;
      state.tierItems[tier] = videos;
      state.tierLoading[tier] = false;
      state.originalTierItems[tier] = videos;
      videos.forEach((v) => {
        const existing = state.originalTierOf[v.videoId] || [];
        if (!existing.includes(tier)) state.originalTierOf[v.videoId] = [...existing, tier];
      });
    },
    setTierItems: (state, action) => {
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
    applySyncedMoves: (state, action) => {
      const { moves } = action.payload;
      moves.forEach((m) => {
        if (m.kind === 'dedupe') {
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
          state.originalTierItems[m.from] = (state.originalTierItems[m.from] || []).filter(
            (v) => v.videoId !== m.video.videoId
          );
          const target = state.originalTierItems[m.to] || [];
          if (!target.some((v) => v.videoId === m.video.videoId)) {
            state.originalTierItems[m.to] = [...target, m.video];
          }
          state.originalTierOf[m.video.videoId] = [m.to];
        }
      });
    },
    // A song filed from the Inbox is already on YouTube, so it joins the
    // loaded board's draft *and* its baseline - it's not a pending change.
    addSyncedVideo: (state, action) => {
      const { tier, video } = action.payload;
      state.tierItems[tier] = [...(state.tierItems[tier] || []), video];
      state.originalTierItems[tier] = [...(state.originalTierItems[tier] || []), video];
      state.originalTierOf[video.videoId] = [...(state.originalTierOf[video.videoId] || []), tier];
    },
    // Undo of addSyncedVideo (the playlist item was deleted again).
    removeSyncedVideo: (state, action) => {
      const { tier, videoId } = action.payload;
      state.tierItems[tier] = (state.tierItems[tier] || []).filter((v) => v.videoId !== videoId);
      state.originalTierItems[tier] = (state.originalTierItems[tier] || []).filter((v) => v.videoId !== videoId);
      state.originalTierOf[videoId] = (state.originalTierOf[videoId] || []).filter((t) => t !== tier);
      if (!state.originalTierOf[videoId].length) delete state.originalTierOf[videoId];
    },
    discardTierChanges: (state) => {
      state.tierItems = JSON.parse(JSON.stringify(state.originalTierItems));
      state.syncStatus = 'idle';
      state.undoStack = [];
    },
    setSyncStatus: (state, action) => {
      state.syncStatus = action.payload;
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
    undoLastEdit: (state) => {
      const previous = state.undoStack.pop();
      if (previous) state.tierItems = previous;
    },
  },
});

export const {
  resetTierBoard,
  setLoadedCategory,
  setTierForCategory,
  setTierItems,
  applySyncedMoves,
  addSyncedVideo,
  removeSyncedVideo,
  discardTierChanges,
  setSyncStatus,
  setDraggedVideoId,
  setDragOverTier,
  moveVideoToTier,
  moveVideos,
  applyTierOrder,
  undoLastEdit,
} = tiersSlice.actions;
export default tiersSlice.reducer;
