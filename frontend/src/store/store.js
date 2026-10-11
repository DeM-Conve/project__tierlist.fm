import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';
import appearanceReducer from './appearanceSlice';
import namingReducer from './namingSlice';
import addSongsReducer from './addSongsSlice';
import transfersReducer from './transfersSlice';
import { SETTINGS, cleanStorage, setSetting, writeDevicePref } from '../settings';
import { syncTierLabels } from '../tierLabels';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    view: viewReducer,
    tiers: tiersReducer,
    focus: focusReducer,
    appearance: appearanceReducer,
    naming: namingReducer,
    addSongs: addSongsReducer,
    transfers: transfersReducer,
  },
});

// Cache user preferences held in Redux in localStorage whenever they change
// (the account's copy in Postgres is synced by api/useSettingsSync.js).
const PERSISTED = { appearance: SETTINGS.appearance, naming: SETTINGS.naming };
const last = {};
Object.keys(PERSISTED).forEach((k) => (last[k] = store.getState()[k]));
// Per-device preferences held in Redux (settings.js DEVICE_UI): saved when
// they change; each slice reads its own back at boot (readDevicePref). The
// side panel's width is saved by the panel group itself (App.jsx).
const DEVICE_PREF_SOURCES = {
  sidebar: (s) => ({ collapsed: s.view.sidebarCollapsed, view: s.view.sidebarView }),
  repeatMode: (s) => s.focus.repeatMode,
  addSongsLastBoard: (s) => s.addSongs.lastBoard,
};
const lastDevice = {};
Object.entries(DEVICE_PREF_SOURCES).forEach(([name, select]) => (lastDevice[name] = JSON.stringify(select(store.getState()))));
// Drop what older builds left in this browser's storage (settings.js).
cleanStorage(Object.fromEntries(Object.entries(PERSISTED).map(([k, key]) => [key, store.getState()[k]])));
syncTierLabels(store.getState().naming);
store.subscribe(() => {
  const state = store.getState();
  syncTierLabels(state.naming);
  Object.entries(DEVICE_PREF_SOURCES).forEach(([name, select]) => {
    const value = select(state);
    const json = JSON.stringify(value);
    if (json !== lastDevice[name]) {
      lastDevice[name] = json;
      writeDevicePref(name, value);
    }
  });
  Object.entries(PERSISTED).forEach(([k, key]) => {
    if (state[k] !== last[k]) {
      last[k] = state[k];
      setSetting(key, state[k]);
    }
  });
});
