import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { ContextMenuProvider } from 'mantine-contextmenu';
import TierFocusView, { TRACK_ROW_HEIGHT } from './TierFocusView';
import { CanvasContext } from '../layout/canvas';
import { makeStore, renderWithApp } from '../test/render';
import { loadBoard } from '../tierActions';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// jsdom has no DragEvent; a MouseEvent subclass carries clientY (Testing
// Library attaches the dataTransfer).
beforeAll(() => {
  if (!window.DragEvent) window.DragEvent = class DragEvent extends MouseEvent {};
});

const NAMING = { template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
const playlists = ['S', 'A'].map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 1 }));
const songs = (n) => Array.from({ length: n }, (_, i) => ({ videoId: `S${i}`, id: `item-S${i}`, title: `Band - Song S${i}` }));
const CANVAS_HEIGHT = 600;

function Page() {
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const noop = () => {};
  return (
    <TierFocusView
      category="Rock"
      tier="S"
      tiers={['S', 'A']}
      tierItems={tierItems}
      loading={false}
      playingVideoId={null}
      pendingRemovalKeys={new Set()}
      onPlay={noop}
      onPlayFrom={noop}
      onShuffle={noop}
      onBack={noop}
      onSwitchTier={noop}
    />
  );
}

// A 600px canvas (the scroll container) over a 500-song tier.
function renderPage(n = 500) {
  const store = makeStore({ playlists, naming: NAMING });
  store.dispatch(loadBoard({ category: 'Rock', data: { S: songs(n), A: [] } }));
  const canvasEl = document.createElement('div');
  Object.defineProperty(canvasEl, 'offsetHeight', { configurable: true, value: CANVAS_HEIGHT });
  Object.defineProperty(canvasEl, 'offsetWidth', { configurable: true, value: 1000 });
  document.body.appendChild(canvasEl);
  renderWithApp(
    <ContextMenuProvider>
      <CanvasContext.Provider value={{ ref: { current: canvasEl }, height: CANVAS_HEIGHT }}>
        <Page />
      </CanvasContext.Provider>
    </ContextMenuProvider>,
    { store }
  );
  return store;
}

const renderedRows = () => document.querySelectorAll('.track-row[data-video-id]');
const list = () => renderedRows()[0].parentElement.parentElement;
const order = (store) => store.getState().tiers.tierItems.S.map((v) => v.videoId);

// Drag `videoId`'s row and drop it on the list at a y offset (the list sits
// at y=0 in jsdom, so clientY is the offset inside it).
function dragAndDrop(videoId, clientY) {
  const row = document.querySelector(`.track-row[data-video-id="${videoId}"]`);
  const data = {};
  const dataTransfer = { setData: (k, v) => (data[k] = v), getData: (k) => data[k] ?? '', effectAllowed: '' };
  fireEvent.dragStart(row, { dataTransfer });
  fireEvent.dragOver(list(), { dataTransfer, clientY });
  fireEvent.drop(list(), { dataTransfer, clientY });
}

describe('TierFocusView - a long tier is virtualized', () => {
  it('renders only a window of rows, not all 500', () => {
    renderPage(500);
    const n = renderedRows().length;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(40);
    expect(screen.getByText('500 videos · ranked top to bottom')).toBeInTheDocument();
    // The list is as tall as every row, so the canvas scrolls the whole tier.
    expect(list().style.height).toBe(`${500 * TRACK_ROW_HEIGHT}px`);
  });

  it('a drop lands at the slot under the pointer', () => {
    const store = renderPage(500);
    // Top half of the 4th row -> before it: S0 ends up third (index 2 after
    // leaving index 0).
    act(() => dragAndDrop('S0', TRACK_ROW_HEIGHT * 3 + 10));
    expect(order(store).slice(0, 4)).toEqual(['S1', 'S2', 'S0', 'S3']);
  });

  it('while filtered, a drop maps back to the real position in the tier', () => {
    const store = renderPage(500);
    fireEvent.change(screen.getByPlaceholderText('Filter S…'), { target: { value: 'S49' } });
    // Matches: S49, S490..S499. Rows render top to bottom in that order.
    expect([...renderedRows()].map((r) => r.dataset.videoId).slice(0, 2)).toEqual(['S49', 'S490']);
    // Lower half of the first match (S49) -> just before S490.
    act(() => dragAndDrop('S49', TRACK_ROW_HEIGHT * 0.75));
    expect(order(store).indexOf('S49')).toBe(489);
    expect(order(store)[490]).toBe('S490');
  });

  it('shows one drop line, at the hovered slot, without rendering every row', () => {
    renderPage(500);
    const row = document.querySelector('.track-row[data-video-id="S0"]');
    const dataTransfer = { setData: () => {}, getData: () => '', effectAllowed: '' };
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragOver(list(), { dataTransfer, clientY: TRACK_ROW_HEIGHT * 5 + 40 });
    const lines = screen.getAllByTestId('drop-indicator');
    expect(lines).toHaveLength(1);
    expect(lines[0].dataset.index).toBe('6');
  });
});
