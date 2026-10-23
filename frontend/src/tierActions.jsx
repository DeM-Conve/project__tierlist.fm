import { useDispatch, useSelector } from 'react-redux';
import { tierName } from './tierLabels';
import { Button, Group, Kbd, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  applyTierOrder,
  moveVideos,
  undoLastEdit,
  redoLastEdit,
  setDraggedVideoId,
  setDragOverTier,
  transferArrived,
  transferUndone,
  resetTierBoard,
  setTierForCategory,
  setLoadedCategory,
  setAwaitingRefresh,
  transfersOverlaid,
  applySyncedMoves,
  transfersApplied,
  syncFailuresRecorded,
  draftRestored,
  discardTierChanges,
} from './store/tiersSlice';
import { boardHasEdits, pendingMovesOfBoard, selectHasLocalEdits } from './store/selectors';
import { boardParked, boardUnparked, draftEdited, notesAdded, packBoard } from './store/draftsSlice';
import { boardInReach, inBoard } from './store/boardScope';
import {
  dragEnded,
  dragStarted,
  transferCancelled,
  transferStaged,
  transfersCommitted,
  transfersDiscarded,
  transfersInserted,
  transfersPushed,
} from './store/transfersSlice';
import { syncOutcome } from './syncPlan';
import { effectiveTransfers } from './transfers';
import { transferId } from './transfers';
import { songLabel } from './tierUtils';
import { setFocusedVideo } from './store/focusSlice';
import { REMOVED_TIER, TODO_TIER } from './tiers';

// Every tier edit in the app (drag, tile menu, row chips, bulk bar, Tier
// Rail, player tier pills/Shift+digit, duel) goes through these
// thunks, so each one gets the same instant "Moved X -> S . Undo" feedback
// and the same Ctrl+Z undo step, instead of each surface inventing its own.

const TOAST_ID = 'tier-edit';

function findTierOf(tierItems, videoId) {
  return Object.keys(tierItems).find((t) => tierItems[t]?.some((v) => v.videoId === videoId));
}

// The dock tracks the playing video's tier separately (focusedVideo.tier) -
// after any edit that moved it, point that back at wherever it now lives,
// so the player's tier pills / the Tier Rail marker never go stale.
// The edit was made to the loaded board's tierItems - which stays loaded on
// Home / Settings, where the rail and the player still rate the playing
// song - so that's the board to check, not the page being viewed (on Home
// the playing song used to move while the player still showed its old tier).
function resyncFocusedTier(dispatch, getState) {
  const { focus, tiers } = getState();
  const fv = focus.focusedVideo;
  if (!fv || focus.focusedCategory !== tiers.loadedCategory) return;
  const tier = findTierOf(tiers.tierItems, fv.videoId);
  if (tier && tier !== fv.tier) dispatch(setFocusedVideo({ tier, videoId: fv.videoId }));
}

// Triage session (see focusSlice.isTriage): once the playing to-do song has
// been given a tier - from the player, the rail, a menu, anywhere - move on
// to the next song in the TODO queue.
function advanceTriage(dispatch, getState, moves) {
  const { focus, tiers } = getState();
  const fv = focus.focusedVideo;
  // Only an edit on the triage's own board: the same song in another
  // board's to-do list, rated there, is a different playlist item.
  if (!focus.isTriage || !fv || focus.focusedCategory !== tiers.loadedCategory) return;
  const rated = moves.some((m) => m.videoId === fv.videoId && m.fromTier === TODO_TIER && m.toTier !== TODO_TIER);
  if (!rated) return;
  // Skip songs already rated some other way (e.g. dragged on the board).
  const todo = new Set((getState().tiers.tierItems[TODO_TIER] || []).map((v) => v.videoId));
  const nextId = focus.upcoming.map((e) => e.video.videoId).find((id) => todo.has(id));
  if (nextId) dispatch(setFocusedVideo({ tier: TODO_TIER, videoId: nextId }));
}

function showToast(dispatch, message) {
  notifications.hide(TOAST_ID);
  notifications.show({
    id: TOAST_ID,
    autoClose: 4500,
    withCloseButton: false,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {/* The title takes the leftover width and truncates; the shortcut
            and Undo never shrink (they used to wrap / get clipped). */}
        <Text size="sm" truncate="end" flex={1} miw={0}>
          {message}
        </Text>
        <Group gap="4xs" wrap="nowrap" flex="none">
          <Group gap="5xs" wrap="nowrap" visibleFrom="sm">
            <Kbd size="xs">Ctrl</Kbd>
            <Kbd size="xs">Z</Kbd>
          </Group>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => {
              dispatch(undoEdit({ silent: true }));
              notifications.hide(TOAST_ID);
            }}
          >
            Undo
          </Button>
        </Group>
      </Group>
    ),
  });
}

