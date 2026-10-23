import { draftEdited, unpackBoard } from './draftsSlice';
import { itemIdsRebased } from './itemIds';

// The open board is `state.tiers`; a board left with unpushed changes is kept
// in `state.drafts.boards`. boardScope(category) hands code written for the
// open board (tierActions' thunks, a push's preparePush / applySyncOutcome /
// recordPush, the selectors) a { dispatch, getState } pair that acts on
// `category`'s board wherever it is:
//   - getState().tiers is that board (the open one, or the kept one as a
//     whole tiers state); push status and failures stay the app's own.
//   - a tiersSlice action goes to that board; anything else (focus,
//     transfers, ...) to the store as usual. Thunks run in the same scope.
// Where the board is is checked on every call, so a scope keeps working when
// the board is opened or left meanwhile (a push in flight, a toast's Undo).
const GLOBAL_TIER_ACTIONS = new Set(['tiers/setSyncStatus', 'tiers/syncFailuresRecorded']);

export function boardScope(category, dispatch, getState) {
  const kept = () => category != null && getState().tiers.loadedCategory !== category;
  const scopedGetState = () => {
    const state = getState();
    if (!kept()) return state;
    const board = unpackBoard(state.drafts.boards[category], category);
    return { ...state, tiers: { ...board, syncStatus: state.tiers.syncStatus, syncFailures: state.tiers.syncFailures } };
  };
  const scopedDispatch = (action) => {
    if (typeof action === 'function') return action(scopedDispatch, scopedGetState);
    if (!kept() || GLOBAL_TIER_ACTIONS.has(action.type)) return dispatch(action);
    if (action.type === itemIdsRebased.type) {
      dispatch(draftEdited({ category, action }));
      // The staged transfers (and a card of theirs on the open board)
      // follow too - never the open board's own items.
      return dispatch(itemIdsRebased({ ...action.payload, tierPlaylist: {} }));
    }
    if (action.type.startsWith('tiers/')) return dispatch(draftEdited({ category, action }));
    return dispatch(action);
  };
  return { dispatch: scopedDispatch, getState: scopedGetState };
}

// Is `category`'s board in reach - open, or kept with its data?
export const boardInReach = (state, category) =>
  category != null && (state.tiers.loadedCategory === category || !!state.drafts?.boards?.[category]);

// A thunk run against `category`'s board (see boardScope).
export const inBoard = (category, thunk) => (dispatch, getState) => {
  const scope = boardScope(category, dispatch, getState);
  return thunk(scope.dispatch, scope.getState);
};
