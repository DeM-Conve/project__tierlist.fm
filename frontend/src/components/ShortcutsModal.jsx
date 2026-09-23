import { Box, Group, Kbd, Modal, Text } from '@mantine/core';
import { SHORTCUTS } from '../shortcuts';

const CATEGORIES = [...new Set(SHORTCUTS.map((s) => s.category))];
const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Cmd', 'Meta'];

// Vimium-help style keys: a combo reads "Ctrl + K", alternatives "[ , ]",
// and a Vim sequence ('gh') is a single key cap.
function Keys({ keys }) {
  const combo = keys.some((k) => MODIFIERS.includes(k));
  return (
    <Group gap={4} wrap="nowrap" justify="flex-end">
      {keys.map((key, i) => (
        <Group key={i} gap={4} wrap="nowrap">
          {i > 0 && (
            <Text span fz="xs" c="dimmed">
              {combo ? '+' : ','}
            </Text>
          )}
          <Kbd size="sm">{key}</Kbd>
        </Group>
      ))}
    </Group>
  );
}

// Shared by the "?" modal and Settings -> Keyboard, both read shortcuts.js.
// Laid out like Vimium's help: sections flow down two balanced columns (CSS
// multi-column - Mantine's grids can't balance uneven sections), each row a
// right-aligned key column then the description.
export function ShortcutsList({ columns = 2 }) {
  return (
    <Box style={{ columns: `${columns} 340px`, columnGap: 48 }}>
      {CATEGORIES.map((category) => (
        <Box key={category} mb="lg" style={{ breakInside: 'avoid' }}>
          <Box style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', columnGap: 14, rowGap: 6, alignItems: 'center' }}>
            <span />
            <Text fw={700} fz="md" mb={2}>
              {category}
            </Text>
            {SHORTCUTS.filter((s) => s.category === category).map((s) => (
              <Box key={s.id} style={{ display: 'contents' }}>
                <Keys keys={s.keys} />
                <Text fz="sm">{s.description}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function ShortcutsModal({ opened, onClose }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="min(1180px, 94vw)">
      <ShortcutsList />
    </Modal>
  );
}
