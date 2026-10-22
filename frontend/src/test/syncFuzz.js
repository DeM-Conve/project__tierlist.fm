// Seeded random sessions over the sync harness (property-style): random
// drags, bin/put-back, undo/redo, discard, transfers, board switches, duel
// Moves, Add songs and pushes, with the invariants checked after every push
// and whenever a board opens. Deterministic per seed, so a failure names the
// seed and the op log to replay it.
import { act, cleanup } from '@testing-library/react';
import { FakeYoutube } from './fakeYoutube';
import { mountApp, youtubeBoards } from './syncHarness';
import { invariantViolations } from './syncInvariants';
import { selectPendingMoves, selectTransfers } from '../store/selectors';
import { BOARD_TIERS, REMOVED_TIER } from '../tiers';

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  return { next, int, pick: (xs) => xs[int(xs.length)] };
}

// Two boards; Pop has no B/C/D playlists (a board with missing tiers).
export const FUZZ_ACCOUNT = {
  'Rap S': ['a1', 'a2', 'a3'],
  'Rap A': ['a4', 'a5'],
  'Rap B': ['a6'],
  'Rap C': [],
  'Rap D': ['a7'],
  'Rap TODO': ['a8', 'a9'],
  'Pop S': ['p1', 'p2'],
  'Pop A': ['p3'],
  'Pop TODO': ['p4', 'p5'],
};
// The same, with duplicates on the board it starts on: a song in two tiers,
// a song twice in one tier, a song in a tier and the to-do list.
export const FUZZ_ACCOUNT_DUPES = {
  ...FUZZ_ACCOUNT,
  'Rap S': ['a1', 'a2', 'a3', 'a2'],
  'Rap B': ['a6', 'a1'],
  'Rap TODO': ['a8', 'a9', 'a4'],
};
const BOARDS = ['Rap', 'Pop'];

// What a board will show once pushed: a song in several tiers stays only in
// the highest (the auto-dedupe rule), so that's what YouTube must hold.
function keepHighest(board) {
  const seen = new Set();
  const out = {};
  for (const t of BOARD_TIERS) {
    if (!board[t]) continue;
    out[t] = board[t].filter((v) => !seen.has(v) && seen.add(v));
  }
  return out;
}

// The board's view adjusted for staged transfers: what every board shows
// (the open one from the draft, the others from YouTube +- transfers).
function expectedBoards(h) {
  const yt = youtubeBoards(h.yt);
  const out = {};
  const transfers = selectTransfers(h.state);
  for (const board of BOARDS) {
    if (board === h.board) {
      out[board] = keepHighest(h.shown());
      continue;
    }
    const tiers = Object.fromEntries(Object.entries(yt[board]).map(([t, ids]) => [t, [...ids]]));
    for (const t of transfers) {
      if (t.fromCategory === board) tiers[t.fromTier] = tiers[t.fromTier].filter((v) => v !== t.video.videoId);
    }
    for (const t of transfers) if (t.toCategory === board) tiers[t.toTier] = [...tiers[t.toTier], t.video.videoId];
    out[board] = tiers;
  }
  return out;
}

const sets = (board) => Object.fromEntries(Object.entries(board).map(([t, ids]) => [t, [...new Set(ids)].sort()]));

