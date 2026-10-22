import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preparedStatus, syncStatusRun } from './syncStatus';
import { makeStore } from './test/render';

let store;
const status = () => store.getState().tiers.syncStatus;

beforeEach(() => {
  vi.useFakeTimers();
  store = makeStore();
});
afterEach(() => vi.useRealTimers());

describe('syncStatusRun', () => {
  it('a finished push falls back to idle after a moment', () => {
    const counter = { current: 0 };
    syncStatusRun(store.dispatch, counter)('done');
    expect(status()).toBe('done');
    vi.advanceTimersByTime(2500);
    expect(status()).toBe('idle');
  });

  it('an older push\'s timer never resets a newer push that ended on the same status', () => {
    const counter = { current: 0 };
    syncStatusRun(store.dispatch, counter)('partial');
    vi.advanceTimersByTime(2000);
    const second = syncStatusRun(store.dispatch, counter);
    second('syncing');
    second('partial');
    vi.advanceTimersByTime(600); // the first push's timer fires now
    expect(status()).toBe('partial');
    vi.advanceTimersByTime(2000);
    expect(status()).toBe('idle');
  });

  it('an error stays until the next push', () => {
    syncStatusRun(store.dispatch, { current: 0 })('error');
    vi.advanceTimersByTime(10_000);
    expect(status()).toBe('error');
  });
});

describe('preparedStatus (nothing left to send)', () => {
  it('is partial only when something was held back', () => {
    expect(preparedStatus({ skipped: 1, settled: 0 })).toBe('partial');
    expect(preparedStatus({ skipped: 0, settled: 2 })).toBe('done');
    expect(preparedStatus({ skipped: 0, settled: 0 })).toBe('idle');
  });
});
