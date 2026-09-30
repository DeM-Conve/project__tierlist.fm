import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DUEL_STRATEGY, DUEL_STRATEGIES, DUEL_STRATEGY_LABELS } from './index';
import { MergeSortStrategy } from './mergeSortStrategy';
import { TierAwareMergeStrategy } from './tierAwareMergeStrategy';
import { EloStrategy } from './eloStrategy';
import { merge } from './mergeGenerator';

// A "true" ranking the simulated human answers from: lower = better.
const rankOf = (truth) => new Map(truth.map((id, i) => [id, i]));

// Drives a strategy to completion answering from `truth`. Returns the spine
// and how many duels were asked. Guards against non-termination.
function run(strategy, truth, { limit = 10_000 } = {}) {
  const rank = rankOf(truth);
  let asked = 0;
  let pair;
  while ((pair = strategy.nextPair())) {
    expect(pair.a).not.toBeUndefined();
    expect(pair.b).not.toBeUndefined();
    const winner = (rank.get(pair.a) ?? 0) <= (rank.get(pair.b) ?? 0) ? pair.a : pair.b;
    strategy.reportResult(winner);
    asked += 1;
    if (asked > limit) throw new Error('strategy did not terminate');
  }
  return { spine: strategy.getSpine(), asked };
}

const shuffled = (arr, seed = 1) => {
  // Deterministic Fisher-Yates.
  const a = [...arr];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const ids = (n) => Array.from({ length: n }, (_, i) => `v${i}`);

describe('registry (duel/index.js)', () => {
  it('has the three strategies and the default', () => {
    expect(Object.keys(DUEL_STRATEGIES).sort()).toEqual(['elo', 'mergeSort', 'tierAwareMerge']);
    expect(DEFAULT_DUEL_STRATEGY).toBe('tierAwareMerge');
    expect(DUEL_STRATEGIES[DEFAULT_DUEL_STRATEGY]).toBeTypeOf('function');
  });

  it('labels exist for every strategy', () => {
    expect(Object.keys(DUEL_STRATEGY_LABELS).sort()).toEqual(Object.keys(DUEL_STRATEGIES).sort());
    Object.values(DUEL_STRATEGY_LABELS).forEach((l) => expect(l.length).toBeGreaterThan(0));
  });

  it('factories build the right class from { ids, runs }', () => {
    const args = { ids: ['a', 'b', 'c'], runs: [['a'], ['b', 'c']] };
    expect(DUEL_STRATEGIES.tierAwareMerge(args)).toBeInstanceOf(TierAwareMergeStrategy);
    expect(DUEL_STRATEGIES.mergeSort(args)).toBeInstanceOf(MergeSortStrategy);
    expect(DUEL_STRATEGIES.elo(args)).toBeInstanceOf(EloStrategy);
  });

  it.each(Object.keys(DUEL_STRATEGIES))('%s satisfies the common interface', (key) => {
    const s = DUEL_STRATEGIES[key]({ ids: ['a', 'b'], runs: [['a'], ['b']] });
    for (const m of ['nextPair', 'reportResult', 'isDone', 'getSpine', 'getProgress', 'undoLast']) {
      expect(s[m], m).toBeTypeOf('function');
    }
    expect(typeof s.supportsSkip).toBe('boolean');
    if (s.supportsSkip) expect(s.skip).toBeTypeOf('function');
    expect(s.name).toBe(key);
    expect(s.label).toBe(DUEL_STRATEGY_LABELS[key]);
  });

  it('only elo supports skip', () => {
    const args = { ids: ['a', 'b'], runs: [['a'], ['b']] };
    expect(DUEL_STRATEGIES.elo(args).supportsSkip).toBe(true);
    expect(DUEL_STRATEGIES.mergeSort(args).supportsSkip).toBe(false);
    expect(DUEL_STRATEGIES.tierAwareMerge(args).supportsSkip).toBe(false);
  });

  it.each(['tierAwareMerge', 'mergeSort'])('%s through the registry ranks a small board correctly', (key) => {
    const truth = ['s1', 'a1', 's2', 'b1', 'a2'];
    const s = DUEL_STRATEGIES[key]({ ids: ['s1', 's2', 'a1', 'a2', 'b1'], runs: [['s1', 's2'], ['a1', 'a2'], ['b1']] });
    const { spine } = run(s, truth);
    // mergeSort can fully order; tierAware keeps each run's internal order.
    if (key === 'mergeSort') expect(spine).toEqual(truth);
    else expect(spine).toEqual(['s1', 'a1', 's2', 'b1', 'a2']);
  });
});

describe('merge generator', () => {
  it('merges with no questions when one side is empty', () => {
    const g = merge([], ['a', 'b']);
    expect(g.next()).toEqual({ done: true, value: ['a', 'b'] });
    expect(merge(['a'], []).next()).toEqual({ done: true, value: ['a'] });
  });

  it('asks [left, right] and follows the answers', () => {
    const g = merge(['a', 'c'], ['b']);
    expect(g.next().value).toEqual(['a', 'b']);
    expect(g.next(true).value).toEqual(['c', 'b']);
    expect(g.next(false)).toEqual({ done: true, value: ['a', 'b', 'c'] });
  });
});

describe('MergeSortStrategy', () => {
  it('0 items: done immediately, empty spine', () => {
    const s = new MergeSortStrategy([]);
    expect(s.isDone()).toBe(true);
    expect(s.nextPair()).toBeNull();
    expect(s.getSpine()).toEqual([]);
    expect(s.getProgress()).toEqual({ completed: 0, total: 0 });
  });

  it('1 item: done immediately', () => {
    const s = new MergeSortStrategy(['a']);
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual(['a']);
  });

  it('2 items: one duel', () => {
    const s = new MergeSortStrategy(['a', 'b']);
    expect(s.nextPair()).toEqual({ a: 'a', b: 'b' });
    expect(s.isDone()).toBe(false);
    expect(s.getSpine()).toBeNull();
    s.reportResult('b');
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual(['b', 'a']);
    expect(s.getProgress()).toEqual({ completed: 1, total: 2 });
  });

  it.each([3, 5, 8, 13, 32])('sorts %i items into the true order', (n) => {
    const truth = shuffled(ids(n), n);
    const { spine, asked } = run(new MergeSortStrategy(ids(n)), truth);
    expect(spine).toEqual(truth);
    expect(asked).toBeLessThanOrEqual(Math.ceil(n * Math.log2(n)));
  });

  it('never asks a duel after it is done, and reportResult then is ignored', () => {
    const s = new MergeSortStrategy(['a', 'b']);
    s.reportResult('a');
    s.reportResult('b');
    expect(s.getSpine()).toEqual(['a', 'b']);
    expect(s.getProgress().completed).toBe(1);
  });

  it('pairs never include an id outside the pool', () => {
    const pool = ids(10);
    const s = new MergeSortStrategy(pool);
    let p;
    while ((p = s.nextPair())) {
      expect(pool).toContain(p.a);
      expect(pool).toContain(p.b);
      expect(p.a).not.toBe(p.b);
      s.reportResult(p.a);
    }
    expect([...s.getSpine()].sort()).toEqual([...pool].sort());
  });

  it('undoLast replays to the previous question', () => {
    const s = new MergeSortStrategy(['a', 'b', 'c', 'd']);
    const first = s.nextPair();
    s.reportResult(first.a);
    const second = s.nextPair();
    s.undoLast();
    expect(s.nextPair()).toEqual(first);
    expect(s.getProgress().completed).toBe(0);
    s.reportResult(first.a);
    expect(s.nextPair()).toEqual(second);
  });

  it('undoLast can reverse the final answer', () => {
    const s = new MergeSortStrategy(['a', 'b']);
    s.reportResult('a');
    expect(s.isDone()).toBe(true);
    s.undoLast();
    expect(s.isDone()).toBe(false);
    s.reportResult('b');
    expect(s.getSpine()).toEqual(['b', 'a']);
  });

  it('undoLast with no answers is a no-op', () => {
    const s = new MergeSortStrategy(['a', 'b']);
    s.undoLast();
    expect(s.nextPair()).toEqual({ a: 'a', b: 'b' });
  });

  it('handles a duplicated id (same video twice) and terminates', () => {
    const { spine } = run(new MergeSortStrategy(['a', 'b', 'a']), ['a', 'b']);
    expect(spine).toHaveLength(3);
    expect(spine.filter((x) => x === 'a')).toHaveLength(2);
  });

  it('progress total never drops below completed', () => {
    const s = new MergeSortStrategy(ids(7));
    run(s, shuffled(ids(7), 3));
    const p = s.getProgress();
    expect(p.total).toBeGreaterThanOrEqual(p.completed);
  });

  it('does not mutate the input array', () => {
    const input = ['c', 'b', 'a'];
    run(new MergeSortStrategy(input), ['a', 'b', 'c']);
    expect(input).toEqual(['c', 'b', 'a']);
  });

  it('answers that are inconsistent (cyclic) still terminate with a permutation', () => {
    const s = new MergeSortStrategy(ids(6));
    let p;
    let i = 0;
    while ((p = s.nextPair())) s.reportResult(i++ % 2 ? p.a : p.b);
    expect([...s.getSpine()].sort()).toEqual(ids(6).sort());
  });
});

describe('TierAwareMergeStrategy', () => {
  it('no runs: done, empty spine', () => {
    const s = new TierAwareMergeStrategy([]);
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual([]);
    expect(s.getProgress()).toEqual({ completed: 0, total: 0 });
  });

  it('only empty runs: done, empty spine', () => {
    const s = new TierAwareMergeStrategy([[], [], []]);
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual([]);
  });

  it('a single run needs no duels and keeps its order', () => {
    const s = new TierAwareMergeStrategy([['a', 'b', 'c']]);
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual(['a', 'b', 'c']);
  });

  it('a single run surrounded by empty runs needs no duels', () => {
    const s = new TierAwareMergeStrategy([[], ['a', 'b'], []]);
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual(['a', 'b']);
  });

  it('two single-item runs: one duel', () => {
    const s = new TierAwareMergeStrategy([['s'], ['a']]);
    expect(s.nextPair()).toEqual({ a: 's', b: 'a' });
    s.reportResult('a');
    expect(s.getSpine()).toEqual(['a', 's']);
  });

  it('never asks a question within a run', () => {
    const runs = [['s1', 's2', 's3'], ['a1', 'a2'], ['b1', 'b2', 'b3'], ['c1'], ['d1', 'd2']];
    const tierOf = new Map(runs.flatMap((r, i) => r.map((id) => [id, i])));
    const s = new TierAwareMergeStrategy(runs);
    let p;
    while ((p = s.nextPair())) {
      expect(tierOf.get(p.a)).not.toBe(tierOf.get(p.b));
      s.reportResult(p.a);
    }
  });

  it('keeps each run’s internal order in the result', () => {
    const runs = [['s1', 's2', 's3'], ['a1', 'a2'], ['b1', 'b2']];
    const truth = shuffled(runs.flat(), 7);
    const { spine } = run(new TierAwareMergeStrategy(runs), truth);
    for (const r of runs) {
      const positions = r.map((id) => spine.indexOf(id));
      expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    }
    expect([...spine].sort()).toEqual(runs.flat().sort());
  });

  it('when the tiers are already right, the result is the tiers in order', () => {
    const runs = [['s1', 's2'], ['a1', 'a2'], ['b1'], ['c1', 'c2'], ['d1']];
    const { spine } = run(new TierAwareMergeStrategy(runs), runs.flat());
    expect(spine).toEqual(runs.flat());
  });

  it('a lower-tier song that wins every duel climbs to the top', () => {
    const runs = [['s1', 's2'], ['a1']];
    const { spine } = run(new TierAwareMergeStrategy(runs), ['a1', 's1', 's2']);
    expect(spine).toEqual(['a1', 's1', 's2']);
  });

  it('asks at most ~n*log2(k) duels', () => {
    const runs = [ids(10).map((x) => `s${x}`), ids(10).map((x) => `a${x}`), ids(10).map((x) => `b${x}`), ids(10).map((x) => `c${x}`), ids(10).map((x) => `d${x}`)];
    const s = new TierAwareMergeStrategy(runs);
    const { asked } = run(s, shuffled(runs.flat(), 11));
    expect(asked).toBeLessThanOrEqual(Math.ceil(50 * Math.log2(5)));
    expect(s.getProgress().total).toBe(Math.ceil(50 * Math.log2(5)));
  });

  it('does not mutate the runs passed in', () => {
    const runs = [['a'], ['b']];
    run(new TierAwareMergeStrategy(runs), ['b', 'a']);
    expect(runs).toEqual([['a'], ['b']]);
  });

  it('undoLast replays to the previous question', () => {
    const s = new TierAwareMergeStrategy([['s1', 's2'], ['a1', 'a2']]);
    const first = s.nextPair();
    s.reportResult(first.b);
    s.undoLast();
    expect(s.nextPair()).toEqual(first);
    expect(s.getProgress().completed).toBe(0);
  });

  it('undoLast without answers is a no-op', () => {
    const s = new TierAwareMergeStrategy([['a'], ['b']]);
    s.undoLast();
    expect(s.nextPair()).toEqual({ a: 'a', b: 'b' });
  });

  it('reportResult after done is ignored', () => {
    const s = new TierAwareMergeStrategy([['a'], ['b']]);
    s.reportResult('a');
    s.reportResult('b');
    expect(s.getSpine()).toEqual(['a', 'b']);
    expect(s.getProgress().completed).toBe(1);
  });

  it('a video present in two runs (duplicate across tiers) terminates and keeps both', () => {
    const { spine } = run(new TierAwareMergeStrategy([['x', 's'], ['x', 'a']]), ['x', 's', 'a']);
    expect(spine.filter((id) => id === 'x')).toHaveLength(2);
    expect(spine).toHaveLength(4);
  });

  it('odd number of runs (bye in a round)', () => {
    const runs = [['s'], ['a'], ['b']];
    const { spine } = run(new TierAwareMergeStrategy(runs), ['b', 'a', 's']);
    expect(spine).toEqual(['b', 'a', 's']);
  });
});

describe('EloStrategy', () => {
  afterEach(() => vi.restoreAllMocks());

  it('0 items: done at once with an empty spine', () => {
    const s = new EloStrategy([]);
    expect(s.isDone()).toBe(true);
    expect(s.nextPair()).toBeNull();
    expect(s.getSpine()).toEqual([]);
  });

  // BUG: with a single item, total = 1 * roundsPerItem = 4 but nextPair()
  // returns null (fewer than 2 ids), so the strategy is never done and
  // getSpine() stays null - DuelView then shows neither a pair nor a result
  // (a duel on a board with one ranked song hangs on Elo).
  it.fails('1 item: finishes with that item as the spine', () => {
    const s = new EloStrategy(['a']);
    expect(s.nextPair()).toBeNull();
    expect(s.isDone()).toBe(true);
    expect(s.getSpine()).toEqual(['a']);
  });

  it('runs roundsPerItem * n rounds', () => {
    const s = new EloStrategy(['a', 'b', 'c']);
    expect(s.getProgress()).toEqual({ completed: 0, total: 12 });
    const { asked } = run(s, ['a', 'b', 'c']);
    expect(asked).toBe(12);
    expect(s.isDone()).toBe(true);
  });

  it('respects custom rounds and k', () => {
    const s = new EloStrategy(['a', 'b'], { roundsPerItem: 1, k: 10 });
    expect(s.getProgress().total).toBe(2);
    s.nextPair();
    s.reportResult(s.current[0]);
    const r = [...s.ratings.values()].sort((x, y) => x - y);
    expect(r).toEqual([995, 1005]);
  });

  it('pairs are two different pool ids', () => {
    const pool = ids(6);
    const s = new EloStrategy(pool);
    let p;
    while ((p = s.nextPair())) {
      expect(p.a).not.toBe(p.b);
      expect(pool).toContain(p.a);
      expect(pool).toContain(p.b);
      s.reportResult(p.a);
    }
  });

  it('with consistent answers the spine is the true order (enough rounds)', () => {
    const truth = shuffled(ids(5), 5);
    const s = new EloStrategy(ids(5), { roundsPerItem: 40 });
    const { spine } = run(s, truth);
    expect(spine).toEqual(truth);
  });

  it('2 items: the winner is ranked first', () => {
    const s = new EloStrategy(['a', 'b']);
    const { spine } = run(s, ['b', 'a']);
    expect(spine).toEqual(['b', 'a']);
  });

  it('ratings are zero-sum', () => {
    const s = new EloStrategy(ids(4));
    run(s, shuffled(ids(4), 2));
    const sum = [...s.ratings.values()].reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(4000, 6);
  });

  it('skip does not spend a round or change ratings', () => {
    const s = new EloStrategy(['a', 'b']);
    s.nextPair();
    const before = new Map(s.ratings);
    s.skip();
    expect(s.getProgress().completed).toBe(0);
    expect(s.ratings).toEqual(before);
  });

  it('reportResult after skip (no current pair) is ignored', () => {
    const s = new EloStrategy(['a', 'b']);
    s.nextPair();
    s.skip();
    s.reportResult('a');
    expect(s.getProgress().completed).toBe(0);
  });

  it('reportResult before any nextPair is ignored', () => {
    const s = new EloStrategy(['a', 'b']);
    s.reportResult('a');
    expect(s.getProgress().completed).toBe(0);
  });

  it('undoLast restores ratings and the round count', () => {
    const s = new EloStrategy(['a', 'b', 'c']);
    s.nextPair();
    s.reportResult(s.current[0]);
    const snap = new Map(s.ratings);
    s.nextPair();
    s.reportResult(s.current[1]);
    s.undoLast();
    expect(s.ratings).toEqual(snap);
    expect(s.getProgress().completed).toBe(1);
    expect(s.current).toBeNull();
  });

  it('undoLast with no history is a no-op', () => {
    const s = new EloStrategy(['a', 'b']);
    s.undoLast();
    expect(s.getProgress().completed).toBe(0);
  });

  it('getSpine is null until done', () => {
    const s = new EloStrategy(['a', 'b']);
    expect(s.getSpine()).toBeNull();
  });

  it('nextPair returns null once done', () => {
    const s = new EloStrategy(['a', 'b'], { roundsPerItem: 1 });
    run(s, ['a', 'b']);
    expect(s.nextPair()).toBeNull();
  });

  it('a pool with a duplicated id plus others terminates', () => {
    const s = new EloStrategy(['x', 'x', 'y']);
    const { spine } = run(s, ['x', 'y']);
    expect(spine).toHaveLength(3);
  });

  // BUG: nextPair() loops `while (b === a)` re-drawing b at random, so a pool
  // of >= 2 entries that are all the same id (a song that's in two tiers, or
  // twice in one playlist, and nothing else ranked) never terminates - the
  // tab freezes. Skipped because it would hang the test run.
  it.skip('a pool of one video listed twice does not hang', () => {
    const s = new EloStrategy(['x', 'x']);
    expect(s.nextPair()).toBeNull();
  });

  it('pairing uses Math.random (deterministic under a mock)', () => {
    const seq = [0, 0.9];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);
    const s = new EloStrategy(['a', 'b', 'c']);
    expect(s.nextPair()).toEqual({ a: 'a', b: 'c' });
  });
});
