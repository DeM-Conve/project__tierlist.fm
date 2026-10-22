import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ContextMenuProvider } from 'mantine-contextmenu';
import TierBoardView from './TierBoardView';
import { CanvasContext } from '../layout/canvas';
import { makeStore, renderWithApp } from '../test/render';
import { loadBoard, moveWithFeedback } from '../tierActions';
import { discardTierChanges } from '../store/tiersSlice';
import { selectPendingMoves, selectTierGroups } from '../store/selectors';
import { songLabel } from '../tierUtils';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
// songLabel runs once per tile render: counting its calls counts tile renders.
vi.mock('../tierUtils', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, songLabel: vi.fn(mod.songLabel) };
});
// jsdom has no DragEvent; a MouseEvent subclass carries clientX/Y.
beforeAll(() => {
  if (!window.DragEvent) window.DragEvent = class DragEvent extends MouseEvent {};
});
// jsdom has no layout: every row reports 1300px wide and the header/footer
// 0px tall, so the board's fit maths runs against a known screen.
vi.mock('@mantine/hooks', async (importOriginal) => ({
  ...(await importOriginal()),
  useElementSize: () => ({ ref: { current: null }, width: 1300, height: 0 }),
}));

const NAMING = { template: '{category} {tier}', tierLabels: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' } };
const TIERS = ['S', 'A', 'B', 'C', 'D', 'TODO'];
const playlists = TIERS.map((t) => ({ id: `pl-${t}`, title: `Rock ${t}`, itemCount: 30 }));
const songs = (tier, n) => Array.from({ length: n }, (_, i) => ({ videoId: `${tier}${i}`, id: `item-${tier}${i}`, title: `Band - Song ${tier}${i}` }));
const data = Object.fromEntries(TIERS.map((t) => [t, songs(t, 30)]));

function Board({ boardLoading = false, handlers = {}, playingVideoId = null }) {
  const tierGroups = useSelector(selectTierGroups);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const tierLoading = useSelector((s) => s.tiers.tierLoading);
  const pendingMoves = useSelector(selectPendingMoves);
  const noop = () => {};
  return (
    <TierBoardView
      category="Rock"
      tierGroups={tierGroups}
      tierItems={tierItems}
      tierLoading={tierLoading}
      boardLoading={boardLoading}
      playingVideoId={playingVideoId}
      pendingMoves={pendingMoves}
      onPlay={noop}
      onPlayFrom={noop}
      onShufflePlay={noop}
      onStartDuel={noop}
      onOpenTier={noop}
      onAddMissingTiers={noop}
      onRenameBoard={noop}
      {...handlers}
    />
  );
}

// A 700px canvas: six rows only just fit at the full 88px tile size - the
// case where taking the bar's 80px out of the room shrank every tile.
function renderBoard(height = 700, { loading = false, handlers, boardData = data, playingVideoId = null } = {}) {
  // Loading: the playlists list hasn't arrived, so not even the tiers are known.
  const store = makeStore({ playlists: loading ? [] : playlists, naming: NAMING });
  if (!loading) store.dispatch(loadBoard({ category: 'Rock', data: boardData }));
  const canvas = { ref: { current: document.createElement('div') }, height };
  renderWithApp(
    <MemoryRouter>
      <ContextMenuProvider>
        <CanvasContext.Provider value={canvas}>
          <Board boardLoading={loading} handlers={handlers} playingVideoId={playingVideoId} />
        </CanvasContext.Provider>
      </ContextMenuProvider>
    </MemoryRouter>,
    { store }
  );
  return store;
}
// Mantine writes sizes as rem: "calc(5.5rem * var(--mantine-scale))" = 88px.
const tileWidth = () => {
  const css = document.querySelector('.tile[data-video-id="S0"]').style.width;
  const m = /([\d.]+)rem/.exec(css);
  return m ? Math.round(Number(m[1]) * 16) : Number.parseFloat(css);
};
const hiddenCount = () => screen.getAllByText(/^\+\d+$/).map((n) => n.textContent);

describe('TierBoardView - the staged-changes bar never resizes the board', () => {
  // An empty tier holds a full tile line (the user's call): dropping the
  // first song in, or dragging the last one out, must not move anything.
  // Empty tiers used to collapse to a slim drop zone - every drop into one
  // changed the tile size and every row's height - and the expand column
  // still held them a tile tall, so the board overflowed into a scroll bar.
  const rowHeights = (tier) => {
    const row = screen.getByRole('button', { name: `Open ${tier}` }).parentElement;
    return [...row.querySelectorAll('[style*="height"]')]
      .map((el) => /(?:^|;)\s*height:\s*calc\(([\d.]+)rem/.exec(el.getAttribute('style')))
      .filter(Boolean)
      .map((m) => Math.round(Number(m[1]) * 16));
  };

  it('an empty tier is a full tile line: its drop zone and expand column are a tile tall', () => {
    renderBoard(700, { boardData: { ...data, D: [] } });
    const size = tileWidth();
    expect(screen.getByText('Empty - drop videos here').parentElement).toHaveStyle({ height: `calc(${size / 16}rem * var(--mantine-scale))` });
    expect(rowHeights('D').length).toBeGreaterThan(0);
    rowHeights('D').forEach((h) => expect(h).toBe(size));
  });

  it('emptying a tier changes neither the tile size nor how many songs each row shows', () => {
    // A short screen, where the tiles shrink to fit: freeing a row's room
    // used to grow every tile.
    renderBoard(600);
    const full = { size: tileWidth(), more: hiddenCount() };
    cleanup();
    renderBoard(600, { boardData: { ...data, D: [] } });
    expect(tileWidth()).toBe(full.size);
    // D's own "+N" is gone with its songs; every other row shows the same.
    expect(hiddenCount()).toEqual(full.more.slice(0, -2).concat(full.more.slice(-1)));
  });

  // The playing song past a row's "+N" fold used to be out of sight on the
  // board - nothing to see or drag. It takes the row's last visible slot.
  const rowTiles = (tier) => [...document.querySelectorAll(`.tile[data-tier="${tier}"]`)].map((t) => t.dataset.videoId);
  it('the playing song is never folded behind "+N": it takes the last visible slot', () => {
    renderBoard(700);
    const before = rowTiles('TODO');
    expect(before).not.toContain('TODO25');
    cleanup();

    renderBoard(700, { playingVideoId: 'TODO25' });
    const after = rowTiles('TODO');
    expect(after).toHaveLength(before.length);
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(after.at(-1)).toBe('TODO25');
    // "+N" still counts what isn't shown.
    expect(hiddenCount().at(-1)).toBe(`+${30 - after.length}`);
  });

  it('a playing song already in view stays where it is', () => {
    renderBoard(700);
    const before = rowTiles('TODO');
    cleanup();
    renderBoard(700, { playingVideoId: before[1] });
    expect(rowTiles('TODO')).toEqual(before);
  });

  // The board isn't virtualized: a big one is hundreds of covers at once.
  it('cover art loads lazily, only near the screen, and decodes off the main thread', () => {
    renderBoard();
    const covers = document.querySelectorAll('.tile img');
    expect(covers.length).toBeGreaterThan(0);
    covers.forEach((img) => {
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('decoding', 'async');
    });
  });

  it('tile size and "+N" stay the same when a change is staged', () => {
    const store = renderBoard();
    const before = { width: tileWidth(), hidden: hiddenCount() };
    expect(before.width).toBe(88);

    act(() => {
      store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 'TODO0' }], { quiet: true }));
    });
    expect(selectPendingMoves(store.getState())).toHaveLength(1);
    expect(tileWidth()).toBe(before.width);
    // Same number of hidden songs per row (the moved song aside).
    expect(hiddenCount().length).toBe(before.hidden.length);
  });

  it('...and when the change is discarded again', () => {
    const store = renderBoard();
    const before = tileWidth();
    act(() => {
      store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 'TODO0' }], { quiet: true }));
    });
    act(() => {
      store.dispatch(discardTierChanges());
    });
    expect(tileWidth()).toBe(before);
  });

  it('a genuinely short screen still shrinks the tiles (the fit itself still works)', () => {
    renderBoard(560);
    expect(tileWidth()).toBeLessThan(88);
    expect(tileWidth()).toBeGreaterThanOrEqual(60);
  });

  it('the board keeps room to scroll the last row clear of the bar', () => {
    const store = renderBoard();
    const section = document.querySelector('section');
    const padBefore = section.style.paddingBottom;
    act(() => {
      store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 'TODO0' }], { quiet: true }));
    });
    expect(section.style.paddingBottom).not.toBe(padBefore);
  });
});

