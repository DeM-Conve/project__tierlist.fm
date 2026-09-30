import { describe, expect, it } from 'vitest';
import reducer, {
  closeFocus,
  cycleRepeat,
  enqueue,
  expandPlayer,
  floatPlayer,
  jumpInQueue,
  minimizePlayer,
  moveInQueue,
  openFocus,
  playNextInQueue,
  playPrevInQueue,
  removeFromQueue,
  reorderUpcoming,
  setFocusedVideo,
  startShuffle,
} from './focusSlice';

const v = (id) => ({ videoId: id, title: `Song ${id}` });
const e = (tier, id) => ({ tier, video: v(id) });
const init = () => reducer(undefined, { type: '@@init' });

const ENTRIES = [e('S', 'a'), e('S', 'b'), e('A', 'c'), e('B', 'd'), e('TODO', 't')];
const QUEUE = ENTRIES.map((x) => x.video.videoId);

const open = (videoId = 'a', extra = {}) =>
  reducer(init(), openFocus({ tier: undefined, videoId, queue: QUEUE, entries: ENTRIES, category: 'Rap', ...extra }));

const idsOf = (list) => list.map((x) => x.video.videoId);
const cur = (s) => s.current?.video.videoId ?? null;

describe('focusSlice initial state', () => {
  it('nothing playing', () => {
    const s = init();
    expect(s.focusedVideo).toBeNull();
    expect(s.current).toBeNull();
    expect(s.history).toEqual([]);
    expect(s.upcoming).toEqual([]);
    expect(s.repeatMode).toBe('off');
    expect(s.playerMode).toBe('expanded');
    expect(s.isShuffling).toBe(false);
    expect(s.isTriage).toBe(false);
  });
});

describe('openFocus', () => {
  it('starts at the given video with earlier songs in history', () => {
    const s = open('c');
    expect(cur(s)).toBe('c');
    expect(idsOf(s.history)).toEqual(['a', 'b']);
    expect(idsOf(s.upcoming)).toEqual(['d', 't']);
  });

  it('mirrors focusedVideo and sets the context', () => {
    const s = open('c');
    expect(s.focusedVideo).toEqual({ tier: 'A', videoId: 'c' });
    expect(s.focusedCategory).toBe('Rap');
    expect(s.contextLabel).toBe('Rap');
  });

  it('uses an explicit label when given', () => {
    expect(open('a', { label: 'Rap · A' }).contextLabel).toBe('Rap · A');
  });

  it('label falls back to null without category', () => {
    expect(open('a', { category: undefined }).contextLabel).toBeNull();
  });

  it('an explicit tier overrides the entry’s tier', () => {
    const s = open('a', { tier: 'D' });
    expect(s.current.tier).toBe('D');
    expect(s.focusedVideo.tier).toBe('D');
  });

  it('opens expanded, not shuffling, and not triage by default', () => {
    const s = open();
    expect(s.playerMode).toBe('expanded');
    expect(s.isShuffling).toBe(false);
    expect(s.isTriage).toBe(false);
  });

  it('can open in mini mode and in triage', () => {
    const s = open('t', { mode: 'mini', triage: true });
    expect(s.playerMode).toBe('mini');
    expect(s.isTriage).toBe(true);
  });

  it('a video not in the queue but in entries is played first', () => {
    const s = reducer(init(), openFocus({ videoId: 'd', queue: ['a', 'b'], entries: ENTRIES, category: 'Rap' }));
    expect(cur(s)).toBe('d');
    expect(s.history).toEqual([]);
    expect(idsOf(s.upcoming)).toEqual(['a', 'b']);
  });

  it('a video in neither queue nor entries is ignored', () => {
    const s = reducer(init(), openFocus({ videoId: 'zzz', queue: QUEUE, entries: ENTRIES, category: 'Rap' }));
    expect(s).toEqual(init());
  });

  it('queue ids without an entry are dropped', () => {
    const s = reducer(init(), openFocus({ videoId: 'a', queue: ['a', 'ghost', 'b'], entries: ENTRIES }));
    expect(idsOf(s.upcoming)).toEqual(['b']);
  });

  it('every entry gets a unique key, even for the same video twice', () => {
    const s = reducer(init(), openFocus({ videoId: 'a', queue: ['a', 'b', 'a'], entries: ENTRIES }));
    const keys = [s.current.key, ...s.upcoming.map((x) => x.key)];
    expect(new Set(keys).size).toBe(3);
    expect(idsOf(s.upcoming)).toEqual(['b', 'a']);
  });

  it('entries are context entries', () => {
    const s = open('b');
    expect([...s.history, s.current, ...s.upcoming].every((x) => x.source === 'context')).toBe(true);
  });

  it('starting something new replaces the whole queue', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('C', 'x'), position: 'next' }));
    s = reducer(s, openFocus({ videoId: 'd', queue: ['d'], entries: ENTRIES, category: 'Jazz' }));
    expect(cur(s)).toBe('d');
    expect(s.history).toEqual([]);
    expect(s.upcoming).toEqual([]);
    expect(s.focusedCategory).toBe('Jazz');
  });

  it('an empty queue with nothing to play is a no-op', () => {
    const s = reducer(init(), openFocus({ videoId: 'a', queue: [], entries: [] }));
    expect(s.current).toBeNull();
  });
});

