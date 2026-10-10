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
import { PART_GAP, SHELL_Y, SIDEBAR_X } from '../layout/spacing';
import { useBoardDropOpen } from '../layout/useBoardDropOpen';

const TOGGLE_KEYS = 'Ctrl+B';

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
      {...CHROME_ROW}
      // A song dragged over it: the accent fill, so the drop target is loud.
      variant={hovering ? 'filled' : undefined}
      vars={hovering ? undefined : CHROME_ROW.vars}
      // Compact rows so a typical library's boards all fit without
      // the list scrolling.
      py={4}
      active={active || hovering}
      data-drop-target={hovering || undefined}
      {...handlers}
      label={
        <Group justify="space-between" wrap="nowrap" gap={6}>
          <Text fz={14} truncate="end">
            {category}
          </Text>
          <Text fz={13} c={hovering ? undefined : MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
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
      {...CHROME_ROW}
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
          <Text fz={14} truncate="end" title={playlist.title}>
            {playlist.title}
          </Text>
          <Text fz={13} c={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {playlist.itemCount ?? 0}
          </Text>
        </Group>
      }
    />
  );
}

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

// The permanent icon strip, like VS Code's activity bar. "Tier lists" and
// "Playlists" open / close their view in the panel beside it (Ctrl+B
// toggles the panel); the rest go places.
export function ActivityBar({ openView, onShowView, onOpenPalette, waitingCount, onSelectSettings, onOpenShortcuts, onLogout }) {
  return (
    <Stack component="nav" aria-label="Activity bar" gap={6} align="center" px={8} py={6}>
      <ActivityIcon label="Home" keys="g h" component={Link} to="/">
        <Home {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Jump to…" keys="o / ⌘K" onClick={onOpenPalette}>
        <Search {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Tier lists" keys={TOGGLE_KEYS} marked={openView === 'boards'} aria-pressed={openView === 'boards'} onClick={() => onShowView('boards')}>
        <LayoutList {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Playlists" marked={openView === 'playlists'} aria-pressed={openView === 'playlists'} onClick={() => onShowView('playlists')}>
        <ListMusic {...ICON} />
      </ActivityIcon>
      <Indicator label={waitingCount} size={16} disabled={!waitingCount} offset={12}>
        <ActivityIcon label="Add songs" keys="a" component={Link} to="/add" state={{ focusInput: true }}>
          <ListPlus {...ICON} />
        </ActivityIcon>
      </Indicator>
      <Box style={{ flex: 1 }} />
      <ActivityIcon label="Keyboard shortcuts" keys="?" onClick={onOpenShortcuts}>
        <Keyboard {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Settings" keys="g s" onClick={onSelectSettings}>
        <Settings {...ICON} />
      </ActivityIcon>
      <ActivityIcon label="Log out" onClick={onLogout}>
        <LogOut {...ICON} />
      </ActivityIcon>
    </Stack>
  );
}

// The side panel: the open view (Tier lists or Playlists), its filter and
// its list. On desktop it lives in App's resizable panel group; on a phone,
// in the drawer beside the activity bar.
export function SidebarPanel({ query, onQueryChange, tierCategories, tierGroups, playlistCount, loading, view = 'boards' }) {
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
    <Stack h="100%" gap={0} px={SIDEBAR_X} py={SHELL_Y} miw={0}>
      <Group justify="space-between" px={8} mb={10} wrap="nowrap">
        {/* VS Code's side bar title: small caps-style, the secondary ink. */}
        <Text fz={14} fw={700} c="var(--text)">
          {isPlaylists ? 'Playlists' : 'Tier lists'}
        </Text>
        {loading ? (
          <Skeleton h={10} w={14} />
        ) : (
          <Text fz={13} c={MUTED}>
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
              <Box key={category} mb={6}>
                <Text fz={13} fw={600} c={MUTED} px={10} pt={6} pb={2} truncate="end">
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
        {withPanel && !collapsed && (
          <Box w={280}>
            <SidebarPanel view={view} {...panelProps} />
          </Box>
        )}
      </Box>
    </>
  );
}
