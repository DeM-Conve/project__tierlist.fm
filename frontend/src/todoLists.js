import { parseTitle, renderTitle } from './naming';
import { TODO_TIER } from './tiers';

// Which playlists are a board's to-do list (Settings -> Playlist naming ->
// To-do lists). Exactly like a tier: the title is the naming template with
// the to-do tier's name (`tierLabels.TODO`, e.g. "(**TODO**)") literally in
// {tier}'s place - "[Chill] Rap (**TODO**)" is Rap's, "[Chill] Rap TODO" is
// not (parseTitle does the matching). Any other playlist can be assigned to
// a board by hand (an explicit link: playlist id -> board).
//
// A board has at most one to-do list: a linked one beats a name match; among
// equals the first wins and the rest are reported as `duplicate`.

// A board's to-do list named by the naming: the to-do name fills {tier}, the
// board's (first) values fill the user's own tokens.
export function todoTitle(naming, { category, fields }) {
  return renderTitle(naming, { fields: fields[0] ?? {}, category, tier: TODO_TIER });
}

// Every board (from the ranked tier playlists) with the distinct values its
// playlists have for the user's own tokens ([{ mine: 'x' }, { mine: 'y' }]).
export function boardsOf(rankedPlaylists) {
  const map = new Map();
  for (const p of rankedPlaylists) {
    const entry = map.get(p.parsed.category) ?? { category: p.parsed.category, fields: [] };
    const f = p.parsed.fields ?? {};
    if (Object.keys(f).length && !entry.fields.some((e) => JSON.stringify(e) === JSON.stringify(f))) entry.fields.push(f);
    map.set(p.parsed.category, entry);
  }
  return [...map.values()];
}

// playlists: every playlist that isn't a ranked tier playlist.
// -> one row per candidate (named as a to-do list, or linked):
//    { playlist, category, fields, via: 'link' | 'name',
//      status: 'active' | 'duplicate' | 'missingBoard' }
export function resolveTodoLists(playlists, { links, boards, namings }) {
  const known = new Set(boards.map((b) => b.category));
  const rows = [];
  for (const playlist of playlists) {
    const linked = links[playlist.id];
    const parsed = parseTitle(playlist.title, namings);
    if (linked) {
      rows.push({ playlist, category: linked, fields: {}, via: 'link', status: known.has(linked) ? 'active' : 'missingBoard' });
    } else if (parsed?.tier === TODO_TIER) {
      const { category, fields } = parsed;
      rows.push({ playlist, category, fields, via: 'name', status: known.has(category) ? 'active' : 'missingBoard' });
    }
  }
  // One per board: links first, then name matches, in playlist order.
  const taken = new Set();
  for (const via of ['link', 'name']) {
    for (const row of rows) {
      if (row.via !== via || row.status !== 'active') continue;
      if (taken.has(row.category)) row.status = 'duplicate';
      else taken.add(row.category);
    }
  }
  return rows;
}