describe('startShuffle', () => {
  it('plays in the given order and marks shuffling', () => {
    const s = reducer(init(), startShuffle({ videoId: 'd', queue: ['d', 'a', 'c'], entries: ENTRIES, category: 'Rap' }));
    expect(cur(s)).toBe('d');
    expect(idsOf(s.upcoming)).toEqual(['a', 'c']);
    expect(s.isShuffling).toBe(true);
    expect(s.isTriage).toBe(false);
    expect(s.playerMode).toBe('expanded');
  });

  it('ignores an unknown start video', () => {
    const s = reducer(init(), startShuffle({ videoId: 'nope', queue: [], entries: [] }));
    expect(s.isShuffling).toBe(false);
  });
});

describe('closeFocus', () => {
  it('clears everything but keeps repeat mode', () => {
    let s = open('b', { triage: true });
    s = reducer(s, cycleRepeat());
    s = reducer(s, minimizePlayer());
    s = reducer(s, closeFocus());
    expect(s.current).toBeNull();
    expect(s.focusedVideo).toBeNull();
    expect(s.history).toEqual([]);
    expect(s.upcoming).toEqual([]);
    expect(s.contextLabel).toBeNull();
    expect(s.focusedCategory).toBeNull();
    expect(s.isTriage).toBe(false);
    expect(s.playerMode).toBe('expanded');
    expect(s.repeatMode).toBe('all');
  });
});

describe('player modes and repeat', () => {
  it('mini / floating / expanded', () => {
    let s = open();
    s = reducer(s, minimizePlayer());
    expect(s.playerMode).toBe('mini');
    s = reducer(s, floatPlayer());
    expect(s.playerMode).toBe('floating');
    s = reducer(s, expandPlayer());
    expect(s.playerMode).toBe('expanded');
  });

  it('changing mode never touches the queue', () => {
    const before = open('b');
    const s = reducer(reducer(before, minimizePlayer()), floatPlayer());
    expect(s.current).toEqual(before.current);
    expect(s.upcoming).toEqual(before.upcoming);
  });

  it('repeat cycles off -> all -> one -> off', () => {
    let s = init();
    s = reducer(s, cycleRepeat());
    expect(s.repeatMode).toBe('all');
    s = reducer(s, cycleRepeat());
    expect(s.repeatMode).toBe('one');
    s = reducer(s, cycleRepeat());
    expect(s.repeatMode).toBe('off');
  });
});

describe('playNextInQueue / playPrevInQueue', () => {
  it('next moves current into history', () => {
    let s = open('a');
    s = reducer(s, playNextInQueue());
    expect(cur(s)).toBe('b');
    expect(idsOf(s.history)).toEqual(['a']);
    expect(s.focusedVideo).toEqual({ tier: 'S', videoId: 'b' });
  });

  it('next at the end with repeat off stays put', () => {
    let s = open('t');
    s = reducer(s, playNextInQueue());
    expect(cur(s)).toBe('t');
  });

  it('next at the end with repeat all restarts from the top in play order', () => {
    let s = reducer(open('d'), cycleRepeat());
    s = reducer(s, playNextInQueue()); // t
    s = reducer(s, playNextInQueue()); // wraps
    expect(cur(s)).toBe('a');
    expect(s.history).toEqual([]);
    expect(idsOf(s.upcoming)).toEqual(['b', 'c', 'd', 't']);
    expect(s.upcoming.every((x) => x.source === 'context')).toBe(true);
  });

  it('repeat all with a single song and no history does nothing', () => {
    let s = reducer(init(), openFocus({ videoId: 'a', queue: ['a'], entries: ENTRIES }));
    s = reducer(s, cycleRepeat());
    s = reducer(s, playNextInQueue());
    expect(cur(s)).toBe('a');
  });

  it('prev brings back the last played song', () => {
    let s = open('c');
    s = reducer(s, playPrevInQueue());
    expect(cur(s)).toBe('b');
    expect(idsOf(s.upcoming)).toEqual(['c', 'd', 't']);
    expect(idsOf(s.history)).toEqual(['a']);
  });

  it('prev with no history is a no-op', () => {
    const before = open('a');
    expect(reducer(before, playPrevInQueue())).toEqual(before);
  });

  it('next with nothing playing is a no-op', () => {
    expect(reducer(init(), playNextInQueue())).toEqual(init());
  });

  it('next then prev round-trips', () => {
    const before = open('b');
    const s = reducer(reducer(before, playNextInQueue()), playPrevInQueue());
    expect(s).toEqual(before);
  });

  it('history is capped at 200 entries', () => {
    const many = Array.from({ length: 250 }, (_, i) => e('S', `v${i}`));
    let s = reducer(init(), openFocus({ videoId: 'v0', queue: many.map((x) => x.video.videoId), entries: many }));
    for (let i = 0; i < 230; i++) s = reducer(s, playNextInQueue());
    expect(s.history).toHaveLength(200);
    expect(cur(s)).toBe('v230');
    expect(s.history[0].video.videoId).toBe('v30');
  });
});

