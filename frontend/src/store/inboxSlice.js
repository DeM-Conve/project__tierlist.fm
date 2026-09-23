import { createSlice } from '@reduxjs/toolkit';

// Client-side Inbox state. The songs themselves are server state (likes +
// every tier playlist's items, see inbox/useInbox.js); this only holds what
// the user did to that list in this session.
const inboxSlice = createSlice({
  name: 'inbox',
  initialState: {
    // Videos pasted as links (newest first) - they join the Inbox up front.
    pasted: [],
    // Skipped video ids, oldest first: skipping sends a song to the back.
    skipped: [],
    // The song on the card; null = the first one in the list.
    currentId: null,
    // Board picked by hand for a song, overriding the guess: { [videoId]: category }.
    boardFor: {},
    // Board the last song was filed into - the fallback guess.
    lastBoard: null,
    // Recent actions, newest last, for Undo / Ctrl+Z on the Inbox:
    // { kind: 'file', video, category, tier, playlistId, itemId } | { kind: 'dismiss', video } | { kind: 'skip', video }
    history: [],
  },
  reducers: {
    pasteVideo: (state, action) => {
      const video = action.payload;
      state.pasted = [video, ...state.pasted.filter((v) => v.videoId !== video.videoId)];
      state.skipped = state.skipped.filter((id) => id !== video.videoId);
      state.currentId = video.videoId;
    },
    setCurrent: (state, action) => {
      state.currentId = action.payload;
    },
    skip: (state, action) => {
      const { video, nextId } = action.payload;
      state.skipped = [...state.skipped.filter((id) => id !== video.videoId), video.videoId];
      state.currentId = nextId;
      state.history.push({ kind: 'skip', video });
    },
    chooseBoard: (state, action) => {
      const { videoId, category } = action.payload;
      state.boardFor[videoId] = category;
    },
    recordFiled: (state, action) => {
      const { entry, nextId } = action.payload;
      state.history.push({ kind: 'file', ...entry });
      state.lastBoard = entry.category;
      state.currentId = nextId;
    },
    recordDismissed: (state, action) => {
      const { video, nextId } = action.payload;
      state.history.push({ kind: 'dismiss', video });
      state.currentId = nextId;
    },
    // Pops the newest action; the caller reverses its server side effect.
    popHistory: (state) => {
      const last = state.history.pop();
      if (!last) return;
      if (last.kind === 'skip') state.skipped = state.skipped.filter((id) => id !== last.video.videoId);
      state.currentId = last.video.videoId;
    },
  },
});

export const { pasteVideo, setCurrent, skip, chooseBoard, recordFiled, recordDismissed, popHistory } =
  inboxSlice.actions;
export default inboxSlice.reducer;
