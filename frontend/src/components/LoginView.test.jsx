import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import LoginView from './LoginView';
import { renderWithApp } from '../test/render';

describe('LoginView', () => {
  it('Continue with Google signs in; the button follows the theme (readable on light themes too)', () => {
    const onLogin = vi.fn();
    renderWithApp(<LoginView onLogin={onLogin} />);
    const button = screen.getByRole('button', { name: /Continue with Google/ });
    expect(button).toHaveAttribute('data-variant', 'default');
    fireEvent.click(button);
    expect(onLogin).toHaveBeenCalled();
  });

  it('says what happened when there is a problem, with Retry when there is one to do', () => {
    const onRetry = vi.fn();
    renderWithApp(<LoginView onLogin={() => {}} problem={{ title: 'Couldn’t reach the server', message: 'Down', onRetry }} />);
    expect(screen.getByText('Couldn’t reach the server')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
