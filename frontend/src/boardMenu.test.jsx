import { describe, expect, it, vi } from 'vitest';
import { boardMenuGroups, boardPath, duelPath } from './boardMenu';

describe('board routes', () => {
  it('encode the board name', () => {
    expect(boardPath('Lo-fi & Chill')).toBe('/tier/Lo-fi%20%26%20Chill');
    expect(duelPath('Lo-fi & Chill')).toBe('/tier/Lo-fi%20%26%20Chill/duel');
  });
});

describe('boardMenuGroups', () => {
  const tiers = { S: { id: 'p1' }, B: { id: 'p2' }, TODO: { id: 'p3' } };

  it('Open board and Duel first, then the tiers the board has, best first', () => {
    const navigate = vi.fn();
    const [board, tierGroup] = boardMenuGroups({ category: 'Rap', tiers, navigate });
    expect(board.items.map((i) => i.title)).toEqual(['Open board', 'Duel']);
    expect(tierGroup.label).toBe('Open tier');
    expect(tierGroup.items.map((i) => i.key)).toEqual(['tier-S', 'tier-B', 'tier-TODO']);

    board.items[1].onClick();
    expect(navigate).toHaveBeenLastCalledWith('/tier/Rap/duel');
    board.items[0].onClick();
    expect(navigate).toHaveBeenLastCalledWith('/tier/Rap');
    tierGroup.items[1].onClick();
    expect(navigate).toHaveBeenLastCalledWith('/tier/Rap/t/B');
  });

  it('no tier submenu for a board with no tier playlists', () => {
    expect(boardMenuGroups({ category: 'Rap', tiers: {}, navigate: vi.fn() })).toHaveLength(1);
  });
});
