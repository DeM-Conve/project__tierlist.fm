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
  },
});

export const { setActiveView, setQuery, setMobileSidebarOpen } = viewSlice.actions;
export default viewSlice.reducer;
