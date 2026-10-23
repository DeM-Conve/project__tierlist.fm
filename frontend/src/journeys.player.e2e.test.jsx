// Cross-feature journeys around the player (docs/qa-pass.md section 7): the
// real App over the fake YouTube (src/test/syncHarness.jsx). Play from one
// board, browse to another board / Home / Settings / a duel page, drive the
// player (keys, rail, queue) - and check at every step that the player, the
// Tier Rail, the boards and every count on screen tell the same story.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { minimizePlayer } from './store/focusSlice';
import { queueSong } from './queueActions';
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

// A Home board card as drawn: { total, counts: { tier: n } }.
function homeCard(board) {
  const card = screen.getByRole('button', { name: `Open ${board}` });
  const texts = [...card.querySelectorAll('p')].map((p) => p.textContent);
  const counts = {};
  for (let i = 2; i + 1 < texts.length; i += 2) counts[texts[i]] = Number(texts[i + 1]);
  return { total: Number(texts[1].match(/^(\d+)/)[1]), counts };
}

// What YouTube holds for a board, per tier.
function youtubeCounts(board) {
  const tiers = youtubeBoards(yt)[board] || {};
  return Object.fromEntries(Object.entries(tiers).map(([t, ids]) => [t, ids.length]));
}

// The loaded board's draft, per tier (what the board and the rail show).
function boardCounts() {
  return Object.fromEntries(BOARD_TIERS.filter((t) => h.tierItems()[t]).map((t) => [t, h.tierItems()[t].length]));
}

// The text of the last edit toast (tierActions' showToast).
function lastToast() {
  const calls = notifications.show.mock.calls;
  if (!calls.length) return null;
  const text = (node) =>
    node == null || typeof node === 'boolean' ? '' : typeof node === 'string' || typeof node === 'number' ? String(node)
      : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  const { message } = calls.at(-1)[0];
  return text(message);
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

  it('a song queued from another board is that board\'s song when it plays', async () => {
    await start();
    await playTile('a');
    await h.open('Pop');
    // Pop's song menu: Play next.
    const p = h.tierItems().S.find((v) => v.videoId === 'p');
    h.dispatch(queueSong('S', p, 'next'));
    next();
    expect(playingId()).toBe('p');
    // On Pop the playing song is Pop's: the rail rates it, the keys rate it.
    expect(focus().focusedCategory).toBe('Pop');
    expect(rail().mode).toBe('Rate');
    rateKey(2);
    expect(h.tierOf('p')).toBe('A');
    // Back on Rap's song: Pop's player controls are gone again.
    prev();
    expect(playingId()).toBe('a');
    expect(selectFocusedAvailableTiers(h.state)).toEqual([]);
    expect(rail().mode).toBe('Tiers');
  });
});

describe('journey 1: triage keeps going wherever you rate from', () => {
  it('rail on Home, Shift+digit on Settings, Del on the duel hub, skip with l', async () => {
    await start();
    await playTier('TODO'); // triage: h, i, j
    expect(focus().isTriage).toBe(true);
    expect(playingId()).toBe('h');

    await h.goHome();
    expect(rail().mode).toBe('Rate');
    expect(rail().playingOn).toBe('TODO');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Rate "Song h" → A$/ }));
    });
    expect(h.tierOf('h')).toBe('A');
    expect(lastToast()).toMatch(/Song h.*→ A/);
    expect(playingId()).toBe('i');
    expect(rail().playingOn).toBe('TODO');
    expect(rail().counts).toMatchObject({ A: 3, TODO: 2 });

    await goto('/settings');
    rateKey(1);
    expect(h.tierOf('i')).toBe('S');
    expect(lastToast()).toMatch(/Song i.*→ S/);
    expect(playingId()).toBe('j');

    await goto('/tier/Rap/duel');
    key('Delete');
    expect(h.tierOf('j')).toBe(REMOVED_TIER);
    expect(lastToast()).toMatch(/Song j.*removed on push/);
    expectPlayerAgreesWithBoard();

    // Back on the board everything says the same.
    await h.open('Rap');
    expect(rail().counts).toEqual({ ...boardCounts(), TODO: 0 });
    expect(h.staged().map((c) => [c.video.videoId, c.to ?? c.kind])).toEqual(
      expect.arrayContaining([['h', 'A'], ['i', 'S'], ['j', REMOVED_TIER]])
    );
    expect(headerTotal()).toBe(TIER_ORDER.reduce((n, t) => n + (boardCounts()[t] ?? 0), 0));
  });

  it("rating another board's copy of the triage song doesn't skip the triage", async () => {
    // h and i are in both boards' to-do lists.
    await start({ ...ACCOUNT, 'Pop TODO': ['s', 'h', 'i'] });
    await playTier('TODO'); // Rap triage: h, i, j
    await h.open('Pop');
    h.move('h', 'S'); // Pop's own copy, rated on Pop
    expect(playingId()).toBe('h');
    expect(focus().isTriage).toBe(true);
  });
});

describe('journey 3: counts agree after a push', () => {
  it('a push updates the sidebar, the Home cards and the rail - not only the board', async () => {
    await start();
    h.move('a', 'A');
    h.remove('g');
    await h.push();
    expect(youtubeCounts('Rap')).toMatchObject({ S: 2, A: 3, D: 0 });
    expect(boardCounts()).toMatchObject({ S: 2, A: 3, D: 0 });
    expect(headerTotal()).toBe(youtubeTotals().Rap);
    expect(sidebarTotals().Rap).toBe(youtubeTotals().Rap);

    await h.goHome();
    expect(homeCard('Rap')).toEqual({ total: youtubeTotals().Rap, counts: youtubeCounts('Rap') });
    expect(sidebarTotals()).toEqual(youtubeTotals());
  });

  it("a duel page's Move: the sidebar and Home follow", async () => {
    await start();
    await h.duelMove('d', 'S');
    expect(youtubeCounts('Rap')).toMatchObject({ S: 4, A: 1 });
    await h.goHome();
    expect(homeCard('Rap').counts).toEqual(youtubeCounts('Rap'));
  });
});
