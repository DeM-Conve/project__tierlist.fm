import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useWorkbenchKeys } from './useWorkbenchKeys';
import { makeStore, renderWithApp } from '../test/render';
import { moveVideoToTier, resetTierBoard, setTierForCategory } from '../store/tiersSlice';
import { setSidebarCollapsed } from '../store/viewSlice';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

function Where() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function setup({ narrow = false } = {}) {
  function Keys() {
    useWorkbenchKeys({ narrow });
    return null;
  }
  const store = makeStore();
  renderWithApp(
    <MemoryRouter>
      <Keys />
      <Where />
    </MemoryRouter>,
    { store }
  );
  return store;
}

// Mantine's useHotkeys listens on <html>.
const press = (key, mods = {}) => fireEvent.keyDown(document.documentElement, { key, ctrlKey: true, ...mods });

function withOneMove(store) {
  act(() => {
    store.dispatch(resetTierBoard({ presentTiers: ['S', 'A'] }));
    store.dispatch(setTierForCategory({ tier: 'S', videos: [{ videoId: 'a', title: 'A' }] }));
    store.dispatch(setTierForCategory({ tier: 'A', videos: [] }));
    store.dispatch(moveVideoToTier({ fromTier: 'S', toTier: 'A', videoId: 'a' }));
  });
}
const inA = (store) => store.getState().tiers.tierItems.A.map((v) => v.videoId);

describe('useWorkbenchKeys undo / redo', () => {
  it('Ctrl+Z undoes, Ctrl+Shift+Z redoes', () => {
    const store = setup();
    withOneMove(store);
    press('z');
    expect(inA(store)).toEqual([]);
    press('Z', { shiftKey: true });
    expect(inA(store)).toEqual(['a']);
  });

  it('Ctrl+Y redoes too', () => {
    const store = setup();
    withOneMove(store);
    press('z');
    press('y');
    expect(inA(store)).toEqual(['a']);
  });

  it('Cmd works as the modifier on a Mac', () => {
    const store = setup();
    withOneMove(store);
    press('z', { ctrlKey: false, metaKey: true });
    press('z', { ctrlKey: false, metaKey: true, shiftKey: true });
    expect(inA(store)).toEqual(['a']);
  });
});

describe('useWorkbenchKeys panel views', () => {
  it('Ctrl+Shift+E shows the Tier lists view, opening a closed panel', () => {
    const store = setup();
    act(() => {
      store.dispatch(setSidebarCollapsed(true));
    });
    press('E', { shiftKey: true });
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'boards' });
    // Pressed again it keeps the view open (unlike clicking its icon).
    press('E', { shiftKey: true });
    expect(store.getState().view.sidebarCollapsed).toBe(false);
  });

  it('Ctrl+Shift+F shows the Playlists view', () => {
    const store = setup();
    press('F', { shiftKey: true });
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'playlists' });
  });

  it('Ctrl+Shift+D shows the Duels view (VS Code’s Run and Debug key)', () => {
    const store = setup();
    act(() => {
      store.dispatch(setSidebarCollapsed(true));
    });
    press('D', { shiftKey: true });
    expect(store.getState().view).toMatchObject({ sidebarCollapsed: false, sidebarView: 'duels' });
  });

  it('on a phone the view keys open the drawer', () => {
    const store = setup({ narrow: true });
    press('F', { shiftKey: true });
    expect(store.getState().view).toMatchObject({ mobileSidebarOpen: true, sidebarView: 'playlists' });
  });

  it('Ctrl+B still folds the panel', () => {
    const store = setup();
    press('b');
    expect(store.getState().view.sidebarCollapsed).toBe(true);
  });
});

describe('useWorkbenchKeys Ctrl+,', () => {
  it('opens Settings', () => {
    setup();
    press(',');
    expect(screen.getByTestId('path').textContent).toBe('/settings');
  });
});
