import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Kbd,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useElementSize, useMediaQuery } from '@mantine/hooks';
import { ChevronRight, ListTodo, Play, Plus, Search, Shuffle, Swords, Trash2 } from 'lucide-react';
import { BOARD_TIERS, REMOVED_TIER, TIER_COLORS, TIER_ORDER, TODO_TIER } from '../tiers';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { selectPlayerCoversPage } from '../store/selectors';
import { TierMixBar, TierTile } from './TierBits';
import { TIER_INK, indexForPointInFlow, videoMatches } from '../tierUtils';
import { isSequenceKey } from '../keyboard/sequence';

const GAP = 8;
// A row's fixed vertical chrome around its tile lines: 2 x (4px box padding
// + 4px inner padding) + the 1px top border.
const ROW_CHROME = 4 * GAP / 2 + 1;

// Tiles per line in a row whose tile area is `width` wide.
// (width - 8): the inner row keeps 4px each side so focus/search rings aren't clipped.
function tilesPerLine(width, size) {
  return Math.max(1, Math.floor((width - 8 + GAP) / (size + GAP)));
}

// Splits `budget` tile lines between rows: every row gets one, then each
// spare line goes to whichever row still hides the most songs - so a big
// tier grows first and a tier that already fits never takes more space.
function allocateLines(counts, perLine, budget) {
  const lines = counts.map(() => 1);
  let left = budget - counts.length;
  while (left > 0) {
    let best = -1;
    let bestHidden = 0;
    counts.forEach((c, i) => {
      const hidden = c - lines[i] * perLine;
      if (hidden > bestHidden) {
        best = i;
        bestHidden = hidden;
      }
    });
    if (best < 0) break;
    lines[best] += 1;
    left -= 1;
  }
  return lines;
}

function DropIndicator({ size }) {
  return <Box w={3} h={size} bg="accent" style={{ borderRadius: 2, flexShrink: 0 }} />;
}

