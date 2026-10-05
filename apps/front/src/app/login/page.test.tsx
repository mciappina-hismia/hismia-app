import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './page';

const { signInWithPassword, confirmedUser, replace } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  confirmedUser: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('../../lib/auth/browser', () => ({
  browserAuth: () => ({ auth: { signInWithPassword } }),
  confirmedUser,
  ONBOARDING_PATH: '/onboarding',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  confirmedUser.mockReset().mockResolvedValue(false);
  replace.mockReset();
});
afterEach(cleanup);

function submit(): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
}

describe('returning login', () => {
  it('auth presentation offers labeled sign-in fields and the existing signup route', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar Sesión' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear Cuenta' })).toHaveAttribute('href', '/signup');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autoComplete', 'email');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autoComplete', 'current-password');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('rejects malformed input without calling Auth', () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it('keeps a single pending password request', async () => {
    let finish: ((value: unknown) => void) | undefined;
    signInWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Login />);
    submit();
    fireEvent.submit(screen.getByRole('button', { name: /por favor, espere/i }).closest('form')!);
    expect(signInWithPassword).toHaveBeenCalledOnce();
    finish?.({ error: new Error('synthetic') });
    expect(await screen.findByText(/sign-in unavailable/i)).toBeInTheDocument();
  });
  it('denies unconfirmed identity after password authentication', async () => {
    render(<Login />);
    submit();
    await waitFor(() => expect(confirmedUser).toHaveBeenCalledOnce());
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/confirm your email/i);
  });
  it('hands off confirmed users without contacting Hismia API', async () => {
    confirmedUser.mockResolvedValue(true);
    render(<Login />);
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'test-password',
    });
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });
});
