// The expanded player's queue is drawn as ONE list (one virtualized
// Droppable): [...history, current, ...upcoming]. These map positions in
// that combined list back to the focusSlice's two lists.

// Where row `index` of the combined list lives: { section, index } or null
// for the playing song itself.
export function queueSlot(historyLength, index) {
  if (index < historyLength) return { section: 'history', index };
  if (index === historyLength) return null;
  return { section: 'upcoming', index: index - historyLength - 1 };
}

// A drag from combined index `source` to `destination` (@hello-pangea/dnd's
// final position, i.e. counted after the row left its old place) as the
// `moveInQueue` payload { from, to } - or null for a no-op / the playing
// song. A row landing above the playing song is in history, below it Up
// next.
export function queueMove(historyLength, source, destination) {
  if (source === destination) return null;
  const from = queueSlot(historyLength, source);
  if (!from) return null;
  // The playing song's index once the dragged row has left the list.
  const current = from.section === 'history' ? historyLength - 1 : historyLength;
  const to =
    destination <= current
      ? { section: 'history', index: destination }
      : { section: 'upcoming', index: destination - current - 1 };
  return { from, to };
}
