// End-to-end sync scenarios: the real app over a fake YouTube (see
// src/test/syncHarness.jsx). After every push, YouTube must hold exactly what
// the boards showed (src/test/syncInvariants.js).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeYoutube } from './test/fakeYoutube';
import { mountApp, youtubeBoards } from './test/syncHarness';
import { invariantViolations } from './test/syncInvariants';
import { moveWithFeedback } from './tierActions';

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
  it('to TODO, push, back to S, push', async () => {
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
  it('push, then undo the pushed move, then push again', async () => {
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
  it('transfer, push, then move it on the target board, push', async () => {
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
  it('the same song, round and round', async () => {
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
  it('Move, then its Undo', async () => {
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
  it('delete refused after the insert: the retry must not insert again', async () => {
    await start();
    yt.inject({ op: 'delete', videoId: 'a', status: 403, reason: 'forbidden' });
    h.move('a', 'A');
    await h.push();
    expectInSync(await h.push());
  });
});

describe('more Remove bin, transfer and duplicate cases', () => {
  it('bin a song after it was pushed (its id changed with that push)', async () => {
    await start();
    h.move('a', 'A');
    await h.push();
    h.remove('a');
    expectInSync(await h.push(), { removed: ['a'] });
  });

  it('transfer there, then drag it back home to another tier: an ordinary move', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.transfer('a', 'Rap', 'B');
    expect(h.tierOf('a')).toBe('B');
    expectInSync(await h.push(), { others: { Pop: ACCOUNT_BOARD('Pop') } });
  });

  it('transfer, then bin it on the target board: the transfer is off', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    h.remove('a');
    expect(h.staged()).toEqual([]);
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('S');
  });

  // Found by this harness, fixed (tiersSlice addSyncedVideo): filing a song
  // into a tier that already has it put a second card in that tier and
  // nothing ever removed the second playlist item.
  it('Add songs into a tier that already has the song: the extra copy goes on push', async () => {
    await start();
    await h.fileSong('a', 'Rap', 'S');
    expect(h.shown().S).toEqual(['a', 'b', 'c']);
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'b', 'c']);
  });

  // Found by this harness, fixed (selectors selectPendingMoves): the kept
  // copy was the highest *original* tier still on the board, so dragging
  // the A copy of a song that's also in TODO down to D staged the D card as
  // the duplicate - the song ended up only in TODO, the drag was lost.
  it('a song in A and TODO, the A copy dragged to D: it ends up in D', async () => {
    await start({ ...ACCOUNT, 'Rap TODO': ['h', 'i', 'd'] });
    h.move('d', 'D');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.D).toEqual(['g', 'd']);
    expect(youtubeBoards(yt).Rap.TODO).toEqual(['h', 'i']);
  });

  it('a song in S and B, the B copy dragged to A: it ends up in S only', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'A', videoId: 'a' }], { quiet: true }));
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.S).toContain('a');
  });

  // Found by the random sessions (seed 211 with duplicates), fixed
  // (selectors: a binned copy's tier is found by its item id in the whole
  // baseline): after a push moved one copy, the board had forgotten the
  // other copy's tier, so pushing its removal cleaned the wrong tier's
  // baseline - a later Discard put the deleted copy back on the board, and
  // the next push moved it instead of the real one.
  it('a song in S and B: bin the S copy, duel-Move the B copy, push, Discard', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.remove('a'); // the S copy
    await h.duelMove('a', 'D'); // the B copy, pushed at once
    expectInSync(await h.push(), { others: {} });
    h.move('d', 'B');
    await h.discard();
    expect(h.shown().S).toEqual(['b', 'c']);
    expect(h.tierOf('a')).toBe('D');
  });

  it('a song in S and B, the S copy dragged to C: the higher copy (B) is kept', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.move('a', 'C');
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.B).toEqual(['f', 'a']);
    expect(youtubeBoards(yt).Rap.C).toEqual([]);
  });

  // Found by this harness, fixed (tiersSlice applyMove): dragging the lower
  // copy onto the tier holding the kept one showed the song twice there,
  // staged nothing, and left the lower copy on YouTube forever.
  it('a song in S and B, the B copy dragged onto S', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'S', videoId: 'a' }], { quiet: true }));
    expect(h.shown().S).toEqual(['a', 'b', 'c']);
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.B).toEqual(['f']);
    h.undo();
  });

  it('a song in S and B, the B copy dragged onto S, then undone', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'S', videoId: 'a' }], { quiet: true }));
    h.undo();
    expect(h.staged()).toEqual([expect.objectContaining({ kind: 'dedupe', tier: 'B', keptTier: 'S' })]);
    expectInSync(await h.push());
  });

  it('a song in S and B, the B copy dragged to A', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.dispatch(moveWithFeedback([{ fromTier: 'B', toTier: 'A', videoId: 'a' }], { quiet: true }));
    expectInSync(await h.push());
  });
});

describe('opening another board', () => {
  // NOT FIXED - found by this harness, needs a product call: opening another
  // board (sidebar click, Home card, palette) replaces the open board's
  // draft, and its staged moves are silently gone - the drag "didn't sync".
  // Only the drag-to-another-board path warns (useBoardDropOpen). Fix
  // options: keep a draft per board, or block/confirm leaving a board with
  // staged moves (React Router's useBlocker needs a data router).
  it.fails('keeps the staged moves of the board left behind', async () => {
    await start();
    h.move('a', 'A');
    await h.open('Pop');
    await h.open('Rap');
    expect(h.tierOf('a')).toBe('A');
  });
});

