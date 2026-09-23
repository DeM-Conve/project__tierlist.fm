import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Alert, Autocomplete, Button, Chip, Group, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { TIER_ORDER } from '../tiers';
import { parseTitle, renderTitle } from '../naming';
import { selectTierGroups, selectTierPlaylists } from '../store/selectors';
import { useCreatePlaylistsMutation } from '../api/queries';
import { TierChip } from './TierBits';

// Creates tier playlists on YouTube, named by the naming template:
//   - from Home: a brand-new tier list (category + any tiers)
//   - from a board: just its missing tiers (category fixed)
export default function CreateTierPlaylistsModal({ opened, onClose, category: fixedCategory, onCreated }) {
  const template = useSelector((s) => s.naming.template);
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
  const [tiers, setTiers] = useState(() => TIER_ORDER.filter((t) => !existingTiers.includes(t)));
  const [privacy, setPrivacy] = useState('private');

  const name = (fixedCategory ?? category).trim();
  const usesBracket = template.includes('{bracket}');
  const titles = tiers
    .filter((t) => !existingTiers.includes(t))
    .sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b))
    .map((tier) => ({ tier, title: renderTitle(template, { bracket: bracket.trim() || null, category: name, tier }) }));
  const exists = !fixedCategory && name && tierGroups[name];
  // Safety net: every name we create must be recognised by the template
  // again, or the new playlist would be invisible in the app.
  const unrecognised = titles.filter((t) => parseTitle(t.title, [template])?.tier !== t.tier);
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
      title={<Text fw={800}>{fixedCategory ? `Add tiers to ${fixedCategory}` : 'New tier list'}</Text>}
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
            label="Bracket"
            description="Group tag in the name (optional)"
            data={brackets}
            value={bracket}
            onChange={setBracket}
            error={name && unrecognised.length ? 'Your naming template needs a bracket here' : null}
          />
        )}
        <div>
          <Text fz="sm" fw={500} mb={6}>
            Tiers to create
          </Text>
          <Chip.Group multiple value={tiers} onChange={setTiers}>
            <Group gap={6}>
              {TIER_ORDER.map((t) => (
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
