import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkedAccount, createProfile, verifyAccount } from './client';

const identity = {
  sub: 'synthetic-subject',
  email: 'synthetic@example.test',
  role: 'authenticated',
  appMetadata: {},
};
const profile = {
  accountType: 'professional',
  displayName: 'Test User',
  specialty: 'General',
  practiceLocality: 'Test City',
} as const;

beforeEach(() => vi.unstubAllGlobals());

describe('same-origin profile client', () => {
  it('checks the authoritative identity without leaking the token into URL or body', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => identity });
    vi.stubGlobal('fetch', fetcher);
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'ready',
      subject: 'synthetic-subject',
    });
    expect(fetcher).toHaveBeenCalledWith('/api/hismia/auth/me', {
      headers: { Authorization: 'Bearer synthetic-token' },
      cache: 'no-store',
    });
  });
  it('rejects malformed identities, unauthorized and network failure closed', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockRejectedValueOnce(new Error('secret'));
    vi.stubGlobal('fetch', fetcher);
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'unavailable',
      error: { category: 'contract' },
    });
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'signin',
      error: { category: 'authentication', status: 401 },
    });
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'unavailable',
      error: { category: 'unexpected' },
    });
  });
  it('sends only schema-validated profile fields and accepts an existing same-type retry', async () => {
    const existing = {
      ...profile,
      displayName: 'Existing name',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => existing });
    vi.stubGlobal('fetch', fetcher);
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'saved',
      profile: existing,
    });
    expect(fetcher).toHaveBeenCalledWith('/api/hismia/profiles/onboarding', {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
  });
  it('never accepts bogus successes and maps errors without reflecting server text', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const [status, kind, category] of [
      [400, 'invalid', 'validation'],
      [401, 'signin', 'authentication'],
      [403, 'signin', 'authentication'],
      [409, 'conflict', 'conflict'],
      [503, 'unavailable', 'transient'],
      [429, 'unavailable', 'transient'],
      [404, 'unavailable', 'unexpected'],
    ] as const) {
      fetcher.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ message: 'secret' }),
      });
      expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
        kind,
        error: { category, status },
      });
    }
    fetcher.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...profile, createdAt: '', updatedAt: '' }),
    });
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
      error: { category: 'contract' },
    });
    for (const body of [
      {
        ...profile,
        accountType: 'institution',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        ...profile,
        role: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]) {
      fetcher.mockResolvedValueOnce({ ok: true, json: async () => body });
      expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
        kind: 'unavailable',
        error: { category: 'contract' },
      });
    }
    fetcher.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('secret JSON');
      },
    });
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
      error: { category: 'decoding' },
    });
    fetcher.mockRejectedValueOnce(new TypeError('secret'));
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
      error: { category: 'transport' },
    });
  });
  it.each([
    ['verify', new TypeError('private network detail'), 'transport'],
    ['verify', new SyntaxError('private JSON detail'), 'decoding'],
    ['save', new TypeError('private network detail'), 'transport'],
    ['save', new SyntaxError('private JSON detail'), 'decoding'],
    ['save', new Error('private unexpected detail'), 'unexpected'],
  ] as const)('distinguishes %s response read errors (%s)', async (operation, error, category) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw error;
        },
      }),
    );
    const result =
      operation === 'verify'
        ? await verifyAccount('synthetic-token')
        : await createProfile('synthetic-token', profile, '2026-03-01');
    expect(result).toEqual({ kind: 'unavailable', error: { category } });
  });
  it('allowlists success fields without propagating identity metadata', async () => {
    const stored = {
      ...profile,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => stored }));
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'saved',
      profile: stored,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => identity }));
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'ready',
      subject: identity.sub,
    });
  });
  it('retains SDK transport and status categories in account orchestration', async () => {
    const auth = { getUser: vi.fn(), getSession: vi.fn() };
    auth.getUser.mockRejectedValueOnce(new TypeError('private'));
    expect(await checkedAccount(auth)).toEqual({
      kind: 'unavailable',
      error: { category: 'transport' },
    });
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 503, message: 'private' },
    });
    expect(await checkedAccount(auth)).toEqual({
      kind: 'unavailable',
      error: { category: 'transient', status: 503 },
    });
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 401, message: 'private' },
    });
    expect(await checkedAccount(auth)).toEqual({
      kind: 'signin',
      error: { category: 'authentication', status: 401 },
    });
    auth.getUser.mockResolvedValueOnce({
      data: { user: { id: identity.sub, email_confirmed_at: 'synthetic' } },
      error: null,
    });
    auth.getSession.mockRejectedValueOnce(new Error('private'));
    expect(await checkedAccount(auth)).toEqual({
      kind: 'unavailable',
      error: { category: 'unexpected' },
    });
  });
  it('keeps request rejection distinct from decoding and skips bodies on HTTP failures', async () => {
    const json = vi.fn().mockRejectedValue(new SyntaxError('private'));
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('private'))
      .mockResolvedValueOnce({ ok: false, status: 409, json });
    vi.stubGlobal('fetch', fetcher);
    expect(await verifyAccount('synthetic-token')).toEqual({
      kind: 'unavailable',
      error: { category: 'transport' },
    });
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'conflict',
      error: { category: 'conflict', status: 409 },
    });
    expect(json).not.toHaveBeenCalled();
    expect(await verifyAccount('')).toEqual({
      kind: 'signin',
      error: { category: 'authentication' },
    });
    expect(await createProfile('', profile, '2026-03-01')).toEqual({
      kind: 'signin',
      error: { category: 'authentication' },
    });
  });
  it('retains account diagnosis while checking subject equality on initial and repeat checks', async () => {
    const auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: identity.sub, email_confirmed_at: 'synthetic' } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'synthetic-token', user: { id: identity.sub } } },
        error: null,
      }),
    };
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'ready', subject: identity.sub })
      .mockResolvedValueOnce({ kind: 'ready', subject: 'different-subject' })
      .mockResolvedValueOnce({ kind: 'unavailable', error: { category: 'decoding' } });
    expect(await checkedAccount(auth, verify)).toEqual({
      kind: 'ready',
      subject: identity.sub,
      token: 'synthetic-token',
    });
    expect(await checkedAccount(auth, verify)).toEqual({
      kind: 'signin',
      error: { category: 'authentication' },
    });
    expect(await checkedAccount(auth, verify)).toEqual({
      kind: 'unavailable',
      error: { category: 'decoding' },
    });
  });
  it('never sends invalid or elevated input', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await createProfile('synthetic-token', { ...profile, role: 'admin' } as never, '2026-03-01'),
    ).toEqual({ kind: 'invalid', error: { category: 'validation' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
