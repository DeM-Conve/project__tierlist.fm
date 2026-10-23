// Cross-feature journeys around the player (docs/qa-pass.md section 7): the
// real App over the fake YouTube (src/test/syncHarness.jsx). Play from one
// board, browse to another board / Home / Settings / a duel page, drive the
// player (keys, rail, queue) - and check at every step that the player, the
// Tier Rail, the boards and every count on screen tell the same story.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { minimizePlayer } from './store/focusSlice';
import { selectFocusedAvailableTiers, selectPlayingSong } from './store/selectors';
import { BOARD_TIERS, REMOVED_TIER, TIER_ORDER } from './tiers';

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));

const ACCOUNT = {
  'Rap S': ['a', 'b', 'c'],
  'Rap A': ['d', 'e'],
  'Rap B': ['f'],
  'Rap C': [],
  'Rap D': ['g'],
  'Rap TODO': ['h', 'i', 'j'],
  'Pop S': ['p', 'q'],
  'Pop A': ['r'],
  'Pop TODO': ['s'],
};

let yt;
let h;
async function start(account = ACCOUNT, board = 'Rap') {
  yt = new FakeYoutube(account);
  h = await mountApp(yt);
  await h.open(board);
  return h;
}
afterEach(() => vi.clearAllMocks());
// jsdom has no scrolling (the queue panel keeps the playing row in view).
Element.prototype.scrollTo ??= () => {};

// ---- driving the app -------------------------------------------------------

// The board page's own play actions (the Layout's outlet context: a tile
// click, a tier's Play, Shuffle, the TODO row's Triage).
async function playTile(videoId) {
  const tier = h.tierOf(videoId);
  await act(async () => h.probe().ctx.openFocus(tier, videoId));
  h.dispatch(minimizePlayer());
}
async function playTier(tier) {
  await act(async () => h.probe().ctx.playFrom(tier));
  h.dispatch(minimizePlayer());
}

function key(k, init = {}) {
  act(() => {
    fireEvent.keyDown(window, { key: k, ...init });
  });
}
const next = () => key('l');
const prev = () => key('h');
// Shift+digit rates the playing song (the dock's own key handler).
const rateKey = (n) => key(String(n), { shiftKey: true, code: `Digit${n}` });

async function goto(path) {
  await act(async () => h.navigate(path));
}

// ---- reading what the user sees -------------------------------------------

const focus = () => h.state.focus;
const playingId = () => focus().current?.video.videoId ?? null;

// The Tier Rail as drawn: { mode: 'Rate' | 'Tiers', counts: { tier: n }, playingOn }.
function rail() {
  const tiles = [...document.querySelectorAll('.rail-tier')].filter((el) => el.getAttribute('aria-label') !== 'Remove from playlist');
  if (!tiles.length) return null;
  const box = tiles[0].closest('[class*="Box"]')?.parentElement ?? document;
  const counts = {};
  let playingOn = null;
  for (const el of tiles) {
    const [name, count] = [...el.querySelectorAll('p')].map((p) => p.textContent);
    counts[name] = Number(count);
    if (el.querySelector('[data-playing-art]')) playingOn = name;
  }
  const caption = [...box.querySelectorAll('p')].find((p) => p.textContent === 'Rate' || p.textContent === 'Tiers');
  return { mode: caption?.textContent ?? null, counts, playingOn };
}

// The sidebar's Tier lists: { board: total }.
function sidebarTotals() {
  return Object.fromEntries(
    [...document.querySelectorAll('.board-row')].map((row) => {
      const texts = [...row.querySelectorAll('p')].map((p) => p.textContent);
      return [texts[0], Number(row.querySelector('.board-row-meta').textContent)];
    })
  );
}

// What YouTube holds per board (ranked tiers only - the to-do list is
// counted apart everywhere).
function youtubeTotals() {
  return Object.fromEntries(
    Object.entries(youtubeBoards(yt)).map(([board, tiers]) => [
      board,
      TIER_ORDER.reduce((n, t) => n + (tiers[t]?.length ?? 0), 0),
    ])
  );
}

// The open board as drawn (header "N videos").
function headerTotal() {
  const meta = screen.queryByText(/^\d+ videos · \d+ tiers/);
  return meta ? Number(meta.textContent.match(/^(\d+)/)[1]) : null;
}

// The player's tier (its chips, Shift+digit, the rail's marker) must be
// where the board has the song.
function expectPlayerAgreesWithBoard() {
  const fv = selectPlayingSong(h.state);
  if (!fv || focus().focusedCategory !== h.board) return;
  expect(fv.tier).toBe(h.tierOf(fv.videoId));
}

// ---- journey 1 ---------------------------------------------------------------

describe('journey 1: play from one board, browse, drive the player', () => {
  it('next / prev never leave the player on a stale tier', async () => {
    await start();
    await playTier('S'); // a, b, c
    expect(playingId()).toBe('a');
    // While a plays, b is dragged to D on the board.
    h.move('b', 'D');
    next();
    expect(playingId()).toBe('b');
    expectPlayerAgreesWithBoard();
    expect(rail().playingOn).toBe('D');
    // Rating it from the player now does what it says.
    rateKey(3); // S A B C D -> B
    expect(h.tierOf('b')).toBe('B');
    expectPlayerAgreesWithBoard();
    prev();
    next();
    expectPlayerAgreesWithBoard();
  });

  it('Discard puts the playing song back - and the player with it', async () => {
    await start();
    await playTile('a');
    rateKey(2);
    expect(h.tierOf('a')).toBe('A');
    await h.discard();
    expect(h.tierOf('a')).toBe('S');
    expectPlayerAgreesWithBoard();
    expect(rail().playingOn).toBe('S');
    rateKey(5);
    expect(h.tierOf('a')).toBe('D');
  });
});
