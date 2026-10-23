// Cross-feature journeys around the player (docs/qa-pass.md section 7): the
// real App over the fake YouTube (src/test/syncHarness.jsx). Play from one
// board, browse to another board / Home / Settings / a duel page, drive the
// player (keys, rail, queue) - and check at every step that the player, the
// Tier Rail, the boards and every count on screen tell the same story.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { minimizePlayer } from './store/focusSlice';
import { playSongNow, queueSong } from './queueActions';
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

// A board's duel hub (it loads that board, like opening it).
async function openDuel(board) {
  await goto(`/tier/${encodeURIComponent(board)}/duel`);
  await waitFor(() => {
    if (h.board !== board || Object.values(h.state.tiers.tierLoading).some(Boolean)) throw new Error('loading');
  });
  await h.settle();
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

  // fix/board-drafts (per-board drafts, one global pending bar) owns what a
  // staged change shows away from its board. Today the board, its header and
  // the rail count the draft, while the sidebar and the Home cards count
  // YouTube - on Home both are on screen at once (the rail beside the card).
  it.fails('a staged change: the Home card and the sidebar agree with the rail', async () => {
    await start();
    await playTile('a');
    h.remove('g');
    h.remove('f');
    h.move('h', 'S');
    expect(headerTotal()).toBe(6);
    await h.goHome();
    expect(rail().counts).toMatchObject({ S: 4, B: 0, D: 0, TODO: 2 });
    expect(homeCard('Rap').counts).toMatchObject({ S: 4, B: 0, D: 0, TODO: 2 });
    expect(sidebarTotals().Rap).toBe(6);
  });

  it("a duel page's Move: the sidebar and Home follow", async () => {
    await start();
    await h.duelMove('d', 'S');
    expect(youtubeCounts('Rap')).toMatchObject({ S: 4, A: 1 });
    await h.goHome();
    expect(homeCard('Rap').counts).toEqual(youtubeCounts('Rap'));
  });
});

describe('journey 1: browsing other boards while a song plays', () => {
  it("another board never takes the playing song's controls", async () => {
    await start();
    await playTile('a');
    await h.open('Pop');
    // Pop is open: the rail is Pop's tiers, the keys don't rate Rap's song
    // on Pop's board, Pop's tiles don't light up.
    expect(rail()).toMatchObject({ mode: 'Tiers', playingOn: null, counts: { S: 2, A: 1, TODO: 1 } });
    rateKey(2);
    key('Delete');
    expect(h.staged()).toEqual([]);
    expect(focus().focusedVideo).toMatchObject({ videoId: 'a', tier: 'S' });
    // Next / prev walk Rap's queue, still Rap's songs.
    next();
    expect(playingId()).toBe('b');
    expect(focus().focusedCategory).toBe('Rap');
    prev();
    // Home: the rail follows the playing song's board, counted like Home's card.
    await h.goHome();
    expect(rail().counts).toMatchObject(homeCard('Rap').counts);
    expect(sidebarTotals()).toEqual(youtubeTotals());
  });
});

