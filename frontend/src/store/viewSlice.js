import { createSlice } from '@reduxjs/toolkit';

// activeView: { type: 'playlists' } | { type: 'items', playlist }
//           | { type: 'tierBoard', category } | { type: 'duel', category }
//           | { type: 'settings' }
const viewSlice = createSlice({
  name: 'view',
  initialState: {
    activeView: { type: 'playlists' },
    query: '',
    mobileSidebarOpen: false,
    paletteOpen: false,
  },
  reducers: {
    setActiveView: (state, action) => {
      state.activeView = action.payload;
    },
    setQuery: (state, action) => {
      state.query = action.payload;
    },
    setMobileSidebarOpen: (state, action) => {
      state.mobileSidebarOpen = action.payload;
    },
    setPaletteOpen: (state, action) => {
      state.paletteOpen = action.payload;
    },
    togglePalette: (state) => {
      state.paletteOpen = !state.paletteOpen;
    },
  },
});

export const { setActiveView, setQuery, setMobileSidebarOpen, setPaletteOpen, togglePalette } =
  viewSlice.actions;
export default viewSlice.reducer;
