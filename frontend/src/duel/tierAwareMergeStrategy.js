import { merge } from './mergeGenerator';

// Merges k already-grouped runs pairwise, tournament-style, until one run is
// left. Never asks a question *within* a run - only ever resolves order
// *between* runs - which is what makes this cheap: merging k sorted runs of
// total size n costs about n*log2(k) comparisons, independent of n*log2(n).
function* kWayMerge(runs) {
  let level = runs.filter((r) => r.length > 0);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(yield* merge(level[i], level[i + 1]));
      } else {
        next.push(level[i]);
      }
    }
    level = next;
  }
  return level[0] || [];
}

function estimateComparisons(runs) {
  const n = runs.reduce((sum, r) => sum + r.length, 0);
  const k = runs.filter((r) => r.length > 0).length;
  if (n === 0 || k <= 1) return 0;
  return Math.ceil(n * Math.log2(k));
}

/**
 * DuelStrategy contract: constructor(runs), nextPair(), reportResult(winnerId),
 * isDone(), getSpine(), getProgress(), supportsSkip.
 *
 * Takes your *existing* tier groupings as already-correct runs (T1's videos
 * are assumed better than T2's, and so on) and only asks duels to resolve
 * order *between* runs during merging - never within one. That trust is
 * exactly what cuts the duel count from a full from-scratch sort's
 * ~n*log2(n) down to ~n*log2(k), where k is the number of tiers (typically
 * 5) - roughly a 3-4x reduction for a real library. The tradeoff: a video
 * badly misfiled deep inside the wrong tier won't get corrected unless it
 * happens to win enough cross-tier duels to climb out during merging.
 */
export class TierAwareMergeStrategy {
  name = 'tierAwareMerge';
  label = 'Tier-aware merge (fewest duels, trusts current tiers)';
  supportsSkip = false;

  constructor(runs) {
    this.runs = runs.map((r) => [...r]);
    this.answers = [];
    this.total = estimateComparisons(this.runs);
    this.completed = 0;
    this.gen = kWayMerge(this.runs);
    this.step = this.gen.next();
  }

  nextPair() {
    if (this.step.done) return null;
    const [a, b] = this.step.value;
    return { a, b };
  }

  reportResult(winnerId) {
    if (this.step.done) return;
    const [a] = this.step.value;
    const leftWins = winnerId === a;
    this.answers.push(leftWins);
    this.completed += 1;
    this.step = this.gen.next(leftWins);
  }

  undoLast() {
    if (this.answers.length === 0) return;
    this.answers.pop();
    this.gen = kWayMerge(this.runs);
    this.step = this.gen.next();
    this.completed = 0;
    for (const answer of this.answers) {
      this.step = this.gen.next(answer);
      this.completed += 1;
    }
  }

  isDone() {
    return this.step.done;
  }

  getSpine() {
    return this.isDone() ? this.step.value : null;
  }

  getProgress() {
    return { completed: this.completed, total: Math.max(this.total, this.completed) };
  }
}
