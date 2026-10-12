import { notifications } from '@mantine/notifications';
import { enqueue, openFocus, playNextInQueue } from './store/focusSlice';
import { songLabel } from './tierUtils';

const TOAST_ID = 'queue-feedback';

// YouTube Music's "Play next" / "Add to queue". With nothing playing, the
// song simply starts (in the mini bar, so browsing isn't interrupted) and
// becomes the start of a fresh queue.
export const queueSong = (tier, video, position) => (dispatch, getState) => {
  const { focus, tiers } = getState();
  const entry = { tier, video };
  if (!focus.focusedVideo) {
    dispatch(
      openFocus({
        tier,
        videoId: video.videoId,
        queue: [video.videoId],
        entries: [entry],
        category: tiers.loadedCategory,
        mode: 'mini',
      })
    );
    return;
  }
  dispatch(enqueue({ entry, position }));
  notifications.hide(TOAST_ID);
  notifications.show({
    id: TOAST_ID,
    autoClose: 2500,
    withCloseButton: false,
    message: `${position === 'next' ? 'Playing next' : 'Added to queue'}: ${songLabel(video).song}`,
  });
};

// "Play now": the song starts in the player straight away (Play next, then
// skip to it) and the queue carries on after it. With nothing playing it
// starts a fresh queue in the mini bar, like queueSong.
export const playSongNow = (tier, video) => (dispatch, getState) => {
  if (!getState().focus.focusedVideo) {
    dispatch(queueSong(tier, video, 'next'));
    return;
  }
  dispatch(enqueue({ entry: { tier, video }, position: 'next' }));
  dispatch(playNextInQueue());
};
