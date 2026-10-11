import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Accordion, Alert, Anchor, Badge, Box, Button, Checkbox, Chip, Container, Group, Kbd, Paper, Skeleton, Stack, Table, Text, Title,
  UnstyledButton,
} from '@mantine/core';
import { ArrowDown, ArrowUp, Play, Square } from 'lucide-react';
import { useTierName } from '../../tierLabels';
import { TIER_ORDER } from '../../tiers';
import { TierChip } from '../TierBits';
import EmbeddedPlayer from '../EmbeddedPlayer';
import { useDuelAnalysisQuery } from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import { leaningText, moveKind, orderChanges, pct, record, shortfallText } from '../../duel/duelText';
import { ProbabilityBars, ScoreTrend, SectionLabel, SongArt } from './DuelBits';
import PageHeader from '../PageHeader';
import { SECTION_GAP } from '../../layout/spacing';

// One suggested move: song, from -> to, confidence, Move / Keep (or what was decided, with Undo).
// `leaning`: short of the bar - the confidence bar is drawn faint.
export function MoveRow({ s, board, selected, decided, onSelect, onMove, onKeep, onUndo, detail, leaning = false }) {
  const tierName = useTierName();
  return (
    <Group
      wrap="wrap"
      gap="md"
      px="lg"
      py="sm"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--surface-2)' : undefined,
        boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
      }}
    >
      <UnstyledButton onClick={onSelect} style={{ flex: '1 1 260px', minWidth: 0 }} aria-label={`Show evidence for ${board.nameOf(s.song)}`}>
        <Group gap="md" wrap="nowrap">
          <SongArt video={board.videoOf(s.song)} />
          <Box miw={0}>
            <Text fw={700} truncate="end">{board.nameOf(s.song)}</Text>
            <Text fz="md" c="dimmed" truncate="end">
              {board.artistOf(s.song)} · {detail ?? `${record(s)} (W–L–D)`}
            </Text>
          </Box>
        </Group>
      </UnstyledButton>
      <Group gap="2xs" w={130} wrap="nowrap">
        <TierChip tier={s.from} size={20} />
        <Text c="dimmed">→</Text>
        <TierChip tier={s.to} size={20} />
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Box h={6} style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
          <Box h="100%" w={pct(s.confidence)} style={{ background: leaning ? 'var(--text-faint)' : 'var(--accent)' }} />
        </Box>
        <Text ff="monospace" fz="md">{pct(s.confidence)}</Text>
      </Group>
      {decided ? (
        <Group gap="xs" miw={150}>
          <Text fz="md" fw={700} c={decided === 'move' ? 'accent' : 'dimmed'}>
            {decided === 'move' ? `Moved to ${tierName(s.to)}` : `Kept in ${tierName(s.from)}`}
          </Text>
          <Anchor component="button" fz="md" c="dimmed" onClick={onUndo}>Undo</Anchor>
        </Group>
      ) : (
        <Group gap="3xs" miw={150}>
          <Button variant="default" onClick={onKeep}>Keep</Button>
          <Button onClick={onMove}>Move</Button>
        </Group>
      )}
    </Group>
  );
}

// MoveRow's exact shape (same Group, paddings and column widths) with
// Skeleton blocks for the song, the tier change, the bar and the buttons.
function MoveRowSkeleton() {
  return (
    <Group wrap="wrap" gap="md" px="lg" py="sm" style={{ borderBottom: '1px solid var(--border)' }} data-testid="move-row-skeleton">
      <Group gap="md" wrap="nowrap" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Skeleton w={44} h={44} radius="sm" style={{ flexShrink: 0 }} />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Skeleton h={12} w="55%" />
          <Skeleton h={10} w="35%" />
        </Stack>
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Skeleton w={20} h={20} radius={4} />
        <Text c="dimmed">→</Text>
        <Skeleton w={20} h={20} radius={4} />
      </Group>
      <Group gap="2xs" w={130} wrap="nowrap">
        <Skeleton h={6} style={{ flex: 1 }} />
        <Skeleton h={10} w={30} />
      </Group>
      <Group gap="3xs" miw={150}>
        <Skeleton h={36} w={68} radius="sm" />
        <Skeleton h={36} w={64} radius="sm" />
      </Group>
    </Group>
  );
}

