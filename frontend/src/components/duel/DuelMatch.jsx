import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Alert, Anchor, Box, Button, Container, Grid, Group, Kbd, Paper, Progress, ScrollArea, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title,
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
import { CLIP_START, firstStart, nextStart, seeked } from '../../duel/clipWindow';
import { SECTION_GAP } from '../../layout/spacing';

// Clips: from the 0:30 mark (no "most replayed" data without an outside
// service), the same length on both sides so their parts line up.
const CLIP_SECONDS = 30;

// One side of the duel: a real YouTube player that plays its clip while it's
// the side being heard, pauses (and keeps its place) otherwise, and calls
// onClipEnd when the clip has played out. The clip is a moving window: each
// time it's this side's turn again it plays the NEXT part of the song
// (0:30-1:00, then 1:00-1:30, ...; back to the first part after the end),
// so waiting longer hears more of the song. Seeking in the player (a jump the
// clock can't explain) starts the window where you seeked to - never treated
// as the clip ending.
function ClipCard({ side, video, song, name, artist, active, paused, onListen, onStartedByUser, onClipEnd, onBlocked }) {
  const tierName = useTierName();
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const length = CLIP_SECONDS;
  // The current part's start (null until the player knows the duration).
  const segRef = useRef(null);
  const [segStart, setSegStart] = useState(CLIP_START);
  const moveSeg = (t) => {
    segRef.current = t;
    setSegStart(t);
  };
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
    if (segRef.current === null) moveSeg(firstStart(d, length));
    const t = p.getCurrentTime?.() ?? 0;
    if (t < segRef.current || t >= segRef.current + length) p.seekTo(segRef.current, true);
    p.playVideo?.();
    let last = null;
    const id = setInterval(() => {
      const now = p.getCurrentTime?.() ?? 0;
      const dur = p.getDuration?.() || 0;
      // A jump more than the tick could cover: the listener seeked.
      if (seeked(last, now)) moveSeg(Math.max(0, Math.floor(now)));
      last = now;
      const from = segRef.current;
      setProgress(Math.min(1, Math.max(0, (now - from) / length)));
      if (now >= from + length || (dur && now >= dur - 0.5)) {
        // Next time it's this side's turn: the next part, or the first again.
        moveSeg(nextStart(from, length, dur));
        endRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [active, paused, ready, length]);

  // "Replay clip": the current part from its start.
  function replay() {
    playerRef.current?.seekTo?.(segRef.current ?? CLIP_START, true);
    setProgress(0);
  }

  return (
    <Paper withBorder radius="lg" p="md" style={{ borderColor: active ? 'var(--accent)' : undefined, borderWidth: active ? 2 : 1 }}>
      <Stack gap="md">
        <Group justify="space-between">
          <ThemeIcon variant="light" color="gray" size={34} radius="md" fw={900}>{side}</ThemeIcon>
          <Text fz="md" fw={700} c={active && !paused ? 'accent' : 'dimmed'}>{active && !paused ? '▶ Playing' : 'Paused'}</Text>
        </Group>
        <Box pos="relative" style={{ aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: 'var(--media-bg)' }}>
          <EmbeddedPlayer
            key={video.videoId}
            videoId={video.videoId}
            autoplay={false}
            // Play pressed in the player itself while this side isn't the one
            // being heard (or the clip is paused): this side becomes it,
            // instead of the app pausing it again.
            onPlayingChange={(playing) => {
              if (playing && (!active || paused)) onStartedByUser?.();
            }}
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
        <Stack gap="4xs">
          <Text ff="var(--font-display)" fw={800} fz="xl" lh={1.15} truncate="end" title={name}>{name}</Text>
          <Text fz="lg" c="dimmed" truncate="end">{artist}{song && !song.tier ? ' · new to this board' : song ? ` · ${tierName(song.tier)}` : ''}</Text>
        </Stack>
        <Stack gap="3xs">
          <Progress value={progress * 100} size="sm" radius="xl" color={active ? 'accent' : 'gray'} />
          <Group justify="space-between">
            <Text ff="monospace" fz="sm" c="dimmed">
              {fmt(segStart)} – {fmt(segStart + length)}
            </Text>
            <Text ff="monospace" fz="sm" c="dimmed">part {Math.max(1, Math.round((segStart - CLIP_START) / length) + 1)}</Text>
          </Group>
        </Stack>
        {/* Tab switches to the other song, so only the paused side shows it. */}
        <Button variant="default" onClick={active ? replay : onListen} rightSection={active ? null : <Kbd size="xs">Tab</Kbd>}>
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
      if (e.key === ' ') {
        // Play / pause the clip being heard, like any player - its only job,
        // before and after a verdict.
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if (answered) {
        // Enter, not Space (that's play / pause): the next duel. Default
        // prevented, so a focused button isn't clicked as well.
        if (e.key === 'Enter') {
          e.preventDefault();
          next();
        } else if (e.key === 'u') takeBack();
        return;
      }
      const v = verdictForKey(e);
      if (v) {
        e.preventDefault();
        pick(v);
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
      <Container className="duel-view" size={900} py="xs">
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
  // One grid for the whole page, three rows of the same two columns (top
  // bar, duel, footer), so every row shares the columns' edges and the side
  // column stretches to the duel's height.
  const topBar = (left, right) => (
    <>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Group wrap="nowrap" gap="md" align="center">
          <Button variant="default" component={Link} to={`${base}/duel`} style={{ flexShrink: 0 }}>← {category} · Duel</Button>
          <Stack gap="2xs" style={{ flex: 1, minWidth: 0 }}>{left}</Stack>
        </Group>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Group grow wrap="nowrap" gap="2xs" h="100%" align="center">{right}</Group>
      </Grid.Col>
    </>
  );
  const heading = (
    <Stack gap="4xs" align="center" ta="center">
      <Title order={1}>Which one hits harder?</Title>
      <Text fz="md" c="dimmed">Both clips start at 0:30 - still deciding? Each turn plays the next part. Trust your gut.</Text>
    </Stack>
  );
  const movesLink = <Anchor component={Link} to={`${base}/duel/moves`} fz="md" fw={700}>Review suggested moves →</Anchor>;

  if (!s) {
    return (
      // Same grid, columns and block sizes as the loaded page below, so
      // nothing jumps when the session arrives.
      <Container className="duel-view" fluid px={0} py={0} data-testid="duel-match-loading">
        <Grid gutter={SECTION_GAP}>
          {topBar(
            <>
              <Skeleton h={14} w={180} />
              <Skeleton h={10} radius="xl" />
            </>,
            <>
              <Skeleton h={30} radius="sm" />
              <Skeleton h={30} radius="sm" />
            </>
          )}
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Stack gap={SECTION_GAP}>
              {heading}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {[0, 1].map((i) => <Skeleton key={i} h={490} radius="lg" />)}
              </SimpleGrid>
              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="2xs">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={86} radius="md" />)}
              </SimpleGrid>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="md" h="100%">
              <Skeleton h={104} radius="md" />
              <Skeleton h={180} radius="md" />
              <Skeleton mih={180} radius="md" style={{ flex: '1 1 0' }} />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 8 }} />
          <Grid.Col span={{ base: 12, lg: 4 }}>{movesLink}</Grid.Col>
        </Grid>
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
    <Container className="duel-view" fluid px={0} py={0}>
      {/* Fixed columns (Grid), so long song names never resize the layout between duels. */}
      <Grid gutter={SECTION_GAP}>
        {topBar(
          <>
            <Group justify="space-between" wrap="nowrap">
              <Text fz="md" fw={700} truncate="end">
                Certainty <Text span c="accent" inherit>{gain >= 0 ? '+' : '−'}{pct(Math.abs(gain))}</Text> · {s.duels.length} duels
              </Text>
              <Text fz="md" fw={700} c="dimmed" style={{ flexShrink: 0 }}>{secondsLeft > 0 ? `~${Math.ceil(secondsLeft / 60)} min left` : 'Time’s up'}</Text>
            </Group>
            <Progress value={Math.min(100, (elapsed / (s.minutes * 60)) * 100)} size="md" radius="xl" />
          </>,
          <>
            <Button variant="default" onClick={takeBack} disabled={!s.duels.length || busy} rightSection={<Kbd size="xs">U</Kbd>}>Undo</Button>
            <Button variant="light" color="gray" onClick={finish} loading={end.isPending} rightSection={<Kbd size="xs">E</Kbd>}>End session</Button>
          </>
        )}

        <Grid.Col span={{ base: 12, lg: 8 }} data-testid="duel-main">
          <Stack gap={SECTION_GAP}>
            {!shown ? (
              <Paper withBorder radius="lg" p="md">
                <Stack align="center" gap="sm">
                  <Title order={2}>{secondsLeft > 0 ? 'Nothing left worth asking.' : 'Time’s up.'}</Title>
                  <Text c="dimmed">{s.duels.length} duels this session. See what they settled.</Text>
                  <Button onClick={finish} loading={end.isPending}>See the summary</Button>
                </Stack>
              </Paper>
            ) : (
              <>
                {heading}
                <Box pos="relative">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <ClipCard side="A" video={v(shown.a)} song={shown.songA} name={board.nameOf(shown.a)} artist={board.artistOf(shown.a)}
                      active={listening === 'A'} paused={paused} onListen={() => setListening('A')}
                      onStartedByUser={() => setListening('A')}
                      onClipEnd={() => !blocked[shown.b] && setListening('B')}
                      onBlocked={() => setBlocked((x) => ({ ...x, [shown.a]: true }))} />
                    <ClipCard side="B" video={v(shown.b)} song={shown.songB} name={board.nameOf(shown.b)} artist={board.artistOf(shown.b)}
                      active={listening === 'B'} paused={paused} onListen={() => setListening('B')}
                      onStartedByUser={() => setListening('B')}
                      onClipEnd={() => !blocked[shown.a] && setListening('A')}
                      onBlocked={() => setBlocked((x) => ({ ...x, [shown.b]: true }))} />
                  </SimpleGrid>
                  <ThemeIcon visibleFrom="sm" pos="absolute" left="50%" top="40%" size={52} radius="xl" variant="default" fw={900}
                    style={{ transform: 'translate(-50%, -50%)' }}>VS</ThemeIcon>
                </Box>

                {showResult ? (
                  <Paper radius="lg" p="md" style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid var(--accent)' }}>
                    <Group justify="space-between" wrap="wrap" gap="lg">
                      <Stack gap="xs" style={{ flex: '1 1 360px' }}>
                        <Text ff="var(--font-display)" fw={800} fz="xl">
                          {verdictHeadline(prev.duel.verdict, board.nameOf(prev.duel.a), board.nameOf(prev.duel.b))}
                        </Text>
                        <Group gap="lg" wrap="nowrap">
                          {[[prev.duel.a, answered.songA.mu, prev.a.mu], [prev.duel.b, answered.songB.mu, prev.b.mu]].map(([id, before, after]) => (
                            <Text key={id} fz="md" truncate="end" miw={0}>
                              {board.nameOf(id)} <Text span ff="monospace" fw={700} inherit>{scoreDelta(before, after)}</Text>
                            </Text>
                          ))}
                        </Group>
                        <Text fz="md">{outcomeText(prev.a, board.nameOf(prev.duel.a), tierName)}</Text>
                      </Stack>
                      <Group gap="2xs">
                        <Button variant="default" onClick={takeBack}>Undo</Button>
                        <Button onClick={next} rightSection={<Kbd size="xs">Enter</Kbd>} disabled={!m && !s.done}>
                          {m ? 'Next duel' : 'Finish'}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ) : (
                  <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="2xs" role="group" aria-label="Your verdict">
                    {VERDICTS.map((x) => (
                      <UnstyledButton key={x.verdict} onClick={() => pick(x.verdict)} disabled={busy || !!answered}>
                        <Paper withBorder radius="md" py="md" px="xs" className="duel-card"
                          style={{ background: x.verdict === 'TOO_CLOSE' ? 'var(--surface)' : 'var(--surface-2)' }}>
                          <Stack gap="2xs" align="center">
                            <Text ff="var(--font-display)" fw={800} fz="lg">{x.label}</Text>
                            <Group gap="5xs">{x.keys.map((k) => <Kbd key={k} size="xs">{k}</Kbd>)}</Group>
                          </Stack>
                        </Paper>
                      </UnstyledButton>
                    ))}
                  </SimpleGrid>
                )}
              </>
            )}
          </Stack>
        </Grid.Col>

        {/* The side column is as tall as the duel: "This session" takes what
            the two cards above leave and scrolls inside (flex-basis 0, so a
            long list never makes the column taller than the duel). */}
        <Grid.Col span={{ base: 12, lg: 4 }} data-testid="duel-side">
          <Stack gap="md" h="100%">
            {shown && (
              <>
                <Paper withBorder radius="md" p="md">
                  <Stack gap="xs">
                    <SectionLabel>Why this duel</SectionLabel>
                    <Text fz="md" lh={1.55}>{reasonText(shown, board.nameOf, tierName)}</Text>
                  </Stack>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <SectionLabel>{board.nameOf(shown.a)} - where it belongs</SectionLabel>
                    <ProbabilityBars song={showResult ? prev.a : shown.songA} tiers={likelyTiers(shown.songA, 3).map((x) => x.tier)} />
                    <Text fz="md" c="dimmed">A move is suggested once one tier passes <b>85%</b> with at least 4 duels behind it.</Text>
                  </Stack>
                </Paper>
              </>
            )}
            <Paper withBorder radius="md" p="md" mih={180} display="flex" data-testid="duel-session"
              style={{ flex: '1 1 0', flexDirection: 'column', gap: 'var(--mantine-spacing-xs)' }}>
              <SectionLabel>This session</SectionLabel>
              <ScrollArea type="auto" offsetScrollbars style={{ flex: 1, minHeight: 0 }}>
                <Stack gap="xs">
                  {s.duels.length === 0 && <Text fz="md" c="dimmed">Your verdicts show up here.</Text>}
                  {[...s.duels].reverse().map((d) => {
                    const aWins = d.verdict === 'A' || d.verdict === 'A_CLEARLY';
                    const draw = d.verdict === 'TOO_CLOSE';
                    return (
                      <Group key={d.id} justify="space-between" gap="2xs" wrap="nowrap">
                        <Text fz="md" truncate="end" style={{ flex: 1, minWidth: 0 }}>
                          <b>{board.nameOf(aWins || draw ? d.a : d.b)}</b> {draw ? '≈' : 'over'} {board.nameOf(aWins || draw ? d.b : d.a)}
                        </Text>
                        <Text fz="md" c="dimmed" style={{ flexShrink: 0 }}>{draw ? 'too close' : d.verdict.endsWith('CLEARLY') ? 'clearly' : ''}</Text>
                      </Group>
                    );
                  })}
                  {s.skipped.length > 0 && <Text fz="md" c="dimmed">{s.skipped.length} skipped as unknown</Text>}
                </Stack>
              </ScrollArea>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Footer row: the keyboard hints under the verdicts, the moves link under the session. */}
        <Grid.Col span={{ base: 12, lg: 8 }}>
          {shown && !showResult && (
            <Group justify="center" gap="lg">
              <Text fz="md" c="dimmed">Margin matters: “clearly” moves scores twice as far</Text>
              <Group gap="3xs"><Kbd size="xs">Space</Kbd><Text fz="md" c="dimmed">play / pause</Text></Group>
              <UnstyledButton onClick={dontKnow}>
                <Group gap="3xs"><Text fz="md" c="dimmed">Don’t know one of them</Text><Kbd size="xs">S</Kbd></Group>
              </UnstyledButton>
            </Group>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>{movesLink}</Grid.Col>
      </Grid>
    </Container>
  );
}
