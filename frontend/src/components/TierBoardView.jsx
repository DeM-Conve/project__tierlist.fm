import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Kbd,
  Menu,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Play,
  Search,
  Shuffle,
  Swords,
  Trash2,
} from 'lucide-react';
import { TIER_COLORS, TIER_ORDER } from '../tiers';

const TIER_INK = '#1a1509';

// Which slot does the pointer fall in? Works for both a single-line lane
// and an expanded (wrapped) one: the first tile whose row the pointer is
// above, or whose row it's on and left of that tile's midpoint.
function indexForPoint(container, clientX, clientY) {
  if (!container) return 0;
  const tiles = Array.from(container.querySelectorAll('[data-video-id]'));
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (clientY < r.top) return i;
    if (clientY <= r.bottom && clientX < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

function DropIndicator({ size }) {
  return <Box w={3} h={size} bg="accent" style={{ borderRadius: 2, flexShrink: 0 }} />;
}

function EqualizerMark() {
  return (
    <Group gap={2} align="flex-end" h={12} aria-label="Now playing">
      {[0, 1, 2].map((i) => (
        <Box key={i} w={3} h={12} bg={TIER_INK} className="eq-bar" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </Group>
  );
}

function Tile({
  video,
  tier,
  size,
  tiers,
  isDragging,
  isPlaying,
  isPendingRemoval,
  searchState,
  onDragStart,
  onDragEnd,
  onPlay,
  onMove,
}) {
  return (
    <Box
      className="tile"
      data-video-id={video.videoId}
      data-tier={tier}
      w={size}
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
      title={video.title}
      style={{
        flexShrink: 0,
        cursor: 'grab',
        opacity: isDragging ? 0.35 : isPendingRemoval ? 0.55 : 1,
      }}
    >
      <Box
        pos="relative"
        style={{
          borderRadius: 6,
          outline:
            isPlaying || searchState ? '2px solid var(--accent)' : undefined,
          outlineOffset: 2,
          boxShadow:
            searchState === 'active'
              ? '0 0 0 6px color-mix(in srgb, var(--accent) 35%, transparent)'
              : undefined,
        }}
      >
        <Image
          src={video.thumbnail || undefined}
          alt={video.title}
          w={size}
          h={size}
          radius={6}
          fit="cover"
          bg="var(--surface-2)"
          draggable={false}
          style={{
            pointerEvents: 'none',
            filter: isPendingRemoval ? 'grayscale(1)' : undefined,
          }}
        />

        {isPlaying && (
          <Badge
            pos="absolute"
            bottom={6}
            left={6}
            size="sm"
            radius="sm"
            variant="filled"
            leftSection={<EqualizerMark />}
            styles={{ label: { color: TIER_INK } }}
          >
            Playing
          </Badge>
        )}

        {isPendingRemoval && (
          <Tooltip label="Also in a higher tier - this copy is removed on sync (Removing: duplicate)" withArrow>
            <Badge
              pos="absolute"
              bottom={6}
              left={6}
              size="xs"
              radius="sm"
              color="yellow"
              leftSection={<Trash2 size={10} />}
            >
              Duplicate
            </Badge>
          </Tooltip>
        )}

        {/* Hover-only controls: play affordance, tier menu, YouTube link. */}
        <Box className="tile-overlay" pos="absolute" inset={0} style={{ borderRadius: 6 }}>
          <Group justify="space-between" p={5}>
            <Menu position="bottom-start" withinPortal shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="dark.8"
                  aria-label="Move to tier"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
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
                <Menu.Item
                  leftSection={<ArrowUpToLine size={14} />}
                  onClick={() => onMove(tier, tier, video.videoId, 0)}
                >
                  Move to top of {tier}
                </Menu.Item>
                <Menu.Item
                  component="a"
                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftSection={<ArrowUpRight size={14} />}
                >
                  Open on YouTube
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <ActionIcon
              component="a"
              href={`https://www.youtube.com/watch?v=${video.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              variant="filled"
              color="dark.8"
              title="Open on YouTube"
              aria-label="Open on YouTube"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight size={14} />
            </ActionIcon>
          </Group>
          <ActionIcon
            pos="absolute"
            top="50%"
            left="50%"
            size={38}
            radius="xl"
            variant="filled"
            style={{ transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}
            aria-hidden
            tabIndex={-1}
          >
            <Play size={16} fill={TIER_INK} color={TIER_INK} />
          </ActionIcon>
        </Box>
      </Box>

      <Text fz={11} lh={1.3} mt={6} lineClamp={2} c={isPlaying ? 'accent' : 'dark.1'} fw={isPlaying ? 600 : 400}>
        {video.title}
      </Text>
    </Box>
  );
}

function Lane({
  tier,
  tiers,
  items,
  loading,
  size,
  expanded,
  onToggleExpanded,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbClick,
  onMove,
  draggedVideoId,
  playingVideoId,
  pendingRemovalKeys,
  searchActive,
  matchedKeys,
  activeMatchKey,
  onShufflePlay,
}) {
  const contentRef = useRef(null);
  const [overIndex, setOverIndex] = useState(null);
  // While a "/" search is active, filter each lane down to only its matches
  // instead of dimming in place - a lane of hundreds would still need
  // scrolling to find a hit otherwise.
  const visibleItems = searchActive
    ? items?.filter((v) => matchedKeys?.has(`${tier}:${v.videoId}`))
    : items;
  const color = TIER_COLORS[tier];

  function handleDragOver(e) {
    e.preventDefault();
    onDragOver(e);
    setOverIndex(indexForPoint(contentRef.current, e.clientX, e.clientY));
  }

  function handleDragLeave(e) {
    // dragleave also fires moving between the lane's own children.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    onDragLeave(e);
    setOverIndex(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    const dropIndex = indexForPoint(contentRef.current, e.clientX, e.clientY);
    setOverIndex(null);
    onDrop(e, dropIndex);
  }

  const showIndicatorAt = (i) => isDragOver && overIndex === i;

  const tiles = (
    <Group
      ref={contentRef}
      gap={12}
      wrap={expanded ? 'wrap' : 'nowrap'}
      align="flex-start"
      p={12}
      mih={size + 48}
    >
      {loading &&
        Array.from({ length: 6 }).map((_, i) => (
          <Stack key={i} gap={6} style={{ flexShrink: 0 }}>
            <Skeleton w={size} h={size} radius={6} />
            <Skeleton w={size * 0.7} h={9} radius="sm" />
          </Stack>
        ))}
      {!loading && visibleItems?.length === 0 && (
        <Box
          w={size}
          h={size}
          style={{
            border: `1px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Text fz={11} c="dimmed" ta="center" px={8}>
            {searchActive ? 'No matches' : 'Drop videos here'}
          </Text>
        </Box>
      )}
      {!loading &&
        visibleItems?.map((v, i) => {
          const key = `${tier}:${v.videoId}`;
          return (
            <Group key={v.videoId} gap={12} wrap="nowrap" align="flex-start" style={{ flexShrink: 0 }}>
              {showIndicatorAt(i) && <DropIndicator size={size} />}
              <Tile
                video={v}
                tier={tier}
                tiers={tiers}
                size={size}
                isDragging={draggedVideoId === v.videoId}
                isPlaying={playingVideoId === v.videoId}
                isPendingRemoval={pendingRemovalKeys.has(key)}
                searchState={activeMatchKey === key ? 'active' : searchActive ? 'match' : null}
                onDragStart={onThumbDragStart}
                onDragEnd={onThumbDragEnd}
                onPlay={onThumbClick}
                onMove={onMove}
              />
            </Group>
          );
        })}
      {!loading && visibleItems?.length > 0 && showIndicatorAt(visibleItems.length) && (
        <DropIndicator size={size} />
      )}
    </Group>
  );

  return (
    <Paper
      id={`lane-${tier}`}
      radius="md"
      withBorder
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        overflow: 'hidden',
        display: 'flex',
        scrollMarginTop: 16,
        borderColor: isDragOver ? color : undefined,
        background: isDragOver
          ? `linear-gradient(90deg, color-mix(in srgb, ${color} 14%, var(--surface)), var(--surface) 60%)`
          : 'var(--surface)',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
    >
      <Stack
        w={size < 110 ? 52 : 72}
        gap={4}
        align="center"
        justify="center"
        py="sm"
        bg={color}
        style={{ flexShrink: 0 }}
      >
        <Text ff="var(--font-display)" fw={900} fz={size < 110 ? 20 : 26} lh={1} c={TIER_INK}>
          {tier}
        </Text>
        {!loading && (
          <Text fz={11} fw={700} c={TIER_INK} opacity={0.7}>
            {searchActive ? `${visibleItems?.length ?? 0}/${items?.length ?? 0}` : items?.length ?? 0}
          </Text>
        )}
        {!loading && items?.length > 0 && (
          <Tooltip label={`Shuffle play ${tier}`} withArrow position="right">
            <ActionIcon
              variant="transparent"
              size="sm"
              mt={2}
              onClick={() => onShufflePlay(tier)}
              aria-label={`Shuffle play ${tier}`}
              style={{ color: TIER_INK }}
            >
              <Shuffle size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Stack>

      <Box style={{ flex: 1, minWidth: 0 }}>
        {expanded ? tiles : (
          <ScrollArea type="hover" scrollbarSize={6} offsetScrollbars="x">
            {tiles}
          </ScrollArea>
        )}
      </Box>

      {!loading && items?.length > 0 && (
        <Box p={6} style={{ flexShrink: 0, borderLeft: '1px solid var(--border-soft)' }}>
          <Tooltip label={expanded ? 'Collapse to one line' : 'Show all'} withArrow position="left">
            <ActionIcon
              variant="subtle"
              color="dark.2"
              onClick={onToggleExpanded}
              aria-label={expanded ? `Collapse ${tier}` : `Expand ${tier}`}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </ActionIcon>
          </Tooltip>
        </Box>
      )}
    </Paper>
  );
}

function PendingChangesModal({ opened, moves, onClose }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      title={
        <Text fw={800} fz="lg">
          {moves.length} change{moves.length === 1 ? '' : 's'} staged
        </Text>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap={0}>
        {moves.map((m) => (
          <Group
            key={`${m.kind}-${m.video.videoId}-${m.tier ?? m.to}`}
            justify="space-between"
            wrap="nowrap"
            gap="md"
            py={9}
            style={{ borderBottom: '1px dashed var(--border-soft)' }}
          >
            <Text fz="sm" truncate="end" title={m.video.title}>
              {m.video.title}
            </Text>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Badge radius="sm" color={TIER_COLORS[m.kind === 'dedupe' ? m.tier : m.from]} c={TIER_INK}>
                {m.kind === 'dedupe' ? m.tier : m.from}
              </Badge>
              <ArrowRight size={13} color="var(--text-faint)" />
              {m.kind === 'dedupe' ? (
                <Text fz="xs" fw={600} c="red.5">
                  removed (duplicate)
                </Text>
              ) : (
                <Badge radius="sm" color={TIER_COLORS[m.to]} c={TIER_INK}>
                  {m.to}
                </Badge>
              )}
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  );
}

// Floating "unsaved changes" bar - staged edits are the one thing on the
// board that needs a decision, so they sit above everything (and above the
// mini player) instead of competing with the header's buttons.
function PendingBar({ count, syncStatus, compact, onReview, onDiscard, onSync }) {
  return (
    <Paper
      withBorder
      radius="md"
      shadow="xl"
      p={6}
      pl="md"
      className="anim-rise"
      bg="var(--surface-2)"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(20px + var(--player-dock-height))',
        translate: '-50% 0',
        zIndex: 60,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <Box w={8} h={8} bg="accent" style={{ borderRadius: '50%', flexShrink: 0 }} />
        <Button variant="subtle" color="dark.0" px={6} onClick={onReview}>
          {compact ? `${count} staged` : `${count} change${count === 1 ? '' : 's'} staged`}
        </Button>
        {syncStatus === 'done' && (
          <Badge color="teal" variant="light">
            Synced
          </Badge>
        )}
        {(syncStatus === 'partial' || syncStatus === 'error') && (
          <Badge color="red" variant="light">
            {syncStatus === 'partial' ? 'Some failed' : 'Sync failed'}
          </Badge>
        )}
        <Button variant="default" size={compact ? 'xs' : 'sm'} onClick={onDiscard} disabled={syncStatus === 'syncing'}>
          Discard
        </Button>
        <Button
          size={compact ? 'xs' : 'sm'}
          onClick={onSync}
          disabled={syncStatus === 'syncing'}
          loading={syncStatus === 'syncing'}
          rightSection={compact ? null : <Kbd size="xs">⇧P</Kbd>}
        >
          {compact ? 'Push' : 'Push to YouTube'}
        </Button>
      </Group>
    </Paper>
  );
}

function DistributionBar({ tiers, tierItems, total, onJump }) {
  return (
    <Progress.Root size={12} radius="sm" bg="var(--surface-2)">
      {tiers.map((t) => {
        const n = tierItems[t]?.length ?? 0;
        if (!n) return null;
        return (
          <Tooltip key={t} label={`${t} · ${n} video${n === 1 ? '' : 's'}`} withArrow>
            <Progress.Section
              value={(n / total) * 100}
              color={TIER_COLORS[t]}
              onClick={() => onJump(t)}
              style={{ cursor: 'pointer' }}
            />
          </Tooltip>
        );
      })}
    </Progress.Root>
  );
}

export default function TierBoardView({
  category,
  tierGroups,
  tierItems,
  tierLoading,
  dragOverTier,
  draggedVideoId,
  playingVideoId,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbClick,
  onMoveVideo,
  pendingMoves,
  syncStatus,
  onDiscard,
  onSync,
  onStartDuel,
  onShufflePlay,
}) {
  const [showPending, setShowPending] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState(() => new Set());
  const isNarrow = useMediaQuery('(max-width: 900px)');
  const tileSize = isNarrow ? 96 : 120;

  const tiers = TIER_ORDER.filter((t) => tierGroups[category]?.[t]);
  const anyLoading = tiers.some((t) => tierLoading[t]);
  const total = tiers.reduce((sum, t) => sum + (tierItems[t]?.length ?? 0), 0);
  const hasVideos = total > 0;
  const pendingRemovalKeys = useMemo(
    () => new Set(pendingMoves.filter((m) => m.kind === 'dedupe').map((m) => `${m.tier}:${m.video.videoId}`)),
    [pendingMoves]
  );

  function toggleExpanded(tier) {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  function jumpToTier(tier) {
    document.getElementById(`lane-${tier}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Vim-style "/" find: "/" opens it and is typed straight into the box as
  // the literal command-line prefix, the way vim's own "/" shows up in its
  // command line - deleting it (e.g. select-all + backspace) cancels the
  // search entirely rather than leaving a bare, unprefixed query active.
  // Enter (in the box) or n/N (once you've clicked away) step through
  // matches, Escape closes it. Each lane filters down to just its matches
  // rather than merely highlighting them in place.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInputRef = useRef(null);

  const searchableEntries = useMemo(() => {
    const list = [];
    TIER_ORDER.forEach((t) => {
      if (!tierGroups[category]?.[t]) return;
      (tierItems[t] || []).forEach((video) => list.push({ tier: t, video }));
    });
    return list;
  }, [tierGroups, category, tierItems]);

  // The box's value is the literal vim command line - it always starts
  // with the "/" that opened it, and the real query is whatever follows.
  const queryText = searchQuery.slice(1);

  const matches = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    return searchableEntries.filter((e) => e.video.title.toLowerCase().includes(q));
  }, [searchableEntries, queryText]);

  function openSearch() {
    setSearchOpen(true);
    setSearchQuery('/');
    requestAnimationFrame(() => {
      const el = searchInputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
  }

  function handleSearchChange(value) {
    if (!value.startsWith('/')) {
      // The leading "/" itself got deleted (e.g. select-all + backspace) -
      // same as vim, clearing the command line cancels the search outright
      // rather than leaving an unprefixed query active.
      closeSearch();
      return;
    }
    setSearchQuery(value);
  }

  useEffect(() => {
    setMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const active = matches[matchIndex % matches.length];
    const el = document.querySelector(
      `[data-tier="${active.tier}"][data-video-id="${CSS.escape(active.video.videoId)}"]`
    );
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [matches, matchIndex]);

  useEffect(() => {
    function onKeyDown(e) {
      const active = document.activeElement;
      const inSearchBox = active === searchInputRef.current;
      const isTyping =
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        openSearch();
        return;
      }
      // Shift+P pushes pending changes to YouTube - the same action the
      // command palette's "Sync ... to YouTube" entry runs, just reachable
      // without opening the palette. Requires Shift (checked via e.key
      // being the uppercase 'P') since a bare "p" was too easy to hit by
      // accident while browsing a board. Only fires when there's actually
      // something to push, matching the "Push to YouTube" button only
      // showing then.
      if (e.key === 'P' && !isTyping && pendingMoves.length > 0) {
        e.preventDefault();
        onSync();
        return;
      }
      if (!searchOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (e.key === 'Enter' && inSearchBox) {
        e.preventDefault();
        if (matches.length === 0) return;
        // A single match is unambiguous - Enter should just play it, the
        // same way a browser's own find-in-page jumps straight there
        // instead of making you cycle through a "1 of 1" result.
        if (matches.length === 1) {
          const only = matches[0];
          onThumbClick(only.tier, only.video.videoId);
          closeSearch();
          return;
        }
        setMatchIndex((i) => (e.shiftKey ? i - 1 + matches.length : i + 1) % matches.length);
        return;
      }
      if (!isTyping && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (matches.length === 0) return;
        setMatchIndex((i) => (e.key === 'N' ? i - 1 + matches.length : i + 1) % matches.length);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, matches, onThumbClick, pendingMoves, onSync]);

  const matchedKeys = useMemo(
    () => new Set(matches.map((e) => `${e.tier}:${e.video.videoId}`)),
    [matches]
  );
  const activeMatch = matches.length > 0 ? matches[matchIndex % matches.length] : null;
  const activeMatchKey = activeMatch ? `${activeMatch.tier}:${activeMatch.video.videoId}` : null;
  const searchActive = queryText.trim().length > 0;

  return (
    // Leaves room under the last lane for the floating staged-changes bar.
    <Box component="section" pb={pendingMoves.length > 0 ? 72 : 0}>
      {/* Header: same warm glow as the login page, stats + distribution. */}
      <Box
        mx={-16}
        px={16}
        pt="md"
        pb="lg"
        mb="md"
        style={{
          background:
            'radial-gradient(560px 150px at 0% 0%, rgba(214, 162, 76, 0.12), transparent)',
        }}
      >
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="lg">
          <Stack gap={6}>
            <Text fz={11} fw={700} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
              Tier board
            </Text>
            <Title order={1} fz={{ base: 32, sm: 44 }} fw={900} lh={1} style={{ letterSpacing: '-0.02em' }}>
              {category}
            </Title>
            <Text c="dimmed" fz="sm">
              {anyLoading
                ? 'Loading videos…'
                : `${total} video${total === 1 ? '' : 's'} across ${tiers.length} tiers · drag, or use a tile's ⋯ menu, to re-rank`}
            </Text>
          </Stack>

          <Group gap="xs" wrap="wrap">
            <Button
              variant="default"
              leftSection={<Search size={15} />}
              rightSection={<Kbd size="xs">/</Kbd>}
              onClick={openSearch}
              disabled={!hasVideos}
            >
              Search
            </Button>
            <Button variant="default" leftSection={<Swords size={15} />} onClick={onStartDuel}>
              Start duel
            </Button>
            <Button leftSection={<Shuffle size={15} />} onClick={() => onShufflePlay()} disabled={!hasVideos}>
              Shuffle play
            </Button>
          </Group>
        </Group>

        {hasVideos && (
          <Box mt="lg">
            <DistributionBar tiers={tiers} tierItems={tierItems} total={total} onJump={jumpToTier} />
          </Box>
        )}
      </Box>

      <Stack gap={10}>
        {tiers.map((t) => (
          <Lane
            key={t}
            tier={t}
            tiers={tiers}
            items={tierItems[t]}
            loading={tierLoading[t]}
            size={tileSize}
            expanded={expandedTiers.has(t)}
            onToggleExpanded={() => toggleExpanded(t)}
            isDragOver={dragOverTier === t}
            draggedVideoId={draggedVideoId}
            playingVideoId={playingVideoId}
            onDragOver={(e) => onRowDragOver(e, t)}
            onDragLeave={() => onRowDragLeave(t)}
            onDrop={(e, dropIndex) => onRowDrop(e, t, dropIndex)}
            onThumbDragStart={onThumbDragStart}
            onThumbDragEnd={onThumbDragEnd}
            onThumbClick={onThumbClick}
            onMove={onMoveVideo}
            pendingRemovalKeys={pendingRemovalKeys}
            searchActive={searchActive}
            matchedKeys={matchedKeys}
            activeMatchKey={activeMatchKey}
            onShufflePlay={onShufflePlay}
          />
        ))}
      </Stack>

      <PendingChangesModal opened={showPending} moves={pendingMoves} onClose={() => setShowPending(false)} />

      {pendingMoves.length > 0 && (
        <PendingBar
          count={pendingMoves.length}
          syncStatus={syncStatus}
          compact={isNarrow}
          onReview={() => setShowPending(true)}
          onDiscard={onDiscard}
          onSync={onSync}
        />
      )}

      {searchOpen && (
        <Paper
          withBorder
          radius="md"
          shadow="xl"
          p={6}
          className="anim-rise"
          bg="var(--surface-2)"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            translate: '-50% 0',
            zIndex: 60,
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="/search titles..."
              variant="unstyled"
              leftSection={<Search size={15} />}
              style={{ flex: 1 }}
              styles={{ input: { fontFamily: 'monospace' } }}
            />
            <Badge variant="light" radius="sm">
              {matches.length > 0 ? `${(matchIndex % matches.length) + 1}/${matches.length}` : '0/0'}
            </Badge>
            <Group gap={4} visibleFrom="sm">
              <Kbd size="xs">n</Kbd>
              <Kbd size="xs">N</Kbd>
              <Kbd size="xs">Esc</Kbd>
            </Group>
          </Group>
        </Paper>
      )}
    </Box>
  );
}