describe('TierBoardView - the loading board is the real board, loading', () => {
  it('draws the same ranked tier rows (labels, tile size, full line of tiles) before the tiers are known', () => {
    renderBoard();
    const loadedRows = TIERS.filter((t) => t !== 'TODO').map((t) => !!screen.queryByRole('button', { name: `Open ${t}` }));
    const loadedTile = tileWidth();
    cleanup();

    renderBoard(700, { loading: true });
    expect(screen.getByText('Loading videos…')).toBeInTheDocument();
    expect(TIERS.filter((t) => t !== 'TODO').map((t) => !!screen.queryByRole('button', { name: `Open ${t}` }))).toEqual(loadedRows);
    // Each row's skeleton tiles are the loaded tile size.
    const row = screen.getByRole('button', { name: 'Open S' }).parentElement;
    const tiles = row.querySelectorAll('.mantine-Skeleton-root');
    expect(tiles.length).toBeGreaterThan(1);
    const m = /([\d.]+)rem/.exec(tiles[0].style.width);
    expect(m ? Math.round(Number(m[1]) * 16) : Number.parseFloat(tiles[0].style.width)).toBe(loadedTile);
  });
});

describe('TierBoardView - header buttons and their keys', () => {
  const press = (key, init = {}) => {
    const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
    fireEvent.keyDown(document.body, { key, code, ...init });
    fireEvent.keyUp(document.body, { key, code, ...init });
  };
  const setup = () => {
    const handlers = { onStartDuel: vi.fn(), onPlayFrom: vi.fn(), onShufflePlay: vi.fn() };
    renderBoard(700, { handlers });
    return handlers;
  };

  it('has no Triage button (the TODO row\'s own play button triages)', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Triage/ })).toBeNull();
    expect(screen.getByLabelText(/Triage: play and rate/)).toBeInTheDocument();
  });

  it('prints each key on its button, the way Find shows /', () => {
    setup();
    expect(screen.getByRole('button', { name: /Find/ })).toHaveAttribute('aria-keyshortcuts', '/');
    expect(screen.getByRole('button', { name: /Duel/ })).toHaveTextContent('d');
    expect(screen.getByRole('button', { name: /Duel/ })).toHaveAttribute('aria-keyshortcuts', 'd');
    expect(screen.getByRole('button', { name: /^Play/ })).toHaveAttribute('aria-keyshortcuts', 'p');
    expect(screen.getByRole('button', { name: 'Shuffle play' })).toHaveAttribute('aria-keyshortcuts', 's');
  });

  it('d duels, p plays the whole board, s shuffles it', () => {
    const h = setup();
    press('d');
    expect(h.onStartDuel).toHaveBeenCalledTimes(1);
    press('p');
    expect(h.onPlayFrom).toHaveBeenCalledWith(null);
    press('s');
    expect(h.onShufflePlay).toHaveBeenCalledTimes(1);
  });

  it('leaves Shift+P (push), Ctrl+D (half page) and Ctrl+S alone', () => {
    const h = setup();
    press('P', { shiftKey: true });
    press('d', { ctrlKey: true });
    press('s', { ctrlKey: true });
    expect(h.onPlayFrom).not.toHaveBeenCalled();
    expect(h.onStartDuel).not.toHaveBeenCalled();
    expect(h.onShufflePlay).not.toHaveBeenCalled();
  });

  it('is not the second key of a Vim sequence (gd, gp, gs navigate)', () => {
    const h = setup();
    for (const key of ['d', 'p', 's']) {
      press('g');
      press(key);
    }
    expect(h.onStartDuel).not.toHaveBeenCalled();
    expect(h.onPlayFrom).not.toHaveBeenCalled();
    expect(h.onShufflePlay).not.toHaveBeenCalled();
  });

  it('is ignored while typing in a text box', () => {
    const h = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    for (const key of ['d', 'p', 's']) {
      fireEvent.keyDown(input, { key, code: `Key${key.toUpperCase()}` });
      fireEvent.keyUp(input, { key, code: `Key${key.toUpperCase()}` });
    }
    input.remove();
    expect(h.onStartDuel).not.toHaveBeenCalled();
    expect(h.onPlayFrom).not.toHaveBeenCalled();
    expect(h.onShufflePlay).not.toHaveBeenCalled();
  });
});

