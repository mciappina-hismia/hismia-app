import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResetPassword from './page';

const { getSession, updateUser, signOut, replace, browserAuth } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  browserAuth: vi.fn(),
}));

vi.mock('../../../lib/auth/browser', () => ({
  browserAuth,
  ONBOARDING_PATH: '/onboarding',
  RECOVERY_PATH: '/auth/recover',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  getSession.mockReset();
  updateUser.mockReset();
  signOut.mockReset().mockResolvedValue({});
  replace.mockReset();
  browserAuth.mockReset();
  browserAuth.mockReturnValue({
    auth: { getSession, updateUser, signOut },
  });
});

afterEach(cleanup);

async function readyWithSession(): Promise<void> {
  getSession.mockResolvedValue({
    data: { session: { access_token: 'recovery-token' } },
    error: null,
  });
  render(<ResetPassword />);
  await screen.findByRole('heading', { name: /set new password/i });
}

describe('reset password', () => {
  it('shows a pending state while checking the recovery session', async () => {
    getSession.mockImplementation(() => new Promise(() => {}));
    render(<ResetPassword />);
    expect(await screen.findByText(/checking your recovery session/i)).toBeInTheDocument();
  });

  it('shows a recovery link required page when there is no recovery session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<ResetPassword />);
    expect(
      await screen.findByRole('heading', { name: /recovery link required/i }),
    ).toBeInTheDocument();
  });

  it('rejects short passwords without calling Supabase', async () => {
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/new password/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText(/password must be at least/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser, signs out the recovery session and redirects to /login', async () => {
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/new password/i), {
      target: { value: 'new-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-strong-password' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('surfaces the Supabase error without redirecting', async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: new Error('same_password'),
    });
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/new password/i), {
      target: { value: 'new-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText(/password update unavailable/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows setup required when no Supabase client is configured', async () => {
    browserAuth.mockReturnValue(null);
    render(<ResetPassword />);
    expect(await screen.findByText(/setup required/i)).toBeInTheDocument();
  });
});
