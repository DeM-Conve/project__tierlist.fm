import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Flex,
  Group,
  Image,
  Kbd,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { ExternalLink, Link2, Play, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { TIER_COLORS, TIER_ORDER, TODO_TIER } from '../tiers';
import { selectPlayerCoversPage, selectTierCategories, selectTierGroups } from '../store/selectors';
import { chooseBoard, setCurrent } from '../store/addSongsSlice';
import { isSequenceKey } from '../keyboard/sequence';
import { songLabel, TIER_INK, youtubeUrl } from '../tierUtils';
import { EqualizerMark, TierChip } from './TierBits';

function isTyping() {
  const el = document.activeElement;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
}

function Thumb({ video, w }) {
  return <Image src={video.thumbnail} alt="" w={w} radius="sm" fit="cover" style={{ aspectRatio: '16 / 9', flex: 'none' }} />;
}

// One big tier target: the whole point of the card is "press a number".
function TierTarget({ tier, hotkey, disabled, onClick }) {
  const button = (
    <UnstyledButton
      onClick={disabled ? undefined : onClick}
      aria-label={`Put it in ${tier}`}
      aria-disabled={disabled}
      className="add-tier"
      bg={TIER_COLORS[tier]}
      h={76}
      style={{
        flex: 1,
        minWidth: 64,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Text ff="var(--font-display)" fw={900} fz={tier === TODO_TIER ? 16 : 24} lh={1} c={TIER_INK}>
        {tier === TODO_TIER ? 'Later' : tier}
      </Text>
      <Kbd size="xs">{hotkey}</Kbd>
    </UnstyledButton>
  );
  return disabled ? (
    <Tooltip label={`This board has no ${tier} playlist`} withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

// The one input: paste a YouTube / YouTube Music link (or several) and
// those songs are added. Links only - a YouTube search costs 100 quota units,
// a pasted link 1.
function SongInput({ inputRef, onAddLinks }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  function submit(value) {
    if (!value.trim()) return false;
    if (!onAddLinks(value)) {
      setError('That isn’t a YouTube link - copy the address of the song’s page and paste it here.');
      return false;
    }
    setText('');
    setError(null);
    inputRef.current?.blur();
    return true;
  }

  return (
    <TextInput
      ref={inputRef}
      size="lg"
      radius="md"
      value={text}
      onChange={(e) => {
        setText(e.currentTarget.value);
        setError(null);
      }}
      onPaste={(e) => {
        if (submit(e.clipboardData.getData('text'))) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit(text);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setText('');
          setError(null);
          inputRef.current?.blur();
        }
      }}
      placeholder="Paste a YouTube or YouTube Music link"
      leftSection={<Link2 size={18} />}
      rightSection={<Kbd size="xs">Ctrl V</Kbd>}
      rightSectionWidth={72}
      error={error}
      aria-label="Paste a YouTube link"
    />
  );
}

// "Add songs": bring a new song in (paste its link), then one
// keypress puts it in a tier of the guessed board. Keys while the card is
// up: Shift+1-5 tier, t Later (the board's TODO list), s skip, x remove, Enter
// listen, b another board, u undo, / or a back to the input.
export default function AddSongsView({ addSongs, actions, onAddLinks }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const categories = useSelector(selectTierCategories);
  const tierGroups = useSelector(selectTierGroups);
  const playingId = useSelector((s) => s.focus.focusedVideo?.videoId);
  const playerCoversPage = useSelector(selectPlayerCoversPage);
  const inputRef = useRef(null);
  const boardRef = useRef(null);

  const { current, list, placed } = addSongs;
  const guess = addSongs.guessBoard(current);
  const board = guess ? tierGroups[guess.category] ?? {} : {};
  const hasTodo = !!board[TODO_TIER];
  const where = current ? placed.get(current.videoId)?.[0] : null;
  const isPlaying = current && playingId === current.videoId;
  const filed = addSongs.history.filter((e) => e.kind === 'file').reverse();

  // Arriving with nothing waiting (or via the `a` key): straight to the input.
  useEffect(() => {
    if (!current || location.state?.focusInput) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // The card follows the music: when the dock moves on to the next waiting
  // song by itself (the previous one ended), show that one.
  useEffect(() => {
    if (playingId && list.some((v) => v.videoId === playingId)) dispatch(setCurrent(playingId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  // Shift+1-5 puts the song in a tier - the same key that rates the playing
  // song everywhere else, so plain digits stay the player's seek-to-percent.
  // Capture phase + stopImmediatePropagation so Shift+digit / u / Ctrl+Z act
  // on this card, not on a board song that happens to be playing. Not while
  // the full-screen player covers the page.
  useEffect(() => {
    function onKeyDown(e) {
      if (isSequenceKey(e)) return;
      if (playerCoversPage || isTyping() || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const claim = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (mod && e.key.toLowerCase() === 'z' && addSongs.history.length) {
        claim();
        actions.undo();
        return;
      }
      if (mod) return;
      if (e.key === 'u') {
        claim();
        actions.undo();
      } else if (e.key === '/' || e.key === 'a') {
        claim();
        inputRef.current?.focus();
      } else if (!current) {
        return;
      } else if (e.key === 'x') {
        claim();
        actions.remove(current);
      } else if (e.key === 's') {
        claim();
        actions.skip(current);
      } else if (e.key === 'Enter') {
        claim();
        actions.listen(current);
      } else if (where || !guess) {
        return;
      } else if (e.shiftKey && e.code.startsWith('Digit')) {
        // e.code, not e.key: with Shift held e.key is "!", "@", ...
        const tier = TIER_ORDER[Number(e.code.slice(5)) - 1];
        if (!tier) return;
        claim();
        if (board[tier]) actions.file(current, guess.category, tier);
      } else if (e.key === 't' && hasTodo) {
        claim();
        actions.file(current, guess.category, TODO_TIER);
      } else if (e.key === 'b') {
        claim();
        boardRef.current?.focus();
        boardRef.current?.click();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  const label = current ? songLabel(current) : null;
  const upNext = current ? list.filter((v) => v.videoId !== current.videoId) : [];

  return (
    <Stack gap="xl" maw={1100}>
      <Stack gap={4}>
        <Text fz={11} fw={800} tt="uppercase" c="accent" style={{ letterSpacing: 1.5 }}>
          Add songs
        </Text>
        <Title order={1} fz={{ base: 30, sm: 40 }} fw={900} lh={1}>
          Add a song
        </Title>
        <Text c="dimmed" fz="sm">
          Paste its YouTube link, then press <Kbd size="xs">Shift</Kbd> + <Kbd size="xs">1</Kbd>–<Kbd size="xs">5</Kbd> to put it in a tier. <Kbd size="xs">Ctrl</Kbd> <Kbd size="xs">V</Kbd> with a link works on any page.
        </Text>
      </Stack>

      <SongInput inputRef={inputRef} onAddLinks={onAddLinks} />

      {current && (
        <Paper withBorder radius="lg" p={{ base: 'md', sm: 'xl' }} bg="var(--surface)">
          <Flex gap="xl" direction={{ base: 'column', sm: 'row' }}>
            <UnstyledButton
              onClick={() => actions.listen(current)}
              pos="relative"
              w={{ base: '100%', sm: 320 }}
              style={{ flex: 'none', borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' }}
              aria-label={`Play ${label.song}`}
            >
              <Image src={current.thumbnail} alt="" style={{ aspectRatio: '16 / 9' }} fit="cover" />
              <Group pos="absolute" left={10} bottom={10} gap={6} px={10} py={6} bg="var(--media-control-bg)" style={{ borderRadius: 999 }}>
                {isPlaying ? (
                  <EqualizerMark color="var(--media-fg)" height={11} />
                ) : (
                  <Play size={13} color="var(--media-fg)" fill="currentColor" />
                )}
                <Text fz="xs" fw={700} c="var(--media-fg)">
                  {isPlaying ? 'Playing' : 'Listen'}
                </Text>
                {!isPlaying && <Kbd size="xs">Enter</Kbd>}
              </Group>
            </UnstyledButton>

            <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
              <Stack gap={4}>
                <Title order={2} fz={{ base: 24, sm: 30 }} lh={1.15} lineClamp={2} title={current.title}>
                  {label.song}
                </Title>
                <Text c="dimmed">{label.artist}</Text>
              </Stack>

              {where ? (
                <Paper radius="md" p="md" bg="var(--surface-2)">
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <Group gap="xs">
                      <Text fz="sm">Already in</Text>
                      <TierChip tier={where.tier} />
                      <Text fz="sm" fw={600}>
                        {where.category}
                      </Text>
                    </Group>
                    <Group gap="xs">
                      <Button variant="light" onClick={() => navigate(`/tier/${encodeURIComponent(where.category)}/t/${where.tier}`)}>
                        Open it
                      </Button>
                      <Button variant="default" rightSection={<Kbd size="xs">x</Kbd>} onClick={() => actions.remove(current)}>
                        Dismiss
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ) : (
                <>
                  <Group gap="sm" wrap="wrap" align="center">
                    <Select
                      ref={boardRef}
                      data={categories}
                      value={guess?.category ?? null}
                      onChange={(category) => {
                        if (category) dispatch(chooseBoard({ videoId: current.videoId, category }));
                        boardRef.current?.blur();
                      }}
                      searchable
                      allowDeselect={false}
                      w={230}
                      aria-label="Board"
                      leftSection={
                        <Text fz={11} fw={700} c="dimmed">
                          BOARD
                        </Text>
                      }
                      leftSectionWidth={60}
                      rightSection={<Kbd size="xs">b</Kbd>}
                    />
                    {guess?.reason && (
                      <Text fz="xs" c="dimmed">
                        {guess.reason}
                      </Text>
                    )}
                  </Group>
                  <Group gap="sm" wrap="nowrap">
                    {TIER_ORDER.map((tier, i) => (
                      <TierTarget
                        key={tier}
                        tier={tier}
                        hotkey={`⇧${i + 1}`}
                        disabled={!board[tier]}
                        onClick={() => actions.file(current, guess.category, tier)}
                      />
                    ))}
                    {hasTodo && (
                      <TierTarget tier={TODO_TIER} hotkey="t" onClick={() => actions.file(current, guess.category, TODO_TIER)} />
                    )}
                  </Group>
                </>
              )}

              <Group gap="xs" wrap="wrap">
                {upNext.length > 0 && (
                  <Button variant="default" leftSection={<SkipForward size={15} />} rightSection={<Kbd size="xs">s</Kbd>} onClick={() => actions.skip(current)}>
                    Skip
                  </Button>
                )}
                {!where && (
                  <Button variant="subtle" color="gray" leftSection={<Trash2 size={15} />} rightSection={<Kbd size="xs">x</Kbd>} onClick={() => actions.remove(current)}>
                    Remove
                  </Button>
                )}
                <Tooltip label="Open on YouTube" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    component="a"
                    href={youtubeUrl(current.videoId)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open on YouTube"
                  >
                    <ExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Stack>
          </Flex>
        </Paper>
      )}

      {upNext.length > 0 && (
        <Stack gap="xs">
          <Group gap={8}>
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
              Waiting
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {upNext.length}
            </Badge>
          </Group>
          <ScrollArea type="hover" offsetScrollbars>
            <Group gap="sm" wrap="nowrap">
              {upNext.map((v) => {
                const l = songLabel(v);
                return (
                  <UnstyledButton key={v.videoId} w={150} onClick={() => dispatch(setCurrent(v.videoId))} style={{ flex: 'none' }}>
                    <Thumb video={v} w={150} />
                    <Text fz="xs" fw={600} mt={6} truncate="end" title={v.title}>
                      {l.song}
                    </Text>
                    <Text fz={11} c="dimmed" truncate="end">
                      {l.artist}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Group>
          </ScrollArea>
        </Stack>
      )}

      {filed.length > 0 && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
              Added this session
            </Text>
            <Button size="compact-sm" variant="subtle" color="gray" leftSection={<Undo2 size={14} />} rightSection={<Kbd size="xs">u</Kbd>} onClick={() => actions.undo()}>
              Undo last
            </Button>
          </Group>
          <Paper withBorder radius="md" p={4}>
            {filed.map((entry) => {
              const l = songLabel(entry.video);
              return (
                <Group key={`${entry.video.videoId}:${entry.tier}`} gap="sm" wrap="nowrap" p={6}>
                  <Thumb video={entry.video} w={56} />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text fz="sm" fw={600} truncate="end">
                      {l.song}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate="end">
                      {l.artist}
                    </Text>
                  </Stack>
                  <TierChip tier={entry.tier} />
                  <Text fz="sm" w={140} truncate="end">
                    {entry.category}
                  </Text>
                  <Tooltip label="Undo - take it out again" withArrow>
                    <ActionIcon variant="subtle" color="gray" onClick={() => actions.undo(entry)} aria-label={`Undo adding ${l.song}`}>
                      <Undo2 size={15} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              );
            })}
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
