// Small wrapper around localStorage for persisted, per-browser app
// preferences (not synced anywhere, not sent to the backend).
const PREFIX = 'ytTierApp:';

export const SETTINGS = {
  duelStrategy: `${PREFIX}duelStrategy`,
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
