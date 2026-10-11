import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import DuelMoves from './DuelMoves';
import { IDS, analysis, renderDuel, suggestion } from '../../test/duelFixtures';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../EmbeddedPlayer', () => ({ default: ({ videoId }) => <div data-testid="player">{videoId}</div> }));

const h = vi.hoisted(() => ({ analysis: null, error: null, decision: null, lock: null }));
vi.mock('../../api/queries', () => ({
  useDuelAnalysisQuery: () => ({ data: h.analysis, isError: !!h.error, error: h.error, refetch: vi.fn() }),
  useDuelDecisionMutation: () => ({ mutate: h.decision }),
  useDuelLockMutation: () => ({ mutate: h.lock }),
}));

const page = () => renderDuel(<DuelMoves category="Rock" boardLoading={false} base="/tier/Rock" />, '/tier/Rock/duel/moves');
const tierOf = (store, id) => Object.keys(store.getState().tiers.tierItems).find((t) => store.getState().tiers.tierItems[t].some((v) => v.videoId === id));

// Two moves up: a sure one (B -> A, 92%) and a less sure one (A -> S, 87%).
const up = suggestion({ song: IDS.mid2, from: 'A', to: 'S', confidence: 0.87, wins: 5, losses: 1, keyResults: [{ opponent: IDS.top, opponentTier: 'S', result: 1 }] });

beforeEach(() => {
  h.error = null;
  h.decision = vi.fn();
  h.lock = vi.fn();
  h.analysis = analysis({ suggestions: [suggestion(), up] });
});

