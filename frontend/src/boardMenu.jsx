import { Box } from '@mantine/core';
import { useContextMenu } from 'mantine-contextmenu';
import { useNavigate } from 'react-router-dom';
import { LayoutList, ListTree, Swords } from 'lucide-react';
import { BOARD_TIERS, TIER_COLORS } from './tiers';
import { tierName } from './tierLabels';

// A board's routes - one place, so every entry point (side panel rows, the
// board menu, the command palette) links the same URLs.
export const boardPath = (category) => `/tier/${encodeURIComponent(category)}`;
export const duelPath = (category) => `${boardPath(category)}/duel`;

// The board menu (a board row in the side panel, right-clicked), described
// as data like songMenu.jsx: groups separated by dividers, a group with a
// label nests as a submenu. `tiers` is the board's tier playlists by tier
// id (selectTierGroups' entry) - only tiers it has are offered.
export function boardMenuGroups({ category, tiers = {}, navigate }) {
  const present = BOARD_TIERS.filter((t) => tiers[t]);
  const groups = [
    {
      key: 'board',
      items: [
        { key: 'open', title: 'Open board', icon: <LayoutList size={14} />, onClick: () => navigate(boardPath(category)) },
        { key: 'duel', title: 'Duel', icon: <Swords size={14} />, onClick: () => navigate(duelPath(category)) },
      ],
    },
  ];
  if (present.length) {
    groups.push({
      key: 'tiers',
      label: 'Open tier',
      items: present.map((t) => ({
        key: `tier-${t}`,
        title: tierName(t),
        icon: <Box w={10} h={10} bg={TIER_COLORS[t]} style={{ borderRadius: 2 }} />,
        onClick: () => navigate(`${boardPath(category)}/t/${t}`),
      })),
    });
  }
  return groups;
}

// Right-click on a board: the board menu at the cursor (mantine-contextmenu).
// Returns (category, tiers) => onContextMenu handler.
export function useBoardContextMenu() {
  const navigate = useNavigate();
  const { showContextMenu } = useContextMenu();
  return (category, tiers) => {
    const groups = boardMenuGroups({ category, tiers, navigate });
    const toEntry = ({ key, title, icon, onClick }) => ({ key, title, icon, onClick });
    const content = groups.flatMap((g, i) => [
      ...(i > 0 ? [{ key: `divider-${g.key}` }] : []),
      ...(g.label ? [{ key: g.key, title: g.label, icon: <ListTree size={14} />, items: g.items.map(toEntry) }] : g.items.map(toEntry)),
    ]);
    return (e) => {
      e.stopPropagation();
      showContextMenu(content)(e);
    };
  };
}