function describe(moves, tierItems) {
  if (moves.length === 1) {
    const m = moves[0];
    const video = tierItems[m.fromTier]?.find((v) => v.videoId === m.videoId);
    const title = video ? `"${video.title}"` : 'Video';
    if (m.toTier === REMOVED_TIER) return `${title} will be removed on push`;
    return m.fromTier === m.toTier ? `Reordered ${title}` : `${title} → ${tierName(m.toTier)}`;
  }
  if (moves.every((m) => m.toTier === REMOVED_TIER)) return `${moves.length} videos will be removed on push`;
  const targets = [...new Set(moves.map((m) => m.toTier))];
  return `Moved ${moves.length} videos → ${targets.map(tierName).join(', ')}`;
}

// moves: [{ fromTier, toTier, videoId, dropIndex? }] - applied as ONE undo step.
// `category`: the board the songs are on, when it may not be the open one -
// rating the playing song from the player, the rail or a key on any page
// stages the change on *its* board, kept with its unpushed changes if
// another board is open (boardScope). Without one: the open board.
// `onBoard`: named in the toast (the edit went to a board that isn't open).
export const moveWithFeedback = (moves, { quiet = false, category = null, onBoard = null } = {}) => (dispatch, getState) => {
  if (category != null && getState().tiers.loadedCategory !== category) {
    if (!boardInReach(getState(), category)) return;
    return dispatch(inBoard(category, moveWithFeedback(moves, { quiet, onBoard: category })));
  }
  // A move of a song that isn't (any more) where it says - a stale drag, the
  // player's snapshot after a reload - changes nothing: no undo step, no toast.
  const { tierItems } = getState().tiers;
  // A song dropped back on its own slot doesn't move either ("Reordered"
  // toast and undo step for nothing).
  const changes = (m) => {
    const at = tierItems[m.fromTier]?.findIndex((v) => v.videoId === m.videoId) ?? -1;
    if (at < 0) return false;
    if (m.fromTier !== m.toTier) return true;
    return m.dropIndex != null && m.dropIndex !== at && m.dropIndex !== at + 1;
  };
  const real = moves.filter(changes);
  if (real.length === 0) return;
  const message = describe(real, getState().tiers.tierItems) + (onBoard ? ` · ${onBoard}` : '');
  dispatch(moveVideos({ moves: real }));
  resyncFocusedTier(dispatch, getState);
  advanceTriage(dispatch, getState, real);
  if (!quiet) showToast(dispatch, message);
};

// A finished duel run re-fills every tier at once - one undo step too.
export const applyOrderWithFeedback = (result) => (dispatch, getState) => {
  dispatch(applyTierOrder(result));
  resyncFocusedTier(dispatch, getState);
  showToast(dispatch, 'Duel result applied to your tiers');
};

export const undoEdit = ({ silent = false } = {}) => (dispatch, getState) => {
  if (getState().tiers.undoStack.length === 0) return;
  dispatch(undoLastEdit());
  resyncFocusedTier(dispatch, getState);
  if (!silent) {
    notifications.hide(TOAST_ID);
    notifications.show({ id: TOAST_ID, autoClose: 1800, withCloseButton: false, message: 'Undone' });
  }
};

// Ctrl+Shift+Z / Ctrl+Y: re-applies the last undone edit (one step).
export const redoEdit = ({ silent = false } = {}) => (dispatch, getState) => {
  if (getState().tiers.redoStack.length === 0) return;
  dispatch(redoLastEdit());
  resyncFocusedTier(dispatch, getState);
  if (!silent) {
    notifications.hide(TOAST_ID);
    notifications.show({ id: TOAST_ID, autoClose: 1800, withCloseButton: false, message: 'Redone' });
  }
};

