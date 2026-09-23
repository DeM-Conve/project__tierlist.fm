import { normalizeTemplate } from '../naming';

// The settings the account stores (backend SettingsDto), grouped exactly like
// the Redux slices that own them. One schema drives mapping, comparison and
// merging, so a new setting is one entry here (+ its column/enum backend-side).
const SCHEMA = {
  appearance: ['theme', 'accent', 'tierPalette'],
  naming: ['template', 'migratingFrom', 'todoKeyword', 'todoLinks'],
  prefs: ['duelStrategy'],
};

// Fields are primitives except todoLinks ({ playlistId: category }), so
// compare by value: a copy that came back from the server is still "same".
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function mapFields(fn) {
  return Object.fromEntries(
    Object.entries(SCHEMA).map(([group, fields]) => [group, Object.fromEntries(fields.map((f) => [f, fn(group, f)]))])
  );
}

// Redux state -> the API body. Templates go up in canonical form (the backend
// only knows {tag}, not its old alias {bracket}).
export function toServer(state) {
  const settings = mapFields((group, field) => state[group][field] ?? null);
  settings.naming.template = normalizeTemplate(settings.naming.template);
  if (settings.naming.migratingFrom) settings.naming.migratingFrom = normalizeTemplate(settings.naming.migratingFrom);
  return settings;
}

export function sameSettings(a, b) {
  if (!a || !b) return a === b;
  return Object.entries(SCHEMA).every(([group, fields]) => fields.every((f) => sameValue(a[group]?.[f], b[group]?.[f])));
}

// Three-way merge after a 412 (another device saved first): every field this
// browser changed since `base` (the version it last saw) is kept, everything
// else takes the newer server value. With no base (this browser was only
// uploading its cached settings) the account's copy wins outright.
export function rebase(local, base, fresh) {
  if (!base || !fresh) return fresh ?? local;
  return mapFields((group, field) =>
    !sameValue(local[group][field], base[group][field]) ? local[group][field] : fresh[group][field]
  );
}
