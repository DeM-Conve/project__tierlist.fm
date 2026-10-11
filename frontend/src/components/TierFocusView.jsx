import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useHotkeys } from 'react-hotkeys-hook';
import { getHotkeyHandler } from '@mantine/hooks';
import { tierName } from '../tierLabels';
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
} from '@mantine/core';
import { ListTodo, MoreHorizontal, Play, Search, Shuffle } from 'lucide-react';
import { TIER_COLORS, TODO_TIER } from '../tiers';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { selectStagedChanges, selectPlayerCoversPage } from '../store/selectors';
import { EqualizerMark, MoveMenu, TierChip } from './TierBits';
import { useSongContextMenu } from '../songMenu';
import { TIER_INK, dropIndexAtOffset, songLabel, videoMatches } from '../tierUtils';
import { useCanvas } from '../layout/canvas';
import PageHeader from './PageHeader';
import { SECTION_GAP } from '../layout/spacing';

const NO_ITEMS = [];
// Every row is the same height (6px padding + a 44px cover + 6px), so the
// virtualized list needs no per-row measuring.
export const TRACK_ROW_HEIGHT = 56;
// Rows rendered beyond the visible window on each side.
const OVERSCAN = 8;
// A row's grid (rank, cover, title, tier chips, menu) - shared by the
// loading rows so they line up with the real ones.
const TRACK_ROW_GRID = {
  height: TRACK_ROW_HEIGHT,
  display: 'grid',
  gridTemplateColumns: '22px 44px minmax(0, 1fr) auto 30px',
  alignItems: 'center',
  gap: 'var(--mantine-spacing-sm)',
};
// Loading placeholders: enough rows to fill a typical screen.
const SKELETON_ROWS = 10;

// A TrackRow-shaped loading row: same height and columns, Skeleton blocks
// for the rank, cover, title/artist, one chip per tier and the menu.
function TrackRowSkeleton({ tiers }) {
  return (
    <Box px="sm" py="3xs" style={TRACK_ROW_GRID} data-testid="track-row-skeleton">
      <Skeleton h={10} w={14} style={{ justifySelf: 'end' }} />
      <Skeleton w={44} h={44} radius={4} />
      <Stack gap="2xs">
        <Skeleton h={10} w="60%" />
        <Skeleton h={8} w="30%" />
      </Stack>
      <Group gap="4xs" wrap="nowrap">
        {tiers.map((t) => <Skeleton key={t} w={24} h={24} radius={4} />)}
      </Group>
      <Skeleton w={28} h={28} radius="sm" />
    </Box>
  );
}

