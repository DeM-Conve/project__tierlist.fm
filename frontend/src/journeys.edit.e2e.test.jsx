// Cross-feature journeys (docs/qa-pass.md section 7): features that each
// work alone, used one after another - Add songs, drags, undo, transfers to
// another board, Settings, a failed push, two tabs. Each journey runs the
// real App over the fake YouTube (src/test/syncHarness.jsx) and checks that
// the boards, the staged changes and YouTube agree at the end
// (src/test/syncInvariants.js).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, unmount, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { setNaming } from './store/namingSlice';
import { setTheme, setTierPalette } from './store/appearanceSlice';
import { expandPlayer, setFocusedVideo } from './store/focusSlice';
import { selectStagedFailures } from './store/selectors';
import { NO_TARGET_REASON } from './syncCache';

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));

// jsdom has no scrolling; the expanded player's queue scrolls itself.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const ACCOUNT = {
  'Rap S': ['a', 'b', 'c'],
  'Rap A': ['d', 'e'],
  'Rap B': ['f'],
  'Rap C': [],
  'Rap D': ['g'],
  'Rap TODO': ['h', 'i'],
  'Pop S': ['p', 'q'],
  'Pop A': ['r'],
  'Pop TODO': ['s'],
  'Jazz S': ['j'],
  'Jazz A': [],
};

let yt;
let h;
let everySong;
async function start(account = ACCOUNT, board = 'Rap') {
  everySong = [...new Set(Object.values(account).flat())];
  yt = new FakeYoutube(account);
  h = await mountApp(yt);
  if (board) await h.open(board);
  return h;
}
// A page reload: a new session over the same YouTube.
async function reload(board) {
  unmount();
  h = await mountApp(yt);
  if (board) await h.open(board);
  return h;
}
afterEach(() => vi.clearAllMocks());

// What YouTube holds must be what the boards show: the open board (as
// shown now) plus `others` ({ board: { tier: ids } }); nothing duplicated,
// no song lost (`extra`: songs added on the way, `removed`: binned ones).
function expectInSync(sync, { others = {}, extra = [], removed = [] } = {}) {
  expect(
    invariantViolations(yt, {
      expected: { [h.board]: h.shown(), ...others },
      universe: [...everySong, ...extra].filter((v) => !removed.includes(v)),
      sync,
    })
  ).toEqual([]);
}

describe('journey 1: Add songs into two boards, drag, undo, push, reload', () => {
  it('songs filed into the open board and another board end up where they were dragged', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    await h.fileSong('y', 'Pop', 'TODO'); // Pop isn't open
    h.move('z', 'S');
    h.undo();
    expect(h.tierOf('z')).toBe('TODO');
    h.move('z', 'A');
    expectInSync(await h.push(), { extra: ['z', 'y'] });

    await h.open('Pop');
    expect(h.tierOf('y')).toBe('TODO');
    h.move('y', 'S');
    h.undo();
    h.redo();
    h.move('y', 'A');
    expectInSync(await h.push(), { extra: ['z', 'y'] });

    await reload('Rap');
    expect(h.tierOf('z')).toBe('A');
    expect(h.staged()).toEqual([]);
    await h.open('Pop');
    expect(h.tierOf('y')).toBe('A');
    expect(h.staged()).toEqual([]);
    expectInSync(null, { extra: ['z', 'y'] });
  });

  it('a song filed into a board left with the cache warm shows there when it is opened again', async () => {
    await start(ACCOUNT, 'Pop');
    await h.open('Rap');
    await h.fileSong('y', 'Pop', 'A');
    await h.open('Pop');
    expect(h.tierOf('y')).toBe('A');
    h.move('y', 'S');
    expectInSync(await h.push(), { extra: ['y'] });
  });

  it('Ctrl+Z of drags made before filing, then Add songs Undo, then push', async () => {
    await start();
    h.move('a', 'B');
    await h.fileSong('z', 'Rap', 'TODO');
    h.move('z', 'C');
    h.undo(); // z back to TODO
    h.undo(); // a back to S - z stays (it's on YouTube)
    expect(h.tierOf('z')).toBe('TODO');
    expect(h.tierOf('a')).toBe('S');
    await h.undoFileSong();
    expect(h.tierOf('z')).toBeUndefined();
    expect(await h.push()).toBeNull();
    expectInSync(null);
    await reload('Rap');
    expectInSync(null);
  });

  it('a filed song sent on to another board, then the filing undone: nothing is left staged', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    await h.transfer('z', 'Pop', 'A');
    await h.undoFileSong();
    // The song was taken back out of YouTube: it isn't on its way anywhere.
    expect(h.tierOf('z')).toBeUndefined();
    expect(h.staged()).toEqual([]);
    await h.push();
    expectInSync(null);
    expect(youtubeBoards(yt).Pop.A).toEqual(['r']);
  });

  it('the same, undone after going back to the board it was filed into', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    await h.transfer('z', 'Pop', 'A');
    await h.open('Rap');
    await h.undoFileSong();
    expect(h.tierOf('z')).toBeUndefined();
    expect(h.staged()).toEqual([]);
    await h.open('Pop');
    expect(h.tierOf('z')).toBeUndefined();
    expectInSync(null);
  });
});

