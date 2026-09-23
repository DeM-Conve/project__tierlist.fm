import { createSelector } from '@reduxjs/toolkit';
import { TIER_ORDER, groupByTier } from '../tiers';
import { parseTitle } from '../naming';

const selectPlaylists = (state) => state.auth.playlists;
const selectTierItems = (state) => state.tiers.tierItems;
const selectOriginalTierOf = (state) => state.tiers.originalTierOf;
const selectCurrentCategory = (state) => state.view.currentCategory;
const selectFocusedVideo = (state) => state.focus.focusedVideo;
const selectFocusQueue = (state) => state.focus.focusQueue;
const selectFocusEntries = (state) => state.focus.focusEntries;
const selectFocusedCategory = (state) => state.focus.focusedCategory;

const selectNamingTemplate = (state) => state.naming.template;
const selectMigratingFrom = (state) => state.naming.migratingFrom;

// The only playlists the app ever shows: those whose title follows the
// naming template (anything else - e.g. a private playlist - stays hidden
// everywhere). Each gets `.parsed` = { bracket, category, tier, template }.
export const selectTierPlaylists = createSelector(
  [selectPlaylists, selectNamingTemplate, selectMigratingFrom],
  (playlists, template, migratingFrom) => {
    if (!playlists) return null;
    const templates = migratingFrom ? [template, migratingFrom] : [template];
    return playlists.flatMap((p) => {
      const parsed = parseTitle(p.title, templates);
      return parsed ? [{ ...p, parsed }] : [];
    });
  }
);

export const selectTierGroups = createSelector([selectTierPlaylists], (tierPlaylists) =>
  tierPlaylists ? groupByTier(tierPlaylists) : {}
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
            moves.push({ kind: 'dedupe', video, tier, keptTier: keepTier });
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

// Looked up from the snapshot taken when the dock opened (`focusEntries`),
// not the live per-category `tierItems` - see the comment on
// `focusSlice.focusEntries` for why. `videoLookup` above is still used for
// the brief moment a queue is first constructed, while still on that
// board's own page.
const selectSnapshotLookup = createSelector([selectFocusEntries], (entries) => {
  const map = new Map();
  (entries || []).forEach((e) => map.set(e.video.videoId, e));
  return map;
});

export const selectActiveSequence = createSelector(
  [selectFocusQueue, selectSnapshotLookup],
  (focusQueue, snapshotLookup) =>
    focusQueue ? focusQueue.map((id) => snapshotLookup.get(id)).filter(Boolean) : []
);

// Matched by videoId only, not tier - `focusEntries` is a snapshot frozen
// when the dock opened, so its `.tier` for a given video stays whatever it
// was at that moment. Reassigning the focused video's tier (the dock's
// shift+digit shortcut) updates `focusedVideo.tier` but not the snapshot,
// so matching on tier too would never find it again and silently kill the
// dock the instant you reassigned a tier mid-playback.
export const selectFocusedSeqIndex = createSelector(
  [selectFocusedVideo, selectActiveSequence],
  (focusedVideo, activeSequence) =>
    focusedVideo
      ? activeSequence.findIndex((e) => e.video.videoId === focusedVideo.videoId)
      : -1
);

export const selectFocusedVideoData = createSelector(
  [selectFocusedSeqIndex, selectActiveSequence],
  (index, activeSequence) => (index >= 0 ? activeSequence[index].video : null)
);

// Tier reassignment only makes sense - and only actually works - while
// you're viewing the same board the playing video was opened from: the
// pills/shift+digit shortcut write into `tiersSlice.tierItems`, which only
// ever holds the currently loaded category. If you've since navigated to a
// different tier board while the video keeps playing in the background,
// hide the controls entirely rather than let them silently no-op.
export const selectFocusedAvailableTiers = createSelector(
  [selectFocusedVideo, selectFocusedCategory, selectCurrentCategory, selectTierGroups],
  (focusedVideo, focusedCategory, currentCategory, tierGroups) =>
    focusedVideo && focusedCategory && focusedCategory === currentCategory
      ? TIER_ORDER.filter((t) => tierGroups[focusedCategory]?.[t])
      : []
);

// The dock's current video, but only while this board is the one it was
// opened from - lets the board mark the playing tile without the marker
// leaking onto a different board that happens to share a video.
export const selectPlayingVideoIdOnBoard = createSelector(
  [selectFocusedVideo, selectFocusedCategory, selectCurrentCategory],
  (focusedVideo, focusedCategory, currentCategory) =>
    focusedVideo && focusedCategory === currentCategory ? focusedVideo.videoId : null
);
