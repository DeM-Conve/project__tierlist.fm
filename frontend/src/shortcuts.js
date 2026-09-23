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

  { id: 'hints', keys: ['f'], description: 'Link hints: label everything clickable, type a label to click it', category: 'Navigation (Vim)' },
  { id: 'omnibar', keys: ['o'], description: 'Open the command palette (like Ctrl+K)', category: 'Navigation (Vim)' },
  { id: 'go-home', keys: ['g', 'h'], description: 'Go to Home', category: 'Navigation (Vim)' },
  { id: 'go-inbox', keys: ['g', 'i'], description: 'Go to the Inbox', category: 'Navigation (Vim)' },
  { id: 'go-settings', keys: ['g', 's'], description: 'Go to Settings', category: 'Navigation (Vim)' },
  { id: 'go-playing', keys: ['g', 'p'], description: 'Go to the playing song’s board', category: 'Navigation (Vim)' },
  { id: 'go-board', keys: ['g', 'b'], description: 'Back to this board (from a tier page)', category: 'Navigation (Vim)' },
  { id: 'go-todo', keys: ['g', 't'], description: 'This board’s TODO list', category: 'Navigation (Vim)' },
  { id: 'go-duel', keys: ['g', 'd'], description: 'Duel on this board', category: 'Navigation (Vim)' },
  { id: 'board-prev-next', keys: ['[', ']'], description: 'Previous / next board', category: 'Navigation (Vim)' },
  { id: 'history', keys: ['H', 'L'], description: 'Back / forward', category: 'Navigation (Vim)' },
  { id: 'scroll-ends', keys: ['g', 'g', '/', 'G'], description: 'Scroll to top / bottom', category: 'Navigation (Vim)' },
  { id: 'yank', keys: ['y', 'y'], description: 'Copy the playing song’s YouTube link', category: 'Navigation (Vim)' },

  { id: 'search', keys: ['/'], description: 'Search this tier board', category: 'Tier board' },
  { id: 'search-next', keys: ['n'], description: 'Jump to next match', category: 'Tier board' },
  { id: 'search-prev', keys: ['N'], description: 'Jump to previous match', category: 'Tier board' },
  {
    id: 'search-play',
    keys: ['Enter'],
    description: 'Play the match (or jump to the selected one)',
    category: 'Tier board',
  },
  { id: 'search-close', keys: ['Esc'], description: 'Close search', category: 'Tier board' },

  { id: 'focus-filter', keys: ['/'], description: 'Filter this tier', category: 'Tier (full list)' },
  { id: 'focus-clear', keys: ['Esc'], description: 'Clear the filter', category: 'Tier (full list)' },
  {
    id: 'push',
    keys: ['Shift', 'P'],
    description: 'Push pending changes to YouTube',
    category: 'Tier board',
    // Matches the command palette's own "Sync ... to YouTube" action id, so
    // that entry can show this key as a hint instead of the two drifting.
    commandId: 'action-sync',
  },

  { id: 'inbox-file', keys: ['1-5'], description: 'File the song into T1…TZ of the shown board', category: 'Inbox' },
  { id: 'inbox-later', keys: ['t'], description: 'Save it to the board’s TODO list for later', category: 'Inbox' },
  { id: 'inbox-listen', keys: ['Enter'], description: 'Listen (filing the playing song plays the next)', category: 'Inbox' },
  { id: 'inbox-skip', keys: ['s'], description: 'Skip (sends it to the back)', category: 'Inbox' },
  { id: 'inbox-dismiss', keys: ['x'], description: 'Not a song - hide it for good', category: 'Inbox' },
  { id: 'inbox-board', keys: ['b'], description: 'Pick a different board', category: 'Inbox' },
  { id: 'inbox-undo', keys: ['u'], description: 'Undo the last Inbox action (Ctrl+Z works too)', category: 'Inbox' },
  { id: 'inbox-paste', keys: ['Ctrl', 'V'], description: 'Paste a YouTube link anywhere to add that song', category: 'Global' },

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
    description: 'Jump to that 10% of the video (0 = start, 9 = 90%)',
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
