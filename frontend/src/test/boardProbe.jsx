// Test-only stand-in for components/PendingChanges (vi.mock it with
// `() => import('./test/boardProbe')`): renders the real bar, and hands the
// test the Layout's outlet context (syncChanges / pushSongs) and the duel
// pages' real useDuelBoard actions - so a duel "Move" runs the same code it
// does on the Suggested moves page.
import { vi } from 'vitest';
import { useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import { useDuelBoard } from '../duel/useDuelBoard';

const { default: RealPendingChanges } = await vi.importActual('../components/PendingChanges');

export const boardProbe = { current: null };

export default function PendingChangesProbe(props) {
  const ctx = useOutletContext();
  const category = useSelector((s) => s.view.currentCategory);
  const duel = useDuelBoard(category);
  boardProbe.current = { ctx, duel, category };
  return <RealPendingChanges {...props} />;
}
