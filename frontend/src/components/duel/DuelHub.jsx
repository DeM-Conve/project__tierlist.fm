import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Alert, Anchor, Badge, Button, Container, Group, Kbd, Paper, Select, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, Title,
  UnstyledButton,
} from '@mantine/core';
import { Swords } from 'lucide-react';
import { useDuelAnalysisQuery, useStartDuelMutation } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { pct } from '../../duel/duelText';
import { ScoreMap, StatCard } from './DuelBits';
import { MoveRow } from './DuelMoves';

const LENGTHS = [
  { value: '2', label: 'Quick · 2 min' },
  { value: '5', label: 'Session · 5 min' },
  { value: '15', label: 'Deep · 15 min' },
];

// What a session sharpens - the backend picks pairs per focus (fm.tierlist.duel.engine.pairing).
function focusCards(data, minutes) {
  return [
    { focus: 'SMART_MIX', title: 'Smart mix', recommended: true, body: 'We choose whichever duel would settle the most - borderlines, fresh placements, shaky rankings.', meta: `~${minutes * 6} duels` },
    { focus: 'PLACE_TODO', title: 'Place TODO songs', body: 'No tier guess needed. Each new song meets anchors from across the board and lands where it wins.', meta: `${data.unplaced} waiting · ~5 duels each`, disabled: !data.unplaced },
    { focus: 'BORDERLINES', title: 'Borderlines only', body: `Just the ${data.onFence} ringed dots. The fastest way to clean up songs filed a tier off.`, meta: `${data.onFence} songs · ~3 duels each`, disabled: !data.onFence },
    { focus: 'ONE_SONG', title: 'One song', body: 'Pin a track and find its true spot - tier and rank - in a handful of duels.' },
  ];
}

