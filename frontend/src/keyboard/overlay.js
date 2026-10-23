// True while keyboard focus is inside something drawn over the page - a
// modal (the "?" shortcut list, a confirm dialog), a menu (a song's "..."
// menu) or a listbox. Its keys are its own: app-wide single-letter keys
// (the player dock's Space / j / k / m / digits, Vim navigation) stand
// down, so e.g. Escape closes the modal without also minimizing the
// player behind it, and Space activates the focused menu item.
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

export function focusInOverlay() {
  return !!document.activeElement?.closest?.(OVERLAY);
}
