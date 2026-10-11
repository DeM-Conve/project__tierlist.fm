import { Group, Kbd, Modal, ScrollArea, SimpleGrid, Table, Text } from '@mantine/core';
import { SHORTCUTS } from '../shortcuts';
import { splitIntoColumns } from '../shortcutsLayout';

const CATEGORIES = [...new Set(SHORTCUTS.map((s) => s.category))];
const SECTIONS = CATEGORIES.map((category) => ({ category, rows: SHORTCUTS.filter((s) => s.category === category) }));
const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Cmd', 'Meta'];

// Vimium-help style keys: a combo reads "Ctrl + K", alternatives "[ , ]",
// and a Vim sequence ('gh') is a single key cap.
function Keys({ keys }) {
  const combo = keys.some((k) => MODIFIERS.includes(k));
  return (
    <Group gap="4xs" wrap="nowrap">
      {keys.map((key, i) => (
        <Group key={i} gap="4xs" wrap="nowrap">
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

// One column: a single Table whose sections are tbody groups under a
// heading row, so every key and description in the column shares the same
// two tracks. The key column is as wide as its widest combo (w=1% + nowrap),
// the description takes the rest and wraps.
function ShortcutColumn({ sections }) {
  return (
    <Table verticalSpacing="5xs" horizontalSpacing="sm" withRowBorders={false} fz="sm">
      {sections.map(({ category, rows }, i) => (
        <Table.Tbody key={category}>
          <Table.Tr>
            <Table.Th colSpan={2} pt={i === 0 ? 0 : 'md'} pb="4xs" px={0}>
              <Text component="h3" fw={700} fz="md" m={0}>
                {category}
              </Text>
            </Table.Th>
          </Table.Tr>
          {rows.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td w="1%" pl={0} style={{ whiteSpace: 'nowrap', verticalAlign: 'baseline' }}>
                <Keys keys={s.keys} />
              </Table.Td>
              <Table.Td pr={0} style={{ verticalAlign: 'baseline' }}>
                {s.description}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      ))}
    </Table>
  );
}

// Shared by the "?" modal and Settings -> Keyboard, both read shortcuts.js.
// Sections are split, in order, into `columns` balanced columns (by row
// count); a container query drops to one column when the space it's in is
// narrow (a phone, the Settings tab), keeping the reading order.
// alignItems: start (SimpleGrid has no prop for it) stops the grid
// stretching the shorter column's table, which spread its rows apart.
export function ShortcutsList({ columns = 2 }) {
  const split = splitIntoColumns(SECTIONS, columns, (s) => s.rows.length + 1);
  return (
    <SimpleGrid type="container" cols={{ base: 1, '760px': split.length }} spacing="xl" verticalSpacing="md" style={{ alignItems: 'start' }}>
      {split.map((sections) => (
        <ShortcutColumn key={sections[0].category} sections={sections} />
      ))}
    </SimpleGrid>
  );
}

export default function ShortcutsModal({ opened, onClose }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Keyboard shortcuts"
      size="min(1180px, 94vw)"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <ShortcutsList />
    </Modal>
  );
}
