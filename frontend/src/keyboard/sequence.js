// Vim-style two-key sequences (`g i`, `y y` - bound with react-hotkeys-hook
// in useVimKeys) start with a prefix key. The key *after* a prefix belongs to
// the sequence, so page-level handlers that bind single letters (the player's
// h = previous track, the Inbox's s = skip, ...) must ignore it - call
// `isSequenceKey(e)` first. Registered at import time in the capture phase,
// so it sees every keydown before any component handler does.
export const SEQUENCE_PREFIXES = ['g', 'y'];
const TIMEOUT_MS = 1000;

let pendingUntil = 0;
const sequenceEvents = new WeakSet();

function isTyping() {
  const el = document.activeElement;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable;
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const inSequence = Date.now() < pendingUntil;
      if (inSequence) sequenceEvents.add(e);
      const startsOne =
        !inSequence && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey && SEQUENCE_PREFIXES.includes(e.key);
      pendingUntil = startsOne ? Date.now() + TIMEOUT_MS : 0;
    },
    { capture: true }
  );
}

// True for the second key of a `g _` / `y _` sequence.
export function isSequenceKey(e) {
  return sequenceEvents.has(e);
}
