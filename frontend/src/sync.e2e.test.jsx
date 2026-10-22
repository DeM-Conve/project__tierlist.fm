// End-to-end sync scenarios: the real app over a fake YouTube (see
// src/test/syncHarness.jsx). After every push, YouTube must hold exactly what
// the boards showed (src/test/syncInvariants.js).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, youtubeBoards } from './test/syncHarness';
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
};

let yt;
let h;
let everySong;
async function start(account = ACCOUNT, board = 'Rap') {
  everySong = [...new Set(Object.values(account).flat())];
  yt = new FakeYoutube(account);
  h = await mountApp(yt);
  await h.open(board);
  return h;
}
afterEach(() => vi.clearAllMocks());

// What the user sees now must be what YouTube has, for the open board and
// for any other board given (`others`: { board: { tier: ids } }).
function expectInSync(sync, { others = {}, removed = [], universe = everySong } = {}) {
  expect(invariantViolations(yt, {
    expected: { [h.board]: h.shown(), ...others },
    universe: universe.filter((v) => !removed.includes(v)),
    sync,
  })).toEqual([]);
}

describe('drag within a tier', () => {
  it('reordering stages nothing and leaves YouTube alone', async () => {
    await start();
    h.move('c', 'S', 0);
    expect(h.shown().S).toEqual(['c', 'a', 'b']);
    expect(h.staged()).toEqual([]);
    expect(await h.push()).toBeNull();
    expectInSync(null);
  });
});

describe('drag between tiers', () => {
  it('a move is on YouTube after push', async () => {
    await start();
    h.move('a', 'A');
    h.move('f', 'S', 0);
    const sync = await h.push();
    expectInSync(sync);
    expect(youtubeBoards(yt).Rap.A).toContain('a');
    expect(h.staged()).toEqual([]);
  });

  it('into an empty tier', async () => {
    await start();
    h.move('a', 'C');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.C).toEqual(['a']);
  });
});

describe('to TODO and back', () => {
  it('there and back before a push stages nothing', async () => {
    await start();
    h.move('a', 'TODO');
    h.move('a', 'S');
    expect(h.staged()).toEqual([]);
  });

  it('to TODO, push', async () => {
    await start();
    h.move('a', 'TODO');
    expectInSync(await h.push());
  });

  // Bug (a), being fixed elsewhere: after a push the moved card keeps its
  // old playlistItem id, so moving it again deletes an id YouTube no longer
  // has (404) - and the insert has already happened: a duplicate.
  it.fails('to TODO, push, back to S, push', async () => {
    await start();
    h.move('a', 'TODO');
    expectInSync(await h.push());
    h.move('a', 'S');
    expectInSync(await h.push());
  });
});

describe('the Remove bin', () => {
  it('remove then push deletes it from YouTube', async () => {
    await start();
    h.remove('b');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'remove' })]);
    expectInSync(await h.push(), { removed: ['b'] });
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'c']);
  });

  it('remove then put back stages nothing', async () => {
    await start();
    h.remove('b');
    h.move('b', 'S');
    expect(h.staged()).toEqual([]);
    expect(await h.push()).toBeNull();
    expectInSync(null);
  });

  it('remove, put back in another tier is a move', async () => {
    await start();
    h.remove('b');
    h.move('b', 'B');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.B).toEqual(['f', 'b']);
  });
});

describe('undo / redo', () => {
  it('undo takes a move back, redo re-stages it', async () => {
    await start();
    h.move('a', 'A');
    h.undo();
    expect(h.staged()).toEqual([]);
    h.redo();
    expect(h.staged()).toHaveLength(1);
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.A).toContain('a');
  });

  // Undo after a push restores the pre-push draft - whose cards still carry
  // the playlistItem ids that push deleted. Same root cause as bug (a)
  // (stale ids after a push), but in the undo stack's snapshots.
  it.fails('push, then undo the pushed move, then push again', async () => {
    await start();
    h.move('a', 'A');
    expectInSync(await h.push());
    h.undo();
    expect(h.tierOf('a')).toBe('S');
    expectInSync(await h.push());
  });
});

describe('discard', () => {
  it('drops every staged edit, YouTube untouched', async () => {
    await start();
    h.move('a', 'A');
    h.remove('d');
    await h.discard();
    expect(h.staged()).toEqual([]);
    expect(h.shown()).toEqual(ACCOUNT_BOARD('Rap'));
    expectInSync(null);
  });

  it('drops a staged transfer too', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.discard();
    expect(h.staged()).toEqual([]);
    await h.open('Rap');
    expect(h.shown()).toEqual(ACCOUNT_BOARD('Rap'));
  });
});

