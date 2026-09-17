import { MergeSortStrategy } from './mergeSortStrategy';
import { EloStrategy } from './eloStrategy';
import { TierAwareMergeStrategy } from './tierAwareMergeStrategy';

// Registry of interchangeable duel strategies. Every entry must satisfy the
// same shape: nextPair(), reportResult(id), isDone(), getSpine(),
// getProgress(), supportsSkip, skip()?, undoLast()?, label. Adding a new
// ranking algorithm (e.g. a binary-insertion strategy, a tournament-bracket
// strategy) means adding one more entry here - nothing else in the duel UI
// needs to change.
//
// Factories take { ids, runs }: ids is the flat pool (any order), runs is
// the pool already grouped by current tier (T1's ids first, ... TZ's last).
// Each strategy only reads whichever shape its algorithm actually needs.
export const DUEL_STRATEGIES = {
  tierAwareMerge: ({ runs }) => new TierAwareMergeStrategy(runs),
  mergeSort: ({ ids }) => new MergeSortStrategy(ids),
  elo: ({ ids }) => new EloStrategy(ids),
};

export const DUEL_STRATEGY_LABELS = {
  tierAwareMerge: new TierAwareMergeStrategy([]).label,
  mergeSort: new MergeSortStrategy([]).label,
  elo: new EloStrategy([]).label,
};

export const DEFAULT_DUEL_STRATEGY = 'tierAwareMerge';