describe('DuelMoves', () => {

  it('shows the "← parent  Alt ←" crumb to /tier/Rock/duel', () => {
    page();
    const up = screen.getByRole('link', { name: /Rock · Duel/ });
    expect(up).toHaveAttribute('href', '/tier/Rock/duel');
    expect(up).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowLeft g u');
    expect(within(up).getByText('Alt', { selector: 'kbd' })).toBeInTheDocument();
  });
  it('lists every suggested move with its record, sure ones first, and filters by kind', () => {
    page();
    expect(screen.getByText('Suggested moves')).toBeInTheDocument();
    expect(screen.getByText(/4–1–0 \(W–L–D\)/)).toBeInTheDocument();
    expect(screen.getByText('All · 2')).toBeInTheDocument();
    expect(screen.getByText('Up a tier · 2')).toBeInTheDocument();
    expect(screen.getByText('Down a tier · 0')).toBeInTheDocument();
    // To-do songs never get a suggestion, so there's no "New placements" filter.
    expect(screen.queryByText(/New placements/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByText('Down a tier · 0'));
    expect(screen.queryByRole('button', { name: /Show evidence for Low Song/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show evidence for Other Song/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Up a tier · 2'));
    expect(screen.getByRole('button', { name: /Show evidence for Low Song/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show evidence for Other Song/ })).toBeInTheDocument();
  });

  it('Move stages the move on the board (placed by score) and records it; Undo takes both back', () => {
    const store = page();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[0]);
    expect(tierOf(store, IDS.low)).toBe('A');
    // Low Song (score 24) lands between Middle (26) and Other (22).
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual([IDS.mid, IDS.low, IDS.mid2]);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.low, decision: 'ACCEPTED', from: 'B', to: 'A', confidence: 0.92 });
    const main = screen.getByTestId('moves-main');
    expect(within(main).getByText('Moved to A')).toBeInTheDocument();
    fireEvent.click(within(main).getByText('Undo'));
    expect(tierOf(store, IDS.low)).toBe('B');
    expect(h.decision.mock.calls[1][0]).toMatchObject({ videoId: IDS.low, decision: null });
  });

  it('Keep records the decision and leaves the board alone', () => {
    const store = page();
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.low, decision: 'KEPT' });
    expect(within(screen.getByTestId('moves-main')).getByText('Kept in B')).toBeInTheDocument();
    expect(tierOf(store, IDS.low)).toBe('B');
  });

  it('Move all at >= 90% moves only the sure ones', () => {
    const store = page();
    fireEvent.click(screen.getByRole('button', { name: 'Move all 1 at ≥90%' }));
    expect(tierOf(store, IDS.low)).toBe('A');
    expect(tierOf(store, IDS.mid2)).toBe('A');
    expect(h.decision).toHaveBeenCalledTimes(1);
  });

  it('the evidence panel follows the selected song; lock toggles; play opens a player', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: /Show evidence for Other Song/ }));
    const panel = screen.getByRole('button', { name: 'Move to S' }).closest('.mantine-Paper-root');
    expect(within(panel).getByText('Won')).toBeInTheDocument();
    expect(within(panel).getByText('Score over 6 duels')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('checkbox'));
    expect(h.lock.mock.calls[0][0]).toEqual({ videoId: IDS.mid2, locked: true });
    fireEvent.click(within(panel).getByRole('checkbox'));
    expect(h.lock.mock.calls[1][0]).toEqual({ videoId: IDS.mid2, locked: false });
    fireEvent.click(within(panel).getByRole('button', { name: /Play Other Song/ }));
    expect(screen.getByTestId('player')).toHaveTextContent(IDS.mid2);
  });

  it('the whole row is one click target: its empty middle selects it; its buttons act on their own', () => {
    page();
    const row = screen.getByRole('button', { name: /Show evidence for Other Song/ }).parentElement;
    // The selector covers the row edge to edge, so a click anywhere on it (here: the row itself, not the title) lands on it.
    expect(within(row).getByRole('button', { name: /Show evidence for Other Song/ })).toHaveStyle({ position: 'absolute' });
    fireEvent.click(within(row).getByRole('button', { name: /Show evidence for Other Song/ }));
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('button', { name: 'Move to S' })).toBeInTheDocument();
    // Its own Keep still keeps (and isn't nested in the selector).
    const keepBtn = within(row).getByRole('button', { name: 'Keep' });
    expect(keepBtn.closest('button[aria-label^="Show evidence"]')).toBeNull();
    fireEvent.click(keepBtn);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.mid2, decision: 'KEPT' });
  });

  it('keys: down/up browse, m moves, x keeps', () => {
    page();
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Move to S' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'x', code: 'KeyX' });
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.mid2, decision: 'KEPT' });
    fireEvent.keyDown(document, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'm', code: 'KeyM' });
    expect(h.decision.mock.calls[1][0]).toMatchObject({ videoId: IDS.low, decision: 'ACCEPTED' });
  });

  it('offers to sort a tier by score, showing the new order first', async () => {
    h.analysis = analysis({ suggestions: [], tierOrders: { A: [IDS.mid2, IDS.mid] } });
    const store = page();
    expect(screen.getByText('No moves to review')).toBeInTheDocument();
    expect(screen.getByText('Duel more and the strongest cases show up here.')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 songs change places')).toBeInTheDocument();
    // Every tier starts closed, so the page leads with the suggested moves; opening one shows the new order
    // before anything changes: each song at its new place, where it was.
    const control = screen.getByRole('button', { name: 'Show the new A order' });
    expect(control).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(control);
    const rows = within(await screen.findByRole('table', { name: 'New A order' })).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^1Other Song.*was 2/),
      expect.stringMatching(/^2Middle Song.*was 1/),
    ]);
    expect(within(rows[0]).getByLabelText('up 1')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('down 1')).toBeInTheDocument();
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual([IDS.mid, IDS.mid2]);
    fireEvent.click(screen.getByRole('button', { name: 'Sort A by score' }));
    expect(store.getState().tiers.tierItems.A.map((v) => v.videoId)).toEqual([IDS.mid2, IDS.mid]);
  });

  const lean = suggestion({
    song: IDS.mid2, from: 'A', to: 'S', confidence: 0.83,
    unmet: [{ kind: 'CONFIDENCE', have: 0.83, need: 0.85 }, { kind: 'DUELS', have: 3, need: 4 }],
  });
  // Every control styled as the primary (Mantine's default filled Button, which sets no data-variant), buttons and links alike.
  const filled = () => [...document.querySelectorAll('.mantine-Button-root')]
    .filter((b) => (b.getAttribute('data-variant') ?? 'filled') === 'filled');

  it('nothing sure yet: an empty state names the closest song and sends you to duel; leaning stays collapsed', () => {
    h.analysis = analysis({ suggestions: [], leaning: [lean] });
    page();
    expect(screen.getByText('Nothing is sure enough to move yet')).toBeInTheDocument();
    expect(screen.getByText('Closest: Other Song - 83% S or higher · needs 85% · 3 of 4 duels.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Duel more' })).toHaveAttribute('href', '/tier/Rock/duel');
    // No suggestion chrome: no Move all, no evidence panel, no key hints.
    expect(screen.queryByRole('button', { name: /Move all/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move to S/ })).not.toBeInTheDocument();
    expect(screen.queryByText('browse')).not.toBeInTheDocument();
    // Leaning is its own collapsed view.
    const control = screen.getByRole('button', { name: 'Leaning · 1 not sure yet' });
    expect(control).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaning rows offer one quiet action: Move anyway stages it (no Duel this song)', async () => {
    h.analysis = analysis({ suggestions: [], leaning: [lean] });
    const store = page();
    fireEvent.click(screen.getByRole('button', { name: 'Leaning · 1 not sure yet' }));
    const row = await screen.findByTestId('leaning-row');
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Move anyway' })).toBeInTheDocument());
    expect(within(row).queryByRole('button', { name: /Duel/ })).not.toBeInTheDocument();
    expect(within(row).getByText('83% · needs 85%')).toBeInTheDocument();
    expect(within(row).getByText(/3 of 4 duels$/)).toBeInTheDocument();
    // The page's single primary is "Duel more" - nothing in the leaning row is filled.
    expect(filled().map((b) => b.textContent)).toEqual(['Duel more']);
    within(row).getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('data-variant', 'subtle'));
    fireEvent.click(within(row).getByRole('button', { name: 'Move anyway' }));
    expect(tierOf(store, IDS.mid2)).toBe('S');
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.mid2, decision: 'ACCEPTED', from: 'A', to: 'S' });
    await waitFor(() => expect(within(row).getByText('Moved to S')).toBeInTheDocument());
  });

  it('with ready suggestions too: keys browse and act on the ready ones only, never the leaning', () => {
    h.analysis = analysis({ suggestions: [suggestion()], leaning: [lean] });
    page();
    expect(screen.getByText('browse')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown' });
    // Still on the one ready suggestion.
    expect(screen.getByRole('button', { name: 'Move to A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to S' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'm', code: 'KeyM' });
    expect(h.decision).toHaveBeenCalledTimes(1);
    expect(h.decision.mock.calls[0][0]).toMatchObject({ videoId: IDS.low, decision: 'ACCEPTED' });
    expect(screen.getByRole('button', { name: 'Leaning · 1 not sure yet' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the filter chips filter the leaning list too, and its header says so', () => {
    h.analysis = analysis({ suggestions: [suggestion()], leaning: [lean] });
    page();
    fireEvent.click(screen.getByText('Down a tier · 0'));
    expect(screen.getByText('No down a tier moves are ready.')).toBeInTheDocument();
    expect(screen.queryByText(/^Leaning/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Up a tier · 1'));
    expect(screen.getByRole('button', { name: 'Leaning · 1 not sure yet · up a tier' })).toBeInTheDocument();
  });

  it('Leaning and Tighten tier order sit in the main column under the list, not after the evidence panel', () => {
    h.analysis = analysis({ suggestions: [suggestion(), up], leaning: [lean], tierOrders: { A: [IDS.mid2, IDS.mid] } });
    page();
    const main = screen.getByTestId('moves-main');
    const panel = screen.getByTestId('evidence-panel');
    const leaning = screen.getByTestId('leaning-section');
    const tighten = screen.getByTestId('tighten-section');
    expect(main).toContainElement(screen.getByRole('button', { name: /Show evidence for Low Song/ }));
    expect(main).toContainElement(leaning);
    expect(main).toContainElement(tighten);
    expect(panel).not.toContainElement(leaning);
    // Main column and panel are side by side (siblings), the panel last.
    expect(panel.parentElement).toBe(main.parentElement);
    expect(main.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(leaning.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Leaning is still collapsed.
    expect(screen.getByRole('button', { name: 'Leaning · 1 not sure yet' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the evidence panel holds its shape: the score readout is there before any hover, and deciding swaps the buttons for Undo in place', () => {
    page();
    const panel = screen.getByTestId('evidence-panel');
    expect(within(panel).getByTestId('score-readout')).toHaveTextContent(/^Latest: score/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Move to A' }));
    expect(within(panel).getByTestId('evidence-decided')).toHaveTextContent('Moved to A');
    fireEvent.click(within(panel).getByRole('button', { name: 'Undo' }));
    expect(within(panel).getByRole('button', { name: 'Move to A' })).toBeInTheDocument();
    expect(h.decision.mock.calls[1][0]).toMatchObject({ videoId: IDS.low, decision: null });
  });

  it('a failed load says why and offers Retry', () => {
    h.analysis = undefined;
    h.error = { response: { data: { detail: 'YouTube says no.' } } };
    page();
    expect(screen.getByText('YouTube says no.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('loading keeps the layout: same heading and filters, a row list and an evidence panel with the same sections', () => {
    page();
    const panel = screen.getByRole('button', { name: 'Move to A' }).closest('.mantine-Paper-root');
    const labels = ['Where it belongs', 'Key results'].map((l) => !!within(panel).queryByText(l));
    const columns = panel.parentElement.children.length;
    cleanup();
    h.analysis = undefined;
    page();
    expect(screen.getByText('Suggested moves')).toBeInTheDocument();
    expect(screen.getByText('All · 0')).toBeInTheDocument();
    expect(screen.getAllByTestId('move-row-skeleton').length).toBeGreaterThan(0);
    const skeleton = screen.getByTestId('evidence-skeleton');
    expect(skeleton.parentElement.children.length).toBe(columns);
    expect(['Where it belongs', 'Key results'].map((l) => !!within(skeleton).queryByText(l))).toEqual(labels);
    expect(within(skeleton.parentElement).getByText('browse')).toBeInTheDocument();
  });
});
