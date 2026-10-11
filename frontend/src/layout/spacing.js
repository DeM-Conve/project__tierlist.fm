import { px } from '@mantine/core';
import { SPACING } from '../themes';

// The app shell's one spacing standard, in the app's spacing keys
// (themes.js SPACING: 5xs 2 · 4xs 4 · 3xs 6 · 2xs 8 · xs 10 · sm 12 · md 16 ·
// lg 20 · xl 32 · 2xl 40 ...) - pass these straight to Mantine's `p`/`px`/
// `py`/`gap` props, never a raw number, so every column lines up:
//   - SHELL_Y: the top and bottom edge of every shell column (sidebar,
//     canvas, rail) - their first/last things sit on the same lines, and the
//     gap above the player dock is the same everywhere.
//   - *_X: each column's own side padding (the canvas breathes more, the
//     narrow rail less).
export const SHELL_Y = 'md';
export const SIDEBAR_X = 'md';
export const CANVAS_X = { base: 'lg', md: 'xl' };
// The gap between the shell's cards (the --shell-gap CSS variable, index.css -
// VS Code's 5px) and everything around it (the panel's
// edge - the resize sash fills it -, the tier rail, the window edge, the
// dock), like the gap between VS Code's editor and side panels. A CSS
// variable string, which Mantine's spacing props pass straight through.
export const PART_GAP = 'var(--shell-gap)';
export const RAIL_X = 'xs';
// Below md the sidebar is a drawer and a menu button floats at the top-left
// of the canvas, so the canvas starts under it.
export const CANVAS_TOP = { base: 72, md: SHELL_Y };

// The same values in px, for layout maths (e.g. the tier board's fit).
export const spacingPx = (key) => px(SPACING[key]);
