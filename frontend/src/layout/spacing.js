import { DEFAULT_THEME, px } from '@mantine/core';

// The app shell's one spacing standard, in Mantine spacing keys (xs 10 ·
// sm 12 · md 16 · lg 20 · xl 32) - pass these straight to Mantine's `p`/`px`/
// `py`/`gap` props, never a raw number, so every column lines up:
//   - SHELL_Y: the top and bottom edge of every shell column (sidebar,
//     canvas, rail) - their first/last things sit on the same lines, and the
//     gap above the player dock is the same everywhere.
//   - *_X: each column's own side padding (the canvas breathes more, the
//     narrow rail less).
export const SHELL_Y = 'md';
export const SIDEBAR_X = 'md';
export const CANVAS_X = { base: 'lg', md: 'xl' };
export const RAIL_X = 'xs';
// Below md the sidebar is a drawer and a menu button floats at the top-left
// of the canvas, so the canvas starts under it.
export const CANVAS_TOP = { base: 72, md: SHELL_Y };

// The same values in px, for layout maths (e.g. the tier board's fit).
export const spacingPx = (key) => px(DEFAULT_THEME.spacing[key]);
