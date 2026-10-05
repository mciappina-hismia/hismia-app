import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfile, verifyAccount } from './client';

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
    expect(await verifyAccount('synthetic-token')).toEqual({ kind: 'unavailable' });
    expect(await verifyAccount('synthetic-token')).toEqual({ kind: 'signin' });
    expect(await verifyAccount('synthetic-token')).toEqual({ kind: 'unavailable' });
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
    for (const [status, kind] of [
      [400, 'invalid'],
      [401, 'signin'],
      [403, 'signin'],
      [409, 'conflict'],
      [503, 'unavailable'],
    ] as const) {
      fetcher.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ message: 'secret' }),
      });
      expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({ kind });
    }
    fetcher.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...profile, createdAt: '', updatedAt: '' }),
    });
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
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
      });
    }
    fetcher.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('secret JSON');
      },
    });
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
    });
    fetcher.mockRejectedValueOnce(new Error('secret'));
    expect(await createProfile('synthetic-token', profile, '2026-03-01')).toEqual({
      kind: 'unavailable',
    });
  });
  it('never sends invalid or elevated input', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await createProfile('synthetic-token', { ...profile, role: 'admin' } as never, '2026-03-01'),
    ).toEqual({ kind: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
