import { SHELL_Y, spacingPx } from '../layout/spacing';

// The duel matchup fits the canvas (no page scroll) wherever its two columns
// sit side by side; below this canvas height it flows and scrolls instead of
// squashing the players to nothing.
export const FIT_MIN_HEIGHT = 480;

// The matchup's height when it fits the canvas, else null (it flows, e.g.
// on phones). The canvas pads its page by SHELL_Y above and below (App.jsx,
// md and up - the two columns only sit side by side from lg).
export function matchFitHeight(canvasHeight, wide) {
  if (!wide || !canvasHeight) return null;
  return Math.max(FIT_MIN_HEIGHT, Math.floor(canvasHeight - 2 * spacingPx(SHELL_Y)));
}
