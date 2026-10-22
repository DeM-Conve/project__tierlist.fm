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
const BOARDS = ['Rap', 'Pop'];

// The board's view adjusted for staged transfers: what every board shows
// (the open one from the draft, the others from YouTube +- transfers).
function expectedBoards(h) {
  const yt = youtubeBoards(h.yt);
  const out = {};
  const transfers = selectTransfers(h.state);
  for (const board of BOARDS) {
    if (board === h.board) {
      out[board] = h.shown();
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

// avoidKnownBugs: never touch a card whose playlistItem id a push already
// deleted, and never undo/redo across a push (bug (a): stale ids after a
// push) - so the run still finds every *other* bug.
export async function fuzzRun(seed, { ops = 30, avoidKnownBugs = false } = {}) {
  const r = rng(seed);
  const yt = new FakeYoutube(FUZZ_ACCOUNT);
  const log = [];
  const problems = [];
  const universe = new Set(Object.values(FUZZ_ACCOUNT).flat());
  let nextNew = 1;
  // Undo steps older than this predate the last push (their cards carry
  // pre-push playlistItem ids) - avoidKnownBugs keeps undo above it.
  let undoFloor = 0;
  const markPushed = () => (undoFloor = h.state.tiers.undoStack.length);
  const h = await mountApp(yt);
  await h.open('Rap');

  const fail = (where, list) => {
    if (list.length) problems.push(`${where}: ${list.join(' | ')}`);
  };
  const liveIds = () => new Set([...yt.playlists.values()].flatMap((p) => p.items.map((i) => i.id)));
  const cards = (tiers) =>
    tiers.flatMap((t) => (h.tierItems()[t] || []).map((v) => ({ v, t })));
  const usable = (tiers) => {
    const live = liveIds();
    return cards(tiers).filter(({ v }) => !avoidKnownBugs || v.transfer || live.has(v.id));
  };
  const boardTiers = () => BOARD_TIERS.filter((t) => h.tierItems()[t]);
  const pending = () => selectPendingMoves(h.state).length;

  async function checkOpen() {
    // A board just opened must show what YouTube has (+- staged transfers).
    const want = sets(expectedBoards(h)[h.board]);
    const shown = sets(h.shown());
    const yt = sets(youtubeBoards(h.yt)[h.board]);
    const transfers = selectTransfers(h.state);
    const expectNow = {};
    for (const [t, ids] of Object.entries(yt)) expectNow[t] = ids;
    for (const t of transfers) {
      if (t.fromCategory === h.board && expectNow[t.fromTier]) expectNow[t.fromTier] = expectNow[t.fromTier].filter((v) => v !== t.video.videoId);
    }
    for (const t of transfers) if (t.toCategory === h.board && expectNow[t.toTier]) expectNow[t.toTier] = [...new Set([...expectNow[t.toTier], t.video.videoId])].sort();
    if (JSON.stringify(shown) !== JSON.stringify(expectNow)) {
      problems.push(`opened ${h.board}: shows ${JSON.stringify(shown)} but YouTube +- transfers is ${JSON.stringify(expectNow)}`);
    }
    void want;
  }

  async function push() {
    const expected = expectedBoards(h);
    const removed = (h.tierItems()[REMOVED_TIER] || []).map((v) => v.videoId);
    const stillShown = new Set(Object.values(expected).flatMap((b) => Object.values(b).flat()));
    removed.forEach((v) => !stillShown.has(v) && universe.delete(v));
    const sync = await h.push();
    if (!sync) return;
    markPushed();
    fail('push', invariantViolations(yt, { expected, universe, sync }));
    if (sync.response.results.every((x) => x.success)) {
      const left = h.staged();
      if (left.length) problems.push(`push: still staged after a clean push: ${left.map((m) => `${m.kind} ${m.video.videoId}`).join(', ')}`);
      const now = sets(h.shown());
      const onYt = sets(youtubeBoards(yt)[h.board]);
      if (JSON.stringify(now) !== JSON.stringify(onYt)) problems.push(`push: board shows ${JSON.stringify(now)}, YouTube has ${JSON.stringify(onYt)}`);
    }
  }

  const OPS = [
    ['move', 8], ['reorder', 2], ['remove', 2], ['putBack', 2], ['undo', 2], ['redo', 1], ['discard', 1],
    ['transfer', 3], ['switch', 2], ['push', 5], ['duelMove', 2], ['addSong', 1],
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
        if (avoidKnownBugs && op === 'undo' && h.state.tiers.undoStack.length <= undoFloor) continue;
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
        const c = usable(tiers.filter((t) => t !== 'TODO' && t !== REMOVED_TIER)).filter(({ v }) => !v.transfer);
        if (!c.length) continue;
        const { v, t } = r.pick(c);
        const to = r.pick(tiers.filter((x) => x !== t && x !== 'TODO'));
        if (!to) continue;
        log.push(`duelMove ${v.videoId} ${t}->${to}`);
        const before = yt.syncCalls.length;
        await h.duelMove(v.videoId, to);
        markPushed();
        const sync = yt.syncCalls.length > before ? yt.syncCalls.at(-1) : null;
        const on = youtubeBoards(yt)[h.board];
        const where = Object.keys(on).filter((x) => on[x].includes(v.videoId));
        if (where.length !== 1 || where[0] !== to) problems.push(`duelMove ${v.videoId} -> ${to}: on YouTube in [${where}]`);
        fail('duelMove', invariantViolations(yt, { universe, sync }));
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
  if (!problems.length) {
    log.push('final push');
    await push();
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
