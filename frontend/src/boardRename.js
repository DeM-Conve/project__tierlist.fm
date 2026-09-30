import { normalizeName, parseTitle, renderTitle } from './naming';
import { boardsOf, todoTitle } from './todoLists';
import { BOARD_TIERS, TODO_TIER } from './tiers';

// A board rename (BoardNameEditor), as plain data so it can be tested:
// every playlist of the board (its tiers and its to-do list) gets the naming
// template with the new name. `tierGroups` = selectTierGroups, `rawName` =
// what's typed. -> { name, plan: [{ id, tier, from, to }], changes (plan rows
// whose title actually changes), error (why it can't be done, or null) }.
export function planBoardRename({ naming, tierGroups, category, rawName, pendingCount = 0 }) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  const group = tierGroups[category] || {};
  const ranked = Object.values(tierGroups).flatMap((g) => BOARD_TIERS.filter((t) => t !== TODO_TIER && g[t]).map((t) => g[t]));
  const board = boardsOf(ranked).find((b) => b.category === category) ?? { category, fields: [] };

  const plan = BOARD_TIERS.filter((t) => group[t]).map((t) => {
    const p = group[t];
    // A to-do list linked by hand takes the template shape (and the board's
    // own token values); every other playlist keeps its own values.
    const to =
      p.parsed.via === 'link'
        ? todoTitle(naming, { ...board, category: name })
        : renderTitle(naming, { ...p.parsed, category: name });
    return { id: p.id, tier: t, from: p.title, to };
  });
  const changes = plan.filter((r) => r.from !== r.to);

  function problem() {
    if (!name) return 'Enter a name';
    if (name === category) return null;
    if (pendingCount > 0) return `Push or discard the ${pendingCount} staged change${pendingCount === 1 ? '' : 's'} first`;
    const taken = Object.keys(tierGroups).find((c) => c !== category && normalizeName(c) === normalizeName(name));
    if (taken) return `There's already a board called "${taken}"`;
    // Every new name must still read as this board + tier, or the playlist
    // would drop out of the app after the rename.
    const unreadable = plan.find((r) => {
      const back = parseTitle(r.to, [naming]);
      return !back || back.category !== name || back.tier !== r.tier;
    });
    if (unreadable) return `"${unreadable.to}" wouldn't be recognised by your naming template - try another name`;
    return null;
  }

  return { name, plan, changes, error: problem() };
}
