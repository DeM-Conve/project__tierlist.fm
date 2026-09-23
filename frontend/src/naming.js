import escapeStringRegexp from 'escape-string-regexp';
import { TIER_ORDER } from './tiers';

// Playlist naming template (Settings -> Playlist naming), in the spirit of
// Immich's storage template: ONE definition that is both
//   - the matcher: only playlists whose title fits it are picked up (anything
//     else - e.g. a private playlist - never shows anywhere in the app), and
//   - the renderer: how new tier playlists are named, and what the rename
//     ("migration") job renames existing ones to.
//
// Tokens: {category} and {tier} (required), {tag} (optional label some people
// prefix names with, e.g. "[G] Rap T1"). `{bracket}` is accepted as an alias
// of {tag} (the token's earlier name) so saved templates keep working.

export const TOKENS = [
  { token: '{category}', label: 'Category', description: 'The board name, e.g. Rap', required: true },
  { token: '{tier}', label: 'Tier', description: 'T1, T2, T3, TE or TZ', required: true },
  { token: '{tag}', label: 'Tag', description: "Optional label, e.g. G in \"[G] Rap T1\" - leave it out if you don't use one", required: false },
];

// Generic by default - most people name playlists "Rap T1"; a tag prefix is
// a personal convention, picked up by detectTemplate() when it's in use.
export const DEFAULT_TEMPLATE = '{category} {tier}';

export const TEMPLATE_PRESET_GROUPS = [
  { group: 'Simple', items: ['{category} {tier}', '{category} - {tier}', '{category} · {tier}', '{tier} | {category}', '{category} {tier}-playlist'] },
  { group: 'With a tag', items: ['[{tag}] {category} {tier}', '[{tag}] {category} {tier}-playlist', '{tag}: {category} {tier}'] },
];
export const TEMPLATE_PRESETS = TEMPLATE_PRESET_GROUPS.flatMap((g) => g.items);

// Old token name -> current one.
export function normalizeTemplate(template) {
  return template.replaceAll('{bracket}', '{tag}');
}

const TOKEN_PATTERNS = {
  tag: '(?<bracket>\\w+)',
  category: '(?<category>.+?)',
  // Ranked tiers only - to-do lists are found by keyword (todoLists.js).
  tier: `(?<tier>${TIER_ORDER.join('|')})`,
};

const compiled = new Map();

// Template -> anchored RegExp with named groups. Literal text is escaped;
// any run of spaces matches one-or-more spaces, so "Rap  T1" still counts.
export function compileTemplate(rawTemplate) {
  const template = normalizeTemplate(rawTemplate);
  if (compiled.has(template)) return compiled.get(template);
  const source = template
    .split(/(\{tag\}|\{category\}|\{tier\})/)
    .map((part) => {
      const m = /^\{(tag|category|tier)\}$/.exec(part);
      if (m) return TOKEN_PATTERNS[m[1]];
      return escapeStringRegexp(part).replace(/\s+/g, '\\s+');
    })
    .join('');
  const re = new RegExp(`^\\s*${source}\\s*$`);
  compiled.set(template, re);
  return re;
}

export function validateTemplate(rawTemplate) {
  const template = normalizeTemplate(rawTemplate);
  const errors = [];
  for (const t of TOKENS) {
    const count = template.split(t.token).length - 1;
    if (t.required && count === 0) errors.push(`Must contain ${t.token}`);
    if (count > 1) errors.push(`${t.token} can only appear once`);
  }
  if (/\{(?!tag\}|category\}|tier\})[^}]*\}/.test(template)) errors.push('Unknown token - use {category}, {tier} or {tag}');
  return errors;
}

// title -> { bracket, category, tier } or null. `templates` = the active
// template first, plus any template a half-finished rename is migrating
// away from (so nothing disappears while a migration is incomplete).
export function parseTitle(title, templates) {
  for (const template of templates) {
    const m = compileTemplate(template).exec(title);
    if (m?.groups?.category?.trim()) {
      return { bracket: m.groups.bracket ?? null, category: m.groups.category.trim(), tier: m.groups.tier, template };
    }
  }
  return null;
}

export function renderTitle(template, { bracket, category, tier }) {
  return normalizeTemplate(template)
    .replace('{tag}', bracket ?? '')
    .replace('{category}', category)
    .replace('{tier}', tier)
    .replace(/\s+/g, ' ')
    .replace(/\[\s*\]\s*/g, '') // an empty "[{bracket}]" collapses away
    .trim();
}

// Which preset best describes the user's existing playlists? Most matches
// wins; on a tie the more specific template (more literal text / tokens)
// wins - e.g. "[G] Rap T1" also matches "{category} {tier}" (as category
// "[G] Rap"), but "[{tag}] {category} {tier}" reads it properly.
export function detectTemplate(titles) {
  const specificity = (t) => t.replace(/\{(tag|category|tier)\}/g, '').length + (t.includes('{tag}') ? 10 : 0);
  let best = DEFAULT_TEMPLATE;
  let bestScore = [0, 0];
  for (const template of TEMPLATE_PRESETS) {
    const matches = titles.filter((t) => parseTitle(t, [template])).length;
    const score = [matches, specificity(template)];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[0] > 0 && score[1] > bestScore[1])) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}
