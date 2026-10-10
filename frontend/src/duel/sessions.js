import { TIER_ORDER, TODO_TIER } from '../tiers';
import { merge } from './mergeGenerator';

// The duel modes, each a generator over a live "ladder" - the board as
// { S: [ids], A: [...], ..., TODO: [...] } - that it edits as answers come in,
// so the screen can draw the board changing duel by duel.
//
// A mode yields requests and is resumed with the answer:
//   { kind: 'tier', id }               -> resumed with a tier id (Place only)
//   { kind: 'duel', a, b, ...context } -> resumed with the winner id, or null
//                                         for "can't decide"
// Everything is deterministic given the starting ladder + the answers, so
// undo is "replay every answer but the last" (createSession below).
//
//   place - Beli's flow: pick a tier for each to-do song, then binary-search
//           its spot inside that tier (~log2(n) duels). Ending at the very top
//           or bottom of a tier asks once more against the neighbouring
//           tier's edge, so a song can climb or drop a tier.
//   tune  - border duels: the bottom of each tier against the top of the tier
//           below, a few songs deep. The lower song winning swaps the two.
//   order - a merge sort of one tier (merge sort, not insertion: one wrong
//           answer can't misplace everything after it).

const ranked = (ladder) => TIER_ORDER.filter((t) => ladder[t]);

function* placeOne(ladder, id) {
  const tiers = ranked(ladder);
  let tier = yield { kind: 'tier', id };
  // Search range inside `tier`: the song belongs somewhere in [lo, hi].
  let list = ladder[tier];
  let lo = 0;
  let hi = list.length;
  for (;;) {
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const winner = yield { kind: 'duel', a: id, b: list[mid], tier, lo, hi, step: 'search' };
      if (winner == null) {
        lo = hi = mid; // too close to call: right next to it
      } else if (winner === id) hi = mid;
      else lo = mid + 1;
    }
    // Landed on an edge: one question against the neighbouring tier decides
    // whether it really belongs a tier up (or down).
    const i = tiers.indexOf(tier);
    const above = tiers[i - 1];
    const below = tiers[i + 1];
    if (lo === 0 && above && ladder[above].length) {
      const edge = ladder[above][ladder[above].length - 1];
      const winner = yield { kind: 'duel', a: id, b: edge, tier: above, lo: ladder[above].length, hi: ladder[above].length, step: 'climb' };
      if (winner === id) {
        tier = above;
        list = ladder[tier];
        lo = 0;
        hi = list.length - 1;
        continue;
      }
    } else if (lo === list.length && list.length > 0 && below && ladder[below].length) {
      const edge = ladder[below][0];
      const winner = yield { kind: 'duel', a: id, b: edge, tier: below, lo: 0, hi: 0, step: 'drop' };
      if (winner === edge) {
        tier = below;
        list = ladder[tier];
        lo = 1;
        hi = list.length;
        continue;
      }
    }
    break;
  }
  ladder[TODO_TIER] = ladder[TODO_TIER].filter((x) => x !== id);
  ladder[tier] = [...list.slice(0, lo), id, ...list.slice(lo)];
  return { id, tier, index: lo };
}

export function* placeMode(ladder) {
  const queue = [...(ladder[TODO_TIER] || [])];
  const placed = [];
  for (const id of queue) placed.push(yield* placeOne(ladder, id));
  return placed;
}

export function* tuneMode(ladder, { depth = 3 } = {}) {
  const tiers = ranked(ladder).filter((t) => ladder[t].length);
  const swaps = [];
  for (let d = 0; d < depth; d++) {
    for (let i = 0; i < tiers.length - 1; i++) {
      const up = ladder[tiers[i]];
      const down = ladder[tiers[i + 1]];
      const ui = up.length - 1 - d;
      if (ui < 0 || d >= down.length) continue;
      const a = up[ui];
      const b = down[d];
      const winner = yield { kind: 'duel', a, b, border: [tiers[i], tiers[i + 1]], step: 'border' };
      if (winner === b) {
        ladder[tiers[i]] = up.map((x, k) => (k === ui ? b : x));
        ladder[tiers[i + 1]] = down.map((x, k) => (k === d ? a : x));
        swaps.push({ up: b, down: a, border: [tiers[i], tiers[i + 1]] });
      }
    }
  }
  return swaps;
}

export function* orderMode(ladder, { tier }) {
  function* sort(items) {
    if (items.length <= 1) return items;
    const mid = Math.floor(items.length / 2);
    const left = yield* sort(items.slice(0, mid));
    const right = yield* sort(items.slice(mid));
    // merge() yields bare [a, b] pairs; wrap them as duel requests.
    const gen = merge(left, right);
    let step = gen.next();
    while (!step.done) {
      const [a, b] = step.value;
      const winner = yield { kind: 'duel', a, b, tier, step: 'order' };
      step = gen.next(winner == null ? true : winner === a);
    }
    return step.value;
  }
  ladder[tier] = yield* sort([...ladder[tier]]);
  return ladder[tier];
}

const MODES = { place: placeMode, tune: tuneMode, order: orderMode };

// Rough duel counts for the mode picker.
export function estimateDuels(mode, ladder, opts = {}) {
  const tiers = ranked(ladder);
  if (mode === 'place') {
    const n = tiers.reduce((s, t) => s + ladder[t].length, 0) / Math.max(1, tiers.length);
    return Math.ceil(Math.log2(n + 1)) + 1; // per song
  }
  if (mode === 'tune') {
    const filled = tiers.filter((t) => ladder[t].length);
    return Math.max(0, filled.length - 1) * (opts.depth ?? 3);
  }
  const n = ladder[opts.tier]?.length ?? 0;
  return n <= 1 ? 0 : Math.ceil(n * Math.log2(n) - n + 1);
}

export function cloneLadder(ladder) {
  return Object.fromEntries(Object.entries(ladder).map(([t, ids]) => [t, [...ids]]));
}

// A replayable session: `answers` is the whole history, so undo = rebuild
// from the start ladder with one answer fewer. Returns a fresh object each
// time - the screen just stores it in state.
export function createSession(mode, startLadder, opts = {}, answers = []) {
  const ladder = cloneLadder(startLadder);
  const gen = MODES[mode](ladder, opts);
  let step = gen.next();
  for (const answer of answers) step = gen.next(answer);
  return {
    mode,
    opts,
    startLadder,
    answers,
    ladder,
    request: step.done ? null : step.value,
    result: step.done ? step.value : null,
    duels: answers.filter((a) => !TIER_ORDER.includes(a)).length,
    answer: (value) => createSession(mode, startLadder, opts, [...answers, value]),
    undo: () => createSession(mode, startLadder, opts, answers.slice(0, -1)),
  };
}

// Every song whose tier or position differs from the start, best first.
export function ladderChanges(start, now) {
  const where = (ladder) => {
    const map = new Map();
    for (const [tier, ids] of Object.entries(ladder)) ids.forEach((id, index) => map.set(id, { tier, index }));
    return map;
  };
  const before = where(start);
  const after = where(now);
  const order = [...TIER_ORDER, TODO_TIER];
  const changes = [];
  for (const [id, to] of after) {
    const from = before.get(id);
    if (!from || from.tier !== to.tier || from.index !== to.index) changes.push({ id, from, to });
  }
  return changes.sort((x, y) => order.indexOf(x.to.tier) - order.indexOf(y.to.tier) || x.to.index - y.to.index);
}
