/**
 * Elo-rating strategy: repeatedly duels random pairs and adjusts a rating
 * per item, same idea chess ratings use. Runs for a fixed number of rounds
 * (proportional to set size) then sorts by final rating. Unlike merge sort,
 * a "too close to call" skip is cheap here - it just doesn't touch either
 * rating and doesn't consume a round, whereas merge sort's next step
 * depends on every answer.
 */
export class EloStrategy {
  name = 'elo';
  label = 'Elo rating (tolerates skips)';
  supportsSkip = true;

  constructor(ids, { roundsPerItem = 4, k = 32 } = {}) {
    this.ids = [...ids];
    this.ratings = new Map(ids.map((id) => [id, 1000]));
    this.total = ids.length * roundsPerItem;
    this.completed = 0;
    this.k = k;
    this.current = null;
    this.history = []; // snapshots taken before each reportResult, for undo
  }

  nextPair() {
    if (this.completed >= this.total || this.ids.length < 2) return null;
    let a = this.ids[Math.floor(Math.random() * this.ids.length)];
    let b = a;
    while (b === a) {
      b = this.ids[Math.floor(Math.random() * this.ids.length)];
    }
    this.current = [a, b];
    return { a, b };
  }

  reportResult(winnerId) {
    if (!this.current) return;
    this.history.push({ ratings: new Map(this.ratings), completed: this.completed });

    const [a, b] = this.current;
    const loserId = winnerId === a ? b : a;
    const ra = this.ratings.get(winnerId);
    const rb = this.ratings.get(loserId);
    const expectedWin = 1 / (1 + 10 ** ((rb - ra) / 400));
    this.ratings.set(winnerId, ra + this.k * (1 - expectedWin));
    this.ratings.set(loserId, rb - this.k * (1 - expectedWin));
    this.completed += 1;
  }

  skip() {
    // No rating change; just move on without spending a round.
    this.current = null;
  }

  // Elo's next pair is picked at random, so replaying history can't
  // reproduce the same sequence of matchups - undo instead restores the
  // rating snapshot from just before the last verdict.
  undoLast() {
    const snapshot = this.history.pop();
    if (!snapshot) return;
    this.ratings = snapshot.ratings;
    this.completed = snapshot.completed;
    this.current = null;
  }

  isDone() {
    return this.completed >= this.total;
  }

  getSpine() {
    if (!this.isDone()) return null;
    return [...this.ids].sort((x, y) => this.ratings.get(y) - this.ratings.get(x));
  }

  getProgress() {
    return { completed: this.completed, total: this.total };
  }
}
