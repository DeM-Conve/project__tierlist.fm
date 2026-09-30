import { createSlice } from '@reduxjs/toolkit';

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
    transfersDiscarded: (state) => {
      state.list = [];
    },
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
} = transfersSlice.actions;
export default transfersSlice.reducer;
