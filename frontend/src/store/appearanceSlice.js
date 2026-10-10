import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { resolveAppearance } from '../themes';
import { completeActivityOrder } from '../activityOrder';
import { settingsLoaded } from './settingsActions';

// The chosen theme / accent / tier palette (Settings -> Appearance) and the
// activity bar's icon order. Client state like everything else in store/;
// persisted to localStorage by the store subscription in store.js, synced to
// the account by api/useSettingsSync.js, and turned into CSS variables + the
// Mantine theme by <AppearanceRoot> in main.jsx.
const resolve = (choice) => ({
  ...resolveAppearance(choice),
  activityOrder: completeActivityOrder(choice?.activityOrder),
});

const appearanceSlice = createSlice({
  name: 'appearance',
  initialState: resolve(getSetting(SETTINGS.appearance, null)),
  reducers: {
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    setAccent: (state, action) => {
      state.accent = action.payload;
    },
    setTierPalette: (state, action) => {
      state.tierPalette = action.payload;
    },
    // payload: the activity bar's item ids in their new order (see
    // activityOrder.js ACTIVITY_ITEMS); completed, so a partial list is fine.
    setActivityOrder: (state, action) => {
      state.activityOrder = completeActivityOrder(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(settingsLoaded, (state, action) =>
      action.payload.appearance ? resolve(action.payload.appearance) : state
    );
  },
});

export const selectActivityOrder = (state) => state.appearance.activityOrder;

export const { setTheme, setAccent, setTierPalette, setActivityOrder } = appearanceSlice.actions;
export default appearanceSlice.reducer;
