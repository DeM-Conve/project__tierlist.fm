import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import PendingChanges from './PendingChanges';
import { makeStore, renderWithApp } from '../test/render';
import { dragStarted } from '../store/transfersSlice';
import { loadBoard, moveWithFeedback, transferWithFeedback } from '../tierActions';
import { setSyncStatus, syncFailuresRecorded } from '../store/tiersSlice';
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
    fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true });
    expect(syncChanges).toHaveBeenCalledWith('Pop');
  });

  it('Shift+P typed into a text box does not push', () => {
    const { syncChanges } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'P', code: 'KeyP', shiftKey: true });
    input.remove();
    expect(syncChanges).not.toHaveBeenCalled();
  });

  it('a bare p, or Shift+P with Ctrl held, does not push', () => {
    const { syncChanges } = setup();
    fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP' });
    fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true, ctrlKey: true });
    expect(syncChanges).not.toHaveBeenCalled();
  });
});

describe('PendingChanges after a push that failed', () => {
  function setupFailed() {
    const store = makeStore();
    store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('a'), v('b')], A: [] } }));
    store.dispatch(setCurrentCategory('Rock'));
    store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'a' }]));
    store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'b' }]));
    store.dispatch(
      syncFailuresRecorded({
        attempted: ['item-a', 'item-b'],
        failures: { 'item-a': { step: 'insert', error: 'Your YouTube quota for today is used up.' } },
      })
    );
    store.dispatch(setSyncStatus('partial'));
    renderWithApp(
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ syncChanges: vi.fn(), discardChanges: vi.fn() }} />}>
            <Route path="*" element={<PendingChanges />} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { store }
    );
    return store;
  }

  it('the bar says how many failed and the review list says why, next to that song', async () => {
    setupFailed();
    fireEvent.click(screen.getByRole('button', { name: /1 failed/ }));
    expect(await screen.findByText(/Couldn’t add it to A: Your YouTube quota for today is used up\./)).toBeInTheDocument();
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });

  it('putting the failed change back clears it', async () => {
    const store = setupFailed();
    act(() => store.dispatch(moveWithFeedback([{ fromTier: 'A', toTier: 'S', videoId: 'a' }])));
    await waitFor(() => expect(screen.queryByRole('button', { name: /failed/ })).not.toBeInTheDocument());
  });
});