// A drag on the board: every tile row is a drop target, the drop slot is the
// one under the pointer among the tiles shown. jsdom has no layout (every
// rect is 0x0 at 0,0): clientY -1 is "above every tile" -> slot 0.
function dataTransfer() {
  const data = {};
  return { setData: (k, val) => (data[k] = val), getData: (k) => data[k] ?? '', effectAllowed: '', types: [] };
}
const rowOf = (tier) => screen.getByRole('button', { name: `Open ${tier}` }).parentElement;
const tile = (videoId) => document.querySelector(`.tile[data-video-id="${videoId}"]`);
const order = (store, tier) => store.getState().tiers.tierItems[tier].map((v) => v.videoId);

describe('TierBoardView - drag and drop', () => {
  it('a drop lands at the slot under the pointer', () => {
    const store = renderBoard();
    const dt = dataTransfer();
    fireEvent.dragStart(tile('A0'), { dataTransfer: dt });
    fireEvent.dragOver(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: -1 });
    fireEvent.drop(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: -1 });
    expect(order(store, 'S').slice(0, 2)).toEqual(['A0', 'S0']);
  });

  // While searching a row shows only its matches: the slot used to be taken
  // as a position in the whole tier - a drop before the match S5 put the song
  // at the top of S instead.
  it('while searching, a drop before a match lands before that song in the tier', () => {
    const store = renderBoard();
    fireEvent.keyDown(window, { key: '/' });
    fireEvent.change(screen.getByPlaceholderText('/search titles...'), { target: { value: '/Song S5' } });
    expect([...rowOf('S').querySelectorAll('.tile')].map((t) => t.dataset.videoId)).toEqual(['S5']);
    const dt = dataTransfer();
    dt.setData('application/json', JSON.stringify({ videoId: 'A0', fromTier: 'A' }));
    fireEvent.drop(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: -1 });
    expect(order(store, 'S').indexOf('A0')).toBe(5);
    expect(order(store, 'S')[6]).toBe('S5');
  });

  it('...and one after the last match lands right after it', () => {
    const store = renderBoard();
    fireEvent.keyDown(window, { key: '/' });
    fireEvent.change(screen.getByPlaceholderText('/search titles...'), { target: { value: '/Song S5' } });
    const dt = dataTransfer();
    dt.setData('application/json', JSON.stringify({ videoId: 'A0', fromTier: 'A' }));
    // Below every tile -> after the last one shown.
    fireEvent.drop(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: 5 });
    expect(order(store, 'S').indexOf('A0')).toBe(6);
  });

  it('a drop on "+N" appends to the tier', () => {
    const store = renderBoard();
    const dt = dataTransfer();
    dt.setData('application/json', JSON.stringify({ videoId: 'A0', fromTier: 'A' }));
    const more = within(rowOf('S')).getByRole('button', { name: /^Show all/ });
    fireEvent.drop(more, { dataTransfer: dt, clientX: 0, clientY: -1 });
    expect(order(store, 'S').at(-1)).toBe('A0');
  });

  it('the insertion bar floats over the gap: it adds nothing to the row\'s flow', () => {
    renderBoard();
    const row = rowOf('S');
    const before = [...row.querySelectorAll('.tile')].map((t) => t.dataset.videoId);
    const dt = dataTransfer();
    fireEvent.dragStart(tile('A0'), { dataTransfer: dt });
    fireEvent.dragOver(row, { dataTransfer: dt, clientX: 0, clientY: -1 });
    const bar = screen.getByTestId('drop-indicator');
    expect(bar.style.position).toBe('absolute');
    expect([...row.querySelectorAll('.tile')].map((t) => t.dataset.videoId)).toEqual(before);
    fireEvent.dragLeave(row, { dataTransfer: dt, relatedTarget: document.body });
    expect(screen.queryByTestId('drop-indicator')).toBeNull();
  });
});