// A song dragged in from another board (the drag started there, then its
// sidebar entry opened this board) lands on `toTier` here: staged as a
// transfer (transfers.js), one undo step like any drop. Dropped back on its
// own board, it's just a move there again.
export const transferWithFeedback = ({ video, fromCategory, fromTier }, toTier, dropIndex = null) => (dispatch, getState) => {
  const toCategory = getState().tiers.loadedCategory;
  if (!toCategory || toTier === REMOVED_TIER) return;
  const id = video.transfer ?? transferId(video);
  const staged = getState().transfers.list.find((t) => t.id === id);
  const { transfer: _, ...plain } = video;
  const home = staged ?? { id, video: plain, fromCategory, fromTier };
  if (home.fromCategory === toCategory) {
    // Back where it came from: no transfer - an ordinary (maybe no-op) move.
    dispatch(transferCancelled(id));
    dispatch(transferArrived({ tier: toTier, video: home.video, dropIndex }));
    resyncFocusedTier(dispatch, getState);
    showToast(dispatch, `"${songLabel(home.video).song}" is back in ${toCategory} · ${tierName(toTier)}`);
    return;
  }
  dispatch(transferStaged({ ...home, toCategory, toTier }));
  // The board it leaves is kept (it was left to open this one): the song
  // goes from there now, as it would on reopening it (overlayTransfers).
  if (getState().drafts?.boards[home.fromCategory]) {
    dispatch(draftEdited({ category: home.fromCategory, action: transfersOverlaid({ category: home.fromCategory, transfers: getState().transfers.list }) }));
  }
  dispatch(transferArrived({ tier: toTier, video: { ...home.video, transfer: id }, dropIndex }));
  resyncFocusedTier(dispatch, getState);
  showToast(dispatch, `"${songLabel(home.video).song}" → ${toCategory} · ${tierName(toTier)} (from ${home.fromCategory}) - on push`);
};

// Puts a freshly fetched board into the draft. The board being left is kept
// with everything on it (draftsSlice: staged moves, removals, order, undo
// history) - unpushed changes belong to their board and never vanish on
// navigation (the user's call) - after handing its transfers' current
// targets to the store. The board being opened gets its own kept draft back,
// laid over the fresh data (restoreDraft), then the staged transfers.
//
// `refreshingSince`: the data is a copy being refreshed in the background
// (from the board cache) - its dataUpdatedAt, so landBoardRefresh can tell
// the fresh copy when it arrives.
// `rebase`: the open board itself is laid over newer data (landBoardRefresh).
export const loadBoard = ({ category, data, refreshingSince = null, rebase = false }) => (dispatch, getState) => {
  const { tiers, transfers } = getState();
  if (tiers.loadedCategory) {
    dispatch(transfersCommitted(effectiveTransfers(transfers.list, tiers.loadedCategory, tiers.tierItems)));
    if (getState().drafts && (tiers.loadedCategory !== category || rebase)) {
      dispatch(boardParked({ category: tiers.loadedCategory, board: packBoard(tiers) }));
    }
  }
  const kept = getState().drafts?.boards[category];
  const presentTiers = Object.keys(data);
  dispatch(resetTierBoard({ category, presentTiers }));
  presentTiers.forEach((tier) => dispatch(setTierForCategory({ tier, videos: data[tier] })));
  if (kept) {
    if (boardHasEdits(kept)) dispatch(restoreDraft(category, kept));
    dispatch(boardUnparked(category));
  }
  dispatch(transfersOverlaid({ category, transfers: getState().transfers.list }));
  dispatch(setLoadedCategory(category));
  dispatch(setAwaitingRefresh(refreshingSince == null ? null : { category, since: refreshingSince }));
};

// The board's kept draft laid over its fresh load (tiersSlice draftRestored).
// A change of the user's that no longer applies - its song was moved or
// removed on YouTube meanwhile - is dropped, never silently: it's listed in
// a note on the board (draftsSlice.notes). One already done on YouTube (the
// song is where the change put it) needs no note.
export const restoreDraft = (category, kept) => (dispatch, getState) => {
  const wanted = pendingMovesOfBoard(kept).filter((m) => m.kind === 'move' || m.kind === 'remove');
  dispatch(draftRestored({ draft: kept, category, liveTransfers: getState().transfers.list }));
  const { tierItems } = getState().tiers;
  const tierOf = (videoId) => Object.keys(tierItems).find((t) => (tierItems[t] || []).some((v) => v.videoId === videoId && !v.transfer));
  const notes = wanted.flatMap((m) => {
    const now = tierOf(m.video.videoId);
    if (m.kind === 'move' ? now === m.to : now === REMOVED_TIER || now === undefined) return [];
    const { song } = songLabel(m.video);
    const what = m.kind === 'move' ? `${tierName(m.from)} → ${tierName(m.to)}` : `removal from ${tierName(m.from)}`;
    const where = now ? `it’s in ${tierName(now)} there now` : 'it’s no longer on this board';
    return [{ key: `${m.video.id ?? m.video.videoId}-${m.kind}`, title: m.video.title, text: `"${song}" changed on YouTube since you staged ${what} - ${where}, so that change was dropped.` }];
  });
  if (notes.length) dispatch(notesAdded({ category, notes }));
};

