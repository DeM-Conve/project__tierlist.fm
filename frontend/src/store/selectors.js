import { createSelector } from '@reduxjs/toolkit';
import { BOARD_TIERS, REMOVED_TIER, TIER_ORDER, groupByTier } from '../tiers';
import { parseTitle } from '../naming';
import { boardsOf, resolveTodoLists } from '../todoLists';
import { effectiveTransfers } from '../transfers';
import { TODO_TIER } from '../tiers';

const selectPlaylists = (state) => state.auth.playlists;
const selectTierItems = (state) => state.tiers.tierItems;
const selectOriginalTierOf = (state) => state.tiers.originalTierOf;
const selectOriginalTierItems = (state) => state.tiers.originalTierItems;
const selectDuplicateCopies = (state) => state.tiers.duplicateCopies;
const selectCurrentCategory = (state) => state.view.currentCategory;
const selectFocusedVideo = (state) => state.focus.focusedVideo;
const selectFocusedCategory = (state) => state.focus.focusedCategory;
const selectLoadedCategory = (state) => state.tiers.loadedCategory;

const selectTodoLinks = (state) => state.naming.todoLinks;

// The naming in use ({ template, tierLabels }), then the one a half-finished
// rename is migrating away from - titles matching either are recognised.
export const selectNamings = createSelector(
  [
    (s) => s.naming.template,
    (s) => s.naming.tierLabels,
    (s) => s.naming.migratingFrom,
    (s) => s.naming.migratingFromTierLabels,
  ],
  (template, tierLabels, fromTemplate, fromLabels) => [
    { template, tierLabels },
    ...(fromTemplate ? [{ template: fromTemplate, tierLabels: fromLabels ?? tierLabels }] : []),
  ]
);
export const selectNaming = (state) => selectNamings(state)[0];
const selectDisplayNames = (state) => state.naming.tierDisplayNames;
// The naming as edited in Settings: + what the app shows for each tier.
export const selectNamingSettings = createSelector([selectNaming, selectDisplayNames], (naming, tierDisplayNames) => ({
  ...naming,
  tierDisplayNames,
}));

// The only playlists the app ever shows: those whose title follows the
// naming (anything else - e.g. a private playlist - stays hidden
// everywhere). Each gets `.parsed` = { fields, category, tier, naming }.
export const selectRankedPlaylists = createSelector(
  [selectPlaylists, selectNamings],
  (playlists, namings) => {
    if (!playlists) return null;
    return playlists.flatMap((p) => {
      const parsed = parseTitle(p.title, namings);
      // To-do lists are merged in below (selectTodoRows: one per board).
      return parsed && parsed.tier !== TODO_TIER ? [{ ...p, parsed }] : [];
    });
  }
);

