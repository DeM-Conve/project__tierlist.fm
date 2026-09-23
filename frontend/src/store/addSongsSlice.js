import { createSlice } from '@reduxjs/toolkit';

// "Add songs" session state: songs picked from a pasted link or a search,
// waiting to be put in a tier. Where songs already are (every tier
// playlist's items) is server state - see addSongs/useAddSongs.js.
const addSongsSlice = createSlice({
  name: 'addSongs',
  initialState: {
    // Picked songs, in the order they were added.
    queue: [],
    // Skipped video ids, oldest first: skipping sends a song to the back.
    skipped: [],
    // Filed / removed - hidden at once, before the server round trip lands.
    hidden: [],
    // The song on the card; null = the first one waiting.
    currentId: null,
    // Board picked by hand for a song, overriding the guess: { [videoId]: category }.
    boardFor: {},
    // Board the last song was filed into - the fallback guess.
    lastBoard: null,
    // What happened this session, newest last (the "Added" list + Undo):
    // { kind: 'file', video, category, tier, playlistId } | { kind: 'skip' | 'remove', video }
    history: [],
  },
  reducers: {
    // New songs join the queue; the first of them becomes the card.
    addVideos: (state, action) => {
      const videos = action.payload;
      if (!videos.length) return;
      for (const video of videos) {
        const id = video.videoId;
        state.hidden = state.hidden.filter((x) => x !== id);
        state.skipped = state.skipped.filter((x) => x !== id);
        state.history = state.history.filter((e) => !(e.kind !== 'file' && e.video.videoId === id));
        if (!state.queue.some((v) => v.videoId === id)) state.queue.push(video);
      }
      state.currentId = videos[0].videoId;
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
      if (state.history.length > 100) state.history.shift();
      if (entry.kind === 'skip') state.skipped = [...state.skipped.filter((x) => x !== id), id];
      else state.hidden.push(id);
      if (entry.kind === 'file') state.lastBoard = entry.category;
      state.currentId = nextId;
    },
    // Undoes an entry locally (the caller reverses its server side effect):
    // the song comes back as the current card.
    revertAction: (state, action) => {
      const entry = action.payload;
      const id = entry.video.videoId;
      state.history = state.history.filter((e) => !(e.kind === entry.kind && e.video.videoId === id));
      state.skipped = state.skipped.filter((x) => x !== id);
      state.hidden = state.hidden.filter((x) => x !== id);
      state.currentId = id;
    },
  },
});

export const { addVideos, setCurrent, chooseBoard, recordAction, revertAction } = addSongsSlice.actions;
export default addSongsSlice.reducer;
