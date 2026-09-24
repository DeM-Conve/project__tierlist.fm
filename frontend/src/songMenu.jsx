import { Box } from '@mantine/core';
import { useContextMenu } from 'mantine-contextmenu';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpRight, ArrowUpToLine, ListEnd, ListStart, Trash2 } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { queueSong } from './queueActions';
import { REMOVED_TIER, TIER_COLORS } from './tiers';
import { youtubeUrl } from './tierUtils';

// The song menu (board tiles and list rows), described once as data and
// drawn two ways: the "..." button's Mantine Menu (MoveMenu) and the
// right-click menu (useSongContextMenu, mantine-contextmenu). Groups are
// separated by dividers. For a song in the Remove bin, "Move to" is how
// it's put back.
export function songMenuGroups({ video, tier, tiers, onMove, dispatch }) {
  const inBin = tier === REMOVED_TIER;
  const groups = [];
  if (!inBin) {
    groups.push({
      key: 'queue',
      items: [
        { key: 'next', title: 'Play next', icon: <ListStart size={14} />, onClick: () => dispatch(queueSong(tier, video, 'next')) },
        { key: 'end', title: 'Add to queue', icon: <ListEnd size={14} />, onClick: () => dispatch(queueSong(tier, video, 'end')) },
      ],
    });
  }
  groups.push({
    key: 'move',
    label: 'Move to',
    items: tiers
      .filter((t) => t !== tier)
      .map((t) => ({
        key: `move-${t}`,
        title: t,
        icon: <Box w={10} h={10} bg={TIER_COLORS[t]} style={{ borderRadius: 2 }} />,
        onClick: () => onMove(tier, t, video.videoId, null),
      })),
  });
  if (!inBin) {
    groups.push({
      key: 'order',
      items: [
        { key: 'top', title: `Top of ${tier}`, icon: <ArrowUpToLine size={14} />, onClick: () => onMove(tier, tier, video.videoId, 0) },
        {
          key: 'bottom',
          title: `Bottom of ${tier}`,
          icon: <ArrowDownToLine size={14} />,
          onClick: () => onMove(tier, tier, video.videoId, Number.MAX_SAFE_INTEGER),
        },
        {
          key: 'remove',
          title: 'Remove from playlist',
          icon: <Trash2 size={14} />,
          color: 'red',
          onClick: () => onMove(tier, REMOVED_TIER, video.videoId, null),
        },
      ],
    });
  }
  groups.push({
    key: 'link',
    items: [{ key: 'youtube', title: 'Open on YouTube', icon: <ArrowUpRight size={14} />, href: youtubeUrl(video.videoId) }],
  });
  return groups;
}

// Right-click on a song: the same menu at the cursor. Returns
// (video, tier, tiers, onMove) => onContextMenu handler. "Move to" becomes a
// submenu, the way native context menus nest.
export function useSongContextMenu() {
  const dispatch = useDispatch();
  const { showContextMenu } = useContextMenu();
  return (video, tier, tiers, onMove) => {
    const groups = songMenuGroups({ video, tier, tiers, onMove, dispatch });
    const toEntry = (item) => ({
      key: item.key,
      title: item.title,
      icon: item.icon,
      color: item.color,
      onClick: item.href ? () => window.open(item.href, '_blank', 'noopener,noreferrer') : item.onClick,
    });
    const content = groups.flatMap((g, i) => [
      ...(i > 0 ? [{ key: `divider-${g.key}` }] : []),
      ...(g.label
        ? [{ key: g.key, title: g.label, icon: <ArrowRightLeft size={14} />, items: g.items.map(toEntry) }]
        : g.items.map(toEntry)),
    ]);
    return (e) => {
      e.stopPropagation();
      showContextMenu(content)(e);
    };
  };
}

