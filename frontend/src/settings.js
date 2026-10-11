// Small wrapper around localStorage: the one place for UI state kept in this
// browser. Two kinds of entry, one key family (`ytTierApp:`):
// - SETTINGS: a per-browser *cache* of the account's settings, so the right
//   theme etc. applies before the first paint. The source of truth is the
//   backend (Postgres, per Google account) - see api/useSettingsSync.js,
//   which overwrites these once the account's copy loads.
// - DEVICE_UI: workbench layout that belongs to this device only, like VS
//   Code's: whether the side panel is shut and which view it shows (the
//   viewSlice reads it at boot, store.js saves it). The panel's *width* is
//   saved by react-resizable-panels' own useDefaultLayout (App.jsx), also in
//   localStorage, through `layoutStorage` below. Synchronous on purpose: the
//   shell mounts in the saved state, with no flash of an open panel.
// Every read and write is guarded: with storage unavailable the app just
// starts from the defaults.
const PREFIX = 'ytTierApp:';

export const DEVICE_UI = {
  // { collapsed, view } - see loadSidebarState
  sidebar: `${PREFIX}ui:sidebar`,
};

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

export const SIDEBAR_VIEWS = ['boards', 'playlists'];
export const DEFAULT_SIDEBAR_STATE = { collapsed: false, view: 'boards' };

export function loadSidebarState() {
  const saved = getSetting(DEVICE_UI.sidebar, null);
  return {
    collapsed: typeof saved?.collapsed === 'boolean' ? saved.collapsed : DEFAULT_SIDEBAR_STATE.collapsed,
    view: SIDEBAR_VIEWS.includes(saved?.view) ? saved.view : DEFAULT_SIDEBAR_STATE.view,
  };
}

export function saveSidebarState({ collapsed, view }) {
  setSetting(DEVICE_UI.sidebar, { collapsed, view });
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