// Memoized: a tier holds hundreds of songs, and a page re-render (drag
// hover, the playing song changing) must only redraw the rows it touches.
const TrackRow = memo(function TrackRow({
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
  const openSongMenu = useSongContextMenu();
  return (
    <Box
      data-video-id={video.videoId}
      data-tier={tier}
      className="track-row"
      onContextMenu={openSongMenu(video, tier, tiers, onMove)}
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
      py="3xs"
      style={{
        // Exact px (not Mantine's rem-scaled h): the virtualizer positions rows in px.
        ...TRACK_ROW_GRID,
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
      <Group gap="4xs" wrap="nowrap" className="row-chips">
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
});

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
  onSwitchTier,
}) {
  const dispatch = useDispatch();
  const dnd = useTierDnd();
  const { ref: canvasRef } = useCanvas();
  const [filter, setFilter] = useState('');
  const [overIndex, setOverIndex] = useState(null);
  const overIndexRef = useRef(null);
  const listRef = useRef(null);
  const filterRef = useRef(null);
  const items = tierItems[tier] ?? NO_ITEMS;
  const color = TIER_COLORS[tier];
  // The TODO list is unranked: its page is where songs get their tier
  // (row chips), and "Play" is a triage session.
  const isTodo = tier === TODO_TIER;

  const q = filter.trim();
  const visible = useMemo(() => items.filter((v) => videoMatches(v, q)), [items, q]);
  // A video's first position - a playlist can hold the same video twice,
  // and a plain Map would keep the last copy's number for both.
  const rankOf = useMemo(() => {
    const ranks = new Map();
    items.forEach((v, i) => ranks.has(v.videoId) || ranks.set(v.videoId, i + 1));
    return ranks;
  }, [items]);

  // Stable handlers for the memoized rows: they read the latest props
  // through a ref, so a page re-render hands every row the same functions.
  const latest = useRef(null);
  useLayoutEffect(() => {
    latest.current = { onPlay, dnd };
  });
  const handlePlay = useCallback((t, videoId) => latest.current.onPlay(t, videoId), []);
  const handleDragStart = useCallback((e, video, fromTier) => latest.current.dnd.onDragStart(e, video, fromTier), []);
  const handleDragEnd = useCallback((e) => latest.current.dnd.onDragEnd(e), []);
  const move = useCallback(
    (fromTier, toTier, videoId, dropIndex) => dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }])),
    [dispatch]
  );
  // useBoardPage builds a fresh `tiers` array each render; key it by content
  // so the rows' memo holds.
  const tiersKey = tiers.join(',');
  const rowTiers = useMemo(() => (tiersKey ? tiersKey.split(',') : []), [tiersKey]);

  // The list is virtualized against the canvas (the page's scroll
  // container): only the rows on screen (plus OVERSCAN) are in the DOM.
  // scrollMargin is where the list starts inside the canvas's content.
  // Re-measured after every render (the header above can rewrap), but it
  // only sets state when the offset actually moved, so it settles at once.
  const [scrollMargin, setScrollMargin] = useState(0);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const list = listRef.current;
    if (!canvas || !list) return;
    const margin = list.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop;
    if (Math.abs(margin - scrollMargin) >= 1) setScrollMargin(margin);
  });
  // The row being dragged stays mounted even when scrolled out of view -
  // the browser only fires dragend on a source element still in the DOM.
  const draggedIndex = dnd.draggedVideoId ? visible.findIndex((v) => v.videoId === dnd.draggedVideoId) : -1;
  const rangeExtractor = useCallback(
    (range) => {
      const indexes = defaultRangeExtractor(range);
      if (draggedIndex < 0 || indexes.includes(draggedIndex)) return indexes;
      return [...indexes, draggedIndex].sort((a, b) => a - b);
    },
    [draggedIndex]
  );
  // (No React Compiler in this app, so its "incompatible library" note on
  // useVirtualizer doesn't apply.)
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: loading ? 0 : visible.length,
    getScrollElement: () => canvasRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    rangeExtractor,
    getItemKey: (i) => `${visible[i].videoId}:${i}`,
  });

  // "/" focuses the filter; Esc clears it. Both stand down while the
  // full-screen player covers the page.
  const playerCoversPage = useSelector(selectPlayerCoversPage);
  // Room under the list only while the floating "N changes staged" bar is up,
  // so it never covers the last rows - not a permanent empty band.
  const hasPendingBar = useSelector((s) => selectStagedChanges(s).length > 0 || ['done', 'partial', 'error'].includes(s.tiers.syncStatus));
  // (react-hotkeys-hook, as on Home: it ignores "/" typed into a field.)
  useHotkeys('slash', () => filterRef.current?.focus(), { preventDefault: true, enabled: !playerCoversPage });

  // Drop slot under the pointer, from the virtualizer's row offsets (no
  // per-row DOM reads - most rows aren't even rendered).
  function dropSlot(e) {
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    return dropIndexAtOffset(virtualizer, e.clientY - top + scrollMargin);
  }
  // Drop position in the (possibly filtered) list, mapped back to the real
  // index in the tier so reordering a filtered view lands where it looks.
  function realDropIndex(e) {
    const idx = dropSlot(e);
    if (idx >= visible.length) return items.length;
    return items.findIndex((v) => v.videoId === visible[idx].videoId);
  }
  function showDropAt(idx) {
    if (overIndexRef.current === idx) return;
    overIndexRef.current = idx;
    setOverIndex(idx);
  }
  const showIndicator = dnd.dragOverTier === `list:${tier}` && overIndex !== null && visible.length > 0;

  const counts = (t) => tierItems[t]?.length ?? 0;

  return (
    <Box component="section" pb={hasPendingBar ? '5xl' : 0}>
      <Box mb={SECTION_GAP}>
      <PageHeader
        badge={
          <Box w={44} h={44} bg={color} style={{ borderRadius: 'var(--mantine-radius-md)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Text ff="var(--font-display)" fw={900} fz={isTodo ? 'sm' : '2xl'} c={TIER_INK}>
              {tierName(tier)}
            </Text>
          </Box>
        }
        title={
          <Title order={1} lh={1.15}>
            {tierName(tier)} <Text span inherit c="dimmed" fw={700}>in {category}</Text>
          </Title>
        }
        meta={loading ? 'Loading…' : `${items.length} video${items.length === 1 ? '' : 's'} · ${isTodo ? 'waiting for a tier' : 'ranked top to bottom'}`}
        actions={<>
          <Button variant="default" leftSection={<Shuffle size={15} />} onClick={() => onShuffle(tier)} disabled={!items.length}>
            Shuffle
          </Button>
          <Button
            leftSection={isTodo ? <ListTodo size={15} /> : <Play size={15} fill="currentColor" />}
            onClick={() => onPlayFrom(tier)}
            disabled={!items.length}
            title={isTodo ? 'Play each song and give it a tier - rating one moves on to the next' : undefined}
          >
            {isTodo ? 'Triage' : `Play ${tierName(tier)}`}
          </Button>
        </>}
      />
      </Box>

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
              {tierName(t)} <Text span c="dimmed" fz="xs">{counts(t)}</Text>
            </Tabs.Tab>
          ))}
          {/* The filter shares the tab row (right end) instead of its own row. */}
          <Group ml="auto" gap="sm" wrap="nowrap" pb="3xs" style={{ alignSelf: 'center' }}>
            {q && (
              <Text fz="xs" c="dimmed">
                {visible.length} of {items.length}
              </Text>
            )}
            <TextInput
          ref={filterRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={getHotkeyHandler([
            [
              'Escape',
              (e) => {
                if (playerCoversPage) return;
                setFilter('');
                e.target.blur();
              },
              { preventDefault: false },
            ],
          ])}
          placeholder={`Filter ${tierName(tier)}…`}
          leftSection={<Search size={14} />}
          rightSection={filter ? <CloseButton size="sm" onClick={() => setFilter('')} aria-label="Clear filter" /> : <Kbd size="xs">/</Kbd>}
          size="xs"
          w={220}
        />
          </Group>
        </Tabs.List>
      </Tabs>

      {/* The list sits straight on the page, VS Code-style - no box around it. */}
      <Paper radius="md" p="4xs" bg="var(--editor)">
        <Box
          ref={listRef}
          pos="relative"
          style={{ height: !loading && visible.length > 0 ? virtualizer.getTotalSize() : undefined }}
          onDragOver={(e) => {
            dnd.onDragOver(e, `list:${tier}`);
            showDropAt(dropSlot(e));
          }}
          onDragLeave={(e) => {
            dnd.onDragLeave(e, `list:${tier}`);
            if (!e.currentTarget.contains(e.relatedTarget)) showDropAt(null);
          }}
          onDrop={(e) => {
            const idx = realDropIndex(e);
            showDropAt(null);
            dnd.onDrop(e, tier, idx);
          }}
        >
          {loading && Array.from({ length: SKELETON_ROWS }).map((_, i) => <TrackRowSkeleton key={i} tiers={rowTiers} />)}
          {!loading && visible.length === 0 && (
            <Text ta="center" c="dimmed" fz="sm" py="xl">
              {q ? `Nothing in ${tierName(tier)} matches "${filter}".` : `${tierName(tier)} is empty - drag videos onto ${tierName(tier)} in the rail, or use a row's tier chips on another tier.`}
            </Text>
          )}
          {!loading &&
            virtualizer.getVirtualItems().map((row) => {
              const v = visible[row.index];
              return (
                <Box
                  key={row.key}
                  pos="absolute"
                  top={0}
                  left={0}
                  right={0}
                  style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
                >
                  <TrackRow
                    video={v}
                    rank={q ? rankOf.get(v.videoId) : row.index + 1}
                    tier={tier}
                    tiers={rowTiers}
                    isPlaying={playingVideoId === v.videoId}
                    isPendingRemoval={pendingRemovalKeys.has(`${tier}:${v.videoId}`)}
                    isDragging={dnd.draggedVideoId === v.videoId}
                    onPlay={handlePlay}
                    onMove={move}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                </Box>
              );
            })}
          {/* The drop line floats over the gap between rows (absolute, at the
              slot's offset) so showing it never shifts the rows under the
              pointer. */}
          {showIndicator && (
            <Box
              data-testid="drop-indicator"
              data-index={overIndex}
              pos="absolute"
              left={12}
              right={12}
              h={2}
              bg="accent"
              style={{ top: overIndex * TRACK_ROW_HEIGHT - 1, borderRadius: 1, pointerEvents: 'none' }}
            />
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