function ACCOUNT_BOARD(board) {
  return Object.fromEntries(
    Object.entries(ACCOUNT)
      .filter(([t]) => t.startsWith(`${board} `))
      .map(([t, ids]) => [t.slice(board.length + 1), ids])
  );
}

describe('transfer to another board', () => {
  it('transfer, push from the target board', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    expect(h.shown().A).toEqual(['r', 'a']);
    const sync = await h.push();
    expectInSync(sync, { others: { Rap: { ...ACCOUNT_BOARD('Rap'), S: ['b', 'c'] } } });
    await h.open('Rap');
    expectInSync(null);
    expect(h.tierOf('a')).toBeUndefined();
  });

  it('transfer, move it again on the target board, push', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.move('a', 'S', 0);
    expectInSync(await h.push(), { others: { Rap: { ...ACCOUNT_BOARD('Rap'), S: ['b', 'c'] } } });
    expect(youtubeBoards(yt).Pop.S).toContain('a');
  });

  // Bug (a) (transfersApplied): the arrived card keeps the playlistItem id
  // of its old board's playlist, which the push deleted.
  it.fails('transfer, push, then move it on the target board, push', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.push();
    h.move('a', 'S');
    expectInSync(await h.push(), { others: { Rap: { ...ACCOUNT_BOARD('Rap'), S: ['b', 'c'] } } });
  });

  it('transfer and put it back stages nothing', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.putBackTransfer('a');
    expect(h.staged()).toEqual([]);
    expect(await h.push()).toBeNull();
    await h.open('Rap');
    expect(h.shown()).toEqual(ACCOUNT_BOARD('Rap'));
  });
});

describe('move -> push -> move -> push, five times', () => {
  // Bug (a): every push after the first one deletes a stale playlistItem id.
  it.fails('the same song, round and round', async () => {
    await start();
    for (const tier of ['A', 'B', 'C', 'D', 'S']) {
      h.move('a', tier);
      expectInSync(await h.push());
    }
  });

  it('a different song each time', async () => {
    await start();
    for (const [song, tier] of [['a', 'A'], ['d', 'B'], ['f', 'C'], ['g', 'TODO'], ['h', 'S']]) {
      h.move(song, tier);
      expectInSync(await h.push());
    }
  });
});

describe('duels', () => {
  it('a suggested Move goes to YouTube at once, other staged edits stay staged', async () => {
    await start();
    h.move('f', 'C');
    await h.duelMove('d', 'S');
    expect(youtubeBoards(yt).Rap.S).toContain('d');
    expect(youtubeBoards(yt).Rap.B).toEqual(['f']);
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'move', to: 'C' })]);
    expectInSync(await h.push());
  });

  // Bug (a): the Move's push leaves the card with its deleted playlistItem
  // id, so Undo (which pushes the move back at once) deletes nothing (404)
  // after inserting it back into A - the song is now in S and A.
  it.fails('Move, then its Undo', async () => {
    await start();
    const s = await h.duelMove('d', 'S');
    await h.duelUndo(s);
    expect(h.tierOf('d')).toBe('A');
    expectInSync(h.yt.syncCalls.at(-1));
  });

  it('sort a tier by score, then push other moves', async () => {
    await start();
    h.sortTier('S', ['c', 'a', 'b']);
    expect(h.shown().S).toEqual(['c', 'a', 'b']);
    h.move('a', 'B');
    expectInSync(await h.push());
  });
});

describe('Add songs', () => {
  it('file a song onto the open board, then move it, push', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    expect(h.shown().TODO).toEqual(['h', 'i', 'z']);
    expect(h.staged()).toEqual([]);
    h.move('z', 'A');
    expectInSync(await h.push(), { universe: [...everySong, 'z'] });
  });

  it('file a song onto another board, open it, move it, push', async () => {
    await start();
    await h.fileSong('z', 'Pop', 'TODO');
    await h.open('Pop');
    expect(h.shown().TODO).toContain('z');
    h.move('z', 'S');
    expectInSync(await h.push(), { universe: [...everySong, 'z'] });
  });
});

