import { useDispatch, useSelector } from 'react-redux';
import { tierName } from './tierLabels';
import { Button, Group, Kbd, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  applyTierOrder,
  moveVideos,
  undoLastEdit,
  setDraggedVideoId,
  setDragOverTier,
  transferArrived,
  transferUndone,
  resetTierBoard,
  setTierForCategory,
  setLoadedCategory,
  transfersOverlaid,
} from './store/tiersSlice';
import { dragEnded, dragStarted, transferCancelled, transferStaged, transfersCommitted } from './store/transfersSlice';
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
function resyncFocusedTier(dispatch, getState) {
  const { focus, tiers, view } = getState();
  const fv = focus.focusedVideo;
  if (!fv || focus.focusedCategory !== view.currentCategory) return;
  const tier = findTierOf(tiers.tierItems, fv.videoId);
  if (tier && tier !== fv.tier) dispatch(setFocusedVideo({ tier, videoId: fv.videoId }));
}

// Triage session (see focusSlice.isTriage): once the playing to-do song has
// been given a tier - from the player, the rail, a menu, anywhere - move on
// to the next song in the TODO queue.
function advanceTriage(dispatch, getState, moves) {
  const { focus } = getState();
  const fv = focus.focusedVideo;
  if (!focus.isTriage || !fv) return;
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
export const moveWithFeedback = (moves, { quiet = false } = {}) => (dispatch, getState) => {
  const real = moves.filter((m) => m.fromTier !== m.toTier || m.dropIndex != null);
  if (real.length === 0) return;
  const message = describe(real, getState().tiers.tierItems);
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
  dispatch(transferArrived({ tier: toTier, video: { ...home.video, transfer: id }, dropIndex }));
  resyncFocusedTier(dispatch, getState);
  showToast(dispatch, `"${songLabel(home.video).song}" → ${toCategory} · ${tierName(toTier)} (from ${home.fromCategory}) - on push`);
};

// Puts a freshly fetched board into the draft. First the board being left
// hands its transfers' current targets to the store (its draft - where an
// arrived song was dragged since - is about to be replaced), then the new
// board is shown with the staged transfers laid over it.
export const loadBoard = ({ category, data }) => (dispatch, getState) => {
  const { tiers, transfers } = getState();
  if (tiers.loadedCategory) {
    dispatch(transfersCommitted(effectiveTransfers(transfers.list, tiers.loadedCategory, tiers.tierItems)));
  }
  const presentTiers = Object.keys(data);
  dispatch(resetTierBoard({ category, presentTiers }));
  presentTiers.forEach((tier) => dispatch(setTierForCategory({ tier, videos: data[tier] })));
  dispatch(transfersOverlaid({ category, transfers: getState().transfers.list }));
  dispatch(setLoadedCategory(category));
};

// "Put back" on a staged transfer (the review list).
export const cancelTransfer = (transfer) => (dispatch) => {
  dispatch(transferCancelled(transfer.id));
  dispatch(transferUndone(transfer));
};

// Native HTML5 drag-and-drop shared by every drop surface (board rows,
// tier-focus list, Tier Rail): a drag carries { videoId, fromTier }. The
// dragged song is also kept in the store (transfers.drag), so it can be
// dropped on another board after the sidebar opens it (see Sidebar).
export function useTierDnd() {
  const dispatch = useDispatch();
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const drag = useSelector((s) => s.transfers.drag);

  return {
    dragOverTier,
    draggedVideoId,
    onDragStart(e, video, fromTier) {
      e.dataTransfer.setData('application/json', JSON.stringify({ videoId: video.videoId, fromTier }));
      e.dataTransfer.effectAllowed = 'move';
      dispatch(setDraggedVideoId(video.videoId));
      dispatch(dragStarted({ video, fromCategory: loadedCategory, fromTier }));
    },
    onDragEnd() {
      dispatch(setDraggedVideoId(null));
      dispatch(setDragOverTier(null));
      dispatch(dragEnded());
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
      const crossBoard = drag && drag.fromCategory && drag.fromCategory !== loadedCategory;
      dispatch(dragEnded());
      if (crossBoard) {
        dispatch(transferWithFeedback(drag, toTier, dropIndex));
        return;
      }
      if (!data.videoId) return;
      dispatch(moveWithFeedback([{ fromTier: data.fromTier, toTier, videoId: data.videoId, dropIndex }]));
    },
  };
}