describe('overlapping pushes', () => {
  it('an edit made while a push is in flight is pushed next time', async () => {
    await start();
    h.move('a', 'A');
    const pushing = h.probe().ctx.syncChanges('Rap');
    h.move('d', 'B');
    await pushing;
    await h.settle();
    expectInSync(await h.push());
  });

  it('the song being pushed is dragged again before the push answers', async () => {
    await start();
    h.move('a', 'A');
    const pushing = h.probe().ctx.syncChanges('Rap');
    h.move('a', 'B');
    await pushing;
    await h.settle();
    expectInSync(await h.push());
    expect(youtubeBoards(yt).Rap.B).toContain('a');
  });

  it('a push is undone before it answers', async () => {
    await start();
    h.move('a', 'A');
    const pushing = h.probe().ctx.syncChanges('Rap');
    h.undo();
    await pushing;
    await h.settle();
    expect(h.tierOf('a')).toBe('S');
    expectInSync(await h.push());
  });

  it('a push clicked twice sends the change once', async () => {
    await start();
    h.move('a', 'A');
    const first = h.probe().ctx.syncChanges('Rap');
    const second = h.probe().ctx.syncChanges('Rap');
    await first;
    await second;
    await h.settle();
    expect(yt.syncCalls).toHaveLength(1);
    expectInSync(yt.syncCalls[0]);
  });
});

describe('after a push that deleted something', () => {
  // Found by this harness, fixed (tiersSlice applySyncedMoves, dedupe
  // branch): a dedupe's card can sit in a tier other than its own
  // playlist's (the user dragged that copy away). The reducer cleaned the
  // baseline of the tier the card *sits in*, so the deleted item stayed in
  // its real tier's baseline: Discard brought that copy back with a dead id,
  // the board kept it over the live copy, and the next push deleted the
  // song's last real copy - the song was lost.
  it('a duplicate dragged away, pushed, then Discard: nothing is lost', async () => {
    await start({ ...ACCOUNT, 'Rap B': ['f', 'a'] });
    h.move('a', 'C'); // the S copy goes below the B copy: it's the duplicate
    expectInSync(await h.push());
    h.move('d', 'B'); // any later edit, then Discard it
    await h.discard();
    expect(h.tierOf('a')).toBe('B');
    expectInSync(await h.push());
  });

  // OPEN BUG, owned by the undo-after-push fix (another agent; tiersSlice
  // undo snapshots): the undo stack survives a push, so undoing a pushed
  // Remove brings the card back with the id of the item the push deleted.
  // It has no baseline, so nothing is staged: the board shows a song
  // YouTube no longer has.
  it.fails('Remove, push, then Undo: the board must not show a song YouTube lost', async () => {
    await start();
    h.remove('b');
    await h.push();
    h.undo();
    const staged = h.staged();
    const shownAndThere = h.tierOf('b') === undefined || staged.length > 0;
    expect(shownAndThere).toBe(true);
  });

  // OPEN BUG, same owner and root cause: undoing the drop of a pushed transfer takes
  // the card off the target board, but the song is on YouTube there now -
  // nothing is staged and the board hides a song it has.
  it.fails('transfer, push, then Undo the drop: the board still matches YouTube', async () => {
    await start();
    await h.transfer('a', 'Pop', 'A');
    await h.push();
    h.undo();
    expect(h.staged().length > 0 || h.tierOf('a') === 'A').toBe(true);
  });
});

describe('Add songs and undo', () => {
  it('Add songs Undo right away takes the song back out', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    await h.undoFileSong();
    expect(h.tierOf('z')).toBeUndefined();
    expect(youtubeBoards(yt).Rap.TODO).toEqual(['h', 'i']);
    expectInSync(null);
  });

  // Found by this harness, fixed (useAddSongsActions.undo): Undo deleted the
  // playlist item it had filed - but a move pushed since gave the song a new
  // item (in a new playlist), so the delete 404'd: "Couldn't undo", and the
  // song stayed.
  it('Add songs Undo after the song was moved and pushed', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    h.move('z', 'S');
    await h.push();
    await h.undoFileSong();
    expect(h.tierOf('z')).toBeUndefined();
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'b', 'c']);
    expect(h.staged()).toEqual([]);
    expectInSync(null);
  });

  it('Add songs Undo after the song was moved (not pushed yet)', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    h.move('z', 'S');
    await h.undoFileSong();
    expect(h.tierOf('z')).toBeUndefined();
    expect(h.staged()).toEqual([]);
    expectInSync(null);
  });

  it('Add songs Undo after the song was moved and pushed on a board not open any more', async () => {
    await start();
    await h.fileSong('z', 'Rap', 'TODO');
    h.move('z', 'S');
    await h.push();
    await h.open('Pop');
    await h.undoFileSong();
    expect(youtubeBoards(yt).Rap.S).toEqual(['a', 'b', 'c']);
    await h.open('Rap');
    expect(h.tierOf('z')).toBeUndefined();
  });

  // Found by this harness, fixed (tiersSlice addSyncedVideo): undo
  // snapshots predate the filed song, so Ctrl+Z of an earlier drag took it
  // off the board - YouTube has it, the board doesn't, nothing staged.
  it('Ctrl+Z of a drag made before filing a song keeps the filed song', async () => {
    await start();
    h.move('a', 'A');
    await h.fileSong('z', 'Rap', 'D');
    h.undo();
    expect(h.tierOf('a')).toBe('S');
    expect(h.tierOf('z')).toBe('D');
    expect(h.staged()).toEqual([]);
    expectInSync(null, { universe: [...everySong, 'z'] });
  });
});
