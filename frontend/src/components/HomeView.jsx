import { useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Alert,
  Badge,
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
import { CircleAlert, EyeOff, ListPlus, Plus, Search, Swords } from 'lucide-react';
import CreateTierPlaylistsModal from './CreateTierPlaylistsModal';
import PlaylistArt from './PlaylistArt';
import { BOARD_TIERS, TIER_COLORS, TIER_ORDER } from '../tiers';
import { exampleTitle } from '../naming';
import { useSelector } from 'react-redux';
import { selectNaming } from '../store/selectors';
import { useTierName } from '../tierLabels';
import { EqualizerMark, TierChip } from './TierBits';
import { TIER_INK } from '../tierUtils';
import PageHeader from './PageHeader';
import { SECTION_GAP } from '../layout/spacing';

// A board drawn as a tiny tier list: one line per tier, sized by how many
// videos it holds - recognisably "a tier list" at a glance, built only from
// the playlists' own metadata (no per-board fetch).
function BoardCard({ category, tiers, onOpen, onDuel }) {
  const present = BOARD_TIERS.filter((t) => tiers[t]);
  const counts = Object.fromEntries(present.map((t) => [t, tiers[t].itemCount ?? 0]));
  const total = present.reduce((n, t) => n + counts[t], 0);
  const max = Math.max(1, ...present.map((t) => counts[t]));

  return (
    // Fills its grid cell (h 100%) as a column, so Open/Duel (mt auto) sit
    // on the same line in every card of a row, TODO row or not.
    <Paper
      withBorder
      radius="md"
      p="md"
      bg="var(--surface)"
      className="board-card"
      h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <UnstyledButton onClick={onOpen} w="100%" aria-label={`Open ${category}`}>
        <Group justify="space-between" mb="xs" wrap="nowrap">
          <Text ff="var(--font-display)" fw={700} fz="lg" truncate="end">
            {category}
          </Text>
          <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {total} videos
          </Text>
        </Group>
        <Stack gap="4xs">
          {present.map((t) => (
            <Group key={t} gap="2xs" wrap="nowrap">
              <TierChip tier={t} size={20} />
              <PlaylistArt playlist={tiers[t]} tier={t} w={36} h={20} radius={3} iconSize={13} style={{ flexShrink: 0 }} />
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
      <Group gap="3xs" mt="auto" pt="sm">
        <Button size="compact-sm" variant="subtle" color="gray" leftSection={<Swords size={13} />} onClick={onDuel}>
          Duel
        </Button>
        <Button size="compact-sm" variant="default" onClick={onOpen}>
          Open
        </Button>
      </Group>
    </Paper>
  );
}

// BoardCard's shape (same Paper, header row, five tier lines, button row)
// with Skeleton blocks, so the grid doesn't jump when the playlists arrive.
function BoardCardSkeleton() {
  return (
    <Paper withBorder radius="md" p="md" bg="var(--surface)" h="100%" data-testid="board-card-skeleton"
      style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="xs" wrap="nowrap" h={22}>
        <Skeleton h={20} w="45%" />
        <Skeleton h={10} w={60} />
      </Group>
      <Stack gap="4xs">
        {TIER_ORDER.map((t, i) => (
          <Group key={t} gap="2xs" wrap="nowrap">
            <Skeleton w={20} h={20} radius={4} style={{ flexShrink: 0 }} />
            <Skeleton w={36} h={20} radius={3} style={{ flexShrink: 0 }} />
            <Box style={{ flex: 1 }}>
              <Skeleton h={8} w={`${90 - i * 15}%`} radius={2} />
            </Box>
            <Skeleton h={10} w={20} ml="2xs" />
          </Group>
        ))}
      </Stack>
      <Group gap="3xs" mt="auto" pt="sm">
        <Skeleton h={26} w={56} radius="sm" />
        <Skeleton h={26} w={68} radius="sm" />
      </Group>
    </Paper>
  );
}

// A playlist card's shape: the 100px art section, title and count lines.
function PlaylistCardSkeleton() {
  return (
    <Card withBorder radius="md" padding="xs" bg="var(--surface)" data-testid="playlist-card-skeleton">
      <Card.Section>
        <Skeleton h={100} radius={0} />
      </Card.Section>
      <Skeleton h={12} w="85%" mt="sm" />
      <Skeleton h={10} w="50%" mt="2xs" mb="4xs" />
    </Card>
  );
}

export default function HomeView({
  playlists,
  loadError,
  retrying,
  onRetry,
  onRelogin,
  hiddenCount,
  onOpenNaming,
  tierGroups,
  tierCategories,
  query,
  onQueryChange,
  nowPlaying,
  onAddSongs,
  onOpenBoard,
  onDuel,
  onOpenPlaylist,
}) {
  const naming = useSelector(selectNaming);
  const tierName = useTierName();
  // Vim-style "/": jump to the filter box (react-hotkeys-hook ignores it
  // while typing in another field); Escape in the box hands focus back.
  const filterRef = useRef(null);
  useHotkeys('slash', () => filterRef.current?.focus(), { preventDefault: true });
  const [creating, setCreating] = useState(false);
  const q = query.trim().toLowerCase();
  const boards = tierCategories.filter((c) => c.toLowerCase().includes(q));
  // Only playlists that follow the naming template ever reach this view.
  const shownPlaylists = (playlists || []).filter((p) => p.title.toLowerCase().includes(q));

  return (
    <Stack gap={SECTION_GAP} component="section">
      <PageHeader
        eyebrow="Home"
        title="Your tier lists"
        meta={
          loadError
            ? 'Couldn’t load your playlists'
            : playlists === null
            ? 'Loading your playlists…'
            : `${tierCategories.length} boards built from ${playlists.length} playlists`
        }
        actions={<>
        <Button variant="default" leftSection={<ListPlus size={15} />} rightSection={<Kbd size="xs">a</Kbd>} onClick={onAddSongs}>
          Add songs
        </Button>
        <Button leftSection={<Plus size={15} />} onClick={() => setCreating(true)} disabled={playlists === null}>
          New tier list
        </Button>
        <TextInput
          ref={filterRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          placeholder="Filter boards & playlists…"
          leftSection={<Search size={15} />}
          rightSection={query ? <CloseButton size="sm" onClick={() => onQueryChange('')} aria-label="Clear" /> : <Kbd size="xs">/</Kbd>}
          w={300}
        />
        </>}
      />

      {creating && (
        <CreateTierPlaylistsModal opened onClose={() => setCreating(false)} onCreated={onOpenBoard} />
      )}

      {nowPlaying?.category && (
        <Paper withBorder radius="md" p="sm" bg="var(--surface-2)">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Image src={nowPlaying.video.thumbnail} w={48} h={48} radius={6} fit="cover" alt="" />
              <Box style={{ minWidth: 0 }}>
                <Group gap="3xs" wrap="nowrap">
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
            <Button variant="default" onClick={() => onOpenBoard(nowPlaying.category)}>
              Rate it on the board
            </Button>
          </Group>
        </Paper>
      )}

      <div>
        {loadError && (
          <Alert variant="light" color="red" radius="md" icon={<CircleAlert size={18} />} title="Couldn’t load your playlists">
            <Stack gap="sm" align="flex-start">
              <Text fz="sm">{loadError}</Text>
              <Group gap="sm">
                <Button size="compact-sm" variant="default" loading={retrying} onClick={onRetry}>
                  Retry
                </Button>
                <Button size="compact-sm" onClick={onRelogin}>
                  Log in again
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
        {!loadError && playlists === null && (
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
            {Array.from({ length: 6 }).map((_, i) => (
              <BoardCardSkeleton key={i} />
            ))}
          </SimpleGrid>
        )}
        {playlists !== null && tierCategories.length === 0 && (
          <Paper withBorder radius="md" p="md" ta="center" bg="var(--surface)">
            <Title order={3} mb="3xs">
              No tier lists yet
            </Title>
            <Text c="dimmed" fz="sm" maw={520} mx="auto">
              Name YouTube playlists like <b>{exampleTitle(naming, 'Rap', TIER_ORDER[0])}</b>,{' '}
              <b>{exampleTitle(naming, 'Rap', TIER_ORDER[1])}</b> …{' '}
              <b>{exampleTitle(naming, 'Rap', TIER_ORDER[TIER_ORDER.length - 1])}</b> (your naming, Settings → Playlist
              naming) and each category turns into a tier list here automatically.
            </Text>
          </Paper>
        )}
        {playlists !== null && tierCategories.length > 0 && boards.length === 0 && (
          <Text c="dimmed" fz="sm">
            No boards match "{query}".
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
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
          <Title order={2}>
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
            Array.from({ length: 6 }).map((_, i) => <PlaylistCardSkeleton key={i} />)}
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
                  <PlaylistArt playlist={p} tier={parsed?.tier} h={100} iconSize={34} />
                  {parsed && (
                    <Badge
                      pos="absolute"
                      top={6}
                      left={6}
                      radius="sm"
                      color={TIER_COLORS[parsed.tier]}
                      c={TIER_INK}
                    >
                      {tierName(parsed.tier)}
                    </Badge>
                  )}
                </Card.Section>
                <Text fz="sm" fw={600} lineClamp={2} mt="2xs" title={p.title}>
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
