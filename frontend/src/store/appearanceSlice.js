import { createSlice } from '@reduxjs/toolkit';
import { SETTINGS, getSetting } from '../settings';
import { resolveAppearance } from '../themes';

// The chosen theme / accent / tier palette (Settings -> Appearance). Client
// state like everything else in store/; persisted to localStorage by the
// store subscription in store.js, and turned into CSS variables + the
// Mantine theme by <AppearanceRoot> in main.jsx.
const appearanceSlice = createSlice({
  name: 'appearance',
  initialState: resolveAppearance(getSetting(SETTINGS.appearance, null)),
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
  },
});

export const { setTheme, setAccent, setTierPalette } = appearanceSlice.actions;
export default appearanceSlice.reducer;
