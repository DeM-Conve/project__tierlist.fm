import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Badge, Code, Divider, Group, Paper, ScrollArea, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { ListTodo } from 'lucide-react';
import { linkTodoList, setTodoKeyword } from '../store/namingSlice';
import { selectTierCategories, selectTodoRows } from '../store/selectors';
import { validateTodoKeyword } from '../todoLists';

const AUTO = '__auto';

const STATUS = {
  active: { color: 'green', label: (r) => (r.via === 'link' ? `Linked to ${r.category}` : `Found: ${r.category}`) },
  duplicate: { color: 'yellow', label: (r) => `Not used - ${r.category} already has one` },
  unplaced: { color: 'gray', label: () => 'No board - pick one' },
  missingBoard: { color: 'red', label: (r) => `Board "${r.category}" doesn't exist` },
};

// Settings -> Playlist naming -> To-do lists: the keyword that marks a
// playlist as a board's to-do list, and every playlist it finds, each with
// the board it landed on - overridable by hand (see todoLists.js).
export default function TodoListSettings() {
  const dispatch = useDispatch();
  const keyword = useSelector((s) => s.naming.todoKeyword);
  const links = useSelector((s) => s.naming.todoLinks);
  const rows = useSelector(selectTodoRows);
  const categories = useSelector(selectTierCategories);
  // Typed text, committed only once it's valid (an invalid keyword would
  // make every to-do list vanish mid-typing).
  const [draft, setDraft] = useState(keyword);
  const errors = validateTodoKeyword(draft);

  function changeKeyword(value) {
    setDraft(value);
    if (validateTodoKeyword(value).length === 0) dispatch(setTodoKeyword(value));
  }

  return (
    <Stack gap="md" mt="xl">
      <Divider />
      <Group gap={8}>
        <ListTodo size={18} />
        <Title order={3} fz="lg">
          To-do lists
        </Title>
      </Group>
      <Text fz="sm" c="dimmed">
        A playlist is a board&apos;s to-do list (songs waiting for a tier) when its name contains the keyword as a
        whole word - anywhere, in any case. The rest of the name must be the board&apos;s name, optionally with its
        tag: with <Code>{keyword}</Code>, <Code>[G] Rap {keyword}</Code>, <Code>{keyword} - Rap</Code> and{' '}
        <Code>rap {keyword.toLowerCase()}</Code> are all Rap&apos;s. For any other name, pick the board below. To-do lists
        aren&apos;t renamed by the template.
      </Text>
      <TextInput
        label="Keyword"
        value={draft}
        onChange={(e) => changeKeyword(e.target.value)}
        error={errors[0]}
        maw={260}
      />

      <Paper withBorder radius="md" p="md" bg="var(--surface)">
        <Text fw={600} fz="sm" mb="sm">
          Playlists with &quot;{keyword}&quot; in the name
        </Text>
        {rows.length === 0 ? (
          <Text fz="sm" c="dimmed">
            None yet. Name a playlist like <Code>Rap {keyword}</Code>, or use &quot;Add a TODO list&quot; on a board.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={360} type="auto">
            <Table fz="sm" verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Playlist</Table.Th>
                  <Table.Th w={220}>Board</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => {
                  const status = STATUS[r.status];
                  const linked = links[r.playlist.id];
                  return (
                    <Table.Tr key={r.playlist.id}>
                      <Table.Td ff="monospace">{r.playlist.title}</Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          value={linked ?? AUTO}
                          onChange={(v) =>
                            dispatch(linkTodoList({ playlistId: r.playlist.id, category: v === AUTO ? null : v }))
                          }
                          data={[
                            { value: AUTO, label: 'Automatic (from the name)' },
                            // A link to a board that's gone stays selectable until changed.
                            ...[...new Set([...categories, ...(linked ? [linked] : [])])].map((c) => ({ value: c, label: c })),
                          ]}
                          allowDeselect={false}
                          searchable
                          aria-label={`Board for ${r.playlist.title}`}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={status.color} radius="sm">
                          {status.label(r)}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Paper>
    </Stack>
  );
}
