import { useState } from 'react';
import {
  Badge,
  Avatar,
  Box,
  Button,
  Card,
  CloseButton,
  Group,
  Image,
  Kbd,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { EyeOff, Plus, Search, Swords } from 'lucide-react';
import CreateTierPlaylistsModal from './CreateTierPlaylistsModal';
import { BOARD_TIERS, TIER_COLORS } from '../tiers';
import { EqualizerMark, TierChip } from './TierBits';
import { TIER_INK } from '../tierUtils';

// A board drawn as a tiny tier list: one line per tier, sized by how many
// videos it holds - recognisably "a tier list" at a glance, built only from
// the playlists' own metadata (no per-board fetch).
function BoardCard({ category, tiers, onOpen, onDuel }) {
  const present = BOARD_TIERS.filter((t) => tiers[t]);
  const counts = Object.fromEntries(present.map((t) => [t, tiers[t].itemCount ?? 0]));
  const total = present.reduce((n, t) => n + counts[t], 0);
  const max = Math.max(1, ...present.map((t) => counts[t]));

  return (
    <Paper withBorder radius="md" p="md" bg="var(--surface)" className="board-card">
      <UnstyledButton onClick={onOpen} w="100%" aria-label={`Open ${category}`}>
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Text ff="var(--font-display)" fw={900} fz={20} truncate="end">
            {category}
          </Text>
          <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {total} videos
          </Text>
        </Group>
        <Stack gap={5}>
          {present.map((t) => (
            <Group key={t} gap={8} wrap="nowrap">
              <TierChip tier={t} size={22} />
              <Image
                src={tiers[t].thumbnail || undefined}
                w={40}
                h={22}
                radius={3}
                fit="cover"
                bg="var(--surface-2)"
                alt=""
                style={{ flexShrink: 0 }}
              />
              <Box style={{ flex: 1 }} h={8} bg="var(--surface-2)" pos="relative">
                <Box
                  h={8}
                  bg={TIER_COLORS[t]}
                  w={`${(counts[t] / max) * 100}%`}
                  style={{ borderRadius: 2, minWidth: counts[t] ? 3 : 0 }}
                />
              </Box>
              <Text fz="xs" c="dimmed" w={28} ta="right">
                {counts[t]}
              </Text>
            </Group>
          ))}
        </Stack>
      </UnstyledButton>
      <Group gap={6} mt="md">
        <Button size="compact-sm" variant="light" onClick={onOpen}>
          Open
        </Button>
        <Button size="compact-sm" variant="subtle" color="gray" leftSection={<Swords size={13} />} onClick={onDuel}>
          Duel
        </Button>
      </Group>
    </Paper>
  );
}

export default function HomeView({
  playlists,
  hiddenCount,
  onOpenNaming,
  tierGroups,
  tierCategories,
  query,
  onQueryChange,
  nowPlaying,
  inbox,
  onOpenInbox,
  onOpenBoard,
  onDuel,
  onOpenPlaylist,
}) {
  const [creating, setCreating] = useState(false);
  const q = query.trim().toLowerCase();
  const boards = tierCategories.filter((c) => c.toLowerCase().includes(q));
  // Only playlists that follow the naming template ever reach this view.
  const shownPlaylists = (playlists || []).filter((p) => p.title.toLowerCase().includes(q));

  return (
    <Stack gap={36} component="section">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
            Home
          </Text>
          <Title order={1} fz={{ base: 30, sm: 40 }} fw={900} lh={1}>
            Your tier lists
          </Title>
          <Text c="dimmed" fz="sm">
            {playlists === null
              ? 'Loading your playlists…'
              : `${tierCategories.length} boards built from ${playlists.length} playlists`}
          </Text>
        </Stack>
        <Group gap="sm" wrap="wrap">
        <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} disabled={playlists === null}>
          New tier list
        </Button>
        <TextInput
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter boards & playlists…"
          leftSection={<Search size={15} />}
          rightSection={query ? <CloseButton size="sm" onClick={() => onQueryChange('')} aria-label="Clear" /> : null}
          w={300}
        />
        </Group>
      </Group>

      {creating && (
        <CreateTierPlaylistsModal opened onClose={() => setCreating(false)} onCreated={onOpenBoard} />
      )}

      {inbox?.length > 0 && (
        <Paper withBorder radius="md" p="sm" bg="var(--surface-2)">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar.Group>
                {inbox.slice(0, 3).map((v) => (
                  <Avatar key={v.videoId} src={v.thumbnail} radius="sm" size={44} />
                ))}
              </Avatar.Group>
              <Box style={{ minWidth: 0 }}>
                <Text fz="xs" c="accent" fw={700} tt="uppercase">
                  Inbox
                </Text>
                <Text fw={600} truncate="end">
                  {inbox.length} liked {inbox.length === 1 ? 'song isn’t' : 'songs aren’t'} on a board yet
                </Text>
              </Box>
            </Group>
            <Button variant="light" onClick={onOpenInbox} rightSection={<Kbd size="xs">g i</Kbd>}>
              Rate them
            </Button>
          </Group>
        </Paper>
      )}

      {nowPlaying?.category && (
        <Paper withBorder radius="md" p="sm" bg="var(--surface-2)">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Image src={nowPlaying.video.thumbnail} w={48} h={48} radius={6} fit="cover" alt="" />
              <Box style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <EqualizerMark color="var(--accent)" height={10} />
                  <Text fz="xs" c="accent" fw={700} tt="uppercase">
                    Now playing
                  </Text>
                </Group>
                <Text fw={600} truncate="end">
                  {nowPlaying.video.title}
                </Text>
                <Text fz="xs" c="dimmed">
                  from {nowPlaying.category}
                </Text>
              </Box>
            </Group>
            <Button variant="light" onClick={() => onOpenBoard(nowPlaying.category)}>
              Rate it on the board
            </Button>
          </Group>
        </Paper>
      )}

      <div>
        {playlists === null && (
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} h={200} radius="md" />
            ))}
          </SimpleGrid>
        )}
        {playlists !== null && tierCategories.length === 0 && (
          <Paper withBorder radius="md" p="xl" ta="center" bg="var(--surface)">
            <Title order={3} mb={6}>
              No tier lists yet
            </Title>
            <Text c="dimmed" fz="sm" maw={520} mx="auto">
              Name YouTube playlists like <b>[G] Rap T1</b>, <b>[G] Rap T2</b> … <b>T3</b>, <b>TE</b>, <b>TZ</b> and each
              category turns into a tier list here automatically.
            </Text>
          </Paper>
        )}
        {playlists !== null && tierCategories.length > 0 && boards.length === 0 && (
          <Text c="dimmed" fz="sm">
            No boards match "{query}".
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
          {boards.map((c) => (
            <BoardCard
              key={c}
              category={c}
              tiers={tierGroups[c]}
              onOpen={() => onOpenBoard(c)}
              onDuel={() => onDuel(c)}
            />
          ))}
        </SimpleGrid>
      </div>

      <div>
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Title order={2} fz={20}>
            Playlists
          </Title>
          {hiddenCount > 0 && (
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<EyeOff size={13} />}
              onClick={onOpenNaming}
            >
              {hiddenCount} playlist{hiddenCount === 1 ? '' : 's'} hidden - not named by your template
            </Button>
          )}
        </Group>
        {playlists !== null && shownPlaylists.length === 0 && (
          <Text c="dimmed" fz="sm">
            {playlists.length === 0 ? 'No playlists follow your naming template yet.' : `No playlists match "${query}".`}
          </Text>
        )}
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4, xl: 6 }} spacing="sm">
          {playlists === null &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={150} radius="md" />)}
          {shownPlaylists.map((p) => {
            const { parsed } = p;
            return (
              <Card
                key={p.id}
                withBorder
                radius="md"
                padding="xs"
                bg="var(--surface)"
                className="playlist-card"
                onClick={() => onOpenPlaylist(p)}
                style={{ cursor: 'pointer' }}
              >
                <Card.Section pos="relative">
                  <Image src={p.thumbnail || undefined} h={100} fit="cover" bg="var(--surface-2)" alt="" />
                  {parsed && (
                    <Badge
                      pos="absolute"
                      top={6}
                      left={6}
                      radius="sm"
                      color={TIER_COLORS[parsed.tier]}
                      c={TIER_INK}
                    >
                      {parsed.tier}
                    </Badge>
                  )}
                </Card.Section>
                <Text fz="sm" fw={600} lineClamp={2} mt={8} title={p.title}>
                  {p.title}
                </Text>
                <Text fz="xs" c="dimmed">
                  {p.itemCount} video{p.itemCount === 1 ? '' : 's'}
                  {parsed ? ` · ${parsed.category}` : ''}
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </div>
    </Stack>
  );
}
