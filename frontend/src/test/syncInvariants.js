// The invariants every push must leave behind, checked against the fake
// YouTube (fakeYoutube.js). Returns a list of human-readable violations
// (empty = all good), so a failing test says exactly what went wrong.
//
// expected: { [board]: { [tier]: videoId[] } } - what the boards showed the
// user when they pushed (compared as sets: order isn't synced).
// removed: video ids the user deliberately removed (Remove bin / dedupe-gone).
// universe: every video id that should still exist somewhere on the account.
// sync: the tier-sync call ({ payload, response }) the push made, if any.
import { youtubeBoards } from './syncHarness';

const sorted = (xs) => [...xs].sort();

export function invariantViolations(yt, { expected = {}, universe = null, sync = null } = {}) {
  const out = [];
  const actual = youtubeBoards(yt);

  for (const [board, tiers] of Object.entries(expected)) {
    for (const [tier, want] of Object.entries(tiers)) {
      const have = actual[board]?.[tier] ?? [];
      const missing = sorted(new Set(want)).filter((v) => !have.includes(v));
      const extra = sorted(new Set(have)).filter((v) => !want.includes(v));
      if (missing.length) out.push(`${board} ${tier}: missing on YouTube ${missing.join(',')}`);
      if (extra.length) out.push(`${board} ${tier}: extra on YouTube ${extra.join(',')}`);
    }
  }

  // No video twice within one board (two tiers, or one tier twice).
  for (const [board, tiers] of Object.entries(actual)) {
    const seen = new Map();
    for (const [tier, videos] of Object.entries(tiers)) {
      for (const v of videos) {
        if (seen.has(v)) out.push(`${board}: ${v} duplicated (${seen.get(v)} and ${tier})`);
        else seen.set(v, tier);
      }
    }
  }

  // No lost song.
  if (universe) {
    const everywhere = new Set(Object.values(actual).flatMap((t) => Object.values(t).flat()));
    for (const v of universe) if (!everywhere.has(v)) out.push(`lost song ${v}`);
  }

  // No failed results.
  if (sync) {
    sync.response.results.forEach((r, i) => {
      if (!r.success) out.push(`push row ${i} (${r.videoId}, from ${sync.payload[i].fromItemId}) failed: ${r.error}`);
    });
  }
  return out;
}
