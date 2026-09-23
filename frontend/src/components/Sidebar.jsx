import { Link, useLocation } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  CloseButton,
  Group,
  Kbd,
  Skeleton,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { Home, Keyboard, ListOrdered, ListPlus, LogOut, Search, Settings } from 'lucide-react';
import { TIER_ORDER, TODO_TIER } from '../tiers';

// Each board shows its song total straight from the playlists' own item
// counts - no per-board fetch needed just to draw the sidebar.
function boardCounts(tiers) {
  return Object.fromEntries(TIER_ORDER.filter((t) => tiers[t]).map((t) => [t, tiers[t].itemCount ?? 0]));
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
}) {
  const location = useLocation();
  const q = query.trim().toLowerCase();
  const filteredCategories = tierCategories.filter((c) => c.toLowerCase().includes(q));

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <Group gap={10} px={6} mb="md" wrap="nowrap">
          <ThemeIcon size={30} radius="sm" variant="filled">
            <ListOrdered size={18} />
          </ThemeIcon>
          <Text fw={800} fz={17}>
            Playlist Tiers
          </Text>
        </Group>

        <UnstyledButton
          onClick={onOpenPalette}
          px={10}
          py={8}
          mb="xs"
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <Search size={14} color="var(--text-dim)" />
              <Text size="sm" c="dimmed">
                Jump to…
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <Kbd size="xs">o</Kbd>
              <Kbd size="xs">⌘K</Kbd>
            </Group>
          </Group>
        </UnstyledButton>

        <NavLink
          component={Link}
          to="/"
          label={
            <Group justify="space-between" wrap="nowrap">
              Home
              <Kbd size="xs" visibleFrom="md">g h</Kbd>
            </Group>
          }
          description={loading ? 'Loading your playlists…' : `Boards & ${playlistCount} playlists`}
          leftSection={<Home size={16} />}
          variant="light"
          active={location.pathname === '/' || location.pathname.startsWith('/playlist/')}
        />
        <NavLink
          component={Link}
          to="/add"
          state={{ focusInput: true }}
          label={
            <Group justify="space-between" wrap="nowrap">
              Add songs
              <Kbd size="xs" visibleFrom="md">a</Kbd>
            </Group>
          }
          description={waitingCount > 0 ? `${waitingCount} waiting for a tier` : 'Paste a link or search'}
          leftSection={<ListPlus size={16} />}
          rightSection={
            waitingCount > 0 ? (
              <Badge size="sm" variant="filled" circle={waitingCount < 10}>
                {waitingCount}
              </Badge>
            ) : null
          }
          variant="light"
          active={location.pathname === '/add'}
          mb="xs"
        />

        <Group justify="space-between" px={8} mt={4} mb={6} wrap="nowrap">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
            Tier lists
          </Text>
          {loading ? (
            <Skeleton h={10} w={14} />
          ) : (
            <Text size="xs" c="dimmed">
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
          <Stack gap={2}>
            {tierCategories.length > 0 && filteredCategories.length === 0 && (
              <Text size="sm" c="dimmed" px={8}>
                No boards match
              </Text>
            )}
            {filteredCategories.map((category) => {
              const base = `/tier/${encodeURIComponent(category)}`;
              const tiers = tierGroups[category] || {};
              const counts = boardCounts(tiers);
              const total = Object.values(counts).reduce((a, b) => a + b, 0);
              const todo = tiers[TODO_TIER]?.itemCount ?? 0;
              return (
                <NavLink
                  key={category}
                  component={Link}
                  to={base}
                  variant="light"
                  active={location.pathname === base || location.pathname.startsWith(`${base}/`)}
                  label={
                    <Group justify="space-between" wrap="nowrap" gap={6}>
                      <Text size="sm" truncate="end">
                        {category}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        {todo > 0 && (
                          <Tooltip label={`${todo} to do - not rated yet`} withArrow>
                            <Badge size="xs" variant="light" color="gray">
                              {todo}
                            </Badge>
                          </Tooltip>
                        )}
                        <Text size="xs" c="dimmed">
                          {total}
                        </Text>
                      </Group>
                    </Group>
                  }
                />
              );
            })}
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
                Name playlists like "[G] Rap T1" … "T3", "TE", "TZ" and they'll appear here as a tier list.
              </Text>
            )}
          </Stack>
        </ScrollArea>

        <Group gap="xs" mt="md" wrap="nowrap">
          <Tooltip label="Settings (g s)" withArrow>
            <ActionIcon variant="default" size="lg" onClick={onSelectSettings} aria-label="Settings">
              <Settings size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Keyboard shortcuts (?)" withArrow>
            <ActionIcon variant="default" size="lg" onClick={onOpenShortcuts} aria-label="Keyboard shortcuts">
              <Keyboard size={16} />
            </ActionIcon>
          </Tooltip>
          <Button variant="default" onClick={onLogout} leftSection={<LogOut size={15} />} style={{ flex: 1 }}>
            Log out
          </Button>
        </Group>
      </aside>
    </>
  );
}
