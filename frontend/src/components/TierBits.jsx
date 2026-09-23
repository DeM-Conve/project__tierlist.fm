import { ActionIcon, Box, Group, Image, Menu, Progress, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { ArrowDownToLine, ArrowUpRight, ArrowUpToLine, ListEnd, ListStart, MoreHorizontal, Play } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { queueSong } from '../queueActions';
import { TIER_COLORS } from '../tiers';
import { TIER_INK, songLabel, youtubeUrl } from '../tierUtils';

export function EqualizerMark({ color = TIER_INK, height = 12 }) {
  return (
    <Group gap={2} align="flex-end" h={height} aria-label="Now playing" wrap="nowrap">
      {[0, 1, 2].map((i) => (
        <Box key={i} w={3} h={height} bg={color} className="eq-bar" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </Group>
  );
}

// Small solid tier square ("T2") - the app's one visual token for a tier.
export function TierChip({ tier, size = 22, active = true, onClick, title, kbd }) {
  const content = (
    <Box
      h={size}
      miw={size}
      px={4}
      bg={active ? TIER_COLORS[tier] : 'transparent'}
      style={{
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: active ? 'none' : `1px solid color-mix(in srgb, ${TIER_COLORS[tier]} 55%, transparent)`,
        flexShrink: 0,
      }}
    >
      <Text ff="var(--font-display)" fw={900} fz={size * 0.5} lh={1} c={active ? TIER_INK : `color-mix(in srgb, ${TIER_COLORS[tier]} 60%, var(--text))`}>
        {tier}
      </Text>
      {kbd && (
        <Text fz={size * 0.38} fw={700} c={active ? TIER_INK : 'dimmed'} opacity={0.7} lh={1}>
          {kbd}
        </Text>
      )}
    </Box>
  );
  if (!onClick) return content;
  return (
    <Tooltip label={title} disabled={!title} withArrow openDelay={300}>
      <UnstyledButton
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={title ?? `Move to ${tier}`}
        className="tier-chip-btn"
      >
        {content}
      </UnstyledButton>
    </Tooltip>
  );
}

// Proportional stacked bar of a board's tier sizes. `counts` = { T1: n, ... }.
export function TierMixBar({ tiers, counts, size = 8, onSegmentClick, labels = false }) {
  const total = tiers.reduce((sum, t) => sum + (counts[t] || 0), 0);
  if (!total) return <Progress.Root size={size} radius="sm" bg="var(--surface-2)" />;
  return (
    <Progress.Root size={size} radius="sm" bg="var(--surface-2)">
      {tiers.map((t) => {
        const n = counts[t] || 0;
        if (!n) return null;
        return (
          <Tooltip key={t} label={`${t} · ${n} video${n === 1 ? '' : 's'}`} withArrow>
            <Progress.Section
              value={(n / total) * 100}
              color={TIER_COLORS[t]}
              onClick={onSegmentClick ? () => onSegmentClick(t) : undefined}
              style={{ cursor: onSegmentClick ? 'pointer' : undefined }}
            >
              {labels && (n / total > 0.06) && (
                <Progress.Label c={TIER_INK} fz={11} fw={800}>
                  {t} {n}
                </Progress.Label>
              )}
            </Progress.Section>
          </Tooltip>
        );
      })}
    </Progress.Root>
  );
}

// "Move to" menu shared by board tiles and list rows.
export function MoveMenu({ video, tier, tiers, onMove, target }) {
  const dispatch = useDispatch();
  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={210}>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<ListStart size={14} />} onClick={() => dispatch(queueSong(tier, video, 'next'))}>
          Play next
        </Menu.Item>
        <Menu.Item leftSection={<ListEnd size={14} />} onClick={() => dispatch(queueSong(tier, video, 'end'))}>
          Add to queue
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Move to</Menu.Label>
        {tiers
          .filter((t) => t !== tier)
          .map((t) => (
            <Menu.Item
              key={t}
              leftSection={<Box w={10} h={10} bg={TIER_COLORS[t]} style={{ borderRadius: 2 }} />}
              onClick={() => onMove(tier, t, video.videoId, null)}
            >
              {t}
            </Menu.Item>
          ))}
        <Menu.Divider />
        <Menu.Item leftSection={<ArrowUpToLine size={14} />} onClick={() => onMove(tier, tier, video.videoId, 0)}>
          Top of {tier}
        </Menu.Item>
        <Menu.Item
          leftSection={<ArrowDownToLine size={14} />}
          onClick={() => onMove(tier, tier, video.videoId, Number.MAX_SAFE_INTEGER)}
        >
          Bottom of {tier}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          component="a"
          href={youtubeUrl(video.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          leftSection={<ArrowUpRight size={14} />}
        >
          Open on YouTube
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// Square album-art tile used on the tier list. Click plays, drag moves,
// hover reveals the "..." move menu. The song name (+ artist, when there's
// room) is always printed over the bottom of the art, so an album cover
// shared by many songs is still tellable apart without hovering.
export function TierTile({
  video,
  tier,
  tiers,
  size,
  isDragging,
  isPlaying,
  isPendingRemoval,
  searchState,
  onDragStart,
  onDragEnd,
  onPlay,
  onMove,
}) {
  const ring = isPlaying || searchState;
  const { song, artist } = songLabel(video);
  return (
    <Tooltip label={video.title} openDelay={450} withArrow multiline maw={260}>
      <Box
        className="tile"
        data-video-id={video.videoId}
        data-tier={tier}
        pos="relative"
        w={size}
        h={size}
        draggable
        onDragStart={(e) => onDragStart(e, video, tier)}
        onDragEnd={onDragEnd}
        onClick={() => onPlay(tier, video.videoId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPlay(tier, video.videoId);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={video.title}
        style={{
          flexShrink: 0,
          cursor: 'grab',
          borderRadius: 6,
          opacity: isDragging ? 0.3 : isPendingRemoval ? 0.45 : 1,
          outline: ring ? '2px solid var(--accent)' : undefined,
          outlineOffset: 2,
          boxShadow:
            searchState === 'active' ? '0 0 0 6px color-mix(in srgb, var(--accent) 35%, transparent)' : undefined,
        }}
      >
        <Image
          src={video.thumbnail || undefined}
          alt=""
          w={size}
          h={size}
          radius={6}
          fit="cover"
          bg="var(--surface-2)"
          draggable={false}
          style={{ pointerEvents: 'none', filter: isPendingRemoval ? 'grayscale(1)' : undefined }}
        />
        {/* The scrim hugs the label: it starts a little above the first line
            and darkens toward the edge, so a one-line name only shades the
            bottom strip and a two-line one gets a taller fade - the art
            above stays clean, even on white covers. */}
        <Box
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          px={5}
          pb={5}
          pt={size >= 80 ? 16 : 12}
          style={{
            borderRadius: '0 0 6px 6px',
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, transparent, var(--media-scrim) 40%, var(--media-control-bg))',
            textShadow: '0 1px 2px var(--media-control-shadow)',
          }}
        >
          {/* Big tiles: up to two lines. Small (phone) tiles: one line with an
              ellipsis - two lines there would split words mid-way. */}
          <Text
            fz={size >= 80 ? 11 : 10}
            fw={700}
            lh={1.15}
            c="var(--media-fg)"
            lineClamp={size >= 80 ? 2 : undefined}
            truncate={size >= 80 ? undefined : 'end'}
            style={{ overflowWrap: 'anywhere' }}
          >
            {song}
          </Text>
          {artist && size >= 80 && (
            <Text fz={9.5} lh={1.2} c="var(--media-fg)" opacity={0.75} truncate="end">
              {artist}
            </Text>
          )}
        </Box>
        {isPlaying && (
          <Box pos="absolute" top={4} left={4} bg="accent" px={4} py={3} style={{ borderRadius: 3 }}>
            <EqualizerMark height={9} />
          </Box>
        )}
        {isPendingRemoval && (
          <Text
            pos="absolute"
            top={3}
            left={3}
            right={3}
            ta="center"
            fz={9}
            fw={800}
            tt="uppercase"
            c={TIER_INK}
            bg="yellow.5"
            style={{ borderRadius: 3 }}
          >
            Duplicate
          </Text>
        )}
        <Box className="tile-overlay" pos="absolute" inset={0} style={{ borderRadius: 6 }}>
          <MoveMenu
            video={video}
            tier={tier}
            tiers={tiers}
            onMove={onMove}
            target={
              <ActionIcon
                pos="absolute"
                top={3}
                right={3}
                size={20}
                variant="filled"
                color="dark.8"
                aria-label="Move to tier"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={13} />
              </ActionIcon>
            }
          />
          <Box
            pos="absolute"
            top="50%"
            left="50%"
            w={size > 60 ? 30 : 22}
            h={size > 60 ? 30 : 22}
            bg="accent"
            style={{
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <Play size={size > 60 ? 13 : 10} fill="currentColor" style={{ color: TIER_INK }} />
          </Box>
        </Box>
      </Box>
    </Tooltip>
  );
}
