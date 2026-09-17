import { Spotlight } from '@mantine/spotlight';

// Mantine's Spotlight is a purpose-built command palette: it owns its own
// open/close state, the Cmd/Ctrl+K shortcut, filtering, keyboard roving and
// focus-trapping - replacing what was previously hand-rolled here (and the
// separate keydown listener + open/close state that used to live in App.jsx).
export default function CommandPalette({ items }) {
  const groups = {};
  for (const item of items) {
    (groups[item.section] ??= []).push({
      id: item.id,
      label: item.label,
      onClick: item.action,
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
