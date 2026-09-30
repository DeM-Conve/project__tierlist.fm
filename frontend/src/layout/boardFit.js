// Fitting a tier board to the screen (TierBoardView): how big the tiles are
// and how many tile lines the rows share. Only the screen and the board's
// own shape count - never a floating overlay like the staged-changes bar,
// which sits over the board (it scrolls clear of it) instead of shrinking
// every tile the moment a change is staged.

export const GAP = 8;
// Smallest tile the board shrinks to when fitting every row on screen.
export const MIN_TILE = 60;
// A row's fixed vertical chrome around its tile lines: 2 x (4px box padding
// + 4px inner padding) + the 1px top border.
export const ROW_CHROME = (4 * GAP) / 2 + 1;

// Tiles per line in a row whose tile area is `width` wide.
// (width - 8): the inner row keeps 4px each side so focus/search rings aren't clipped.
export function tilesPerLine(width, size) {
  return Math.max(1, Math.floor((width - 8 + GAP) / (size + GAP)));
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
//   hasTodo: the TODO row is a separate card (16px margin + 2px borders).
// When even one line per row at the full tile size doesn't fit, the tiles
// shrink until it does - down to MIN_TILE, below which song names stop
// being legible and the board scrolls instead.
export function fitBoard({ viewportHeight, rowsTop, footerHeight, bottomPad, hasTodo, rowCount, rowWidth, baseTileSize }) {
  const available = viewportHeight - rowsTop - footerHeight - bottomPad - (hasTodo ? 18 : 0) - 1;
  const measured = rowWidth > 0 && viewportHeight > 0 && rowCount > 0;
  const fitSize = Math.floor((available - rowCount * (ROW_CHROME - GAP)) / rowCount - GAP);
  const tileSize = measured ? Math.max(Math.min(baseTileSize, MIN_TILE), Math.min(baseTileSize, fitSize)) : baseTileSize;
  const perLine = tilesPerLine(rowWidth, tileSize);
  const lineBudget = measured ? Math.floor((available - rowCount * (ROW_CHROME - GAP)) / (tileSize + GAP)) : 0;
  return { tileSize, perLine, lineBudget };
}
