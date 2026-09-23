import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Alert, Autocomplete, Button, Chip, Group, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BOARD_TIERS, TODO_TIER } from '../tiers';
import { boardFromName, boardsOf } from '../todoLists';
import { normalizeTemplate, parseTitle, renderTitle } from '../naming';
import { selectTierGroups, selectTierPlaylists } from '../store/selectors';
import { useCreatePlaylistsMutation } from '../api/queries';
import { TierChip } from './TierBits';

// Creates tier playlists on YouTube, named by the naming template:
//   - from Home: a brand-new tier list (category + any tiers)
//   - from a board: just its missing tiers, or its TODO list (category
//     fixed; `initialTiers` = what to preselect)
export default function CreateTierPlaylistsModal({ opened, onClose, category: fixedCategory, initialTiers, onCreated }) {
  const template = useSelector((s) => s.naming.template);
  const todoKeyword = useSelector((s) => s.naming.todoKeyword);
  const tierGroups = useSelector(selectTierGroups);
  const tierPlaylists = useSelector(selectTierPlaylists);
  const createMutation = useCreatePlaylistsMutation();

  const existingTiers = fixedCategory ? Object.keys(tierGroups[fixedCategory] || {}) : [];
  const brackets = useMemo(
    () => [...new Set((tierPlaylists || []).map((p) => p.parsed.bracket).filter(Boolean))],
    [tierPlaylists]
  );
  const boardBracket = fixedCategory
    ? Object.values(tierGroups[fixedCategory] || {})[0]?.parsed?.bracket ?? ''
    : '';

  const [category, setCategory] = useState('');
  const [bracket, setBracket] = useState(boardBracket || brackets[0] || '');
  const [tiers, setTiers] = useState(() =>
    (initialTiers ?? BOARD_TIERS).filter((t) => !existingTiers.includes(t))
  );
  const [privacy, setPrivacy] = useState('private');

  const name = (fixedCategory ?? category).trim();
  const usesBracket = normalizeTemplate(template).includes('{tag}');
  const titles = tiers
    .filter((t) => !existingTiers.includes(t))
    .sort((a, b) => BOARD_TIERS.indexOf(a) - BOARD_TIERS.indexOf(b))
    .map((tier) => ({
      tier,
      // A to-do list is the template with the keyword in the tier's place.
      title: renderTitle(template, { bracket: bracket.trim() || null, category: name, tier: tier === TODO_TIER ? todoKeyword : tier }),
    }));
  const exists = !fixedCategory && name && tierGroups[name];
  // Safety net: every name we create must be recognised by the template
  // again, or the new playlist would be invisible in the app.
  const boards = [
    ...boardsOf((tierPlaylists || []).filter((p) => p.parsed.tier !== TODO_TIER && p.parsed.category !== name)),
    { category: name, tags: bracket.trim() ? [bracket.trim()] : [] },
  ];
  const unrecognised = titles.filter((t) =>
    t.tier === TODO_TIER
      ? boardFromName(t.title, todoKeyword, boards) !== name
      : parseTitle(t.title, [template])?.tier !== t.tier
  );
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
        {usesBracket && (
          <Autocomplete
            label="Tag"
            description="The label your template puts in the name, e.g. G"
            data={brackets}
            value={bracket}
            onChange={setBracket}
            error={name && unrecognised.length ? 'Your naming template needs a tag here' : null}
          />
        )}
        <div>
          <Text fz="sm" fw={500} mb={6}>
            Tiers to create
          </Text>
          <Chip.Group multiple value={tiers} onChange={setTiers}>
            <Group gap={6}>
              {BOARD_TIERS.map((t) => (
                <Chip key={t} value={t} disabled={existingTiers.includes(t)} size="sm">
                  {t}
                  {existingTiers.includes(t) ? ' (exists)' : ''}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
        <div>
          <Text fz="sm" fw={500} mb={6}>
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
            <Stack gap={4}>
              {titles.map((t) => (
                <Group key={t.tier} gap={8} wrap="nowrap">
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
