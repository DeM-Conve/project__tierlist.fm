import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
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
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { ArrowLeft, ArrowUpToLine, ListOrdered, MoreHorizontal, Play, Search, Shuffle } from 'lucide-react';
import { TIER_COLORS } from '../tiers';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { EqualizerMark, MoveMenu, TierChip } from './TierBits';
import { TIER_INK, indexForPointInList } from '../tierUtils';

const NO_ITEMS = [];

function TrackRow({
  video,
  rank,
  tier,
  tiers,
  selected,
  isPlaying,
  isPendingRemoval,
  isDragging,
  onToggleSelect,
  onPlay,
  onMove,
  onDragStart,
  onDragEnd,
}) {
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
        gridTemplateColumns: '28px 34px 44px minmax(0, 1fr) auto 30px',
        alignItems: 'center',
        gap: 12,
        borderRadius: 6,
        cursor: 'grab',
        opacity: isDragging ? 0.35 : isPendingRemoval ? 0.5 : 1,
        background: selected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
      }}
    >
      <Checkbox
        checked={selected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e.shiftKey);
        }}
        aria-label={`Select ${video.title}`}
        size="xs"
      />
      <Text fz="xs" c="dimmed" ta="right" ff="monospace">
        {isPlaying ? <EqualizerMark color="var(--accent)" height={11} /> : rank}
      </Text>
      <Image src={video.thumbnail || undefined} w={44} h={44} radius={4} fit="cover" alt="" draggable={false} style={{ pointerEvents: 'none' }} />
      <Box style={{ minWidth: 0 }}>
        <Text fz="sm" fw={isPlaying ? 700 : 500} c={isPlaying ? 'accent' : undefined} truncate="end">
          {video.title}
        </Text>
        <Text fz="xs" c="dimmed" truncate="end">
          {isPendingRemoval ? 'Duplicate - also in a higher tier, removed on sync' : video.channelTitle || ' '}
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
          <ActionIcon variant="subtle" color="dark.2" aria-label="More" onClick={(e) => e.stopPropagation()}>
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
  selected,
  onSelectedChange,
  onBulkMove,
  onPlay,
  onPlayFrom,
  onShuffle,
  onQuickSort,
  onBack,
  onSwitchTier,
}) {
  const dispatch = useDispatch();
  const dnd = useTierDnd();
  const [filter, setFilter] = useState('');
  const [overIndex, setOverIndex] = useState(null);
  const listRef = useRef(null);
  const filterRef = useRef(null);
  const lastClickedRef = useRef(null);
  const items = tierItems[tier] ?? NO_ITEMS;
  const color = TIER_COLORS[tier];

  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? items.filter((v) => v.title.toLowerCase().includes(q) || v.channelTitle?.toLowerCase().includes(q)) : items),
    [items, q]
  );
  const rankOf = useMemo(() => new Map(items.map((v, i) => [v.videoId, i + 1])), [items]);
  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.videoId));
  const someSelected = visible.some((v) => selected.has(v.videoId));

  function move(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }]));
  }

  function toggleSelect(videoId, index, withRange) {
    const next = new Set(selected);
    if (withRange && lastClickedRef.current != null) {
      const [a, b] = [lastClickedRef.current, index].sort((x, y) => x - y);
      const turnOn = !selected.has(videoId);
      visible.slice(a, b + 1).forEach((v) => (turnOn ? next.add(v.videoId) : next.delete(v.videoId)));
    } else if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    lastClickedRef.current = index;
    onSelectedChange(next);
  }

  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((v) => next.delete(v.videoId));
    else visible.forEach((v) => next.add(v.videoId));
    onSelectedChange(next);
  }

  function moveSelectedToTop() {
    const ids = items.filter((v) => selected.has(v.videoId)).map((v) => v.videoId);
    // Insert in reverse so they keep their relative order at the top.
    dispatch(
      moveWithFeedback(
        ids.reverse().map((videoId) => ({ fromTier: tier, toTier: tier, videoId, dropIndex: 0 }))
      )
    );
  }

  // "/" focuses the filter; Esc clears selection (then filter); Ctrl/Cmd+A
  // selects everything currently shown.
  useEffect(() => {
    function onKeyDown(e) {
      const a = document.activeElement;
      const isTyping = a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA' || a?.isContentEditable;
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (a === filterRef.current) {
          setFilter('');
          filterRef.current.blur();
        } else if (selected.size > 0) {
          onSelectedChange(new Set());
        }
      } else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !isTyping) {
        e.preventDefault();
        onSelectedChange(new Set(visible.map((v) => v.videoId)));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, visible, onSelectedChange]);

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
        </Group>
      </UnstyledButton>

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="md">
        <Group gap="md" wrap="nowrap">
          <Box w={72} h={72} bg={color} style={{ borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Text ff="var(--font-display)" fw={900} fz={30} c={TIER_INK}>
              {tier}
            </Text>
          </Box>
          <Stack gap={2}>
            <Title order={1} fz={{ base: 26, sm: 34 }} fw={900} lh={1.05}>
              {tier} <Text span inherit c="dimmed" fw={700}>in {category}</Text>
            </Title>
            <Text c="dimmed" fz="sm">
              {loading ? 'Loading…' : `${items.length} video${items.length === 1 ? '' : 's'} · ranked top to bottom`}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <Button variant="default" leftSection={<ListOrdered size={15} />} onClick={() => onQuickSort(tier)} disabled={!items.length}>
            Quick sort {tier}
          </Button>
          <Button variant="default" leftSection={<Shuffle size={15} />} onClick={() => onShuffle(tier)} disabled={!items.length}>
            Shuffle
          </Button>
          <Button leftSection={<Play size={15} fill="currentColor" />} onClick={() => onPlayFrom(tier)} disabled={!items.length}>
            Play {tier}
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
        </Tabs.List>
      </Tabs>

      <Group justify="space-between" mb={6} px="sm" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <Checkbox
            size="xs"
            checked={allVisibleSelected}
            indeterminate={!allVisibleSelected && someSelected}
            onChange={toggleAllVisible}
            aria-label="Select all shown"
            disabled={!visible.length}
          />
          <Text fz="xs" c="dimmed">
            {selected.size > 0 ? `${selected.size} selected` : q ? `${visible.length} of ${items.length} shown` : 'Select rows to move many at once (shift-click for a range)'}
          </Text>
        </Group>
        <TextInput
          ref={filterRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${tier}…`}
          leftSection={<Search size={14} />}
          rightSection={filter ? <CloseButton size="sm" onClick={() => setFilter('')} aria-label="Clear filter" /> : <Kbd size="xs">/</Kbd>}
          size="xs"
          w={240}
        />
      </Group>

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
                  selected={selected.has(v.videoId)}
                  isPlaying={playingVideoId === v.videoId}
                  isPendingRemoval={pendingRemovalKeys.has(`${tier}:${v.videoId}`)}
                  isDragging={dnd.draggedVideoId === v.videoId}
                  onToggleSelect={(range) => toggleSelect(v.videoId, i, range)}
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

      {selected.size > 0 && (
        <Paper
          withBorder
          radius="md"
          shadow="xl"
          p={6}
          pl="md"
          className="anim-rise"
          bg="var(--surface-3)"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(84px + var(--player-dock-height))',
            translate: '-50% 0',
            zIndex: 61,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>
              {selected.size} selected
            </Text>
            <Text size="xs" c="dimmed" visibleFrom="sm">
              Move to
            </Text>
            <Group gap={4} wrap="nowrap">
              {tiers
                .filter((t) => t !== tier)
                .map((t) => (
                  <TierChip key={t} tier={t} size={28} onClick={() => onBulkMove(t)} title={`Move ${selected.size} → ${t}`} />
                ))}
            </Group>
            <Tooltip label={`Move to the top of ${tier}`} withArrow>
              <ActionIcon variant="default" size="lg" onClick={moveSelectedToTop} aria-label="Move selected to top">
                <ArrowUpToLine size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Clear selection (Esc)" withArrow>
              <CloseButton onClick={() => onSelectedChange(new Set())} aria-label="Clear selection" />
            </Tooltip>
          </Group>
        </Paper>
      )}
    </Box>
  );
}
