// Single source of truth for every keyboard shortcut in the app.
// `keys`: with a modifier (Ctrl/Shift/Alt/Cmd) the keys are one combo
// (Ctrl+K); otherwise each entry is an alternative ([ or ]), and a Vim
// sequence is one string ('gh' = g then h). Nothing
// here wires up a listener by itself, though a component can bind and print
// an entry's key via shortcutKey() (the board header does) so the two can't
// drift. Components still own their own
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
  { id: 'palette-vscode', keys: ['Ctrl', 'P'], description: 'Command palette, like VS Code’s Quick Open (Ctrl+Shift+P and F1 too)', category: 'Global' },
  { id: 'help', keys: ['?'], description: 'Show this shortcut list', category: 'Global', commandId: 'action-shortcuts' },
  { id: 'sidebar', keys: ['Ctrl', 'B'], description: 'Open / close the board panel next to the activity bar, like VS Code (on a phone: the menu)', category: 'Global' },
  { id: 'view-boards', keys: ['Ctrl', 'Shift', 'E'], description: 'Show the Tier lists view in the panel (like VS Code’s Explorer)', category: 'Global' },
  { id: 'view-playlists', keys: ['Ctrl', 'Shift', 'F'], description: 'Show the Playlists view in the panel (like VS Code’s Search)', category: 'Global' },
  { id: 'view-duels', keys: ['Ctrl', 'Shift', 'D'], description: 'Show the Duels view in the panel (like VS Code’s Run and Debug)', category: 'Global' },
  { id: 'settings', keys: ['Ctrl', ','], description: 'Open Settings, like VS Code', category: 'Global', commandId: 'page-settings' },
  { id: 'undo', keys: ['Ctrl', 'Z'], description: 'Undo the last tier edit (drag, move, rating, bulk, duel result)', category: 'Global' },
  { id: 'redo', keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo the last undone tier edit (Ctrl+Y too)', category: 'Global' },
  { id: 'back', keys: ['Alt', '←'], description: 'Up one level, like VS Code’s Go Back (every page: tier page → board → Home, duel pages → hub → board; g u too)', category: 'Global' },
  { id: 'forward', keys: ['Alt', '→'], description: 'Go forward, like VS Code’s Go Forward (the browser’s own key)', category: 'Global' },

  { id: 'hints', keys: ['f'], description: 'Link hints: label everything clickable, type a label to click it', category: 'Navigation (Vim)' },
  { id: 'omnibar', keys: ['o'], description: 'Open the command palette (like Ctrl+K)', category: 'Navigation (Vim)' },
  { id: 'go-home', keys: ['gh'], description: 'Go to Home', category: 'Navigation (Vim)' },
  { id: 'add-songs', keys: ['a'], description: 'Add a song (paste its YouTube link)', category: 'Navigation (Vim)' },
  { id: 'go-settings', keys: ['gs'], description: 'Go to Settings', category: 'Navigation (Vim)' },
  { id: 'go-playing', keys: ['gp'], description: 'Go to the playing song’s board', category: 'Navigation (Vim)' },
  { id: 'go-up', keys: ['gu'], description: 'Up one level (every page: tier page → board → Home, duel pages → hub → board)', category: 'Navigation (Vim)' },
  { id: 'go-board', keys: ['gb'], description: 'Back to this board (from a tier page)', category: 'Navigation (Vim)' },
  { id: 'go-todo', keys: ['gt'], description: 'This board’s TODO list', category: 'Navigation (Vim)' },
  { id: 'go-duel', keys: ['gd'], description: 'Duel on this board', category: 'Navigation (Vim)' },
  { id: 'board-prev-next', keys: ['[', ']'], description: 'Previous / next board', category: 'Navigation (Vim)' },
  { id: 'history', keys: ['H', 'L'], description: 'Back / forward', category: 'Navigation (Vim)' },
  { id: 'scroll-top', keys: ['gg'], description: 'Scroll to the top of the page', category: 'Navigation (Vim)' },
  { id: 'scroll-bottom', keys: ['G'], description: 'Scroll to the bottom of the page', category: 'Navigation (Vim)' },
  { id: 'half-page-down', keys: ['Ctrl', 'D'], description: 'Scroll half a page down (Vim)', category: 'Navigation (Vim)' },
  { id: 'half-page-up', keys: ['Ctrl', 'U'], description: 'Scroll half a page up (Vim)', category: 'Navigation (Vim)' },
  { id: 'focus-input', keys: ['gi'], description: 'Focus the page’s first text box (filter, link box…)', category: 'Navigation (Vim)' },
  { id: 'yank', keys: ['yy'], description: 'Copy the playing song’s YouTube link', category: 'Navigation (Vim)' },

  { id: 'home-filter', keys: ['/'], description: 'Filter boards & playlists', category: 'Home' },
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
  // The board header's buttons. TierBoardView binds these exact keys and
  // prints them on the buttons (shortcutKey), so list and binding can't drift.
  { id: 'board-duel', keys: ['d'], description: 'Duel on this board (like the Duel button; gd too)', category: 'Tier board' },
  { id: 'board-play', keys: ['p'], description: 'Play the whole board from the top tier', category: 'Tier board' },
  { id: 'board-shuffle', keys: ['s'], description: 'Shuffle play the whole board', category: 'Tier board' },

  { id: 'focus-filter', keys: ['/'], description: 'Filter this tier', category: 'Tier (full list)' },
  { id: 'focus-clear', keys: ['Esc'], description: 'Clear the filter', category: 'Tier (full list)' },
  {
    id: 'push',
    keys: ['Shift', 'P'],
    description: 'Push pending changes to YouTube (any board page)',
    category: 'Tier board',
    // Matches the command palette's own "Sync ... to YouTube" action id, so
    // that entry can show this key as a hint instead of the two drifting.
    commandId: 'action-sync',
  },

  { id: 'add-file', keys: ['Shift', '1-5'], description: 'Put the song in tier 1-5 of the shown board (plain digits still seek)', category: 'Add songs' },
  { id: 'add-later', keys: ['t'], description: 'Save it to the board’s TODO list for later', category: 'Add songs' },
  { id: 'add-listen', keys: ['Enter'], description: 'Listen (putting the playing song in a tier plays the next)', category: 'Add songs' },
  { id: 'add-skip', keys: ['s'], description: 'Skip to the next waiting song', category: 'Add songs' },
  { id: 'add-remove', keys: ['x'], description: 'Remove it from the waiting list', category: 'Add songs' },
  { id: 'add-board', keys: ['b'], description: 'Pick a different board', category: 'Add songs' },
  { id: 'add-input', keys: ['/', 'a'], description: 'Back to the link / search box', category: 'Add songs' },
  { id: 'add-undo', keys: ['u'], description: 'Undo the last add (Ctrl+Z works too)', category: 'Add songs' },
  { id: 'add-paste', keys: ['Ctrl', 'V'], description: 'Paste YouTube link(s) anywhere to add those songs', category: 'Global' },

  { id: 'player-prev', keys: ['h'], description: 'Previous track (← too, unless expanded)', category: 'Player' },
  { id: 'player-next', keys: ['l'], description: 'Next track (→ too, unless expanded)', category: 'Player' },
  {
    id: 'player-seek',
    keys: ['←', '→'],
    description: 'Seek 10s back/forward (while expanded)',
    category: 'Player',
  },
  { id: 'player-play-pause', keys: ['Space'], description: 'Play / pause', category: 'Player' },
  { id: 'player-mute', keys: ['m'], description: 'Mute / unmute', category: 'Player' },
  { id: 'player-fullscreen', keys: ['f'], description: 'Fullscreen video (expanded; elsewhere f is link hints)', category: 'Player' },
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
  {
    id: 'player-remove',
    keys: ['Del'],
    description: 'Remove the playing video from its playlist (staged until you push; on its own board)',
    category: 'Player',
  },

  { id: 'duel-a', keys: ['←'], description: 'A wins (Shift+← A, clearly)', category: 'Duel' },
  { id: 'duel-b', keys: ['→'], description: 'B wins (Shift+→ B, clearly)', category: 'Duel' },
  { id: 'duel-close', keys: ['↓'], description: 'Too close to call', category: 'Duel' },
  { id: 'duel-listen', keys: ['Tab'], description: 'Switch which clip is playing', category: 'Duel' },
  { id: 'duel-skip', keys: ['s'], description: "Don't know one of them (skip the opponent)", category: 'Duel' },
  { id: 'duel-pause', keys: ['Space'], description: 'Play / pause the clip being heard', category: 'Duel' },
  { id: 'duel-next', keys: ['Enter'], description: 'Start the session (duel hub); next duel (after a verdict)', category: 'Duel' },
  { id: 'duel-undo', keys: ['u'], description: 'Undo the last verdict', category: 'Duel' },
  { id: 'duel-end', keys: ['e'], description: 'End the session and see the summary', category: 'Duel' },
  { id: 'duel-moves', keys: ['m', 'x', 'l', 'p'], description: 'Suggested moves: move / keep / lock / play (↑↓ browse)', category: 'Duel' },
];

// What the command palette (Mantine Spotlight) opens on - Ctrl+K plus VS
// Code's Quick Open, Command Palette and F1. Spotlight binds them itself.
export const PALETTE_HOTKEYS = ['mod + K', 'mod + P', 'mod + shift + P', 'F1'];

// The single key of a one-key shortcut - what a component binds and shows.
export function shortcutKey(id) {
  const entry = SHORTCUTS.find((s) => s.id === id);
  if (!entry || entry.keys.length !== 1) throw new Error(`No one-key shortcut "${id}"`);
  return entry.keys[0];
}

export function hotkeyForCommand(commandId) {
  return SHORTCUTS.find((s) => s.commandId === commandId)?.keys;
}
