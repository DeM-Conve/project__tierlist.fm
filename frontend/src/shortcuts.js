// Single source of truth for every keyboard shortcut in the app. Nothing
// here wires up a listener by itself - components still own their own
// context-specific keydown handling (see the comments in TierBoardView,
// PlayerDock and DuelView for why: several of these are small state
// machines - the vim search box, the player's j/k mode transitions, shift+
// digit tier reassignment - that don't reduce to a flat key->handler map).
// What this file gives those scattered handlers is one place that both the
// "?" help modal and the command palette's hotkey hints read from, so a new
// shortcut only needs documenting once instead of drifting out of sync with
// what's actually bound.
export const SHORTCUTS = [
  { id: 'palette', keys: ['Ctrl', 'K'], description: 'Open command palette', category: 'Global' },
  { id: 'help', keys: ['?'], description: 'Show this shortcut list', category: 'Global' },
  { id: 'undo', keys: ['Ctrl', 'Z'], description: 'Undo the last tier edit (drag, move, rating, bulk, duel result)', category: 'Global' },

  { id: 'search', keys: ['/'], description: 'Search this tier board', category: 'Tier board' },
  { id: 'search-next', keys: ['n'], description: 'Jump to next match', category: 'Tier board' },
  { id: 'search-prev', keys: ['N'], description: 'Jump to previous match', category: 'Tier board' },
  { id: 'hover-move', keys: ['hover', '1-5'], description: 'Move the hovered tile to that tier (1 = the top tier)', category: 'Tier board' },
  {
    id: 'search-play',
    keys: ['Enter'],
    description: 'Play the match (or jump to the selected one)',
    category: 'Tier board',
  },
  { id: 'search-close', keys: ['Esc'], description: 'Close search', category: 'Tier board' },

  { id: 'focus-filter', keys: ['/'], description: 'Filter this tier', category: 'Tier (full list)' },
  { id: 'focus-select-all', keys: ['Ctrl', 'A'], description: 'Select every row shown', category: 'Tier (full list)' },
  { id: 'focus-range', keys: ['Shift', 'Click'], description: 'Select a range of rows', category: 'Tier (full list)' },
  { id: 'focus-clear', keys: ['Esc'], description: 'Clear the selection (or the filter)', category: 'Tier (full list)' },
  {
    id: 'push',
    keys: ['Shift', 'P'],
    description: 'Push pending changes to YouTube',
    category: 'Tier board',
    // Matches the command palette's own "Sync ... to YouTube" action id, so
    // that entry can show this key as a hint instead of the two drifting.
    commandId: 'action-sync',
  },

  { id: 'player-prev', keys: ['h'], description: 'Previous track', category: 'Player' },
  { id: 'player-next', keys: ['l'], description: 'Next track', category: 'Player' },
  {
    id: 'player-seek',
    keys: ['←', '→'],
    description: 'Seek 10s back/forward (while expanded)',
    category: 'Player',
  },
  { id: 'player-play-pause', keys: ['Space'], description: 'Play / pause', category: 'Player' },
  { id: 'player-mute', keys: ['m'], description: 'Mute / unmute', category: 'Player' },
  {
    id: 'player-seek-percent',
    keys: ['0-9'],
    description: 'Jump to that 10% of the video (0 = start, 9 = 90%) - except while hovering a board tile, where 1-5 move it',
    category: 'Player',
  },
  {
    id: 'player-minimize',
    keys: ['j'],
    description: 'Minimize (expanded → mini → floating)',
    category: 'Player',
  },
  { id: 'player-expand', keys: ['k'], description: 'Expand the player', category: 'Player' },
  {
    id: 'player-collapse',
    keys: ['Esc'],
    description: 'Minimize the player (from expanded)',
    category: 'Player',
  },
  {
    id: 'player-tier',
    keys: ['Shift', '1-9'],
    description: 'Rate the playing video into that tier (any player mode, on its own board)',
    category: 'Player',
  },

  { id: 'duel-left', keys: ['←'], description: 'Pick the left video', category: 'Duel' },
  { id: 'duel-right', keys: ['→'], description: 'Pick the right video', category: 'Duel' },
  { id: 'duel-skip', keys: ['Space'], description: "Skip - too close to call", category: 'Duel' },
  { id: 'duel-undo', keys: ['u'], description: 'Undo the last pick', category: 'Duel' },
];

export function hotkeyForCommand(commandId) {
  return SHORTCUTS.find((s) => s.commandId === commandId)?.keys;
}
