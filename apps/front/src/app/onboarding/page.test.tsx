import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Onboarding from './page';

const { confirmedUser, browserAuth } = vi.hoisted(() => ({
  confirmedUser: vi.fn(),
  browserAuth: vi.fn(),
}));
vi.mock('../../lib/auth/browser', () => ({ confirmedUser, browserAuth }));
beforeEach(() => {
  browserAuth.mockReset().mockReturnValue({ auth: {} });
  confirmedUser.mockReset().mockResolvedValue(true);
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('onboarding handoff', () => {
  it('acknowledges only a validated untrusted preference after confirmation', async () => {
    window.sessionStorage.setItem('hismia.onboarding.accountType', 'professional');
    render(<Onboarding />);
    expect(await screen.findByText(/professional preference/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/not available yet/i);
  });
  it('never treats a forged admin preference as authorization', async () => {
    window.sessionStorage.setItem('hismia.onboarding.accountType', 'admin');
    render(<Onboarding />);
    expect(await screen.findByText(/email confirmed/i)).toBeInTheDocument();
    expect(screen.queryByText(/admin preference/i)).not.toBeInTheDocument();
  });
  it('rejects an unconfirmed user without displaying the preference', async () => {
    confirmedUser.mockResolvedValue(false);
    window.sessionStorage.setItem('hismia.onboarding.accountType', 'patient');
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/patient preference/i)).not.toBeInTheDocument();
  });
  it('requires setup if browser configuration is absent', async () => {
    browserAuth.mockReturnValue(null);
    render(<Onboarding />);
    expect(await screen.findByText(/setup required/i)).toBeInTheDocument();
    expect(confirmedUser).not.toHaveBeenCalled();
  });
});
