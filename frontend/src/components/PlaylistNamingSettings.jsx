import { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Badge,
  Button,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Check, Plus, Wand2 } from 'lucide-react';
import {
  REQUIRED_TOKENS,
  TEMPLATE_PRESETS,
  TIER_LABEL_PRESETS,
  TOKEN_NAME,
  customTokens,
  detectNaming,
  parseTitle,
  sameLabels,
  validateDisplayNames,
  validateTemplate,
  validateTierLabels,
} from '../naming';
import { setNaming } from '../store/namingSlice';
import { selectNamingSettings } from '../store/selectors';
import { BOARD_TIERS, TIER_ORDER, TODO_TIER } from '../tiers';
import { TierChip } from './TierBits';

// Settings -> Playlist naming: the template (+ tier names) that decides which
// playlists are tier playlists - and so which ones are visible in the app at
// all. It never renames anything on YouTube; the preview lists what the
// draft matches, and Save applies it.
export default function PlaylistNamingSettings() {
  const dispatch = useDispatch();
  const active = useSelector(selectNamingSettings);
  const allPlaylists = useSelector((s) => s.auth.playlists);
  const inputRef = useRef(null);

  // The draft naming: { template, tierLabels }. Nothing applies until saved.
  const [draft, setDraftRaw] = useState(active);
  const setTemplate = (v) => setDraftRaw((d) => ({ ...d, template: v }));
  const setLabel = (slot, v) => setDraftRaw((d) => ({ ...d, tierLabels: { ...d.tierLabels, [slot]: v } }));
  const setShown = (slot, v) => setDraftRaw((d) => ({ ...d, tierDisplayNames: { ...d.tierDisplayNames, [slot]: v || null } }));
  const [newToken, setNewToken] = useState('');

  const templateErrors = validateTemplate(draft.template);
  const labelErrors = validateTierLabels(draft.tierLabels);
  const shownErrors = validateDisplayNames(draft.tierDisplayNames);
  const invalid = templateErrors.length > 0 || Object.keys(labelErrors).length > 0;
  const dirty =
    draft.template !== active.template ||
    !sameLabels(draft.tierLabels, active.tierLabels) ||
    !sameLabels(draft.tierDisplayNames, active.tierDisplayNames);
  const shownName = (slot) => draft.tierDisplayNames[slot] || draft.tierLabels[slot];
  const draftTokens = customTokens(draft.template);

  // Which of the user's playlists the draft picks up - only those are
  // visible in the app. Nothing is renamed here; this page only decides
  // what counts as a tier playlist.
  const matched = useMemo(
    () =>
      invalid || !allPlaylists
        ? []
        : allPlaylists.flatMap((p) => {
            const parsed = parseTitle(p.title, [draft]);
            return parsed ? [{ id: p.id, title: p.title, parsed }] : [];
          }),
    [allPlaylists, draft, invalid]
  );
  const boardCount = new Set(matched.map((m) => m.parsed.category)).size;
  const hiddenCount = (allPlaylists?.length ?? 0) - matched.length;

  function insertToken(token) {
    const el = inputRef.current;
    const text = draft.template;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setTemplate(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save() {
    dispatch(setNaming(draft));
    notifications.show({ message: `Saved - ${matched.length} playlists in ${boardCount} tier lists` });
  }

  function addToken() {
    const name = newToken.trim().replace(/^\{|\}$/g, '');
    if (!TOKEN_NAME.test(name) || draftTokens.includes(name) || ['category', 'tier'].includes(name)) return;
    insertToken(`{${name}}`);
    setNewToken('');
  }
  const newTokenName = newToken.trim().replace(/^\{|\}$/g, '');
  const newTokenError =
    newTokenName && !TOKEN_NAME.test(newTokenName)
      ? 'A word: letters, digits, _'
      : ['category', 'tier', ...draftTokens].includes(newTokenName)
      ? 'Already in the template'
      : null;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2} mb="3xs">
          Playlist naming
        </Title>
        <Text c="dimmed" fz="sm">
          Which of your YouTube playlists are tier lists. A playlist shows up in the app only when its name follows the
          template - everything else (like a private playlist) stays hidden. Nothing on YouTube is changed here.
        </Text>
      </div>
      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <div>
              <Text fw={600} fz="sm">
                Template
              </Text>
              <Text fz="xs" c="dimmed">
                Needs {'{category}'} and {'{tier}'}. Anything else in {'{braces}'} is a token of your own - kept as-is when
                renaming.
              </Text>
            </div>
            <Group gap="xs">
              <Tooltip label="Find the template and tier names that fit the playlists you already have" withArrow>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<Wand2 size={13} />}
                  onClick={() =>
                    allPlaylists && setDraftRaw((d) => ({ ...d, ...detectNaming(allPlaylists.map((p) => p.title), d) }))
                  }
                  disabled={!allPlaylists}
                >
                  Detect from my playlists
                </Button>
              </Tooltip>
              <Select
                size="xs"
                w={220}
                placeholder="Start from a preset…"
                data={TEMPLATE_PRESETS}
                value={null}
                onChange={(v) => v && setTemplate(v)}
                comboboxProps={{ withinPortal: true }}
              />
            </Group>
          </Group>
          <TextInput
            ref={inputRef}
            value={draft.template}
            onChange={(e) => setTemplate(e.target.value)}
            error={templateErrors[0]}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-lg)' } }}
            size="md"
            aria-label="Template"
          />
          <Group gap="3xs" wrap="wrap">
            <Text fz="xs" c="dimmed" mr="4xs">
              Insert:
            </Text>
            {REQUIRED_TOKENS.map((t) => (
              <Tooltip key={t.token} label={t.description} withArrow>
                <Button
                  size="compact-xs"
                  variant="light"
                  ff="monospace"
                  onClick={() => insertToken(t.token)}
                  disabled={draft.template.includes(t.token)}
                >
                  {t.token}
                </Button>
              </Tooltip>
            ))}
            {draftTokens.map((t) => (
              <Badge key={t} variant="outline" color="gray" radius="sm" ff="monospace" tt="none">
                {`{${t}}`} yours
              </Badge>
            ))}
            <TextInput
              size="xs"
              w={200}
              placeholder="Your own token"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addToken()}
              error={newTokenError}
              leftSection={<Plus size={13} />}
              rightSectionWidth={52}
              rightSection={
                <Button size="compact-xs" variant="subtle" onClick={addToken} disabled={!newTokenName || !!newTokenError}>
                  Add
                </Button>
              }
              aria-label="Add your own token"
            />
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <div>
              <Text fw={600} fz="sm">
                Tier names
              </Text>
              <Text fz="xs" c="dimmed">
                Best first. <b>In playlist names</b> is what {'{tier}'} matches, exactly. <b>Shown as</b> is what the app
                calls the tier everywhere - leave it empty to show the same.
              </Text>
            </div>
            <Select
              size="xs"
              w={220}
              placeholder="Start from a preset…"
              data={TIER_LABEL_PRESETS.map(({ value, label }) => ({ value, label }))}
              value={null}
              onChange={(v) => {
                const preset = TIER_LABEL_PRESETS.find((p) => p.value === v);
                if (preset) TIER_ORDER.forEach((t, i) => setLabel(t, preset.labels[i]));
              }}
              comboboxProps={{ withinPortal: true }}
              aria-label="Tier names preset"
            />
          </Group>
          <SimpleGrid cols={{ base: 2, xs: 3, md: 6 }} spacing="sm">
            {BOARD_TIERS.map((slot, i) => (
              <Stack key={slot} gap="3xs">
                <TextInput
                  label={slot === TODO_TIER ? 'To-do' : `Tier ${i + 1}${i === 0 ? ' (best)' : ''}`}
                  description="In playlist names"
                  value={draft.tierLabels[slot] ?? ''}
                  onChange={(e) => setLabel(slot, e.target.value)}
                  error={labelErrors[slot]}
                  leftSection={<TierChip tier={slot} size={16} label="" />}
                  styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                />
                <TextInput
                  size="xs"
                  description="Shown as"
                  placeholder={draft.tierLabels[slot] || 'same'}
                  value={draft.tierDisplayNames[slot] ?? ''}
                  onChange={(e) => setShown(slot, e.target.value)}
                  error={shownErrors[slot]}
                  aria-label={`${slot === TODO_TIER ? 'To-do' : `Tier ${i + 1}`} shown as`}
                />
              </Stack>
            ))}
          </SimpleGrid>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Group gap="2xs">
            <Text fw={600} fz="sm">
              Matching playlists
            </Text>
            <Badge variant="light" color="gray">
              {allPlaylists ? `${matched.length} playlists · ${boardCount} tier lists` : 'loading…'}
            </Badge>
          </Group>
          {allPlaylists && (
            <Text fz="xs" c="dimmed">
              {hiddenCount} other playlist{hiddenCount === 1 ? '' : 's'} don&apos;t match and stay hidden
            </Text>
          )}
        </Group>
        {invalid ? (
          <Text fz="sm" c="dimmed">
            Fix the template / tier names above to see what matches.
          </Text>
        ) : matched.length === 0 ? (
          <Text fz="sm" c="dimmed">
            None of your playlists match this template.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={360} type="auto">
            <Table striped highlightOnHover fz="sm" verticalSpacing="3xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Playlist</Table.Th>
                  <Table.Th>Tier list</Table.Th>
                  <Table.Th>Tier</Table.Th>
                  {draftTokens.map((t) => (
                    <Table.Th key={t} ff="monospace">{`{${t}}`}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {matched.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td ff="monospace">{m.title}</Table.Td>
                    <Table.Td>{m.parsed.category}</Table.Td>
                    <Table.Td>
                      <TierChip tier={m.parsed.tier} size={20} label={shownName(m.parsed.tier)} />
                    </Table.Td>
                    {draftTokens.map((t) => (
                      <Table.Td key={t} ff="monospace">
                        {m.parsed.fields[t]}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Paper>

      {/* Stays in view at the bottom of the page while editing the naming
          above - sticky via Mantine's style props. */}
      <Paper pos="sticky" bottom={0} withBorder radius="md" p="sm" bg="var(--surface)" shadow="md" style={{ zIndex: 5 }}>
        <Group gap="sm">
          <Button leftSection={<Check size={15} />} onClick={save} disabled={invalid || Object.keys(shownErrors).length > 0 || !dirty}>
            Save
          </Button>
          <Button variant="subtle" color="gray" onClick={() => setDraftRaw(active)} disabled={!dirty}>
            Reset
          </Button>
          <Text fz="xs" c="dimmed" ml="auto">
            {dirty ? 'Unsaved changes' : 'Saved'}
          </Text>
        </Group>
      </Paper>
    </Stack>
  );
}