describe('journey 2: send a song to another board, change your mind there, push', () => {
  it('sent on again to a third board', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.transfer('a', 'Jazz', 'A');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'transfer', fromCategory: 'Rap', toCategory: 'Jazz', toTier: 'A' })]);
    expectInSync(await h.push(), { others: { Rap: { S: ['b', 'c'] }, Pop: { A: ['r'] } } });
    expect(youtubeBoards(yt).Jazz.A).toEqual(['a']);
  });

  it('its drop undone on the target board: back home, nothing staged', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.undo();
    expect(h.staged()).toEqual([]);
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('S');
    expect(await h.push()).toBeNull();
    expectInSync(null);
  });

  it('re-aimed to another tier there, then that undone: it goes where it was dropped', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.move('a', 'S');
    h.undo();
    expect(h.tierOf('a')).toBe('A');
    expectInSync(await h.push(), { others: { Rap: { S: ['b', 'c'] } } });
  });

  it('pushed from its old board after going back there', async () => {
    await start();
    await h.transfer('a', 'Pop', 'TODO');
    h.move('a', 'S');
    await h.open('Rap');
    expect(h.tierOf('a')).toBeUndefined();
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'transfer', toCategory: 'Pop', toTier: 'S' })]);
    expectInSync(await h.push(), { others: { Pop: { S: ['p', 'q', 'a'], TODO: ['s'] } } });
  });

  it('sent to a board that already has the song: it is not listed there twice', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'p'] });
    await h.transfer('p', 'Pop', 'A');
    // Pop already has p in S: it goes where it was dropped, and Pop's own
    // copy is staged for removal (greyed "Duplicate" on the board) - the
    // push leaves YouTube with one copy on Pop.
    expect(h.staged()).toEqual([
      expect.objectContaining({ kind: 'dedupe', tier: 'S', keptTier: 'A' }),
      expect.objectContaining({ kind: 'transfer', toCategory: 'Pop', toTier: 'A' }),
    ]);
    const sync = await h.push();
    expect(youtubeBoards(yt).Pop).toEqual({ S: ['q'], A: ['r', 'p'], TODO: ['s'] });
    expectInSync(sync, { others: { Rap: { B: ['f'] } } });
  });

  it('sent to a board that already has the song, then the drop undone: nothing is staged', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'p'] });
    await h.transfer('p', 'Pop', 'A');
    h.undo();
    expect(h.staged()).toEqual([]);
    expect(await h.push()).toBeNull();
    expectInSync(null, { others: { Rap: { B: ['f', 'p'] } } });
  });

  it('sent away, a move of its own staged on the old board, then put back from the review', async () => {
    await start();
    h.move('d', 'B');
    await h.transfer('a', 'Pop', 'A');
    h.putBackTransfer('a');
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('S');
  });
});

