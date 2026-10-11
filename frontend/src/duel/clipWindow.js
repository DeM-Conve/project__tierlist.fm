// The duel's clip window (DuelMatch's ClipCard): each side plays a part of
// its song, and each time it's that side's turn again, the next part.

export const CLIP_START = 30;

// The first part's start: 0:30, or the song's last `length` seconds when it's
// shorter than 0:30 + the clip.
export function firstStart(duration, length) {
  return duration ? Math.max(0, Math.min(CLIP_START, duration - length)) : CLIP_START;
}

// After a part from `from`: the next part, or back to the first once less
// than half a part is left.
export function nextStart(from, length, duration) {
  const next = from + length;
  return duration && next + length / 2 >= duration ? firstStart(duration, length) : next;
}

// The playhead moved further than a tick of playback could explain: the
// listener seeked (in the YouTube player).
export const SEEK_JUMP = 1.5;
export function seeked(last, now) {
  return last !== null && Math.abs(now - last) > SEEK_JUMP;
}
