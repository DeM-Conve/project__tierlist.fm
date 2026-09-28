import escapeStringRegexp from 'escape-string-regexp';
import { BOARD_TIERS, DEFAULT_TIER_LABELS, TIER_ORDER, TODO_TIER } from './tiers';

// Playlist naming (Settings -> Playlist naming), in the spirit of Immich's
// storage template. A "naming" is { template, tierLabels } and it is both
//   - the matcher: only playlists whose title fits the template are picked up
//     (anything else - e.g. a private playlist - never shows in the app), and
//   - the renderer: how new tier playlists are named, and what the rename
//     ("migration") job renames existing ones to.
//
// The product only knows two tokens: {category} (the board) and {tier}. Any
// other {name} is the user's own - free text the app reads from each title
// and writes back unchanged on rename, without giving it any meaning. The
// product never names one itself - the user does.
//
// `tierLabels` = what each internal tier slot (tiers.js) is called:
// { S: 'S', ..., D: 'D', TODO: 'TODO' } by default, anything the user likes
// ("Gold", "5 stars", "(**TODO**)"). {tier} matches any of the six,
// literally - a to-do list is the template with the to-do name in {tier}'s
// place, nothing looser (todoLists.js).

export const REQUIRED_TOKENS = [
  { token: '{category}', label: 'Category', description: 'The board name, e.g. Rap' },
  { token: '{tier}', label: 'Tier', description: 'The tier name - set below (S, A, B… or your own)' },
];
const BUILT_IN = ['category', 'tier'];

// A token the user makes up: a single word, named by them.
export const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

export const DEFAULT_TEMPLATE = '{category} {tier}';

// Starting points in the template picker. Generic only - a token of your
// own is added by typing it.
export const TEMPLATE_PRESETS = ['{category} {tier}', '{category} - {tier}', '{category} · {tier}', '{tier} | {category}', '{category} ({tier})'];

export const TIER_LABEL_PRESETS = [
  { value: 'letters', label: 'S A B C D', labels: ['S', 'A', 'B', 'C', 'D'] },
  { value: 'letters-f', label: 'A B C D F', labels: ['A', 'B', 'C', 'D', 'F'] },
];
export const TIER_LABEL_MAX = 20;

