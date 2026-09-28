import { useSelector } from 'react-redux';
import { DEFAULT_TIER_LABELS } from './tiers';

// What each tier slot is called on screen: the user's "shown as" name
// (`naming.tierDisplayNames`) if set, else its name in playlist names
// (`naming.tierLabels`) - so a board shows "S A B C D" for one person,
// "T1 … TZ" for another, and "TODO" for a to-do list named "(**TODO**)".
// Components: `const tierName = useTierName()` (re-renders on change).
// Plain code (toasts, menus built outside React): `tierName(slot)`, kept in
// step with the store by `syncTierLabels` (store.js).
let labels = DEFAULT_TIER_LABELS;
let shown = {};

const nameOf = (slot, l, d) => d?.[slot] || l?.[slot] || slot;

export function tierName(slot) {
  return nameOf(slot, labels, shown);
}

export function syncTierLabels(naming) {
  if (naming?.tierLabels) labels = naming.tierLabels;
  shown = naming?.tierDisplayNames ?? {};
}

export function useTierName() {
  const l = useSelector((s) => s.naming.tierLabels);
  const d = useSelector((s) => s.naming.tierDisplayNames);
  return (slot) => nameOf(slot, l, d);
}
