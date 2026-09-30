import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLoadProgress } from './useLoadProgress';

// The real bar is a DOM singleton; what matters is how the hook drives it.
const bar = { start: vi.fn(), stop: vi.fn(), set: vi.fn() };
vi.mock('@bprogress/react', () => ({ useProgress: () => bar }));

describe('useLoadProgress', () => {
  beforeEach(() => Object.values(bar).forEach((f) => f.mockClear()));

  it('starts from 0 while loading and stops when done', () => {
    const { rerender } = renderHook(({ loading, key }) => useLoadProgress(loading, key), {
      initialProps: { loading: true, key: 'Rock' },
    });
    expect(bar.set).toHaveBeenLastCalledWith(0);
    expect(bar.start).toHaveBeenCalledTimes(1);
    rerender({ loading: false, key: 'Rock' });
    expect(bar.stop).toHaveBeenCalledTimes(1);
  });

  it('switching boards mid-load restarts the bar from 0', () => {
    const { rerender } = renderHook(({ loading, key }) => useLoadProgress(loading, key), {
      initialProps: { loading: true, key: 'Rock' },
    });
    rerender({ loading: true, key: 'Nippo Normal' });
    expect(bar.start).toHaveBeenCalledTimes(2);
    expect(bar.set).toHaveBeenCalledTimes(2);
    expect(bar.set).toHaveBeenLastCalledWith(0);
    expect(bar.stop).not.toHaveBeenCalled();
  });

  it('a new load right after the last one finished restarts from 0 (not from full)', () => {
    const { rerender } = renderHook(({ loading, key }) => useLoadProgress(loading, key), {
      initialProps: { loading: false, key: 'Rock' },
    });
    rerender({ loading: true, key: 'Indo Normal' });
    // Reset first, then start - start() alone would carry on from 100%.
    expect(bar.set.mock.invocationCallOrder[0]).toBeLessThan(bar.start.mock.invocationCallOrder[0]);
    expect(bar.set).toHaveBeenCalledWith(0);
  });

  it('does nothing extra while nothing changes', () => {
    const { rerender } = renderHook(({ loading, key }) => useLoadProgress(loading, key), {
      initialProps: { loading: false, key: 'Rock' },
    });
    rerender({ loading: false, key: 'Rock' });
    expect(bar.start).not.toHaveBeenCalled();
    expect(bar.stop).toHaveBeenCalledTimes(1);
  });
});
