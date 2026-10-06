import { webcrypto } from 'node:crypto';
import { createElement, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResetPassword from '../../app/auth/reset-password/page';
import Recover from '../../app/auth/recover/page';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeRecoveryCallback,
  createRecovery,
  hasRecoveryRedirect,
  requestRecovery,
  supabaseRecovery,
} from './recovery';
import { RESET_PASSWORD_PATH } from './browser';
import type * as Browser from './browser';

const ORIGIN = 'https://auth.synthetic.test';
let storageKey: string;
let sequence = 0;
const binding = vi.hoisted(() => ({ client: null as SupabaseClient | null, replace: vi.fn() }));
// Inject the real SDK client at the browser configuration boundary; never mock SDK methods.
vi.mock('./browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Browser>()),
  browserAuth: () => binding.client,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: binding.replace }) }));
const USER = {
  id: 'synthetic-subject',
  aud: 'authenticated',
  email: 'user@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const SESSION = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: USER,
};
let client: SupabaseClient;
let storage: Map<string, string>;
let requests: Array<{ url: URL; method: string; body: Record<string, unknown>; headers: Headers }>;
let reply: (url: URL, method: string) => Response;
let subscription: { unsubscribe(): void } | undefined;

function requestAt(index: number): (typeof requests)[number] {
  const request = requests.at(index);
  if (!request) throw new Error(`Missing synthetic request at index ${index}`);
  return request;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  window.history.replaceState(null, '', RESET_PASSWORD_PATH);
  storageKey = `synthetic-recovery-${sequence++}`;
  binding.replace.mockReset();
  storage = new Map();
  requests = [];
  reply = (url, method) => {
    if (method === 'POST' && url.pathname === '/auth/v1/recover') return json({});
    if (method === 'POST' && url.pathname === '/auth/v1/token' && url.search === '?grant_type=pkce')
      return json(SESSION);
    if (method === 'PUT' && url.pathname === '/auth/v1/user') return json({ user: USER });
    if (method === 'POST' && url.pathname === '/auth/v1/logout' && url.search === '?scope=local')
      return json({});
    throw new Error(`Denied synthetic HTTP: ${method} ${url.pathname}`);
  };
  client = createClient(ORIGIN, 'synthetic-public-key', {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
      storageKey,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
        removeItem: (key) => {
          storage.delete(key);
        },
      },
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.origin !== ORIGIN) throw new Error('Denied synthetic HTTP origin');
        const method = init?.method ?? 'GET';
        requests.push({
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : {},
          headers: new Headers(init?.headers),
        });
        return reply(url, method);
      },
    },
  });
  binding.client = client;
  await client.auth.initialize();
});

afterEach(async () => {
  cleanup();
  binding.client = null;
  subscription?.unsubscribe();
  subscription = undefined;
  await client.auth.stopAutoRefresh();
  // Release SDK subscriptions/broadcast channels without attempting provider I/O.
  await client.auth.dispose();
  vi.unstubAllGlobals();
});

async function callback(): Promise<{ code: string; flowId: string }> {
  await requestRecovery(client, 'user@example.test', window.location.origin);
  const request = requestAt(-1);
  const redirect = new URL(request.url.searchParams.get('redirect_to')!);
  expect(redirect.origin).toBe(window.location.origin);
  expect(redirect.pathname).toBe(RESET_PASSWORD_PATH);
  // Production uses exact allowlists: appending flow IDs is SDK opt-in, disabled here.
  expect(redirect.searchParams.has('sb_flow_id')).toBe(false);
  const slotKey = [...storage.keys()].find((key) => key.startsWith(`${storageKey}-flow-`))!;
  const flowId = slotKey.slice(`${storageKey}-flow-`.length, -'-code-verifier'.length);
  expect(flowId).toBeTruthy();
  return { code: 'synthetic-code', flowId };
}

