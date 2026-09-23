import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Image, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { TIER_COLORS, TIER_ORDER } from '../tiers';
import { selectFocusedVideoData, selectTierGroups } from '../store/selectors';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { EqualizerMark } from './TierBits';
import { TIER_INK } from '../tierUtils';

export const RAIL_WIDTH = 84;

// The Tier Rail: the board's tiers as a permanent strip down the right edge
// of every board page - the "tier list is always in reach" surface.
// One click on a tier does the most useful thing available, in this order:
//   1. rows are selected (tier focus)  -> move the selection there
//   2. a song from this board is playing -> re-rate the playing song
//   3. otherwise                        -> open that tier
// It's also a drop target for any dragged tile or row (append to that tier).
export default function TierRail({ activeTier, selection }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const category = useSelector((s) => s.view.currentCategory);
  const tierGroups = useSelector(selectTierGroups);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const focusedCategory = useSelector((s) => s.focus.focusedCategory);
  const playingVideo = useSelector(selectFocusedVideoData);
  const dnd = useTierDnd();

  if (!category || !tierGroups[category]) return null;
  const tiers = TIER_ORDER.filter((t) => tierGroups[category][t]);
  const playingHere = focusedVideo && focusedCategory === category ? focusedVideo : null;
  const selectedCount = selection?.count ?? 0;

  function actionFor(tier) {
    if (selectedCount > 0) {
      return {
        label: `Move ${selectedCount} selected → ${tier}`,
        run: () => selection.onMove(tier),
      };
    }
    if (playingHere && playingVideo) {
      if (playingHere.tier === tier) return { label: `"${playingVideo.title}" is in ${tier}`, run: null };
      return {
        label: `Rate "${playingVideo.title}" → ${tier}`,
        run: () =>
          dispatch(moveWithFeedback([{ fromTier: playingHere.tier, toTier: tier, videoId: playingHere.videoId }])),
      };
    }
    return {
      label: `Open ${tier}`,
      run: () => navigate(`/tier/${encodeURIComponent(category)}/t/${tier}`),
    };
  }

  const caption = selectedCount > 0 ? `Move ${selectedCount} to` : playingHere ? 'Rate' : 'Tiers';

  return (
    <Box
      visibleFrom="md"
      pos="fixed"
      top={0}
      right={0}
      w={RAIL_WIDTH}
      p={8}
      bg="var(--surface)"
      style={{
        bottom: 'var(--player-dock-height)',
        borderLeft: '1px solid var(--border-soft)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <Text fz={10} fw={800} tt="uppercase" c={selectedCount > 0 || playingHere ? 'accent' : 'dimmed'} ta="center" style={{ letterSpacing: 1 }}>
        {caption}
      </Text>

      <Stack gap={6} style={{ flex: 1, minHeight: 0 }}>
        {tiers.map((tier, i) => {
          const count = tierItems[tier]?.length ?? 0;
          const action = actionFor(tier);
          const isPlayingTier = playingHere?.tier === tier;
          const isOver = dnd.dragOverTier === `rail:${tier}`;
          const isActive = activeTier === tier;
          return (
            <Tooltip key={tier} label={action.label} position="left" withArrow multiline maw={240}>
              <UnstyledButton
                onClick={action.run ?? undefined}
                onDragOver={(e) => dnd.onDragOver(e, `rail:${tier}`)}
                onDragLeave={(e) => dnd.onDragLeave(e, `rail:${tier}`)}
                onDrop={(e) => dnd.onDrop(e, tier)}
                aria-label={action.label}
                className="rail-tier"
                bg={TIER_COLORS[tier]}
                style={{
                  flex: 1,
                  minHeight: 52,
                  maxHeight: 132,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  position: 'relative',
                  cursor: action.run ? 'pointer' : 'default',
                  outline: isOver ? '3px solid var(--text)' : isActive ? '2px solid var(--text)' : undefined,
                  outlineOffset: 2,
                  transform: isOver ? 'scale(1.06)' : undefined,
                  opacity: dnd.draggedVideoId && !isOver ? 0.85 : 1,
                }}
              >
                <Text ff="var(--font-display)" fw={900} fz={20} lh={1} c={TIER_INK}>
                  {tier}
                </Text>
                <Text fz={11} fw={700} c={TIER_INK} opacity={0.7} lh={1}>
                  {count}
                </Text>
                {playingHere && !selectedCount && (
                  <Text fz={9} fw={700} c={TIER_INK} opacity={0.55} lh={1}>
                    ⇧{i + 1}
                  </Text>
                )}
                {isPlayingTier && playingVideo && (
                  <Box
                    pos="absolute"
                    left={-6}
                    top="50%"
                    style={{ transform: 'translateY(-50%)', borderRadius: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                  >
                    <Image src={playingVideo.thumbnail} w={26} h={26} radius={5} fit="cover" alt="" />
                    <Box pos="absolute" bottom={2} left={2} bg="accent" px={2} py={1} style={{ borderRadius: 2 }}>
                      <EqualizerMark height={6} />
                    </Box>
                  </Box>
                )}
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}