// undoAcrossPush: false keeps Ctrl+Z from reaching back past the last push
// (an open bug: a pushed removal or transfer undone leaves the board out of
// step with YouTube - see sync.e2e.test.jsx), so a run still finds every
// *other* bug. faults: inject refused YouTube writes (pushed again until
// clean at the end). duplicates: start from a board with duplicate songs.
export async function fuzzRun(seed, { ops = 30, undoAcrossPush = false, faults = false, duplicates = false } = {}) {
  const r = rng(seed);
  const account = duplicates ? FUZZ_ACCOUNT_DUPES : FUZZ_ACCOUNT;
  const yt = new FakeYoutube(account);
  let lastDuel = null;
  const log = [];
  const problems = [];
  const universe = new Set(Object.values(account).flat());
  let nextNew = 1;
  // Undo steps below this predate the last push - unless undoAcrossPush,
  // undo stays above it.
  let undoFloor = 0;
  const markPushed = () => (undoFloor = h.state.tiers.undoStack.length);
  const h = await mountApp(yt);
  await h.open('Rap');

  const fail = (where, list) => {
    if (list.length) problems.push(`${where}: ${list.join(' | ')}`);
  };
  const cards = (tiers) =>
    tiers.flatMap((t) => (h.tierItems()[t] || []).map((v) => ({ v, t })));
  const usable = cards;
  const boardTiers = () => BOARD_TIERS.filter((t) => h.tierItems()[t]);
  const pending = () => selectPendingMoves(h.state).length;

  async function checkOpen() {
    // A board just opened must show what YouTube has (+- staged transfers).
    const shown = sets(h.shown());
    const onYt = sets(youtubeBoards(h.yt)[h.board]);
    const transfers = selectTransfers(h.state);
    const expectNow = { ...onYt };
    for (const t of transfers) {
      if (t.fromCategory === h.board && expectNow[t.fromTier]) expectNow[t.fromTier] = expectNow[t.fromTier].filter((v) => v !== t.video.videoId);
    }
    for (const t of transfers) if (t.toCategory === h.board && expectNow[t.toTier]) expectNow[t.toTier] = [...new Set([...expectNow[t.toTier], t.video.videoId])].sort();
    if (JSON.stringify(shown) !== JSON.stringify(expectNow)) {
      problems.push(`opened ${h.board}: shows ${JSON.stringify(shown)} but YouTube +- transfers is ${JSON.stringify(expectNow)}`);
    }
  }

  // Returns true when the push came back clean (or there was nothing to push).
  async function push() {
    const expected = expectedBoards(h);
    const removed = (h.tierItems()[REMOVED_TIER] || []).map((v) => v.videoId);
    const stillShown = new Set(Object.values(expected).flatMap((b) => Object.values(b).flat()));
    const sync = await h.push();
    if (!sync) return true;
    markPushed();
    const clean = sync.response.results.every((x) => x.success);
    // A binned song is meant to go (once its removal goes through).
    removed.forEach((v) => !stillShown.has(v) && universe.delete(v));
    if (!clean) {
      // A refused write (injected fault): nothing may be lost, and the
      // failed change must still be staged for the retry.
      fail('partial push', invariantViolations(yt, { universe, duplicates: false }));
      if (!h.staged().length) problems.push('partial push: nothing left staged to retry');
      return false;
    }
    fail('push', invariantViolations(yt, { expected, universe, sync }));
    const left = h.staged();
    if (left.length) problems.push(`push: still staged after a clean push: ${left.map((m) => `${m.kind} ${m.video.videoId}`).join(', ')}`);
    const now = sets(h.shown());
    const onYt = sets(youtubeBoards(yt)[h.board]);
    if (JSON.stringify(now) !== JSON.stringify(onYt)) problems.push(`push: board shows ${JSON.stringify(now)}, YouTube has ${JSON.stringify(onYt)}`);
    return true;
  }

  const OPS = [
    // Undoing across pushes is what that mode is for: undo (and binning,
    // whose undo after a push is the interesting case) come up more often.
    ['move', 8], ['reorder', 2], ['remove', undoAcrossPush ? 4 : 2], ['putBack', 2], ['undo', undoAcrossPush ? 6 : 2], ['redo', 1], ['discard', 1],
    ['transfer', 3], ['switch', 2], ['push', 5], ['duelMove', 2], ['duelUndo', 1], ['addSong', 1],
    ...(duplicates ? [['addExisting', 1]] : []),
    ...(faults ? [['fault', 2]] : []),
  ];
  const total = OPS.reduce((s, [, w]) => s + w, 0);
  const pickOp = () => {
    let x = r.int(total);
    for (const [op, w] of OPS) if ((x -= w) < 0) return op;
    return 'push';
  };

  for (let i = 0; i < ops && problems.length === 0; i++) {
    const op = pickOp();
    const tiers = boardTiers();
    try {
      if (op === 'move' || op === 'reorder') {
        const c = usable(tiers);
        if (!c.length) continue;
        const { v, t } = r.pick(c);
        const to = op === 'reorder' ? t : r.pick(tiers);
        const at = r.next() < 0.5 ? null : r.int((h.tierItems()[to] || []).length + 1);
        log.push(`${op} ${v.videoId} ${t}->${to}@${at}`);
        h.move(v.videoId, to, at);
      } else if (op === 'remove') {
        const c = usable(tiers);
        if (!c.length) continue;
        const { v } = r.pick(c);
        log.push(`remove ${v.videoId}`);
        h.remove(v.videoId);
      } else if (op === 'putBack') {
        const c = usable([REMOVED_TIER]);
        if (!c.length) continue;
        const { v } = r.pick(c);
        const to = r.pick(tiers);
        log.push(`putBack ${v.videoId}->${to}`);
        h.move(v.videoId, to);
      } else if (op === 'undo' || op === 'redo') {
        if (!undoAcrossPush && op === 'undo' && h.state.tiers.undoStack.length <= undoFloor) continue;
        log.push(op);
        if (op === 'undo') h.undo();
        else h.redo();
      } else if (op === 'discard') {
        log.push('discard');
        await h.discard();
        undoFloor = 0;
      } else if (op === 'transfer') {
        // The sidebar won't open another board while this one has staged moves.
        if (pending()) continue;
        const c = usable(tiers.filter((t) => t !== REMOVED_TIER));
        if (!c.length) continue;
        const { v } = r.pick(c);
        const to = r.pick(BOARDS.filter((b) => b !== h.board));
        const toTier = r.pick(Object.keys(youtubeBoards(yt)[to]));
        log.push(`transfer ${v.videoId} ${h.board}->${to} ${toTier}`);
        await h.transfer(v.videoId, to, toTier, r.next() < 0.5 ? null : 0);
        undoFloor = 0; // opening the target board cleared the undo stack
      } else if (op === 'switch') {
        // Opening another board with staged moves drops them (see the
        // board-switch scenario) - the fuzz only switches with none.
        if (pending()) continue;
        const to = r.pick(BOARDS.filter((b) => b !== h.board));
        log.push(`open ${to}`);
        await h.open(to);
        undoFloor = 0; // a load clears the undo stack
        await checkOpen();
      } else if (op === 'push') {
        log.push('push');
        await push();
      } else if (op === 'duelMove') {
        const once = (id) => cards(tiers).filter(({ v }) => v.videoId === id).length === 1;
        const c = usable(tiers.filter((t) => t !== 'TODO' && t !== REMOVED_TIER)).filter(({ v }) => !v.transfer && once(v.videoId));
        if (!c.length) continue;
        const { v, t } = r.pick(c);
        const to = r.pick(tiers.filter((x) => x !== t && x !== 'TODO'));
        if (!to) continue;
        log.push(`duelMove ${v.videoId} ${t}->${to}`);
        const before = yt.syncCalls.length;
        const dm = await h.duelMove(v.videoId, to);
        lastDuel = { board: h.board, s: dm };
        markPushed();
        const sync = yt.syncCalls.length > before ? yt.syncCalls.at(-1) : null;
        if (sync?.response.results.every((x) => x.success)) {
          const on = youtubeBoards(yt)[h.board];
          const where = Object.keys(on).filter((x) => on[x].includes(v.videoId));
          // Other copies may stay until the bar's push (their dedupes stay staged).
          if (!where.includes(to)) problems.push(`duelMove ${v.videoId} -> ${to}: on YouTube in [${where}]`);
        }
        fail('duelMove', invariantViolations(yt, { universe, duplicates: false }));
      } else if (op === 'duelUndo') {
        if (!lastDuel || lastDuel.board !== h.board || h.tierOf(lastDuel.s.song) !== lastDuel.s.to) continue;
        const { s: d } = lastDuel;
        lastDuel = null;
        log.push(`duelUndo ${d.song} ${d.to}->${d.from}`);
        const before = yt.syncCalls.length;
        await h.duelUndo(d);
        markPushed();
        const sync = yt.syncCalls.length > before ? yt.syncCalls.at(-1) : null;
        if (sync?.response.results.every((x) => x.success)) {
          const on = youtubeBoards(yt)[h.board];
          const where = Object.keys(on).filter((x) => on[x].includes(d.song));
          if (!where.includes(d.from)) problems.push(`duelUndo ${d.song} -> ${d.from}: on YouTube in [${where}]`);
        }
        fail('duelUndo', invariantViolations(yt, { universe, duplicates: false }));
      } else if (op === 'fault') {
        const c = cards(tiers);
        if (!c.length) continue;
        const { v } = r.pick(c);
        const f = r.pick([
          { op: 'insert', status: 403, reason: 'quotaExceeded' },
          { op: 'delete', status: 403, reason: 'forbidden' },
          { op: 'insert', status: 500, reason: 'backendError' },
        ]);
        log.push(`fault ${f.op} ${v.videoId} ${f.status}`);
        yt.inject({ ...f, videoId: v.videoId });
      } else if (op === 'addExisting') {
        const c = cards(tiers);
        if (!c.length) continue;
        const { v } = r.pick(c);
        const tier = r.pick(Object.keys(youtubeBoards(yt)[h.board]));
        log.push(`addExisting ${v.videoId} ${h.board} ${tier}`);
        await h.fileSong(v.videoId, h.board, tier);
      } else if (op === 'addSong') {
        const board = r.pick(BOARDS);
        const tier = r.pick(Object.keys(youtubeBoards(yt)[board]));
        const id = `n${seed}x${nextNew++}`;
        log.push(`addSong ${id} ${board} ${tier}`);
        universe.add(id);
        await h.fileSong(id, board, tier);
      }
    } catch (e) {
      problems.push(`${op} threw: ${e.message}`);
    }
  }

  // Push whatever is left, then a fresh app (a reload) must show YouTube.
  // Faults are one-shot, so a few pushes always get everything through.
  yt.faults = [];
  for (let k = 0; k < 3 && !problems.length; k++) {
    log.push('final push');
    if (await push()) break;
  }
  if (!problems.length) {
    cleanup();
    const fresh = await mountApp(yt);
    for (const board of BOARDS) {
      await fresh.open(board);
      const shown = sets(fresh.shown());
      const onYt = sets(youtubeBoards(yt)[board]);
      if (JSON.stringify(shown) !== JSON.stringify(onYt)) problems.push(`reload ${board}: ${JSON.stringify(shown)} vs ${JSON.stringify(onYt)}`);
    }
    fail('final', invariantViolations(yt, { universe }));
  }
  await act(async () => cleanup());
  return { seed, problems, log, syncs: yt.syncCalls };
}
