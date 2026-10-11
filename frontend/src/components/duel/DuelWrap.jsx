import { Link } from 'react-router-dom';
import { Alert, Anchor, Button, Container, Grid, Group, Paper, Progress, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { TierChip } from '../TierBits';
import { useDuelSummaryQuery } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { pct } from '../../duel/duelText';
import { SectionLabel } from './DuelBits';
import PageHeader from '../PageHeader';
import { SECTION_GAP } from '../../layout/spacing';
import { useTierName } from '../../tierLabels';
import { TODO_TIER } from '../../tiers';

const minSec = (s) => `${Math.floor(s / 60)} min ${s % 60} s`;

// Where to go next, in the page header like every page's actions:
// secondaries first, the one primary last (the app's button order - see
// CLAUDE.md). Static, so the loading state shows it too.
function WrapActions({ base }) {
  return (
    <>
      <Button variant="default" component={Link} to={base}>Back to board</Button>
      <Button variant="default" component={Link} to={`${base}/duel`}>Another session</Button>
      <Button component={Link} to={`${base}/duel/moves`}>Review moves</Button>
    </>
  );
}

// One count, laid out like the certainty card beside it (label, then the
// number) so the row reads as one band.
function Stat({ value, label }) {
  return (
    <Paper withBorder radius="md" p="md" h="100%">
      <Stack gap="xs">
        <SectionLabel>{label}</SectionLabel>
        {value == null ? <Skeleton h={32} w={48} radius="sm" /> : <Text ff="var(--font-display)" fw={900} fz="4xl" lh={1}>{value}</Text>}
      </Stack>
    </Paper>
  );
}

// The session summary. One tree for loading and loaded (Skeletons where the
// numbers go), so nothing moves when the summary arrives:
//   header (+ actions)
//   [certainty: before -> after, bar]   [3 stat tiles]
//   [this session's moves              ]  [upset / undecided]
export default function DuelWrap({ category, sessionId, boardLoading, base }) {
  const board = useDuelBoard(category);
  const tierName = useTierName();
  const summary = useDuelSummaryQuery(category, sessionId, board.duelLayout, !boardLoading);
  const s = summary.data;

  if (summary.isError) {
    return (
      <Container className="duel-view" fluid px={0} py={0}>
        <Alert color="red" title="Couldn’t load the session summary">
          {errorMessage(summary.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="compact-sm" component={Link} to={`${base}/duel`}>Back to the duel hub</Button></Group>
        </Alert>
      </Container>
    );
  }

  const lo = s ? Math.min(s.certainty, s.certaintyStart) : 0;
  const hi = s ? Math.max(s.certainty, s.certaintyStart) : 0;

  return (
    <Container className="duel-view" fluid px={0} py={0} data-testid={s ? undefined : 'wrap-skeleton'}>
      <Stack gap={SECTION_GAP}>
        <PageHeader
          eyebrow={s && `Session done · ${s.duels} duels · ${minSec(s.seconds)}`}
          crumb={s ? undefined : <Skeleton h={12} w={260} />}
          title={s
            ? (s.certainty > s.certaintyStart ? `Your ${category} board got sharper.` : `${category}: every duel counts.`)
            : <Skeleton h={30} w={420} radius="sm" />}
          actions={<WrapActions base={base} />}
        />

        <Grid gutter="md" align="stretch">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Paper withBorder radius="md" p="md" h="100%">
              <Stack gap="xs">
                <SectionLabel>Board certainty</SectionLabel>
                {s ? (
                  <Group gap="sm" align="baseline">
                    <Text ff="var(--font-display)" fw={700} fz="2xl" c="dimmed">{pct(s.certaintyStart)}</Text>
                    <Text fz="xl" c="dimmed">→</Text>
                    <Text ff="var(--font-display)" fw={900} fz="4xl" lh={1}>{pct(s.certainty)}</Text>
                  </Group>
                ) : <Skeleton h={32} w={200} radius="sm" />}
                {/* Before -> after on one bar: the part both share, then the change. */}
                <Progress.Root size={10} transitionDuration={0} aria-label="Board certainty, before and after">
                  <Progress.Section value={lo * 100} color="color-mix(in srgb, var(--accent) 45%, var(--surface-3))" />
                  <Progress.Section value={(hi - lo) * 100} color="var(--accent)" />
                </Progress.Root>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md" h="100%">
              <Stat value={s?.bordersSettled} label="Borders settled" />
              <Stat value={s?.placed} label={`${tierName(TODO_TIER)} songs placed`} />
              <Stat value={s?.tierOrders} label="Tier orders to tighten" />
            </SimpleGrid>
          </Grid.Col>
        </Grid>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="xs">
              <Group justify="space-between" align="baseline">
                {s ? (
                  <Title order={2}>{s.newMoves.length} new move{s.newMoves.length === 1 ? '' : 's'} from this session</Title>
                ) : <Skeleton h={20} w={280} />}
                {s ? (
                  <Anchor component={Link} to={`${base}/duel/moves`} fw={700} fz="md">Review all {s.movesWaiting} waiting →</Anchor>
                ) : <Skeleton h={14} w={140} />}
              </Group>
              <Paper withBorder radius="md">
                {!s && [0, 1].map((i) => (
                  <Group key={i} px="md" py="sm" gap="md" style={{ borderBottom: '1px solid var(--border)' }}>
                    <Skeleton h={14} style={{ flex: '1 1 200px' }} my="3xs" />
                    <Skeleton h={20} w={64} radius="sm" />
                    <Skeleton h={12} w={40} />
                  </Group>
                ))}
                {s && s.newMoves.length === 0 && (
                  <Text fz="md" c="dimmed" px="md" py="sm">No song crossed a border this session - the board held.</Text>
                )}
                {s?.newMoves.map((m, i) => (
                  <Group key={`${m.song}-${i}`} px="md" py="sm" gap="md" wrap="wrap"
                    style={{ borderBottom: i < s.newMoves.length - 1 ? '1px solid var(--border)' : undefined }}>
                    <Text fw={700} style={{ flex: '1 1 200px' }} truncate>
                      {board.nameOf(m.song)} <Text span c="dimmed" fw={500} fz="md">· {board.artistOf(m.song)}</Text>
                    </Text>
                    <Group gap="2xs"><TierChip tier={m.from} size={20} /><Text c="dimmed">→</Text><TierChip tier={m.to} size={20} /></Group>
                    <Text ff="monospace" fz="md" c="accent" w={40} ta="right">{pct(m.confidence)}</Text>
                  </Group>
                ))}
              </Paper>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <Paper withBorder radius="md" p="md">
                <Stack gap="2xs">
                  <SectionLabel>Biggest upset</SectionLabel>
                  {!s && <><Skeleton h={14} w="90%" my="3xs" /><Skeleton h={12} w="70%" my="3xs" /></>}
                  {s && (s.upset ? (
                    <>
                      <Text fz="lg">
                        <b>{board.nameOf(s.upset.winner)}</b> beat <b>{board.nameOf(s.upset.loser)}</b>
                        {s.upset.clearly ? ' - clearly.' : '.'} (It had a {pct(s.upset.odds)} chance.)
                      </Text>
                      <Text fz="md" c="dimmed">One upset moves scores, never tiers. If it keeps happening, you’ll see a move.</Text>
                    </>
                  ) : (
                    <Text fz="md" c="dimmed">No surprises - every result went roughly the way the scores expected.</Text>
                  ))}
                </Stack>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Stack gap="2xs">
                  <SectionLabel>Still undecided</SectionLabel>
                  {!s && <><Skeleton h={14} w="90%" my="3xs" /><Skeleton h={12} w="70%" my="3xs" /></>}
                  {s && (s.undecided.length ? (
                    <>
                      {s.undecided.map((p) => (
                        <Text key={`${p.a}|${p.b}`} fz="lg"><b>{board.nameOf(p.a)}</b> vs <b>{board.nameOf(p.b)}</b> - three “too close” in a row.</Text>
                      ))}
                      <Text fz="md" c="dimmed">Marked as equals. We’ll stop asking you about {s.undecided.length === 1 ? 'this pair' : 'these pairs'}.</Text>
                    </>
                  ) : (
                    <Text fz="md" c="dimmed">No pair came out “too close” three times in a row.</Text>
                  ))}
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
