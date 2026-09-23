import escapeStringRegexp from 'escape-string-regexp';
import { TIER_ORDER } from './tiers';

// Playlist naming template (Settings -> Playlist naming), in the spirit of
// Immich's storage template: ONE definition that is both
//   - the matcher: only playlists whose title fits it are picked up (anything
//     else - e.g. a private playlist - never shows anywhere in the app), and
//   - the renderer: how new tier playlists are named, and what the rename
//     ("migration") job renames existing ones to.
//
// Tokens: {bracket} (optional group tag like G / GA / OG), {category}, {tier}.

export const TOKENS = [
  { token: '{bracket}', label: 'Bracket', description: 'Group tag, e.g. G, GA, OG', required: false },
  { token: '{category}', label: 'Category', description: 'The board name, e.g. Rap', required: true },
  { token: '{tier}', label: 'Tier', description: 'T1, T2, T3, TE or TZ', required: true },
];

export const DEFAULT_TEMPLATE = '[{bracket}] {category} {tier}';

export const TEMPLATE_PRESETS = [
  DEFAULT_TEMPLATE,
  '[{bracket}] {category} {tier}-playlist',
  '{category} {tier}',
  '{category} - {tier}',
  '{category} · {tier}',
  '{tier} | {category}',
];

const TOKEN_PATTERNS = {
  bracket: '(?<bracket>\\w+)',
  category: '(?<category>.+?)',
  tier: `(?<tier>${TIER_ORDER.join('|')})`,
};

const compiled = new Map();

// Template -> anchored RegExp with named groups. Literal text is escaped;
// any run of spaces matches one-or-more spaces, so "Rap  T1" still counts.
export function compileTemplate(template) {
  if (compiled.has(template)) return compiled.get(template);
  const source = template
    .split(/(\{bracket\}|\{category\}|\{tier\})/)
    .map((part) => {
      const m = /^\{(bracket|category|tier)\}$/.exec(part);
      if (m) return TOKEN_PATTERNS[m[1]];
      return escapeStringRegexp(part).replace(/\s+/g, '\\s+');
    })
    .join('');
  const re = new RegExp(`^\\s*${source}\\s*$`);
  compiled.set(template, re);
  return re;
}

export function validateTemplate(template) {
  const errors = [];
  for (const t of TOKENS) {
    const count = template.split(t.token).length - 1;
    if (t.required && count === 0) errors.push(`Must contain ${t.token}`);
    if (count > 1) errors.push(`${t.token} can only appear once`);
  }
  if (/\{(?!bracket\}|category\}|tier\})[^}]*\}/.test(template)) errors.push('Unknown token - use {bracket}, {category} or {tier}');
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
  return template
    .replace('{bracket}', bracket ?? '')
    .replace('{category}', category)
    .replace('{tier}', tier)
    .replace(/\s+/g, ' ')
    .replace(/\[\s*\]\s*/g, '') // an empty "[{bracket}]" collapses away
    .trim();
}