describe("journey 2: duel on one board while the player plays another's song", () => {
  it("a Move pushes at once, the other board's song plays on untouched", async () => {
    await start(ACCOUNT, 'Pop');
    await playTile('p');
    await openDuel('Rap');
    // Rap is loaded now: Pop's song can't be rated here.
    expect(selectFocusedAvailableTiers(h.state)).toEqual([]);
    rateKey(2);
    expect(h.staged()).toEqual([]);

    await h.duelMove('d', 'S');
    expect(youtubeBoards(yt).Rap.S).toContain('d');
    expect(h.tierOf('d')).toBe('S');
    expect(playingId()).toBe('p');
    expect(focus().focusedVideo).toMatchObject({ videoId: 'p', tier: 'S' });

    // Suggested moves' Play: d plays now - and it's Rap's song.
    const d = h.tierItems().S.find((v) => v.videoId === 'd');
    h.dispatch(playSongNow('S', d));
    expect(playingId()).toBe('d');
    expect(focus().focusedCategory).toBe('Rap');
    rateKey(2);
    expect(h.tierOf('d')).toBe('A');
    expectPlayerAgreesWithBoard();
    h.undo();
    expect(h.tierOf('d')).toBe('S');
    expectPlayerAgreesWithBoard();

    // Back on Pop and on Rap: boards, player and YouTube agree.
    await h.open('Pop');
    expect(h.tierOf('p')).toBe('S');
    next(); // p, the rest of Pop's queue
    expect(playingId()).not.toBe('d');
    await h.open('Rap');
    expect(h.tierOf('d')).toBe('S');
    expect(invariantViolations(yt, { expected: { Rap: h.shown() } })).toEqual([]);
    await h.goHome();
    expect(homeCard('Rap').counts).toEqual(youtubeCounts('Rap'));
    expect(sidebarTotals()).toEqual(youtubeTotals());
  });

  // fix/board-drafts (per-board drafts) is changing this right now: opening
  // another board replaces the loaded board's draft, so an edit staged on
  // the duel's board is gone when you come back.
  it.fails("a staged edit on the duel's board survives a visit to the playing song's board", async () => {
    await start(ACCOUNT, 'Pop');
    await playTile('p');
    await openDuel('Rap');
    h.move('f', 'C');
    await h.duelMove('d', 'S');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'move', to: 'C' })]);
    await h.open('Pop');
    await openDuel('Rap');
    expect(h.tierOf('f')).toBe('C');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'move', to: 'C' })]);
  });
});

describe('journey 1: rate away from the board, then browse', () => {
  // The user's own report. fix/board-drafts (per-board drafts; rating the
  // playing song stages on its own board) is changing this right now:
  // opening another board replaces the draft, so the rating is gone.
  it.fails('a rating made on Settings is still there after visiting another board', async () => {
    await start();
    await playTile('a');
    await goto('/settings');
    rateKey(2);
    expect(h.tierOf('a')).toBe('A');
    await h.open('Pop');
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('A');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'move', to: 'A' })]);
  });
});

describe('journey 1: a queue mixing two boards', () => {
  it('shuffle, repeat all and the wrap keep every song on its own board', async () => {
    await start();
    await playTier('A'); // d, e
    await h.open('Pop');
    const r = h.tierItems().A.find((v) => v.videoId === 'r');
    h.dispatch(queueSong('A', r, 'end'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle up next' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Repeat: off' }));
    });
    expect(focus().repeatMode).toBe('all');
    const boardOf = { d: 'Rap', e: 'Rap', r: 'Pop' };
    const seen = [];
    for (let i = 0; i < 6; i++) {
      seen.push(playingId());
      expect(focus().focusedCategory).toBe(boardOf[playingId()]);
      // Pop is loaded: only Pop's song is rated here, by the rail and the keys.
      const onPop = boardOf[playingId()] === 'Pop';
      expect(rail().mode).toBe(onPop ? 'Rate' : 'Tiers');
      expect(selectFocusedAvailableTiers(h.state).length > 0).toBe(onPop);
      next();
    }
    expect(new Set(seen)).toEqual(new Set(['d', 'e', 'r']));
  });
});

describe('journey 1: the playing song leaves its board', () => {
  it('removed and pushed: nothing offers to rate a song YouTube no longer has', async () => {
    await start();
    await playTile('b');
    key('Delete');
    expect(h.tierOf('b')).toBe(REMOVED_TIER);
    await h.push();
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'c']);
    expect(h.tierOf('b')).toBeUndefined();
    expect(selectFocusedAvailableTiers(h.state)).toEqual([]);
    expect(rail().mode).toBe('Tiers');
    expect(rail().playingOn).toBeNull();
  });

  it('dragged to another board: its old board stops rating it', async () => {
    await start();
    await playTile('a');
    await h.transfer('a', 'Pop', 'A');
    await h.goHome(); // the rail follows the playing song's board (Rap)
    await h.open('Rap');
    expect(h.tierOf('a')).toBeUndefined();
    expect(selectFocusedAvailableTiers(h.state)).toEqual([]);
    expect(rail().mode).toBe('Tiers');
    expect(rail().playingOn).toBeNull();
  });
});
