import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ContextMenuProvider } from 'mantine-contextmenu';
import TierBoardView from './TierBoardView';
import { CanvasContext } from '../layout/canvas';
import { makeStore, renderWithApp } from '../test/render';
import { loadBoard, moveWithFeedback } from '../tierActions';
import { discardTierChanges } from '../store/tiersSlice';
import { selectPendingMoves, selectTierGroups } from '../store/selectors';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
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

function Board({ boardLoading = false, handlers = {} }) {
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
      playingVideoId={null}
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
function renderBoard(height = 700, { loading = false, handlers } = {}) {
  // Loading: the playlists list hasn't arrived, so not even the tiers are known.
  const store = makeStore({ playlists: loading ? [] : playlists, naming: NAMING });
  if (!loading) store.dispatch(loadBoard({ category: 'Rock', data }));
  const canvas = { ref: { current: document.createElement('div') }, height };
  renderWithApp(
    <MemoryRouter>
      <ContextMenuProvider>
        <CanvasContext.Provider value={canvas}>
          <Board boardLoading={loading} handlers={handlers} />
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
