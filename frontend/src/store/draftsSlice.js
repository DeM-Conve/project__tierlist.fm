import { createSlice, current, isDraft } from '@reduxjs/toolkit';
import tiersReducer from './tiersSlice';
import { draftStorageAvailable } from '../api/draftStore';

// Unpushed changes belong to their board and never vanish on navigation
// (the user's call, 2026-10-23). `tiersSlice` holds the open board; every
// board left behind is kept here as it was - its draft (staged moves,
// removals, order), baseline and undo / redo history - and laid back over
// fresh YouTube data when it's opened again (tierActions.loadBoard,
// tiersSlice.draftRestored). A board kept here can still be edited (rating
// the playing song from another page, draftEdited) and pushed (App's push
// runs each board's plan from its own draft - boardScope.js).
//
// A board is kept as the fields of `tiersSlice` that describe it:
const BOARD_FIELDS = ['tierItems', 'originalTierItems', 'originalTierOf', 'duplicateCopies', 'undoStack', 'redoStack'];

export const packBoard = (tiers) => Object.fromEntries(BOARD_FIELDS.map((k) => [k, tiers[k]]));

const EMPTY_TIERS = tiersReducer(undefined, { type: '@@drafts/init' });

// A kept board as a whole `tiersSlice` state (so the slice's own reducers
// and the selectors run on it unchanged). Cached per kept board object.
const unpacked = new WeakMap();
export function unpackBoard(board, category) {
  if (!board) return { ...EMPTY_TIERS, loadedCategory: category };
  let out = unpacked.get(board);
  if (!out || out.loadedCategory !== category) {
    out = { ...EMPTY_TIERS, ...board, loadedCategory: category };
    unpacked.set(board, out);
  }
  return out;
}

const plainOf = (x) => (isDraft(x) ? current(x) : x);

const draftsSlice = createSlice({
  name: 'drafts',
  initialState: () => ({
    boards: {}, // { [category]: packBoard(...) }
    // Changes that no longer applied when their board was laid over fresh
    // YouTube data: { [category]: [{ key, title, text }] }, shown on the
    // board until dismissed.
    notes: {},
    // Saved drafts read back from this device (api/draftStore.js) - boards
    // wait for it, so a saved draft is never loaded over.
    hydrated: !draftStorageAvailable(),
  }),
  reducers: {
    boardParked: (state, action) => {
      const { category, board } = action.payload;
      state.boards[category] = board;
    },
    boardUnparked: (state, action) => {
      delete state.boards[action.payload];
    },
    // A `tiersSlice` action applied to a board that isn't open.
    draftEdited: (state, action) => {
      const { category, action: edit } = action.payload;
      const board = state.boards[category];
      if (!board) return;
      state.boards[category] = packBoard(tiersReducer(unpackBoard(plainOf(board), category), edit));
    },
    draftsHydrated: (state, action) => {
      state.boards = { ...(action.payload || {}), ...state.boards };
      state.hydrated = true;
    },
    // Logout: this device forgets them.
    draftsCleared: (state) => {
      state.boards = {};
      state.notes = {};
      state.hydrated = true;
    },
    notesAdded: (state, action) => {
      const { category, notes } = action.payload;
      if (notes.length) state.notes[category] = [...(state.notes[category] || []), ...notes];
    },
    notesDismissed: (state, action) => {
      delete state.notes[action.payload];
    },
  },
});

export const { boardParked, boardUnparked, draftEdited, draftsHydrated, draftsCleared, notesAdded, notesDismissed } =
  draftsSlice.actions;
export default draftsSlice.reducer;
