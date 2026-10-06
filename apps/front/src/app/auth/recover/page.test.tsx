import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Recover from './page';
import type * as Browser from '../../../lib/auth/browser';
import { RESET_PASSWORD_PATH } from '../../../lib/auth/browser';

const { resetPasswordForEmail, browserAuth } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  browserAuth: vi.fn(),
}));

vi.mock('../../../lib/auth/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Browser>()),
  browserAuth,
}));

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  browserAuth.mockReset();
  browserAuth.mockReturnValue({ auth: { resetPasswordForEmail } });
});

afterEach(cleanup);

describe('recover password', () => {
  it('rejects malformed emails without calling Supabase', async () => {
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    expect(
      await screen.findByText(/revisa el email que ingresaste|revisa tu email/i),
    ).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('trims whitespace before submitting', async () => {
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: '  user@example.test  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.test', {
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      }),
    );
  });

  it('shows the neutral recovery message on success', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    expect(await screen.findByText(/si este email puede ser recuperado/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    expect(await screen.findByText(/si este email puede ser recuperado/i)).toBeInTheDocument();
  });

  it('shows setup required when no Supabase client is configured', async () => {
    browserAuth.mockReturnValue(null);
    render(<Recover />);
    fireEvent.input(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    expect(await screen.findByText(/configuración requerida/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    fireEvent.click(screen.getByRole('button', { name: /enviando/i }));
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    resolve();
  });
});
