import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Image, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { BOARD_TIERS, REMOVED_TIER, TIER_COLORS, TODO_TIER } from '../tiers';
import { selectFocusedVideoData, selectTierGroups } from '../store/selectors';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { EqualizerMark } from './TierBits';
import { TIER_INK } from '../tierUtils';

export const RAIL_WIDTH = 84;

// The Tier Rail: a board's tiers as a permanent strip down the right edge -
// the "tier list is always in reach" surface. Global like the player: Layout
// passes the board being viewed, or off board pages the playing song's board.
// One click on a tier does the most useful thing available:
//   1. a song from this board is playing -> re-rate the playing song
//   2. otherwise                        -> open that tier
// It's also a drop target for any dragged tile or row (append to that tier).
// The board's TODO list, if any, sits at the bottom as a small slot: drop a
// song there to rate it later, or click it to send the playing song back.
// Under it, the Remove slot: drop (or click, for the playing song) to stage
// a song for deletion from its playlist.
export default function TierRail({ category, activeTier }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const tierGroups = useSelector(selectTierGroups);
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const focusedCategory = useSelector((s) => s.focus.focusedCategory);
  const playingVideo = useSelector(selectFocusedVideoData);
  const dnd = useTierDnd();

  if (!category || !tierGroups[category]) return null;
  const tiers = BOARD_TIERS.filter((t) => tierGroups[category][t]);
  // Rating writes into tierItems, so it needs this board to be the loaded one
  // (it still is after leaving it for Home/Settings; not after opening another).
  const loaded = loadedCategory === category;
  const playingHere = focusedVideo && focusedCategory === category && loaded ? focusedVideo : null;

  function actionFor(tier) {
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

  const caption = playingHere ? 'Rate' : 'Tiers';

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
      <Text fz={10} fw={800} tt="uppercase" c={playingHere ? 'accent' : 'dimmed'} ta="center" style={{ letterSpacing: 1 }}>
        {caption}
      </Text>

      <Stack gap={6} style={{ flex: 1, minHeight: 0 }}>
        {tiers.map((tier, i) => {
          const count = loaded ? (tierItems[tier]?.length ?? 0) : (tierGroups[category][tier].itemCount ?? 0);
          const action = actionFor(tier);
          const isPlayingTier = playingHere?.tier === tier;
          const isOver = dnd.dragOverTier === `rail:${tier}`;
          const isActive = activeTier === tier;
          const isTodo = tier === TODO_TIER;
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
                  flex: isTodo ? '0 0 44px' : 1,
                  minHeight: isTodo ? 44 : 52,
                  maxHeight: 132,
                  marginTop: isTodo ? 6 : undefined,
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
                <Text ff="var(--font-display)" fw={900} fz={isTodo ? 13 : 20} lh={1} c={TIER_INK}>
                  {tier}
                </Text>
                <Text fz={11} fw={700} c={TIER_INK} opacity={0.7} lh={1}>
                  {count}
                </Text>
                {playingHere && !isTodo && (
                  <Text fz={9} fw={700} c={TIER_INK} opacity={0.55} lh={1}>
                    ⇧{i + 1}
                  </Text>
                )}
                {isPlayingTier && playingVideo && (
                  <Box
                    pos="absolute"
                    left={-6}
                    top="50%"
                    style={{ transform: 'translateY(-50%)', borderRadius: 5, boxShadow: '0 4px 12px var(--shadow)' }}
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
        {loaded && (
          <Tooltip
            label={playingHere && playingVideo ? `Remove "${playingVideo.title}" from its playlist` : 'Drop a song here to remove it from its playlist'}
            position="left"
            withArrow
            multiline
            maw={240}
          >
            <UnstyledButton
              onClick={
                playingHere && playingHere.tier !== REMOVED_TIER
                  ? () =>
                      dispatch(
                        moveWithFeedback([{ fromTier: playingHere.tier, toTier: REMOVED_TIER, videoId: playingHere.videoId }])
                      )
                  : undefined
              }
              onDragOver={(e) => dnd.onDragOver(e, `rail:${REMOVED_TIER}`)}
              onDragLeave={(e) => dnd.onDragLeave(e, `rail:${REMOVED_TIER}`)}
              onDrop={(e) => dnd.onDrop(e, REMOVED_TIER)}
              aria-label="Remove from playlist"
              className="rail-tier"
              bg="var(--surface-2)"
              c={dnd.dragOverTier === `rail:${REMOVED_TIER}` ? 'red' : 'dimmed'}
              style={{
                flex: '0 0 40px',
                borderRadius: 8,
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                outline: dnd.dragOverTier === `rail:${REMOVED_TIER}` ? '3px solid var(--text)' : undefined,
                outlineOffset: 2,
              }}
            >
              <Trash2 size={15} />
              {tierItems[REMOVED_TIER]?.length > 0 && (
                <Text fz={11} fw={700} lh={1} inherit>
                  {tierItems[REMOVED_TIER].length}
                </Text>
              )}
            </UnstyledButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
