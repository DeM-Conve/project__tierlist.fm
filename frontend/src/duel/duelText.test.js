import { describe, expect, it } from 'vitest';
import {
  confidenceText, dropIndexByScore, leaningConfidence, leaningText, likelyTiers, moveKind, orderChanges, shortfallText, outcomeText, pct, reasonText, record, scoreDelta, suggestionChanges, verdictForKey, verdictHeadline,
} from './duelText';

const name = (id) => ({ n1: 'Nayaab', m1: 'Melancholy' })[id] ?? id;
const tierName = (t) => ({ S: 'T1', A: 'T2', B: 'T3', TODO: 'TODO' })[t] ?? t;
const song = (over) => ({ id: 'n1', tier: 'A', probabilities: { S: 0.58, A: 0.39, B: 0.03 }, bestTier: 'S', bestProbability: 0.58, duels: 3, onFence: true, ...over });

describe('duelText', () => {
  it('formats percentages, scores and records', () => {
    expect(pct(0.584)).toBe('58%');
    expect(scoreDelta(25, 28.1)).toBe('+31');
    expect(scoreDelta(25, 23.6)).toBe('−14');
    expect(scoreDelta(25, 25)).toBe('±0');
    expect(record({ wins: 7, losses: 1, draws: 1 })).toBe('7–1–1');
  });

  it('maps keys to the five verdicts', () => {
    expect(verdictForKey({ key: 'ArrowLeft', shiftKey: true })).toBe('A_CLEARLY');
    expect(verdictForKey({ key: 'ArrowLeft' })).toBe('A');
    expect(verdictForKey({ key: 'ArrowDown' })).toBe('TOO_CLOSE');
    expect(verdictForKey({ key: 'ArrowRight' })).toBe('B');
    expect(verdictForKey({ key: 'ArrowRight', shiftKey: true })).toBe('B_CLEARLY');
    expect(verdictForKey({ key: 'x' })).toBeNull();
  });

  it('lists a song\'s likeliest tiers first', () => {
    expect(likelyTiers(song(), 2).map((x) => x.tier)).toEqual(['S', 'A']);
    expect(likelyTiers(null)).toEqual([]);
  });

  it('explains a border duel', () => {
    const border = { a: 'n1', b: 'm1', reason: { kind: 'BORDER', upperTier: 'S', lowerTier: 'A' }, songA: song(), songB: song({ id: 'm1', tier: 'S', onFence: false }) };
    expect(reasonText(border, name, tierName)).toBe(
      'Nayaab sits near the T1 / T2 border - 58% likely T1. Melancholy is a settled T1 song near that border, so this result tells the most.');
    expect(reasonText({ ...border, reason: { kind: 'BORDER' } }, name, tierName)).toBe('Nayaab against Melancholy.');
  });

  it('headlines and outcomes', () => {
    expect(verdictHeadline('A_CLEARLY', 'Nayaab', 'Melancholy')).toBe('Nayaab, clearly.');
    expect(verdictHeadline('B', 'Nayaab', 'Melancholy')).toBe('Melancholy edges it.');
    expect(outcomeText(song(), 'Nayaab', tierName)).toBe('Nayaab is now 58% T1 - leaning up, not decided yet.');
    expect(outcomeText(song({ bestProbability: 0.9, duels: 5 }), 'Nayaab', tierName)).toBe('Nayaab is now 90% T1 - a move is ready to review.');
    expect(outcomeText(song({ bestTier: 'A', bestProbability: 0.7 }), 'Nayaab', tierName)).toBe('Nayaab looks like a solid T2 (70%).');
    expect(outcomeText(song({ tier: 'S', bestTier: 'A' }), 'Nayaab', tierName)).toMatch(/leaning down/);
    expect(outcomeText(null, 'x', tierName)).toBe('');
  });

  it('move kinds and where a move lands', () => {
    expect(moveKind('A', 'S')).toBe('up');
    expect(moveKind('S', 'B')).toBe('down');
    const mu = { x: 30, y: 25, z: 20 };
    expect(dropIndexByScore(['x', 'y', 'z'], 26, (id) => mu[id])).toBe(1);
    expect(dropIndexByScore(['x', 'y', 'z'], 10, (id) => mu[id])).toBe(3);
    expect(dropIndexByScore(['x', 'q'], 26, (id) => mu[id])).toBe(1);
  });
});

describe('leaning moves and tier orders', () => {
  const name = (t) => `T${'SABCD'.indexOf(t) + 1}`;
  it('says how sure a move is, by direction', () => {
    expect(confidenceText({ from: 'C', to: 'B', confidence: 0.834 }, name)).toBe('83% T3 or higher');
    expect(confidenceText({ from: 'B', to: 'C', confidence: 0.72 }, name)).toBe('72% T4 or lower');
  });
  it('lists what a leaning move lacks', () => {
    const s = { from: 'C', to: 'B', confidence: 0.83, unmet: [{ kind: 'CONFIDENCE', have: 0.83, need: 0.85 }, { kind: 'DUELS', have: 3, need: 4 }] };
    expect(leaningText(s, name)).toBe('83% T3 or higher · needs 85% · 3 of 4 duels');
    expect(shortfallText({ kind: 'BORDER_OPPONENTS', have: 1, need: 2 })).toBe('1 of 2 opponents near the border');
    expect(leaningConfidence(s)).toBe('83% · needs 85%');
    expect(leaningConfidence({ confidence: 0.9, unmet: [{ kind: 'DUELS', have: 3, need: 4 }] })).toBe('90%');
  });
  it('maps a proposed order onto the board order', () => {
    expect(orderChanges(['a', 'b', 'c', 'a'], ['b', 'a', 'c'])).toEqual([
      { id: 'b', from: 2, to: 1, delta: 1 },
      { id: 'a', from: 1, to: 2, delta: -1 },
      { id: 'c', from: 3, to: 3, delta: 0 },
    ]);
  });
});

describe('suggestionChanges', () => {
  const s = (song) => ({ song, from: 'B', to: 'A', confidence: 0.9 });
  const shown = { suggestions: [s('a'), s('b')] };

  it('names songs a fresher analysis adds or drops', () => {
    const latest = { suggestions: [s('b'), s('c')] };
    const { added, gone } = suggestionChanges(shown, latest);
    expect(added.map((x) => x.song)).toEqual(['c']);
    expect(gone.map((x) => x.song)).toEqual(['a']);
  });

  it('leaves out songs already decided on the page', () => {
    const latest = { suggestions: [s('b'), s('c')] };
    expect(suggestionChanges(shown, latest, { a: {}, c: {} })).toEqual({ added: [], gone: [] });
  });

  it('is empty for the same analysis or before either loads', () => {
    expect(suggestionChanges(shown, shown)).toEqual({ added: [], gone: [] });
    expect(suggestionChanges(null, shown)).toEqual({ added: [], gone: [] });
    expect(suggestionChanges(shown, undefined)).toEqual({ added: [], gone: [] });
  });
});