const LABELS = { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', TODO: 'TODO' };
const NO_SHOWN = { S: null, A: null, B: null, C: null, D: null, TODO: null };
// Settings -> Playlist naming's Save (PlaylistNamingSettings dispatches this).
function saveNaming(h, { template = '{category} {tier}', tierLabels = LABELS, tierDisplayNames = NO_SHOWN } = {}) {
  h.dispatch(setNaming({ template, tierLabels, tierDisplayNames }));
}
function play(h, videoId) {
  const tier = h.tierOf(videoId);
  h.probe().ctx.playFrom(tier);
  h.dispatch(setFocusedVideo({ tier, videoId }));
}

describe('journey 3: Settings changed while changes are staged and a song plays', () => {
  it('theme and tier palette: the staged changes and the playing song stay as they were', async () => {
    await start();
    play(h, 'd');
    h.move('a', 'B');
    h.move('d', 'S');
    await h.go('/settings?tab=appearance');
    h.dispatch(setTheme('paper'));
    h.dispatch(setTierPalette('heat'));
    expect(h.state.focus.focusedVideo).toEqual({ tier: 'S', videoId: 'd' });
    await h.open('Rap');
    expect(h.staged()).toHaveLength(2);
    expectInSync(await h.push());
  });

  it('a tier shown under a new name: the player says where it plays from by that name', async () => {
    await start();
    h.probe().ctx.playFrom('A');
    h.dispatch(expandPlayer());
    expect(h.screen.getByText('Rap · A')).toBeInTheDocument();
    await h.go('/settings?tab=naming');
    saveNaming(h, { tierDisplayNames: { ...NO_SHOWN, A: 'Great' } });
    expect(await h.screen.findByText('Rap · Great')).toBeInTheDocument();
  });

  it('the to-do name changed with a move to TODO staged: the push never loses the song', async () => {
    await start();
    h.move('a', 'TODO');
    h.move('h', 'S');
    await h.go('/settings?tab=naming');
    // "Rap TODO" is no longer a to-do list under the new name.
    saveNaming(h, { tierLabels: { ...LABELS, TODO: 'Inbox' } });
    await h.open('Rap');
    await h.push();
    expect(invariantViolations(yt, { universe: everySong })).toEqual([]);
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'b', 'c', 'h']);
    // Not sent, and it says why until it's moved somewhere else.
    expect(selectStagedFailures(h.state)).toEqual([
      expect.objectContaining({ kind: 'move', to: 'TODO', failure: { step: 'insert', error: NO_TARGET_REASON } }),
    ]);
    expect(h.state.tiers.syncStatus).toBe('partial');
    h.move('a', 'D');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.D).toEqual(['g', 'a']);
  });

  it('a naming that hides the open board, then put back: the staged changes are still there', async () => {
    await start();
    play(h, 'd');
    h.move('a', 'B');
    await h.go('/settings?tab=naming');
    saveNaming(h, { tierLabels: { S: 'T1', A: 'T2', B: 'T3', C: 'T4', D: 'T5', TODO: 'TODO' } });
    saveNaming(h);
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('B');
    expectInSync(await h.push());
  });
});

