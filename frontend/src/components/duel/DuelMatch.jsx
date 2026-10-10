import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Alert, Anchor, Box, Button, Container, Grid, Group, Kbd, Paper, Progress, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTierName } from '../../tierLabels';
import { TierChip } from '../TierBits';
import EmbeddedPlayer from '../EmbeddedPlayer';
import { requestPlayerPause } from '../../store/focusSlice';
import {
  useDuelSessionQuery, useDuelSkipMutation, useDuelUndoMutation, useDuelVerdictMutation, useEndDuelMutation,
} from '../../api/queries';
import { errorMessage } from '../../api/client';
import { useDuelBoard } from '../../duel/useDuelBoard';
import {
  VERDICTS, likelyTiers, outcomeText, pct, reasonText, scoreDelta, verdictForKey, verdictHeadline,
} from '../../duel/duelText';
import { ProbabilityBars, SectionLabel } from './DuelBits';

// Clips: from the 0:30 mark (no "most replayed" data without an outside
// service), the song being settled for longer than its known opponent.
const CLIP_START = 30;
const CLIP_SECONDS = { A: 30, B: 20 };

// One side of the duel: a real YouTube player that plays its clip while it's
// the side being heard, pauses (and keeps its place) otherwise, and calls
// onClipEnd when the clip has played out.
function ClipCard({ side, video, song, name, artist, active, paused, onListen, onClipEnd, onBlocked }) {
  const tierName = useTierName();
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const length = CLIP_SECONDS[side];
  // A song shorter than 0:30 + the clip plays its last `length` seconds.
  const start = duration ? Math.max(0, Math.min(CLIP_START, duration - length)) : CLIP_START;
  const endRef = useRef(onClipEnd);
  useEffect(() => {
    endRef.current = onClipEnd;
  });
  const [blocked, setBlocked] = useState(false);
  // Can't be played here (embedding off): hand straight over to the other side.
  useEffect(() => {
    if (blocked && active) endRef.current?.();
  }, [blocked, active]);

  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return undefined;
    // Not heard, or paused (Space): hold the place.
    if (!active || paused) {
      p.pauseVideo?.();
      return undefined;
    }
    const d = p.getDuration?.() || 0;
    const from = d ? Math.max(0, Math.min(CLIP_START, d - length)) : CLIP_START;
    const t = p.getCurrentTime?.() ?? 0;
    if (t < from || t >= from + length) p.seekTo(from, true);
    p.playVideo?.();
    const id = setInterval(() => {
      const now = p.getCurrentTime?.() ?? 0;
      setDuration(p.getDuration?.() || 0);
      setProgress(Math.min(1, Math.max(0, (now - from) / length)));
      if (now >= from + length) endRef.current?.();
    }, 250);
    return () => clearInterval(id);
  }, [active, paused, ready, length]);

  return (
    <Paper withBorder radius={18} p={18} style={{ borderColor: active ? 'var(--accent)' : undefined, borderWidth: active ? 2 : 1 }}>
      <Stack gap={16}>
        <Group justify="space-between">
          <ThemeIcon variant="light" color="gray" size={34} radius="md" fw={900}>{side}</ThemeIcon>
          <Text fz={13} fw={700} c={active && !paused ? 'accent' : 'dimmed'}>{active && !paused ? '▶ Playing' : 'Paused'}</Text>
        </Group>
        <Box pos="relative" style={{ aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: 'var(--media-bg)' }}>
          <EmbeddedPlayer
            key={video.videoId}
            videoId={video.videoId}
            autoplay={false}
            onPlayerReady={(p) => {
              playerRef.current = p;
              setReady(!!p);
            }}
            onBlocked={() => {
              setBlocked(true);
              onBlocked?.();
            }}
          />
          {song?.tier && (
            <Box pos="absolute" bottom={12} right={12} style={{ pointerEvents: 'none' }}>
              <TierChip tier={song.tier} size={24} />
            </Box>
          )}
        </Box>
        <Stack gap={3}>
          <Text ff="var(--font-display)" fw={800} fz={24} lh={1.15} truncate="end" title={name}>{name}</Text>
          <Text fz={15} c="dimmed" truncate="end">{artist}{song && !song.tier ? ' · new to this board' : song ? ` · ${tierName(song.tier)}` : ''}</Text>
        </Stack>
        <Stack gap={6}>
          <Progress value={progress * 100} size="sm" radius="xl" color={active ? 'accent' : 'gray'} />
          <Group justify="space-between">
            <Text ff="monospace" fz={12} c="dimmed">
              {fmt(start)} – {fmt(start + length)}
            </Text>
            <Text ff="monospace" fz={12} c="dimmed">from 0:30</Text>
          </Group>
        </Stack>
        {/* Tab switches to the other song, so only the paused side shows it. */}
        <Button variant="default" onClick={onListen} rightSection={active ? null : <Kbd size="xs">Tab</Kbd>}>
          {active ? 'Replay clip' : `Hear ${side}`}
        </Button>
      </Stack>
    </Paper>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function useSecondsLeft(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000)) : 0;
}