describe('jumpInQueue', () => {
  it('jumping ahead moves the skipped songs into history', () => {
    let s = open('a');
    s = reducer(s, jumpInQueue({ section: 'upcoming', index: 2 }));
    expect(cur(s)).toBe('d');
    expect(idsOf(s.history)).toEqual(['a', 'b', 'c']);
    expect(idsOf(s.upcoming)).toEqual(['t']);
  });

  it('jumping back puts the later songs back in front of upcoming', () => {
    let s = open('d');
    s = reducer(s, jumpInQueue({ section: 'history', index: 1 }));
    expect(cur(s)).toBe('b');
    expect(idsOf(s.history)).toEqual(['a']);
    expect(idsOf(s.upcoming)).toEqual(['c', 'd', 't']);
  });

  it('jumping to the first history entry', () => {
    let s = open('c');
    s = reducer(s, jumpInQueue({ section: 'history', index: 0 }));
    expect(cur(s)).toBe('a');
    expect(s.history).toEqual([]);
    expect(idsOf(s.upcoming)).toEqual(['b', 'c', 'd', 't']);
  });

  it('out-of-range indexes are ignored', () => {
    const before = open('b');
    expect(reducer(before, jumpInQueue({ section: 'upcoming', index: 99 }))).toEqual(before);
    expect(reducer(before, jumpInQueue({ section: 'history', index: 5 }))).toEqual(before);
  });

  it('with nothing playing is a no-op', () => {
    expect(reducer(init(), jumpInQueue({ section: 'upcoming', index: 0 }))).toEqual(init());
  });
});

describe('enqueue', () => {
  it('Play next goes right after the current song', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('C', 'x'), position: 'next' }));
    expect(idsOf(s.upcoming)).toEqual(['x', 'b', 'c', 'd', 't']);
    expect(s.upcoming[0].source).toBe('user');
  });

  it('Add to queue goes after your own queued songs, before the board', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('C', 'x'), position: 'end' }));
    s = reducer(s, enqueue({ entry: e('C', 'y'), position: 'end' }));
    expect(idsOf(s.upcoming)).toEqual(['x', 'y', 'b', 'c', 'd', 't']);
  });

  it('Play next goes before previously queued songs', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('C', 'x'), position: 'end' }));
    s = reducer(s, enqueue({ entry: e('C', 'y'), position: 'next' }));
    expect(idsOf(s.upcoming).slice(0, 2)).toEqual(['y', 'x']);
  });

  it('queuing a song twice plays it twice (separate entries)', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('S', 'b'), position: 'next' }));
    expect(idsOf(s.upcoming)).toEqual(['b', 'b', 'c', 'd', 't']);
    expect(s.upcoming[0].key).not.toBe(s.upcoming[1].key);
  });

  it('does nothing with nothing playing', () => {
    expect(reducer(init(), enqueue({ entry: e('S', 'a'), position: 'next' }))).toEqual(init());
  });

  it('Add to queue on an empty upcoming list', () => {
    let s = open('t');
    s = reducer(s, enqueue({ entry: e('S', 'x'), position: 'end' }));
    expect(idsOf(s.upcoming)).toEqual(['x']);
  });
});