describe('journey 4: a push fails mid-journey, then navigate, reload, retry', () => {
  it('quota on one move: the reason stays through navigation, the retry lands it once', async () => {
    await start();
    yt.inject({ op: 'insert', videoId: 'a', status: 403, reason: 'quotaExceeded' });
    h.move('a', 'A');
    h.move('d', 'B');
    await h.push();
    expect(selectStagedFailures(h.state)).toEqual([expect.objectContaining({ kind: 'move', to: 'A' })]);
    await h.goHome();
    await h.go('/settings');
    await h.open('Rap');
    expect(selectStagedFailures(h.state)).toEqual([expect.objectContaining({ kind: 'move', to: 'A' })]);
    expectInSync(await h.push());
    expect(selectStagedFailures(h.state)).toEqual([]);
    await reload('Rap');
    expect(h.staged()).toEqual([]);
    expect(h.tierOf('a')).toBe('A');
    expect(h.tierOf('d')).toBe('B');
  });

  it('a transfer refused: still staged with its reason on the other board, retried from there', async () => {
    await start();
    yt.inject({ op: 'insert', videoId: 'a', status: 403, reason: 'quotaExceeded' });
    await h.transfer('a', 'Pop', 'A');
    await h.push();
    await h.open('Rap');
    expect(h.tierOf('a')).toBeUndefined();
    expect(selectStagedFailures(h.state)).toEqual([expect.objectContaining({ kind: 'transfer', toCategory: 'Pop' })]);
    expectInSync(await h.push(), { others: { Pop: { S: ['p', 'q'], A: ['r', 'a'], TODO: ['s'] } } });
    expect(selectStagedFailures(h.state)).toEqual([]);
  });

  it('the whole push request fails: every change keeps the reason, the retry sends each once', async () => {
    await start();
    yt.failRequest({ url: '/api/tier-sync', status: 503 });
    h.move('a', 'A');
    h.remove('f');
    await h.push();
    expect(h.state.tiers.syncStatus).toBe('error');
    expect(selectStagedFailures(h.state)).toHaveLength(2);
    await h.goHome();
    await h.open('Rap');
    expect(selectStagedFailures(h.state)).toHaveLength(2);
    expectInSync(await h.push(), { removed: ['f'] });
    expect(selectStagedFailures(h.state)).toEqual([]);
    await reload('Rap');
    expect(h.staged()).toEqual([]);
    expectInSync(null, { removed: ['f'] });
  });

  it('added but not removed (delete keeps failing): navigate away and back, retry finishes the move', async () => {
    await start();
    yt.inject({ op: 'delete', videoId: 'a', status: 500, times: 4 });
    h.move('a', 'A');
    await h.push();
    expect(h.tierOf('a')).toBe('A');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'dedupe', tier: 'S', keptTier: 'A' })]);
    await h.goHome();
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('A');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.A).toEqual(['d', 'e', 'a']);
  });

  // NOT FIXED - the global pending bar (fix/board-drafts is reworking it):
  // syncStatus is one value for the whole app and 'error' stays until the
  // next push, so after a failed push on Rap every other board's bar says
  // "Sync failed" with nothing staged there to retry (and opening Pop also
  // drops Rap's failed changes - the per-board drafts issue).
  it.fails('a failed push on one board does not say "Sync failed" on another board with nothing staged', async () => {
    await start();
    yt.failRequest({ url: '/api/tier-sync', status: 503 });
    h.move('a', 'A');
    await h.push();
    expect(h.state.tiers.syncStatus).toBe('error');
    await h.open('Pop');
    expect(h.staged()).toEqual([]);
    expect(h.screen.queryByText('Sync failed')).toBeNull();
  });

  // NOT FIXED - needs a product call: the push added the song to A but
  // couldn't delete it from S. In the session the S copy is a staged
  // delete-only change, but a reload forgets that, finds the song in S and A
  // on YouTube and auto-dedupes it the documented way - the highest tier
  // (S) is kept, so the user's move is silently undone by the next push.
  // Options: keep the most recently added copy (the backend would have to
  // return each item's playlist-item publishedAt), or remember a half-done
  // move's leftover delete on this device across reloads.
  it.fails('added but not removed, then reloaded before the retry: the song stays where it was moved', async () => {
    await start();
    yt.inject({ op: 'delete', videoId: 'a', status: 500, times: 4 });
    h.move('a', 'A');
    await h.push();
    await reload('Rap');
    // YouTube has the song in S and A now; the user put it in A.
    expect(h.tierOf('a')).toBe('A');
  });
});
