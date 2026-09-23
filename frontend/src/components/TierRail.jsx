import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Box, Divider, Image, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { BOARD_TIERS, REMOVED_TIER, TIER_COLORS, TODO_TIER } from '../tiers';
import { selectFocusedVideoData, selectTierGroups } from '../store/selectors';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { EqualizerMark } from './TierBits';
import { TIER_INK } from '../tierUtils';

const RAIL_WIDTH = 84;
// TODO and Remove - the two rail slots that aren't ranked tiers.
const SLOT_HEIGHT = 56;
const RED = 'var(--mantine-color-red-text)';

// The Tier Rail: a board's tiers as a permanent strip down the right edge -
// the "tier list is always in reach" surface. It's the last column of the
// Layout's body row, so it always ends exactly where the player dock begins.
// Global like the player: Layout
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
  const ranked = tiers.filter((t) => t !== TODO_TIER);
  const todo = tiers.includes(TODO_TIER) ? TODO_TIER : null;
  const removeOver = dnd.dragOverTier === `rail:${REMOVED_TIER}`;
  const removedCount = tierItems[REMOVED_TIER]?.length ?? 0;

  function renderTier(tier, i) {
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
            // Ranked tiers split the column; TODO is a fixed slot below it.
            flex: isTodo ? `0 0 ${SLOT_HEIGHT}px` : '1 1 0',
            minHeight: isTodo ? SLOT_HEIGHT : 52,
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
            // The playing song's art pinned to its tier's top-left corner,
            // clear of the tier label and count.
            <Box pos="absolute" left={-8} top={-8} style={{ borderRadius: 5, boxShadow: '0 4px 12px var(--shadow)' }}>
              <Image src={playingVideo.thumbnail} w={24} h={24} radius={5} fit="cover" alt="" />
              <Box pos="absolute" bottom={2} left={2} bg="accent" px={2} py={1} style={{ borderRadius: 2 }}>
                <EqualizerMark height={6} />
              </Box>
            </Box>
          )}
        </UnstyledButton>
      </Tooltip>
    );
  }

  return (
    <Box
      visibleFrom="md"
      w={RAIL_WIDTH}
      p={8}
      bg="var(--surface)"
      style={{
        flexShrink: 0,
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

      {/* Layout: the ranked tiers share all the height there is (flex: 1,
          no cap - a capped rail left dead space under TZ); below a divider,
          the two slots that aren't tiers - TODO and Remove - get one equal,
          fixed size, big enough to be easy drop targets. */}
      <Stack gap={6} style={{ flex: 1, minHeight: 0 }}>
        {ranked.map((tier, i) => renderTier(tier, i))}
      </Stack>

      {(todo || loaded) && (
        <>
          <Divider color="var(--border-soft)" my={2} />
          <Stack gap={6} style={{ flexShrink: 0 }}>
            {todo && renderTier(todo, ranked.length)}
            {loaded && (
              <Tooltip
                label={
                  playingHere && playingVideo
                    ? `Remove "${playingVideo.title}" from its playlist (Del)`
                    : 'Drop a song here to remove it from its playlist (on push)'
                }
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
                  h={SLOT_HEIGHT}
                  style={{
                    borderRadius: 8,
                    // Same look as the player's Remove chip (TierBits RemoveChip).
                    border: `1px ${removeOver ? 'solid' : 'dashed'} color-mix(in srgb, ${RED} ${removeOver ? 100 : 55}%, transparent)`,
                    background: removeOver ? `color-mix(in srgb, ${RED} 14%, var(--surface))` : 'transparent',
                    color: RED,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    cursor: playingHere ? 'pointer' : 'default',
                    transform: removeOver ? 'scale(1.06)' : undefined,
                  }}
                >
                  <Trash2 size={17} />
                  <Text fz={10} fw={800} lh={1} inherit>
                    {removedCount > 0 ? `${removedCount} staged` : 'Remove'}
                  </Text>
                  {playingHere && (
                    <Text fz={9} fw={700} lh={1} c="dimmed">
                      Del
                    </Text>
                  )}
                </UnstyledButton>
              </Tooltip>
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
