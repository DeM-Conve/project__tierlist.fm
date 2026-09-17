// Interactive merge sort: a human answers "which of these two wins?" wherever
// the algorithm would normally call its own comparator. Written as a
// generator so the recursive merge sort can pause mid-comparison and resume
// once the caller supplies an answer via .next(leftWins).
function* mergeSort(items) {
  if (items.length <= 1) return items;
  const mid = Math.floor(items.length / 2);
  const left = yield* mergeSort(items.slice(0, mid));
  const right = yield* mergeSort(items.slice(mid));
  return yield* merge(left, right);
}

function* merge(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const leftWins = yield [left[i], right[j]];
    if (leftWins) result.push(left[i++]);
    else result.push(right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}

function estimateComparisons(n) {
  if (n <= 1) return 0;
  return Math.ceil(n * Math.log2(n));
}

/**
 * DuelStrategy contract: constructor(ids), nextPair(), reportResult(winnerId),
 * isDone(), getSpine(), getProgress(), supportsSkip.
 *
 * Produces a full, exact ranking in ~n*log2(n) comparisons - the fewest
 * duels needed to fully order the set, at the cost of not tolerating a
 * genuine "skip" (merge sort's next step depends on every answer).
 */
export class MergeSortStrategy {
  name = 'mergeSort';
  label = 'Merge sort (fewest duels)';
  supportsSkip = false;

  constructor(ids) {
    this.ids = [...ids];
    this.answers = [];
    this.total = estimateComparisons(ids.length);
    this.completed = 0;
    this.gen = mergeSort(this.ids);
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

  // Merge sort's next question depends deterministically on every prior
  // answer (not on randomness), so undo just replays every answer except
  // the last one into a fresh generator.
  undoLast() {
    if (this.answers.length === 0) return;
    this.answers.pop();
    this.gen = mergeSort(this.ids);
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
