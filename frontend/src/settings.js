// Small wrapper around localStorage: the one place for UI state kept in this
// browser. Two kinds of entry, one key family (`ytTierApp:`):
// - SETTINGS: a per-browser *cache* of the account's settings (theme,
//   accent, tier palette, naming, activity order), so the right look applies
//   before the first paint. The source of truth is the backend (Postgres, per
//   Google account) - see api/useSettingsSync.js, which overwrites these once
//   the account's copy loads. Never duplicate one of these in DEVICE_UI.
// - DEVICE_UI: preferences that belong to this device only, like VS Code's
//   workbench state - the side panel's shut state and view, the player's
//   volume and repeat, the duel session length, Add songs' last board. Each
//   is declared once below ({ key, fallback, parse }) and read through
//   readDevicePref / useDevicePref, so bad or missing data always means the
//   default. The side panel's *width* is saved by react-resizable-panels' own
//   useDefaultLayout (App.jsx), also in localStorage, through `layoutStorage`.
// Synchronous on purpose: the app mounts in the saved state (no flash of an
// open panel). Every read and write is guarded: with storage unavailable the
// app just starts from the defaults.
//
// Adding a device pref: one DEVICE_UI entry (a `parse` that returns the
// value, or undefined for anything invalid), then either useDevicePref(name)
// in the component, or - for Redux state - readDevicePref(name) in the
// slice's initial state plus one DEVICE_PREF_SOURCES line in store/store.js.
import { useLocalStorage } from '@mantine/hooks';

const PREFIX = 'ytTierApp:';

export const SETTINGS = {
  // { theme, accent, tierPalette } - see themes.js
  appearance: `${PREFIX}appearance`,
  // { template, tierLabels, migratingFrom, migratingFromTierLabels, todoLinks } - see naming.js / namingSlice
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

// --- Device-only UI state (DEVICE_UI) ---

const oneOf = (values) => (v) => (values.includes(v) ? v : undefined);

export const SIDEBAR_VIEWS = ['boards', 'playlists'];

export const DEVICE_UI = {
  // The side panel (App.jsx Layout, viewSlice): shut or open, and its view.
  // Field by field, so one bad field doesn't reset the other.
  sidebar: {
    key: `${PREFIX}ui:sidebar`,
    fallback: { collapsed: false, view: 'boards' },
    parse: (v) => v && typeof v === 'object'
      ? { collapsed: typeof v.collapsed === 'boolean' ? v.collapsed : false, view: SIDEBAR_VIEWS.includes(v.view) ? v.view : 'boards' }
      : undefined,
  },
  // The player's repeat button (focusSlice): off -> all -> one.
  repeatMode: { key: `${PREFIX}ui:repeat`, fallback: 'off', parse: oneOf(['off', 'all', 'one']) },
  // The player's volume (PlayerDock): 0-100, and whether it's muted (the
  // volume is then the level to come back to).
  playerVolume: {
    key: `${PREFIX}ui:volume`,
    fallback: { volume: 100, muted: false },
    parse: (v) => (v && Number.isInteger(v.volume) && v.volume >= 0 && v.volume <= 100 && typeof v.muted === 'boolean'
      ? { volume: v.volume, muted: v.muted } : undefined),
  },
  // The duel hub's session length (DuelHub LENGTHS values - keep in step).
  duelMinutes: { key: `${PREFIX}ui:duelMinutes`, fallback: '5', parse: oneOf(['2', '5', '15']) },
  // The board Add songs filed the last song into - its fallback guess for
  // the next one (useAddSongs ignores it if that board is gone).
  addSongsLastBoard: {
    key: `${PREFIX}ui:addSongsLastBoard`,
    fallback: null,
    parse: (v) => (v === null || (typeof v === 'string' && v.length > 0) ? v : undefined),
  },
};

function parsePref(name, value) {
  const pref = DEVICE_UI[name];
  if (value === undefined) return pref.fallback;
  try {
    const parsed = pref.parse(value);
    return parsed === undefined ? pref.fallback : parsed;
  } catch {
    return pref.fallback;
  }
}

// This device's saved value, or the default for missing / invalid data.
export function readDevicePref(name) {
  return parsePref(name, getSetting(DEVICE_UI[name].key, undefined));
}

export function writeDevicePref(name, value) {
  setSetting(DEVICE_UI[name].key, value);
}

// A device pref as component state: [value, setValue]. Mantine's
// useLocalStorage (guarded, synced across tabs), read synchronously on the
// first render, every value read run through the pref's `parse`.
export function useDevicePref(name) {
  const pref = DEVICE_UI[name];
  return useLocalStorage({
    key: pref.key,
    defaultValue: pref.fallback,
    getInitialValueInEffect: false,
    deserialize: (raw) => {
      if (raw === undefined || raw === null) return pref.fallback;
      try {
        return parsePref(name, JSON.parse(raw));
      } catch {
        return pref.fallback;
      }
    },
  });
}

// --- Self-cleaning ---

// Keys older builds wrote that nothing reads any more, removed on boot:
// the old frontend duel strategy (its own key, then the `prefs` group),
// both retired with the frontend duel algorithms (da0593d).
export const RETIRED_KEYS = [`${PREFIX}duelStrategy`, `${PREFIX}prefs`];

// Run once on boot (store.js): removes RETIRED_KEYS, and rewrites every
// entry that is stored with only what the current schema reads - `current`
// maps each SETTINGS key to its value as the store parsed it (so unknown
// fields an older build left, like a stray `duelStrategy`, are dropped);
// device prefs are re-parsed here. Nothing absent is created.
export function cleanStorage(current) {
  const known = { ...current };
  for (const [name, pref] of Object.entries(DEVICE_UI)) known[pref.key] = readDevicePref(name);
  try {
    RETIRED_KEYS.forEach((key) => localStorage.removeItem(key));
    for (const [key, value] of Object.entries(known)) {
      if (localStorage.getItem(key) !== null) localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage unavailable: nothing to clean.
  }
}

// A LayoutStorage for react-resizable-panels' useDefaultLayout. The library
// reads storage during render and JSON.parses what it gets unguarded, so a
// throwing storage or a corrupt entry would crash the shell - this hands it
// null instead.
export const layoutStorage = {
  getItem(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) JSON.parse(raw);
      return raw;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable / full: the width just won't survive a reload.
    }
  },
};

// The side panel's id in the shell's react-resizable-panels Group.
export const SIDEBAR_PANEL_ID = 'sidebar-panel';

// The layout the panel group mounts with. useDefaultLayout only ever saves
// an *open* layout (see shouldSaveLayout), so the panel's last width
// survives it being shut; the shut state itself comes from Redux, and the
// group mounts already collapsed when it was shut - no flash of an open
// panel on load. No saved open layout -> undefined (the Panel's defaultSize).
export function restoreSidebarLayout(saved, collapsed) {
  const open = saved && saved[SIDEBAR_PANEL_ID] > 0 ? saved : undefined;
  if (!collapsed) return open;
  const ids = open ? Object.keys(open) : [SIDEBAR_PANEL_ID, 'page'];
  const others = ids.filter((id) => id !== SIDEBAR_PANEL_ID);
  return Object.fromEntries(ids.map((id) => [id, id === SIDEBAR_PANEL_ID ? 0 : 100 / others.length]));
}

// Save a layout only while the side panel is open (or not in it at all):
// the width to come back to is the last open one, as in VS Code.
export function shouldSaveLayout(layout) {
  return !(SIDEBAR_PANEL_ID in layout) || layout[SIDEBAR_PANEL_ID] > 0;
}
