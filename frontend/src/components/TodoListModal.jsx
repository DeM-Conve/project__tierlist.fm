import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Divider, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { Link2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { linkTodoList } from '../store/namingSlice';
import { selectTodoRows } from '../store/selectors';

// A board's "Add a TODO list": use a playlist that's already there (any
// playlist with the keyword that isn't some board's to-do list yet), or
// create a new one named by the template.
export default function TodoListModal({ category, onClose, onCreateNew }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const keyword = useSelector((s) => s.naming.todoKeyword);
  const rows = useSelector(selectTodoRows);
  const free = rows.filter((r) => r.status !== 'active');
  const [picked, setPicked] = useState(free[0]?.playlist.id ?? null);

  function link() {
    dispatch(linkTodoList({ playlistId: picked, category }));
    onClose();
  }

  return (
    <Modal opened onClose={onClose} centered title={<Text fw={800}>TODO list for {category}</Text>}>
      <Stack gap="md">
        <Text fz="sm" c="dimmed">
          Songs waiting for a tier. Any playlist with &quot;{keyword}&quot; in its name can be one.
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
            No free playlist has &quot;{keyword}&quot; in its name. Create one below, or rename one on YouTube.
          </Text>
        )}
        <Divider label="or" />
        <Group justify="space-between">
          <Button variant="subtle" color="gray" size="compact-sm" onClick={() => navigate('/settings?tab=naming')}>
            Change the keyword…
          </Button>
          <Button variant="default" leftSection={<Plus size={15} />} onClick={onCreateNew}>
            Create a new playlist
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
