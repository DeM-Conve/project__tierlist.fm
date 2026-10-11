import { useMemo, useState } from 'react';
import { Box, Button, Group, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { getHotkeyHandler, useDidUpdate, useDisclosure } from '@mantine/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import { useTierName } from '../../tierLabels';
import { songLabel } from '../../tierUtils';
import { filterPickerSongs, pickerTiers, sortPickerSongs } from '../../duel/songPicker';
import { TierChip } from '../TierBits';
import { SongArt } from './DuelBits';

// One row: 4px + a 32px cover + 4px. Fixed, so the list never measures.
export const PICKER_ROW_SIZE = 40;
const LIST_HEIGHT = 360;

const titleOf = (song) => (song.video ? songLabel(song.video).song : 'A song no longer on this board');

// The One song picker: a search box, a filter chip per tier and a
// virtualized list - a board holds hundreds of songs, too many for an
// inline dropdown. ↑/↓ move, Enter picks, Esc closes (Mantine's Modal).
// `songs` are `{ id, tier, video }`.
export function SongPickerModal({ opened, onClose, songs, onPick, category }) {
  const tierName = useTierName();
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState(null);
  const [active, setActive] = useState(0);
  // State, not a ref: the modal mounts its body after the first render, and
  // the virtualizer must re-render once the viewport exists.
  const [viewport, setViewport] = useState(null);

  const sorted = useMemo(() => sortPickerSongs(songs), [songs]);
  const tiers = useMemo(() => pickerTiers(sorted), [sorted]);
  const shown = useMemo(() => filterPickerSongs(sorted, query, tier), [sorted, query, tier]);

  // (No React Compiler in this app, so its "incompatible library" note on
  // useVirtualizer doesn't apply.)
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => viewport,
    estimateSize: () => PICKER_ROW_SIZE,
    overscan: 8,
    getItemKey: (i) => shown[i].id,
  });

  function narrow(q, t) {
    setQuery(q);
    setTier(t);
    setActive(0);
    virtualizer.scrollToOffset(0);
  }
  function step(by) {
    if (!shown.length) return;
    const next = Math.min(shown.length - 1, Math.max(0, active + by));
    setActive(next);
    virtualizer.scrollToIndex(next, { align: 'auto' });
  }
  function pick(song) {
    if (!song) return;
    onPick(song.id);
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Pin one song" size="lg" padding="md">
      <Stack gap="xs">
        <TextInput
          data-autofocus
          aria-label={`Search ${category}`}
          placeholder={`Search ${category}…`}
          leftSection={<Search size={14} />}
          value={query}
          onChange={(e) => narrow(e.currentTarget.value, tier)}
          onKeyDown={getHotkeyHandler([
            ['ArrowDown', () => step(1)],
            ['ArrowUp', () => step(-1)],
            ['Enter', () => pick(shown[active])],
          ])}
        />
        <Group gap="4xs" justify="space-between" wrap="nowrap">
          <Group gap="4xs">
            {tiers.map((t) => (
              <TierChip key={t} tier={t} size={22} active={!tier || tier === t}
                title={tier === t ? 'Every tier' : `Only ${tierName(t)}`}
                onClick={() => narrow(query, tier === t ? null : t)} />
            ))}
          </Group>
          <Text fz="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {shown.length} {shown.length === 1 ? 'song' : 'songs'}
          </Text>
        </Group>
        {shown.length ? (
          <ScrollArea h={LIST_HEIGHT} viewportRef={setViewport} type="auto" offsetScrollbars>
            <Box role="listbox" aria-label="Songs" h={virtualizer.getTotalSize()} pos="relative">
              {virtualizer.getVirtualItems().map((item) => {
                const song = shown[item.index];
                const isActive = item.index === active;
                return (
                  <UnstyledButton
                    key={item.key}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => pick(song)}
                    onMouseMove={() => isActive || setActive(item.index)}
                    pos="absolute"
                    top={0}
                    left={0}
                    w="100%"
                    h={PICKER_ROW_SIZE}
                    px="2xs"
                    style={{
                      transform: `translateY(${item.start}px)`,
                      borderRadius: 6,
                      background: isActive ? 'var(--surface-2)' : undefined,
                    }}
                  >
                    <Group gap="2xs" wrap="nowrap" h="100%">
                      <SongArt video={song.video} size={32} />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text fz="sm" fw={500} truncate="end">{titleOf(song)}</Text>
                        <Text fz="xs" c="dimmed" truncate="end">{song.video?.channelTitle}</Text>
                      </Box>
                      {song.tier && <TierChip tier={song.tier} size={20} />}
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Box>
          </ScrollArea>
        ) : (
          <Text fz="sm" c="dimmed" ta="center" py="xl">No song by that name</Text>
        )}
      </Stack>
    </Modal>
  );
}

// The One song card's control: "Choose a song…" until one is picked, then
// its cover, name and tier with "Change". Opens the picker - by itself, too,
// the moment the card is chosen with no song yet (`active`).
// It sits inside the card's own button, so it's a span with role="button"
// (a button can't hold a button) and keeps its clicks/keys to itself.
export function SongPickerButton({ songs, value, onChange, category, disabled, active }) {
  const [opened, { open, close }] = useDisclosure(false);
  const chosen = value ? songs.find((s) => s.id === value) : null;

  useDidUpdate(() => {
    if (active && !value && !disabled) open();
  }, [active]);

  const openPicker = (e) => {
    e?.stopPropagation();
    if (!disabled) open();
  };

  return (
    // Clicks inside the (portalled) modal still bubble through the React
    // tree to the card - stop them here.
    <Box component="span" display="block" onClick={(e) => e.stopPropagation()}>
      <Button
        component="span"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={chosen ? `Change the pinned song (${titleOf(chosen)})` : 'Choose a song'}
        variant="default"
        fullWidth
        justify="space-between"
        data-disabled={disabled || undefined}
        onClick={openPicker}
        onKeyDown={(e) => {
          e.stopPropagation();
          getHotkeyHandler([['Enter', openPicker], ['Space', openPicker]])(e);
        }}
        leftSection={chosen ? <SongArt video={chosen.video} size={20} /> : <Search size={14} />}
        rightSection={chosen ? (
          <Group gap="2xs" wrap="nowrap">
            {chosen.tier && <TierChip tier={chosen.tier} size={18} />}
            <Text fz="xs" c="dimmed">Change</Text>
          </Group>
        ) : null}
        styles={{ label: { flex: 1, minWidth: 0 } }}
      >
        <Text fz="sm" truncate="end" c={chosen ? undefined : 'dimmed'}>
          {chosen ? titleOf(chosen) : 'Choose a song…'}
        </Text>
      </Button>
      <SongPickerModal opened={opened} onClose={close} songs={songs} onPick={onChange} category={category} />
    </Box>
  );
}
