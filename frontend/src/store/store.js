import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import viewReducer from './viewSlice';
import itemsReducer from './itemsSlice';
import tiersReducer from './tiersSlice';
import focusReducer from './focusSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    view: viewReducer,
    items: itemsReducer,
    tiers: tiersReducer,
    focus: focusReducer,
  },
});