function land(code: string, flowId?: string): void {
  window.history.replaceState(
    null,
    '',
    `${RESET_PASSWORD_PATH}?code=${code}${flowId ? `&sb_flow_id=${flowId}` : ''}`,
  );
}

describe('installed Supabase SDK recovery contract (HTTP only)', () => {
  it('connects real request/reset components through the SDK and StrictMode without duplicate exchange', async () => {
    const requested = render(createElement(Recover));
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'user@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    fireEvent.submit(screen.getByRole('button', { name: /enviando/i }).closest('form')!);
    await screen.findByText(/si este email puede ser recuperado/i);
    expect(requestAt(0).url.searchParams.get('redirect_to')).toBe(
      `${window.location.origin}${RESET_PASSWORD_PATH}`,
    );
    requested.unmount();
    land('synthetic-code');
    render(createElement(StrictMode, null, createElement(ResetPassword)));
    await screen.findByLabelText(/nueva contraseña/i);
    expect(requests.filter(({ url }) => url.pathname.endsWith('/token'))).toHaveLength(1);
    expect(window.location.search + window.location.hash).toBe('');
    fireEvent.input(screen.getByLabelText(/nueva contraseña/i), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));
    await waitFor(() => expect(binding.replace).toHaveBeenCalledWith('/login'));
    expect(requests.filter(({ method }) => method === 'PUT')).toHaveLength(1);
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
  it('generates the recovery verifier/challenge, exchanges once, updates and explicitly logs out', async () => {
    const events: string[] = [];
    subscription = client.auth.onAuthStateChange((event) => {
      events.push(event);
    }).data.subscription;
    const { code, flowId } = await callback();
    const request = requestAt(0);
    const stored = JSON.parse(storage.get(`${storageKey}-flow-${flowId}-code-verifier`)!);
    const verifier = stored.split('/')[0];
    expect(stored).toBe(`${verifier}/recovery`);
    expect(request.body).toEqual({
      email: 'user@example.test',
      code_challenge_method: 's256',
      code_challenge: Buffer.from(
        await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
      ).toString('base64url'),
      gotrue_meta_security: {},
    });
    land(code);
    // detectSessionInUrl:false must leave the callback for the application.
    expect((await client.auth.getSession()).data.session).toBeNull();
    const recovery = createRecovery(supabaseRecovery(client));
    const pending = recovery.open(consumeRecoveryCallback());
    expect(window.location.search).toBe('');
    expect(recovery.open(consumeRecoveryCallback())).toBe(pending);
    expect(await pending).toBe(true);
    expect(events).toContain('PASSWORD_RECOVERY');
    expect(requestAt(1).body).toEqual({ auth_code: code, code_verifier: verifier });
    expect(storage.has(`${storageKey}-code-verifier`)).toBe(false);
    expect(await recovery.changePassword('new-synthetic-password')).toBe('saved');
    expect(requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)).toEqual([
      `POST /auth/v1/recover?redirect_to=${encodeURIComponent(`${window.location.origin}${RESET_PASSWORD_PATH}`)}`,
      'POST /auth/v1/token?grant_type=pkce',
      'PUT /auth/v1/user',
      'POST /auth/v1/logout?scope=local',
    ]);
    const updateRequest = requestAt(2);
    expect(updateRequest.body).toEqual({
      password: 'new-synthetic-password',
      code_challenge: null,
      code_challenge_method: null,
    });
    expect(updateRequest.headers.get('Authorization')).toBe('Bearer synthetic-access');
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(storage.has(`${storageKey}-flow-${flowId}-code-verifier`)).toBe(false);
    expect(await recovery.changePassword('another-password')).toBe('no-recovery');
    const reused = await client.auth.exchangeCodeForSession(code);
    expect(reused.error?.name).toBe('AuthPKCECodeVerifierMissingError');
    expect(requests).toHaveLength(4);
  });

  it('keeps neutral request messaging on real SDK rejection', async () => {
    reply = () => json({ msg: 'synthetic rate limit', code: 'over_email_send_rate_limit' }, 429);
    render(createElement(Recover));
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: 'user@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));
    await screen.findByText(/si este email puede ser recuperado/i);
    expect(requests).toHaveLength(1);
    expect(storage.has(`${storageKey}-code-verifier`)).toBe(false);
  });

  it('does not admit an existing real SDK session on a direct reset visit', async () => {
    const { code, flowId } = await callback();
    expect((await client.auth.exchangeCodeForSession(code, { flowId })).error).toBeNull();
    render(createElement(ResetPassword));
    await screen.findByRole('heading', { name: /necesitás un enlace/i });
    expect(screen.queryByLabelText(/nueva contraseña/i)).not.toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });

  it('does not automatically invalidate the session after updateUser', async () => {
    const { code, flowId } = await callback();
    const result = await client.auth.exchangeCodeForSession(code, { flowId });
    expect(hasRecoveryRedirect(result.data)).toBe(true);
    expect((await client.auth.updateUser({ password: 'new-password' })).error).toBeNull();
    expect((await client.auth.getSession()).data.session?.user.id).toBe(USER.id);
  });

  it.each(['missing', 'wrong-flow', 'non-recovery', 'exchange-rejected'])(
    'denies %s before password update',
    async (scenario) => {
      const { code, flowId } = await callback();
      if (scenario === 'missing') storage.clear();
      if (scenario === 'non-recovery') {
        const key = `${storageKey}-flow-${flowId}-code-verifier`;
        storage.set(key, JSON.stringify(JSON.parse(storage.get(key)!).split('/')[0]));
      }
      if (scenario === 'exchange-rejected')
        reply = () => json({ msg: 'synthetic expired code', code: 'otp_expired' }, 400);
      land(code, scenario === 'wrong-flow' ? '00000000000000000000000000000000' : flowId);
      const recovery = createRecovery(supabaseRecovery(client));
      expect(await recovery.open(consumeRecoveryCallback())).toBe(false);
      expect(await recovery.changePassword('new-password')).toBe('no-recovery');
      expect(requests.some(({ method }) => method === 'PUT')).toBe(false);
      if (scenario === 'missing' || scenario === 'wrong-flow') expect(requests).toHaveLength(1);
    },
  );

  it.each([
    '?type=recovery',
    '?code=synthetic&error=denied',
    '#access_token=synthetic&type=recovery',
  ])('does not trust callback parameters %s', async (suffix) => {
    window.history.replaceState(null, '', `${RESET_PASSWORD_PATH}${suffix}`);
    expect(await createRecovery(supabaseRecovery(client)).open(consumeRecoveryCallback())).toBe(
      false,
    );
    expect(requests).toHaveLength(0);
    expect(window.location.search + window.location.hash).toBe('');
  });

  it.each(['update', 'logout'])(
    'reports %s rejection without claiming successful completion',
    async (failure) => {
      const { code, flowId } = await callback();
      land(code, flowId);
      const recovery = createRecovery(supabaseRecovery(client));
      expect(await recovery.open(consumeRecoveryCallback())).toBe(true);
      const normalReply = reply;
      reply = (url, method) =>
        url.pathname === `/auth/v1/${failure === 'update' ? 'user' : 'logout'}`
          ? json({ msg: 'synthetic rejection', code: 'synthetic_error' }, 500)
          : normalReply(url, method);
      expect(await recovery.changePassword('new-password')).toBe(
        failure === 'update' ? 'update-failed' : 'signout-failed',
      );
      expect(requests.filter(({ method }) => method === 'PUT')).toHaveLength(1);
      if (failure === 'update')
        expect(requests.some(({ url }) => url.pathname.endsWith('/logout'))).toBe(false);
      else expect(await recovery.changePassword('another-password')).toBe('no-recovery');
    },
  );
});
