import { TODO_TIER, TIER_ORDER } from '../tiers';

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
  if (reason.kind === 'PLACE') {
    if (!songA.tier) {
      return `${a} is new: each duel against an anchor halves where it could land. Right now it's most likely ${tierName(songA.bestTier)} (${pct(songA.bestProbability)}); ${b} is ${opponent} from the middle of that range.`;
    }
    return `Finding ${a}'s true spot: ${b} is ${opponent} from the middle of where it could be.`;
  }
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
export function outcomeText(after, name, tierName, threshold = 0.85) {
  if (!after?.bestTier) return '';
  const best = tierName(after.bestTier);
  const p = pct(after.bestProbability);
  if (!after.tier) {
    return after.bestProbability >= threshold && after.duels >= 4
      ? `${name} is ${p} ${best} - a placement is ready to review.`
      : `${name} is now most likely ${best} (${p}).`;
  }
  if (after.bestTier === after.tier) return `${name} looks like a solid ${best} (${p}).`;
  if (after.bestProbability >= threshold && after.duels >= 4) return `${name} is now ${p} ${best} - a move is ready to review.`;
  const dir = TIER_ORDER.indexOf(after.bestTier) < TIER_ORDER.indexOf(after.tier) ? 'up' : 'down';
  return `${name} is now ${p} ${best} - leaning ${dir}, not decided yet.`;
}

export function moveKind(from, to) {
  if (from === TODO_TIER) return 'new';
  return TIER_ORDER.indexOf(to) < TIER_ORDER.indexOf(from) ? 'up' : 'down';
}

export const record = (s) => `${s.wins}–${s.losses}–${s.draws}`;

// Where an accepted move lands in its new tier: among that tier's songs by
// score, best first (`muOf(id)` -> score; songs without one go last).
export function dropIndexByScore(targetIds, mu, muOf) {
  const i = targetIds.findIndex((id) => (muOf(id) ?? -Infinity) < mu);
  return i < 0 ? targetIds.length : i;
}
