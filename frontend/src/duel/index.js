import { MergeSortStrategy } from './mergeSortStrategy';
import { EloStrategy } from './eloStrategy';

// Registry of interchangeable duel strategies. Every entry must satisfy the
// same shape: constructor(ids) -> { nextPair(), reportResult(id), isDone(),
// getSpine(), getProgress(), supportsSkip, skip()? , label }. Adding a new
// ranking algorithm (e.g. a simple insertion-sort strategy, a
// tournament-bracket strategy) means adding one more entry here - nothing
// else in the duel UI needs to change.
export const DUEL_STRATEGIES = {
  mergeSort: (ids) => new MergeSortStrategy(ids),
  elo: (ids) => new EloStrategy(ids),
};

export const DUEL_STRATEGY_LABELS = {
  mergeSort: new MergeSortStrategy([]).label,
  elo: new EloStrategy([]).label,
};