// The background refresh of a board shown from the board cache has finished
// (`isFetching` false). Newer data replaces the board - once, and only while
// the user hasn't touched it: a drag, staged move or duel result is never
// overwritten (it stays on the cached copy, like any unsynced edit). A
// failed refresh just ends the wait, the cached board stays up. Ending the
// wait matters: a later refetch (e.g. after a sync) can lag behind YouTube's
// own write, so it must never be applied over the draft - see applySyncedMoves.
export const landBoardRefresh = ({ category, data, dataUpdatedAt }) => (dispatch, getState) => {
  const { awaitingRefresh, loadedCategory } = getState().tiers;
  if (!awaitingRefresh || awaitingRefresh.category !== category || loadedCategory !== category) return;
  dispatch(setAwaitingRefresh(null));
  if (!data || dataUpdatedAt <= awaitingRefresh.since) return;
  if (!selectHasLocalEdits(getState())) {
    dispatch(loadBoard({ category, data }));
    return;
  }
  // Edited already (or a draft kept from before the reload): the edits are
  // laid over the fresh copy like a kept draft - unless something was
  // written to YouTube from this board since it loaded or a push is under
  // way, which this refresh (started before) may not show yet.
  const { wroteSinceLoad, syncStatus } = getState().tiers;
  if (wroteSinceLoad || syncStatus === 'syncing') return;
  dispatch(loadBoard({ category, data, rebase: true }));
};

// A push came back (`results`: the backend's per-item results for
// `plan`, syncPlan.buildSyncPlan). What it did becomes the new baseline,
// under the songs' new item ids; a half-done change keeps only its delete
// staged; every failure's reason is kept for the review list. -> the outcome.
//
// What the push removed (or added, a transfer's arrival) is taken out of (put
// into) every undo snapshot - see tiersSlice rebaseHistory. A step that then
// changes nothing is gone from the history, so the last edit's toast is
// closed: its Undo would otherwise undo an older edit instead.
export const applySyncOutcome = (plan, results) => (dispatch, getState) => {
  const o = syncOutcome(plan, results);
  const stepsBefore = getState().tiers.undoStack.length;
  dispatch(applySyncedMoves({ moves: o.moves, newIds: o.newIds, inserted: o.insertedMoves }));
  dispatch(transfersApplied({ transfers: o.transfers, newIds: o.newIds, inserted: o.insertedTransfers }));
  dispatch(transfersPushed(o.transfers.map((t) => t.id)));
  dispatch(transfersInserted(o.insertedTransfers.map((t) => ({ id: t.id, newItemId: o.newIds[t.video.id] }))));
  dispatch(syncFailuresRecorded({ attempted: plan.payload.map((r) => r.fromItemId), failures: o.failures }));
  if (getState().tiers.undoStack.length < stepsBefore) notifications.hide(TOAST_ID);
  return o;
};

// The whole push failed (no per-item results): every change it sent gets
// that one reason.
export const syncRequestFailed = (plan, error) => (dispatch) => {
  const failures = Object.fromEntries(plan.payload.map((r) => [r.fromItemId, { step: null, error }]));
  dispatch(syncFailuresRecorded({ attempted: [], failures }));
};

// "Put back" on a staged transfer (the review list).
// The song comes back on its board (and leaves the target), whether those
// boards are open or kept with unpushed changes.
export const cancelTransfer = (transfer) => (dispatch, getState) => {
  dispatch(transferCancelled(transfer.id));
  dispatch(transferUndone(transfer));
  const kept = getState().drafts?.boards ?? {};
  for (const category of new Set([transfer.fromCategory, transfer.toCategory])) {
    if (kept[category] && category !== getState().tiers.loadedCategory) {
      dispatch(draftEdited({ category, action: transferUndone(transfer) }));
    }
  }
};

