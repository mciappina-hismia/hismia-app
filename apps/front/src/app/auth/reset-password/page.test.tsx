import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import ResetPassword from './page';
import type * as Browser from '../../../lib/auth/browser';
import { RECOVERY_PATH, RESET_PASSWORD_PATH } from '../../../lib/auth/browser';

const { exchangeCodeForSession, getSession, updateUser, signOut, replace, browserAuth } =
  vi.hoisted(() => ({
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    replace: vi.fn(),
    browserAuth: vi.fn(),
  }));

vi.mock('../../../lib/auth/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Browser>()),
  browserAuth,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  window.history.replaceState(null, '', RESET_PASSWORD_PATH);
  exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'synthetic-subject' } }, redirectType: 'recovery' },
    error: null,
  });
  getSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'synthetic-subject' } } },
    error: null,
  });
  updateUser.mockReset();
  signOut.mockReset().mockResolvedValue({});
  replace.mockReset();
  browserAuth.mockReset();
  browserAuth.mockReturnValue({
    auth: { exchangeCodeForSession, getSession, updateUser, signOut },
  });
});

afterEach(cleanup);

async function readyWithSession(): Promise<void> {
  window.history.replaceState(null, '', `${RESET_PASSWORD_PATH}?code=synthetic`);
  render(<ResetPassword />);
  await screen.findByRole('heading', { name: /establecer nueva contraseña/i });
}

describe('reset password', () => {
  it('announces password-update progress politely, without an error announcement', async () => {
    updateUser.mockImplementation(() => new Promise(() => {}));
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando tu contraseña…');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows a pending state while checking the recovery session', async () => {
    window.history.replaceState(null, '', `${RESET_PASSWORD_PATH}?code=synthetic`);
    exchangeCodeForSession.mockImplementation(() => new Promise(() => {}));
    render(<ResetPassword />);
    expect(await screen.findByText(/verificando tu sesión de recuperación/i)).toBeInTheDocument();
  });

  it('shows a recovery link required page when there is no recovery session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<ResetPassword />);
    expect(
      await screen.findByRole('heading', { name: /necesitás un enlace/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /solicitar un nuevo enlace/i })).toHaveAttribute(
      'href',
      RECOVERY_PATH,
    );
  });

  it('does not admit an ordinary persisted session without a recovery callback', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'ordinary' } }, error: null });
    render(<ResetPassword />);
    expect(
      await screen.findByRole('heading', { name: /necesitás un enlace/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/nueva contraseña/i)).not.toBeInTheDocument();
  });

  it('rejects short passwords without calling Supabase', async () => {
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
    expect(await screen.findByText(/la contraseña debe tener al menos/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAccessibleDescription(
      'La contraseña debe tener al menos 6 caracteres.',
    );
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 6 caracteres/);
  });

  it('calls updateUser, signs out the recovery session and redirects to /login', async () => {
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'new-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
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
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'new-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no se pudo actualizar la contraseña/i,
    );
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute('aria-invalid', 'false');
    expect(replace).not.toHaveBeenCalled();
  });

  it('exchanges once under StrictMode and scrubs callback data before completion', async () => {
    window.history.replaceState(
      null,
      '',
      `${RESET_PASSWORD_PATH}?code=synthetic&sb_flow_id=flow&next=https://elsewhere.test`,
    );
    render(
      <StrictMode>
        <ResetPassword />
      </StrictMode>,
    );
    await screen.findByLabelText(/nueva contraseña/i);
    expect(exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(exchangeCodeForSession).toHaveBeenCalledWith('synthetic', { flowId: 'flow' });
    expect(window.location.search + window.location.hash).toBe('');
  });

  it('does not expose the form or repeat update when logout fails after saving', async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: new Error('synthetic') });
    await readyWithSession();
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
    expect(await screen.findByText(/tu contraseña cambió/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nueva contraseña/i)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledOnce();
  });

  it('shows setup required when no Supabase client is configured', async () => {
    browserAuth.mockReturnValue(null);
    render(<ResetPassword />);
    expect(await screen.findByText(/configuración requerida/i)).toBeInTheDocument();
  });
});
