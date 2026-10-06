import { webcrypto } from 'node:crypto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import Onboarding from './page';
import { checkedAccount } from '../../lib/profiles/client';

const binding = vi.hoisted(() => ({ factory: vi.fn<() => SupabaseClient>() }));
// Only browser configuration and HTTP are substituted. SDK methods, auth events,
// checkedAccount, the page and the actual onboarding form remain genuine.
vi.mock('../../lib/auth/browser', () => ({ browserAuth: () => binding.factory() }));

const ORIGIN = 'https://auth.synthetic.test';
const USER = {
  id: 'synthetic-restoration-account',
  aud: 'authenticated',
  email: 'restoration@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
};
const SESSION = {
  access_token: 'synthetic-restoration-access',
  refresh_token: 'synthetic-restoration-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: USER,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

type Event =
  | 'login-persisted'
  | 'login-client-disposed'
  | 'effect-client-created'
  | 'restore-SIGNED_IN'
  | 'restore-INITIAL_SESSION'
  | 'other-auth-event'
  | 'page-user-validated'
  | 'page-gate-requested'
  | 'page-gate-decoded'
  | 'probe-user-validated'
  | 'probe-gate-decoded'
  | 'probe-gate-ready';
const events: Event[] = [];
function record(event: Event) {
  if (events.length < 32) events.push(event);
}
const ownedClients = new Set<SupabaseClient>();
const subscriptions: Array<{ unsubscribe(): void }> = [];
const storage = new Map<string, string>();
const releaseGate = deferred();
const decodedGate = deferred();
let disposedClients = 0;
let passwordRequests = 0;
let userRequests = 0;
let pageGateRequests = 0;
let probeGateRequests = 0;
let deniedRequests = 0;
let restoredSessionValid = false;
let probing = false;
let report: Record<string, boolean | number> | undefined;

async function closeClient(client: SupabaseClient) {
  await client.auth.stopAutoRefresh();
  await client.auth.dispose();
  ownedClients.delete(client);
  disposedClients++;
}

afterEach(async () => {
  // Also release pending synthetic HTTP after an assertion/setup failure.
  releaseGate.resolve();
  cleanup(); // The page unsubscribes its own listener on unmount.
  for (const subscription of subscriptions) subscription.unsubscribe();
  for (const client of ownedClients) await closeClient(client);
  binding.factory.mockReset();
  storage.clear();
  vi.unstubAllGlobals();
  // Finite receipt only: no response bodies, storage, subjects, tokens or DOM dumps.
  console.info(
    'restoration receipt',
    JSON.stringify({
      events,
      ...report,
      passwordRequests,
      userRequests,
      pageGateRequests,
      probeGateRequests,
      deniedRequests,
      disposedClients,
      observerSubscriptionsClosed: subscriptions.length,
      ownedClientsRemaining: ownedClients.size,
      storageCleared: storage.size === 0,
    }),
  );
});

it('shows the ready profile form after genuine SDK persisted-session restoration and a valid identity gate', async () => {
  vi.stubGlobal('crypto', webcrypto);
  window.history.replaceState(null, '', '/onboarding');
  const storageKey = 'synthetic-onboarding-restoration';
  function makeClient() {
    const client = createClient(ORIGIN, 'synthetic-public-key', {
      auth: {
        // Match browserAuth flags; no pre-awaited initialization for the recreated client.
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
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
          const method = init?.method ?? 'GET';
          if (
            url.origin === ORIGIN &&
            url.pathname === '/auth/v1/token' &&
            url.search === '?grant_type=password' &&
            method === 'POST'
          ) {
            passwordRequests++;
            return json(SESSION);
          }
          if (
            url.origin === ORIGIN &&
            url.pathname === '/auth/v1/user' &&
            url.search === '' &&
            method === 'GET' &&
            new Headers(init?.headers).get('Authorization') === `Bearer ${SESSION.access_token}`
          ) {
            userRequests++;
            record(probing ? 'probe-user-validated' : 'page-user-validated');
            return json(USER);
          }
          deniedRequests++;
          throw new Error('Denied synthetic auth request');
        },
      },
    });
    ownedClients.add(client);
    return client;
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, options: RequestInit = {}) => {
    if (
      input !== '/api/hismia/auth/me' ||
      (options.method ?? 'GET') !== 'GET' ||
      options.cache !== 'no-store' ||
      new Headers(options.headers).get('Authorization') !== `Bearer ${SESSION.access_token}`
    ) {
      deniedRequests++;
      throw new Error('Denied synthetic API request');
    }
    const probe = probing;
    if (probe) probeGateRequests++;
    else {
      pageGateRequests++;
      record('page-gate-requested');
      // Only HTTP timing is controlled, never SDK initialization/events/timers.
      await releaseGate.promise;
    }
    const response = json({ sub: USER.id, email: USER.email, role: 'authenticated' });
    const decode = response.json.bind(response);
    response.json = async () => {
      const body: unknown = await decode();
      record(probe ? 'probe-gate-decoded' : 'page-gate-decoded');
      if (!probe) decodedGate.resolve();
      return body;
    };
    return response;
  });

  const loginClient = makeClient();
  const login = await loginClient.auth.signInWithPassword({
    email: USER.email,
    password: 'synthetic-password',
  });
  expect(login.error === null).toBe(true);
  expect(login.data.session?.user.id === USER.id).toBe(true);
  expect(storage.has(storageKey)).toBe(true); // Written ONLY by the genuine SDK.
  record('login-persisted');
  await closeClient(loginClient); // No logout/removal: emulate leaving the old document.
  record('login-client-disposed');

  let restored: SupabaseClient | undefined;
  binding.factory.mockImplementation(() => {
    restored = makeClient(); // Called by the real page effect, not test setup.
    record('effect-client-created');
    subscriptions.push(
      restored.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          restoredSessionValid =
            session?.user.id === USER.id &&
            session.access_token === SESSION.access_token &&
            Boolean(session.user.email_confirmed_at) &&
            (session.expires_at ?? 0) > Date.now() / 1000;
          record('restore-SIGNED_IN');
        } else if (event === 'INITIAL_SESSION') record('restore-INITIAL_SESSION');
        else record('other-auth-event');
      }).data.subscription,
    );
    return restored;
  });
  render(<Onboarding />);
  await waitFor(() => expect(pageGateRequests).toBe(1), { onTimeout: (error) => error });
  expect(binding.factory.mock.calls.length).toBe(1);
  expect(restoredSessionValid).toBe(true);
  expect(events.indexOf('restore-SIGNED_IN')).toBeLessThan(events.indexOf('page-gate-requested'));
  await act(async () => {
    releaseGate.resolve();
    await decodedGate.promise;
  });

  // A separate real checkedAccount probe proves the exact restored SDK session
  // and identical synthetic API contract are valid, without mocking the page gate.
  probing = true;
  const probe = await checkedAccount(restored!.auth);
  expect(probe.kind === 'ready').toBe(true);
  record('probe-gate-ready');
  const session = await restored!.auth.getSession();
  expect(session.error === null && session.data.session?.user.id === USER.id).toBe(true);
  expect(pageGateRequests).toBe(1);
  expect(probeGateRequests).toBe(1);
  expect(deniedRequests).toBe(0);
  const readyForm = screen.queryByRole('button', { name: 'Guardar perfil' });
  report = {
    restoredSessionValid,
    probeReady: probe.kind === 'ready',
    pageGateDecoded: events.includes('page-gate-decoded'),
    readyFormPresent: Boolean(readyForm),
    loginRequiredPresent: Boolean(screen.queryByRole('link', { name: /inicia sesión/i })),
  };
  // Expected behavior, deliberately not an assertion that the broken login state is correct.
  // Boolean assertion avoids Testing Library's potentially sensitive DOM failure dumps.
  expect(Boolean(readyForm)).toBe(true);
});