// Discard on one board: its draft back to what's on YouTube, and every song
// staged to move to or from it stays where it was. (A push failure of its
// songs goes too.)
export const discardBoard = (category) => (dispatch, getState) => {
  for (const t of getState().transfers.list) {
    if (!t.inserted && (t.fromCategory === category || t.toCategory === category)) dispatch(cancelTransfer(t));
  }
  dispatch(inBoard(category, (d) => d(discardTierChanges())));
};

// Discard all: every board's changes and every staged transfer.
export const discardAll = () => (dispatch, getState) => {
  const { tiers, drafts } = getState();
  const boards = new Set([tiers.loadedCategory, ...Object.keys(drafts?.boards ?? {})].filter(Boolean));
  for (const category of boards) dispatch(inBoard(category, (d) => d(discardTierChanges())));
  dispatch(transfersDiscarded());
  dispatch(syncFailuresRecorded({ attempted: Object.keys(getState().tiers.syncFailures), failures: {} }));
};

// Native HTML5 drag-and-drop shared by every drop surface (board rows,
// tier-focus list, Tier Rail): a drag carries { videoId, fromTier }. The
// dragged song is also kept in the store (transfers.drag), so it can be
// dropped on another board after the sidebar opens it (see Sidebar).
// `category`: the board these drop targets belong to (the Tier Rail of the
// playing song's board when another one is open); the open board by default.
export function useTierDnd(category = null) {
  const dispatch = useDispatch();
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);
  const openCategory = useSelector((s) => s.tiers.loadedCategory);
  const loadedCategory = category ?? openCategory;
  const drag = useSelector((s) => s.transfers.drag);

  function endDrag() {
    dispatch(setDraggedVideoId(null));
    dispatch(setDragOverTier(null));
    dispatch(dragEnded());
  }

  return {
    dragOverTier,
    draggedVideoId,
    onDragStart(e, video, fromTier) {
      e.dataTransfer.setData('application/json', JSON.stringify({ videoId: video.videoId, fromTier }));
      e.dataTransfer.effectAllowed = 'move';
      dispatch(setDraggedVideoId(video.videoId));
      // A drag carried to another board (its sidebar entry opens it) loses
      // its source tile, and React only hears events on mounted elements: a
      // drag cancelled there never reached onDragEnd, so the song stayed
      // "being dragged" (rail dimmed). The browser still fires dragend on
      // the detached source - listen on the element itself.
      e.currentTarget?.addEventListener?.('dragend', endDrag, { once: true });
      // The board's own copy, not the caller's: the Tier Rail drags the
      // player's snapshot of the song, whose item id can be from before a
      // push - a transfer must delete the item that exists now.
      dispatch(inBoard(loadedCategory, (d, getState) => {
        const live = getState().tiers.tierItems[fromTier]?.find((v) => v.videoId === video.videoId);
        d(dragStarted({ video: live ?? video, fromCategory: loadedCategory, fromTier }));
      }));
    },
    onDragEnd() {
      endDrag();
    },
    onDragOver(e, tier) {
      e.preventDefault();
      if (dragOverTier !== tier) dispatch(setDragOverTier(tier));
    },
    onDragLeave(e, tier) {
      // dragleave also fires when moving between a target's own children.
      if (e.currentTarget.contains(e.relatedTarget)) return;
      if (dragOverTier === tier) dispatch(setDragOverTier(null));
    },
    onDrop(e, toTier, dropIndex = null) {
      e.preventDefault();
      let data = {};
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
      } catch {
        data = {};
      }
      dispatch(setDragOverTier(null));
      dispatch(setDraggedVideoId(null));
      // Only the song this drag carries: a drop of anything else (a link or
      // file from outside) never acts on a drag left over from before.
      const crossBoard =
        drag && drag.fromCategory && drag.fromCategory !== loadedCategory && data.videoId === drag.video.videoId;
      dispatch(dragEnded());
      if (crossBoard) {
        // To another board: only onto the open one (a transfer lands there).
        if (loadedCategory === openCategory) dispatch(transferWithFeedback(drag, toTier, dropIndex));
        return;
      }
      if (!data.videoId) return;
      dispatch(moveWithFeedback([{ fromTier: data.fromTier, toTier, videoId: data.videoId, dropIndex }], { category: loadedCategory }));
    },
  };
}
