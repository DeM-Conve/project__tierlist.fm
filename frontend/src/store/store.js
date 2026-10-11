import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';
import appearanceReducer from './appearanceSlice';
import namingReducer from './namingSlice';
import addSongsReducer from './addSongsSlice';
import transfersReducer from './transfersSlice';
import { SETTINGS, saveSidebarState, setSetting } from '../settings';
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
// The side panel's open/shut state and view are per-device layout, kept
// like VS Code's workbench state (settings.js DEVICE_UI); its width is saved by the
// panel group itself (App.jsx, useDefaultLayout).
let lastSidebar = { collapsed: store.getState().view.sidebarCollapsed, view: store.getState().view.sidebarView };
syncTierLabels(store.getState().naming);
store.subscribe(() => {
  const state = store.getState();
  syncTierLabels(state.naming);
  const { sidebarCollapsed: collapsed, sidebarView: view } = state.view;
  if (collapsed !== lastSidebar.collapsed || view !== lastSidebar.view) {
    lastSidebar = { collapsed, view };
    saveSidebarState(lastSidebar);
  }
  Object.entries(PERSISTED).forEach(([k, key]) => {
    if (state[k] !== last[k]) {
      last[k] = state[k];
      setSetting(key, state[k]);
    }
  });
});
