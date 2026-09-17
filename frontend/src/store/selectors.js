import { createSelector } from '@reduxjs/toolkit';
import { TIER_ORDER, groupByTier } from '../tiers';

const selectPlaylists = (state) => state.auth.playlists;
const selectTierItems = (state) => state.tiers.tierItems;
const selectOriginalTierOf = (state) => state.tiers.originalTierOf;
const selectActiveView = (state) => state.view.activeView;
const selectFocusedVideo = (state) => state.focus.focusedVideo;
const selectFocusQueue = (state) => state.focus.focusQueue;

export const selectTierGroups = createSelector([selectPlaylists], (playlists) =>
  playlists ? groupByTier(playlists) : {}
);

export const selectTierCategories = createSelector([selectTierGroups], (groups) =>
  Object.keys(groups).sort()
);

// A video counts as "moved" only if the tier it's sitting in now isn't one
// it originally belonged to. If the same video genuinely exists in two of
// this board's real YouTube tier playlists at once, the highest tier it's
// in is kept and every other occurrence is auto-staged for removal - no
// bogus "move" is reported for either.
export const selectPendingMoves = createSelector(
  [selectTierItems, selectOriginalTierOf],
  (tierItems, originalTierOf) => {
    const moves = [];
    for (const tier of TIER_ORDER) {
      for (const video of tierItems[tier] || []) {
        const originalTiers = originalTierOf[video.videoId];
        if (!originalTiers) continue;

        if (originalTiers.length > 1) {
          const keepTier = TIER_ORDER.find((t) => originalTiers.includes(t));
          if (tier !== keepTier) {
            moves.push({ kind: 'dedupe', video, tier });
          }
          continue;
        }

        if (!originalTiers.includes(tier)) {
          moves.push({ kind: 'move', video, from: originalTiers[0], to: tier });
        }
      }
    }
    return moves;
  }
);

export const selectDuelPool = createSelector([selectTierItems], (tierItems) =>
  TIER_ORDER.flatMap((t) => tierItems[t] || [])
);

export const selectDuelRuns = createSelector([selectTierItems], (tierItems) =>
  TIER_ORDER.filter((t) => tierItems[t]).map((t) => tierItems[t].map((v) => v.videoId))
);

export const selectDuelTierSizes = createSelector([selectTierItems], (tierItems) =>
  TIER_ORDER.filter((t) => tierItems[t]).map((t) => ({ tier: t, count: tierItems[t].length }))
);

// Flattened across every tier of the current board, in tier order, so
// "next" can walk off the end of one tier straight into the start of the
// next one instead of stopping dead at each tier's own boundary.
export const selectFocusSequence = createSelector([selectTierItems], (tierItems) =>
  TIER_ORDER.flatMap((t) => (tierItems[t] || []).map((video) => ({ tier: t, video })))
);

// Looked up by videoId only (not tier) so a shuffle order stays valid even
// if a video's tier changes mid-playthrough via a tier-reassign shortcut.
export const selectVideoLookup = createSelector([selectFocusSequence], (sequence) => {
  const map = new Map();
  sequence.forEach((e) => map.set(e.video.videoId, e));
  return map;
});

export const selectActiveSequence = createSelector(
  [selectFocusQueue, selectFocusSequence, selectVideoLookup],
  (focusQueue, focusSequence, videoLookup) =>
    focusQueue ? focusQueue.map((id) => videoLookup.get(id)).filter(Boolean) : focusSequence
);

export const selectFocusedSeqIndex = createSelector(
  [selectFocusedVideo, selectActiveSequence],
  (focusedVideo, activeSequence) =>
    focusedVideo
      ? activeSequence.findIndex(
          (e) => e.tier === focusedVideo.tier && e.video.videoId === focusedVideo.videoId
        )
      : -1
);

export const selectFocusedVideoData = createSelector(
  [selectFocusedSeqIndex, selectActiveSequence],
  (index, activeSequence) => (index >= 0 ? activeSequence[index].video : null)
);

export const selectFocusedAvailableTiers = createSelector(
  [selectFocusedVideo, selectActiveView, selectTierGroups],
  (focusedVideo, activeView, tierGroups) =>
    focusedVideo ? TIER_ORDER.filter((t) => tierGroups[activeView.category]?.[t]) : []
);
