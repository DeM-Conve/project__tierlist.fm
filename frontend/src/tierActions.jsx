import { useDispatch, useSelector } from 'react-redux';
import { Button, Group, Kbd, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  applyTierOrder,
  moveVideos,
  undoLastEdit,
  setDraggedVideoId,
  setDragOverTier,
} from './store/tiersSlice';
import { setFocusedVideo } from './store/focusSlice';

// Every tier edit in the app (drag, tile menu, row chips, bulk bar, Tier
// Rail, player tier pills/Shift+digit, duel) goes through these
// thunks, so each one gets the same instant "Moved X -> T1 . Undo" feedback
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
        <Group gap={4} wrap="nowrap" flex="none">
          <Group gap={2} wrap="nowrap" visibleFrom="sm">
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
    return m.fromTier === m.toTier ? `Reordered ${title}` : `${title} → ${m.toTier}`;
  }
  const targets = [...new Set(moves.map((m) => m.toTier))];
  return `Moved ${moves.length} videos → ${targets.join(', ')}`;
}

// moves: [{ fromTier, toTier, videoId, dropIndex? }] - applied as ONE undo step.
export const moveWithFeedback = (moves, { quiet = false } = {}) => (dispatch, getState) => {
  const real = moves.filter((m) => m.fromTier !== m.toTier || m.dropIndex != null);
  if (real.length === 0) return;
  const message = describe(real, getState().tiers.tierItems);
  dispatch(moveVideos({ moves: real }));
  resyncFocusedTier(dispatch, getState);
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

// Native HTML5 drag-and-drop shared by every drop surface (board rows,
// tier-focus list, Tier Rail): a drag carries { videoId, fromTier }.
export function useTierDnd() {
  const dispatch = useDispatch();
  const dragOverTier = useSelector((s) => s.tiers.dragOverTier);
  const draggedVideoId = useSelector((s) => s.tiers.draggedVideoId);

  return {
    dragOverTier,
    draggedVideoId,
    onDragStart(e, video, fromTier) {
      e.dataTransfer.setData('application/json', JSON.stringify({ videoId: video.videoId, fromTier }));
      e.dataTransfer.effectAllowed = 'move';
      dispatch(setDraggedVideoId(video.videoId));
    },
    onDragEnd() {
      dispatch(setDraggedVideoId(null));
      dispatch(setDragOverTier(null));
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
      if (!data.videoId) return;
      dispatch(moveWithFeedback([{ fromTier: data.fromTier, toTier, videoId: data.videoId, dropIndex }]));
    },
  };
}