// A board of 333 / 142 / 87 songs (the user's biggest) must drag smoothly:
// a drag start, a hover over a row and every new slot under the pointer
// used to redraw every tile on the board (TierTile wasn't memoized and got
// new handlers every render).
describe('TierBoardView - a drag redraws only the tiles it changes', () => {
  const big = { ...data, S: songs('S', 333), A: songs('A', 142), B: songs('B', 87) };
  const tileRenders = () => songLabel.mock.calls.length;

  it('drag start redraws only the dragged tile; hovering rows and slots redraws none', () => {
    const store = renderBoard(700, { boardData: big });
    // Expand the 333-song tier: every one of its tiles is on the page.
    fireEvent.click(screen.getByRole('button', { name: 'Expand S' }));
    expect(rowOf('S').querySelectorAll('.tile')).toHaveLength(333);
    const dt = dataTransfer();

    songLabel.mockClear();
    fireEvent.dragStart(tile('S10'), { dataTransfer: dt });
    expect(store.getState().tiers.draggedVideoId).toBe('S10');
    expect(tileRenders()).toBeLessThanOrEqual(1);

    songLabel.mockClear();
    fireEvent.dragOver(rowOf('A'), { dataTransfer: dt, clientX: 0, clientY: -1 });
    fireEvent.dragOver(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: -1 });
    fireEvent.dragOver(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: 5 });
    fireEvent.dragOver(rowOf('S'), { dataTransfer: dt, clientX: 0, clientY: 5 });
    expect(tileRenders()).toBe(0);

    songLabel.mockClear();
    fireEvent.dragEnd(tile('S10'), { dataTransfer: dt });
    expect(tileRenders()).toBeLessThanOrEqual(1);
  });
});
