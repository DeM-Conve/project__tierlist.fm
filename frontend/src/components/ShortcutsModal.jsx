import { Group, Kbd, Modal, Stack, Text } from '@mantine/core';
import { SHORTCUTS } from '../shortcuts';

const CATEGORIES = [...new Set(SHORTCUTS.map((s) => s.category))];

// Shared by the "?" modal and Settings -> Keyboard, both read shortcuts.js.
export function ShortcutsList() {
  return (
    <Stack gap="lg">
      {CATEGORIES.map((category) => (
        <Stack key={category} gap={6}>
          <Text fw={700} size="sm" c="dimmed" tt="uppercase">
            {category}
          </Text>
          {SHORTCUTS.filter((s) => s.category === category).map((s) => (
            <Group key={s.id} justify="space-between" wrap="nowrap" gap="md">
              <Text size="sm">{s.description}</Text>
              <Group gap={4} wrap="nowrap">
                {s.keys.map((key, i) => (
                  <Kbd key={i}>{key}</Kbd>
                ))}
              </Group>
            </Group>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

export default function ShortcutsModal({ opened, onClose }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="md">
      <ShortcutsList />
    </Modal>
  );
}
