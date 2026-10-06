import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './page';
import type * as Browser from '../../lib/auth/browser';
import { RECOVERY_PATH } from '../../lib/auth/browser';

const { signInWithPassword, confirmedUser, replace } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  confirmedUser: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('../../lib/auth/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Browser>()),
  browserAuth: () => ({ auth: { signInWithPassword } }),
  confirmedUser,
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
    expect(screen.getByRole('link', { name: /olvidaste tu contraseña/i })).toHaveAttribute(
      'href',
      RECOVERY_PATH,
    );
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
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Ingresa un email válido.');
    expect(email).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
      'La contraseña debe tener al menos 6 caracteres.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos indicados.');
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
    expect(screen.getByRole('status')).toHaveTextContent('Iniciando sesión…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    finish?.({ error: new Error('synthetic') });
    expect(await screen.findByText(/no se pudo iniciar sesión/i)).toBeInTheDocument();
  });
  it('denies unconfirmed identity after password authentication', async () => {
    render(<Login />);
    submit();
    await waitFor(() => expect(confirmedUser).toHaveBeenCalledOnce());
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/confirma tu email/i);
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
