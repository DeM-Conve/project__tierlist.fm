import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discardAll, discardBoard, loadBoard, moveWithFeedback, undoEdit } from './tierActions';
import { selectBoardsChanges, selectPendingMoves } from './store/selectors';
import { makeStore } from './test/render';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

// Unpushed changes belong to their board (the user's call): a board left
// behind is kept with its draft and laid back over fresh data when it's
// opened again.
const v = (videoId, id = `item-${videoId}`) => ({ videoId, id, title: `Artist - Song ${videoId}` });
const ROCK = { S: [v('a'), v('b')], A: [v('c')], TODO: [v('t1'), v('t2')] };
const POP = { S: [v('p')], A: [], TODO: [v('q')] };

let store;
const state = () => store.getState();
const ids = (tier) => (state().tiers.tierItems[tier] || []).map((x) => x.videoId);
const open = (category, data) => store.dispatch(loadBoard({ category, data }));

beforeEach(() => {
  store = makeStore();
  open('Rock', ROCK);
});

describe('leaving a board with staged changes', () => {
  it('keeps its moves, order and undo history, and gives them back on return', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 't1' }]));
    store.dispatch(moveWithFeedback([{ fromTier: 'S', toTier: 'S', videoId: 'b', dropIndex: 0 }]));
    open('Pop', POP);
    expect(Object.keys(state().drafts.boards)).toEqual(['Rock']);
    open('Rock', ROCK);
    expect(ids('S')).toEqual(['b', 'a', 't1']);
    expect(selectPendingMoves(state())).toEqual([expect.objectContaining({ kind: 'move', from: 'TODO', to: 'S' })]);
    store.dispatch(undoEdit({ silent: true }));
    expect(ids('S')).toEqual(['a', 'b', 't1']);
    expect(state().drafts.boards.Rock).toBeUndefined();
  });

  it('a board left without changes just loads fresh next time', () => {
    open('Pop', POP);
    open('Rock', { ...ROCK, A: [v('c'), v('new')] });
    expect(ids('A')).toEqual(['c', 'new']);
    expect(state().tiers.undoStack).toEqual([]);
  });

  it('is laid over fresh data: a song added on YouTube meanwhile shows up, a renamed item is followed', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'A', videoId: 't1' }]));
    open('Pop', POP);
    open('Rock', { ...ROCK, TODO: [v('t1', 'item-t1-again'), v('t2'), v('t3')] });
    expect(ids('A')).toEqual(['c', 't1']);
    expect(ids('TODO')).toEqual(['t2', 't3']);
    const move = selectPendingMoves(state()).find((m) => m.kind === 'move');
    expect(move.video.id).toBe('item-t1-again');
    expect(state().drafts.notes).toEqual({});
  });

  it('a change whose song moved on YouTube meanwhile is dropped with a note, never a duplicate', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 't1' }]));
    open('Pop', POP);
    open('Rock', { ...ROCK, A: [v('c'), v('t1', 'item-t1-in-a')], TODO: [v('t2')] });
    expect(ids('S')).toEqual(['a', 'b']);
    expect(ids('A')).toEqual(['c', 't1']);
    expect(selectPendingMoves(state())).toEqual([]);
    expect(state().drafts.notes.Rock).toEqual([expect.objectContaining({ text: expect.stringMatching(/Song t1.*no longer applies.*dropped/) })]);
  });

  it('a change already done on YouTube needs no note', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 't1' }]));
    open('Pop', POP);
    open('Rock', { ...ROCK, S: [v('a'), v('b'), v('t1', 'item-t1-in-s')], TODO: [v('t2')] });
    expect(ids('S')).toEqual(['a', 'b', 't1']);
    expect(selectPendingMoves(state())).toEqual([]);
    expect(state().drafts.notes).toEqual({});
  });
});

describe('a kept board', () => {
  it('is edited in place when its song is rated from elsewhere', () => {
    open('Pop', POP);
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'A', videoId: 't2' }], { category: 'Rock' }));
    expect(ids('S')).toEqual(['p']); // the open board (Pop) is untouched
    const groups = selectBoardsChanges(state());
    expect(groups.map((g) => [g.category, g.changes.length])).toEqual([['Rock', 1]]);
    open('Rock', ROCK);
    expect(ids('A')).toEqual(['c', 't2']);
  });

  it('a board with only auto-staged duplicates shows them apart from changes', () => {
    open('Pop', { ...POP, A: [v('p', 'item-p-2')] });
    const [pop] = selectBoardsChanges(state());
    expect(pop).toMatchObject({ category: 'Pop', changes: [], dedupes: [expect.objectContaining({ kind: 'dedupe' })] });
  });

  it('Discard on one board leaves the others', () => {
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 't1' }]));
    open('Pop', POP);
    store.dispatch(moveWithFeedback([{ fromTier: 'TODO', toTier: 'S', videoId: 'q' }]));
    store.dispatch(discardBoard('Rock'));
    expect(selectBoardsChanges(state()).map((g) => g.category)).toEqual(['Pop']);
    store.dispatch(discardAll());
    expect(selectBoardsChanges(state())).toEqual([]);
  });
});
