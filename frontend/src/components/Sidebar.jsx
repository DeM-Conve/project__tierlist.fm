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
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { Home, Keyboard, LayoutList, ListOrdered, ListPlus, LogOut, Search, Settings } from 'lucide-react';
import { TIER_ORDER } from '../tiers';
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

// The permanent icon strip, like VS Code's activity bar. "Tier lists"
// opens / closes the board panel beside it (Ctrl+B); the rest go places.
function ActivityBar({ panelOpen, onTogglePanel, onOpenPalette, waitingCount, onSelectSettings, onOpenShortcuts, onLogout }) {
  const { pathname } = useLocation();
  return (
    <Stack component="nav" aria-label="Activity bar" gap={6} align="center" px={6} py={SHELL_Y}>
      <ThemeIcon size={34} radius="sm" variant="filled" mb={8} aria-label="Tierlist.fm">
        <ListOrdered size={20} />
      </ThemeIcon>
      <ActivityIcon label="Tier lists" keys={TOGGLE_KEYS} marked={panelOpen} aria-pressed={panelOpen} onClick={onTogglePanel}>
        <LayoutList size={22} />
      </ActivityIcon>
      <ActivityIcon label="Jump to…" keys="o / ⌘K" onClick={onOpenPalette}>
        <Search size={22} />
      </ActivityIcon>
      <ActivityIcon label="Home" keys="g h" component={Link} to="/" marked={pathname === '/'}>
        <Home size={22} />
      </ActivityIcon>
      <Indicator label={waitingCount} size={16} disabled={!waitingCount} offset={8}>
        <ActivityIcon label="Add songs" keys="a" component={Link} to="/add" state={{ focusInput: true }} marked={pathname === '/add'}>
          <ListPlus size={22} />
        </ActivityIcon>
      </Indicator>
      <Box style={{ flex: 1 }} />
      <ActivityIcon label="Keyboard shortcuts" keys="?" onClick={onOpenShortcuts}>
        <Keyboard size={22} />
      </ActivityIcon>
      <ActivityIcon label="Settings" keys="g s" onClick={onSelectSettings} marked={pathname === '/settings'}>
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
  onToggleCollapsed,
}) {
  const naming = useSelector(selectNaming);
  const location = useLocation();
  const q = query.trim().toLowerCase();
  const filteredCategories = tierCategories.filter((c) => c.toLowerCase().includes(q));

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <Box component="aside" className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <ActivityBar
          panelOpen={!collapsed}
          onTogglePanel={onToggleCollapsed}
          onOpenPalette={onOpenPalette}
          waitingCount={waitingCount}
          onSelectSettings={onSelectSettings}
          onOpenShortcuts={onOpenShortcuts}
          onLogout={onLogout}
        />
        {!collapsed && (
          <Stack
            className="sidebar-panel"
            gap={0}
            px={SIDEBAR_X}
            py={SHELL_Y}
            my={8}
            mr={8}
            bg="var(--surface)"
            style={{ borderRadius: 14, border: '1px solid var(--border-soft)' }}
          >
            <Group justify="space-between" px={8} mb={8} mt={6} wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                Tier lists
              </Text>
              {loading ? (
                <Skeleton h={10} w={14} />
              ) : (
                <Text size="xs" c="dimmed" title={`${playlistCount} tier playlists`}>
                  {tierCategories.length}
                </Text>
              )}
            </Group>
            <TextInput
              placeholder="Filter…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              leftSection={<Search size={13} />}
              rightSection={query ? <CloseButton size="sm" onClick={() => onQueryChange('')} aria-label="Clear filter" /> : null}
              size="xs"
              mb="xs"
            />

            <ScrollArea style={{ flex: 1 }} type="hover" offsetScrollbars>
              <Stack gap={0}>
                {tierCategories.length > 0 && filteredCategories.length === 0 && (
                  <Text size="sm" c="dimmed" px={8}>
                    No boards match
                  </Text>
                )}
                {filteredCategories.map((category) => (
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
