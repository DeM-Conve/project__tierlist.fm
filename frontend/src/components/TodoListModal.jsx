import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Divider, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { Link2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { linkTodoList } from '../store/namingSlice';
import { selectNaming, selectTodoRows } from '../store/selectors';
import { exampleTitle } from '../naming';

// A board's "Add a TODO list": use a playlist that's already there (any
// playlist named like a to-do list that isn't some board's to-do list yet), or
// create a new one named by the template.
export default function TodoListModal({ category, onClose, onCreateNew }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const naming = useSelector(selectNaming);
  const keyword = naming.tierLabels.TODO;
  const example = exampleTitle(naming, category, 'TODO');
  const rows = useSelector(selectTodoRows);
  const free = rows.filter((r) => r.status !== 'active');
  const [picked, setPicked] = useState(free[0]?.playlist.id ?? null);

  function link() {
    dispatch(linkTodoList({ playlistId: picked, category }));
    onClose();
  }

  return (
    <Modal opened onClose={onClose} centered title={<Text fw={800}>{keyword} list for {category}</Text>}>
      <Stack gap="md">
        <Text fz="sm" c="dimmed">
          Songs waiting for a tier - a playlist named like <b>{example}</b>.
        </Text>
        {free.length > 0 ? (
          <>
            <Select
              label="Use an existing playlist"
              data={free.map((r) => ({ value: r.playlist.id, label: r.playlist.title }))}
              value={picked}
              onChange={setPicked}
              searchable
              allowDeselect={false}
            />
            <Button leftSection={<Link2 size={15} />} onClick={link} disabled={!picked}>
              Use this playlist
            </Button>
          </>
        ) : (
          <Text fz="sm">
            No free to-do list found. Create <b>{example}</b> below, or rename one on YouTube.
          </Text>
        )}
        <Divider label="or" />
        <Group justify="space-between">
          <Button variant="subtle" color="gray" size="compact-sm" onClick={() => navigate('/settings?tab=naming')}>
            Change the to-do name…
          </Button>
          <Button variant="default" leftSection={<Plus size={15} />} onClick={onCreateNew}>
            Create a new playlist
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
