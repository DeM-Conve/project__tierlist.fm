import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useVimKeys } from './useVimKeys';
import { makeStore, renderWithApp } from '../test/render';
import { minimizePlayer, openFocus } from '../store/focusSlice';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const entries = [{ tier: 'S', video: { videoId: 'a', title: 'Song' } }];

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function setup({ canvas = null, path = '/' } = {}) {
  const hintsRef = { current: { open: vi.fn() } };
  const canvasRef = { current: canvas };
  function Keys() {
    useVimKeys({ hintsRef, canvasRef, categories: [], hasTodo: false });
    return null;
  }
  const store = makeStore();
  renderWithApp(
    <MemoryRouter initialEntries={[path]}>
      <Keys />
      <Where />
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

function fakeCanvas() {
  const el = document.createElement('div');
  el.innerHTML = '<input type="checkbox"><input type="text" placeholder="Filter">';
  Object.defineProperty(el, 'clientHeight', { value: 600 });
  el.scrollBy = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe('useVimKeys Ctrl+d / Ctrl+u', () => {
  it('scrolls the canvas half a page down / up', () => {
    const canvas = fakeCanvas();
    setup({ canvas });
    fireEvent.keyDown(document, { key: 'd', code: 'KeyD', ctrlKey: true });
    expect(canvas.scrollBy).toHaveBeenLastCalledWith({ top: 300, behavior: 'smooth' });
    fireEvent.keyDown(document, { key: 'u', code: 'KeyU', ctrlKey: true });
    expect(canvas.scrollBy).toHaveBeenLastCalledWith({ top: -300, behavior: 'smooth' });
  });

  it('plain d / u do not scroll (pages use u for undo)', () => {
    const canvas = fakeCanvas();
    setup({ canvas });
    fireEvent.keyDown(document, { key: 'u', code: 'KeyU' });
    expect(canvas.scrollBy).not.toHaveBeenCalled();
  });

  it('stands down while the full-screen player covers the page', () => {
    const canvas = fakeCanvas();
    const { store } = setup({ canvas });
    act(() => {
      store.dispatch(openFocus({ videoId: 'a', queue: ['a'], entries, category: 'Rap' }));
    });
    fireEvent.keyDown(document, { key: 'd', code: 'KeyD', ctrlKey: true });
    expect(canvas.scrollBy).not.toHaveBeenCalled();
  });
});

describe('useVimKeys g i', () => {
  it('focuses the page’s first text box', () => {
    const canvas = fakeCanvas();
    setup({ canvas });
    fireEvent.keyDown(document, { key: 'g', code: 'KeyG' });
    fireEvent.keyDown(document, { key: 'i', code: 'KeyI' });
    expect(document.activeElement).toBe(canvas.querySelector('input[type=text]'));
  });
});

describe('useVimKeys g u', () => {
  const goUp = () => {
    fireEvent.keyDown(document, { key: 'g', code: 'KeyG' });
    fireEvent.keyDown(document, { key: 'u', code: 'KeyU' });
  };
  it.each([
    ['/tier/Rock/duel', '/tier/Rock'],
    ['/tier/Rock/duel/moves', '/tier/Rock/duel'],
    ['/tier/Rock/duel/done/s1', '/tier/Rock/duel'],
    ['/tier/Rock/duel/play/s1', '/tier/Rock/duel'],
    ['/tier/Rock/t/S', '/tier/Rock'],
    ['/tier/Rock', '/'],
    ['/settings', '/'],
    ['/add', '/'],
  ])('from %s goes up to %s', (from, to) => {
    setup({ path: from });
    goUp();
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${to}$`));
  });

  it('Alt+← (the key on every crumb) goes up the same way', () => {
    setup({ path: '/tier/Rock/duel/moves' });
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/tier\/Rock\/duel$/);
  });

  it('does nothing on Home', () => {
    setup({ path: '/' });
    goUp();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});
