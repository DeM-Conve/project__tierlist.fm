import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';
import appearanceReducer from './appearanceSlice';
import namingReducer from './namingSlice';
import { SETTINGS, setSetting } from '../settings';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    view: viewReducer,
    tiers: tiersReducer,
    focus: focusReducer,
    appearance: appearanceReducer,
    naming: namingReducer,
  },
});

// Persist user preferences held in Redux whenever they change.
const PERSISTED = { appearance: SETTINGS.appearance, naming: SETTINGS.naming };
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
