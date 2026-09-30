import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import PendingChanges from './PendingChanges';
import { makeStore, renderWithApp } from '../test/render';
import { dragStarted } from '../store/transfersSlice';
import { loadBoard, transferWithFeedback } from '../tierActions';
import { setCurrentCategory } from '../store/viewSlice';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: `Artist - Tune ${videoId}` });

function setup() {
  const store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('a')], A: [] } }));
  store.dispatch(dragStarted({ video: v('a'), fromCategory: 'Rock', fromTier: 'S' }));
  store.dispatch(loadBoard({ category: 'Pop', data: { B: [] } }));
  store.dispatch(transferWithFeedback(store.getState().transfers.drag, 'B'));
  store.dispatch(setCurrentCategory('Pop'));
  const syncChanges = vi.fn();
  const discardChanges = vi.fn();
  renderWithApp(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ syncChanges, discardChanges }} />}>
          <Route path="*" element={<PendingChanges />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { store }
  );
  return { store, syncChanges, discardChanges };
}

describe('PendingChanges with a song moved to another board', () => {
  it('counts the transfer as a staged change', () => {
    setup();
    expect(screen.getByRole('button', { name: /1 change staged/ })).toBeInTheDocument();
  });

  it('the review list shows both boards and tiers', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /1 change staged/ }));
    expect(await screen.findByText('Tune a')).toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
    expect(screen.getByText('Pop')).toBeInTheDocument();
  });

  it('"Keep in Rock" takes the transfer back', async () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole('button', { name: /1 change staged/ }));
    const keep = await screen.findByRole('button', { name: /Keep in Rock/ });
    act(() => fireEvent.click(keep));
    await waitFor(() => expect(store.getState().transfers.list).toEqual([]));
    expect(store.getState().tiers.tierItems.B).toEqual([]);
  });

  it('Push sends it (for the open board)', () => {
    const { syncChanges } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Push to YouTube/ }));
    expect(syncChanges).toHaveBeenCalledWith('Pop');
  });

  it('Shift+P pushes too', () => {
    const { syncChanges } = setup();
    fireEvent.keyDown(window, { key: 'P' });
    expect(syncChanges).toHaveBeenCalledWith('Pop');
  });
});