// One tier row. Shows `lines` lines of tiles (the board sizes that so every
// row together fills the screen) and folds the rest into a "+N" tile that
// opens the tier on its own page - so the whole board always fits on one
// screen, however big a tier gets.
function TierRow({
  tier,
  tiers,
  items,
  loading,
  size,
  lines = 1,
  onMeasure,
  searchActive,
  matchedKeys,
  activeMatchKey,
  playingVideoId,
  pendingRemovalKeys,
  onPlay,
  onPlayFrom,
  onShuffle,
  onOpenTier,
  onMove,
}) {
  const dnd = useTierDnd();
  const { ref: sizeRef, width } = useElementSize();
  useEffect(() => {
    if (width > 0) onMeasure?.(width);
  }, [width, onMeasure]);
  const contentRef = useRef(null);
  const [overIndex, setOverIndex] = useState(null);
  const isOver = dnd.dragOverTier === tier;
  // The Remove bin (REMOVED_TIER) reuses the row: a drop target whose
  // tiles are staged deletions - drag one back out to keep it.
  const isBin = tier === REMOVED_TIER;
  const color = isBin ? 'var(--surface-2)' : TIER_COLORS[tier];
  const isTodo = tier === TODO_TIER;
  const playLabel = isTodo ? 'Triage: play and rate one by one' : `Play from ${tier}`;

  const shown = searchActive ? items?.filter((v) => matchedKeys.has(`${tier}:${v.videoId}`)) : items;
  const total = shown?.length ?? 0;
  const perLine = tilesPerLine(width, size);
  const fit = perLine * lines;
  // While searching, show every match (wrapping) so n/N can always reach it.
  const truncated = !searchActive && total > fit;
  const visible = truncated ? shown.slice(0, fit - 1) : shown || [];
  const hiddenCount = total - visible.length;

  function dropIndexFor(e) {
    if (e.target.closest?.('[data-more]')) return null;
    return indexForPointInFlow(contentRef.current, e.clientX, e.clientY);
  }

  return (
    <Box
      onDragOver={(e) => {
        dnd.onDragOver(e, tier);
        setOverIndex(dropIndexFor(e));
      }}
      onDragLeave={(e) => {
        dnd.onDragLeave(e, tier);
        if (!e.currentTarget.contains(e.relatedTarget)) setOverIndex(null);
      }}
      onDrop={(e) => {
        const idx = dropIndexFor(e);
        setOverIndex(null);
        dnd.onDrop(e, tier, idx);
      }}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderTop: '1px solid var(--border-soft)',
        background: isOver ? `color-mix(in srgb, ${color} 12%, var(--surface))` : undefined,
        transition: 'background 120ms ease',
      }}
    >
      {isBin ? (
        <Tooltip label="Drop a song here to delete it from its playlist when you push" withArrow multiline maw={240}>
          <Stack
            w={size < 64 ? 54 : 68}
            bg={color}
            gap={4}
            align="center"
            justify="center"
            style={{ flexShrink: 0, borderRight: '1px solid var(--border-soft)' }}
          >
            <ThemeIcon variant="light" color="red" size="md" radius="sm">
              <Trash2 size={15} />
            </ThemeIcon>
            <Text fz={11} fw={700} c="dimmed" lh={1}>
              Remove{total > 0 ? ` ${total}` : ''}
            </Text>
          </Stack>
        </Tooltip>
      ) : (
      <UnstyledButton
        onClick={() => onOpenTier(tier)}
        w={size < 64 ? 54 : 68}
        bg={color}
        aria-label={`Open ${tier}`}
        className="tier-label-btn"
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: '6px 0',
        }}
      >
        <Text ff="var(--font-display)" fw={900} fz={(size < 64 ? 18 : 22) * (isTodo ? 0.7 : 1)} lh={1} c={TIER_INK}>
          {tier}
        </Text>
        {!loading && (
          <Text fz={11} fw={700} c={TIER_INK} opacity={0.7} lh={1.2}>
            {searchActive ? `${total}/${items?.length ?? 0}` : items?.length ?? 0}
          </Text>
        )}
        {!loading && items?.length > 0 && (
          <Group gap={0} mt={2} wrap="nowrap">
            <Tooltip label={playLabel} withArrow>
              <ActionIcon
                component="span"
                variant="transparent"
                size="sm"
                style={{ color: TIER_INK }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayFrom(tier);
                }}
                aria-label={playLabel}
              >
                <Play size={13} fill="currentColor" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={`Shuffle ${tier}`} withArrow>
              <ActionIcon
                component="span"
                variant="transparent"
                size="sm"
                style={{ color: TIER_INK }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShuffle(tier);
                }}
                aria-label={`Shuffle ${tier}`}
              >
                <Shuffle size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </UnstyledButton>
      )}

      <Box ref={sizeRef} style={{ flex: 1, minWidth: 0 }} p={GAP - 4}>
        <Group ref={contentRef} gap={GAP} wrap={searchActive || lines > 1 ? 'wrap' : 'nowrap'} mih={size} p={4} style={{ overflow: 'hidden' }}>
          {loading &&
            Array.from({ length: Math.min(perLine, 8) }).map((_, i) => <Skeleton key={i} w={size} h={size} radius={6} />)}
          {!loading && total === 0 && (
            <Box
              h={size}
              px="md"
              style={{
                border: `1px dashed ${isOver ? color : 'var(--border)'}`,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Text fz="xs" c="dimmed">
                {isBin
                  ? 'Drop songs here to remove them from their playlist (on push)'
                  : searchActive
                  ? 'No matches in this tier'
                  : isTodo
                    ? 'Nothing to do - drop songs here to rate them later'
                    : 'Empty - drop videos here'}
              </Text>
            </Box>
          )}
          {!loading &&
            visible.map((v, i) => {
              const key = `${tier}:${v.videoId}`;
              return (
                <Group key={v.videoId} gap={GAP} wrap="nowrap" style={{ flexShrink: 0 }}>
                  {isOver && overIndex === i && <DropIndicator size={size} />}
                  <TierTile
                    video={v}
                    tier={tier}
                    tiers={tiers}
                    size={size}
                    isDragging={dnd.draggedVideoId === v.videoId}
                    isPlaying={playingVideoId === v.videoId}
                    isPendingRemoval={pendingRemovalKeys.has(key)}
                    searchState={activeMatchKey === key ? 'active' : searchActive ? 'match' : null}
                    onDragStart={dnd.onDragStart}
                    onDragEnd={dnd.onDragEnd}
                    onPlay={isBin ? () => {} : onPlay}
                    onMove={onMove}
                  />
                </Group>
              );
            })}
          {!loading && isOver && overIndex === visible.length && visible.length > 0 && <DropIndicator size={size} />}
          {!loading && hiddenCount > 0 && (
            <UnstyledButton
              data-more
              w={size}
              h={size}
              // The bin has no page of its own - its full list is the
              // pending-changes review.
              onClick={isBin ? undefined : () => onOpenTier(tier)}
              aria-label={isBin ? `${hiddenCount} more staged for removal` : `Show all ${items.length} in ${tier}`}
              className="more-tile"
              style={{
                flexShrink: 0,
                borderRadius: 6,
                background: `color-mix(in srgb, ${color} 16%, var(--surface-2))`,
                border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text ff="var(--font-display)" fw={900} fz={size < 64 ? 15 : 19} lh={1} c={`color-mix(in srgb, ${color} 60%, var(--text))`}>
                +{hiddenCount}
              </Text>
              <Text fz={10} c="dimmed" mt={3}>
                show all
              </Text>
            </UnstyledButton>
          )}
        </Group>
      </Box>

      {!isBin && (
      <Tooltip label={`Open ${tier} (${items?.length ?? 0})`} withArrow position="left">
        <UnstyledButton
          onClick={() => onOpenTier(tier)}
          px={6}
          aria-label={`Open ${tier}`}
          className="row-open-btn"
          style={{ display: 'grid', placeItems: 'center', borderLeft: '1px solid var(--border-soft)', flexShrink: 0 }}
        >
          <ChevronRight size={16} color="var(--text-dim)" />
        </UnstyledButton>
      </Tooltip>
      )}
    </Box>
  );
}

export default function TierBoardView({
  category,
  tierGroups,
  tierItems,
  tierLoading,
  boardLoading,
  playingVideoId,
  pendingMoves,
  onPlay,
  onPlayFrom,
  onShufflePlay,
  onStartDuel,
  onOpenTier,
  onAddMissingTiers,
}) {
  const dispatch = useDispatch();
  const isNarrow = useMediaQuery('(max-width: 62em)');
  const tileSize = isNarrow ? 64 : 88; // square; big enough to print the song name on

  // `tiers` = the ranked rows; `boardTiers` adds the TODO list when the
  // board has one (it's a move target everywhere, but not ranked/counted).
  const tiers = TIER_ORDER.filter((t) => tierGroups[category]?.[t]);
  const hasTodo = !!tierGroups[category]?.[TODO_TIER];
  const boardTiers = BOARD_TIERS.filter((t) => tierGroups[category]?.[t]);
  const anyLoading = boardLoading || boardTiers.some((t) => tierLoading[t]);
  // Before the playlists list itself has loaded we don't even know which
  // tiers this board has - show a neutral placeholder board, not "0 tiers".
  const unknownTiers = tiers.length === 0 && anyLoading;
  const counts = Object.fromEntries(tiers.map((t) => [t, tierItems[t]?.length ?? 0]));
  const total = tiers.reduce((sum, t) => sum + counts[t], 0);
  const todoCount = tierItems[TODO_TIER]?.length ?? 0;
  const hasVideos = total + todoCount > 0;
  const pendingRemovalKeys = useMemo(
    () => new Set(pendingMoves.filter((m) => m.kind === 'dedupe').map((m) => `${m.tier}:${m.video.videoId}`)),
    [pendingMoves]
  );

  // Fit the board to the screen: measure what's left of the viewport under
  // the header (and above the mini player / footer), turn it into tile
  // lines, and share them out between the rows (allocateLines). Only a
  // board too big for even one line per tier scrolls.
  const { ref: viewportRef, height: viewportHeight } = useElementSize();
  const { ref: headerRef, height: headerHeight } = useElementSize();
  const { ref: footerRef, height: footerHeight } = useElementSize();
  const rowsRef = useRef(null);
  const [rowsTop, setRowsTop] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (el) setRowsTop(el.getBoundingClientRect().top + window.scrollY);
  }, [headerHeight, viewportHeight]);

  const rowTiers = [...(hasTodo ? [TODO_TIER] : []), ...tiers, ...(tiers.length ? [REMOVED_TIER] : [])];
  const perLine = tilesPerLine(rowWidth, tileSize);
  const pendingPad = pendingMoves.length > 0 ? 80 : 0;
  // 32 = the canvas's own bottom padding; the TODO row is a separate card
  // (16px margin + its 2px of borders).
  const available = viewportHeight - rowsTop - footerHeight - pendingPad - 32 - (hasTodo ? 18 : 0) - 1;
  const lineBudget = Math.floor((available - rowTiers.length * (ROW_CHROME - GAP)) / (tileSize + GAP));
  const rowLines = useMemo(() => {
    const allocated = allocateLines(
      rowTiers.map((t) => tierItems[t]?.length ?? 0),
      perLine,
      rowWidth > 0 && viewportHeight > 0 ? lineBudget : 0
    );
    return Object.fromEntries(rowTiers.map((t, i) => [t, allocated[i]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowTiers.join(), tierItems, perLine, lineBudget, rowWidth, viewportHeight]);

  function move(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }]));
  }

  // Vim-style "/" find: "/" opens it and is typed straight into the box as
  // the literal command-line prefix, the way vim's own "/" shows up in its
  // command line - deleting it (e.g. select-all + backspace) cancels the
  // search entirely rather than leaving a bare, unprefixed query active.
  // Enter (in the box) or n/N (once you've clicked away) step through
  // matches, Escape closes it. Each row filters down to just its matches.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInputRef = useRef(null);
  const playerCoversPage = useSelector(selectPlayerCoversPage);

  const searchableEntries = useMemo(() => {
    const list = [];
    BOARD_TIERS.forEach((t) => {
      if (!tierGroups[category]?.[t]) return;
      (tierItems[t] || []).forEach((video) => list.push({ tier: t, video }));
    });
    return list;
  }, [tierGroups, category, tierItems]);

  const queryText = searchQuery.slice(1);
  const matches = useMemo(() => {
    if (!queryText.trim()) return [];
    return searchableEntries.filter((e) => videoMatches(e.video, queryText));
  }, [searchableEntries, queryText]);

  function openSearch() {
    setSearchOpen(true);
    setSearchQuery('/');
    setMatchIndex(0);
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
      // Deleting the leading "/" cancels the search outright, like vim.
      closeSearch();
      return;
    }
    setSearchQuery(value);
    setMatchIndex(0);
  }

  useEffect(() => {
    if (matches.length === 0) return;
    const active = matches[matchIndex % matches.length];
    const el = document.querySelector(
      `[data-tier="${active.tier}"][data-video-id="${CSS.escape(active.video.videoId)}"]`
    );
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [matches, matchIndex]);

  // The full-screen player sits over the board like a modal: close any open
  // search when it comes up, and ignore the board's keys until it's minimized.
  useEffect(() => {
    if (playerCoversPage && searchOpen) closeSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCoversPage]);

  useEffect(() => {
    function onKeyDown(e) {
      if (isSequenceKey(e)) return;
      if (playerCoversPage) return;
      const active = document.activeElement;
      const inSearchBox = active === searchInputRef.current;
      const isTyping =
        active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        openSearch();
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
        // A single match is unambiguous - Enter just plays it.
        if (matches.length === 1) {
          onPlay(matches[0].tier, matches[0].video.videoId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, matches, onPlay, playerCoversPage]);

  const matchedKeys = useMemo(() => new Set(matches.map((e) => `${e.tier}:${e.video.videoId}`)), [matches]);
  const activeMatch = matches.length > 0 ? matches[matchIndex % matches.length] : null;
  const activeMatchKey = activeMatch ? `${activeMatch.tier}:${activeMatch.video.videoId}` : null;
  const searchActive = queryText.trim().length > 0;

  return (
    <Box component="section" pb={pendingPad}>
      {/* Invisible, viewport-sized (minus the mini player) - measured so the
          board knows how much height it can fill. */}
      <Box
        ref={viewportRef}
        aria-hidden
        style={{ position: 'fixed', top: 0, bottom: 'var(--player-dock-height)', width: 0, visibility: 'hidden', pointerEvents: 'none' }}
      />
      <Box ref={headerRef}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="md">
        <Stack gap={4}>
          <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
            Tier list
          </Text>
          <Title order={1} fz={{ base: 30, sm: 40 }} fw={900} lh={1} style={{ letterSpacing: '-0.02em' }}>
            {category}
          </Title>
          <Text c="dimmed" fz="sm">
            {anyLoading
              ? 'Loading videos…'
              : `${total} videos · ${tiers.length} tiers${hasTodo ? ` · ${todoCount} to do` : ''}`}
          </Text>
        </Stack>

        <Group gap="xs" wrap="wrap">
          {todoCount > 0 && (
            <Tooltip label="Play the TODO list and give each song a tier - rating one moves on to the next" withArrow multiline maw={260}>
              <Button variant="light" leftSection={<ListTodo size={15} />} onClick={() => onPlayFrom(TODO_TIER)}>
                Triage {todoCount}
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Search this board" withArrow>
            <Button
              variant="default"
              leftSection={<Search size={15} />}
              rightSection={<Kbd size="xs">/</Kbd>}
              onClick={openSearch}
              disabled={!hasVideos}
            >
              Find
            </Button>
          </Tooltip>
          <Tooltip label="Pick the better of two until it's ranked" withArrow>
            <Button variant="default" leftSection={<Swords size={15} />} onClick={onStartDuel} disabled={!hasVideos}>
              Duel
            </Button>
          </Tooltip>
          <Button.Group>
            <Button leftSection={<Play size={15} fill="currentColor" />} onClick={() => onPlayFrom(boardTiers[0])} disabled={!hasVideos}>
              Play
            </Button>
            <Tooltip label="Shuffle the whole board" withArrow>
              <Button px="sm" onClick={() => onShufflePlay()} disabled={!hasVideos} aria-label="Shuffle play" style={{ borderLeft: '1px solid color-mix(in srgb, var(--accent-on) 25%, transparent)' }}>
                <Shuffle size={15} />
              </Button>
            </Tooltip>
          </Button.Group>
        </Group>
      </Group>

      {hasVideos && (
        <Box mb="md">
          <TierMixBar tiers={tiers} counts={counts} size={18} labels onSegmentClick={onOpenTier} />
        </Box>
      )}
      </Box>

      <Box ref={rowsRef}>

      {unknownTiers && (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }} bg="var(--surface)">
          {Array.from({ length: 5 }).map((_, i) => (
            <Group key={i} gap={GAP} p={GAP} wrap="nowrap" style={{ borderTop: i ? '1px solid var(--border-soft)' : undefined }}>
              <Skeleton w={60} h={tileSize} radius={6} style={{ flexShrink: 0 }} />
              {Array.from({ length: 8 }).map((__, j) => (
                <Skeleton key={j} w={tileSize} h={tileSize} radius={6} style={{ flexShrink: 0 }} />
              ))}
            </Group>
          ))}
        </Paper>
      )}

      {hasTodo && !unknownTiers && (
        <Paper withBorder radius="md" mb="md" style={{ overflow: 'hidden', borderTop: 'none' }} bg="var(--surface)">
          <TierRow
            tier={TODO_TIER}
            tiers={boardTiers}
            items={tierItems[TODO_TIER]}
            loading={tierLoading[TODO_TIER]}
            size={tileSize}
            lines={rowLines[TODO_TIER]}
            onMeasure={setRowWidth}
            searchActive={searchActive}
            matchedKeys={matchedKeys}
            activeMatchKey={activeMatchKey}
            playingVideoId={playingVideoId}
            pendingRemovalKeys={pendingRemovalKeys}
            onPlay={onPlay}
            onPlayFrom={onPlayFrom}
            onShuffle={onShufflePlay}
            onOpenTier={onOpenTier}
            onMove={move}
          />
        </Paper>
      )}

      <Paper withBorder radius="md" style={{ overflow: 'hidden', borderTop: 'none', display: unknownTiers ? 'none' : undefined }} bg="var(--surface)">
        {tiers.map((t) => (
          <TierRow
            key={t}
            tier={t}
            tiers={boardTiers}
            items={tierItems[t]}
            loading={tierLoading[t]}
            size={tileSize}
            lines={rowLines[t]}
            onMeasure={setRowWidth}
            searchActive={searchActive}
            matchedKeys={matchedKeys}
            activeMatchKey={activeMatchKey}
            playingVideoId={playingVideoId}
            pendingRemovalKeys={pendingRemovalKeys}
            onPlay={onPlay}
            onPlayFrom={onPlayFrom}
            onShuffle={onShufflePlay}
            onOpenTier={onOpenTier}
            onMove={move}
          />
        ))}
        {tiers.length > 0 && (
          <TierRow
            tier={REMOVED_TIER}
            tiers={boardTiers}
            items={tierItems[REMOVED_TIER] || []}
            loading={false}
            size={tileSize}
            lines={rowLines[REMOVED_TIER]}
            onMeasure={setRowWidth}
            searchActive={false}
            matchedKeys={matchedKeys}
            activeMatchKey={null}
            playingVideoId={playingVideoId}
            pendingRemovalKeys={pendingRemovalKeys}
            onPlay={onPlay}
            onPlayFrom={onPlayFrom}
            onShuffle={onShufflePlay}
            onOpenTier={onOpenTier}
            onMove={move}
          />
        )}
      </Paper>
      </Box>

      {/* flow-root so the children's top margins count toward the measured height. */}
      <Box ref={footerRef} style={{ display: 'flow-root' }}>
      {!anyLoading && tiers.length > 0 && (tiers.length < TIER_ORDER.length || !hasTodo) && (
        <Group justify="center" mt="sm" gap="xs">
          {tiers.length < TIER_ORDER.length && (
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<Plus size={14} />}
              onClick={() => onAddMissingTiers(TIER_ORDER.filter((t) => !tiers.includes(t)))}
            >
              Add missing tiers ({TIER_ORDER.filter((t) => !tiers.includes(t)).join(', ')})
            </Button>
          )}
          {!hasTodo && (
            <Tooltip label="A playlist for songs you haven't given a tier yet" withArrow>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                leftSection={<ListTodo size={14} />}
                onClick={() => onAddMissingTiers([TODO_TIER])}
              >
                Add a TODO list
              </Button>
            </Tooltip>
          )}
        </Group>
      )}

      {!anyLoading && hasVideos && (
        <Text fz="xs" c="dimmed" mt="sm" ta="center">
          Drag tiles between tiers (or onto the rail) · click a tile to play · click a tier to see all of it · Ctrl+Z undoes
        </Text>
      )}
      </Box>

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
            width: 'min(440px, calc(100vw - 32px))',
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
            <Group gap={4} visibleFrom="sm" wrap="nowrap">
              <Kbd size="xs">↵</Kbd>
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
