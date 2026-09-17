import { createSlice } from '@reduxjs/toolkit';

const focusSlice = createSlice({
  name: 'focus',
  initialState: {
    // { tier, videoId } for the video open in the player dock, or null.
    focusedVideo: null,
    // The browsing order for the currently-open focus session (video ids
    // only, in either tier order or shuffled order), frozen the moment the
    // dock is opened. Without this, "next" would be recomputed live from
    // current tier membership, so reassigning a video's tier mid-browse
    // (which appends it to the end of its new tier) would silently
    // teleport your position and make "next" jump into the wrong tier.
    focusQueue: null,
    isShuffling: false,
    // 'expanded' (full-screen) or 'mini' (bottom bar, app stays usable).
    playerMode: 'expanded',
  },
  reducers: {
    openFocus: (state, action) => {
      const { tier, videoId, queue } = action.payload;
      state.focusQueue = queue;
      state.isShuffling = false;
      state.playerMode = 'expanded';
      state.focusedVideo = { tier, videoId };
    },
    closeFocus: (state) => {
      state.focusedVideo = null;
      state.focusQueue = null;
      state.isShuffling = false;
      state.playerMode = 'expanded';
    },
    minimizePlayer: (state) => {
      state.playerMode = 'mini';
    },
    expandPlayer: (state) => {
      state.playerMode = 'expanded';
    },
    startShuffle: (state, action) => {
      const { queue, tier, videoId } = action.payload;
      state.focusQueue = queue;
      state.isShuffling = true;
      state.playerMode = 'expanded';
      state.focusedVideo = { tier, videoId };
    },
    setFocusedVideo: (state, action) => {
      state.focusedVideo = action.payload;
    },
  },
});

export const {
  openFocus,
  closeFocus,
  minimizePlayer,
  expandPlayer,
  startShuffle,
  setFocusedVideo,
} = focusSlice.actions;
export default focusSlice.reducer;
