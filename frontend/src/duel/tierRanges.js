import { TIER_ORDER } from '../tiers';
import { score } from './duelText';

// Settings -> Duels -> Tier borders: where the duel engine draws the line
// between tiers. Words, validation and a display-only preview - the engine
// itself (backend FixedCutpointsTierModel) decides every probability and move.
//
// The scale is the score every duel page shows (duelText `score()`, backend
// ScoreScale: the engine's mu x 10). The user sets each ranked tier's lowest
// score; the bottom tier is everything below the one above it.

// Backend TierBorderMode keys.
export const BORDER_MODES = { learned: 'learned', custom: 'custom' };

// The tiers that have a minimum, best first (the last ranked tier has none).
export const TIERS_WITH_MINIMUM = TIER_ORDER.slice(0, -1);
export const BOTTOM_TIER = TIER_ORDER[TIER_ORDER.length - 1];

// Same bounds as the backend (DuelSettings MIN_SCORE / MAX_SCORE, V3's CHECK).
export const MIN_SCORE = 0;
export const MAX_SCORE = 1000;

// A starting point when nothing better is known: the engine's a-priori
// borders (a fresh board's tiers sit 60 points apart around 250).
export const DEFAULT_MINIMUMS = { S: 340, A: 280, B: 220, C: 160 };

// { [tier]: message } for the first problem on each tier; {} = valid.
// `tierName` renders a tier's name for the messages.
export function validateMinimums(minimums, tierName = (t) => t) {
  const errors = {};
  TIERS_WITH_MINIMUM.forEach((tier, i) => {
    const v = minimums?.[tier];
    if (v === '' || v == null || Number.isNaN(Number(v))) errors[tier] = 'Enter a score';
    else if (!Number.isInteger(Number(v))) errors[tier] = 'Use a whole number';
    else if (Number(v) < MIN_SCORE || Number(v) > MAX_SCORE) errors[tier] = `Between ${MIN_SCORE} and ${MAX_SCORE}`;
    else if (i > 0 && errors[TIERS_WITH_MINIMUM[i - 1]] == null && Number(v) >= Number(minimums[TIERS_WITH_MINIMUM[i - 1]])) {
      errors[tier] = `Must be below ${tierName(TIERS_WITH_MINIMUM[i - 1])}'s ${minimums[TIERS_WITH_MINIMUM[i - 1]]}`;
    }
  });
  return errors;
}

export const isValidMinimums = (minimums) => Object.keys(validateMinimums(minimums)).length === 0;

// Every ranked tier's range, best first: { tier, from, to } in whole shown
// scores (from null = no floor, to null = no ceiling). Only for valid minimums.
export function tierRanges(minimums) {
  return TIER_ORDER.map((tier, i) => {
    const above = i === 0 ? null : Number(minimums[TIER_ORDER[i - 1]]) - 1;
    const from = tier === BOTTOM_TIER ? null : Number(minimums[tier]);
    return { tier, from, to: above };
  });
}

// "340 and up", "280 – 339", "below 160".
export function rangeText({ from, to }) {
  if (to == null) return `${from} and up`;
  if (from == null) return `below ${to + 1}`;
  return `${from} – ${to}`;
}

// Minimums from an analysis' borders (each border is the bottom of its upper
// tier, engine scale), for tiers the board has; the rest from DEFAULT_MINIMUMS.
// Falls back to the defaults entirely if the mix isn't strictly descending.
export function minimumsFromBorders(borders) {
  const out = { ...DEFAULT_MINIMUMS };
  (borders ?? []).forEach((b) => {
    if (b.upper in out) out[b.upper] = Math.min(MAX_SCORE, Math.max(MIN_SCORE, score(b.score)));
  });
  return isValidMinimums(out) ? out : { ...DEFAULT_MINIMUMS };
}

// Preview (display only): how many of the analysis' ranked songs have a
// shown score inside each tier's range. { [tier]: count }.
export function previewCounts(songs, minimums) {
  const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  (songs ?? []).filter((s) => s.tier).forEach((s) => {
    const shown = score(s.mu);
    const tier = TIERS_WITH_MINIMUM.find((t) => shown >= Number(minimums[t])) ?? BOTTOM_TIER;
    counts[tier] += 1;
  });
  return counts;
}
