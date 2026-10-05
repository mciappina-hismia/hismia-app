import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Signup from './page';

const { signUp, signOut, browserAuth } = vi.hoisted(() => ({
  signUp: vi.fn(),
  signOut: vi.fn(),
  browserAuth: vi.fn(),
}));
vi.mock('../../lib/auth/browser', () => ({
  browserAuth,
  CONFIRM_PATH: '/auth/confirm',
  ONBOARDING_PATH: '/onboarding',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

beforeEach(() => {
  signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  browserAuth.mockReset().mockReturnValue({ auth: { signUp, signOut } });
  window.sessionStorage.clear();
});
afterEach(cleanup);

function submit(type: string): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.change(screen.getByLabelText(/Account type/), { target: { value: type } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
}

describe('direct signup', () => {
  it.each(['patient', 'professional', 'institution'])(
    'requests confirmation for %s without asserting a role or bypassing pending',
    async (type) => {
      render(<Signup />);
      submit(type);
      await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
      expect(signUp).toHaveBeenCalledWith({
        email: 'person@example.test',
        password: 'test-password',
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      expect(
        await screen.findByText(/check your email for a confirmation link/i),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toHaveValue('');
      expect(window.sessionStorage.getItem('hismia.onboarding.accountType')).toBe(type);
    },
  );

  it('clears an unexpected signup session locally instead of accepting confirmation bypass', async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: 'synthetic' } }, error: null });
    render(<Signup />);
    submit('patient');
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(screen.getByRole('status')).not.toHaveTextContent(
      /check your email for a confirmation link/i,
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(window.sessionStorage.getItem('hismia.onboarding.accountType')).toBeNull();
  });

  it('rejects invalid fields without contacting Auth', () => {
    render(<Signup />);
    submit('');
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/check your email, password/i);
  });

  it('shows setup required without calling the SDK when public configuration is absent', () => {
    browserAuth.mockReturnValue(null);
    render(<Signup />);
    submit('patient');
    expect(screen.getByRole('status')).toHaveTextContent(/setup required/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('prevents a second signup while the first request is pending', async () => {
    let finish: ((value: unknown) => void) | undefined;
    signUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Signup />);
    submit('patient');
    fireEvent.submit(screen.getByRole('button', { name: /please wait/i }).closest('form')!);
    expect(signUp).toHaveBeenCalledOnce();
    finish?.({ data: { session: null }, error: null });
    expect(
      await screen.findByText(/check your email for a confirmation link/i),
    ).toBeInTheDocument();
  });

  it('keeps a generic message when local session disposal fails', async () => {
    signUp.mockResolvedValue({ data: { session: {} }, error: null });
    signOut.mockRejectedValue(new Error('synthetic sensitive error'));
    render(<Signup />);
    submit('patient');
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(screen.queryByText(/synthetic sensitive error/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent(
      /check your email for a confirmation link/i,
    );
  });

  it('uses generic pending text even on SDK errors', async () => {
    signUp.mockRejectedValue(new Error('sensitive provider error'));
    render(<Signup />);
    submit('patient');
    expect(
      await screen.findByText(/check your email for a confirmation link/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sensitive provider error/i)).not.toBeInTheDocument();
  });
});
