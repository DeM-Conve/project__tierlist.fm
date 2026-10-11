import { describe, expect, it } from 'vitest';
import { FIT_MIN_HEIGHT, matchFitHeight } from './matchFit';

describe('matchFitHeight', () => {
  it('two columns side by side: the canvas height less its top and bottom padding (SHELL_Y, 16px each)', () => {
    expect(matchFitHeight(700, true)).toBe(668);
    expect(matchFitHeight(700.6, true)).toBe(668);
  });

  it('a short canvas scrolls instead of squashing the players to nothing', () => {
    expect(matchFitHeight(300, true)).toBe(FIT_MIN_HEIGHT);
  });

  it('narrow screens (stacked columns) and an unmeasured canvas flow', () => {
    expect(matchFitHeight(700, false)).toBeNull();
    expect(matchFitHeight(0, true)).toBeNull();
  });
});
