import { describe, expect, it } from 'vitest';
import { firstStart, nextStart, seeked } from './clipWindow';

describe('clip window', () => {
  it('starts at 0:30, or the last part of a short song', () => {
    expect(firstStart(240, 30)).toBe(30);
    expect(firstStart(40, 30)).toBe(10);
    expect(firstStart(0, 30)).toBe(30); // duration not known yet
  });

  it('each turn plays the next part, wrapping to the first near the end', () => {
    expect(nextStart(30, 30, 240)).toBe(60);
    expect(nextStart(60, 30, 240)).toBe(90);
    expect(nextStart(195, 30, 240)).toBe(30); // 225 + 15 >= 240: back to the start
    expect(nextStart(30, 20, 0)).toBe(50); // duration unknown: keep going
  });

  it('a jump bigger than a tick is a seek; normal playback is not', () => {
    expect(seeked(null, 120)).toBe(false);
    expect(seeked(40, 40.25)).toBe(false);
    expect(seeked(40, 120)).toBe(true);
    expect(seeked(80, 35)).toBe(true);
  });
});
