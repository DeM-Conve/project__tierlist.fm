// The activity bar's reorderable top group (the left icon strip), VS Code-
// style: the user drags the icons into their own order, saved to their
// account (backend ActivityItem / `activity_bar_item`). These ids are the
// API's - keep them in step with the Java enum's keys. The bottom group
// (shortcuts / settings / log out) is fixed and not listed here.
// 'duels' came later (V2 migration): last, so a saved order - which only
// lists what it knew - completes to the same order a new account starts with.
export const ACTIVITY_ITEMS = ['home', 'jump', 'boards', 'playlists', 'addSongs', 'duels'];

export const DEFAULT_ACTIVITY_ORDER = ACTIVITY_ITEMS;

// Any list -> a complete order: known ids first, as given (unknown ones and
// repeats dropped - the first copy wins), then whatever it left out, in
// default order. Same completion rule as the backend (which 400s a repeat or
// an unknown id instead - this never sends one). Non-arrays = the default.
export function completeActivityOrder(order) {
  if (!Array.isArray(order)) return DEFAULT_ACTIVITY_ORDER;
  const seen = [];
  order.forEach((id) => {
    if (ACTIVITY_ITEMS.includes(id) && !seen.includes(id)) seen.push(id);
  });
  return [...seen, ...ACTIVITY_ITEMS.filter((id) => !seen.includes(id))];
}
