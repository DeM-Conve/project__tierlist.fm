import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEQUENCE_PREFIXES, isSequenceKey } from './sequence';

// The module listens on window (capture phase) from import time.
function press(key, init = {}, target = window) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  // Clear any pending sequence from a previous test.
  press('Escape');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('keyboard sequences', () => {
  it('prefixes are g and y', () => {
    expect(SEQUENCE_PREFIXES).toEqual(['g', 'y']);
  });

  it('the key after g belongs to the sequence', () => {
    const g = press('g');
    const h = press('h');
    expect(isSequenceKey(g)).toBe(false);
    expect(isSequenceKey(h)).toBe(true);
  });

  it('the key after y belongs to the sequence (yy)', () => {
    press('y');
    expect(isSequenceKey(press('y'))).toBe(true);
  });

  it('only one key after the prefix: the third key is plain', () => {
    press('g');
    press('g');
    expect(isSequenceKey(press('h'))).toBe(false);
  });

  it('a plain key is not a sequence key', () => {
    expect(isSequenceKey(press('h'))).toBe(false);
  });

  it('modifier keys alone do not end a pending sequence', () => {
    press('g');
    press('Shift');
    expect(isSequenceKey(press('G', { shiftKey: true }))).toBe(true);
  });

  it('the sequence expires after 1s', () => {
    press('g');
    vi.advanceTimersByTime(1001);
    expect(isSequenceKey(press('h'))).toBe(false);
  });

  it('still pending just before the timeout', () => {
    press('g');
    vi.advanceTimersByTime(999);
    expect(isSequenceKey(press('h'))).toBe(true);
  });

  it('Ctrl/Meta/Alt+g does not start a sequence', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      press('g', { [mod]: true });
      expect(isSequenceKey(press('h')), mod).toBe(false);
    }
  });

  it('typing g in an input does not start a sequence', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('g', {}, input);
    expect(isSequenceKey(press('h', {}, input))).toBe(false);
  });

  it('typing in a textarea does not start a sequence', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    press('y', {}, ta);
    expect(isSequenceKey(press('y', {}, ta))).toBe(false);
  });

  it('isSequenceKey is false for events it never saw', () => {
    expect(isSequenceKey(new KeyboardEvent('keydown', { key: 'h' }))).toBe(false);
    expect(isSequenceKey({})).toBe(false);
  });
});
