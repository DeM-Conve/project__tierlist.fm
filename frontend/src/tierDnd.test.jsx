import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { loadBoard, useTierDnd } from './tierActions';
import { makeStore } from './test/render';
import { selectPendingMoves, selectTransfers } from './store/selectors';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const v = (videoId) => ({ videoId, id: `item-${videoId}`, title: videoId });
// A stand-in DataTransfer the way the browser hands one to each handler.
function dragEvent(data = {}) {
  const store = { ...data };
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: (k, val) => (store[k] = val),
      getData: (k) => store[k] ?? '',
      effectAllowed: '',
    },
  };
}
function setup() {
  const store = makeStore();
  store.dispatch(loadBoard({ category: 'Rock', data: { S: [v('a'), v('b')], A: [] } }));
  const { result } = renderHook(() => useTierDnd(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
  return { store, dnd: () => result.current };
}

describe('useTierDnd', () => {
  it('a drag on the same board is an ordinary move', () => {
    const { store, dnd } = setup();
    const e = dragEvent();
    act(() => dnd().onDragStart(e, v('a'), 'S'));
    act(() => dnd().onDrop(e, 'A'));
    expect(selectPendingMoves(store.getState())).toEqual([expect.objectContaining({ kind: 'move', from: 'S', to: 'A' })]);
    expect(store.getState().transfers.list).toEqual([]);
  });

  it('remembers the dragged song and its board', () => {
    const { store, dnd } = setup();
    act(() => dnd().onDragStart(dragEvent(), v('a'), 'S'));
    expect(store.getState().transfers.drag).toEqual({ video: v('a'), fromCategory: 'Rock', fromTier: 'S' });
    act(() => dnd().onDragEnd());
    expect(store.getState().transfers.drag).toBeNull();
  });

  it('dropped on another board (opened mid-drag), it becomes a transfer', () => {
    const { store, dnd } = setup();
    const e = dragEvent();
    act(() => dnd().onDragStart(e, v('a'), 'S'));
    act(() => {
      store.dispatch(loadBoard({ category: 'Pop', data: { B: [v('x')] } }));
    });
    act(() => dnd().onDrop(e, 'B', 0));
    expect(selectTransfers(store.getState())).toEqual([
      expect.objectContaining({ fromCategory: 'Rock', fromTier: 'S', toCategory: 'Pop', toTier: 'B' }),
    ]);
    expect(store.getState().tiers.tierItems.B.map((x) => x.videoId)).toEqual(['a', 'x']);
    expect(store.getState().transfers.drag).toBeNull();
  });

  it('a drop with no drag data does nothing', () => {
    const { store, dnd } = setup();
    act(() => dnd().onDrop(dragEvent(), 'A'));
    expect(selectPendingMoves(store.getState())).toEqual([]);
  });

  it('a drop with broken drag data does nothing', () => {
    const { store, dnd } = setup();
    act(() => dnd().onDrop(dragEvent({ 'application/json': '{not json' }), 'A'));
    expect(selectPendingMoves(store.getState())).toEqual([]);
  });
});
