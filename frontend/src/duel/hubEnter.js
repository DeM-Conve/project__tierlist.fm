// The duel hub's Enter starts a session - unless Enter is already another
// control's own key: a focused link (e.g. "Resume the session in progress",
// which Enter used to override by starting a new session and so ending the
// one you meant to resume), a button (a suggested move's Move / Keep), a text
// field. Picking a session length (a radio of the SegmentedControl) or a focus
// card (marked `data-duel-focus`) and then pressing Enter starts it.
const OWN_ENTER = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]';

export function enterStarts(target) {
  if (!target || typeof target.closest !== 'function') return true;
  if (target.closest('[data-duel-focus]')) return true;
  if (target.tagName === 'INPUT' && target.type === 'radio') return true;
  return !target.closest(OWN_ENTER);
}
