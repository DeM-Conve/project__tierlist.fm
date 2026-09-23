import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { LayoutGrid, ListOrdered, Radio, Swords } from 'lucide-react';
import { TIER_ORDER, TIER_COLORS } from '../tiers';
import { TIER_INK } from '../tierUtils';
import { DEMO_ART } from '../themes';

const BOARD = {
  T1: [0, 4, 7],
  T2: [2, 5, 1, 3],
  T3: [6, 0, 4],
  TE: [3, 1],
  TZ: [5],
};

const DURATIONS = ['3:42', '4:18', '2:57', '5:03', '3:21', '6:10', '4:44', '3:08'];

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Tier boards',
    body: 'Playlists named like "[G] Rap T1" group themselves into a board per category.',
  },
  {
    icon: Swords,
    title: 'Duels',
    body: 'Pick the better of two. The ranking sorts itself out from your answers.',
  },
  {
    icon: Radio,
    title: 'Keeps playing',
    body: 'A mini player that follows you across every page while you sort.',
  },
];

function Thumb({ index, w = 72, lifted = false }) {
  const [from, to] = DEMO_ART[index % DEMO_ART.length];
  return (
    <Box
      pos="relative"
      w={w}
      style={{
        flexShrink: 0,
        aspectRatio: '16 / 9',
        borderRadius: 4,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        ...(lifted && {
          outline: '2px solid var(--accent)',
          outlineOffset: 2,
          boxShadow: '0 18px 40px var(--shadow)',
          transform: 'rotate(-4deg) translateY(-6px)',
        }),
      }}
    >
      <Text
        span
        pos="absolute"
        bottom={3}
        right={3}
        px={3}
        fz={8}
        fw={600}
        lh="12px"
        c="var(--media-fg)"
        bg="var(--media-control-bg)"
        style={{ borderRadius: 2 }}
      >
        {DURATIONS[index % DURATIONS.length]}
      </Text>
    </Box>
  );
}

function BoardMock() {
  return (
    <Box pos="relative" className="anim-rise" style={{ animationDelay: '180ms' }}>
      <Paper
        withBorder
        radius="md"
        p="md"
        bg="var(--surface)"
        style={{
          transform: 'perspective(1400px) rotateY(-9deg) rotateX(4deg)',
          boxShadow: '0 40px 80px -20px var(--shadow)',
        }}
      >
        <Group justify="space-between" mb="sm">
          <Group gap={8}>
            <Text ff="var(--font-display)" fw={800} fz="lg">
              Rap
            </Text>
            <Badge size="xs" variant="light">
              13 videos
            </Badge>
          </Group>
          <Badge size="xs" variant="outline" color="gray">
            2 pending
          </Badge>
        </Group>
        <Stack gap={0} style={{ border: '1px solid var(--border-soft)', borderRadius: 4, overflow: 'hidden' }}>
          {TIER_ORDER.map((tier, row) => (
            <Group
              key={tier}
              gap={0}
              wrap="nowrap"
              align="stretch"
              style={{ borderTop: row ? '1px solid var(--border-soft)' : undefined }}
            >
              <Box
                w={52}
                bg={TIER_COLORS[tier]}
                style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}
              >
                <Text ff="var(--font-display)" fw={900} fz="md" c={TIER_INK}>
                  {tier}
                </Text>
              </Box>
              <Group
                gap={8}
                p={8}
                wrap="nowrap"
                style={{
                  flex: 1,
                  background: tier === 'T1' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined,
                }}
              >
                {BOARD[tier].map((thumb, i) => (
                  <Thumb key={i} index={thumb} />
                ))}
                {tier === 'T1' && (
                  <Box
                    w={72}
                    style={{
                      aspectRatio: '16 / 9',
                      borderRadius: 4,
                      border: '1px dashed var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      </Paper>

      {/* A thumbnail mid-drag from T2 up into T1's drop slot. */}
      <Box pos="absolute" top={72} right={34} className="anim-float" style={{ animationDelay: '0.6s' }}>
        <Thumb index={3} w={84} lifted />
      </Box>

      {/* Duel card peeking out below the board. */}
      <Paper
        withBorder
        radius="md"
        p="sm"
        pos="absolute"
        bottom={-80}
        left={-36}
        bg="var(--surface-2)"
        className="anim-float"
        style={{ boxShadow: '0 24px 50px var(--shadow)' }}
      >
        <Text fz={10} fw={700} tt="uppercase" c="dimmed" mb={6} style={{ letterSpacing: 1 }}>
          Which is better?
        </Text>
        <Group gap={8} wrap="nowrap">
          <Thumb index={1} w={88} />
          <Text ff="var(--font-display)" fw={900} fz="xs" c="accent">
            VS
          </Text>
          <Thumb index={7} w={88} />
        </Group>
      </Paper>
    </Box>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginView({ onLogin }) {
  return (
    <Box
      mih="100vh"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background:
          'radial-gradient(900px 600px at 85% 30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%),' +
          'radial-gradient(700px 500px at 10% 100%, color-mix(in srgb, var(--tier-tz) 8%, transparent), transparent 60%),' +
          'var(--bg)',
      }}
    >
      <Container size="lg" w="100%" py="md">
        <Group gap={10}>
          <ThemeIcon size={30} radius="sm" variant="filled">
            <ListOrdered size={18} />
          </ThemeIcon>
          <Text fw={800} fz={17}>
            Tierlist.fm
          </Text>
        </Group>
      </Container>

      {/* Everything below the logo shares one screen: hero + mock centered in
          the free height, features in a single row along the bottom - so the
          landing page never needs to scroll on a desktop-sized window. */}
      <Container size="lg" w="100%" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={72} py="md" w="100%" style={{ alignItems: 'center' }}>
          <Stack gap="xl" className="anim-rise">
            <Badge variant="light" size="lg" radius="sm" w="fit-content">
              Your own YouTube account
            </Badge>

            <Title
              order={1}
              fz={{ base: 48, sm: 64, lg: 76 }}
              lh={0.95}
              fw={900}
              style={{ letterSpacing: '-0.03em' }}
            >
              Your playlists,
              <br />
              <Text span inherit c="accent">
                ranked.
              </Text>
            </Title>

            <Text fz="lg" c="var(--text-dim)" maw={470} lh={1.55}>
              Sort every video into tiers, settle close calls head-to-head, and keep listening while
              you do it.
            </Text>

            <Stack gap={10} align="flex-start">
              <Button
                size="lg"
                radius="md"
                variant="white"
                color="dark"
                leftSection={<GoogleMark />}
                onClick={onLogin}
              >
                Continue with Google
              </Button>
              <Text fz="xs" c="dimmed">
                Nothing changes on YouTube until you press Sync.
              </Text>
            </Stack>

          </Stack>

          <Box visibleFrom="md" pb={80}>
            <BoardMock />
          </Box>
        </SimpleGrid>
      </Container>

      <Container size="lg" w="100%" pb="xl">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl" pt="lg" style={{ borderTop: '1px solid var(--border-soft)' }}>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Group key={title} gap="md" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" size={34} radius="sm">
                <Icon size={17} />
              </ThemeIcon>
              <div>
                <Text fw={600} fz="sm">
                  {title}
                </Text>
                <Text fz="sm" c="dimmed">
                  {body}
                </Text>
              </div>
            </Group>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
