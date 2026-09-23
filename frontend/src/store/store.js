import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';
import appearanceReducer from './appearanceSlice';
import namingReducer from './namingSlice';
import prefsReducer from './prefsSlice';
import { SETTINGS, setSetting } from '../settings';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    view: viewReducer,
    tiers: tiersReducer,
    focus: focusReducer,
    appearance: appearanceReducer,
    naming: namingReducer,
    prefs: prefsReducer,
  },
});

// Cache user preferences held in Redux in localStorage whenever they change
// (the account's copy in Postgres is synced by api/useSettingsSync.js).
const PERSISTED = { appearance: SETTINGS.appearance, naming: SETTINGS.naming, prefs: SETTINGS.prefs };
const last = {};
Object.keys(PERSISTED).forEach((k) => (last[k] = store.getState()[k]));
store.subscribe(() => {
  const state = store.getState();
  Object.entries(PERSISTED).forEach(([k, key]) => {
    if (state[k] !== last[k]) {
      last[k] = state[k];
      setSetting(key, state[k]);
    }
  });
});
