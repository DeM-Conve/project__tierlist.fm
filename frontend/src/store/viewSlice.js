import { createSlice } from '@reduxjs/toolkit';

// "What page" is now owned by React Router (the URL), not this slice.
// currentCategory is the one piece of routing context still needed outside
// the routed page component itself - PlayerDock's tier-reassignment needs to
// know which board's tiers are selectable regardless of which page rendered
// it (tier board or duel), and it lives at the layout level, above <Outlet/>.
const viewSlice = createSlice({
  name: 'view',
  initialState: {
    currentCategory: null,
    query: '',
    mobileSidebarOpen: false,
  },
  reducers: {
    setCurrentCategory: (state, action) => {
      state.currentCategory = action.payload;
    },
    setQuery: (state, action) => {
      state.query = action.payload;
    },
    setMobileSidebarOpen: (state, action) => {
      state.mobileSidebarOpen = action.payload;
    },
  },
});

export const { setCurrentCategory, setQuery, setMobileSidebarOpen } = viewSlice.actions;
export default viewSlice.reducer;
