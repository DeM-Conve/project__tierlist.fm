// Fitting a tier board to the screen (TierBoardView): how big the tiles are
// and how many tile lines the rows share. Only the screen and the board's
// own shape count - never a floating overlay like the staged-changes bar,
// which sits over the board (it scrolls clear of it) instead of shrinking
// every tile the moment a change is staged.

import { spacingPx } from './spacing';

// The tile area's spacing keys (TierBoardView draws them with these keys, the
// maths below reads the same keys in px, so the two never drift apart):
// the gap between tiles / tile lines, and the row's inner padding.
export const GAP_KEY = '2xs';
export const INSET_KEY = '4xs';
export const GAP = spacingPx(GAP_KEY);
export const INSET = spacingPx(INSET_KEY);
// The TODO card's top margin (TierBoardView: mt="md").
export const TODO_GAP_KEY = 'md';
// An empty row doesn't hold a line of tiles open: it collapses to this
// height (its drop zone + the tier label), and the tiles share what it frees.
export const EMPTY_ROW_KEY = '3xl';
export const EMPTY_ROW = spacingPx(EMPTY_ROW_KEY);
// Smallest tile the board shrinks to when fitting every row on screen.
export const MIN_TILE = 60;
// A row's fixed vertical chrome around its tile lines: 2 x (box padding
// + inner padding, both INSET) + the 1px top border.
export const ROW_CHROME = 4 * INSET + 1;

// Tiles per line in a row whose tile area is `width` wide.
// (width - 2 x INSET): the inner row keeps INSET each side so focus/search rings aren't clipped.
export function tilesPerLine(width, size) {
  return Math.max(1, Math.floor((width - 2 * INSET + GAP) / (size + GAP)));
}

// Splits `budget` tile lines between rows: every row gets one, then each
// spare line goes to whichever row still hides the most songs - so a big
// tier grows first and a tier that already fits never takes more space.
export function allocateLines(counts, perLine, budget) {
  const lines = counts.map(() => 1);
  let left = budget - counts.length;
  while (left > 0) {
    let best = -1;
    let bestHidden = 0;
    counts.forEach((c, i) => {
      const hidden = c - lines[i] * perLine;
      if (hidden > bestHidden) {
        best = i;
        bestHidden = hidden;
      }
    });
    if (best < 0) break;
    lines[best] += 1;
    left -= 1;
  }
  return lines;
}

// -> { tileSize, perLine, lineBudget }.
//   viewportHeight: the canvas; rowsTop: where the rows start in it;
//   footerHeight, bottomPad: below the rows (the canvas's own padding);
//   hasTodo: the TODO row is a separate card (TODO_GAP_KEY margin + 2px borders).
//   rowCount: the rows that hold songs; emptyRows: the collapsed empty ones.
// When even one line per row at the full tile size doesn't fit, the tiles
// shrink until it does - down to MIN_TILE, below which song names stop
// being legible and the board scrolls instead.
export function fitBoard({ viewportHeight, rowsTop, footerHeight, bottomPad, hasTodo, rowCount, emptyRows = 0, rowWidth, baseTileSize }) {
  const available = viewportHeight - rowsTop - footerHeight - bottomPad - (hasTodo ? spacingPx(TODO_GAP_KEY) + 2 : 0) - 1
    - emptyRows * (EMPTY_ROW + ROW_CHROME);
  const measured = rowWidth > 0 && viewportHeight > 0 && rowCount > 0;
  const fitSize = Math.floor((available - rowCount * (ROW_CHROME - GAP)) / rowCount - GAP);
  const tileSize = measured ? Math.max(Math.min(baseTileSize, MIN_TILE), Math.min(baseTileSize, fitSize)) : baseTileSize;
  const perLine = tilesPerLine(rowWidth, tileSize);
  const lineBudget = measured ? Math.floor((available - rowCount * (ROW_CHROME - GAP)) / (tileSize + GAP)) : 0;
  return { tileSize, perLine, lineBudget };
}