describe('duplicates (auto-dedupe)', () => {
  it('a song in two tiers keeps the higher copy', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'dedupe', tier: 'B', keptTier: 'S' })]);
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.B).toEqual(['f']);
  });

  it('a song twice in one tier keeps one copy', async () => {
    await start({ ...ACCOUNT, 'Rap S': ['a', 'b', 'a', 'c', 'a'] });
    expect(h.shown().S).toEqual(['a', 'b', 'c']);
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'b', 'c']);
  });

  it('a duplicate plus a move of the kept copy in one push', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.move('a', 'A');
    expectInSync(await h.push());
  });

  it('a song twice in one tier, moved to another tier', async () => {
    await start({ ...ACCOUNT, 'Rap S': ['a', 'b', 'a'] });
    h.move('a', 'A');
    expectInSync(await h.push());
  });
});

describe('a partial failure, then retry', () => {
  it('insert refused (quota): nothing changes, the retry lands it', async () => {
    await start();
    yt.inject({ op: 'insert', videoId: 'a', status: 403, reason: 'quotaExceeded' });
    h.move('a', 'A');
    h.move('d', 'B');
    const first = await h.push();
    expect(first.response.results.map((r) => r.success)).toEqual([false, true]);
    expect(h.state.tiers.syncStatus).toBe('partial');
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'move', to: 'A' })]);
    expectInSync(await h.push());
  });

  // The insert landed but the delete failed (500): YouTube now has the song
  // in both playlists. The row isn't `success`, so the frontend keeps the
  // whole move staged and the retry inserts it a second time. The new
  // per-result contract (`inserted`, `newItemId`) is what lets the frontend
  // fix this - part of bug (a)'s fix.
  it.fails('delete refused after the insert: the retry must not insert again', async () => {
    await start();
    yt.inject({ op: 'delete', videoId: 'a', status: 500 });
    h.move('a', 'A');
    await h.push();
    expectInSync(await h.push());
  });
});

describe('probe: more', () => {
  it('P1 bin a song after a push', async () => {
    await start();
    h.move('a', 'A');
    await h.push();
    h.remove('a');
    expectInSync(await h.push(), { removed: ['a'] });
  });
  it('P2 board switch keeps staged moves', async () => {
    await start();
    h.move('a', 'A');
    await h.open('Pop');
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('A');
  });
  it('P3 transfer there and back to another tier', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.transfer('a', 'Rap', 'B');
    expect(h.tierOf('a')).toBe('B');
    expectInSync(await h.push(), { others: { Pop: ACCOUNT_BOARD('Pop') } });
  });
  it('P4 transfer then bin on target', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.remove('a');
    expect(h.staged()).toEqual([]);
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('S');
  });
  it('P5 add a song already in that tier', async () => {
    await start();
    await h.fileSong('a', 'Rap', 'S');
    expectInSync(await h.push());
  });
  it('P6 dup in S and B, drag the S copy to C', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.move('a', 'C');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.C).toEqual(['a']);
  });
  it('P7 dup in S and B, drag the B copy to S', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    const v = h.tierItems().B.find((x) => x.videoId === 'a');
    h.dispatch((await import('./tierActions')).moveWithFeedback([{ fromTier: 'B', toTier: 'S', videoId: 'a' }], { quiet: true }));
    void v;
    expectInSync(await h.push());
  });
  it('P8 dup in S and B, drag the B copy to A', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.dispatch((await import('./tierActions')).moveWithFeedback([{ fromTier: 'B', toTier: 'A', videoId: 'a' }], { quiet: true }));
    expectInSync(await h.push());
  });
  it('P9 transfer out of a board with an auto-dedupe', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    await h.transfer('c', 'Pop', 'A');
    expectInSync(await h.push());
  });
  it('P10 edit during an in-flight push', async () => {
    await start();
    h.move('a', 'A');
    const { boardProbe } = await import('./test/boardProbe');
    const p = boardProbe.current.ctx.syncChanges('Rap');
    h.move('d', 'B');
    await p;
    await h.settle();
    expectInSync(await h.push());
  });
  it('P11 two pushes queued back to back', async () => {
    await start();
    h.move('a', 'A');
    const { boardProbe } = await import('./test/boardProbe');
    const p1 = boardProbe.current.ctx.syncChanges('Rap');
    const p2 = boardProbe.current.ctx.syncChanges('Rap');
    await p1; await p2;
    await h.settle();
    expect(yt.syncCalls).toHaveLength(1);
    expectInSync(yt.syncCalls[0]);
  });
});
