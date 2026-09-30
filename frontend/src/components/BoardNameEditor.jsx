import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Code, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { ArrowRight, Info } from 'lucide-react';
import { TierChip } from './TierBits';
import { planBoardRename } from '../boardRename';
import { selectNaming, selectPendingMoves, selectTierGroups } from '../store/selectors';
import { setPlaylists } from '../store/authSlice';
import { linkTodoList } from '../store/namingSlice';
import { useApplyPlaylistTitles, useInvalidatePlaylists, useRenamePlaylistsMutation } from '../api/queries';
import { errorMessage } from '../api/client';

const QUOTA_PER_RENAME = 51; // playlists.list (1) + playlists.update (50)

// The board's name as the page title, renamed in place like a document name
// in Office: it reads as plain text, an outline fades in on hover, a click
// edits it right there (same font, the box grows with the text), Enter or
// clicking away saves, Esc cancels. Every
// playlist of the board (its tiers and its TODO list) is renamed on YouTube
// to the naming template with the new name, then the page moves to the new
// board URL. Same safety rules as the template's rename job: the new names
// must read back as this board, and nothing may collide.
// Render with key={category}: a new board (or a finished rename) starts fresh.
export default function BoardNameEditor({ category, onRenamed }) {
  const dispatch = useDispatch();
  const naming = useSelector(selectNaming);
  const links = useSelector((s) => s.naming.todoLinks);
  const tierGroups = useSelector(selectTierGroups);
  const pendingCount = useSelector(selectPendingMoves).length;
  const renameMutation = useRenamePlaylistsMutation();
  const applyTitles = useApplyPlaylistTitles();
  const invalidatePlaylists = useInvalidatePlaylists();

  const [draft, setDraft] = useState(category);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const confirmed = useRef(false);
  const { name, changes, error } = planBoardRename({ naming, tierGroups, category, rawName: draft, pendingCount });
  const revert = () => setDraft(category);

  async function run() {
    try {
      const res = await renameMutation.mutateAsync(changes.map((r) => ({ id: r.id, title: r.to })));
      const done = changes.filter((_, i) => res.results[i]?.success);
      const failed = res.results.filter((r) => !r.success);
      if (done.length === 0) throw new Error(failed[0]?.error || 'YouTube refused the rename');
      // A hand-assigned TODO list is linked by board name - move the link.
      Object.entries(links).forEach(([playlistId, c]) => {
        if (c === category) dispatch(linkTodoList({ playlistId, category: name }));
      });
      // Regroup now (cache + Redux, before the URL changes - the old board
      // page would otherwise bounce home when its name disappears).
      const next = applyTitles(done.map((r) => ({ id: r.id, title: r.to })));
      if (next) dispatch(setPlaylists(next));
      onRenamed(name);
      notifications.show({
        color: failed.length ? 'red' : undefined,
        message: failed.length
          ? `Renamed ${done.length} of ${changes.length} playlists - ${failed[0].error}. Retry by renaming again.`
          : `Renamed "${category}" to "${name}" on YouTube`,
      });
      invalidatePlaylists();
    } catch (e) {
      notifications.show({ color: 'red', message: `Couldn't rename: ${errorMessage(e, e.message)}` });
      revert();
    }
  }

  // Enter / clicking away. Unchanged or empty -> just go back to the name;
  // a problem -> say why and go back; otherwise confirm, then rename.
  function commit() {
    if (!name || name === category || changes.length === 0) return revert();
    if (error) {
      notifications.show({ color: 'red', message: error });
      return revert();
    }
    confirmed.current = false;
    modals.openConfirmModal({
      title: <Text fw={800}>Rename &quot;{category}&quot; to &quot;{name}&quot;?</Text>,
      size: 'xl',
      centered: true,
      children: (
        <Stack gap="md">
          <Text fz="sm">
            {changes.length} playlist{changes.length === 1 ? '' : 's'} will be renamed on YouTube, named by your template{' '}
            <Code>{naming.template}</Code>.
          </Text>
          <Table.ScrollContainer minWidth={520}>
            <Table striped highlightOnHover withTableBorder fz="sm" verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={56}>Tier</Table.Th>
                  <Table.Th>Current name</Table.Th>
                  <Table.Th w={28} />
                  <Table.Th>New name</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {changes.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <TierChip tier={r.tier} />
                    </Table.Td>
                    <Table.Td ff="monospace" c="dimmed">
                      {r.from}
                    </Table.Td>
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
          </Table.ScrollContainer>
          <Alert variant="light" color="gray" icon={<Info size={16} />} p="sm">
            <Text fz="xs">
              Only titles change - videos, descriptions and privacy are untouched. Uses about{' '}
              {(changes.length * QUOTA_PER_RENAME).toLocaleString()} of your 10,000 daily YouTube API quota units.
            </Text>
          </Alert>
        </Stack>
      ),
      labels: { confirm: `Rename ${changes.length} on YouTube`, cancel: 'Cancel' },
      onConfirm: () => {
        confirmed.current = true;
        run();
      },
      onClose: () => {
        if (!confirmed.current) revert();
      },
    });
  }

  return (
    // Hover: "Rename" (like Office's "Rename file"); while typing: why the
    // name can't be used, if it can't.
    <Tooltip
      label={focused ? error : 'Rename'}
      opened={focused ? !!error && name !== category : undefined}
      color={focused ? 'red' : undefined}
      openDelay={focused ? 0 : 400}
      withArrow
      position="bottom-start"
    >
        {/* The browser sizes the box to the text itself (field-sizing:
            content), so it hugs the name at any length and in any font -
            no measuring. See .board-name in App.css for the hover/focus look. */}
        <Title order={1} fz={{ base: 30, sm: 40 }} fw={900} lh={1.15} className="board-name" data-dirty={name !== category || undefined}>
          <TextInput
            ref={inputRef}
            variant="unstyled"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
            }}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onKeyDown={(e) => {
              e.stopPropagation(); // keep board / global shortcuts out of the text box
              if (e.key === 'Enter') inputRef.current?.blur();
              if (e.key === 'Escape') {
                revert();
                // Blur after the revert lands, so commit() sees the old name.
                requestAnimationFrame(() => inputRef.current?.blur());
              }
            }}
            disabled={renameMutation.isPending}
            spellCheck={false}
            aria-label="Board name - click to rename"
            classNames={{ input: 'board-name-input' }}
            styles={{ input: { fieldSizing: 'content', width: 'auto' } }}
          />
        </Title>
    </Tooltip>
  );
}