// Title -> comparable words: case, accents, punctuation, brackets and "_"
// all fold away ("Jazz_Cozy - TODO" -> "jazz cozy todo").
export function normalizeName(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The {names} in a template, in order.
export function templateTokens(template) {
  return [...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
}

// The user's own tokens in a template (everything but category/tier).
export function customTokens(template) {
  return templateTokens(template).filter((t) => !BUILT_IN.includes(t));
}

export function validateTemplate(template) {
  const errors = [];
  if (!template.trim()) return ['Enter a template'];
  if (template.length > 200) errors.push('At most 200 characters');
  const tokens = templateTokens(template);
  for (const t of REQUIRED_TOKENS) {
    const count = tokens.filter((n) => `{${n}}` === t.token).length;
    if (count === 0) errors.push(`Must contain ${t.token}`);
    if (count > 1) errors.push(`${t.token} can only appear once`);
  }
  const custom = tokens.filter((t) => !BUILT_IN.includes(t));
  const bad = custom.find((t) => !TOKEN_NAME.test(t));
  if (bad !== undefined) errors.push(`{${bad}} isn't a valid token - a token is a single word (letters, digits, _)`);
  const twice = custom.find((t, i) => custom.indexOf(t) !== i);
  if (twice) errors.push(`{${twice}} can only appear once`);
  // Braces only ever wrap a token.
  if (template.replace(/\{[^{}]*\}/g, '').match(/[{}]/)) errors.push('Unmatched { or }');
  return errors;
}

// Mirrors the backend's @TierLabels - keep the two in step.
// labels -> { [slot]: error } (empty = all fine).
export function validateTierLabels(labels) {
  const errors = {};
  const seen = new Map();
  for (const slot of [...TIER_ORDER, TODO_TIER]) {
    const label = labels?.[slot] ?? '';
    let error = null;
    if (!label) error = 'Enter a name';
    else if (label.length > TIER_LABEL_MAX) error = `At most ${TIER_LABEL_MAX} characters`;
    else if (label !== label.trim()) error = 'No spaces at the start or end';
    else if (!normalizeName(label)) error = 'Needs a letter or digit';
    else if (/[{}]/.test(label)) error = 'No { or }';
    else if (seen.has(normalizeName(label))) error = `Same as ${labels[seen.get(normalizeName(label))]}`;
    if (error) errors[slot] = error;
    else seen.set(normalizeName(label), slot);
  }
  return errors;
}

// What the app shows for each tier (`naming.tierDisplayNames`): optional,
// { [slot]: name | null } - null / empty = show the name used in playlist
// names. Same format rules as a tier name, but they needn't differ.
export function validateDisplayNames(names) {
  const errors = {};
  for (const slot of [...TIER_ORDER, TODO_TIER]) {
    const name = names?.[slot];
    if (!name) continue;
    if (name.length > TIER_LABEL_MAX) errors[slot] = `At most ${TIER_LABEL_MAX} characters`;
    else if (name !== name.trim()) errors[slot] = 'No spaces at the start or end';
    else if (!normalizeName(name)) errors[slot] = 'Needs a letter or digit';
    else if (/[{}]/.test(name)) errors[slot] = 'No { or }';
  }
  return errors;
}

export const NO_DISPLAY_NAMES = { S: null, A: null, B: null, C: null, D: null, TODO: null };

export function sameLabels(a, b) {
  return [...TIER_ORDER, TODO_TIER].every((t) => a?.[t] === b?.[t]);
}

const compiled = new Map();

// Naming -> { re, fields: [token names in group order], slotOf: label -> slot }.
// Literal text is escaped; any run of spaces matches one-or-more spaces, so
// "Rap  S" still counts. Longest tier labels first, so "A+" beats "A".
function compile({ template, tierLabels }) {
  const key = `${template}\u0000${BOARD_TIERS.map((t) => tierLabels[t]).join('\u0000')}`;
  if (compiled.has(key)) return compiled.get(key);
  const slotOf = new Map(BOARD_TIERS.map((t) => [tierLabels[t], t]));
  const alternation = [...slotOf.keys()]
    .sort((a, b) => b.length - a.length)
    .map((l) => escapeStringRegexp(l).replace(/\s+/g, '\\s+'))
    .join('|');
  const fields = [];
  const source = template
    .split(/(\{[^{}]*\})/)
    .map((part) => {
      const m = /^\{([^{}]*)\}$/.exec(part);
      if (!m) return escapeStringRegexp(part).replace(/\s+/g, '\\s+');
      if (m[1] === 'category') return '(?<category>.+?)';
      if (m[1] === 'tier') return `(?<tier>${alternation})`;
      fields.push(m[1]);
      return `(?<f${fields.length - 1}>\\S+?)`;
    })
    .join('');
  const entry = { re: new RegExp(`^\\s*${source}\\s*$`), fields, slotOf };
  compiled.set(key, entry);
  return entry;
}

// title -> { fields, category, tier (slot, TODO included), naming } or null. `namings` =
// the active naming first, plus the one a half-finished rename is migrating
// away from (so nothing disappears while a migration is incomplete).
export function parseTitle(title, namings) {
  for (const naming of namings) {
    const { re, fields, slotOf } = compile(naming);
    const m = re.exec(title);
    if (m?.groups?.category?.trim()) {
      return {
        fields: Object.fromEntries(fields.map((name, i) => [name, m.groups[`f${i}`]])),
        category: m.groups.category.trim(),
        tier: slotOf.get(m.groups.tier.replace(/\s+/g, ' ')) ?? slotOf.get(m.groups.tier),
        naming,
      };
    }
  }
  return null;
}

// { fields, category, tier (slot, TODO included) } -> title. A token with no
// value collapses away, along with brackets it leaves empty ("[] Rap S").
export function renderTitle({ template, tierLabels }, { fields = {}, category, tier }) {
  return template
    .replace(/\{([^{}]*)\}/g, (_, name) =>
      name === 'category' ? category : name === 'tier' ? tierLabels[tier] ?? tier : fields[name] ?? ''
    )
    .replace(/\[\s*\]|\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Which naming best describes the user's existing playlists? Tries the
// user's own current template (so their own tokens are kept - the product
// never invents one) and the presets, each with the typed-in tier names and
// the tier-name presets; most matches wins, and on a tie the more specific
// template (more literal text / tokens).
// `current` = { template, tierLabels } typed in so far.
// -> { template, tierLabels } (the to-do name is kept from `current`).
export function detectNaming(titles, { template: currentTemplate = DEFAULT_TEMPLATE, tierLabels: current = DEFAULT_TIER_LABELS } = {}) {
  const specificity = (t) => t.replace(/\{[^{}]*\}/g, '').length + customTokens(t).length * 10;
  let best = { template: currentTemplate, tierLabels: current };
  let bestScore = [0, 0];
  const templates = [...new Set([currentTemplate, ...TEMPLATE_PRESETS])].filter((t) => !validateTemplate(t).length);
  for (const template of templates) {
    // The tier names already typed in first, then the presets.
    for (const labels of [TIER_ORDER.map((t) => current[t]), ...TIER_LABEL_PRESETS.map((p) => p.labels)]) {
      const tierLabels = { ...Object.fromEntries(TIER_ORDER.map((t, i) => [t, labels[i]])), TODO: current.TODO };
      if (Object.keys(validateTierLabels(tierLabels)).length) continue;
      const matches = titles.filter((t) => parseTitle(t, [{ template, tierLabels }])).length;
      const score = [matches, specificity(template)];
      if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[0] > 0 && score[1] > bestScore[1])) {
        best = { template, tierLabels };
        bestScore = score;
      }
    }
  }
  return best;
}

// Example names for hints ("Name playlists like Rap S, Rap A…"): the user's
// own tokens stay as {token}, since their values are the user's to pick.
export function exampleTitle(naming, category, tier) {
  const fields = Object.fromEntries(customTokens(naming.template).map((t) => [t, `{${t}}`]));
  return renderTitle(naming, { fields, category, tier });
}
