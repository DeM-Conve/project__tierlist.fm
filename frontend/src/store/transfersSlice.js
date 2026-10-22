import { createSlice } from '@reduxjs/toolkit';
import { itemIdsRebased, rebaseVideo } from './itemIds';

// Songs staged to move to another board (see transfers.js), plus the song
// being dragged right now - kept here, not in the board draft, because
// dragging to another board opens it, which replaces the board draft.
const transfersSlice = createSlice({
  name: 'transfers',
  initialState: {
    list: [], // [{ id, video, fromCategory, fromTier, toCategory, toTier }]
    drag: null, // { video, fromCategory, fromTier } while a song is being dragged
  },
  reducers: {
    dragStarted: (state, action) => {
      state.drag = action.payload;
    },
    dragEnded: (state) => {
      state.drag = null;
    },
    // Adds a transfer, or re-aims one already staged for this copy.
    transferStaged: (state, action) => {
      const t = action.payload;
      const i = state.list.findIndex((x) => x.id === t.id);
      if (i >= 0) state.list[i] = { ...state.list[i], toCategory: t.toCategory, toTier: t.toTier };
      else state.list.push(t);
    },
    transferCancelled: (state, action) => {
      state.list = state.list.filter((t) => t.id !== action.payload);
    },
    // The current targets (effectiveTransfers) become the stored ones -
    // done just before the open board's draft is replaced.
    transfersCommitted: (state, action) => {
      state.list = action.payload;
    },
    transfersPushed: (state, action) => {
      const done = new Set(action.payload);
      state.list = state.list.filter((t) => !done.has(t.id));
    },
    // Pushed half-way: the song is in its new playlist (`newItemId`), the
    // old copy is still there - only its delete is left (transfers.js).
    transfersInserted: (state, action) => {
      for (const { id, newItemId } of action.payload) {
        const t = state.list.find((x) => x.id === id);
        if (t) Object.assign(t, { inserted: true, newItemId: newItemId ?? null });
      }
    },
    // A half-pushed transfer stays: its song is on YouTube twice already, so
    // the leftover delete is kept like an auto-resolved duplicate.
    transfersDiscarded: (state) => {
      state.list = state.list.filter((t) => t.inserted);
    },
  },
  extraReducers: (builder) => {
    // A transfer's id is its song's playlist item id: both follow a rebase
    // (the card on the target board carries the same new id - tiersSlice).
    builder.addCase(itemIdsRebased, (state, action) => {
      const { renamed, transferPlaylist = {}, dragPlaylist = null } = action.payload;
      state.list = state.list.map((t) => {
        const map = renamed[transferPlaylist[t.id]];
        return map ? { ...t, id: map[t.id] ?? t.id, video: rebaseVideo(t.video, map) } : t;
      });
      if (state.drag) state.drag = { ...state.drag, video: rebaseVideo(state.drag.video, renamed[dragPlaylist]) };
    });
  },
});

export const {
  dragStarted,
  dragEnded,
  transferStaged,
  transferCancelled,
  transfersCommitted,
  transfersPushed,
  transfersDiscarded,
  transfersInserted,
} = transfersSlice.actions;
export default transfersSlice.reducer;
