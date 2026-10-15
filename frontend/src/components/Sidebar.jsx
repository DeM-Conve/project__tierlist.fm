import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  ActionIcon,
  CloseButton,
  Group,
  Indicator,
  Skeleton,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Home, Keyboard, LayoutList, ListMusic, ListPlus, LogOut, Search, Settings, Swords } from 'lucide-react';
import { BOARD_TIERS, TIER_ORDER } from '../tiers';
import { boardPath, duelPath, useBoardContextMenu } from '../boardMenu';
import { TierChip } from './TierBits';
import { exampleTitle } from '../naming';
import { useDispatch, useSelector } from 'react-redux';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { selectActivityOrder, setActivityOrder } from '../store/appearanceSlice';
import { selectNaming } from '../store/selectors';
import { SHELL_Y, SIDEBAR_X } from '../layout/spacing';
import { useBoardDropOpen } from '../layout/useBoardDropOpen';
import { useTimeout } from '@mantine/hooks';
import { usePrefetchBoard } from '../api/queries';

const TOGGLE_KEYS = 'Ctrl+Shift+E · Ctrl+B';
// A row's inline action sits over the end of the row, where its count is
// (NavLink's own right padding is spacing sm).
const SIDEBAR_ROW_ACTION_RIGHT = 'var(--mantine-spacing-2xs)';

// A row of a list on the window chrome, VS Code's way: the full ink, a
// neutral chrome-toned selection (list.inactiveSelectionBackground) rather
// than an accent fill, a slightly darker hover (App.css .chrome-row) and the
// counts muted.
const CHROME_ROW = {
  className: 'chrome-row',
  vars: () => ({ root: { '--nl-bg': 'var(--chrome-selected)', '--nl-hover': 'var(--chrome-selected)', '--nl-color': 'var(--text)' } }),
  styles: { root: { borderRadius: 'var(--mantine-radius-sm)' } },
};
const MUTED = 'var(--chrome-fg-muted)';
// How long the pointer rests on a board before its playlists start loading.
const PREFETCH_DELAY_MS = 150;

// Each board shows its song total straight from the playlists' own item
// counts - no per-board fetch needed just to draw the sidebar.
function boardCounts(tiers) {
  return Object.fromEntries(TIER_ORDER.filter((t) => tiers[t]).map((t) => [t, tiers[t].itemCount ?? 0]));
}

