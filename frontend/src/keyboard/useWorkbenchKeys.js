import { useHotkeys } from '@mantine/hooks';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { redoEdit, undoEdit } from '../tierActions';
import { openSidebarView, setMobileSidebarOpen, toggleSidebarCollapsed } from '../store/viewSlice';

// App-wide VS Code-style modifier shortcuts (Mantine useHotkeys: ignores
// keydowns in text fields, so Ctrl+Z there stays the field's own undo).
// The palette's Ctrl+K / Ctrl+P / Ctrl+Shift+P / F1 are bound by Spotlight
// itself (CommandPalette.jsx); the Vim keys are useVimKeys. All listed in
// shortcuts.js.
export function useWorkbenchKeys({ narrow }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mobileSidebarOpen = useSelector((s) => s.view.mobileSidebarOpen);

  // Like VS Code's Explorer (Ctrl+Shift+E) / Search (Ctrl+Shift+F) / Run
  // and Debug (Ctrl+Shift+D): always
  // shows that view (on a phone: opens the drawer on it).
  const showView = (view) => () => {
    dispatch(openSidebarView(view));
    if (narrow) dispatch(setMobileSidebarOpen(true));
  };

  useHotkeys([
    // Every tier edit is one undo / redo step (see tierActions.jsx).
    ['mod+Z', () => dispatch(undoEdit())],
    ['mod+shift+Z', () => dispatch(redoEdit())],
    ['mod+Y', () => dispatch(redoEdit())],
    // Fold the panel away (on a phone: the drawer).
    ['mod+B', () => dispatch(narrow ? setMobileSidebarOpen(!mobileSidebarOpen) : toggleSidebarCollapsed())],
    ['mod+shift+E', showView('boards')],
    ['mod+shift+F', showView('playlists')],
    // Like VS Code's Run and Debug (Ctrl+Shift+D): the Duels view.
    ['mod+shift+D', showView('duels')],
    ['mod+,', () => navigate('/settings')],
  ]);
}
