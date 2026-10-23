import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { draftsHydrated, packBoard } from '../store/draftsSlice';
import { boardHasEdits } from '../store/selectors';
import { loadDrafts, saveDrafts } from './draftStore';

// How long edits settle before the drafts are written (each write is every
// edited board, undo steps included).
const SAVE_DELAY_MS = 400;

// Every board with unpushed changes, as saved: the kept ones and the open
// board (its edits are a draft too, should the page reload).
export function draftsToSave(state) {
  const boards = {};
  for (const [category, board] of Object.entries(state.drafts.boards)) {
    if (boardHasEdits(board)) boards[category] = board;
  }
  const open = state.tiers.loadedCategory;
  if (open) {
    const board = packBoard(state.tiers);
    if (boardHasEdits(board)) boards[open] = board;
    else delete boards[open];
  }
  return boards;
}

// Unpushed drafts survive a reload (api/draftStore.js): read back once the
// signed-in account is known - boards wait for it (draftsSlice.hydrated), so
// one never loads over its saved draft - then written whenever a board's
// draft changes (debounced, and at once when the page is hidden).
export function useDraftPersistence(loggedIn, userId) {
  const dispatch = useDispatch();
  const store = useStore();

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    loadDrafts(userId).then((boards) => {
      if (!cancelled) dispatch(draftsHydrated(boards));
    });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, userId, dispatch]);

  useEffect(() => {
    if (!loggedIn || !userId) return;
    let timer = null;
    let last = null;
    const flush = () => {
      timer = null;
      const state = store.getState();
      if (state.drafts.hydrated) saveDrafts(userId, draftsToSave(state));
    };
    const unsubscribe = store.subscribe(() => {
      const { drafts, tiers } = store.getState();
      const parts = [drafts.boards, drafts.hydrated, tiers.loadedCategory, tiers.tierItems, tiers.originalTierItems, tiers.undoStack, tiers.redoStack];
      if (last && parts.every((p, i) => p === last[i])) return;
      last = parts;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });
    const onHide = () => {
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsubscribe();
      onHide();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [loggedIn, userId, store]);
}
