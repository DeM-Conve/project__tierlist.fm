import { createSlice } from '@reduxjs/toolkit';

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
  },
  reducers: {
    resetTierBoard: (state, action) => {
      const { category, presentTiers } = action.payload;
      state.tierItems = {};
      state.tierLoading = Object.fromEntries(presentTiers.map((t) => [t, true]));
      state.originalTierItems = {};
      state.originalTierOf = {};
      state.loadedCategory = category;
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
    discardTierChanges: (state) => {
      state.tierItems = JSON.parse(JSON.stringify(state.originalTierItems));
      state.syncStatus = 'idle';
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
    // dropIndex omitted (null/undefined) means "append to the end of the target tier".
    moveVideoToTier: (state, action) => {
      const { fromTier, toTier, videoId, dropIndex } = action.payload;
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
    },
  },
});

export const {
  resetTierBoard,
  setTierForCategory,
  setTierItems,
  discardTierChanges,
  setSyncStatus,
  setDraggedVideoId,
  setDragOverTier,
  moveVideoToTier,
} = tiersSlice.actions;
export default tiersSlice.reducer;
