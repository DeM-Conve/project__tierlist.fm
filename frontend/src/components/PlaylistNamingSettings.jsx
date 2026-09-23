import { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Paper,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { AlertTriangle, ArrowRight, CheckCircle2, Play, RotateCcw, Wand2 } from 'lucide-react';
import { TEMPLATE_PRESET_GROUPS, TOKENS, detectTemplate, normalizeTemplate, parseTitle, renderTitle, validateTemplate } from '../naming';
import { finishMigration, setTemplate, startMigration } from '../store/namingSlice';
import { selectTierPlaylists } from '../store/selectors';
import { useInvalidatePlaylists, useRenamePlaylistsMutation } from '../api/queries';

const BATCH = 10;
const QUOTA_PER_RENAME = 51; // playlists.list (1) + playlists.update (50)
const DAILY_QUOTA = 10000;

// Settings -> Playlist naming. Modelled on Immich's storage template:
// edit a template, see exactly what every tier playlist would be renamed to,
// then run the migration job that renames them on YouTube.
export default function PlaylistNamingSettings() {
  const dispatch = useDispatch();
  const activeTemplate = useSelector((s) => s.naming.template);
  const migratingFrom = useSelector((s) => s.naming.migratingFrom);
  const tierPlaylists = useSelector(selectTierPlaylists);
  const allPlaylists = useSelector((s) => s.auth.playlists);
  const renameMutation = useRenamePlaylistsMutation();
  const invalidatePlaylists = useInvalidatePlaylists();
  const inputRef = useRef(null);

  const [draft, setDraftRaw] = useState(activeTemplate);
  const setDraft = (v) => setDraftRaw(normalizeTemplate(v));
  const [job, setJob] = useState(null); // { done, total, failed: [{from,to,error}] , running }

  const errors = validateTemplate(draft);
  const dirty = draft !== activeTemplate;

  const plan = useMemo(
    () =>
      (tierPlaylists || []).map((p) => ({
        id: p.id,
        from: p.title,
        to: errors.length ? p.title : renderTitle(draft, p.parsed),
        parsed: p.parsed,
      })),
    [tierPlaylists, draft, errors.length]
  );
  const changes = plan.filter((r) => r.from !== r.to);
  const collisions = useMemo(() => {
    const seen = new Map();
    plan.forEach((r) => seen.set(r.to, (seen.get(r.to) || 0) + 1));
    return [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  }, [plan]);
  // Every renamed title must parse back under the new template (same board +
  // tier), or that playlist would drop out of the app after the rename.
  const unrecognised = errors.length
    ? []
    : plan.filter((r) => {
        const back = parseTitle(r.to, [draft]);
        return !back || back.category !== r.parsed.category || back.tier !== r.parsed.tier;
      });
  const dropsBracket = !draft.includes('{tag}') && plan.some((r) => r.parsed.bracket);
  const quota = changes.length * QUOTA_PER_RENAME;
  const example = plan[0];
  const running = job?.running;
  const blocked = errors.length > 0 || collisions.length > 0 || unrecognised.length > 0 || running;

  function insertToken(token) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + token + draft.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function runMigration(rows) {
    // Recognise both the old and the new names until every rename lands.
    if (draft !== activeTemplate) dispatch(startMigration({ from: activeTemplate, to: draft }));
    setJob({ done: 0, total: rows.length, failed: [], running: true });
    const failed = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      try {
        const res = await renameMutation.mutateAsync(batch.map((r) => ({ id: r.id, title: r.to })));
        res.results.forEach((r, j) => {
          if (!r.success) failed.push({ ...batch[j], error: r.error });
        });
      } catch (e) {
        batch.forEach((r) => failed.push({ ...r, error: e.message }));
      }
      setJob({ done: Math.min(i + BATCH, rows.length), total: rows.length, failed: [...failed], running: true });
    }
    await invalidatePlaylists();
    setJob({ done: rows.length, total: rows.length, failed, running: false });
    if (failed.length === 0) {
      dispatch(finishMigration());
      notifications.show({ message: `Renamed ${rows.length} playlist${rows.length === 1 ? '' : 's'} on YouTube` });
    } else {
      notifications.show({ color: 'red', message: `${failed.length} rename${failed.length === 1 ? '' : 's'} failed - see Playlist naming` });
    }
  }

  function confirmMigration() {
    modals.openConfirmModal({
      title: <Text fw={800}>Rename {changes.length} playlists on YouTube?</Text>,
      children: (
        <Stack gap="xs">
          <Text fz="sm">
            Every tier playlist is renamed to follow <Code>{draft}</Code>. Only titles change - videos, descriptions and
            privacy are untouched.
          </Text>
          <Text fz="sm" c="dimmed">
            Uses about {quota.toLocaleString()} of your {DAILY_QUOTA.toLocaleString()} daily YouTube API quota units. If
            anything fails, both old and new names keep working until you retry.
          </Text>
        </Stack>
      ),
      labels: { confirm: `Rename ${changes.length}`, cancel: 'Cancel' },
      onConfirm: () => runMigration(changes),
    });
  }

  function confirmSaveOnly() {
    const lost = changes.length;
    modals.openConfirmModal({
      title: <Text fw={800}>Save without renaming?</Text>,
      children: (
        <Text fz="sm">
          {lost > 0
            ? `${lost} tier playlist${lost === 1 ? '' : 's'} won't match the new template and will disappear from the app until renamed (on YouTube or with the rename job here).`
            : 'Every current tier playlist already matches this template.'}
        </Text>
      ),
      labels: { confirm: 'Save template', cancel: 'Cancel' },
      confirmProps: { color: lost > 0 ? 'red' : undefined },
      onConfirm: () => dispatch(setTemplate(draft)),
    });
  }

  const pending = migratingFrom ? changes : [];

  return (
    <Stack gap={28}>
      <div>
        <Title order={2} fz={18} mb={6}>
          Playlist naming template
        </Title>
        <Text c="dimmed" fz="sm">
          One pattern for every tier playlist. The app only picks up playlists whose name follows it - anything else
          (like a private playlist) never shows up here. New tier playlists are created with it, and the rename job below
          migrates existing ones when you change it.
        </Text>
      </div>

      {migratingFrom && !running && (
        <Alert color="yellow" icon={<AlertTriangle size={18} />} title="Rename job didn't finish">
          <Text fz="sm" mb="sm">
            {pending.length} playlist{pending.length === 1 ? '' : 's'} still use{pending.length === 1 ? 's' : ''} the old
            names (<Code>{migratingFrom}</Code>). Both templates are recognised until they're renamed.
          </Text>
          <Group gap="xs">
            <Button size="xs" leftSection={<RotateCcw size={14} />} onClick={() => runMigration(pending)} disabled={!pending.length}>
              Retry {pending.length}
            </Button>
            <Button size="xs" variant="default" onClick={() => dispatch(finishMigration())}>
              Stop recognising old names
            </Button>
          </Group>
        </Alert>
      )}

      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <Text fw={600} fz="sm">
              Template
            </Text>
            <Group gap="xs">
            <Tooltip label="Pick the preset that fits the names your playlists already have" withArrow>
              <Button
                size="xs"
                variant="default"
                leftSection={<Wand2 size={13} />}
                onClick={() => allPlaylists && setDraft(detectTemplate(allPlaylists.map((p) => p.title)))}
                disabled={!allPlaylists || !!migratingFrom || running}
              >
                Detect from my playlists
              </Button>
            </Tooltip>
            <Select
              size="xs"
              w={280}
              placeholder="Start from a preset…"
              data={TEMPLATE_PRESET_GROUPS}
              value={null}
              onChange={(v) => v && setDraft(v)}
              disabled={!!migratingFrom || running}
              comboboxProps={{ withinPortal: true }}
            />
            </Group>
          </Group>
          <TextInput
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={errors[0]}
            disabled={!!migratingFrom || running}
            styles={{ input: { fontFamily: 'monospace', fontSize: 15 } }}
            size="md"
          />
          <Group gap={6}>
            <Text fz="xs" c="dimmed" mr={4}>
              Insert:
            </Text>
            {TOKENS.map((t) => (
              <Tooltip key={t.token} label={t.description} withArrow>
                <Button
                  size="compact-xs"
                  variant="light"
                  ff="monospace"
                  onClick={() => insertToken(t.token)}
                  disabled={!!migratingFrom || running || draft.includes(t.token)}
                >
                  {t.token}
                  {t.required ? '' : ' (optional)'}
                </Button>
              </Tooltip>
            ))}
          </Group>
          {example && !errors.length && (
            <Group gap={8} wrap="nowrap" mt={4}>
              <Text fz="sm" c="dimmed">
                Example:
              </Text>
              <Code>{example.from}</Code>
              <ArrowRight size={14} />
              <Code color="var(--accent)" c="var(--accent-on)">
                {example.to}
              </Code>
            </Group>
          )}
        </Stack>
      </Paper>

      {!errors.length && dropsBracket && (
        <Alert color="yellow" icon={<AlertTriangle size={18} />}>
          This template has no <Code>{'{tag}'}</Code>, so tags like [G] / [GA] are dropped from the names for good.
        </Alert>
      )}
      {unrecognised.length > 0 && (
        <Alert color="red" icon={<AlertTriangle size={18} />} title="Some names wouldn't be recognised afterwards">
          <Text fz="sm">
            e.g. <Code>{unrecognised[0].to}</Code> doesn't read back as {unrecognised[0].parsed.category} /{' '}
            {unrecognised[0].parsed.tier} - put a separator (space, dash, …) between the tokens.
          </Text>
        </Alert>
      )}
      {collisions.length > 0 && (
        <Alert color="red" icon={<AlertTriangle size={18} />} title="Two playlists would get the same name">
          <Text fz="sm">
            {collisions.slice(0, 3).join(', ')}
            {collisions.length > 3 ? ` and ${collisions.length - 3} more` : ''} - add {'{tag}'} or other text so
            names stay unique.
          </Text>
        </Alert>
      )}

      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Group gap={8}>
            <Text fw={600} fz="sm">
              Preview
            </Text>
            <Badge variant="light" color="gray">
              {tierPlaylists ? `${changes.length} of ${plan.length} tier playlists change` : 'loading…'}
            </Badge>
          </Group>
          {changes.length > 0 && (
            <Text fz="xs" c={quota > DAILY_QUOTA ? 'red' : 'dimmed'}>
              ≈ {quota.toLocaleString()} / {DAILY_QUOTA.toLocaleString()} daily API quota
              {quota > DAILY_QUOTA ? ' - over the limit, will need to finish tomorrow (Retry)' : ''}
            </Text>
          )}
        </Group>
        {changes.length === 0 ? (
          <Group gap={8} c="dimmed">
            <CheckCircle2 size={16} />
            <Text fz="sm">Every tier playlist already follows this template.</Text>
          </Group>
        ) : (
          <ScrollArea.Autosize mah={320} type="auto">
            <Table striped highlightOnHover fz="sm" verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Current name</Table.Th>
                  <Table.Th w={24} />
                  <Table.Th>New name</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {changes.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td ff="monospace">{r.from}</Table.Td>
                    <Table.Td>
                      <ArrowRight size={13} />
                    </Table.Td>
                    <Table.Td ff="monospace" fw={600}>
                      {r.to}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Paper>

      {job && (
        <Paper withBorder radius="md" p="md" bg="var(--surface)">
          <Group justify="space-between" mb={6}>
            <Text fw={600} fz="sm">
              {job.running ? 'Renaming on YouTube…' : job.failed.length ? 'Finished with errors' : 'Rename job finished'}
            </Text>
            <Text fz="xs" c="dimmed">
              {job.done} / {job.total}
            </Text>
          </Group>
          <Progress value={(job.done / Math.max(1, job.total)) * 100} animated={job.running} />
          {job.failed.length > 0 && (
            <Stack gap={4} mt="sm">
              {job.failed.slice(0, 8).map((f) => (
                <Text key={f.id} fz="xs" c="red">
                  {f.from} → {f.to}: {f.error}
                </Text>
              ))}
            </Stack>
          )}
        </Paper>
      )}

      <Group gap="sm">
        <Button
          leftSection={<Play size={15} />}
          onClick={confirmMigration}
          disabled={blocked || changes.length === 0 || !!migratingFrom}
          loading={running}
        >
          {dirty ? `Save & rename ${changes.length} on YouTube` : `Rename ${changes.length} on YouTube`}
        </Button>
        <Button variant="default" onClick={confirmSaveOnly} disabled={blocked || !dirty || !!migratingFrom}>
          Save without renaming
        </Button>
        <Button variant="subtle" color="gray" onClick={() => setDraft(activeTemplate)} disabled={!dirty || running}>
          Reset
        </Button>
      </Group>
      <Text fz="xs" c="dimmed">
        Active template: <Code>{activeTemplate}</Code>
      </Text>
    </Stack>
  );
}
