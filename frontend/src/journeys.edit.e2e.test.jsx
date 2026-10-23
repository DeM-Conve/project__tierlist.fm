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

vi.mock('./components/PendingChanges', () => import('./test/boardProbe'));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() }, Notifications: () => null }));

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

  it('sent away, a move of its own staged on the old board, then put back from the review', async () => {
    await start();
    h.move('d', 'B');
    await h.transfer('a', 'Pop', 'A');
    h.putBackTransfer('a');
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('S');
  });
});
