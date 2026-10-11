import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithApp } from '../../test/render';
import { ProbabilityBars, ScoreMap, ScoreTrend, StatCard } from './DuelBits';
import { analysis } from '../../test/duelFixtures';

describe('DuelBits', () => {
  it('ProbabilityBars shows each tier with its probability', () => {
    renderWithApp(<ProbabilityBars song={{ probabilities: { S: 0.58, A: 0.42 } }} />);
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('ScoreMap: tier bands with counts, and a dot per placed song with a hover readout', () => {
    const { container } = renderWithApp(<ScoreMap analysis={analysis()} nameOf={(id) => `song ${id.slice(0, 3)}`} />);
    expect(screen.getByText('S · 1')).toBeInTheDocument();
    const dots = [...container.querySelectorAll('div')].filter((d) => d.style.borderRadius === '50%');
    expect(dots).toHaveLength(4); // one per song the analysis returns
    fireEvent.mouseEnter(dots[0]);
    expect(screen.getByText(/song sss · 58% S · score 310/)).toBeInTheDocument();
  });

  it('ScoreTrend draws the trend and reads out a point on hover', () => {
    const { container } = renderWithApp(<ScoreTrend trend={[25, 26.5, 28]} border={27} />);
    const svg = container.querySelector('svg');
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3);
    expect(svg.querySelector('line')).not.toBeNull();
    svg.getBoundingClientRect = () => ({ left: 0, width: 300 });
    fireEvent.mouseMove(svg, { clientX: 0 });
    expect(screen.getByText('Start: score 250')).toBeInTheDocument();
    fireEvent.mouseMove(svg, { clientX: 300 });
    expect(screen.getByText('After duel 2: score 280')).toBeInTheDocument();
  });

  it('ScoreTrend keeps its readout line when not hovered (latest score), so hovering never shifts the layout', () => {
    const { container } = renderWithApp(<ScoreTrend trend={[25, 26.5, 28]} border={27} />);
    const readout = screen.getByTestId('score-readout');
    expect(readout).toHaveTextContent('Latest: score 280');
    const svg = container.querySelector('svg');
    svg.getBoundingClientRect = () => ({ left: 0, width: 300 });
    fireEvent.mouseMove(svg, { clientX: 150 });
    // Same element, new text - nothing added or removed.
    expect(screen.getByTestId('score-readout')).toBe(readout);
    expect(readout).toHaveTextContent('After duel 1: score 265');
    fireEvent.mouseLeave(svg);
    expect(screen.getByTestId('score-readout')).toHaveTextContent('Latest: score 280');
  });

  it('ScoreTrend draws nothing without a trend; StatCard is clickable when given onClick', () => {
    const onClick = vi.fn();
    const { container } = renderWithApp(<><ScoreTrend trend={[]} /><StatCard label="Moves" value={7} onClick={onClick} /></>);
    expect(container.querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByText('7'));
    expect(onClick).toHaveBeenCalled();
  });
});
