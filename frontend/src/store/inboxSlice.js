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
    // Filed / dismissed this session - hidden at once, before the server
    // round trip lands (the placed/dismissed data then keeps them out).
    hidden: [],
    // The song on the card; null = the first one in the list.
    currentId: null,
    // Board picked by hand for a song, overriding the guess: { [videoId]: category }.
    boardFor: {},
    // Board the last song was filed into - the fallback guess.
    lastBoard: null,
    // Undo history, newest last:
    // { kind: 'file', video, category, tier, playlistId } | { kind: 'dismiss', video } | { kind: 'skip', video }
    history: [],
  },
  reducers: {
    pasteVideo: (state, action) => {
      const video = action.payload;
      state.pasted = [video, ...state.pasted.filter((v) => v.videoId !== video.videoId)];
      state.skipped = state.skipped.filter((id) => id !== video.videoId);
      state.hidden = state.hidden.filter((id) => id !== video.videoId);
      state.currentId = video.videoId;
    },
    setCurrent: (state, action) => {
      state.currentId = action.payload;
    },
    chooseBoard: (state, action) => {
      const { videoId, category } = action.payload;
      state.boardFor[videoId] = category;
    },
    // entry: a history entry (see above); nextId: the card to show next.
    recordAction: (state, action) => {
      const { entry, nextId } = action.payload;
      const id = entry.video.videoId;
      state.history.push(entry);
      if (state.history.length > 50) state.history.shift();
      if (entry.kind === 'skip') state.skipped = [...state.skipped.filter((x) => x !== id), id];
      else state.hidden.push(id);
      if (entry.kind === 'file') state.lastBoard = entry.category;
      state.currentId = nextId;
    },
    // Reverts an action locally (the caller reverses its server side effect):
    // the song comes back as the current card.
    revertAction: (state, action) => {
      const entry = action.payload;
      const id = entry.video.videoId;
      state.history = state.history.filter((e) => e !== entry && !(e.kind === entry.kind && e.video.videoId === id));
      state.skipped = state.skipped.filter((x) => x !== id);
      state.hidden = state.hidden.filter((x) => x !== id);
      state.currentId = id;
    },
  },
});

export const { pasteVideo, setCurrent, chooseBoard, recordAction, revertAction } = inboxSlice.actions;
export default inboxSlice.reducer;
