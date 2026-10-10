import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useVimKeys } from './useVimKeys';
import { makeStore, renderWithApp } from '../test/render';
import { minimizePlayer, openFocus } from '../store/focusSlice';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const entries = [{ tier: 'S', video: { videoId: 'a', title: 'Song' } }];

function setup() {
  const hintsRef = { current: { open: vi.fn() } };
  function Keys() {
    useVimKeys({ hintsRef, canvasRef: { current: null }, categories: [], hasTodo: false });
    return null;
  }
  const store = makeStore();
  renderWithApp(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
    { store }
  );
  return { store, open: hintsRef.current.open };
}

describe('useVimKeys f', () => {
  it('opens link hints when the player is not expanded', () => {
    const { open } = setup();
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves f to the expanded player (fullscreen), and takes it back once minimized', () => {
    const { store, open } = setup();
    act(() => {
      store.dispatch(openFocus({ videoId: 'a', queue: ['a'], entries, category: 'Rap' }));
    });
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    expect(open).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(minimizePlayer());
    });
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
