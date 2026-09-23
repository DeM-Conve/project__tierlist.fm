// The ranked tiers, best first. Duels, duplicate resolution ("keep the
// highest tier") and "Add missing tiers" work on these only.
export const TIER_ORDER = ['T1', 'T2', 'T3', 'TE', 'TZ'];

// A board's optional to-do list ("Rap TODO"): songs saved for later that
// haven't been given a tier yet. It loads, plays and moves like any tier,
// but it's never ranked - it sits after TZ so a song that's both rated and
// still in TODO keeps its rating (the TODO copy is the duplicate).
export const TODO_TIER = 'TODO';

// Everything a board can hold, in display/playback order.
export const BOARD_TIERS = [...TIER_ORDER, TODO_TIER];

// Not a playlist: the board's "Remove" bin. Dropping a song here stages it
// for deletion from the playlist it came from (a pending change like any
// move, so Undo / Discard / put-back all work); Push deletes it on YouTube.
// It lives in tierItems next to the tiers but is never in BOARD_TIERS, so
// it's never played, ranked, counted or searched.
export const REMOVED_TIER = 'REMOVED';

// Tier colors are CSS variables so the Settings -> Appearance tier palette
// applies everywhere at once; the actual hex values live in themes.js.
export const TIER_COLORS = {
  T1: 'var(--tier-t1)',
  T2: 'var(--tier-t2)',
  T3: 'var(--tier-t3)',
  TE: 'var(--tier-te)',
  TZ: 'var(--tier-tz)',
  TODO: 'var(--tier-todo)',
};

// Title parsing lives in naming.js (it follows the user's naming template).
// tierPlaylists (each with `.parsed`) -> { [category]: { [tier]: playlist } }
export function groupByTier(tierPlaylists) {
  const groups = {};
  for (const playlist of tierPlaylists) {
    const { parsed } = playlist;
    groups[parsed.category] = groups[parsed.category] || {};
    groups[parsed.category][parsed.tier] = playlist;
  }
  return groups;
}
