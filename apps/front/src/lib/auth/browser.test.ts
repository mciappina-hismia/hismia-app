import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockReset().mockReturnValue({ auth: {} });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-synthetic');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('public browser Auth client', () => {
  it.each([
    '',
    'https://',
    'https://bad host',
    'https://example.test/other?x=1',
    'http://example.test',
  ])('refuses malformed URL %s', async (url) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
  it('refuses empty key (clears env)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('accepts a JWT anon key (legacy Supabase format)', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.synthetic',
    );
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).not.toBeNull();
  });
  it('fails closed if the SDK initializer throws', async () => {
    createClient.mockImplementation(() => {
      throw new Error('synthetic SDK failure');
    });
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).toBeNull();
  });
  it('does not instantiate during server rendering', async () => {
    vi.stubGlobal('window', undefined);
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
  it('scrubs code, provider errors, fragments and unsafe return destinations without reading them as navigation', async () => {
    window.history.replaceState(
      null,
      '',
      '/auth/confirm?code=one&error=synthetic&next=https://elsewhere.test#access_token=synthetic',
    );
    const { cleanCallbackUrl } = await import('./browser');
    expect(cleanCallbackUrl()).toBe('one');
    expect(window.location.pathname).toBe('/auth/confirm');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });
  it('creates one PKCE client with explicit callback exchange', async () => {
    const { browserAuth } = await import('./browser');
    expect(browserAuth()).toBe(browserAuth());
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith('https://example.test', 'anon-key-synthetic', {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  });
  it.each([
    [{ user: { email_confirmed_at: '2026-01-01' } }, null, true],
    [{ user: { email_confirmed_at: null } }, null, false],
    [{ user: { email_confirmed_at: '2026-01-01' } }, { message: 'synthetic' }, false],
  ])(
    'uses fresh getUser confirmation rather than a session user',
    async (data, error, expected) => {
      const { confirmedUser } = await import('./browser');
      const getUser = vi.fn().mockResolvedValue({ data, error });
      expect(await confirmedUser({ auth: { getUser } } as never)).toBe(expected);
      expect(getUser).toHaveBeenCalledOnce();
    },
  );
});
