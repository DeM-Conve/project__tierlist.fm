import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

import { notifications } from '@mantine/notifications';
import focusReducer, { openFocus } from './store/focusSlice';
import tiersReducer, { setLoadedCategory } from './store/tiersSlice';
import { queueSong } from './queueActions';

const v = (id, title = `Artist - Song ${id}`) => ({ videoId: id, title });
const makeStore = () => configureStore({ reducer: { focus: focusReducer, tiers: tiersReducer } });

beforeEach(() => {
  notifications.show.mockClear();
  notifications.hide.mockClear();
});

describe('queueSong', () => {
  it('with nothing playing, starts the song in the mini bar as a fresh queue', () => {
    const store = makeStore();
    store.dispatch(setLoadedCategory('Rap'));
    store.dispatch(queueSong('A', v('x'), 'next'));
    const f = store.getState().focus;
    expect(f.current.video).toEqual(v('x'));
    expect(f.current.tier).toBe('A');
    expect(f.upcoming).toEqual([]);
    expect(f.history).toEqual([]);
    expect(f.playerMode).toBe('mini');
    expect(f.focusedCategory).toBe('Rap');
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('with nothing playing and no board loaded, category is null', () => {
    const store = makeStore();
    store.dispatch(queueSong('S', v('x'), 'end'));
    expect(store.getState().focus.focusedCategory).toBeNull();
  });

  describe('while something is playing', () => {
    function playing() {
      const store = makeStore();
      const entries = [
        { tier: 'S', video: v('a') },
        { tier: 'S', video: v('b') },
      ];
      store.dispatch(openFocus({ videoId: 'a', queue: ['a', 'b'], entries, category: 'Rap' }));
      return store;
    }

    it('Play next inserts right after the current song and toasts', () => {
      const store = playing();
      store.dispatch(queueSong('C', v('x', 'Band - Tune (Official Video)'), 'next'));
      const f = store.getState().focus;
      expect(f.current.video.videoId).toBe('a');
      expect(f.upcoming.map((e) => e.video.videoId)).toEqual(['x', 'b']);
      expect(notifications.hide).toHaveBeenCalledWith('queue-feedback');
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'queue-feedback', message: 'Playing next: Tune' })
      );
    });

    it('Add to queue inserts after your own queued songs and toasts', () => {
      const store = playing();
      store.dispatch(queueSong('C', v('x'), 'end'));
      store.dispatch(queueSong('C', v('y'), 'end'));
      expect(store.getState().focus.upcoming.map((e) => e.video.videoId)).toEqual(['x', 'y', 'b']);
      expect(notifications.show).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Added to queue: Song y' }));
    });

    it('does not change the player mode', () => {
      const store = playing();
      store.dispatch(queueSong('C', v('x'), 'next'));
      expect(store.getState().focus.playerMode).toBe('expanded');
    });
  });
});
