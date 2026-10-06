import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Onboarding from './page';

const { browserAuth, confirmedUser, verifyAccount, getSession, getUser, onAuthStateChange } =
  vi.hoisted(() => ({
    confirmedUser: vi.fn(),
    browserAuth: vi.fn(),
    verifyAccount: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  }));
vi.mock('../../lib/auth/browser', () => ({ browserAuth, confirmedUser }));
vi.mock('../../lib/profiles/client', () => ({ verifyAccount }));
vi.mock('../../components/profiles/onboarding-form', () => ({
  OnboardingForm: ({
    initialType,
    authorize,
  }: {
    initialType: string;
    authorize: () => Promise<{ kind: string; token?: string }>;
  }) => (
    <>
      <p>Form ready: {initialType}</p>
      <button
        onClick={() => {
          void authorize().then((result) => {
            if (result.kind === 'ready') window.dispatchEvent(new Event('synthetic-authorized'));
          });
        }}
      >
        Test submit access
      </button>
    </>
  ),
}));
beforeEach(() => {
  browserAuth.mockReset().mockReturnValue({ auth: { getSession, getUser, onAuthStateChange } });
  confirmedUser.mockReset().mockResolvedValue(true);
  getUser.mockReset().mockResolvedValue({
    data: { user: { id: 'synthetic-subject', email_confirmed_at: '2026-01-01' } },
    error: null,
  });
  onAuthStateChange
    .mockReset()
    .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: 'synthetic-token', user: { id: 'synthetic-subject' } } },
    error: null,
  });
  verifyAccount.mockReset().mockResolvedValue({ kind: 'ready', subject: 'synthetic-subject' });
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('confirmed onboarding gate', () => {
  it('checks getUser, then token transport and authoritative API before showing preference and form', async () => {
    window.sessionStorage.setItem('hismia.onboarding.accountType', 'professional');
    render(<Onboarding />);
    expect(await screen.findByText('Form ready: professional')).toBeInTheDocument();
    expect(getUser.mock.invocationCallOrder[0]).toBeLessThan(
      getSession.mock.invocationCallOrder[0]!,
    );
    expect(getSession.mock.invocationCallOrder[0]).toBeLessThan(
      verifyAccount.mock.invocationCallOrder[0]!,
    );
    expect(verifyAccount).toHaveBeenCalledWith('synthetic-token');
  });
  it('does not call API or show form for unconfirmed, missing or expired session', async () => {
    confirmedUser.mockResolvedValueOnce(false);
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'synthetic-subject', email_confirmed_at: null } },
      error: null,
    });
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(getSession).not.toHaveBeenCalled();
    cleanup();
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(verifyAccount).not.toHaveBeenCalled();
  });
  it('fails closed when session retrieval throws', async () => {
    getSession.mockRejectedValueOnce(new Error('synthetic SDK failure'));
    render(<Onboarding />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo verificar tu cuenta/i);
    expect(verifyAccount).not.toHaveBeenCalled();
  });
  it('denies API 401, ignores forged preference and fails closed on unavailable API', async () => {
    window.sessionStorage.setItem('hismia.onboarding.accountType', 'admin');
    verifyAccount.mockResolvedValueOnce({ kind: 'signin' });
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
    cleanup();
    verifyAccount.mockResolvedValueOnce({ kind: 'unavailable' });
    render(<Onboarding />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo verificar tu cuenta/i);
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
  });
  it('rejects a getSession user identity mismatch without trusting its bearer', async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'synthetic-token', user: { id: 'another-subject' } } },
      error: null,
    });
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(verifyAccount).not.toHaveBeenCalled();
  });
  it('rejects a confirmed-user/API subject mismatch before exposing the form', async () => {
    verifyAccount.mockResolvedValueOnce({ kind: 'ready', subject: 'other-subject' });
    render(<Onboarding />);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
  });
  it('clears a visible form on signout, keeps the draft on same-user token refresh, and refuses a switched account', async () => {
    let callback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
    onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    render(<Onboarding />);
    expect(await screen.findByText('Form ready:')).toBeInTheDocument();
    callback?.('TOKEN_REFRESHED', { user: { id: 'synthetic-subject' } });
    expect(screen.getByText('Form ready:')).toBeInTheDocument();
    callback?.('SIGNED_OUT', null);
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    cleanup();
    render(<Onboarding />);
    expect(await screen.findByText('Form ready:')).toBeInTheDocument();
    callback?.('SIGNED_IN', { user: { id: 'another-subject' } });
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
  });
  it('discards a pre-submit API gate result when signout races it', async () => {
    let callback: ((event: string, session: null) => void) | undefined;
    onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    render(<Onboarding />);
    expect(await screen.findByText('Form ready:')).toBeInTheDocument();
    let finish: ((result: { kind: 'ready'; subject: string }) => void) | undefined;
    verifyAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const authorized = vi.fn();
    window.addEventListener('synthetic-authorized', authorized, { once: true });
    fireEvent.click(screen.getByRole('button', { name: /test submit access/i }));
    await waitFor(() => expect(verifyAccount).toHaveBeenCalledTimes(2));
    callback?.('SIGNED_OUT', null);
    finish?.({ kind: 'ready', subject: 'synthetic-subject' });
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(authorized).not.toHaveBeenCalled();
    window.removeEventListener('synthetic-authorized', authorized);
  });
  it('rejects a changed identity before a new submit even if the form was initially gated', async () => {
    render(<Onboarding />);
    expect(await screen.findByText('Form ready:')).toBeInTheDocument();
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'another-subject', email_confirmed_at: '2026-01-01' } },
      error: null,
    });
    const authorized = vi.fn();
    window.addEventListener('synthetic-authorized', authorized, { once: true });
    fireEvent.click(screen.getByRole('button', { name: /test submit access/i }));
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(2));
    expect(authorized).not.toHaveBeenCalled();
    window.removeEventListener('synthetic-authorized', authorized);
  });
  it('invalidates pending account A when SIGNED_IN announces account B before API me resolves', async () => {
    let callback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
    onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    let finish: ((result: { kind: 'ready'; subject: string }) => void) | undefined;
    verifyAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Onboarding />);
    await waitFor(() => expect(verifyAccount).toHaveBeenCalledOnce());
    callback?.('SIGNED_IN', { user: { id: 'another-subject' } });
    await act(async () => {
      finish?.({ kind: 'ready', subject: 'synthetic-subject' });
    });
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
  });
  it('ignores INITIAL_SESSION notification while pending without silently discarding a valid gate', async () => {
    let callback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
    onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    let finish: ((result: { kind: 'ready'; subject: string }) => void) | undefined;
    verifyAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Onboarding />);
    await waitFor(() => expect(verifyAccount).toHaveBeenCalledOnce());
    callback?.('INITIAL_SESSION', { user: { id: 'synthetic-subject' } });
    await act(async () => {
      finish?.({ kind: 'ready', subject: 'synthetic-subject' });
    });
    expect(await screen.findByText('Form ready:')).toBeInTheDocument();
  });
  it('ignores a late gate result after signout', async () => {
    let callback: ((event: string, session: null) => void) | undefined;
    onAuthStateChange.mockImplementation((listener) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    let finish: ((result: { kind: 'ready'; subject: string }) => void) | undefined;
    verifyAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Onboarding />);
    await waitFor(() => expect(verifyAccount).toHaveBeenCalledOnce());
    callback?.('SIGNED_OUT', null);
    finish?.({ kind: 'ready', subject: 'synthetic-subject' });
    expect(await screen.findByRole('link', { name: /inicia sesión/i })).toBeInTheDocument();
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
  });
  it('handles configuration failure and ignores late gate result after unmount', async () => {
    browserAuth.mockReturnValueOnce(null);
    render(<Onboarding />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/configuración requerida/i);
    cleanup();
    let finish: ((result: { kind: 'ready'; subject: string }) => void) | undefined;
    verifyAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(<Onboarding />);
    await waitFor(() => expect(verifyAccount).toHaveBeenCalled());
    unmount();
    finish?.({ kind: 'ready', subject: 'synthetic-subject' });
    expect(screen.queryByText(/Form ready/)).not.toBeInTheDocument();
  });
});
