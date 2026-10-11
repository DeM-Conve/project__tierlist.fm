import { BOARD_TIERS } from '../tiers';
import { videoMatches } from '../tierUtils';

// The One song picker's list logic, kept out of React so it can be tested
// on its own. A picker song is `{ id, tier, video }` (`video` may be missing
// for a song no longer on the board).

// Board order: best tier first, the API's order inside a tier.
export function sortPickerSongs(songs) {
  const rank = (t) => {
    const i = BOARD_TIERS.indexOf(t);
    return i < 0 ? BOARD_TIERS.length : i;
  };
  return songs.map((s, i) => [s, i]).sort((a, b) => rank(a[0].tier) - rank(b[0].tier) || a[1] - b[1]).map(([s]) => s);
}

// The tiers worth a filter chip: the board's tiers (TODO included) that
// actually hold one of the songs, in board order.
export function pickerTiers(songs) {
  return BOARD_TIERS.filter((t) => songs.some((s) => s.tier === t));
}

// The songs left after the tier chip (null = every tier) and the search box -
// the same word-by-word, accent-insensitive match as the board's Find.
export function filterPickerSongs(songs, query, tier) {
  return songs.filter((s) => (!tier || s.tier === tier) && videoMatches(s.video ?? { title: '' }, query));
}
