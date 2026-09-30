import { describe, expect, it } from 'vitest';
import reducer, {
  dragEnded,
  dragStarted,
  transferCancelled,
  transfersCommitted,
  transfersDiscarded,
  transferStaged,
  transfersPushed,
} from './transfersSlice';

const init = () => reducer(undefined, { type: '@@init' });
const t = (id, toCategory = 'Pop', toTier = 'S') => ({ id, video: { videoId: id, id }, fromCategory: 'Rock', fromTier: 'A', toCategory, toTier });

describe('transfersSlice', () => {
  it('starts empty', () => {
    expect(init()).toEqual({ list: [], drag: null });
  });

  it('remembers the song being dragged until the drag ends', () => {
    const drag = { video: { videoId: 'a' }, fromCategory: 'Rock', fromTier: 'A' };
    let s = reducer(init(), dragStarted(drag));
    expect(s.drag).toEqual(drag);
    s = reducer(s, dragEnded());
    expect(s.drag).toBeNull();
  });

  it('stages a transfer', () => {
    expect(reducer(init(), transferStaged(t('a'))).list).toEqual([t('a')]);
  });

  it('staging the same copy again re-aims it, keeping where it came from', () => {
    let s = reducer(init(), transferStaged(t('a')));
    s = reducer(s, transferStaged({ ...t('a', 'Jazz', 'B'), fromCategory: 'Ignored' }));
    expect(s.list).toEqual([{ ...t('a'), toCategory: 'Jazz', toTier: 'B' }]);
  });

  it('cancels one transfer', () => {
    let s = reducer(init(), transferStaged(t('a')));
    s = reducer(s, transferStaged(t('b')));
    s = reducer(s, transferCancelled('a'));
    expect(s.list.map((x) => x.id)).toEqual(['b']);
  });

  it('commit replaces the list with the current targets', () => {
    let s = reducer(init(), transferStaged(t('a')));
    s = reducer(s, transfersCommitted([t('a', 'Pop', 'D')]));
    expect(s.list).toEqual([t('a', 'Pop', 'D')]);
  });

  it('pushed transfers leave the list, failed ones stay', () => {
    let s = reducer(init(), transferStaged(t('a')));
    s = reducer(s, transferStaged(t('b')));
    s = reducer(s, transfersPushed(['a']));
    expect(s.list.map((x) => x.id)).toEqual(['b']);
  });

  it('discard drops them all', () => {
    let s = reducer(init(), transferStaged(t('a')));
    expect(reducer(s, transfersDiscarded()).list).toEqual([]);
  });
});
