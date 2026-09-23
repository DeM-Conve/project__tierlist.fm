// Small wrapper around localStorage: the per-browser *cache* of the user's
// settings, so the right theme etc. applies before the first paint. The
// source of truth is the backend (Postgres, per Google account) - see
// api/useSettingsSync.js, which overwrites these once the account's copy loads.
const PREFIX = 'ytTierApp:';

export const SETTINGS = {
  // legacy: the duel strategy on its own (now inside `prefs`)
  duelStrategy: `${PREFIX}duelStrategy`,
  // { duelStrategy } - see prefsSlice
  prefs: `${PREFIX}prefs`,
  // { theme, accent, tierPalette } - see themes.js
  appearance: `${PREFIX}appearance`,
  // { template, migratingFrom, todoKeyword, todoLinks } - see naming.js / namingSlice
  naming: `${PREFIX}naming`,
};

export function getSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode edge cases, quota, etc.) -
    // setting just won't persist across reloads, not worth surfacing an error.
  }
}
