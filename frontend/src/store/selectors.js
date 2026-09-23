import { createSelector } from '@reduxjs/toolkit';
import { BOARD_TIERS, REMOVED_TIER, TIER_ORDER, groupByTier } from '../tiers';
import { parseTitle } from '../naming';
import { boardsOf, resolveTodoLists } from '../todoLists';
import { TODO_TIER } from '../tiers';

const selectPlaylists = (state) => state.auth.playlists;
const selectTierItems = (state) => state.tiers.tierItems;
const selectOriginalTierOf = (state) => state.tiers.originalTierOf;
const selectCurrentCategory = (state) => state.view.currentCategory;
const selectFocusedVideo = (state) => state.focus.focusedVideo;
const selectFocusedCategory = (state) => state.focus.focusedCategory;
const selectLoadedCategory = (state) => state.tiers.loadedCategory;

const selectNamingTemplate = (state) => state.naming.template;
const selectMigratingFrom = (state) => state.naming.migratingFrom;
const selectTodoKeyword = (state) => state.naming.todoKeyword;
const selectTodoLinks = (state) => state.naming.todoLinks;

// The only playlists the app ever shows: those whose title follows the
// naming template (anything else - e.g. a private playlist - stays hidden
// everywhere). Each gets `.parsed` = { bracket, category, tier, template }.
const selectRankedPlaylists = createSelector(
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

// Every to-do list candidate (keyword in the name, or linked by hand) and
// where it landed - see todoLists.js. Settings -> To-do lists lists these.
export const selectTodoRows = createSelector(
  [selectPlaylists, selectRankedPlaylists, selectTodoKeyword, selectTodoLinks],
  (playlists, ranked, keyword, links) => {
    if (!playlists || !ranked) return [];
    const rankedIds = new Set(ranked.map((p) => p.id));
    return resolveTodoLists(
      playlists.filter((p) => !rankedIds.has(p.id)),
      { keyword, links, boards: boardsOf(ranked) }
    );
  }
);

// Ranked tier playlists plus each board's to-do list (parsed.tier = TODO,
// parsed.via = 'link' | 'name'), so boards pick it up like any tier.
export const selectTierPlaylists = createSelector(
  [selectRankedPlaylists, selectTodoRows],
  (ranked, todoRows) => {
    if (!ranked) return null;
    const todo = todoRows
      .filter((r) => r.status === 'active')
      .map((r) => ({ ...r.playlist, parsed: { bracket: null, category: r.category, tier: TODO_TIER, via: r.via } }));
    return [...ranked, ...todo];
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
// bogus "move" is reported for either. Songs dropped in the Remove bin are
// `remove` changes (`to` is REMOVED_TIER, so putting one back is an
// ordinary reverse move).
export const selectPendingMoves = createSelector(
  [selectTierItems, selectOriginalTierOf],
  (tierItems, originalTierOf) => {
    const moves = [];
    const stillIn = (t, videoId) => (tierItems[t] || []).some((v) => v.videoId === videoId);
    for (const tier of BOARD_TIERS) {
      for (const video of tierItems[tier] || []) {
        const originalTiers = originalTierOf[video.videoId];
        if (!originalTiers) continue;

        if (originalTiers.length > 1) {
          // Keep the highest copy that's still on the board - if the user
          // removed the top copy by hand, the next one down survives.
          const keepTier = BOARD_TIERS.find((t) => originalTiers.includes(t) && stillIn(t, video.videoId));
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
    for (const video of tierItems[REMOVED_TIER] || []) {
      const originalTiers = originalTierOf[video.videoId];
      if (!originalTiers) continue;
      // The copy that's no longer on the board is the one being removed.
      const from = originalTiers.find((t) => !stillIn(t, video.videoId)) ?? originalTiers[0];
      moves.push({ kind: 'remove', video, from, to: REMOVED_TIER });
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
// next one instead of stopping dead at each tier's own boundary. TODO comes
// last. (Duels above stay on TIER_ORDER: a to-do list isn't ranked.)
export const selectFocusSequence = createSelector([selectTierItems], (tierItems) =>
  BOARD_TIERS.flatMap((t) => (tierItems[t] || []).map((video) => ({ tier: t, video })))
);

// Looked up by videoId only (not tier) so a shuffle order stays valid even
// if a video's tier changes mid-playthrough via a tier-reassign shortcut.
export const selectVideoLookup = createSelector([selectFocusSequence], (sequence) => {
  const map = new Map();
  sequence.forEach((e) => map.set(e.video.videoId, e));
  return map;
});

// The playing song's { video } comes from the queue's own snapshot
// (`focusSlice.current`), not the live per-board `tierItems` - so the dock
// keeps playing while you browse other boards.
export const selectFocusedVideoData = (state) => state.focus.current?.video ?? null;

// Rating targets are the ranked tiers only (Shift+1-5 stay T1..TZ); a song
// goes back to TODO via the Tier Rail, a menu or a drag.
// Tier reassignment only works while the playing video's board is the one
// loaded in `tiersSlice.tierItems` (the pills/shift+digit shortcut write
// there). That stays true on Home / Settings / playlist pages after leaving
// the board - only opening a *different* board replaces it, and then the
// controls hide rather than silently no-op.
export const selectFocusedAvailableTiers = createSelector(
  [selectFocusedVideo, selectFocusedCategory, selectLoadedCategory, selectTierGroups],
  (focusedVideo, focusedCategory, loadedCategory, tierGroups) =>
    focusedVideo && focusedCategory && focusedCategory === loadedCategory
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

// True while the player dock is open full-screen. It covers the page like a
// modal, so page-level shortcuts ("/" search, n/N, duel arrows, Add songs keys)
// check this and stand down until it's minimized - only the player's own
// keys act while it's up.
export const selectPlayerCoversPage = (state) =>
  !!state.focus.focusedVideo && state.focus.playerMode === 'expanded';
