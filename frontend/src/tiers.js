export const TIER_ORDER = ['T1', 'T2', 'T3', 'TE', 'TZ'];

// Tier colors are CSS variables so the Settings -> Appearance tier palette
// applies everywhere at once; the actual hex values live in themes.js.
export const TIER_COLORS = {
  T1: 'var(--tier-t1)',
  T2: 'var(--tier-t2)',
  T3: 'var(--tier-t3)',
  TE: 'var(--tier-te)',
  TZ: 'var(--tier-tz)',
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
