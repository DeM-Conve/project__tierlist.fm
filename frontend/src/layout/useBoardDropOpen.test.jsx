import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { OPEN_DELAY_MS, useBoardDropOpen } from './useBoardDropOpen';
import { makeStore } from '../test/render';
import { dragEnded, dragStarted } from '../store/transfersSlice';
import { loadBoard, moveWithFeedback } from '../tierActions';

const show = vi.fn();
vi.mock('@mantine/notifications', () => ({ notifications: { show: (...a) => show(...a), hide: vi.fn() } }));

function Entry({ category }) {
  const { hovering, handlers } = useBoardDropOpen(category);
  return (
    <div data-testid={category} data-hovering={hovering} {...handlers}>
      {category}
    </div>
  );
}
function Where() {
  return <span data-testid="path">{decodeURIComponent(useLocation().pathname)}</span>;
}
function setup() {
  const store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: { S: [{ videoId: 'a', id: 'i-a' }], A: [] } }));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/tier/Rock']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <Entry category="Rock" />
                <Entry category="Pop Hits" />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
}
const drag = (store) =>
  act(() => {
    store.dispatch(dragStarted({ video: { videoId: 'a', id: 'i-a' }, fromCategory: 'Rock', fromTier: 'S' }));
  });

beforeEach(() => {
  vi.useFakeTimers();
  show.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useBoardDropOpen', () => {
  it('holding a dragged song over another board opens it after the delay', () => {
    const store = setup();
    drag(store);
    fireEvent.dragEnter(screen.getByTestId('Pop Hits'));
    expect(screen.getByTestId('Pop Hits').dataset.hovering).toBe('true');
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS - 1));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Pop Hits');
  });

  it('dragenter firing again over child elements does not restart the delay', () => {
    const store = setup();
    drag(store);
    const pop = screen.getByTestId('Pop Hits');
    fireEvent.dragEnter(pop);
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS / 2));
    fireEvent.dragEnter(pop);
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS / 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Pop Hits');
  });

  it('moving off the board before the delay cancels', () => {
    const store = setup();
    drag(store);
    const pop = screen.getByTestId('Pop Hits');
    fireEvent.dragEnter(pop);
    fireEvent.dragLeave(pop, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
    expect(pop.dataset.hovering).toBe('false');
  });

  it('letting go on the board name opens nothing and moves nothing', () => {
    const store = setup();
    drag(store);
    const pop = screen.getByTestId('Pop Hits');
    fireEvent.dragEnter(pop);
    fireEvent.drop(pop);
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
    expect(store.getState().transfers.list).toEqual([]);
  });

  it('does nothing without a song being dragged', () => {
    setup();
    fireEvent.dragEnter(screen.getByTestId('Pop Hits'));
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
    expect(screen.getByTestId('Pop Hits').dataset.hovering).toBe('false');
  });

  it('the open board itself is not a target', () => {
    const store = setup();
    drag(store);
    fireEvent.dragEnter(screen.getByTestId('Rock'));
    expect(screen.getByTestId('Rock').dataset.hovering).toBe('false');
  });

  it('ending the drag clears the hover and the timer', () => {
    const store = setup();
    drag(store);
    fireEvent.dragEnter(screen.getByTestId('Pop Hits'));
    act(() => {
      store.dispatch(dragEnded());
    });
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
  });

  it('with staged moves on the open board it explains instead of opening (they would be lost)', () => {
    const store = setup();
    act(() => {
      store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'A', videoId: 'a' }], { quiet: true }));
    });
    drag(store);
    fireEvent.dragEnter(screen.getByTestId('Pop Hits'));
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS * 2));
    expect(screen.getByTestId('path').textContent).toBe('/tier/Rock');
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Push or discard the 1 staged change on Rock/) }));
  });
});
