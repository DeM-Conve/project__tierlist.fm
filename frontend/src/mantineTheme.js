import { createTheme } from '@mantine/core';

// Graphite + violet. The chrome is deliberately neutral and the accent is
// violet - a hue outside the tiers' red -> blue ramp - so the tier colors and
// the album art are the only loud things on screen (the old amber accent sat
// right between T2 and T3 and made buttons read like tiers).
//
// Indexed the way Mantine's own dark scale is used: 0 = primary text,
// 2 = dimmed text, 4 = borders, 6 = default button / input fill,
// 7 = body / Paper, 9 = deepest background.
const dark = [
  '#eceef3', // 0 - primary text
  '#c9ccd4',
  '#9ba1ad', // 2 - dimmed text
  '#737985', // 3 - placeholder
  '#3a3f4a', // 4 - borders
  '#2c3039', // 5 - default hover
  '#22252d', // 6 - default button / input
  '#16181d', // 7 - body / paper
  '#111317',
  '#0b0c0f', // 9
];

const accent = [
  '#f1efff',
  '#e2ddff',
  '#c6bcff',
  '#a999fb',
  '#9585f8',
  '#8b7cf6', // 5 - accent for text / rings (var(--accent))
  '#7a69ee', // 6 - filled buttons (white text stays readable)
  '#6856d9',
  '#5646b8',
  '#443893',
];

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: 6,
  colors: { dark, accent },
  fontFamily: "'Inter', -apple-system, sans-serif",
  headings: {
    fontFamily: "'Archivo', -apple-system, sans-serif",
    fontWeight: '800',
  },
  defaultRadius: '6px',
  black: '#0b0c0f',
  white: '#eceef3',
});
