import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Recover from './page';

const { resetPasswordForEmail, browserAuth } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  browserAuth: vi.fn(),
}));

vi.mock('../../../lib/auth/browser', () => ({
  browserAuth,
  RECOVERY_PATH: '/auth/reset-password',
}));

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  browserAuth.mockReset();
  browserAuth.mockReturnValue({ auth: { resetPasswordForEmail } });
  // jsdom defaults window.location.origin to "http://localhost:3000"
});

afterEach(cleanup);

describe('recover password', () => {
  it('rejects malformed emails without calling Supabase', async () => {
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/check your email address/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('trims whitespace before submitting', async () => {
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: '  user@example.test  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.test',
        expect.objectContaining({ redirectTo: expect.stringContaining('/auth/reset-password') }),
      ),
    );
  });

  it('shows the neutral recovery message on success', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/if this email can be recovered/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('shows the same neutral message when Supabase rejects the request', async () => {
    // Supabase rate-limits aggressively; the user-visible message stays
    // neutral regardless of the SDK response.
    resetPasswordForEmail.mockRejectedValue(new Error('rate_limited'));
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/if this email can be recovered/i)).toBeInTheDocument();
  });

  it('shows setup required when no Supabase client is configured', async () => {
    browserAuth.mockReturnValue(null);
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/setup required/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('does not submit twice while in flight (StrictMode replay included)', async () => {
    let resolve!: () => void;
    resetPasswordForEmail.mockImplementation(
      () =>
        new Promise<unknown>((r) => {
          resolve = r as () => void;
        }),
    );
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    fireEvent.click(screen.getByRole('button', { name: /sending/i }));
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    resolve();
  });
});