// The Duel hub: how settled the board is, the score map, what to sharpen, moves ready.
export default function DuelHub({ category, boardLoading, base }) {
  const navigate = useNavigate();
  const board = useDuelBoard(category);
  const analysis = useDuelAnalysisQuery(category, board.duelLayout, !boardLoading);
  const start = useStartDuelMutation(category);
  const [minutes, setMinutes] = useState('5');
  const [focus, setFocus] = useState('SMART_MIX');
  const [songId, setSongId] = useState(null);
  const data = analysis.data;

  const canStart = data && !start.isPending && (focus !== 'ONE_SONG' || songId);
  function begin() {
    if (!canStart) return;
    start.mutate(
      { layout: board.duelLayout.layout, focus, songId: focus === 'ONE_SONG' ? songId : null, minutes: Number(minutes) },
      { onSuccess: (s) => navigate(`${base}/duel/play/${s.id}`) }
    );
  }
  useHotkeys('enter', begin, { preventDefault: true }, [canStart, focus, songId, minutes]);

  if (analysis.isError) {
    return (
      <Container className="duel-view" size={1280} py={48}>
        <Alert color="red" title="Couldn’t load this board’s duels">
          {errorMessage(analysis.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="xs" onClick={() => analysis.refetch()}>Retry</Button></Group>
        </Alert>
      </Container>
    );
  }

  const muOf = (id) => data?.songs.find((x) => x.id === id)?.mu;
  const songOptions = data
    ? data.songs.map((s) => ({ value: s.id, label: board.nameOf(s.id) }))
    : [];

  return (
    <Container className="duel-view" size={1280} py={48}>
      <Stack gap={36}>
        <Group justify="space-between" align="flex-end" wrap="wrap" gap={24}>
          <Stack gap={10} maw={720}>
            <Text fz={13} fw={700} c="accent" tt="uppercase" style={{ letterSpacing: '0.14em' }}>{category} · Duel</Text>
            <Title order={1} fz={52} ff="var(--font-display)" fw={900} lh={1}>Settle the board.</Title>
            <Text fz={17} c="dimmed">
              Every duel nudges a hidden score. A song changes tier only when the evidence is overwhelming - and only after you approve the move.
            </Text>
          </Stack>
          <Stack align="flex-end" gap={12}>
            <SegmentedControl value={minutes} onChange={setMinutes} data={LENGTHS} aria-label="Session length" />
            <Button size="lg" leftSection={<Swords size={18} />} rightSection={<Kbd size="xs">Enter</Kbd>} onClick={begin}
              loading={start.isPending} disabled={!canStart}>
              {data?.activeSession ? 'Start a new session' : 'Start duelling'}
            </Button>
            {data?.activeSession && (
              <Anchor component={Link} to={`${base}/duel/play/${data.activeSession}`} fz={14} fw={700}>
                Resume the session in progress →
              </Anchor>
            )}
          </Stack>
        </Group>
        {start.isError && <Alert color="red">{errorMessage(start.error, 'Couldn’t start the session.')}</Alert>}

        {!data ? (
          <Stack gap={16}>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={130} radius="md" />)}</SimpleGrid>
            <Skeleton h={230} radius="md" />
          </Stack>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={16}>
              <StatCard label="Board certainty" value={pct(data.certainty)} aside={`${data.duelsTotal} duels so far`}>
                <Text fz={14} c="dimmed">How sure the model is that each song sits in the right tier.</Text>
              </StatCard>
              <StatCard label="Moves waiting" value={data.suggestions.length} highlight={data.suggestions.length > 0}
                aside={`${data.suggestions.filter((s) => s.confidence >= 0.9).length} at ≥90% confidence`}
                onClick={() => navigate(`${base}/duel/moves`)}>
                <Text fz={14} fw={600}>Review suggestions →</Text>
              </StatCard>
              <StatCard label="On the fence" value={data.onFence} aside={`+ ${data.unplaced} unplaced`}>
                <Text fz={14} c="dimmed">Songs within reach of a neighbouring tier.</Text>
              </StatCard>
            </SimpleGrid>

            <Paper withBorder radius="lg" p={28} pb={40}>
              <Stack gap={18}>
                <Group justify="space-between" align="baseline" wrap="wrap">
                  <Stack gap={4}>
                    <Title order={2} fz={22} ff="var(--font-display)">Score map</Title>
                    <Text fz={14} c="dimmed">Each dot is a song, placed by its score. Ringed dots sit on a border - that is where duels go first.</Text>
                  </Stack>
                </Group>
                <ScoreMap analysis={data} nameOf={board.nameOf} />
                <Text fz={13} c="dimmed" mt={8}>Lower score ← → Higher score · borders are learned from where you already put songs</Text>
              </Stack>
            </Paper>

            <Stack gap={14}>
              <Title order={2} fz={22} ff="var(--font-display)">What should this session sharpen?</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing={14}>
                {focusCards(data, Number(minutes)).map((c) => (
                  <UnstyledButton key={c.focus} disabled={c.disabled} onClick={() => setFocus(c.focus)}
                    style={{ opacity: c.disabled ? 0.5 : 1 }}>
                    <Paper withBorder radius="lg" p={20} h="100%" className={c.disabled ? undefined : 'duel-card'}
                      style={{
                        borderColor: focus === c.focus ? 'var(--accent)' : undefined,
                        borderWidth: focus === c.focus ? 2 : undefined,
                        background: focus === c.focus ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : undefined,
                      }}>
                      <Stack gap={10}>
                        <Group justify="space-between">
                          <Text ff="var(--font-display)" fw={800} fz={18}>{c.title}</Text>
                          {c.recommended && <Badge>Recommended</Badge>}
                        </Group>
                        <Text fz={14} c="dimmed">{c.body}</Text>
                        {c.meta && <Text fz={13} fw={700} c={focus === c.focus ? 'accent' : 'dimmed'}>{c.meta}</Text>}
                        {c.focus === 'ONE_SONG' && (
                          <Select searchable placeholder={`Search ${category}…`} data={songOptions} value={songId}
                            onChange={(v) => { setSongId(v); setFocus('ONE_SONG'); }} onClick={(e) => e.stopPropagation()}
                            limit={50} nothingFoundMessage="No song by that name" />
                        )}
                      </Stack>
                    </Paper>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            </Stack>

            {data.suggestions.length > 0 && (
              <Stack gap={14}>
                <Group justify="space-between" align="baseline">
                  <Title order={2} fz={22} ff="var(--font-display)">Ready to move</Title>
                  <Anchor component={Link} to={`${base}/duel/moves`} fw={700} fz={14}>Review all {data.suggestions.length} →</Anchor>
                </Group>
                <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
                  {data.suggestions.slice(0, 3).map((s) => (
                    <MoveRow key={s.song} s={s} board={board}
                      detail={`won ${s.wins} of ${s.wins + s.losses + s.draws}`}
                      onSelect={() => navigate(`${base}/duel/moves`)}
                      onMove={() => board.accept(s, muOf)}
                      onKeep={() => board.keep(s)} />
                  ))}
                </Paper>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
