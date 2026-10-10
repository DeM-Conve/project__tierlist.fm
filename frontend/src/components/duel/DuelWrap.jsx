import { Link } from 'react-router-dom';
import { Alert, Anchor, Box, Button, Container, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { TierChip } from '../TierBits';
import { useDuelSummaryQuery } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { pct } from '../../duel/duelText';
import { SectionLabel } from './DuelBits';

const minSec = (s) => `${Math.floor(s / 60)} min ${s % 60} s`;

export default function DuelWrap({ category, sessionId, boardLoading, base }) {
  const board = useDuelBoard(category);
  const summary = useDuelSummaryQuery(category, sessionId, board.duelLayout, !boardLoading);
  const s = summary.data;

  if (summary.isError) {
    return (
      <Container className="duel-view" size={980} py={64}>
        <Alert color="red" title="Couldn’t load the session summary">
          {errorMessage(summary.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="xs" component={Link} to={`${base}/duel`}>Back to the duel hub</Button></Group>
        </Alert>
      </Container>
    );
  }
  if (!s) return <Container className="duel-view" size={980} py={64}><Skeleton h={420} radius="lg" /></Container>;

  return (
    <Container className="duel-view" size={980} py={64}>
      <Stack gap={32}>
        <Stack gap={10} align="center" ta="center">
          <Text fz={13} fw={700} c="accent" tt="uppercase" style={{ letterSpacing: '0.14em' }}>
            Session done · {s.duels} duels · {minSec(s.seconds)}
          </Text>
          <Title order={1} fz={52} ff="var(--font-display)" fw={900} lh={1.05}>
            {s.certainty > s.certaintyStart ? `Your ${category} board got sharper.` : `${category}: every duel counts.`}
          </Title>
        </Stack>

        <Paper withBorder radius={18} p={28}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={28} style={{ alignItems: 'center' }}>
            <Stack gap={6}>
              <SectionLabel>Board certainty</SectionLabel>
              <Group gap={12} align="baseline">
                <Text ff="var(--font-display)" fw={700} fz={30} c="dimmed">{pct(s.certaintyStart)}</Text>
                <Text fz={22} c="dimmed">→</Text>
                <Text ff="var(--font-display)" fw={900} fz={56}>{pct(s.certainty)}</Text>
              </Group>
            </Stack>
            <Stack gap={10}>
              <Box pos="relative" h={14} style={{ borderRadius: 7, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <Box pos="absolute" top={0} bottom={0} left={0} w={pct(Math.max(s.certainty, s.certaintyStart))} style={{ background: 'var(--accent)' }} />
                <Box pos="absolute" top={0} bottom={0} left={0} w={pct(Math.min(s.certainty, s.certaintyStart))}
                  style={{ background: 'color-mix(in srgb, var(--accent) 45%, var(--surface-3))' }} />
              </Box>
              <Group gap={18} fz={14}>
                <Text fz={14}><b>{s.bordersSettled}</b> borders settled</Text>
                <Text fz={14}><b>{s.placed}</b> TODO songs placed</Text>
                <Text fz={14}><b>{s.tierOrders}</b> tier orders to tighten</Text>
              </Group>
            </Stack>
          </SimpleGrid>
        </Paper>

        <Stack gap={14}>
          <Group justify="space-between" align="baseline">
            <Title order={2} fz={22} ff="var(--font-display)">
              {s.newMoves.length} new move{s.newMoves.length === 1 ? '' : 's'} from this session
            </Title>
            <Anchor component={Link} to={`${base}/duel/moves`} fw={700} fz={14}>Review all {s.movesWaiting} waiting →</Anchor>
          </Group>
          {s.newMoves.length > 0 && (
            <Paper withBorder radius="md">
              {s.newMoves.map((m) => (
                <Group key={m.song} px={20} py={14} gap={14} style={{ borderBottom: '1px solid var(--border)' }} wrap="wrap">
                  <Text fw={700} style={{ flex: '1 1 200px' }}>
                    {board.nameOf(m.song)} <Text span c="dimmed" fw={500} fz={14}>· {board.artistOf(m.song)}</Text>
                  </Text>
                  <Group gap={8}><TierChip tier={m.from} size={20} /><Text c="dimmed">→</Text><TierChip tier={m.to} size={20} /></Group>
                  <Text ff="monospace" fz={14} c="accent" w={50} ta="right">{pct(m.confidence)}</Text>
                </Group>
              ))}
            </Paper>
          )}
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={14}>
          <Paper withBorder radius="md" p={20}>
            <Stack gap={8}>
              <SectionLabel>Biggest upset</SectionLabel>
              {s.upset ? (
                <>
                  <Text fz={16}>
                    <b>{board.nameOf(s.upset.winner)}</b> beat <b>{board.nameOf(s.upset.loser)}</b>
                    {s.upset.clearly ? ' - clearly.' : '.'} (It had a {pct(s.upset.odds)} chance.)
                  </Text>
                  <Text fz={14} c="dimmed">One upset moves scores, never tiers. If it keeps happening, you’ll see a move.</Text>
                </>
              ) : (
                <Text fz={14} c="dimmed">No surprises - every result went roughly the way the scores expected.</Text>
              )}
            </Stack>
          </Paper>
          <Paper withBorder radius="md" p={20}>
            <Stack gap={8}>
              <SectionLabel>Still undecided</SectionLabel>
              {s.undecided.length ? (
                <>
                  {s.undecided.map((p) => (
                    <Text key={`${p.a}|${p.b}`} fz={16}><b>{board.nameOf(p.a)}</b> vs <b>{board.nameOf(p.b)}</b> - three “too close” in a row.</Text>
                  ))}
                  <Text fz={14} c="dimmed">Marked as equals. We’ll stop asking you about {s.undecided.length === 1 ? 'this pair' : 'these pairs'}.</Text>
                </>
              ) : (
                <Text fz={14} c="dimmed">No pair came out “too close” three times in a row.</Text>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>

        <Group justify="center" gap={12}>
          <Button size="lg" component={Link} to={`${base}/duel/moves`}>Review moves</Button>
          <Button size="lg" variant="light" color="gray" component={Link} to={`${base}/duel`}>Another session</Button>
          <Button size="lg" variant="default" component={Link} to={base}>Back to board</Button>
        </Group>
      </Stack>
    </Container>
  );
}
