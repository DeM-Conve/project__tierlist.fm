import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import EmbeddedPlayer from './EmbeddedPlayer';

// A stand-in IFrame API: captures the player's event handlers.
let events;
beforeEach(() => {
  events = null;
  window.YT = {
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
    Player: class {
      constructor(_, options) {
        events = options.events;
      }
      destroy() {}
    },
  };
});
afterEach(() => {
  delete window.YT;
});

describe('EmbeddedPlayer playing state', () => {
  it('reports playing, then not playing on pause, end and cue (blocked autoplay)', async () => {
    const onPlayingChange = vi.fn();
    render(<EmbeddedPlayer videoId="vvvvvvvvvvv" onPlayingChange={onPlayingChange} />);
    await waitFor(() => expect(events).not.toBeNull());
    const fire = (data) => events.onStateChange({ data });
    fire(1);
    expect(onPlayingChange).toHaveBeenLastCalledWith(true);
    for (const state of [2, 0, 5]) {
      fire(1);
      fire(state);
      expect(onPlayingChange).toHaveBeenLastCalledWith(false);
    }
    onPlayingChange.mockClear();
    fire(3); // buffering: no change either way
    expect(onPlayingChange).not.toHaveBeenCalled();
  });

  it('calls onEnded when the video ends', async () => {
    const onEnded = vi.fn();
    render(<EmbeddedPlayer videoId="vvvvvvvvvvv" onEnded={onEnded} />);
    await waitFor(() => expect(events).not.toBeNull());
    events.onStateChange({ data: 0 });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