// The matchup: hear both hooks, give a five-step verdict, see what it did.
export default function DuelMatch({ category, sessionId, boardLoading, base }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const tierName = useTierName();
  const board = useDuelBoard(category);
  const layout = board.duelLayout.layout;
  const session = useDuelSessionQuery(category, sessionId, board.duelLayout, !boardLoading);
  const verdict = useDuelVerdictMutation(category, sessionId);
  const skip = useDuelSkipMutation(category, sessionId);
  const undo = useDuelUndoMutation(category, sessionId);
  const end = useEndDuelMutation(category, sessionId);
  const [listening, setListeningSide] = useState('A');
  const [paused, setPaused] = useState(false);
  // Hearing a side (Tab, "Hear A/B", a clip ending) always plays it.
  const setListening = (side) => {
    setPaused(false);
    setListeningSide(side);
  };
  // Sides whose video can't be played here, by video id (a new pair starts clean).
  const [blocked, setBlocked] = useState({});
  const [answered, setAnswered] = useState(null); // the matchup just answered, until "Next duel"
  const secondsLeft = useSecondsLeft(session.data?.endsAt);

  const s = session.data;
  const m = s?.matchup;
  const busy = verdict.isPending || skip.isPending || undo.isPending || end.isPending;

  // Duel audio replaces whatever the mini player was playing.
  useEffect(() => {
    dispatch(requestPlayerPause());
  }, [dispatch]);

  // A new song to settle starts on A; the same one again starts on its new opponent.
  const lastA = useRef(null);
  useEffect(() => {
    if (!m || answered) return;
    setListening(m.a === lastA.current ? 'B' : 'A');
    lastA.current = m.a;
  }, [m?.a, m?.b, answered]); // eslint-disable-line react-hooks/exhaustive-deps

  // 409: the session moved on (another tab, a double press - nothing was
  // recorded twice) or it ended: show it as it is now.
  const failed = (err) => {
    if (err?.response?.status === 409) {
      notifications.show({ title: err.response.data?.title ?? 'Session changed', message: errorMessage(err, '') });
      setAnswered(null);
      session.refetch();
      return;
    }
    notifications.show({ color: 'red', title: 'That didn’t save', message: errorMessage(err, 'The app couldn’t reach the server.') });
  };

  function pick(v) {
    if (!m || busy || answered) return;
    setAnswered(m);
    verdict.mutate({ layout, a: m.a, b: m.b, verdict: v, seenDuels: s.duels.length }, { onError: (e) => { setAnswered(null); failed(e); } });
  }
  function next() {
    setAnswered(null);
  }
  function dontKnow() {
    if (!m || busy) return;
    skip.mutate({ layout, videoId: m.b, seenDuels: s.duels.length }, { onError: failed });
  }
  function takeBack() {
    if (busy) return;
    setAnswered(null);
    undo.mutate({ layout, seenDuels: s.duels.length }, { onError: failed });
  }
  function finish() {
    if (end.isPending) return;
    end.mutate({ layout }, { onSuccess: () => navigate(`${base}/duel/done/${sessionId}`), onError: failed });
  }

  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      // A held key repeats: one press, one verdict.
      if (e.repeat) return;
      if (e.key === 'e') {
        finish();
        return;
      }
      if (answered) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          next();
        } else if (e.key === 'u') takeBack();
        return;
      }
      const v = verdictForKey(e);
      if (v) {
        e.preventDefault();
        pick(v);
      } else if (e.key === ' ') {
        // Play / pause the clip being heard, like any player.
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setListening(listening === 'A' ? 'B' : 'A');
      } else if (e.key === 's') {
        dontKnow();
      } else if (e.key === 'u') {
        takeBack();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (session.isError) {
    return (
      <Container className="duel-view" size={900} py={48}>
        <Alert color="red" title="Couldn’t open this duel session">
          {errorMessage(session.error, 'The app couldn’t reach the server.')}
          <Group mt="sm">
            <Button size="xs" component={Link} to={`${base}/duel`}>Back to the duel hub</Button>
            <Button size="xs" variant="default" onClick={() => session.refetch()}>Retry</Button>
          </Group>
        </Alert>
      </Container>
    );
  }
  if (!s) {
    return (
      // Same containers, columns and block sizes as the loaded page below,
      // so nothing jumps when the session arrives.
      <Container className="duel-view" size={1320} py={32} data-testid="duel-match-loading">
        <Stack gap={28}>
          <Group justify="space-between" wrap="wrap" gap={16}>
            <Button variant="default" component={Link} to={`${base}/duel`}>← {category} · Duel</Button>
            <Stack gap={8} style={{ flex: '1 1 360px', maxWidth: 560 }}>
              <Skeleton h={14} w={180} />
              <Skeleton h={10} radius="xl" />
            </Stack>
            <Group gap={8}>
              <Skeleton h={36} w={96} radius="sm" />
              <Skeleton h={36} w={150} radius="sm" />
            </Group>
          </Group>
          <Grid gutter={28}>
            <Grid.Col span={{ base: 12, lg: 8 }}>
              <Stack gap={22}>
                <Stack gap={6} align="center" ta="center">
                  <Title order={1} fz={34} ff="var(--font-display)" fw={900}>Which one hits harder?</Title>
                  <Text fz={15} c="dimmed">Both clips start at 0:30. Trust your gut - you can be unsure.</Text>
                </Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={18}>
                  {[0, 1].map((i) => <Skeleton key={i} h={540} radius="lg" />)}
                </SimpleGrid>
                <SimpleGrid cols={{ base: 2, sm: 5 }} spacing={8}>
                  {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={108} radius="md" />)}
                </SimpleGrid>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <Stack gap={16}>
                <Skeleton h={198} radius="md" />
                <Skeleton h={250} radius="md" />
                <Skeleton h={110} radius="md" />
              </Stack>
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    );
  }

  const gain = s.certainty - s.certaintyStart;
  const elapsed = Math.max(1, s.minutes * 60 - secondsLeft);
  const shown = answered ?? m;
  const prev = s.previous;
  const showResult = answered && prev && !verdict.isPending;
  const v = (id) => board.videoOf(id) ?? { videoId: id };

  return (
    <Container className="duel-view" size={1320} py={32}>
      <Stack gap={28}>
        <Group justify="space-between" wrap="wrap" gap={16}>
          <Button variant="default" component={Link} to={`${base}/duel`}>← {category} · Duel</Button>
          <Stack gap={8} style={{ flex: '1 1 360px', maxWidth: 560 }}>
            <Group justify="space-between">
              <Text fz={13} fw={700}>
                Certainty <Text span c="accent" inherit>{gain >= 0 ? '+' : '−'}{pct(Math.abs(gain))}</Text> · {s.duels.length} duels
              </Text>
              <Text fz={13} fw={700} c="dimmed">{secondsLeft > 0 ? `~${Math.ceil(secondsLeft / 60)} min left` : 'Time’s up'}</Text>
            </Group>
            <Progress value={Math.min(100, (elapsed / (s.minutes * 60)) * 100)} size="md" radius="xl" />
          </Stack>
          <Group gap={8}>
            <Button variant="default" onClick={takeBack} disabled={!s.duels.length || busy} rightSection={<Kbd size="xs">U</Kbd>}>Undo</Button>
            <Button variant="light" color="gray" onClick={finish} loading={end.isPending} rightSection={<Kbd size="xs">E</Kbd>}>End session</Button>
          </Group>
        </Group>

        {/* Fixed columns (Grid), so long song names never resize the layout between duels. */}
        <Grid gutter={28}>
          <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap={22}>
            {!shown ? (
              <Paper withBorder radius="lg" p={40}>
                <Stack align="center" gap="sm">
                  <Title order={2} ff="var(--font-display)">{secondsLeft > 0 ? 'Nothing left worth asking.' : 'Time’s up.'}</Title>
                  <Text c="dimmed">{s.duels.length} duels this session. See what they settled.</Text>
                  <Button size="md" onClick={finish} loading={end.isPending}>See the summary</Button>
                </Stack>
              </Paper>
            ) : (
              <>
                <Stack gap={6} align="center" ta="center">
                  <Title order={1} fz={34} ff="var(--font-display)" fw={900}>Which one hits harder?</Title>
                  <Text fz={15} c="dimmed">Both clips start at 0:30. Trust your gut - you can be unsure.</Text>
                </Stack>
                <Box pos="relative">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={18}>
                    <ClipCard side="A" video={v(shown.a)} song={shown.songA} name={board.nameOf(shown.a)} artist={board.artistOf(shown.a)}
                      active={listening === 'A'} paused={paused} onListen={() => setListening('A')}
                      onClipEnd={() => !blocked[shown.b] && setListening('B')}
                      onBlocked={() => setBlocked((x) => ({ ...x, [shown.a]: true }))} />
                    <ClipCard side="B" video={v(shown.b)} song={shown.songB} name={board.nameOf(shown.b)} artist={board.artistOf(shown.b)}
                      active={listening === 'B'} paused={paused} onListen={() => setListening('B')}
                      onClipEnd={() => !blocked[shown.a] && setListening('A')}
                      onBlocked={() => setBlocked((x) => ({ ...x, [shown.b]: true }))} />
                  </SimpleGrid>
                  <ThemeIcon visibleFrom="sm" pos="absolute" left="50%" top="40%" size={52} radius="xl" variant="default" fw={900}
                    style={{ transform: 'translate(-50%, -50%)' }}>VS</ThemeIcon>
                </Box>

                {showResult ? (
                  <Paper radius="lg" p={22} style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid var(--accent)' }}>
                    <Group justify="space-between" wrap="wrap" gap={22}>
                      <Stack gap={10} style={{ flex: '1 1 360px' }}>
                        <Text ff="var(--font-display)" fw={800} fz={18}>
                          {verdictHeadline(prev.duel.verdict, board.nameOf(prev.duel.a), board.nameOf(prev.duel.b))}
                        </Text>
                        <Group gap={18} wrap="nowrap">
                          {[[prev.duel.a, answered.songA.mu, prev.a.mu], [prev.duel.b, answered.songB.mu, prev.b.mu]].map(([id, before, after]) => (
                            <Text key={id} fz={14} truncate="end" miw={0}>
                              {board.nameOf(id)} <Text span ff="monospace" fw={700} inherit>{scoreDelta(before, after)}</Text>
                            </Text>
                          ))}
                        </Group>
                        <Text fz={14}>{outcomeText(prev.a, board.nameOf(prev.duel.a), tierName)}</Text>
                      </Stack>
                      <Group gap={8}>
                        <Button variant="default" onClick={takeBack}>Undo</Button>
                        <Button size="md" onClick={next} rightSection={<Kbd size="xs">Space</Kbd>} disabled={!m && !s.done}>
                          {m ? 'Next duel' : 'Finish'}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ) : (
                  <Stack gap={12}>
                    <SimpleGrid cols={{ base: 2, sm: 5 }} spacing={8} role="group" aria-label="Your verdict">
                      {VERDICTS.map((x) => (
                        <UnstyledButton key={x.verdict} onClick={() => pick(x.verdict)} disabled={busy || !!answered}>
                          <Paper withBorder radius="md" py={16} px={10} className="duel-card"
                            style={{ background: x.verdict === 'TOO_CLOSE' ? 'var(--surface)' : 'var(--surface-2)' }}>
                            <Stack gap={8} align="center">
                              <Text ff="var(--font-display)" fw={800} fz={16}>{x.label}</Text>
                              <Group gap={2}>{x.keys.map((k) => <Kbd key={k} size="xs">{k}</Kbd>)}</Group>
                            </Stack>
                          </Paper>
                        </UnstyledButton>
                      ))}
                    </SimpleGrid>
                    <Group justify="center" gap={22}>
                      <Text fz={13} c="dimmed">Margin matters: “clearly” moves scores twice as far</Text>
                      <Group gap={6}><Kbd size="xs">Space</Kbd><Text fz={13} c="dimmed">play / pause</Text></Group>
                      <UnstyledButton onClick={dontKnow}>
                        <Group gap={6}><Text fz={13} c="dimmed">Don’t know one of them</Text><Kbd size="xs">S</Kbd></Group>
                      </UnstyledButton>
                    </Group>
                  </Stack>
                )}
              </>
            )}
          </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap={16}>
            {shown && (
              <>
                <Paper withBorder radius="md" p={18}>
                  <Stack gap={10}>
                    <SectionLabel>Why this duel</SectionLabel>
                    <Text fz={15} lh={1.55}>{reasonText(shown, board.nameOf, tierName)}</Text>
                  </Stack>
                </Paper>
                <Paper withBorder radius="md" p={18}>
                  <Stack gap={12}>
                    <SectionLabel>{board.nameOf(shown.a)} - where it belongs</SectionLabel>
                    <ProbabilityBars song={showResult ? prev.a : shown.songA} tiers={likelyTiers(shown.songA, 3).map((x) => x.tier)} />
                    <Text fz={13} c="dimmed">A move is suggested once one tier passes <b>85%</b> with at least 4 duels behind it.</Text>
                  </Stack>
                </Paper>
              </>
            )}
            <Paper withBorder radius="md" p={18}>
              <Stack gap={10}>
                <SectionLabel>This session</SectionLabel>
                {s.duels.length === 0 && <Text fz={14} c="dimmed">Your verdicts show up here.</Text>}
                {[...s.duels].reverse().slice(0, 6).map((d) => {
                  const aWins = d.verdict === 'A' || d.verdict === 'A_CLEARLY';
                  const draw = d.verdict === 'TOO_CLOSE';
                  return (
                    <Group key={d.id} justify="space-between" gap={8} wrap="nowrap">
                      <Text fz={14} truncate="end" style={{ flex: 1, minWidth: 0 }}>
                        <b>{board.nameOf(aWins || draw ? d.a : d.b)}</b> {draw ? '≈' : 'over'} {board.nameOf(aWins || draw ? d.b : d.a)}
                      </Text>
                      <Text fz={13} c="dimmed" style={{ flexShrink: 0 }}>{draw ? 'too close' : d.verdict.endsWith('CLEARLY') ? 'clearly' : ''}</Text>
                    </Group>
                  );
                })}
                {s.skipped.length > 0 && <Text fz={13} c="dimmed">{s.skipped.length} skipped as unknown</Text>}
              </Stack>
            </Paper>
            <Anchor component={Link} to={`${base}/duel/moves`} fz={14} fw={700}>Review suggested moves →</Anchor>
          </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