// The evidence panel's sections (real labels) with Skeleton content.
function EvidenceSkeleton() {
  return (
    <Paper withBorder radius="lg" p="md" style={{ flex: '1 1 380px' }} data-testid="evidence-skeleton">
      <Stack gap="lg">
        <Group gap="md" wrap="nowrap">
          <Skeleton w={60} h={60} radius="sm" style={{ flexShrink: 0 }} />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Skeleton h={18} w="70%" />
            <Skeleton h={12} w="40%" />
          </Stack>
          <Skeleton w={48} h={48} circle />
        </Group>
        <Stack gap="xs">
          <SectionLabel>Where it belongs</SectionLabel>
          <Stack gap="2xs">
            {[0, 1, 2].map((i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <Skeleton w={22} h={22} radius={4} />
                <Skeleton h={10} style={{ flex: 1 }} />
                <Skeleton h={10} w={40} />
              </Group>
            ))}
          </Stack>
        </Stack>
        <Stack gap="2xs">
          <Group justify="space-between">
            <SectionLabel>Score over duels</SectionLabel>
            <Text fz="sm" c="dimmed">dashed = tier border</Text>
          </Group>
          <Skeleton h={80} />
        </Stack>
        <Stack gap="4xs">
          <SectionLabel>Key results</SectionLabel>
          {[0, 1].map((i) => (
            <Group key={i} justify="space-between" py="3xs" style={{ borderBottom: '1px solid var(--border-soft)' }} wrap="nowrap">
              <Skeleton h={12} w="50%" />
              <Skeleton w={20} h={20} radius={4} />
            </Group>
          ))}
        </Stack>
        <Group gap="2xs" grow>
          <Skeleton h={42} radius="sm" />
          <Skeleton h={42} radius="sm" />
        </Group>
      </Stack>
    </Paper>
  );
}

const KEY_HINTS = [['↑', '↓', 'browse'], ['M', 'move'], ['X', 'keep'], ['L', 'lock tier'], ['P', 'play']];

function KeyHints() {
  return (
    <Group gap="lg" px="lg" py="md" wrap="wrap">
      {KEY_HINTS.map((k) => (
        <Group key={k.at(-1)} gap="4xs">
          {k.slice(0, -1).map((x) => <Kbd key={x} size="xs">{x}</Kbd>)}
          <Text fz="md" c="dimmed">{k.at(-1)}</Text>
        </Group>
      ))}
    </Group>
  );
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'up', label: 'Up a tier' },
  { value: 'down', label: 'Down a tier' },
  { value: 'new', label: 'New placements' },
];

