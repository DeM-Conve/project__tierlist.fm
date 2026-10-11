import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Alert, Anchor, Badge, Button, Container, Group, Kbd, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, Title,
  UnstyledButton,
} from '@mantine/core';
import { Swords } from 'lucide-react';
import { useDuelAnalysisQuery, useStartDuelMutation } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { pct } from '../../duel/duelText';
import { ScoreMap, StatCard } from './DuelBits';
import { MoveRow } from './DuelMoves';
import { SongPickerButton } from './SongPicker';
import PageHeader from '../PageHeader';
import { SECTION_GAP } from '../../layout/spacing';
import { useDevicePref } from '../../settings';

// Values are settings.js DEVICE_UI.duelMinutes' - keep in step.
const LENGTHS = [
  { value: '2', label: 'Quick · 2 min' },
  { value: '5', label: 'Session · 5 min' },
  { value: '15', label: 'Deep · 15 min' },
];

// What a session sharpens - the backend picks pairs per focus (fm.tierlist.duel.engine.pairing).
// Before the analysis arrives (`data` null) the cards keep their titles and
// layout; the hub draws their data-dependent text as Skeleton lines.
function focusCards(data, minutes) {
  if (!data) data = { unplaced: 0, onFence: 0, loading: true };
  return [
    { focus: 'SMART_MIX', title: 'Smart mix', recommended: true, body: 'We choose whichever duel would settle the most among your ranked songs - borderlines, shaky rankings. To-do songs stay out.', meta: `~${minutes * 6} duels` },
    { focus: 'PLACE_TODO', title: 'Place TODO songs', body: 'No tier guess needed. Each new song meets anchors from across the board and lands where it wins.', meta: `${data.unplaced} waiting · 5–10 duels each`, disabled: data.loading || !data.unplaced },
    { focus: 'BORDERLINES', title: 'Borderlines only', body: `Just the ${data.onFence} ringed dots. The fastest way to clean up songs filed a tier off.`, meta: `${data.onFence} songs · ~3 duels each`, disabled: data.loading || !data.onFence },
    { focus: 'ONE_SONG', title: 'One song', body: 'Pin a track and find its true spot - tier and rank - in a handful of duels.', disabled: data.loading },
  ];
}

