import { TIER_ORDER } from '../tiers';

// Words and small calculations for the duel screens - kept out of the
// components so they're testable without React. The ranking itself is the
// backend's (fm.tierlist.duel.engine); nothing here decides anything.

export const pct = (p) => `${Math.round((p ?? 0) * 100)}%`;

// Score as shown: the engine's mu x 10, so a duel moves it by whole numbers.
export const score = (mu) => Math.round(mu * 10);
export const scoreDelta = (before, after) => {
  const d = score(after) - score(before);
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0';
};

// The five verdicts, from A's side, with their keys.
export const VERDICTS = [
  { verdict: 'A_CLEARLY', label: 'A, clearly', keys: ['⇧', '←'] },
  { verdict: 'A', label: 'A', keys: ['←'] },
  { verdict: 'TOO_CLOSE', label: 'Too close', keys: ['↓'] },
  { verdict: 'B', label: 'B', keys: ['→'] },
  { verdict: 'B_CLEARLY', label: 'B, clearly', keys: ['⇧', '→'] },
];

export function verdictForKey(e) {
  if (e.key === 'ArrowLeft') return e.shiftKey ? 'A_CLEARLY' : 'A';
  if (e.key === 'ArrowRight') return e.shiftKey ? 'B_CLEARLY' : 'B';
  if (e.key === 'ArrowDown') return 'TOO_CLOSE';
  return null;
}

// A song's tiers, most likely first.
export function likelyTiers(song, n = TIER_ORDER.length) {
  return Object.entries(song?.probabilities ?? {})
    .map(([tier, p]) => ({ tier, p }))
    .sort((x, y) => y.p - x.p)
    .slice(0, n);
}

// "Why this duel" for a matchup (`name(id)` and `tierName(tier)` render names).
export function reasonText(matchup, name, tierName) {
  const { reason, songA, songB } = matchup;
  const a = name(matchup.a);
  const b = name(matchup.b);
  const opponent = songB.tier ? `a ${songB.onFence ? '' : 'settled '}${tierName(songB.tier)} song` : 'a song';
  if (!reason.upperTier) return `${a} against ${b}.`;
  const up = songA.probabilities?.[reason.upperTier] ?? 0;
  return `${a} sits near the ${tierName(reason.upperTier)} / ${tierName(reason.lowerTier)} border - ${pct(up)} likely ${tierName(reason.upperTier)}. ${b} is ${opponent} near that border, so this result tells the most.`;
}

// The headline after a verdict.
export function verdictHeadline(verdict, nameA, nameB) {
  return {
    A_CLEARLY: `${nameA}, clearly.`,
    A: `${nameA} edges it.`,
    TOO_CLOSE: 'Too close to call.',
    B: `${nameB} edges it.`,
    B_CLEARLY: `${nameB}, clearly.`,
  }[verdict];
}

// What the verdict did to a song (`after` = its state now), in a sentence.
// Every duelled song is ranked: to-do songs are never part of duels.
export function outcomeText(after, name, tierName, threshold = 0.85) {
  if (!after?.bestTier) return '';
  const best = tierName(after.bestTier);
  const p = pct(after.bestProbability);
  if (after.bestTier === after.tier) return `${name} looks like a solid ${best} (${p}).`;
  if (after.bestProbability >= threshold && after.duels >= 4) return `${name} is now ${p} ${best} - a move is ready to review.`;
  const dir = TIER_ORDER.indexOf(after.bestTier) < TIER_ORDER.indexOf(after.tier) ? 'up' : 'down';
  return `${name} is now ${p} ${best} - leaning ${dir}, not decided yet.`;
}

// Every move is between ranked tiers: to-do songs never get a suggestion.
export function moveKind(from, to) {
  return TIER_ORDER.indexOf(to) < TIER_ORDER.indexOf(from) ? 'up' : 'down';
}

export const record = (s) => `${s.wins}–${s.losses}–${s.draws}`;

// How sure a move is, in words: the confidence (from the engine) is the
// chance the song belongs in the new tier *or beyond*.
export function confidenceText(s, tierName) {
  const beyond = moveKind(s.from, s.to) === 'up' ? ' or higher' : ' or lower';
  return `${pct(s.confidence)} ${tierName(s.to)}${beyond}`;
}

// What a "leaning" move still lacks (the API's `unmet`), one phrase each.
export function shortfallText(u) {
  switch (u.kind) {
    case 'CONFIDENCE': return `needs ${pct(u.need)}`;
    case 'DUELS': return `${u.have} of ${u.need} duels`;
    case 'BORDER_OPPONENTS': return `${u.have} of ${u.need} opponents near the border`;
    case 'FRESH_DUELS': return `${u.have} of ${u.need} fresh duels since Keep`;
    default: return 'locked';
  }
}

// "83% B or higher · needs 85% · 3 of 4 duels".
export const leaningText = (s, tierName) => [confidenceText(s, tierName), ...(s.unmet ?? []).map(shortfallText)].join(' · ');

// "84% · needs 85%": a leaning move's confidence against the bar it hasn't reached.
export function leaningConfidence(s) {
  const bar = (s.unmet ?? []).find((u) => u.kind === 'CONFIDENCE');
  return bar ? `${pct(s.confidence)} · needs ${pct(bar.need)}` : pct(s.confidence);
}

// A tier's proposed order against the board's: each song at its new place
// with where it was (1-based positions - ranks are positions) and how far it
// moved (+ = up). Display only; the order itself is the engine's.
export function orderChanges(current, proposed) {
  const was = new Map();
  current.forEach((id, i) => was.has(id) || was.set(id, i + 1));
  return proposed.map((id, i) => {
    const from = was.get(id) ?? null;
    return { id, from, to: i + 1, delta: from == null ? 0 : from - (i + 1) };
  });
}

// Where an accepted move lands in its new tier: among that tier's songs by
// score, best first (`muOf(id)` -> score; songs without one go last).
export function dropIndexByScore(targetIds, mu, muOf) {
  const i = targetIds.findIndex((id) => (muOf(id) ?? -Infinity) < mu);
  return i < 0 ? targetIds.length : i;
}

// What a fresher analysis changes about the suggestions on screen: songs it
// newly suggests and songs it no longer suggests. Songs already decided on
// the page don't count - their rows stay as decided either way.
export function suggestionChanges(shown, latest, decided = {}) {
  if (!shown || !latest || shown === latest) return { added: [], gone: [] };
  const songs = (a) => new Set(a.suggestions.map((s) => s.song));
  const before = songs(shown);
  const after = songs(latest);
  return {
    added: latest.suggestions.filter((s) => !before.has(s.song) && !decided[s.song]),
    gone: shown.suggestions.filter((s) => !after.has(s.song) && !decided[s.song]),
  };
}
