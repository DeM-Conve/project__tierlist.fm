import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    loggedIn: null, // null = not checked yet, otherwise boolean
    playlists: null, // null = not loaded yet
  },
  reducers: {
    setLoggedIn: (state, action) => {
      state.loggedIn = action.payload;
    },
    setPlaylists: (state, action) => {
      state.playlists = action.payload;
    },
  },
});

export const { setLoggedIn, setPlaylists } = authSlice.actions;
export default authSlice.reducer;
