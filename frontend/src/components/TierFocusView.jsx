import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ActionIcon,
  Box,
  Button,
  CloseButton,
  Group,
  Image,
  Kbd,
  Paper,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { ArrowLeft, ListTodo, MoreHorizontal, Play, Search, Shuffle } from 'lucide-react';
import { TIER_COLORS, TODO_TIER } from '../tiers';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { selectPlayerCoversPage } from '../store/selectors';
import { EqualizerMark, MoveMenu, TierChip } from './TierBits';
import { TIER_INK, indexForPointInList, songLabel, videoMatches } from '../tierUtils';

const NO_ITEMS = [];

function TrackRow({
  video,
  rank,
  tier,
  tiers,
  isPlaying,
  isPendingRemoval,
  isDragging,
  onPlay,
  onMove,
  onDragStart,
  onDragEnd,
}) {
  const { song, artist } = songLabel(video);
  return (
    <Box
      data-video-id={video.videoId}
      data-tier={tier}
      className="track-row"
      draggable
      onDragStart={(e) => onDragStart(e, video, tier)}
      onDragEnd={onDragEnd}
      onClick={() => onPlay(tier, video.videoId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onPlay(tier, video.videoId);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Play ${video.title}`}
      px="sm"
      py={6}
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 44px minmax(0, 1fr) auto 30px',
        alignItems: 'center',
        gap: 12,
        borderRadius: 6,
        cursor: 'grab',
        opacity: isDragging ? 0.35 : isPendingRemoval ? 0.5 : 1,
      }}
    >
      <Text fz="xs" c={isPlaying ? 'accent' : 'dimmed'} fw={isPlaying ? 700 : undefined} ta="right" ff="monospace">
        {rank}
      </Text>
      {/* The now-playing equalizer sits on the cover, not in the rank column. */}
      <Box pos="relative" w={44} h={44} style={{ pointerEvents: 'none' }}>
        <Image src={video.thumbnail || undefined} w={44} h={44} radius={4} fit="cover" alt="" draggable={false} />
        {isPlaying && (
          <Box
            pos="absolute"
            inset={0}
            bg="var(--media-scrim)"
            style={{ borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <EqualizerMark color="var(--media-fg)" height={14} />
          </Box>
        )}
      </Box>
      <Box style={{ minWidth: 0 }}>
        <Text fz="sm" fw={isPlaying ? 700 : 600} c={isPlaying ? 'accent' : undefined} truncate="end" title={video.title}>
          {song}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {isPendingRemoval ? 'Duplicate - also in a higher tier, removed on sync' : artist || ' '}
        </Text>
      </Box>
      <Group gap={4} wrap="nowrap" className="row-chips">
        {tiers.map((t) => (
          <TierChip
            key={t}
            tier={t}
            size={24}
            active={t === tier}
            onClick={t === tier ? undefined : () => onMove(tier, t, video.videoId, null)}
          />
        ))}
      </Group>
      <MoveMenu
        video={video}
        tier={tier}
        tiers={tiers}
        onMove={onMove}
        target={
          <ActionIcon variant="subtle" color="gray" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal size={16} />
          </ActionIcon>
        }
      />
    </Box>
  );
}

// A single tier, full size: the place to work through a tier of hundreds.
export default function TierFocusView({
  category,
  tier,
  tiers,
  tierItems,
  loading,
  playingVideoId,
  pendingRemovalKeys,
  onPlay,
  onPlayFrom,
  onShuffle,
  onBack,
  onSwitchTier,
}) {
  const dispatch = useDispatch();
  const dnd = useTierDnd();
  const [filter, setFilter] = useState('');
  const [overIndex, setOverIndex] = useState(null);
  const listRef = useRef(null);
  const filterRef = useRef(null);
  const items = tierItems[tier] ?? NO_ITEMS;
  const color = TIER_COLORS[tier];
  // The TODO list is unranked: its page is where songs get their tier
  // (row chips), and "Play" is a triage session.
  const isTodo = tier === TODO_TIER;

  const q = filter.trim();
  const visible = useMemo(() => items.filter((v) => videoMatches(v, q)), [items, q]);
  const rankOf = useMemo(() => new Map(items.map((v, i) => [v.videoId, i + 1])), [items]);

  function move(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }]));
  }

  // "/" focuses the filter; Esc clears it. Both stand down while the
  // full-screen player covers the page.
  const playerCoversPage = useSelector(selectPlayerCoversPage);
  useEffect(() => {
    function onKeyDown(e) {
      if (playerCoversPage) return;
      const a = document.activeElement;
      const isTyping = a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA' || a?.isContentEditable;
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === 'Escape' && a === filterRef.current) {
        setFilter('');
        filterRef.current.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playerCoversPage]);

  // Drop position in the (possibly filtered) list, mapped back to the real
  // index in the tier so reordering a filtered view lands where it looks.
  function realDropIndex(e) {
    const idx = indexForPointInList(listRef.current, e.clientY);
    if (idx >= visible.length) return items.length;
    return items.findIndex((v) => v.videoId === visible[idx].videoId);
  }

  const counts = (t) => tierItems[t]?.length ?? 0;

  return (
    <Box component="section" pb={140}>
      <UnstyledButton onClick={onBack} mb="sm" className="crumb">
        <Group gap={6} c="dimmed">
          <ArrowLeft size={14} />
          <Text fz="sm">{category} · tier list</Text>
          <Kbd size="xs">g u</Kbd>
        </Group>
      </UnstyledButton>

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="md">
        <Group gap="md" wrap="nowrap">
          <Box w={72} h={72} bg={color} style={{ borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Text ff="var(--font-display)" fw={900} fz={isTodo ? 20 : 30} c={TIER_INK}>
              {tier}
            </Text>
          </Box>
          <Stack gap={2}>
            <Title order={1} fz={{ base: 26, sm: 34 }} fw={900} lh={1.05}>
              {tier} <Text span inherit c="dimmed" fw={700}>in {category}</Text>
            </Title>
            <Text c="dimmed" fz="sm">
              {loading
                ? 'Loading…'
                : `${items.length} video${items.length === 1 ? '' : 's'} · ${isTodo ? 'waiting for a tier' : 'ranked top to bottom'}`}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <Button variant="default" leftSection={<Shuffle size={15} />} onClick={() => onShuffle(tier)} disabled={!items.length}>
            Shuffle
          </Button>
          <Button
            leftSection={isTodo ? <ListTodo size={15} /> : <Play size={15} fill="currentColor" />}
            onClick={() => onPlayFrom(tier)}
            disabled={!items.length}
            title={isTodo ? 'Play each song and give it a tier - rating one moves on to the next' : undefined}
          >
            {isTodo ? 'Triage' : `Play ${tier}`}
          </Button>
        </Group>
      </Group>

      <Tabs value={tier} onChange={(t) => t && onSwitchTier(t)} mb="sm">
        <Tabs.List>
          {tiers.map((t) => (
            <Tabs.Tab
              key={t}
              value={t}
              leftSection={<Box w={10} h={10} bg={TIER_COLORS[t]} style={{ borderRadius: 2 }} />}
              onDragOver={(e) => dnd.onDragOver(e, `tab:${t}`)}
              onDragLeave={(e) => dnd.onDragLeave(e, `tab:${t}`)}
              onDrop={(e) => dnd.onDrop(e, t)}
              style={dnd.dragOverTier === `tab:${t}` ? { background: `color-mix(in srgb, ${TIER_COLORS[t]} 25%, transparent)` } : undefined}
            >
              {t} <Text span c="dimmed" fz="xs">{counts(t)}</Text>
            </Tabs.Tab>
          ))}
          {/* The filter shares the tab row (right end) instead of its own row. */}
          <Group ml="auto" gap="sm" wrap="nowrap" pb={6} style={{ alignSelf: 'center' }}>
            {q && (
              <Text fz="xs" c="dimmed">
                {visible.length} of {items.length}
              </Text>
            )}
            <TextInput
          ref={filterRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${tier}…`}
          leftSection={<Search size={14} />}
          rightSection={filter ? <CloseButton size="sm" onClick={() => setFilter('')} aria-label="Clear filter" /> : <Kbd size="xs">/</Kbd>}
          size="xs"
          w={220}
        />
          </Group>
        </Tabs.List>
      </Tabs>

      <Paper withBorder radius="md" p={4} bg="var(--surface)">
        <Box
          ref={listRef}
          onDragOver={(e) => {
            dnd.onDragOver(e, `list:${tier}`);
            setOverIndex(indexForPointInList(listRef.current, e.clientY));
          }}
          onDragLeave={(e) => {
            dnd.onDragLeave(e, `list:${tier}`);
            if (!e.currentTarget.contains(e.relatedTarget)) setOverIndex(null);
          }}
          onDrop={(e) => {
            const idx = realDropIndex(e);
            setOverIndex(null);
            dnd.onDrop(e, tier, idx);
          }}
        >
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <Group key={i} p="sm" gap="md" wrap="nowrap">
                <Skeleton w={44} h={44} radius={4} />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton h={10} w="60%" />
                  <Skeleton h={8} w="30%" />
                </Stack>
              </Group>
            ))}
          {!loading && visible.length === 0 && (
            <Text ta="center" c="dimmed" fz="sm" py="xl">
              {q ? `Nothing in ${tier} matches "${filter}".` : `${tier} is empty - drag videos onto ${tier} in the rail, or use a row's tier chips on another tier.`}
            </Text>
          )}
          {!loading &&
            visible.map((v, i) => (
              <Box key={v.videoId}>
                {dnd.dragOverTier === `list:${tier}` && overIndex === i && <Box h={2} bg="accent" mx="sm" style={{ borderRadius: 1 }} />}
                <TrackRow
                  video={v}
                  rank={rankOf.get(v.videoId)}
                  tier={tier}
                  tiers={tiers}
                  isPlaying={playingVideoId === v.videoId}
                  isPendingRemoval={pendingRemovalKeys.has(`${tier}:${v.videoId}`)}
                  isDragging={dnd.draggedVideoId === v.videoId}
                  onPlay={onPlay}
                  onMove={move}
                  onDragStart={dnd.onDragStart}
                  onDragEnd={dnd.onDragEnd}
                />
              </Box>
            ))}
          {dnd.dragOverTier === `list:${tier}` && overIndex === visible.length && visible.length > 0 && (
            <Box h={2} bg="accent" mx="sm" style={{ borderRadius: 1 }} />
          )}
        </Box>
      </Paper>
      <Text fz="xs" c="dimmed" ta="center" mt="sm">
        {isTodo
          ? 'Click a tier chip to rate a song · click a row to listen first'
          : 'Drag to reorder · tier chips move a song · click a row to play'}
      </Text>

    </Box>
  );
}
