import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tierName } from '../tierLabels';
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
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useElementSize, useMediaQuery } from '@mantine/hooks';
import { useHotkeys } from 'react-hotkeys-hook';
import { ChevronDown, ChevronUp, ListTodo, Play, Plus, Search, Shuffle, Swords } from 'lucide-react';
import { BOARD_TIERS, TIER_COLORS, TIER_ORDER, TODO_TIER } from '../tiers';
import { moveWithFeedback, useTierDnd } from '../tierActions';
import { selectPlayerCoversPage, selectStagedChanges } from '../store/selectors';
import { TierMixBar, TierTile } from './TierBits';
import BoardNameEditor from './BoardNameEditor';
import { TIER_INK, flowDropBar, indexForPointInFlow, tierDropIndex, videoMatches } from '../tierUtils';
import { isSequenceKey } from '../keyboard/sequence';
import { shortcutKey } from '../shortcuts';
import { useCanvas } from '../layout/canvas';
import { SECTION_GAP, SHELL_Y, spacingPx } from '../layout/spacing';
import { GAP, GAP_KEY, INSET_KEY, TODO_GAP_KEY, allocateLines, fitBoard, tilesPerLine } from '../layout/boardFit';
import PageHeader from './PageHeader';

// The header buttons' keys, from shortcuts.js (the "?" list reads the same).
const KEY_FIND = shortcutKey('search');
const KEY_DUEL = shortcutKey('board-duel');
const KEY_PLAY = shortcutKey('board-play');
const KEY_SHUFFLE = shortcutKey('board-shuffle');

// The insertion bar of a drag over a row: absolutely placed in the gap
// beside a tile (tierUtils.flowDropBar), so it never shifts the tiles.
function DropIndicator({ bar }) {
  return (
    <Box
      data-testid="drop-indicator"
      pos="absolute"
      w={3}
      bg="accent"
      style={{ left: bar.left - 1.5, top: bar.top, height: bar.height, borderRadius: 2, pointerEvents: 'none' }}
    />
  );
}

