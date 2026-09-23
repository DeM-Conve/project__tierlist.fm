import { TIER_ORDER } from './tiers';

// Which playlists are a board's to-do list (Settings -> Playlist naming ->
// To-do lists). Separate from the naming template on purpose: people name
// their to-do playlists freely ("[G] Rap TODO", "TODO - Rap", "rap todo"), so
// instead of one fixed shape a to-do list is found in two steps:
//
//   1. the keyword (default "TODO") appears in the title as a whole word -
//      anywhere, any case. That's what makes it a to-do list at all.
//   2. which board it belongs to:
//        a. an explicit link (playlist id -> board) the user set, else
//        b. the rest of the title, once the keyword is taken out, is exactly a
//           board's name - optionally with that board's tag ("[G] Rap").
//      Punctuation, brackets, "_" and case don't matter ("Jazz Cozy" =
//      "Jazz_Cozy"). Anything else stays unplaced until it's linked by hand.
//
// A board has at most one to-do list: a linked one beats a name match; among
// equals the first wins and the rest are reported as `duplicate`.

export const DEFAULT_TODO_KEYWORD = 'TODO';
export const TODO_KEYWORD_MAX = 20;

// What was typed -> the keyword's words: symbols dropped, spaces collapsed
// ("(**TODO**)" -> "TODO"). Matching ignores symbols anyway (normalizeName).
export function keywordWords(text) {
  return text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Mirrors the backend's @TodoKeyword - keep the two in step.
export function validateTodoKeyword(keyword) {
  const errors = [];
  if (!keyword) errors.push('Enter a keyword');
  else if (keyword.length > TODO_KEYWORD_MAX) errors.push(`At most ${TODO_KEYWORD_MAX} characters`);
  else if (!/^[\p{L}\p{N}]+( [\p{L}\p{N}]+)*$/u.test(keyword))
    errors.push('Letters and digits only (single spaces between words)');
  else if (TIER_ORDER.includes(keyword.toUpperCase())) errors.push('That is a tier code - pick another word');
  return errors;
}

// Title -> comparable words: case, accents, punctuation, brackets and "_"
// all fold away ("[G] Jazz_Cozy - TODO" -> "g jazz cozy todo").
export function normalizeName(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function hasTodoKeyword(title, keyword) {
  const k = normalizeName(keyword);
  return !!k && ` ${normalizeName(title)} `.includes(` ${k} `);
}

// The title with the keyword taken out (first occurrence), normalized.
function withoutKeyword(title, keyword) {
  return ` ${normalizeName(title)} `.replace(` ${normalizeName(keyword)} `, ' ').trim().replace(/\s+/g, ' ');
}

// boards: [{ category, tags: string[] }] -> the board this title names, or
// null (no board, or two boards fit equally).
export function boardFromName(title, keyword, boards) {
  const rest = withoutKeyword(title, keyword);
  const hits = boards.filter(({ category, tags }) => {
    const name = normalizeName(category);
    if (rest === name) return true;
    return tags.some((tag) => {
      const t = normalizeName(tag);
      return t && (rest === `${t} ${name}` || rest === `${name} ${t}`);
    });
  });
  return hits.length === 1 ? hits[0].category : null;
}

// Every board (from the ranked tier playlists) with the tags its playlists use.
export function boardsOf(rankedPlaylists) {
  const map = new Map();
  for (const p of rankedPlaylists) {
    const entry = map.get(p.parsed.category) ?? { category: p.parsed.category, tags: [] };
    if (p.parsed.bracket && !entry.tags.includes(p.parsed.bracket)) entry.tags.push(p.parsed.bracket);
    map.set(p.parsed.category, entry);
  }
  return [...map.values()];
}

// playlists: every playlist that isn't a ranked tier playlist.
// -> one row per candidate (has the keyword, or is linked):
//    { playlist, category, via: 'link' | 'name' | null,
//      status: 'active' | 'duplicate' | 'unplaced' | 'missingBoard' }
export function resolveTodoLists(playlists, { keyword, links, boards }) {
  const known = new Set(boards.map((b) => b.category));
  const rows = [];
  for (const playlist of playlists) {
    const linked = links[playlist.id];
    if (linked) {
      rows.push({ playlist, category: linked, via: 'link', status: known.has(linked) ? 'active' : 'missingBoard' });
    } else if (hasTodoKeyword(playlist.title, keyword)) {
      const category = boardFromName(playlist.title, keyword, boards);
      rows.push({ playlist, category, via: category ? 'name' : null, status: category ? 'active' : 'unplaced' });
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
