import { ActionIcon, Anchor, Box, Button, Group, Image, Paper, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import PlaylistArt from './PlaylistArt';
import { TierChip } from './TierBits';
import { youtubeUrl } from '../tierUtils';

// A single YouTube playlist as a plain track list. If it's one of a tier
// list's playlists, it says so and links straight to that board.
export default function ItemsView({ playlist, items, loading, onOpenBoard, onBack }) {
  const parsed = playlist?.parsed ?? null;

  return (
    <Box component="section">
      <UnstyledButton onClick={onBack} mb="sm">
        <Group gap={6} c="dimmed">
          <ArrowLeft size={14} />
          <Text fz="sm">Home</Text>
        </Group>
      </UnstyledButton>

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="lg">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <PlaylistArt playlist={playlist} tier={parsed?.tier} w={120} h={68} radius={6} style={{ flexShrink: 0 }} />
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
              Playlist
            </Text>
            <Title order={1} fz={{ base: 24, sm: 32 }} fw={900} lh={1.1} lineClamp={2}>
              {playlist?.title}
            </Title>
            <Text c="dimmed" fz="sm">
              {items ? `${items.length} videos` : loading ? 'Loading…' : ''}
            </Text>
          </Stack>
        </Group>
        {parsed && (
          <Group gap="sm">
            <TierChip tier={parsed.tier} size={30} />
            <Button onClick={() => onOpenBoard(parsed.category)}>Open the {parsed.category} tier list</Button>
          </Group>
        )}
      </Group>

      <Paper withBorder radius="md" p={4} bg="var(--surface)">
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <Group key={i} p="sm" gap="md" wrap="nowrap">
              <Skeleton w={80} h={45} radius={4} />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton h={10} w="55%" />
                <Skeleton h={8} w="25%" />
              </Stack>
            </Group>
          ))}
        {!loading && items?.length === 0 && (
          <Text c="dimmed" ta="center" py="xl" fz="sm">
            No videos in this playlist.
          </Text>
        )}
        {items?.map((v, i) => (
          <Anchor
            key={v.videoId}
            href={youtubeUrl(v.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            underline="never"
            c="inherit"
            className="track-row"
            display="grid"
            px="sm"
            py={6}
            style={{ gridTemplateColumns: '32px 80px minmax(0,1fr) 28px', alignItems: 'center', gap: 12, borderRadius: 6 }}
          >
            <Text fz="xs" c="dimmed" ta="right" ff="monospace">
              {i + 1}
            </Text>
            <Image src={v.thumbnail || undefined} w={80} h={45} radius={4} fit="cover" bg="var(--surface-2)" alt="" />
            <Box style={{ minWidth: 0 }}>
              <Text fz="sm" fw={500} truncate="end">
                {v.title}
              </Text>
              <Text fz="xs" c="dimmed" truncate="end">
                {v.channelTitle || ' '}
              </Text>
            </Box>
            <ActionIcon component="span" variant="subtle" color="gray" aria-hidden>
              <ArrowUpRight size={15} />
            </ActionIcon>
          </Anchor>
        ))}
      </Paper>
    </Box>
  );
}