// One tier row. Shows `lines` lines of tiles (the board sizes that so every
// row together fills the screen) and folds the rest into a "+N" tile - so
// the whole board fits on one screen, however big a tier gets. The chevron
// column on the right expands the row in place to every song (and folds it
// back); "+N" and the tier label open the tier's list page.
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
  // { index, bar } of the slot under a drag, or null. Kept in a ref too:
  // dragover fires every few ms, and only a new slot may re-render the row.
  const [over, setOver] = useState(null);
  const overRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const isOver = dnd.dragOverTier === tier;
  const color = TIER_COLORS[tier];
  const isTodo = tier === TODO_TIER;
  const playLabel = isTodo ? 'Triage: play and rate one by one' : `Play ${tierName(tier)}`;

  // Stable drag handlers for the memoized tiles (TierTile): a drag start or
  // a hover over another row must not redraw every tile on the board.
  const latestDnd = useRef(dnd);
  useLayoutEffect(() => {
    latestDnd.current = dnd;
  });
  const handleDragStart = useCallback((e, video, fromTier) => latestDnd.current.onDragStart(e, video, fromTier), []);
  const handleDragEnd = useCallback((e) => latestDnd.current.onDragEnd(e), []);

  const shown = searchActive ? items?.filter((v) => matchedKeys.has(`${tier}:${v.videoId}`)) : items;
  const total = shown?.length ?? 0;
  const perLine = tilesPerLine(width, size);
  const fit = perLine * lines;
  // While searching, show every match (wrapping) so n/N can always reach it.
  const overflows = !searchActive && total > fit;
  const truncated = overflows && !expanded;
  // The playing song is never folded away behind "+N": if it's past the
  // fold it takes the last visible slot, so it can be seen and dragged (to
  // another tier, or the rail's Remove) from the board too.
  const playingAt = truncated ? shown.findIndex((v) => v.videoId === playingVideoId) : -1;
  const visible = !truncated
    ? shown || []
    : playingAt >= fit - 1 && fit >= 2
      ? [...shown.slice(0, fit - 2), shown[playingAt]]
      : shown.slice(0, fit - 1);
  const hiddenCount = total - visible.length;

  // The slot under the pointer among the tiles shown (null on "+N": append).
  function slotAt(e) {
    if (e.target.closest?.('[data-more]')) return null;
    return indexForPointInFlow(contentRef.current, e.clientX, e.clientY);
  }
  function showSlot(e) {
    // dragover repeats every few ms while the pointer rests: same point,
    // same slot - skip re-reading every tile's position.
    const prev = overRef.current;
    if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
    const index = slotAt(e);
    const bar = index == null ? null : flowDropBar(contentRef.current, index, e.clientY, GAP);
    const same = prev && prev.index === index && prev.bar?.left === bar?.left && prev.bar?.top === bar?.top;
    overRef.current = { index, bar, x: e.clientX, y: e.clientY };
    if (!same) setOver(overRef.current);
  }
  function clearSlot() {
    overRef.current = null;
    setOver(null);
  }

  return (
    <Box
      onDragOver={(e) => {
        dnd.onDragOver(e, tier);
        showSlot(e);
      }}
      onDragLeave={(e) => {
        dnd.onDragLeave(e, tier);
        if (!e.currentTarget.contains(e.relatedTarget)) clearSlot();
      }}
      onDrop={(e) => {
        // The slot among the shown tiles, as a position in the whole tier
        // (only matches show while searching; see tierDropIndex).
        const idx = tierDropIndex(items || [], visible, slotAt(e));
        clearSlot();
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
      <UnstyledButton
        onClick={() => onOpenTier(tier)}
        w={size < 64 ? 48 : 60}
        bg={color}
        aria-label={`Open ${tierName(tier)}`}
        className="tier-label-btn"
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--mantine-spacing-5xs)',
          padding: 'var(--mantine-spacing-3xs) 0',
        }}
      >
        <Text ff="var(--font-display)" fw={900} fz={isTodo ? (size < 64 ? 'sm' : 'lg') : size < 64 ? 'xl' : '2xl'} lh={1} c={TIER_INK}>
          {tierName(tier)}
        </Text>
        {!loading && (
          <Text fz="xs" fw={700} c={TIER_INK} opacity={0.7} lh={1.2}>
            {searchActive ? `${total}/${items?.length ?? 0}` : items?.length ?? 0}
          </Text>
        )}
        {!loading && items?.length > 0 && (
          <Group gap={0} mt="5xs" wrap="nowrap">
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
            <Tooltip label={`Shuffle ${tierName(tier)}`} withArrow>
              <ActionIcon
                component="span"
                variant="transparent"
                size="sm"
                style={{ color: TIER_INK }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShuffle(tier);
                }}
                aria-label={`Shuffle ${tierName(tier)}`}
              >
                <Shuffle size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </UnstyledButton>

      <Box ref={sizeRef} style={{ flex: 1, minWidth: 0 }} p={INSET_KEY}>
        <Group ref={contentRef} pos="relative" gap={GAP_KEY} wrap={searchActive || expanded || lines > 1 ? 'wrap' : 'nowrap'} mih={size} p={INSET_KEY} style={{ overflow: 'hidden' }}>
          {loading &&
            Array.from({ length: perLine }).map((_, i) => <Skeleton key={i} w={size} h={size} radius={6} style={{ flexShrink: 0 }} />)}
          {!loading && total === 0 && (
            // A tile's size, so the row is as tall empty as with songs: the
            // first song dropped in (or the last dragged out) moves nothing.
            <Box
              h={size}
              miw={size}
              px="md"
              style={{
                border: `1px dashed ${isOver ? color : 'var(--border)'}`,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Text fz="xs" c="dimmed">
                {searchActive
                  ? 'No matches in this tier'
                  : isTodo
                    ? 'Nothing to do - drop songs here to rate them later'
                    : 'Empty - drop videos here'}
              </Text>
            </Box>
          )}
          {!loading &&
            visible.map((v) => {
              const key = `${tier}:${v.videoId}`;
              return (
                <TierTile
                  key={v.videoId}
                  video={v}
                  tier={tier}
                  tiers={tiers}
                  size={size}
                  isDragging={dnd.draggedVideoId === v.videoId}
                  isPlaying={playingVideoId === v.videoId}
                  isPendingRemoval={pendingRemovalKeys.has(key)}
                  searchState={activeMatchKey === key ? 'active' : searchActive ? 'match' : null}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onPlay={onPlay}
                  onMove={onMove}
                />
              );
            })}
          {!loading && isOver && over?.bar && <DropIndicator bar={over.bar} />}
          {!loading && hiddenCount > 0 && (
            <UnstyledButton
              data-more
              w={size}
              h={size}
              onClick={() => onOpenTier(tier)}
              aria-label={`Show all ${items.length} in ${tierName(tier)}`}
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
              <Text ff="var(--font-display)" fw={900} fz={size < 64 ? 'lg' : 'xl'} lh={1} c={`color-mix(in srgb, ${color} 60%, var(--text))`}>
                +{hiddenCount}
              </Text>
              <Text fz="2xs" c="dimmed" mt="4xs">
                show all
              </Text>
            </UnstyledButton>
          )}
        </Group>
      </Box>

      {/* Right column: the row's expand / collapse toggle - the same spot in
          every row; the icon sits level with the first line of tiles and
          stays pinned while scrolling a long, expanded tier. */}
      <Tooltip
        label={!overflows ? `All ${total} shown` : expanded ? `Show less of ${tierName(tier)}` : `Expand ${tierName(tier)} - show all ${total} here`}
        withArrow
        position="left"
      >
        <UnstyledButton
          onClick={() => setExpanded((e) => !e)}
          disabled={!overflows}
          px="3xs"
          aria-label={expanded ? `Show less of ${tierName(tier)}` : `Expand ${tierName(tier)}`}
          aria-expanded={overflows ? expanded : undefined}
          className="row-open-btn"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            borderLeft: '1px solid var(--border-soft)',
            flexShrink: 0,
            cursor: overflows ? 'pointer' : 'default',
            background: overflows && expanded ? `color-mix(in srgb, ${color} 10%, var(--surface))` : undefined,
          }}
        >
          <Box
            h={size}
            mt={GAP_KEY}
            style={{ position: 'sticky', top: 0, display: 'grid', placeItems: 'center', opacity: overflows ? 1 : 0.3 }}
          >
            {expanded && overflows ? (
              <ChevronUp size={16} color={`color-mix(in srgb, ${color} 60%, var(--text))`} />
            ) : (
              <ChevronDown size={16} color="var(--text-dim)" />
            )}
          </Box>
        </UnstyledButton>
      </Tooltip>
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
  onRenameBoard,
}) {
  const dispatch = useDispatch();
  const isNarrow = useMediaQuery('(max-width: 62em)');
  const baseTileSize = isNarrow ? 64 : 88; // square; big enough to print the song name on

  // `tiers` = the ranked rows; `boardTiers` adds the TODO list when the
  // board has one (it's a move target everywhere, but not ranked/counted).
  const tiers = TIER_ORDER.filter((t) => tierGroups[category]?.[t]);
  const hasTodo = !!tierGroups[category]?.[TODO_TIER];
  // Keyed by content (a fresh array every render would defeat the tiles' memo).
  const boardTiersKey = BOARD_TIERS.filter((t) => tierGroups[category]?.[t]).join(',');
  const boardTiers = useMemo(() => (boardTiersKey ? boardTiersKey.split(',') : []), [boardTiersKey]);
  const anyLoading = boardLoading || boardTiers.some((t) => tierLoading[t]);
  // Before the playlists list itself has loaded we don't even know which
  // tiers this board has - show a neutral placeholder board, not "0 tiers".
  const unknownTiers = tiers.length === 0 && anyLoading;
  // ...but still draw it as the real rows (loading), so the board doesn't
  // jump when the tiers become known: a full ladder until then.
  const shownTiers = unknownTiers ? TIER_ORDER : tiers;
  const counts = Object.fromEntries(tiers.map((t) => [t, tierItems[t]?.length ?? 0]));
  const total = tiers.reduce((sum, t) => sum + counts[t], 0);
  const todoCount = tierItems[TODO_TIER]?.length ?? 0;
  const hasVideos = total + todoCount > 0;
  const pendingRemovalKeys = useMemo(
    () => new Set(pendingMoves.filter((m) => m.kind === 'dedupe' && m.tier !== m.keptTier).map((m) => `${m.tier}:${m.video.videoId}`)),
    [pendingMoves]
  );

  // Fit the board to the screen: measure what's left of the viewport under
  // the header (and above the mini player / footer), turn it into tile
  // lines, and share them out between the rows (allocateLines). Only a
  // board too big for even one line per tier scrolls.
  const { ref: canvasRef, height: viewportHeight } = useCanvas();
  // (Its size is state: a header that rewraps re-renders the board, and the
  // rows' offset below is re-measured.)
  const { ref: headerRef } = useElementSize();
  const { ref: footerRef, height: footerHeight } = useElementSize();
  const rowsRef = useRef(null);
  const [rowsTop, setRowsTop] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  // Re-measured after every render, not only when the header resizes:
  // something above the board (the "couldn't refresh" notice) can push the
  // rows down, and a stale offset cut the last row off. Setting the same
  // (rounded) value doesn't re-render, so this settles at once.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = rowsRef.current;
    const canvas = canvasRef.current;
    if (el && canvas) setRowsTop(Math.round(el.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop));
  });

  // Staged removals aren't a row: they live on the rail's Remove slot and in
  // the staged-changes review (Put back).
  const rowTiers = [...tiers, ...(hasTodo ? [TODO_TIER] : [])];
  const stagedCount = useSelector(selectStagedChanges).length;
  // Room to scroll the last row clear of the floating staged-changes bar -
  // padding only; it never changes the tile size (layout/boardFit.js).
  const pendingPad = stagedCount > 0 ? '5xl' : 0;
  const { tileSize, perLine, lineBudget } = fitBoard({
    viewportHeight,
    rowsTop,
    footerHeight,
    bottomPad: spacingPx(SHELL_Y),
    hasTodo,
    rowCount: unknownTiers ? shownTiers.length : rowTiers.length,
    rowWidth,
    baseTileSize,
  });
  const rowLines = useMemo(() => {
    const allocated = allocateLines(
      rowTiers.map((t) => tierItems[t]?.length ?? 0),
      perLine,
      lineBudget
    );
    return Object.fromEntries(rowTiers.map((t, i) => [t, allocated[i]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowTiers.join(), tierItems, perLine, lineBudget, rowWidth, viewportHeight]);

  // Stable for the memoized tiles: the page hands a new onPlay every render.
  const move = useCallback(
    (fromTier, toTier, videoId, dropIndex) => dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }])),
    [dispatch]
  );
  const latestPlay = useRef(onPlay);
  useLayoutEffect(() => {
    latestPlay.current = onPlay;
  });
  const playTile = useCallback((tier, videoId) => latestPlay.current(tier, videoId), []);

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

  // Deferred: on a big board a short query (the first letter) matches and
  // wraps hundreds of tiles - the box keeps up with typing, the rows follow.
  const queryText = useDeferredValue(searchQuery.slice(1));
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

  // The header buttons' own keys (react-hotkeys-hook, like the tier page's
  // "/": ignored in text fields, exact modifiers - so Shift+P stays push and
  // Ctrl+D half a page). Only while this board is mounted, not under the
  // full-screen player, and never the second key of a Vim sequence (gd, gs,
  // gp are navigation).
  const headerKey = (run) => (e) => {
    if (isSequenceKey(e) || e.repeat) return;
    e.preventDefault();
    run();
  };
  const headerKeyOptions = { enabled: hasVideos && !playerCoversPage };
  useHotkeys(KEY_DUEL, headerKey(() => onStartDuel()), headerKeyOptions, [onStartDuel]);
  useHotkeys(KEY_PLAY, headerKey(() => onPlayFrom(null)), headerKeyOptions, [onPlayFrom]);
  useHotkeys(KEY_SHUFFLE, headerKey(() => onShufflePlay()), headerKeyOptions, [onShufflePlay]);

  const matchedKeys = useMemo(() => new Set(matches.map((e) => `${e.tier}:${e.video.videoId}`)), [matches]);
  const activeMatch = matches.length > 0 ? matches[matchIndex % matches.length] : null;
  const activeMatchKey = activeMatch ? `${activeMatch.tier}:${activeMatch.video.videoId}` : null;
  const searchActive = queryText.trim().length > 0;

  return (
    <Box component="section" pb={pendingPad}>
      <Stack ref={headerRef} gap={SECTION_GAP} mb={SECTION_GAP}>
      <PageHeader
        title={<BoardNameEditor key={category} category={category} onRenamed={onRenameBoard} />}
        meta={anyLoading ? 'Loading videos…' : `${total} videos · ${tiers.length} tiers${hasTodo ? ` · ${todoCount} to do` : ''}`}
        actions={<>
          <Tooltip label="Search this board" withArrow>
            <Button
              variant="default"
              leftSection={<Search size={15} />}
              rightSection={<Kbd size="xs">{KEY_FIND}</Kbd>}
              aria-keyshortcuts={KEY_FIND}
              onClick={openSearch}
              disabled={!hasVideos}
            >
              Find
            </Button>
          </Tooltip>
          <Tooltip label="Pick the better of two until it's ranked" withArrow>
            <Button
              variant="default"
              leftSection={<Swords size={15} />}
              rightSection={<Kbd size="xs">{KEY_DUEL}</Kbd>}
              aria-keyshortcuts={KEY_DUEL}
              onClick={onStartDuel}
              disabled={!hasVideos}
            >
              Duel
            </Button>
          </Tooltip>
          <Button.Group>
            <Button
              leftSection={<Play size={15} fill="currentColor" />}
              rightSection={<Kbd size="xs">{KEY_PLAY}</Kbd>}
              aria-keyshortcuts={KEY_PLAY}
              onClick={() => onPlayFrom(null)}
              disabled={!hasVideos}
            >
              Play
            </Button>
            <Tooltip label="Shuffle the whole board" withArrow>
              <Button
                px="sm"
                rightSection={<Kbd size="xs">{KEY_SHUFFLE}</Kbd>}
                aria-keyshortcuts={KEY_SHUFFLE}
                onClick={() => onShufflePlay()}
                disabled={!hasVideos}
                aria-label="Shuffle play"
                style={{ borderLeft: '1px solid color-mix(in srgb, var(--accent-on) 25%, transparent)' }}
              >
                <Shuffle size={15} />
              </Button>
            </Tooltip>
          </Button.Group>
        </>}
      />

      {/* Shown (empty) while loading too, so the rows below don't drop when it fills. */}
      {(hasVideos || anyLoading) && (
        <TierMixBar tiers={tiers} counts={counts} size={18} labels onSegmentClick={onOpenTier} />
      )}
      </Stack>

      <Box ref={rowsRef}>

      <Paper withBorder radius="md" style={{ overflow: 'clip', borderTop: 'none' }} bg="var(--surface)">
        {shownTiers.map((t) => (
          <TierRow
            key={`${category}:${t}`}
            tier={t}
            tiers={boardTiers}
            items={tierItems[t]}
            loading={unknownTiers || tierLoading[t]}
            size={tileSize}
            lines={rowLines[t]}
            onMeasure={setRowWidth}
            searchActive={searchActive}
            matchedKeys={matchedKeys}
            activeMatchKey={activeMatchKey}
            playingVideoId={playingVideoId}
            pendingRemovalKeys={pendingRemovalKeys}
            onPlay={playTile}
            onPlayFrom={onPlayFrom}
            onShuffle={onShufflePlay}
            onOpenTier={onOpenTier}
            onMove={move}
          />
        ))}
      </Paper>
      {/* The TODO list sits under the ranked tiers: songs waiting to be
          rated, not a tier above S. */}
      {hasTodo && !unknownTiers && (
        <Paper withBorder radius="md" mt={TODO_GAP_KEY} style={{ overflow: 'clip', borderTop: 'none' }} bg="var(--surface)">
          <TierRow
            key={`${category}:${TODO_TIER}`}
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
            onPlay={playTile}
            onPlayFrom={onPlayFrom}
            onShuffle={onShufflePlay}
            onOpenTier={onOpenTier}
            onMove={move}
          />
        </Paper>
      )}

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
              Add missing tiers ({TIER_ORDER.filter((t) => !tiers.includes(t)).map(tierName).join(', ')})
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
                Add a {tierName(TODO_TIER)} list
              </Button>
            </Tooltip>
          )}
        </Group>
      )}

      </Box>

      {searchOpen && (
        <Paper
          withBorder
          radius="md"
          shadow="xl"
          p="3xs"
          className="anim-rise"
          bg="var(--surface-2)"
          style={{
            position: 'fixed',
            top: 'var(--mantine-spacing-md)',
            left: '50%',
            translate: '-50% 0',
            zIndex: 60,
            width: 'min(440px, calc(100vw - 2 * var(--mantine-spacing-md)))',
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
            <Group gap="4xs" visibleFrom="sm" wrap="nowrap">
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
