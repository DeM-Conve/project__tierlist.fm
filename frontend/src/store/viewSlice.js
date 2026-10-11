import { createSlice } from '@reduxjs/toolkit';
import { readDevicePref } from '../settings';

// "What page" is now owned by React Router (the URL), not this slice.
// currentCategory is the one piece of routing context still needed outside
// the routed page component itself - PlayerDock's tier-reassignment needs to
// know which board's tiers are selectable regardless of which page rendered
// it (tier board or duel), and it lives at the layout level, above <Outlet/>.
// A function, so RTK reads the saved layout lazily (each fresh store - a
// reload - starts from what this device last had).
function initialState() {
  const { collapsed, view } = readDevicePref('sidebar');
  return {
    currentCategory: null,
    // Two independent filters: the sidebar's board list and Home's page.
    sidebarQuery: '',
    homeQuery: '',
    mobileSidebarOpen: false,
    // Desktop: the sidebar folded to an icon strip (Ctrl+B, like VS Code).
    // Which view the panel shows: 'boards' (tier lists), 'playlists' or 'duels'.
    // Both survive a reload (per device, settings.js DEVICE_UI - saved by store.js).
    sidebarCollapsed: collapsed,
    sidebarView: view,
  };
}

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    setCurrentCategory: (state, action) => {
      state.currentCategory = action.payload;
    },
    setSidebarQuery: (state, action) => {
      state.sidebarQuery = action.payload;
    },
    setHomeQuery: (state, action) => {
      state.homeQuery = action.payload;
    },
    setMobileSidebarOpen: (state, action) => {
      state.mobileSidebarOpen = action.payload;
    },
    toggleSidebarCollapsed: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    // VS Code's activity bar: clicking the open view's icon closes the
    // panel; any other icon opens the panel on that view.
    // The panel dragged shut / open at its edge (react-resizable-panels).
    setSidebarCollapsed: (state, action) => {
      state.sidebarCollapsed = action.payload;
    },
    showSidebarView: (state, action) => {
      if (!state.sidebarCollapsed && state.sidebarView === action.payload) state.sidebarCollapsed = true;
      else {
        state.sidebarCollapsed = false;
        state.sidebarView = action.payload;
      }
    },
    // Ctrl+Shift+E / Ctrl+Shift+F: like VS Code's view shortcuts these
    // always *show* the view (they never close an open panel).
    openSidebarView: (state, action) => {
      state.sidebarCollapsed = false;
      state.sidebarView = action.payload;
    },
  },
});

export const { setCurrentCategory, setSidebarQuery, setHomeQuery, setMobileSidebarOpen, toggleSidebarCollapsed, showSidebarView, setSidebarCollapsed, openSidebarView } = viewSlice.actions;
export default viewSlice.reducer;
