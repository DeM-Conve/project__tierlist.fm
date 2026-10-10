import { describe, expect, it } from 'vitest';
import { createSession, estimateDuels, ladderChanges } from './sessions';

// A simulated listener: `truth` is the real order, best first; tier picks come
// from `tierOf`.
function drive(session, truth, tierOf = () => 'S', limit = 1000) {
  const rank = new Map(truth.map((id, i) => [id, i]));
  let s = session;
  for (let n = 0; s.request && n < limit; n++) {
    const r = s.request;
    s = s.answer(r.kind === 'tier' ? tierOf(r.id) : rank.get(r.a) < rank.get(r.b) ? r.a : r.b);
  }
  expect(s.request).toBeNull();
  return s;
}

const board = (extra = {}) => ({ S: ['s1', 's2'], A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'], C: [], D: [], TODO: [], ...extra });

describe('place mode', () => {
  it('binary-searches a to-do song into the tier picked for it', () => {
    const truth = ['s1', 's2', 'a1', 'a2', 'new', 'a3', 'b1', 'b2'];
    const s = drive(createSession('place', board({ TODO: ['new'] })), truth, () => 'A');
    expect(s.ladder.A).toEqual(['a1', 'a2', 'new', 'a3']);
    expect(s.ladder.TODO).toEqual([]);
    expect(s.duels).toBeLessThanOrEqual(2);
  });

  it('climbs a tier when it beats the top of its tier and the bottom of the one above', () => {
    const truth = ['s1', 'new', 's2', 'a1', 'a2', 'a3', 'b1', 'b2'];
    const s = drive(createSession('place', board({ TODO: ['new'] })), truth, () => 'A');
    expect(s.ladder.S).toEqual(['s1', 'new', 's2']);
    expect(s.ladder.A).toEqual(['a1', 'a2', 'a3']);
  });

  it('drops a tier when it loses to the bottom of its tier and the top of the one below', () => {
    const truth = ['s1', 's2', 'a1', 'a2', 'a3', 'b1', 'new', 'b2'];
    const s = drive(createSession('place', board({ TODO: ['new'] })), truth, () => 'A');
    expect(s.ladder.B).toEqual(['b1', 'new', 'b2']);
  });

  it('places every to-do song in turn, into an empty tier too', () => {
    const truth = ['s1', 's2', 'a1', 'a2', 'a3', 'b1', 'b2', 'x', 'y'];
    const s = drive(createSession('place', board({ TODO: ['y', 'x'] })), truth, () => 'C');
    expect(s.ladder.C).toEqual(['x', 'y']);
    expect(s.result.map((p) => p.id)).toEqual(['y', 'x']);
  });

  it("can't decide puts it right next to that song", () => {
    let s = createSession('place', board({ TODO: ['new'] })).answer('A');
    expect(s.request.b).toBe('a2');
    s = s.answer(null);
    while (s.request) s = s.answer(s.request.b); // keep it below the edge
    expect(s.ladder.A.indexOf('new')).toBe(1);
  });

  it('undo replays every answer but the last', () => {
    const s = createSession('place', board({ TODO: ['new'] })).answer('A');
    const pair = s.request;
    const back = s.answer(pair.a).undo();
    expect(back.request).toEqual(pair);
    expect(back.undo().request).toEqual({ kind: 'tier', id: 'new' });
  });
});

describe('tune mode', () => {
  it('swaps songs across a border when the lower one wins, keeping tier sizes', () => {
    const truth = ['s1', 'a1', 's2', 'a2', 'a3', 'b1', 'b2'];
    const s = drive(createSession('tune', board(), { depth: 1 }), truth);
    expect(s.ladder.S).toEqual(['s1', 'a1']);
    expect(s.ladder.A).toEqual(['s2', 'a2', 'a3']);
    expect(s.duels).toBe(2); // S|A and A|B; empty C/D skipped
  });

  it('asks nothing it already agrees with beyond the border duels', () => {
    const truth = ['s1', 's2', 'a1', 'a2', 'a3', 'b1', 'b2'];
    const s = drive(createSession('tune', board()), truth);
    expect(ladderChanges(board(), s.ladder)).toEqual([]);
    // 2 borders x 3 deep, minus the pairs a 2-song tier can't fill.
    expect(s.duels).toBe(4);
    expect(estimateDuels('tune', board())).toBe(6);
  });
});

describe('order mode', () => {
  it('fully sorts one tier', () => {
    const truth = ['a3', 'a1', 'a2'];
    const s = drive(createSession('order', board(), { tier: 'A' }), truth);
    expect(s.ladder.A).toEqual(['a3', 'a1', 'a2']);
    expect(s.ladder.S).toEqual(['s1', 's2']);
  });
});

describe('ladderChanges', () => {
  it('lists moved songs with where they came from', () => {
    const changes = ladderChanges({ S: ['x'], A: ['y'] }, { S: ['y'], A: ['x'] });
    expect(changes).toEqual([
      { id: 'y', from: { tier: 'A', index: 0 }, to: { tier: 'S', index: 0 } },
      { id: 'x', from: { tier: 'S', index: 0 }, to: { tier: 'A', index: 0 } },
    ]);
  });
});