// The Duel hub: how settled the board is, the score map, what to sharpen, moves ready.
export default function DuelHub({ category, boardLoading, base }) {
  const navigate = useNavigate();
  const board = useDuelBoard(category);
  const analysis = useDuelAnalysisQuery(category, board.duelLayout, !boardLoading);
  const start = useStartDuelMutation(category);
  // The session length is remembered on this device (settings.js DEVICE_UI);
  // the focus starts on Smart mix each time - the others depend on the board.
  const [minutes, setMinutes] = useDevicePref('duelMinutes');
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
      <Container className="duel-view" fluid px={0} py={0}>
        <Alert color="red" title="Couldn’t load this board’s duels">
          {errorMessage(analysis.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="xs" onClick={() => analysis.refetch()}>Retry</Button></Group>
        </Alert>
      </Container>
    );
  }

  const muOf = (id) => data?.songs.find((x) => x.id === id)?.mu;
  const songOptions = data
    ? data.songs.filter((s) => s.tier).map((s) => ({ id: s.id, tier: s.tier, video: board.videoOf(s.id) }))
    : [];

  return (
    <Container className="duel-view" fluid px={0} py={0}>
      <Stack gap={SECTION_GAP}>
        <PageHeader
          eyebrow={`${category} · Duel`}
          title="Settle the board."
          meta="Every duel nudges a hidden score. A song changes tier only when the evidence is overwhelming - and only after you approve the move."
          actions={
          <Stack align="flex-end" gap="2xs">
            <SegmentedControl value={minutes} onChange={setMinutes} data={LENGTHS} aria-label="Session length" />
            <Button leftSection={<Swords size={18} />} rightSection={<Kbd size="xs">Enter</Kbd>} onClick={begin}
              loading={start.isPending} disabled={!canStart}>
              {data?.activeSession ? 'Start a new session' : 'Start duelling'}
            </Button>
            {data?.activeSession && (
              <Anchor component={Link} to={`${base}/duel/play/${data.activeSession}`} fz="md" fw={700}>
                Resume the session in progress →
              </Anchor>
            )}
          </Stack>
          }
        />
        {start.isError && <Alert color="red">{errorMessage(start.error, 'Couldn’t start the session.')}</Alert>}

        {/* Loading draws the same sections (headings, cards, map) with
            Skeleton blocks where the numbers go, so nothing jumps when they land. */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <StatCard label="Board certainty" loading={!data} value={data && pct(data.certainty)} aside={data ? `${data.duelsTotal} duels so far` : ''}>
            <Text fz="md" c="dimmed">How sure the model is that each song sits in the right tier.</Text>
          </StatCard>
          <StatCard label="Moves waiting" loading={!data} value={data?.suggestions.length} highlight={data?.suggestions.length > 0}
            aside={data ? `${data.suggestions.filter((s) => s.confidence >= 0.9).length} at ≥90% confidence` : ''}
            onClick={data ? () => navigate(`${base}/duel/moves`) : undefined}>
            <Text fz="md" fw={600}>Review suggestions →</Text>
          </StatCard>
          <StatCard label="On the fence" loading={!data} value={data?.onFence}>
            <Text fz="md" c="dimmed">Songs within reach of a neighbouring tier.</Text>
          </StatCard>
        </SimpleGrid>

        <Paper withBorder radius="lg" p="md">
          <Stack gap="lg">
            <Group justify="space-between" align="baseline" wrap="wrap">
              <Stack gap="4xs">
                <Title order={2}>Score map</Title>
                <Text fz="md" c="dimmed">Each dot is a song, placed by its score. Ringed dots sit on a border - that is where duels go first.</Text>
              </Stack>
            </Group>
            {data ? <ScoreMap analysis={data} nameOf={board.nameOf} /> : <Skeleton h={150} radius={10} data-testid="score-map-skeleton" />}
            <Text fz="md" c="dimmed" mt="2xs">Lower score ← → Higher score · borders are learned from where you already put songs</Text>
          </Stack>
        </Paper>

        <Stack gap="md">
          <Title order={2}>What should this session sharpen?</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {focusCards(data, Number(minutes)).map((c) => (
              <UnstyledButton key={c.focus} disabled={c.disabled} onClick={() => setFocus(c.focus)}
                style={{ opacity: c.disabled && data ? 0.5 : 1 }}>
                <Paper withBorder radius="lg" p="md" h="100%" className={c.disabled ? undefined : 'duel-card'}
                  style={{
                    borderColor: focus === c.focus ? 'var(--accent)' : undefined,
                    borderWidth: focus === c.focus ? 2 : undefined,
                    background: focus === c.focus ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : undefined,
                  }}>
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text ff="var(--font-display)" fw={800} fz="xl">{c.title}</Text>
                      {c.recommended && <Badge>Recommended</Badge>}
                    </Group>
                    {data ? (
                      <Text fz="md" c="dimmed">{c.body}</Text>
                    ) : (
                      <Stack gap="2xs" py="4xs">{[100, 92, 60].map((w) => <Skeleton key={w} h={12} w={`${w}%`} />)}</Stack>
                    )}
                    {c.meta && (data
                      ? <Text fz="md" fw={700} c={focus === c.focus ? 'accent' : 'dimmed'}>{c.meta}</Text>
                      : <Skeleton h={12} w="45%" my="4xs" />)}
                    {c.focus === 'ONE_SONG' && (
                      <SongPickerButton category={category} songs={songOptions} value={songId} disabled={!data}
                        active={focus === 'ONE_SONG'} onChange={(v) => { setSongId(v); setFocus('ONE_SONG'); }} />
                    )}
                  </Stack>
                </Paper>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </Stack>

        {data?.suggestions.length > 0 && (
          <Stack gap="md">
            <Group justify="space-between" align="baseline">
              <Title order={2}>Ready to move</Title>
              <Anchor component={Link} to={`${base}/duel/moves`} fw={700} fz="md">Review all {data.suggestions.length} →</Anchor>
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
      </Stack>
    </Container>
  );
}
