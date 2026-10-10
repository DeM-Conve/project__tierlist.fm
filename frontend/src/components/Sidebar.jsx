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
import { Home, Keyboard, LayoutList, ListMusic, ListPlus, LogOut, Search, Settings } from 'lucide-react';
import { BOARD_TIERS, TIER_ORDER } from '../tiers';
import { TierChip } from './TierBits';
import { exampleTitle } from '../naming';
import { useSelector } from 'react-redux';
import { selectNaming } from '../store/selectors';
import { SHELL_Y, SIDEBAR_X } from '../layout/spacing';
import { useBoardDropOpen } from '../layout/useBoardDropOpen';

const TOGGLE_KEYS = 'Ctrl+B';

// Each board shows its song total straight from the playlists' own item
// counts - no per-board fetch needed just to draw the sidebar.
function boardCounts(tiers) {
  return Object.fromEntries(TIER_ORDER.filter((t) => tiers[t]).map((t) => [t, tiers[t].itemCount ?? 0]));
}

// One board in the list. A song dragged over it opens the board after a
// moment, to be dropped on one of its tiers (useBoardDropOpen).
function BoardLink({ category, tiers, active }) {
  const base = `/tier/${encodeURIComponent(category)}`;
  const counts = boardCounts(tiers);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const { hovering, handlers } = useBoardDropOpen(category);
  return (
    <NavLink
      component={Link}
      to={base}
      variant={hovering ? 'filled' : 'light'}
      // Compact rows so a typical library's boards all fit without
      // the list scrolling.
      py={4}
      active={active || hovering}
      data-drop-target={hovering || undefined}
      {...handlers}
      label={
        <Group justify="space-between" wrap="nowrap" gap={6}>
          <Text size="sm" truncate="end">
            {category}
          </Text>
          <Text size="xs" c={hovering ? undefined : 'dimmed'}>
            {total}
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
      variant="light"
      py={3}
      pl={10}
      active={active}
      // Fixed chip column so every title starts at the same x (TODO's chip
      // is wider than T1's).
      leftSection={
        <Box w={44} style={{ display: 'flex' }}>
          <TierChip tier={tier} size={20} />
        </Box>
      }
      label={
        <Group justify="space-between" wrap="nowrap" gap={8}>
          <Text size="sm" truncate="end" title={playlist.title}>
            {playlist.title}
          </Text>
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {playlist.itemCount ?? 0}
          </Text>
        </Group>
      }
    />
  );
}

// The panel's right edge: drag to resize it, double-click to reset - like
// VS Code's sidebar sash. Plain pointer events: Mantine has no resizable
// panel, and a library for one edge would be more code than this.
function ResizeEdge({ width, onResize }) {
  function start(e) {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev) => onResize(w0 + ev.clientX - x0);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }
  return (
    <Box
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the panel (double-click to reset)"
      aria-valuenow={width}
      pos="absolute"
      top={12}
      bottom={12}
      right={-6}
      w={8}
      onPointerDown={start}
      onDoubleClick={() => onResize(null)}
    />
  );
}

