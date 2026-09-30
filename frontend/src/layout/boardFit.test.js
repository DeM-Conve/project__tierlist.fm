import { describe, expect, it } from 'vitest';
import { allocateLines, fitBoard, MIN_TILE, tilesPerLine } from './boardFit';

const screen = { viewportHeight: 1000, rowsTop: 250, footerHeight: 0, bottomPad: 24, hasTodo: true, rowWidth: 1300, baseTileSize: 88 };

describe('fitBoard', () => {
  it('the tile size and lines depend only on the screen and the board - there is no input for overlays', () => {
    // The staged-changes bar used to shrink every tile (and change "+N")
    // the moment a change was staged; the fit has no say for it now.
    const a = fitBoard({ ...screen, rowCount: 6 });
    const b = fitBoard({ ...screen, rowCount: 6, pendingPad: 80 });
    expect(b).toEqual(a);
  });

  it('keeps the full tile size when every row fits', () => {
    expect(fitBoard({ ...screen, rowCount: 3 }).tileSize).toBe(88);
  });

  it('shrinks tiles to fit one line per row on a short screen', () => {
    const { tileSize } = fitBoard({ ...screen, viewportHeight: 800, rowCount: 6 });
    expect(tileSize).toBeLessThan(88);
    expect(tileSize).toBeGreaterThanOrEqual(MIN_TILE);
  });

  it('never goes below the minimum (the board scrolls instead)', () => {
    expect(fitBoard({ ...screen, viewportHeight: 300, rowCount: 6 }).tileSize).toBe(MIN_TILE);
  });

  it('before anything is measured: full size, no line budget', () => {
    expect(fitBoard({ ...screen, rowWidth: 0, rowCount: 6 })).toMatchObject({ tileSize: 88, lineBudget: 0 });
    expect(fitBoard({ ...screen, viewportHeight: 0, rowCount: 6 })).toMatchObject({ tileSize: 88, lineBudget: 0 });
  });

  it('a taller screen gives more lines', () => {
    const short = fitBoard({ ...screen, rowCount: 3 }).lineBudget;
    const tall = fitBoard({ ...screen, viewportHeight: 1400, rowCount: 3 }).lineBudget;
    expect(tall).toBeGreaterThan(short);
  });

  it('the TODO card takes its margin out of the room', () => {
    const withTodo = fitBoard({ ...screen, viewportHeight: 700, rowCount: 6, hasTodo: true });
    const without = fitBoard({ ...screen, viewportHeight: 700, rowCount: 6, hasTodo: false });
    expect(withTodo.tileSize).toBeLessThanOrEqual(without.tileSize);
  });
});

describe('tilesPerLine', () => {
  it('fits tiles plus gaps into the row, at least one', () => {
    expect(tilesPerLine(1000, 88)).toBe(10);
    expect(tilesPerLine(10, 88)).toBe(1);
  });
});

describe('allocateLines', () => {
  it('every row gets a line, spare lines go to the row hiding the most', () => {
    expect(allocateLines([30, 2, 5], 10, 5)).toEqual([3, 1, 1]);
  });
  it('a row that already fits never takes more', () => {
    expect(allocateLines([3, 3], 10, 10)).toEqual([1, 1]);
  });
  it('a budget below one line per row still gives each row one', () => {
    expect(allocateLines([50, 50, 50], 10, 1)).toEqual([1, 1, 1]);
  });
});
