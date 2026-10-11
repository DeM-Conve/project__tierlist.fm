import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Alert, Autocomplete, Button, Chip, Group, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BOARD_TIERS, TODO_TIER } from '../tiers';
import { customTokens, parseTitle, renderTitle } from '../naming';
import { selectNaming, selectTierGroups, selectTierPlaylists, selectTodoRows } from '../store/selectors';
import { useTierName } from '../tierLabels';
import { useCreatePlaylistsMutation } from '../api/queries';
import { TierChip } from './TierBits';

// Creates tier playlists on YouTube, named by the naming template:
//   - from Home: a brand-new tier list (category + any tiers)
//   - from a board: just its missing tiers, or its TODO list (category
//     fixed; `initialTiers` = what to preselect)
export default function CreateTierPlaylistsModal({ opened, onClose, category: fixedCategory, initialTiers, onCreated }) {
  const naming = useSelector(selectNaming);
  const tierName = useTierName();
  const tierGroups = useSelector(selectTierGroups);
  const tierPlaylists = useSelector(selectTierPlaylists);
  const todoRows = useSelector(selectTodoRows);
  const createMutation = useCreatePlaylistsMutation();

  const [category, setCategory] = useState('');
  const name = (fixedCategory ?? category).trim();
  // A to-do list already named for this board counts as existing even while
  // the board has no ranked tiers yet (its row is then `missingBoard`, not in
  // tierGroups) - creating the board must not make a second, empty one.
  const hasTodo = todoRows.some((r) => r.category === name);
  const existingTiers = [
    ...new Set([...(fixedCategory ? Object.keys(tierGroups[fixedCategory] || {}) : []), ...(hasTodo ? [TODO_TIER] : [])]),
  ];
  // The user's own tokens (whatever they named them): one input each, suggesting the values
  // their playlists already use; a board's missing tiers reuse the board's.
  const tokens = useMemo(() => customTokens(naming.template), [naming.template]);
  const known = useMemo(
    () =>
      Object.fromEntries(
        tokens.map((t) => [t, [...new Set((tierPlaylists || []).map((p) => p.parsed.fields?.[t]).filter(Boolean))]])
      ),
    [tierPlaylists, tokens]
  );
  const boardFields = fixedCategory
    ? Object.values(tierGroups[fixedCategory] || {}).find((p) => p.parsed.tier !== TODO_TIER)?.parsed?.fields ?? {}
    : {};

  const [fieldValues, setFieldValues] = useState(() =>
    Object.fromEntries(tokens.map((t) => [t, boardFields[t] ?? known[t]?.[0] ?? '']))
  );
  const fields = Object.fromEntries(tokens.map((t) => [t, (fieldValues[t] ?? '').trim() || undefined]));
  const [tiers, setTiers] = useState(() =>
    (initialTiers ?? BOARD_TIERS).filter((t) => !existingTiers.includes(t))
  );
  const [privacy, setPrivacy] = useState('private');

  const titles = tiers
    .filter((t) => !existingTiers.includes(t))
    .sort((a, b) => BOARD_TIERS.indexOf(a) - BOARD_TIERS.indexOf(b))
    .map((tier) => ({
      tier,
      // A to-do list is the template with the to-do name in the tier's place.
      title: renderTitle(naming, { fields, category: name, tier }),
    }));
  const exists = !fixedCategory && name && tierGroups[name];
  // Safety net: every name we create must be recognised by the template
  // again (same board and tier), or the new playlist would be invisible.
  const unrecognised = titles.filter((t) => {
    const back = parseTitle(t.title, [naming]);
    return back?.tier !== t.tier || back.category !== name;
  });
  const canCreate = name && titles.length > 0 && !exists && unrecognised.length === 0 && !createMutation.isPending;

  async function create() {
    const result = await createMutation.mutateAsync(titles.map((t) => ({ title: t.title, privacyStatus: privacy })));
    const failed = result.results.filter((r) => !r.success);
    notifications.show({
      color: failed.length ? 'red' : undefined,
      message: failed.length
        ? `Created ${result.applied} of ${result.total} playlists - ${failed[0].error}`
        : `Created ${result.applied} playlist${result.applied === 1 ? '' : 's'} for ${name}`,
    });
    if (result.applied > 0) {
      onCreated?.(name);
      onClose();
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={<Text fw={800}>{fixedCategory ? `Add to ${fixedCategory}` : 'New tier list'}</Text>}
    >
      <Stack gap="md">
        {!fixedCategory && (
          <TextInput
            label="Category"
            description="The board's name, e.g. Rap or Jazz_Cozy"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={exists ? `${name} already exists - open it and use "Add missing tiers"` : null}
            data-autofocus
          />
        )}
        {tokens.map((t) => (
          <Autocomplete
            key={t}
            label={`{${t}}`}
            description="Your own token from the naming template"
            data={known[t]}
            value={fieldValues[t] ?? ''}
            onChange={(v) => setFieldValues((f) => ({ ...f, [t]: v }))}
            error={name && unrecognised.length && !fields[t] ? 'Your naming template needs a value here' : null}
          />
        ))}
        <div>
          <Text fz="sm" fw={500} mb="3xs">
            Tiers to create
          </Text>
          <Chip.Group multiple value={tiers} onChange={setTiers}>
            <Group gap="3xs">
              {BOARD_TIERS.map((t) => (
                <Chip key={t} value={t} disabled={existingTiers.includes(t)} size="sm">
                  {tierName(t)}
                  {existingTiers.includes(t) ? ' (exists)' : ''}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
        <div>
          <Text fz="sm" fw={500} mb="3xs">
            Visibility on YouTube
          </Text>
          <SegmentedControl
            value={privacy}
            onChange={setPrivacy}
            data={[
              { value: 'private', label: 'Private' },
              { value: 'unlisted', label: 'Unlisted' },
              { value: 'public', label: 'Public' },
            ]}
          />
        </div>
        {name && titles.length > 0 && (
          <Alert variant="light" color="gray" title="Will create (named by your template)">
            <Stack gap="4xs">
              {titles.map((t) => (
                <Group key={t.tier} gap="2xs" wrap="nowrap">
                  <TierChip tier={t.tier} size={20} />
                  <Text fz="sm" ff="monospace" truncate="end">
                    {t.title}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Alert>
        )}
        <Text fz="xs" c="dimmed">
          Uses about 50 YouTube API quota units per playlist (daily limit 10,000).
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!canCreate} loading={createMutation.isPending}>
            Create {titles.length || ''} playlist{titles.length === 1 ? '' : 's'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