// One board in the list. A song dragged over it opens the board after a
// moment, to be dropped on one of its tiers (useBoardDropOpen). Like a VS
// Code tree row, it has an inline action - Duel - that takes the place of
// its count on hover / keyboard focus (App.css .board-row), and a
// right-click menu (boardMenu.jsx).
function BoardLink({ category, tiers, active }) {
  const counts = boardCounts(tiers);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const { hovering, handlers } = useBoardDropOpen(category);
  const boardMenu = useBoardContextMenu();
  // The pointer resting on the row (not just passing over it) or keyboard
  // focus: start loading the board, so opening it is instant.
  const prefetchBoard = usePrefetchBoard();
  const prefetchSoon = useTimeout(() => prefetchBoard(tiers), PREFETCH_DELAY_MS);
  return (
    // The drag handlers sit on the whole row, so a song dragged over the
    // inline action still counts as over the board.
    <Box pos="relative" className="board-row" {...handlers} onContextMenu={boardMenu(category, tiers)}>
      <NavLink
        component={Link}
        to={boardPath(category)}
        {...CHROME_ROW}
        // A song dragged over it: the accent fill, so the drop target is loud.
        variant={hovering ? 'filled' : undefined}
        vars={hovering ? undefined : CHROME_ROW.vars}
        // Compact rows so a typical library's boards all fit without
        // the list scrolling.
        py="4xs"
        active={active || hovering}
        data-drop-target={hovering || undefined}
        onMouseEnter={prefetchSoon.start}
        onMouseLeave={prefetchSoon.clear}
        onFocus={() => prefetchBoard(tiers)}
        label={
          <Group justify="space-between" wrap="nowrap" gap="3xs">
            <Text fz="lg" truncate="end">
              {category}
            </Text>
            <Text className="board-row-meta" fz="md" c={hovering ? undefined : MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {total}
            </Text>
          </Group>
        }
      />
      <Tooltip label="Duel" position="right" withArrow openDelay={300}>
        <ActionIcon
          component={Link}
          to={duelPath(category)}
          className="board-row-action"
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Duel ${category}`}
          pos="absolute"
          right={SIDEBAR_ROW_ACTION_RIGHT}
          top="50%"
          // Vertical centring on the row (geometry, not spacing).
          style={{ transform: 'translateY(-50%)' }}
        >
          <Swords size={14} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

// One board in the Duels view: the whole row goes to its duel hub. Its meta
// is what's cheap and already loaded: its ranked total (playlist item counts) -
// the songs duels work on; to-do songs are never part of duels.
function DuelBoardLink({ category, tiers, active }) {
  const boardMenu = useBoardContextMenu();
  const ranked = Object.values(boardCounts(tiers)).reduce((a, b) => a + b, 0);
  return (
    <NavLink
      component={Link}
      to={duelPath(category)}
      {...CHROME_ROW}
      py="4xs"
      active={active}
      onContextMenu={boardMenu(category, tiers)}
      leftSection={<Swords size={14} color="currentColor" style={{ color: MUTED }} />}
      label={
        <Group justify="space-between" wrap="nowrap" gap="3xs">
          <Text fz="lg" truncate="end">
            {category}
          </Text>
          <Text fz="md" c={MUTED} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {ranked}
          </Text>
        </Group>
      }
    />
  );
}

const tierPath = (category, tier) => `/tier/${encodeURIComponent(category)}/t/${tier}`;

// One tier playlist: its tier, its YouTube title and song count; opens
// that tier's page.
function PlaylistLink({ category, tier, playlist, active }) {
  return (
    <NavLink
      component={Link}
      to={tierPath(category, tier)}
      {...CHROME_ROW}
      py="4xs"
      pl="xs"
      active={active}
      // Fixed chip column so every title starts at the same x (TODO's chip
      // is wider than T1's).
      leftSection={
        <Box w={44} style={{ display: 'flex' }}>
          <TierChip tier={tier} size={20} />
        </Box>
      }
      label={
        <Group justify="space-between" wrap="nowrap" gap="2xs">
          <Text fz="lg" truncate="end" title={playlist.title}>
            {playlist.title}
          </Text>
          <Text fz="md" c={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {playlist.itemCount ?? 0}
          </Text>
        </Group>
      }
    />
  );
}

const VIEW_TITLES = { boards: 'Tier lists', playlists: 'Playlists', duels: 'Duels' };

const ACTIVITY_SIZE = 42;
// VS Code's codicons are 24px line icons; lucide's default stroke reads
// heavier than theirs at that size.
const ICON = { size: 26, strokeWidth: 1.6 };

// One activity-bar icon, labelled (with its key) on hover - VS Code's
// activity bar: a 48px square per item, the icon muted on the chrome and the
// full ink on hover (App.css .activity-icon); `marked` (the open view) gets
// the full ink and the accent bar on the strip's left edge.
function ActivityIcon({ label, keys, marked, children, ...props }) {
  return (
    <Tooltip label={keys ? `${label} (${keys})` : label} position="right" withArrow>
      <ActionIcon
        variant="transparent"
        size={ACTIVITY_SIZE}
        radius="md"
        className="activity-icon"
        aria-label={label}
        data-active={marked || undefined}
        // The open view: a rounded square in the page's color, as in VS Code.
        bg={marked ? 'var(--editor)' : undefined}
        {...props}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

// The permanent icon strip, like VS Code's activity bar. "Tier lists",
// "Playlists" and "Duels" open / close their view in the panel beside it
// (Ctrl+B toggles the panel); the rest go places.
export function ActivityBar({ openView, onShowView, onOpenPalette, waitingCount, onSelectSettings, onOpenShortcuts, onLogout }) {
  const dispatch = useDispatch();
  const order = useSelector(selectActivityOrder);
  // The top group, by id (activityOrder.js) - drawn in the account's saved
  // order; the bottom group stays fixed, as in VS Code.
  const items = {
    home: (
      <ActivityIcon label="Home" keys="g h" component={Link} to="/">
        <Home {...ICON} />
      </ActivityIcon>
    ),
    jump: (
      <ActivityIcon label="Jump to…" keys="o / ⌘K" onClick={onOpenPalette}>
        <Search {...ICON} />
      </ActivityIcon>
    ),
    boards: (
      <ActivityIcon label="Tier lists" keys={TOGGLE_KEYS} marked={openView === 'boards'} aria-pressed={openView === 'boards'} onClick={() => onShowView('boards')}>
        <LayoutList {...ICON} />
      </ActivityIcon>
    ),
    playlists: (
      <ActivityIcon label="Playlists" keys="Ctrl+Shift+F" marked={openView === 'playlists'} aria-pressed={openView === 'playlists'} onClick={() => onShowView('playlists')}>
        <ListMusic {...ICON} />
      </ActivityIcon>
    ),
    duels: (
      <ActivityIcon label="Duels" keys="Ctrl+Shift+D" marked={openView === 'duels'} aria-pressed={openView === 'duels'} onClick={() => onShowView('duels')}>
        <Swords {...ICON} />
      </ActivityIcon>
    ),
    addSongs: (
      <Indicator label={waitingCount} size={16} disabled={!waitingCount} offset={12}>
        <ActivityIcon label="Add songs" keys="a" component={Link} to="/add" state={{ focusInput: true }}>
          <ListPlus {...ICON} />
        </ActivityIcon>
      </Indicator>
    ),
  };

  // Drag an icon to reorder the top group (@hello-pangea/dnd); the order is
  // saved to the account with the other settings.
  function onDragEnd({ source, destination }) {
    if (!destination || destination.index === source.index) return;
    const next = [...order];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    dispatch(setActivityOrder(next));
  }

  return (
    <Stack component="nav" aria-label="Activity bar" gap="3xs" align="center" px="2xs" py="3xs">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="activity-bar">
          {(drop) => (
            <Stack ref={drop.innerRef} {...drop.droppableProps} gap="3xs" align="center">
              {order.map((id, i) => (
                <Draggable key={id} draggableId={id} index={i}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} data-activity-item={id}>
                      {items[id]}
                    </div>
                  )}
                </Draggable>
              ))}
              {drop.placeholder}
            </Stack>
          )}
        </Droppable>
      </DragDropContext>
      <Box style={{ flex: 1 }} />
      <ActivityIcon label="Keyboard shortcuts" keys="?" onClick={onOpenShortcuts}>
        <Keyboard {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Settings" keys="g s / Ctrl+," onClick={onSelectSettings}>
        <Settings {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Log out" onClick={onLogout}>
        <LogOut {...ICON} />
      </ActivityIcon>
    </Stack>
  );
}

// The side panel: the open view (Tier lists, Playlists or Duels), its
// filter and its list. On desktop it lives in App's resizable panel group; on a phone,
// in the drawer beside the activity bar.
export function SidebarPanel({ query, onQueryChange, tierCategories, tierGroups, playlistCount, loading, view = 'boards' }) {
  const naming = useSelector(selectNaming);
  const location = useLocation();
  const q = query.trim().toLowerCase();
  const filteredCategories = tierCategories.filter((c) => c.toLowerCase().includes(q));
  const isPlaylists = view === 'playlists';
  const isDuels = view === 'duels';
  // Every tier playlist (template-matching only - see selectTierPlaylists),
  // grouped under its board like a file tree, best tier first. The filter
  // matches a playlist's title or its board.
  const playlistGroups = isPlaylists
    ? tierCategories
        .map((c) => [
          c,
          BOARD_TIERS.filter((t) => tierGroups[c]?.[t])
            .map((t) => ({ tier: t, playlist: tierGroups[c][t] }))
            .filter((p) => c.toLowerCase().includes(q) || p.playlist.title.toLowerCase().includes(q)),
        ])
        .filter(([, rows]) => rows.length)
    : [];
  const playlists = playlistGroups.flatMap(([, rows]) => rows);

  return (
    <Stack h="100%" gap={0} px={SIDEBAR_X} py={SHELL_Y} miw={0}>
      <Group justify="space-between" px="2xs" mb="xs" wrap="nowrap">
        {/* VS Code's side bar title: small caps-style, the secondary ink. */}
        <Text fz="lg" fw={700} c="var(--text)">
          {VIEW_TITLES[view] ?? VIEW_TITLES.boards}
        </Text>
        {loading ? (
          <Skeleton h={10} w={14} />
        ) : (
          <Text fz="md" c={MUTED}>
            {isPlaylists ? playlistCount : tierCategories.length}
          </Text>
        )}
      </Group>
      <TextInput
        placeholder={isPlaylists ? 'Filter playlists…' : 'Filter boards…'}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        leftSection={<Search size={13} />}
        rightSection={query ? <CloseButton size="sm" onClick={() => onQueryChange('')} aria-label="Clear filter" /> : null}
        size="sm"
        mb="xs"
        radius="sm"
        // VS Code's input on the side bar: a step lighter than the chrome
        // in dark themes, the page color in light ones.
        styles={{ input: { background: 'var(--chrome-input)', borderColor: 'var(--chrome-input-border)' } }}
      />

      <ScrollArea style={{ flex: 1 }} type="hover" offsetScrollbars>
        <Stack gap={0}>
          {isPlaylists &&
            playlistGroups.map(([category, rows]) => (
              <Box key={category} mb="3xs">
                <Text fz="md" fw={600} c={MUTED} px="xs" pt="3xs" pb="5xs" truncate="end">
                  {category}
                </Text>
                {rows.map(({ tier, playlist }) => (
                  <PlaylistLink
                    key={playlist.id}
                    category={category}
                    tier={tier}
                    playlist={playlist}
                    active={location.pathname === tierPath(category, tier)}
                  />
                ))}
              </Box>
            ))}
          {isPlaylists && !loading && tierCategories.length > 0 && playlists.length === 0 && (
            <Text size="sm" c="dimmed" px="2xs">
              No playlists match
            </Text>
          )}
          {!isPlaylists && tierCategories.length > 0 && filteredCategories.length === 0 && (
            <Text size="sm" c="dimmed" px="2xs">
              No boards match
            </Text>
          )}
          {/* Duels: every board, one click from its duel hub. */}
          {isDuels &&
            filteredCategories.map((category) => (
              <DuelBoardLink
                key={category}
                category={category}
                tiers={tierGroups[category] || {}}
                active={location.pathname === duelPath(category) || location.pathname.startsWith(`${duelPath(category)}/`)}
              />
            ))}
          {!isPlaylists && !isDuels && filteredCategories.map((category) => (
            <BoardLink
              key={category}
              category={category}
              tiers={tierGroups[category] || {}}
              active={
                location.pathname === `/tier/${encodeURIComponent(category)}` ||
                location.pathname.startsWith(`/tier/${encodeURIComponent(category)}/`)
              }
            />
          ))}
          {/* Until playlists arrive we don't know the boards yet - placeholders,
              not "0 boards" and the naming-convention hint. */}
          {loading &&
            Array.from({ length: 7 }).map((_, i) => (
              <Stack key={i} gap="3xs" px="sm" py="2xs">
                <Skeleton h={10} w={`${55 + ((i * 17) % 35)}%`} />
              </Stack>
            ))}
          {!loading && tierCategories.length === 0 && (
            <Text size="xs" c="dimmed" px="2xs">
              Name playlists like &quot;{exampleTitle(naming, 'Rap', TIER_ORDER[0])}&quot; … &quot;
              {exampleTitle(naming, 'Rap', TIER_ORDER[TIER_ORDER.length - 1])}&quot; and they&apos;ll appear here as a tier
              list.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

// The activity bar (always), plus - on a phone, where it's a drawer - the
// panel. On desktop App puts the panel in a resizable group beside it.
export default function Sidebar({
  waitingCount,
  onSelectSettings,
  onOpenShortcuts,
  onLogout,
  onOpenPalette,
  mobileOpen,
  onCloseMobile,
  collapsed,
  view = 'boards',
  onShowView,
  withPanel = false,
  ...panelProps
}) {
  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <Box component="aside" className={`sidebar${mobileOpen ? ' sidebar-open' : ''}${collapsed ? ' sidebar-alone' : ''}`}>
        <ActivityBar
          openView={collapsed ? null : view}
          onShowView={onShowView}
          onOpenPalette={onOpenPalette}
          waitingCount={waitingCount}
          onSelectSettings={onSelectSettings}
          onOpenShortcuts={onOpenShortcuts}
          onLogout={onLogout}
        />
        {withPanel && !collapsed && (
          <Box w={280}>
            <SidebarPanel view={view} {...panelProps} />
          </Box>
        )}
      </Box>
    </>
  );
}
