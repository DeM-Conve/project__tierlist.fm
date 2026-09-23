import { notifications } from '@mantine/notifications';
import { enqueue, openFocus } from './store/focusSlice';
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
