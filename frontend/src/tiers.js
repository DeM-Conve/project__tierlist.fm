export const TIER_ORDER = ['T1', 'T2', 'T3', 'TE', 'TZ'];

export const TIER_COLORS = {
  T1: '#e8503a',
  T2: '#e8823a',
  T3: '#e8b93a',
  TE: '#b9c93a',
  TZ: '#4caf6e',
};

const TIER_SET = new Set(TIER_ORDER);

// "[GA] Rap Album T3" -> { bracket: "GA", category: "Rap Album", tier: "T3" }
// Returns null when the title doesn't end in a recognized tier token.
export function parseTierTitle(title) {
  const m = title.match(/^\[(\w+)\]\s*(.+)$/);
  if (!m) return null;

  const bracket = m[1];
  const words = m[2].trim().split(/\s+/);
  const last = words[words.length - 1];
  if (!TIER_SET.has(last)) return null;

  const category = words.slice(0, -1).join(' ');
  if (!category) return null;

  return { bracket, category, tier: last };
}

// playlists -> { [category]: { [tier]: playlist } }
export function groupByTier(playlists) {
  const groups = {};
  for (const playlist of playlists) {
    const parsed = parseTierTitle(playlist.title);
    if (!parsed) continue;
    groups[parsed.category] = groups[parsed.category] || {};
    groups[parsed.category][parsed.tier] = playlist;
  }
  return groups;
}
