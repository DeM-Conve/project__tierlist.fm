import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { POLL_MS, usePlayerTime } from './usePlayerTime';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const fakePlayer = (cur, dur) => ({ getCurrentTime: () => cur, getDuration: () => dur });

describe('usePlayerTime', () => {
  it('polls the player every POLL_MS', () => {
    const playerRef = { current: fakePlayer(12, 200) };
    const { result } = renderHook(() => usePlayerTime(playerRef, 'a'));
    expect(result.current[0]).toEqual({ cur: 0, dur: 0 });
    act(() => vi.advanceTimersByTime(POLL_MS));
    expect(result.current[0]).toEqual({ cur: 12, dur: 200 });
    playerRef.current = fakePlayer(13, 200);
    act(() => vi.advanceTimersByTime(POLL_MS));
    expect(result.current[0]).toEqual({ cur: 13, dur: 200 });
  });

  it('stays at 0/0 while there is no player or no duration yet', () => {
    const playerRef = { current: null };
    const { result } = renderHook(() => usePlayerTime(playerRef, 'a'));
    act(() => vi.advanceTimersByTime(POLL_MS));
    playerRef.current = fakePlayer(5, 0);
    act(() => vi.advanceTimersByTime(POLL_MS));
    expect(result.current[0]).toEqual({ cur: 0, dur: 0 });
  });

  it('resets when the video changes, and setTime shows a seek at once', () => {
    const playerRef = { current: fakePlayer(30, 100) };
    const { result, rerender } = renderHook(({ id }) => usePlayerTime(playerRef, id), { initialProps: { id: 'a' } });
    act(() => vi.advanceTimersByTime(POLL_MS));
    act(() => result.current[1]({ cur: 50, dur: 100 }));
    expect(result.current[0]).toEqual({ cur: 50, dur: 100 });
    rerender({ id: 'b' });
    expect(result.current[0]).toEqual({ cur: 0, dur: 0 });
  });

  it('a paused song (same reading) keeps the same state - nothing re-renders', () => {
    const playerRef = { current: fakePlayer(30, 100) };
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePlayerTime(playerRef, 'a');
    });
    act(() => vi.advanceTimersByTime(POLL_MS));
    const first = result.current[0];
    // (React may render once more to find the state unchanged - then no more.)
    act(() => vi.advanceTimersByTime(POLL_MS * 2));
    const after = renders;
    act(() => vi.advanceTimersByTime(POLL_MS * 6));
    expect(renders).toBe(after);
    expect(result.current[0]).toBe(first);
  });

  it('does not poll while disabled (a matchup holds the dock), and resumes after', () => {
    const getDuration = vi.fn(() => 100);
    const playerRef = { current: { getCurrentTime: () => 7, getDuration } };
    const { result, rerender } = renderHook(({ on }) => usePlayerTime(playerRef, 'a', on), { initialProps: { on: false } });
    act(() => vi.advanceTimersByTime(POLL_MS * 3));
    expect(getDuration).not.toHaveBeenCalled();
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(POLL_MS));
    expect(result.current[0]).toEqual({ cur: 7, dur: 100 });
    rerender({ on: false });
    getDuration.mockClear();
    act(() => vi.advanceTimersByTime(POLL_MS * 3));
    expect(getDuration).not.toHaveBeenCalled();
  });

  it('stops polling on unmount', () => {
    const getDuration = vi.fn(() => 100);
    const playerRef = { current: { getCurrentTime: () => 1, getDuration } };
    const { unmount } = renderHook(() => usePlayerTime(playerRef, 'a'));
    unmount();
    act(() => vi.advanceTimersByTime(POLL_MS * 3));
    expect(getDuration).not.toHaveBeenCalled();
  });
});
