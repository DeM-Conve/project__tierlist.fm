import { createTheme } from '@mantine/core';

// Same warm-charcoal palette as index.css's CSS variables, expressed as
// Mantine color scales (index 0 = lightest, 9 = darkest, matching Mantine's
// own `dark` convention) so every Mantine component inherits it instead of
// Mantine's default blue/gray theme.
const dark = [
  '#f3efe8', // 0 - primary text
  '#c9c2b4',
  '#a89f8f',
  '#8a8172',
  '#6b6355',
  '#5c5548', // 5 - faint text
  '#46392a',
  '#332c23', // 7 - border
  '#241f1a', // 8 - surface-2
  '#131110', // 9 - app background
];

const accent = [
  '#fdf3e0',
  '#f7e6c2',
  '#f0d5a0',
  '#e9c37d',
  '#e2b15c',
  '#d6a24c', // 5 - brand accent
  '#c48f3a',
  '#a97a2f',
  '#8a6326',
  '#6b4c1d',
];

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: 5,
  colors: { dark, accent },
  fontFamily: "'Inter', -apple-system, sans-serif",
  headings: {
    fontFamily: "'Archivo', -apple-system, sans-serif",
    fontWeight: '800',
  },
  defaultRadius: '4px',
  black: '#131110',
  white: '#f3efe8',
});
