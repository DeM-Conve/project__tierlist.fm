import { useEffect, useState } from 'react';
import { useTimeout } from '@mantine/hooks';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { selectPendingMoves } from '../store/selectors';

// How long a dragged song hovers over a board in the sidebar before that
// board opens (like a spring-loaded folder), so the song can be dropped on
// one of its tiers - see transfers.js.
export const OPEN_DELAY_MS = 600;

// Drag handlers for one sidebar board entry. -> { hovering, handlers }.
// Opening a board replaces the open board's draft, so while it still has
// staged moves of its own the board doesn't open - push or discard first.
export function useBoardDropOpen(category) {
  const navigate = useNavigate();
  const drag = useSelector((s) => s.transfers.drag);
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const pendingCount = useSelector(selectPendingMoves).length;
  const [hovering, setHovering] = useState(false);
  // Mantine useTimeout: start() is a no-op while one is pending (dragenter
  // fires again for every child), and it's cleared on unmount.
  const { start, clear } = useTimeout(() => navigate(`/tier/${encodeURIComponent(category)}`), OPEN_DELAY_MS);

  const active = !!drag && category !== loadedCategory;
  useEffect(() => {
    if (!drag) {
      clear();
      setHovering(false);
    }
  }, [drag, clear]);

  function onDragEnter(e) {
    if (!active) return;
    e.preventDefault();
    setHovering(true);
    // (No timer can be pending here: with staged moves none is started.)
    if (pendingCount > 0) {
      notifications.show({
        id: 'board-drop-blocked',
        color: 'yellow',
        message: `Push or discard the ${pendingCount} staged change${pendingCount === 1 ? '' : 's'} on ${loadedCategory} first, then drag songs to another board`,
      });
      return;
    }
    start();
  }

  return {
    hovering: active && hovering,
    handlers: {
      onDragEnter,
      onDragOver(e) {
        if (active) e.preventDefault();
      },
      onDragLeave(e) {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        clear();
        setHovering(false);
      },
      // Let go on the name itself: nothing moves (the song needs a tier).
      onDrop(e) {
        if (!active) return;
        e.preventDefault();
        clear();
        setHovering(false);
      },
    },
  };
}
