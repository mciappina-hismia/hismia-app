import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import Confirm from './page';

const { exchangeCodeForSession, confirmedUser, replace, browserAuth } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  confirmedUser: vi.fn(),
  replace: vi.fn(),
  browserAuth: vi.fn(),
}));
vi.mock('../../../lib/auth/browser', () => ({
  browserAuth,
  cleanCallbackUrl: () => {
    const code = new URL(window.location.href).searchParams.get('code');
    window.history.replaceState(null, '', '/auth/confirm');
    return code;
  },
  confirmedUser,
  ONBOARDING_PATH: '/onboarding',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  confirmedUser.mockReset().mockResolvedValue(false);
  replace.mockReset();
  browserAuth.mockReset().mockReturnValue({ auth: { exchangeCodeForSession } });
  window.history.replaceState(null, '', '/auth/confirm');
});
afterEach(cleanup);

describe('confirmation return', () => {
  it('exchanges once, scrubs redirect parameters and hands off confirmed identity', async () => {
    confirmedUser.mockResolvedValue(true);
    window.history.replaceState(null, '', '/auth/confirm?code=one&next=https://elsewhere.test');
    render(<Confirm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('one');
    expect(window.location.search).toBe('');
  });
  it('does not reuse an unfinished exchange from an earlier unmounted visit', async () => {
    exchangeCodeForSession.mockImplementationOnce(() => new Promise(() => {}));
    window.history.replaceState(null, '', '/auth/confirm?code=first');
    const first = render(<Confirm />);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('first');
    first.unmount();
    window.history.replaceState(null, '', '/auth/confirm?error=access_denied');
    render(<Confirm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirmación no disponible/i);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('does not hand off a previous confirmed session on a provider-error callback', async () => {
    confirmedUser.mockResolvedValue(true);
    window.history.replaceState(
      null,
      '',
      '/auth/confirm?error=access_denied&next=https://elsewhere.test#access_token=synthetic',
    );
    render(<Confirm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirmación no disponible/i);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('exchanges only once through StrictMode effect replay for a single visit', async () => {
    confirmedUser.mockResolvedValue(true);
    window.history.replaceState(null, '', '/auth/confirm?code=strict');
    render(
      <StrictMode>
        <Confirm />
      </StrictMode>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct code-bearing visits independent while the first is pending', async () => {
    exchangeCodeForSession.mockImplementationOnce(() => new Promise(() => {}));
    window.history.replaceState(null, '', '/auth/confirm?code=first');
    const first = render(<Confirm />);
    first.unmount();
    window.history.replaceState(null, '', '/auth/confirm?code=second');
    render(<Confirm />);
    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith('second'));
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(2);
  });

  it('shows setup required and scrubs the callback without exchanging when config is absent', async () => {
    browserAuth.mockReturnValue(null);
    window.history.replaceState(null, '', '/auth/confirm?code=one#synthetic');
    render(<Confirm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/configuración requerida/i);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('safely falls back on missing or expired code and no confirmed session', async () => {
    window.history.replaceState(null, '', '/auth/confirm?code=expired&returnTo=/unsafe');
    exchangeCodeForSession.mockResolvedValue({ error: new Error('expired') });
    render(<Confirm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirmación no disponible/i);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});