// "Suggested moves": the duels built the case; nothing moves until you say so.
export default function DuelMoves({ category, boardLoading, base }) {
  const tierName = useTierName();
  const board = useDuelBoard(category);
  const analysis = useDuelAnalysisQuery(category, board.duelLayout, !boardLoading);
  const [filter, setFilter] = useState('all');
  const [decided, setDecided] = useState({}); // song -> { s, kind, lean }
  const [selected, setSelected] = useState(null);
  const [previewSong, setPreviewSong] = useState(null);

  const data = analysis.data;
  const muOf = (id) => data?.songs.find((x) => x.id === id)?.mu;

  // Decided rows stay listed (with Undo), in the list they came from, after the analysis drops them.
  const [rows, leaningRows] = useMemo(() => {
    if (!data) return [[], []];
    const list = (live, lean) => [
      ...live.filter((s) => !decided[s.song]),
      ...Object.values(decided).filter((d) => !!d.lean === lean).map((d) => d.s),
    ].sort((a, b) => b.confidence - a.confidence);
    return [list(data.suggestions, false), list(data.leaning ?? [], true)];
  }, [data, decided]);
  const counts = { all: rows.length, up: 0, down: 0, new: 0 };
  rows.forEach((s) => (counts[moveKind(s.from, s.to)] += 1));
  const byFilter = (list) => (filter === 'all' ? list : list.filter((s) => moveKind(s.from, s.to) === filter));
  const shown = byFilter(rows);
  const shownLeaning = byFilter(leaningRows);
  const isLeaning = (s) => leaningRows.includes(s);
  // Browsing (keys, the evidence panel) walks the suggested moves, then the leaning ones.
  const browsable = [...shown, ...shownLeaning];
  const current = browsable.find((s) => s.song === selected) ?? browsable[0];
  const sure = rows.filter((s) => !decided[s.song] && s.confidence >= 0.9);

  // The preview belongs to one song: selecting another stops it.
  const previewing = !!current && previewSong === current.song;
  const togglePreview = () => setPreviewSong((p) => (p === current?.song ? null : current?.song));

  const move = (s) => {
    board.accept(s, muOf);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'move', lean: isLeaning(s) } }));
  };
  const keep = (s) => {
    board.keep(s);
    setDecided((d) => ({ ...d, [s.song]: { s, kind: 'keep', lean: isLeaning(s) } }));
  };
  const undo = (s) => {
    board.undo(s, decided[s.song]?.kind === 'move');
    setDecided((d) => Object.fromEntries(Object.entries(d).filter(([song]) => song !== s.song)));
  };
  const [locked, setLocked] = useState({});
  const toggleLock = (id) => {
    const next = !locked[id];
    board.setLocked(id, next);
    setLocked((l) => ({ ...l, [id]: next }));
  };

  const browse = (step) => {
    const i = browsable.findIndex((s) => s.song === current?.song);
    const next = browsable[Math.max(0, Math.min(browsable.length - 1, i + step))];
    if (next) setSelected(next.song);
  };
  useHotkeys('down', () => browse(1), { preventDefault: true }, [browsable, current]);
  useHotkeys('up', () => browse(-1), { preventDefault: true }, [browsable, current]);
  useHotkeys('m', () => current && !decided[current.song] && move(current), [current, decided]);
  useHotkeys('x', () => current && !decided[current.song] && keep(current), [current, decided]);
  useHotkeys('l', () => current && toggleLock(current.song), [current, locked]);
  useHotkeys('p', () => current && togglePreview(), [current, previewSong]);

  if (analysis.isError) {
    return (
      <Container className="duel-view" fluid px={0} py={0}>
        <Alert color="red" title="Couldn’t load the suggested moves">
          {errorMessage(analysis.error, 'The app couldn’t reach the server.')}
          <Group mt="sm"><Button size="compact-sm" onClick={() => analysis.refetch()}>Retry</Button></Group>
        </Alert>
      </Container>
    );
  }

  const currentSong = current && data?.songs.find((x) => x.id === current.song);
  // The dashed line: the border nearest the song's score.
  const border = currentSong && data.borders.reduce((best, b) => (!best || Math.abs(b.score - currentSong.mu) < Math.abs(best.score - currentSong.mu) ? b : best), null);

  return (
    <Container className="duel-view" fluid px={0} py={0}>
      <Stack gap={SECTION_GAP}>
        <PageHeader
          crumb={
            <Anchor component={Link} to={`${base}/duel`} fz="xs" c="dimmed">
              ← {category} · Duel
            </Anchor>
          }
          title="Suggested moves"
          meta="Your duels built the case. Nothing moves until you say so - then push to YouTube as usual."
          actions={
            <Button disabled={!sure.length} onClick={() => sure.forEach(move)}>
              Move all {sure.length} at ≥90%
            </Button>
          }
        />

        <Chip.Group value={filter} onChange={setFilter}>
          <Group gap="2xs">
            {FILTERS.map((f) => (
              <Chip key={f.value} value={f.value} variant="light">
                {f.label} · {counts[f.value]}
              </Chip>
            ))}
          </Group>
        </Chip.Group>

        {/* Loading keeps the two-column layout: skeleton rows on the left,
            the evidence panel's sections on the right. */}
        {!data ? (
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Paper withBorder radius="lg" style={{ flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
              {[0, 1, 2, 3, 4].map((i) => <MoveRowSkeleton key={i} />)}
              <KeyHints />
            </Paper>
            <EvidenceSkeleton />
          </Group>
        ) : (
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Paper withBorder radius="lg" style={{ flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
              {shown.length === 0 && (
                <Text c="dimmed" p="xl" ta="center">
                  {shownLeaning.length
                    ? `Nothing is sure enough to suggest yet. Closest: ${board.nameOf(shownLeaning[0].song)} - ${leaningText(shownLeaning[0], tierName)}.`
                    : 'No moves to review. Duel more and the strongest cases show up here.'}
                </Text>
              )}
              {shown.map((s) => (
                <MoveRow
                  key={s.song}
                  s={s}
                  board={board}
                  selected={current?.song === s.song}
                  decided={decided[s.song]?.kind}
                  onSelect={() => setSelected(s.song)}
                  onMove={() => move(s)}
                  onKeep={() => keep(s)}
                  onUndo={() => undo(s)}
                />
              ))}
              {shownLeaning.length > 0 && (
                <>
                  <Stack gap="5xs" px="lg" pt="md" pb="2xs" style={{ borderBottom: '1px solid var(--border)' }}>
                    <SectionLabel>Leaning · not sure yet</SectionLabel>
                    <Text fz="md" c="dimmed">
                      Where your duels point, short of the bar for a suggestion. Move or keep one yourself, or duel more.
                    </Text>
                  </Stack>
                  {shownLeaning.map((s) => (
                    <MoveRow
                      key={s.song}
                      s={s}
                      board={board}
                      leaning
                      detail={s.unmet.map(shortfallText).join(' · ')}
                      selected={current?.song === s.song}
                      decided={decided[s.song]?.kind}
                      onSelect={() => setSelected(s.song)}
                      onMove={() => move(s)}
                      onKeep={() => keep(s)}
                      onUndo={() => undo(s)}
                    />
                  ))}
                </>
              )}
              <KeyHints />
            </Paper>

            {current && (
              <Paper withBorder radius="lg" p="md" style={{ flex: '1 1 380px' }}>
                <Stack gap="lg">
                  <Group gap="md" wrap="nowrap">
                    <SongArt video={board.videoOf(current.song)} size={60} />
                    <Box style={{ flex: 1 }} miw={0}>
                      <Title order={3} fz="xl" truncate="end">{board.nameOf(current.song)}</Title>
                      <Text c="dimmed" fz="md" truncate="end">{board.artistOf(current.song)}</Text>
                    </Box>
                    <Button radius="xl" w={48} h={48} p={0} aria-label={previewing ? 'Stop' : `Play ${board.nameOf(current.song)}`}
                      onClick={togglePreview}>
                      {previewing ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </Button>
                  </Group>
                  {previewing && (
                    <Box style={{ aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: 'var(--media-bg)' }}>
                      <EmbeddedPlayer videoId={current.song} autoplay />
                    </Box>
                  )}
                  <Stack gap="xs">
                    <SectionLabel>Where it belongs</SectionLabel>
                    <ProbabilityBars song={currentSong} tiers={TIER_ORDER.filter((t) => currentSong?.probabilities[t] != null)} />
                  </Stack>
                  <Stack gap="2xs">
                    <Group justify="space-between">
                      <SectionLabel>Score over {current.wins + current.losses + current.draws} duels</SectionLabel>
                      <Text fz="sm" c="dimmed">dashed = tier border</Text>
                    </Group>
                    <ScoreTrend trend={current.trend} border={border?.score} />
                  </Stack>
                  <Stack gap="4xs">
                    <SectionLabel>Key results</SectionLabel>
                    {current.keyResults.map((k, i) => (
                      <Group key={i} justify="space-between" py="3xs" style={{ borderBottom: '1px solid var(--border-soft)' }} wrap="nowrap">
                        <Group gap="2xs" wrap="nowrap" miw={0}>
                          <Text fw={800} w={40} c={k.result > 0 ? 'accent' : 'dimmed'}>
                            {k.result > 0 ? 'Won' : k.result < 0 ? 'Lost' : 'Draw'}
                          </Text>
                          <Text fz="md" truncate="end">{board.nameOf(k.opponent)}</Text>
                        </Group>
                        {k.opponentTier && <TierChip tier={k.opponentTier} size={20} />}
                      </Group>
                    ))}
                  </Stack>
                  <Stack gap="xs">
                    {!decided[current.song] && (
                      <Group gap="2xs" grow>
                        <Button variant="default" onClick={() => keep(current)}>Keep in {tierName(current.from)}</Button>
                        <Button onClick={() => move(current)}>Move to {tierName(current.to)}</Button>
                      </Group>
                    )}
                    <Checkbox
                      checked={!!locked[current.song]}
                      onChange={() => toggleLock(current.song)}
                      label={`Lock ${board.nameOf(current.song)} in its tier - never suggest a move again`}
                    />
                    <Text fz="md" c="dimmed">
                      Keeping it raises the bar: it won’t be suggested again until five fresh duels point the same way.
                    </Text>
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Group>
        )}

        {data && Object.keys(data.tierOrders).length > 0 && (
          <Stack gap="sm">
            <Title order={2}>Tighten tier order</Title>
            <Text c="dimmed" fz="md">Order within a tier is the songs sorted by score - positions are ranks on YouTube. Check the new order before you sort.</Text>
            <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
              {/* The first tier starts open: the change is there to see before Sort. */}
              <Accordion multiple chevronPosition="left" variant="default" defaultValue={Object.keys(data.tierOrders).slice(0, 1)}>
                {Object.entries(data.tierOrders).map(([tier, ids]) => (
                  <TierOrderItem key={tier} tier={tier} ids={ids} board={board} />
                ))}
              </Accordion>
            </Paper>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

// One tier's proposed order: a header (how many change, Sort) that opens to
// the songs at their new places - where each was, arrows for how far it
// moved; songs that stay put are dimmed.
function TierOrderItem({ tier, ids, board }) {
  const tierName = useTierName();
  const changes = orderChanges((board.tierItems[tier] || []).map((v) => v.videoId), ids);
  const changed = changes.filter((c) => c.delta !== 0).length;
  return (
    <Accordion.Item value={tier}>
      <Group gap="xs" wrap="nowrap" pr="lg">
        <Accordion.Control aria-label={`Show the new ${tierName(tier)} order`}>
          <Group gap="xs" wrap="nowrap">
            <TierChip tier={tier} size={22} />
            <Text>{changed} of {ids.length} songs change places</Text>
          </Group>
        </Accordion.Control>
        <Button variant="default" style={{ flexShrink: 0 }} onClick={() => board.applyTierOrder(tier, ids)}>
          Sort {tierName(tier)} by score
        </Button>
      </Group>
      <Accordion.Panel>
        <Table verticalSpacing="4xs" horizontalSpacing="sm" withRowBorders={false} aria-label={`New ${tierName(tier)} order`}>
          <Table.Tbody>
            {changes.map((c) => {
              const moved = c.delta !== 0;
              return (
                <Table.Tr key={`${c.id}-${c.to}`} style={{ opacity: moved ? 1 : 0.5 }} data-moved={moved || undefined}>
                  <Table.Td w={36}><Text ff="monospace" fz="md" ta="right">{c.to}</Text></Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" miw={0}>
                      <SongArt video={board.videoOf(c.id)} size={28} />
                      <Box miw={0}>
                        <Text fz="md" fw={moved ? 600 : 400} truncate="end">{board.nameOf(c.id)}</Text>
                        <Text fz="sm" c="dimmed" truncate="end">{board.artistOf(c.id)}</Text>
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td w={120}>
                    {moved ? (
                      <Group gap="3xs" wrap="nowrap" justify="flex-end">
                        <Text fz="sm" c="dimmed">was {c.from}</Text>
                        <Badge
                          variant="light"
                          color={c.delta > 0 ? 'accent' : 'gray'}
                          leftSection={c.delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                          aria-label={`${c.delta > 0 ? 'up' : 'down'} ${Math.abs(c.delta)}`}
                        >
                          {Math.abs(c.delta)}
                        </Badge>
                      </Group>
                    ) : (
                      <Text fz="sm" c="dimmed" ta="right">stays</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
