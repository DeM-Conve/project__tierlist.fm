import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';
import appearanceReducer from './appearanceSlice';
import { SETTINGS, setSetting } from '../settings';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    view: viewReducer,
    tiers: tiersReducer,
    focus: focusReducer,
    appearance: appearanceReducer,
  },
});

// Persist the appearance choice whenever it changes.
let lastAppearance = store.getState().appearance;
store.subscribe(() => {
  const next = store.getState().appearance;
  if (next !== lastAppearance) {
    lastAppearance = next;
    setSetting(SETTINGS.appearance, next);
  }
});