// One activity-bar icon, labelled (with its key) on hover. `marked` draws
// VS Code's accent bar on the left edge: the view that's open / the page
// you're on.
function ActivityIcon({ label, keys, marked, children, ...props }) {
  return (
    // The bar sits outside the button (which clips its overflow), on the
    // strip's left edge.
    <Box pos="relative">
      {marked && <Box pos="absolute" left={-6} top={6} bottom={6} w={3} bg="accent" style={{ borderRadius: 2 }} />}
      <Tooltip label={keys ? `${label} (${keys})` : label} position="right" withArrow>
        <ActionIcon
          variant={marked ? 'light' : 'subtle'}
          color={marked ? undefined : 'gray'}
          size={42}
          radius="md"
          aria-label={label}
          data-active={marked || undefined}
          {...props}
        >
          {children}
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

// The permanent icon strip, like VS Code's activity bar. "Tier lists" and
// "Playlists" open / close their view in the panel beside it (Ctrl+B
// toggles the panel); the rest go places.
function ActivityBar({ openView, onShowView, onOpenPalette, waitingCount, onSelectSettings, onOpenShortcuts, onLogout }) {
  return (
    <Stack component="nav" aria-label="Activity bar" gap={6} align="center" px={6} py={SHELL_Y}>
      <ActivityIcon label="Home" keys="g h" component={Link} to="/">
        <Home size={22} />
      </ActivityIcon>
      <ActivityIcon label="Jump to…" keys="o / ⌘K" onClick={onOpenPalette}>
        <Search size={22} />
      </ActivityIcon>
      <ActivityIcon label="Tier lists" keys={TOGGLE_KEYS} marked={openView === 'boards'} aria-pressed={openView === 'boards'} onClick={() => onShowView('boards')}>
        <LayoutList size={22} />
      </ActivityIcon>
      <ActivityIcon label="Playlists" marked={openView === 'playlists'} aria-pressed={openView === 'playlists'} onClick={() => onShowView('playlists')}>
        <ListMusic size={22} />
      </ActivityIcon>
      <Indicator label={waitingCount} size={16} disabled={!waitingCount} offset={8}>
        <ActivityIcon label="Add songs" keys="a" component={Link} to="/add" state={{ focusInput: true }}>
          <ListPlus size={22} />
        </ActivityIcon>
      </Indicator>
      <Box style={{ flex: 1 }} />
      <ActivityIcon label="Keyboard shortcuts" keys="?" onClick={onOpenShortcuts}>
        <Keyboard size={22} />
      </ActivityIcon>
      <ActivityIcon label="Settings" keys="g s" onClick={onSelectSettings}>
        <Settings size={22} />
      </ActivityIcon>
      <ActivityIcon label="Log out" onClick={onLogout}>
        <LogOut size={22} />
      </ActivityIcon>
    </Stack>
  );
}

export default function Sidebar({
  query,
  onQueryChange,
  tierCategories,
  tierGroups,
  playlistCount,
  waitingCount,
  loading,
  onSelectSettings,
  onOpenShortcuts,
  onLogout,
  onOpenPalette,
  mobileOpen,
  onCloseMobile,
  collapsed,
  view = 'boards',
  onShowView,
  panelWidth = 280,
  onResizePanel,
}) {
  const naming = useSelector(selectNaming);
  const location = useLocation();
  const q = query.trim().toLowerCase();
  const filteredCategories = tierCategories.filter((c) => c.toLowerCase().includes(q));
  const isPlaylists = view === 'playlists';
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
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <Box component="aside" className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <ActivityBar
          openView={collapsed ? null : view}
          onShowView={onShowView}
          onOpenPalette={onOpenPalette}
          waitingCount={waitingCount}
          onSelectSettings={onSelectSettings}
          onOpenShortcuts={onOpenShortcuts}
          onLogout={onLogout}
        />
        {!collapsed && (
          <Stack
            pos="relative"
            w={panelWidth}
            gap={0}
            px={SIDEBAR_X}
            py={SHELL_Y}
            my={8}
            mr={8}
            bg="var(--surface)"
            style={{ borderRadius: 14, border: '1px solid var(--border-soft)', flexShrink: 0 }}
          >
            {onResizePanel && <ResizeEdge width={panelWidth} onResize={onResizePanel} />}
            <Group justify="space-between" px={8} mb={8} mt={6} wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                {isPlaylists ? 'Playlists' : 'Tier lists'}
              </Text>
              {loading ? (
                <Skeleton h={10} w={14} />
              ) : (
                <Text size="xs" c="dimmed">
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
              size="xs"
              mb="xs"
            />

            <ScrollArea style={{ flex: 1 }} type="hover" offsetScrollbars>
              <Stack gap={0}>
                {isPlaylists &&
                  playlistGroups.map(([category, rows]) => (
                    <Box key={category} mb={6}>
                      <Text size="xs" fw={700} c="dimmed" px={10} pt={6} pb={2} truncate="end">
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
                  <Text size="sm" c="dimmed" px={8}>
                    No playlists match
                  </Text>
                )}
                {!isPlaylists && tierCategories.length > 0 && filteredCategories.length === 0 && (
                  <Text size="sm" c="dimmed" px={8}>
                    No boards match
                  </Text>
                )}
                {!isPlaylists && filteredCategories.map((category) => (
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
                    <Stack key={i} gap={7} px={12} py={9}>
                      <Skeleton h={10} w={`${55 + ((i * 17) % 35)}%`} />
                    </Stack>
                  ))}
                {!loading && tierCategories.length === 0 && (
                  <Text size="xs" c="dimmed" px={8}>
                    Name playlists like &quot;{exampleTitle(naming, 'Rap', TIER_ORDER[0])}&quot; … &quot;
                    {exampleTitle(naming, 'Rap', TIER_ORDER[TIER_ORDER.length - 1])}&quot; and they&apos;ll appear here as a tier
                    list.
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Box>
    </>
  );
}
