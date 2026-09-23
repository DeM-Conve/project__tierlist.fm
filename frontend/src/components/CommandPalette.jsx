import { Kbd, Group } from '@mantine/core';
import { Spotlight } from '@mantine/spotlight';
import { hotkeyForCommand } from '../shortcuts';

// Mantine's Spotlight is a purpose-built command palette: it owns its own
// open/close state, the Cmd/Ctrl+K shortcut, filtering, keyboard roving and
// focus-trapping - replacing what was previously hand-rolled here (and the
// separate keydown listener + open/close state that used to live in App.jsx).
export default function CommandPalette({ items }) {
  const groups = {};
  for (const item of items) {
    const hotkey = hotkeyForCommand(item.id);
    (groups[item.section] ??= []).push({
      id: item.id,
      label: item.label,
      keywords: item.keywords,
      onClick: item.action,
      // Actions with a direct keyboard equivalent (e.g. "p" for sync) show
      // it here, sourced from shortcuts.js so the hint can't drift out of
      // sync with what the page actually binds.
      rightSection: hotkey ? (
        <Group gap={4} wrap="nowrap">
          {hotkey.map((k, i) => (
            <Kbd key={i} size="xs">
              {k}
            </Kbd>
          ))}
        </Group>
      ) : undefined,
    });
  }

  const actionsGroups = Object.entries(groups).map(([group, actions]) => ({ group, actions }));

  return (
    <Spotlight
      actions={actionsGroups}
      shortcut={['mod + K']}
      nothingFound="No matches"
      searchProps={{ placeholder: 'Jump to a board, playlist, or action...' }}
    />
  );
}
