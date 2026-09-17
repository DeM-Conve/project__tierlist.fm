import { Link, useLocation } from 'react-router-dom';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Kbd,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { Settings } from 'lucide-react';

export default function Sidebar({
  query,
  onQueryChange,
  tierCategories,
  playlistCount,
  onSelectSettings,
  onLogout,
  onOpenPalette,
  mobileOpen,
  onCloseMobile,
}) {
  const location = useLocation();
  const filteredCategories = tierCategories.filter((c) =>
    c.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <Text fw={800} fz={17} px={8} mb={18}>
          Playlist Tiers
        </Text>

        <UnstyledButton
          onClick={onOpenPalette}
          px={10}
          py={8}
          mb="sm"
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
        >
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Jump to...
            </Text>
            <Kbd>⌘K</Kbd>
          </Group>
        </UnstyledButton>

        <TextInput
          placeholder="Filter boards..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          mb="sm"
        />

        <ScrollArea style={{ flex: 1 }} type="hover">
          <Stack gap={2}>
            {tierCategories.length > 0 && (
              <>
                <Text size="xs" fw={600} c="dimmed" px={8} mb={2}>
                  Tier boards
                </Text>
                {filteredCategories.length === 0 && (
                  <Text size="sm" c="dimmed" px={8}>
                    No matches
                  </Text>
                )}
                {filteredCategories.map((category) => (
                  <NavLink
                    key={category}
                    component={Link}
                    to={`/tier/${encodeURIComponent(category)}`}
                    label={category}
                    variant="light"
                    active={location.pathname === `/tier/${encodeURIComponent(category)}`}
                  />
                ))}
                <Divider my="xs" />
              </>
            )}

            <NavLink
              component={Link}
              to="/"
              label="Playlists"
              variant="light"
              active={location.pathname === '/'}
              rightSection={
                <Text size="xs" c="dimmed">
                  {playlistCount}
                </Text>
              }
            />
          </Stack>
        </ScrollArea>

        <Group gap="xs" mt="md" wrap="nowrap">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={onSelectSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </ActionIcon>
          <Button variant="default" onClick={onLogout} style={{ flex: 1 }}>
            Log out
          </Button>
        </Group>
      </aside>
    </>
  );
}
