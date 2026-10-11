import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import PageHeader from './PageHeader';
import { renderWithApp } from '../test/render';

describe('PageHeader', () => {
  it('draws eyebrow, the title as the h1, meta and actions', () => {
    renderWithApp(<PageHeader eyebrow="Home" title="Your tier lists" meta="19 boards" actions={<button type="button">Go</button>} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your tier lists' })).toBeInTheDocument();
    expect(screen.getByText('19 boards')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('a crumb takes the eyebrow slot; a node title renders as given', () => {
    renderWithApp(<PageHeader eyebrow="ignored" crumb={<a href="/x">Back</a>} title={<h1>Custom</h1>} />);
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Custom' })).toBeInTheDocument();
  });
});
