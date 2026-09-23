import { useDispatch, useSelector, useStore } from 'react-redux';
import { Button, Group, Kbd, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAddToPlaylistMutation, useDismissMutation, useRemovePlaylistItemMutation } from '../api/queries';
import { selectTierGroups } from '../store/selectors';
import { recordAction, revertAction } from '../store/inboxSlice';
import { addSyncedVideo, removeSyncedVideo } from '../store/tiersSlice';
import { openFocus } from '../store/focusSlice';
import { songLabel } from '../tierUtils';

const TOAST_ID = 'inbox-edit';

// A filed song's add request, by video id - undo has to wait for it to
// know which playlist item to delete (it can land after the Undo click).
const pendingAdds = new Map();

function toast(message, onUndo, color) {
  notifications.hide(TOAST_ID);
  notifications.show({
    id: TOAST_ID,
    color,
    autoClose: 4500,
    withCloseButton: false,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm" truncate="end" flex={1} miw={0}>
          {message}
        </Text>
        {onUndo && (
          <Group gap={4} wrap="nowrap" flex="none">
            <Kbd size="xs" visibleFrom="sm">
              u
            </Kbd>
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                notifications.hide(TOAST_ID);
                onUndo();
              }}
            >
              Undo
            </Button>
          </Group>
        )}
      </Group>
    ),
  });
}

// Everything the Inbox can do to a song. Filing writes straight to YouTube
// (the song isn't on any board yet, so there's nothing to stage), hides the
// card at once and rolls back with a toast if YouTube refuses.
export function useInboxActions(inbox) {
  const dispatch = useDispatch();
  const store = useStore();
  const tierGroups = useSelector(selectTierGroups);
  const addMutation = useAddToPlaylistMutation();
  const removeMutation = useRemovePlaylistItemMutation();
  const dismissMutation = useDismissMutation();

  // Plays `video` and the rest of the Inbox after it in the dock (mini, so
  // the card stays visible). Filing the playing song rolls on to the next.
  function listen(video, list = inbox.list) {
    if (!video) return;
    const from = Math.max(0, list.findIndex((v) => v.videoId === video.videoId));
    const queue = list.slice(from);
    const mode = store.getState().focus.playerMode;
    dispatch(
      openFocus({
        tier: null,
        videoId: video.videoId,
        queue: queue.map((v) => v.videoId),
        entries: queue.map((v) => ({ tier: null, video: v })),
        category: null,
        mode: mode === 'floating' ? 'floating' : 'mini',
      })
    );
  }

  // After `video` leaves the list: move the card on, and keep the music
  // going if it was the one playing.
  function advance(video, entry) {
    const nextId = inbox.nextAfter(video);
    const wasPlaying = store.getState().focus.focusedVideo?.videoId === video.videoId;
    dispatch(recordAction({ entry, nextId }));
    if (wasPlaying) {
      const rest = inbox.list.filter((v) => v.videoId !== video.videoId);
      const next = rest.find((v) => v.videoId === nextId);
      if (next) listen(next, rest);
    }
  }

  function file(video, category, tier) {
    const playlist = tierGroups[category]?.[tier];
    if (!video || !playlist) return;
    const entry = { kind: 'file', video, category, tier, playlistId: playlist.id };
    advance(video, entry);
    const { song } = songLabel(video);
    const request = addMutation
      .mutateAsync({ playlistId: playlist.id, videoId: video.videoId, video })
      .then((item) => {
        if (store.getState().tiers.loadedCategory === category) {
          dispatch(addSyncedVideo({ tier, video: { ...video, ...item, channelTitle: item.channelTitle ?? video.channelTitle } }));
        }
        return item;
      });
    pendingAdds.set(video.videoId, request);
    request.catch(() => {
      dispatch(revertAction(entry));
      toast(`Couldn't add "${song}" to ${category} ${tier} - YouTube refused`, null, 'red');
    });
    toast(`"${song}" → ${category} · ${tier}`, () => undo(entry));
  }

  function skip(video) {
    if (!video) return;
    advance(video, { kind: 'skip', video });
  }

  function dismiss(video) {
    if (!video) return;
    const entry = { kind: 'dismiss', video };
    advance(video, entry);
    dismissMutation.mutate({ videoId: video.videoId });
    toast(`"${songLabel(video).song}" hidden - not a song`, () => undo(entry));
  }

  async function undo(entry = store.getState().inbox.history.at(-1)) {
    if (!entry) return;
    dispatch(revertAction(entry));
    notifications.hide(TOAST_ID);
    if (entry.kind === 'dismiss') {
      dismissMutation.mutate({ videoId: entry.video.videoId, restore: true });
    } else if (entry.kind === 'file') {
      try {
        const item = await pendingAdds.get(entry.video.videoId);
        pendingAdds.delete(entry.video.videoId);
        await removeMutation.mutateAsync({ playlistId: entry.playlistId, itemId: item.id });
        if (store.getState().tiers.loadedCategory === entry.category) {
          dispatch(removeSyncedVideo({ tier: entry.tier, videoId: entry.video.videoId }));
        }
      } catch {
        // The add itself failed (already rolled back) or the delete did.
      }
    }
  }

  return { file, skip, dismiss, undo, listen };
}