describe('removeFromQueue', () => {
  it('removes by key from upcoming or history', () => {
    let s = open('c');
    const histKey = s.history[0].key;
    const upKey = s.upcoming[1].key;
    s = reducer(s, removeFromQueue(histKey));
    s = reducer(s, removeFromQueue(upKey));
    expect(idsOf(s.history)).toEqual(['b']);
    expect(idsOf(s.upcoming)).toEqual(['d']);
  });

  it('removes only one copy of a song queued twice', () => {
    let s = open('a');
    s = reducer(s, enqueue({ entry: e('S', 'b'), position: 'next' }));
    s = reducer(s, removeFromQueue(s.upcoming[0].key));
    expect(idsOf(s.upcoming)).toEqual(['b', 'c', 'd', 't']);
  });

  it('never removes the current song', () => {
    const before = open('a');
    expect(reducer(before, removeFromQueue(before.current.key))).toEqual(before);
  });

  it('unknown key is a no-op', () => {
    const before = open('a');
    expect(reducer(before, removeFromQueue('nope'))).toEqual(before);
  });
});

describe('moveInQueue', () => {
  it('reorders within upcoming', () => {
    let s = open('a');
    s = reducer(s, moveInQueue({ from: { section: 'upcoming', index: 3 }, to: { section: 'upcoming', index: 0 } }));
    expect(idsOf(s.upcoming)).toEqual(['t', 'b', 'c', 'd']);
  });

  it('a song dropped at the front of upcoming counts as queued by you', () => {
    let s = open('a');
    s = reducer(s, moveInQueue({ from: { section: 'upcoming', index: 3 }, to: { section: 'upcoming', index: 0 } }));
    expect(s.upcoming[0].source).toBe('user');
  });

  it('a song dropped deeper among board songs stays a context song', () => {
    let s = open('a');
    s = reducer(s, moveInQueue({ from: { section: 'upcoming', index: 0 }, to: { section: 'upcoming', index: 2 } }));
    expect(s.upcoming[2].source).toBe('context');
  });

  it('drags a played song back into upcoming', () => {
    let s = open('c');
    s = reducer(s, moveInQueue({ from: { section: 'history', index: 0 }, to: { section: 'upcoming', index: 0 } }));
    expect(idsOf(s.history)).toEqual(['b']);
    expect(idsOf(s.upcoming)).toEqual(['a', 'd', 't']);
  });

  it('drags an upcoming song into history (skipping it)', () => {
    let s = open('a');
    s = reducer(s, moveInQueue({ from: { section: 'upcoming', index: 0 }, to: { section: 'history', index: 0 } }));
    expect(idsOf(s.history)).toEqual(['b']);
    expect(idsOf(s.upcoming)).toEqual(['c', 'd', 't']);
  });

  it('bad sections or indexes are ignored', () => {
    const before = open('a');
    expect(reducer(before, moveInQueue({ from: { section: 'nope', index: 0 }, to: { section: 'upcoming', index: 0 } }))).toEqual(before);
    expect(reducer(before, moveInQueue({ from: { section: 'upcoming', index: 99 }, to: { section: 'upcoming', index: 0 } }))).toEqual(before);
  });
});

describe('reorderUpcoming', () => {
  it('applies the given key order and marks shuffling', () => {
    let s = open('a');
    const keys = s.upcoming.map((x) => x.key).reverse();
    s = reducer(s, reorderUpcoming(keys));
    expect(idsOf(s.upcoming)).toEqual(['t', 'd', 'c', 'b']);
    expect(s.isShuffling).toBe(true);
  });

  it('drops unknown keys (and anything not listed)', () => {
    let s = open('a');
    s = reducer(s, reorderUpcoming([s.upcoming[1].key, 'ghost']));
    expect(idsOf(s.upcoming)).toEqual(['c']);
  });
});

describe('setFocusedVideo', () => {
  it('updates the tier of the playing song (a rating)', () => {
    let s = open('t');
    s = reducer(s, setFocusedVideo({ tier: 'A', videoId: 't' }));
    expect(s.current.tier).toBe('A');
    expect(s.focusedVideo).toEqual({ tier: 'A', videoId: 't' });
    expect(s.current.video).toEqual(v('t'));
  });

  it('a different song plays its first upcoming entry (triage moving on)', () => {
    let s = open('a');
    s = reducer(s, setFocusedVideo({ videoId: 'c' }));
    expect(cur(s)).toBe('c');
    expect(idsOf(s.history)).toEqual(['a', 'b']);
    expect(s.focusedVideo).toEqual({ tier: 'A', videoId: 'c' });
  });

  it('a different song with a tier updates both', () => {
    let s = open('a');
    s = reducer(s, setFocusedVideo({ videoId: 'd', tier: 'S' }));
    expect(cur(s)).toBe('d');
    expect(s.current.tier).toBe('S');
  });

  it('a song not upcoming is ignored', () => {
    const before = open('c');
    expect(reducer(before, setFocusedVideo({ videoId: 'a', tier: 'S' }))).toEqual(before);
  });

  it('does nothing with nothing playing', () => {
    expect(reducer(init(), setFocusedVideo({ videoId: 'a', tier: 'S' }))).toEqual(init());
  });
});