// Every to-do list candidate (named by the template with the to-do name, or
// linked by hand)
// and where it landed - see todoLists.js. Settings -> To-do lists lists these.
export const selectTodoRows = createSelector(
  [selectPlaylists, selectRankedPlaylists, selectTodoLinks, selectNamings],
  (playlists, ranked, links, namings) => {
    if (!playlists || !ranked) return [];
    const rankedIds = new Set(ranked.map((p) => p.id));
    return resolveTodoLists(playlists.filter((p) => !rankedIds.has(p.id)), { links, boards: boardsOf(ranked), namings });
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
      .map((r) => ({ ...r.playlist, parsed: { fields: r.fields, category: r.category, tier: TODO_TIER, via: r.via } }));
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
// ordinary reverse move). A video listed twice in the *same* playlist is
// shown once; its extra copies are dedupes kept in that same tier.
export const selectPendingMoves = createSelector(
  [selectTierItems, selectOriginalTierOf, selectDuplicateCopies, selectOriginalTierItems],
  (tierItems, originalTierOf, duplicateCopies, originalTierItems) => {
    const moves = [];
    // The tier whose playlist this card's item is in (by playlist item id).
    // (Any tier's: originalTierOf can forget a copy - a push's move resets it.)
    const homeOf = (video) =>
      video.id == null ? undefined : BOARD_TIERS.find((t) => (originalTierItems?.[t] || []).some((v) => v.id === video.id));
    const multiDone = new Set();
    const stillIn = (t, videoId) => (tierItems[t] || []).some((v) => v.videoId === videoId);
    // Songs sent here from another board (staged transfers): the tier each
    // was dropped on. A board that already had the song keeps it there - its
    // own copy goes, like any copy the user dragged a song away from.
    const arrived = new Map();
    for (const tier of BOARD_TIERS) {
      for (const v of tierItems[tier] || []) if (v.transfer && !arrived.has(v.videoId)) arrived.set(v.videoId, tier);
    }
    // A hidden copy (the same playlist listing it twice, or the old copy a
    // half-done push left behind) is kept wherever the board has the song.
    for (const tier of BOARD_TIERS) {
      for (const video of duplicateCopies?.[tier] || []) {
        const keptTier = stillIn(tier, video.videoId) ? tier : BOARD_TIERS.find((t) => stillIn(t, video.videoId)) ?? tier;
        moves.push({ kind: 'dedupe', video, tier, keptTier });
      }
    }
    for (const tier of BOARD_TIERS) {
      for (const video of tierItems[tier] || []) {
        // A song from another board is a transfer (selectStagedChanges).
        if (video.transfer) continue;
        const originalTiers = originalTierOf[video.videoId];
        if (!originalTiers) continue;
        if (arrived.has(video.videoId)) {
          moves.push({ kind: 'dedupe', video, tier, keptTier: arrived.get(video.videoId) });
          continue;
        }

        if (originalTiers.length > 1) {
          // A song on YouTube in several of this board's tiers: the copy the
          // board shows highest is kept - where the user sees it, even if
          // they dragged it there (then it's a move from its own playlist) -
          // and every other copy is removed. Keying this on the original
          // tiers instead dropped a drag: the S copy dragged to D, with a
          // second copy in TODO, ended up only in TODO.
          if (multiDone.has(video.videoId)) continue;
          multiDone.add(video.videoId);
          const copies = BOARD_TIERS.flatMap((t) =>
            (tierItems[t] || []).filter((v) => v.videoId === video.videoId && !v.transfer).map((v) => ({ v, t }))
          );
          const home = (c) => homeOf(c.v) ?? (originalTiers.includes(c.t) ? c.t : originalTiers[0]);
          const top = copies[0].t;
          const kept = copies.find((c) => c.t === top && home(c) === top) ?? copies[0];
          if (home(kept) !== kept.t) moves.push({ kind: 'move', video: kept.v, from: home(kept), to: kept.t });
          for (const c of copies) {
            if (c !== kept) moves.push({ kind: 'dedupe', video: c.v, tier: c.t, keptTier: kept.t });
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
      const from = homeOf(video) ?? originalTiers.find((t) => !stillIn(t, video.videoId)) ?? originalTiers[0];
      moves.push({ kind: 'remove', video, from, to: REMOVED_TIER });
    }
    return moves;
  }
);

// Has the user changed the loaded board since it loaded - an edit (drag,
// move, duel result, an arrived transfer: all undo steps), a staged move or
// a sync in flight? Auto-staged duplicate removals don't count: they're
// derived from the data, so fresh data re-derives them.
export const selectHasLocalEdits = createSelector(
  [(s) => s.tiers.undoStack, (s) => s.tiers.syncStatus, selectPendingMoves],
  (undoStack, syncStatus, moves) =>
    undoStack.length > 0 || syncStatus === 'syncing' || moves.some((m) => m.kind !== 'dedupe')
);

// The same, for a board kept in draftsSlice (not open): its staged changes
// (cached per kept board object - they're immutable).
const keptMoves = new WeakMap();
export function pendingMovesOfBoard(board) {
  if (!board) return [];
  let moves = keptMoves.get(board);
  if (!moves) {
    moves = selectPendingMoves.resultFunc(board.tierItems || {}, board.originalTierOf || {}, board.duplicateCopies || {}, board.originalTierItems || {});
    keptMoves.set(board, moves);
  }
  return moves;
}

// Is a kept board worth keeping as a draft: an undo step or a change the
// user made (auto-staged duplicate removals come back with the data).
export const boardHasEdits = (board) =>
  !!board && ((board.undoStack || []).length > 0 || pendingMovesOfBoard(board).some((m) => m.kind !== 'dedupe'));

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

// The playing song as { tier, videoId }, its tier read from its board while
// that board is the loaded one - the queue entry's tier is a snapshot from
// when it was queued, and a song dragged since (or put back by Discard /
// undo, or a fresh copy of the board) is somewhere else now. Reading the
// snapshot, the player and the rail showed the old tier and rating it did
// nothing (a move "from" a tier the song wasn't in). Off its board the
// snapshot is all there is. A song that's no longer on its loaded board
// (removed and pushed, dragged to another board) has no tier (null): there's
// nothing there to rate.
const LIVE_TIERS = [...BOARD_TIERS, REMOVED_TIER];
// A board kept with its unpushed changes (draftsSlice) is read the same way.
const selectFocusedKeptItems = (s) => s.drafts?.boards?.[s.focus.focusedCategory]?.tierItems;
export const selectPlayingSong = createSelector(
  [selectFocusedVideo, selectFocusedCategory, selectLoadedCategory, selectTierItems, selectFocusedKeptItems],
  (focusedVideo, focusedCategory, loadedCategory, openItems, keptItems) => {
    const tierItems = focusedCategory === loadedCategory ? openItems : keptItems;
    if (!focusedVideo || !tierItems) return focusedVideo;
    const tier = LIVE_TIERS.find((t) => (tierItems[t] || []).some((v) => v.videoId === focusedVideo.videoId)) ?? null;
    return tier === focusedVideo.tier ? focusedVideo : { ...focusedVideo, tier };
  }
);

// Rating targets are the ranked tiers only (Shift+1-5 stay S..D); a song
// goes back to TODO via the Tier Rail, a menu or a drag.
// Rating works while the playing song's board is in reach: the open board,
// or one kept with its draft after another board opened (draftsSlice) - the
// change is staged on that board either way (moveWithFeedback's category).
// Not for a song that has left its board (selectPlayingSong's tier is null).
export const selectFocusedAvailableTiers = createSelector(
  [selectPlayingSong, selectFocusedCategory, selectLoadedCategory, (s) => !!s.drafts?.boards?.[s.focus.focusedCategory], selectTierGroups],
  (playing, focusedCategory, loadedCategory, kept, tierGroups) =>
    playing?.tier && focusedCategory && (focusedCategory === loadedCategory || kept)
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

// Songs staged to move to another board, each aimed where it really goes
// right now (see transfers.js effectiveTransfers).
const selectTransferList = (state) => state.transfers.list;
export const selectTransfers = createSelector(
  [selectTransferList, selectLoadedCategory, selectTierItems],
  (list, loadedCategory, tierItems) => effectiveTransfers(list, loadedCategory, tierItems)
);

// Everything a Push would send: the open board's moves / removals /
// duplicates, then the transfers (as { kind: 'transfer', ...transfer }).
export const selectStagedChanges = createSelector([selectPendingMoves, selectTransfers], (moves, transfers) => [
  ...moves,
  ...transfers.map((t) => ({ kind: 'transfer', ...t })),
]);

// The board as the duel API wants it - tier -> video ids, in board order,
// staged edits included - plus a short key that changes when it does (for
// query keys; the full id list would be a huge key).
// The to-do list goes too: the backend needs it to leave those songs out -
// to-do songs are never part of duels (old duels with them are dropped).
export const selectDuelLayout = createSelector([selectTierItems], (tierItems) => {
  const tiers = {};
  let hash = 0;
  for (const t of BOARD_TIERS) {
    if (!tierItems[t]) continue;
    tiers[t] = tierItems[t].map((v) => v.videoId);
    for (const ch of `${t}:${tiers[t].join(',')};`) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return { layout: { tiers }, key: (hash >>> 0).toString(36) };
});

const selectKeptBoards = (state) => state.drafts?.boards ?? EMPTY;
const EMPTY = {};

// Every board's staged changes - the open board first, then each board kept
// with unpushed changes (draftsSlice) - as [{ category, open, changes,
// dedupes }]: `changes` are the user's own (moves, removals, songs moved to
// another board - listed under the board they leave), `dedupes` the
// auto-staged duplicate removals, kept apart so a board with only those
// never looks like the user staged something. Both push with Push.
export const selectBoardsChanges = createSelector(
  [selectPendingMoves, selectLoadedCategory, selectKeptBoards, selectTransfers],
  (openMoves, loadedCategory, kept, transfers) => {
    const groups = new Map();
    const group = (category) => {
      if (!groups.has(category)) groups.set(category, { category, open: category === loadedCategory, changes: [], dedupes: [] });
      return groups.get(category);
    };
    const add = (category, moves) => {
      for (const m of moves) {
        if (m.kind === 'dedupe') group(category).dedupes.push(m);
        else group(category).changes.push(m);
      }
    };
    if (loadedCategory) add(loadedCategory, openMoves);
    for (const [category, board] of Object.entries(kept)) {
      if (category !== loadedCategory) add(category, pendingMovesOfBoard(board));
    }
    for (const t of transfers) group(t.fromCategory).changes.push({ kind: 'transfer', ...t });
    return [...groups.values()].filter((g) => g.changes.length || g.dedupes.length);
  }
);

// Everything Push (all boards) would send, flat.
export const selectAllStagedChanges = createSelector([selectBoardsChanges], (groups) =>
  groups.flatMap((g) => [...g.changes, ...g.dedupes])
);

// Staged changes whose last push failed, each with `failure` = { step,
// error } (see tiersSlice.syncFailures) - on every board. A change that was
// pushed since, put back or discarded drops out on its own.
export const selectStagedFailures = createSelector(
  [selectAllStagedChanges, (s) => s.tiers.syncFailures],
  (changes, failures) =>
    changes.flatMap((c) => (failures?.[c.video.id] ? [{ ...c, failure: failures[c.video.id] }] : []))
);

// The boards as counted on screen away from the board itself (side panel,
// Home cards): YouTube's numbers - except for a board with unpushed changes,
// which shows what its draft shows (what the user sees on the board and the
// rail), each of its playlists marked `unpushed` (the user's call: a small
// "unpushed" dot, never two different numbers for one board on screen).
const selectOpenBoardKept = createSelector(
  [(s) => s.tiers.tierItems, (s) => s.tiers.originalTierOf, (s) => s.tiers.duplicateCopies, (s) => s.tiers.originalTierItems],
  (tierItems, originalTierOf, duplicateCopies, originalTierItems) => ({ tierItems, originalTierOf, duplicateCopies, originalTierItems })
);
export const selectShownTierGroups = createSelector(
  [selectTierGroups, selectLoadedCategory, selectOpenBoardKept, selectKeptBoards, selectTransferList],
  (groups, loadedCategory, openBoard, kept, transfers) => {
    const boards = { ...kept };
    if (loadedCategory) boards[loadedCategory] = openBoard;
    const moved = new Set(transfers.flatMap((t) => [t.fromCategory, t.toCategory]));
    let out = groups;
    for (const [category, board] of Object.entries(boards)) {
      const changed = pendingMovesOfBoard(board).some((m) => m.kind !== 'dedupe');
      if (!groups[category] || !(changed || moved.has(category))) continue;
      const tiers = {};
      for (const [tier, playlist] of Object.entries(groups[category])) {
        tiers[tier] = { ...playlist, itemCount: board.tierItems?.[tier]?.length ?? playlist.itemCount, unpushed: true };
      }
      if (out === groups) out = { ...groups };
      out[category] = tiers;
    }
    return out;
  }
);
