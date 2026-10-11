import { Link } from 'react-router-dom';
import { Alert, Anchor, Box, Button, Container, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { TierChip } from '../TierBits';
import { useDuelSummaryQuery } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { pct } from '../../duel/duelText';
import { SectionLabel } from './DuelBits';
import PageHeader from '../PageHeader';
import { SECTION_GAP } from '../../layout/spacing';

const minSec = (s) => `${Math.floor(s / 60)} min ${s % 60} s`;

// Where to go next - static, so the loading state shows it too.
function WrapActions({ base }) {
  return (
    <Group justify="center" gap="sm">
      <Button component={Link} to={`${base}/duel/moves`}>Review moves</Button>
      <Button variant="light" color="gray" component={Link} to={`${base}/duel`}>Another session</Button>
      <Button variant="default" component={Link} to={base}>Back to board</Button>
    </Group>
  );
}

// The summary's own layout - header, certainty card, moves, the two
// result cards, the button row - with Skeleton blocks where the session's
// numbers go, so nothing moves when the summary arrives.
function WrapSkeleton({ base }) {
  return (
    <Container className="duel-view" fluid px={0} py={0} data-testid="wrap-skeleton">
      <Stack gap="lg">
        <Stack gap="xs" align="center">
          <Skeleton h={16} w={300} my="5xs" />
          <Skeleton h={50} w="70%" my="4xs" radius="md" />
        </Stack>

        <Paper withBorder radius="lg" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" style={{ alignItems: 'center' }}>
            <Stack gap="3xs">
              <SectionLabel>Board certainty</SectionLabel>
              <Skeleton h={56} w={220} radius="sm" my="md" />
            </Stack>
            <Stack gap="xs">
              <Skeleton h={14} radius={7} />
              <Group gap="lg">
                {[110, 120, 140].map((w) => <Skeleton key={w} h={14} w={w} my="4xs" />)}
              </Group>
            </Stack>
          </SimpleGrid>
        </Paper>

        <Stack gap="md">
          <Group justify="space-between" align="baseline">
            <Skeleton h={24} w={300} />
            <Skeleton h={14} w={140} />
          </Group>
          <Paper withBorder radius="md">
            {[0, 1].map((i) => (
              <Group key={i} px="lg" py="md" gap="md" style={{ borderBottom: '1px solid var(--border)' }} wrap="wrap">
                <Skeleton h={14} style={{ flex: '1 1 200px' }} my="3xs" />
                <Group gap="2xs"><Skeleton w={20} h={20} radius={4} /><Text c="dimmed">→</Text><Skeleton w={20} h={20} radius={4} /></Group>
                <Skeleton h={12} w={50} />
              </Group>
            ))}
          </Paper>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {['Biggest upset', 'Still undecided'].map((label) => (
            <Paper key={label} withBorder radius="md" p="md">
              <Stack gap="2xs">
                <SectionLabel>{label}</SectionLabel>
                <Skeleton h={14} w="90%" my="3xs" />
                <Skeleton h={12} w="70%" my="3xs" />
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>

        <WrapActions base={base} />
      </Stack>
    </Container>
  );
}

export default function DuelWrap({ category, sessionId, boardLoading, base }) {
  const board = useDuelBoard(category);
  const summary = useDuelSummaryQuery(category, sessionId, board.duelLayout, !boardLoading);
  const s = summary.data;

  if (summary.isError) {
    return (
      <Container className="duel-view" fluid px={0} py={0}>
        <Alert color="red" title="Couldn’t load the session summary">
          {errorMessage(summary.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="xs" component={Link} to={`${base}/duel`}>Back to the duel hub</Button></Group>
        </Alert>
      </Container>
    );
  }
  if (!s) return <WrapSkeleton base={base} />;

  return (
    <Container className="duel-view" fluid px={0} py={0}>
      <Stack gap={SECTION_GAP}>
        <PageHeader
          eyebrow={`Session done · ${s.duels} duels · ${minSec(s.seconds)}`}
          title={s.certainty > s.certaintyStart ? `Your ${category} board got sharper.` : `${category}: every duel counts.`}
        />

        <Paper withBorder radius="lg" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" style={{ alignItems: 'center' }}>
            <Stack gap="3xs">
              <SectionLabel>Board certainty</SectionLabel>
              <Group gap="sm" align="baseline">
                <Text ff="var(--font-display)" fw={700} fz="2xl" c="dimmed">{pct(s.certaintyStart)}</Text>
                <Text fz="xl" c="dimmed">→</Text>
                <Text ff="var(--font-display)" fw={900} fz="4xl">{pct(s.certainty)}</Text>
              </Group>
            </Stack>
            <Stack gap="xs">
              <Box pos="relative" h={14} style={{ borderRadius: 7, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <Box pos="absolute" top={0} bottom={0} left={0} w={pct(Math.max(s.certainty, s.certaintyStart))} style={{ background: 'var(--accent)' }} />
                <Box pos="absolute" top={0} bottom={0} left={0} w={pct(Math.min(s.certainty, s.certaintyStart))}
                  style={{ background: 'color-mix(in srgb, var(--accent) 45%, var(--surface-3))' }} />
              </Box>
              <Group gap="lg" fz="md">
                <Text fz="md"><b>{s.bordersSettled}</b> borders settled</Text>
                <Text fz="md"><b>{s.placed}</b> TODO songs placed</Text>
                <Text fz="md"><b>{s.tierOrders}</b> tier orders to tighten</Text>
              </Group>
            </Stack>
          </SimpleGrid>
        </Paper>

        <Stack gap="md">
          <Group justify="space-between" align="baseline">
            <Title order={2}>
              {s.newMoves.length} new move{s.newMoves.length === 1 ? '' : 's'} from this session
            </Title>
            <Anchor component={Link} to={`${base}/duel/moves`} fw={700} fz="md">Review all {s.movesWaiting} waiting →</Anchor>
          </Group>
          {s.newMoves.length > 0 && (
            <Paper withBorder radius="md">
              {s.newMoves.map((m) => (
                <Group key={m.song} px="lg" py="md" gap="md" style={{ borderBottom: '1px solid var(--border)' }} wrap="wrap">
                  <Text fw={700} style={{ flex: '1 1 200px' }}>
                    {board.nameOf(m.song)} <Text span c="dimmed" fw={500} fz="md">· {board.artistOf(m.song)}</Text>
                  </Text>
                  <Group gap="2xs"><TierChip tier={m.from} size={20} /><Text c="dimmed">→</Text><TierChip tier={m.to} size={20} /></Group>
                  <Text ff="monospace" fz="md" c="accent" w={50} ta="right">{pct(m.confidence)}</Text>
                </Group>
              ))}
            </Paper>
          )}
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="2xs">
              <SectionLabel>Biggest upset</SectionLabel>
              {s.upset ? (
                <>
                  <Text fz="lg">
                    <b>{board.nameOf(s.upset.winner)}</b> beat <b>{board.nameOf(s.upset.loser)}</b>
                    {s.upset.clearly ? ' - clearly.' : '.'} (It had a {pct(s.upset.odds)} chance.)
                  </Text>
                  <Text fz="md" c="dimmed">One upset moves scores, never tiers. If it keeps happening, you’ll see a move.</Text>
                </>
              ) : (
                <Text fz="md" c="dimmed">No surprises - every result went roughly the way the scores expected.</Text>
              )}
            </Stack>
          </Paper>
          <Paper withBorder radius="md" p="md">
            <Stack gap="2xs">
              <SectionLabel>Still undecided</SectionLabel>
              {s.undecided.length ? (
                <>
                  {s.undecided.map((p) => (
                    <Text key={`${p.a}|${p.b}`} fz="lg"><b>{board.nameOf(p.a)}</b> vs <b>{board.nameOf(p.b)}</b> - three “too close” in a row.</Text>
                  ))}
                  <Text fz="md" c="dimmed">Marked as equals. We’ll stop asking you about {s.undecided.length === 1 ? 'this pair' : 'these pairs'}.</Text>
                </>
              ) : (
                <Text fz="md" c="dimmed">No pair came out “too close” three times in a row.</Text>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>

        <WrapActions base={base} />
      </Stack>
    </Container>
  );
}
