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
    // A snapshot of { tier, video } for every id in focusQueue, taken once
    // when the dock opens. The player dock is meant to be global - it keeps
    // playing no matter what page you navigate to - but a tier board's
    // `tierItems` only ever holds the *currently loaded* category's videos
    // (see `tiersSlice.loadedCategory`). Without this snapshot, navigating
    // to a different tier board replaces `tierItems` and the still-playing
    // video would vanish from every video-lookup selector, silently killing
    // the dock mid-navigation instead of continuing in the background.
    focusEntries: null,
    // The tier-board category the focused video was opened from, frozen the
    // same way `focusEntries` is. Tier-reassignment (the pills/shift+digit
    // in the expanded view) has to write into `tiersSlice.tierItems`, which
    // only ever holds one *currently loaded* category - if you navigate to a
    // different board while a video keeps playing in the background and try
    // to reassign its tier there, the write would silently target the wrong
    // (or no) board and do nothing. `selectFocusedAvailableTiers` only shows
    // those controls when this matches the board you're actually viewing.
    focusedCategory: null,
    isShuffling: false,
    // Working through a board's TODO list: the queue is just the to-do
    // songs, and rating the playing one moves straight on to the next.
    isTriage: false,
    // 'expanded' (full-screen), 'mini' (bottom bar), or 'floating' (small
    // corner box) - the three views the dock cycles through, in that order,
    // via the vim-style j/k shortcut (see PlayerDock).
    playerMode: 'expanded',
  },
  reducers: {
    openFocus: (state, action) => {
      const { tier, videoId, queue, entries, category, mode } = action.payload;
      state.focusQueue = queue;
      state.focusEntries = entries;
      state.focusedCategory = category;
      state.isShuffling = false;
      state.isTriage = !!action.payload.triage;
      // Add songs passes 'mini' so its card stays in view while listening;
      // everything else opens full-screen.
      state.playerMode = mode ?? 'expanded';
      state.focusedVideo = { tier, videoId };
    },
    closeFocus: (state) => {
      state.focusedVideo = null;
      state.focusQueue = null;
      state.focusEntries = null;
      state.focusedCategory = null;
      state.isShuffling = false;
      state.isTriage = false;
      state.playerMode = 'expanded';
    },
    minimizePlayer: (state) => {
      state.playerMode = 'mini';
    },
    expandPlayer: (state) => {
      state.playerMode = 'expanded';
    },
    floatPlayer: (state) => {
      state.playerMode = 'floating';
    },
    startShuffle: (state, action) => {
      const { queue, tier, videoId, entries, category } = action.payload;
      state.focusQueue = queue;
      state.focusEntries = entries;
      state.focusedCategory = category;
      state.isShuffling = true;
      state.isTriage = false;
      state.playerMode = 'expanded';
      state.focusedVideo = { tier, videoId };
    },
    setFocusedVideo: (state, action) => {
      state.focusedVideo = action.payload;
    },
    // YouTube-Music-style queue edits on the frozen queue. `entry` is a
    // { tier, video } snapshot (added to focusEntries if new). The queue is
    // id-based (see selectFocusedSeqIndex), so a song already queued is
    // moved rather than duplicated; the playing song itself never moves.
    // 'next' = right after the playing song, 'end' = the end of the queue.
    enqueue: (state, action) => {
      const { entry, position } = action.payload;
      const id = entry.video.videoId;
      if (!state.focusQueue || !state.focusedVideo || state.focusedVideo.videoId === id) return;
      if (!state.focusEntries.some((e) => e.video.videoId === id)) state.focusEntries.push(entry);
      state.focusQueue = state.focusQueue.filter((q) => q !== id);
      if (position === 'next') {
        const at = state.focusQueue.indexOf(state.focusedVideo.videoId);
        state.focusQueue.splice(at + 1, 0, id);
      } else {
        state.focusQueue.push(id);
      }
    },
    removeFromQueue: (state, action) => {
      const id = action.payload;
      if (!state.focusQueue || state.focusedVideo?.videoId === id) return;
      state.focusQueue = state.focusQueue.filter((q) => q !== id);
    },
  },
});

export const {
  openFocus,
  closeFocus,
  minimizePlayer,
  expandPlayer,
  floatPlayer,
  startShuffle,
  setFocusedVideo,
  enqueue,
  removeFromQueue,
} = focusSlice.actions;
export default focusSlice.reducer;
