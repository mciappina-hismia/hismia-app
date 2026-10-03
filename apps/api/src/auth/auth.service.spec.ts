import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { AuthService, fetchConfirmedUser, verifyAccessToken } from './auth.service';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

function setIdentityEnv(mock: string | undefined) {
  process.env.SUPABASE_PROJECT_URL = 'https://example.test';
  process.env.SUPABASE_JWKS_URL = 'https://example.test/.well-known/jwks.json';
  process.env.SUPABASE_ISSUER = 'https://example.test/auth/v1';
  process.env.SUPABASE_AUDIENCE = 'authenticated';
  delete process.env.SUPABASE_ANON_KEY;
  if (mock === undefined) delete process.env.AUTH_USE_MOCK;
  else process.env.AUTH_USE_MOCK = mock;
}

describe('identity configuration', () => {
  it('constructs the mock service without an anon key', () => {
    setIdentityEnv('true');
    expect(() => new AuthService()).not.toThrow();
  });
  it('rejects mock identity in production', () => {
    setIdentityEnv('true');
    process.env.NODE_ENV = 'production';
    expect(() => new AuthService()).toThrow(/not allowed in production/);
  });
  it.each([undefined, 'false'])('requires an anon key when mock is %s', (mock) => {
    setIdentityEnv(mock);
    expect(() => new AuthService()).toThrow(
      /SUPABASE_ANON_KEY|Missing Supabase identity configuration/,
    );
  });
});

const issuer = 'https://example.test/auth/v1';
const audience = 'authenticated';

async function fixture() {
  const key = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: 'subject', email: 'a@example.test', email_confirmed_at: '2026-01-01' } },
    error: null,
  });
  const deps = {
    jwks: async () => key.publicKey,
    supabase: { auth: { getUser } },
    issuer,
    audience,
  };
  const token = (claims: Record<string, unknown> = {}, wrongKey = false) =>
    new SignJWT({ email: 'a@example.test', role: 'authenticated', ...claims })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('subject')
      .setIssuer((claims.iss as string) ?? issuer)
      .setAudience((claims.aud as string) ?? audience)
      .setIssuedAt()
      .setExpirationTime(claims.exp === 1 ? 1 : '1h')
      .sign(wrongKey ? other.privateKey : key.privateKey);
  return { deps, token, getUser };
}

describe('API identity boundary', () => {
  it('verifies a signed authenticated token before confirmation', async () => {
    const { deps, token } = await fixture();
    expect((await verifyAccessToken(await token(), deps)).sub).toBe('subject');
  });
  it.each([
    [
      'malformed',
      async (_f: Awaited<ReturnType<typeof fixture>>): Promise<string> => 'not-a-jwt',
      'INVALID_TOKEN',
    ],
    [
      'signature',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({}, true),
      'INVALID_TOKEN',
    ],
    [
      'expired',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({ exp: 1 }),
      'EXPIRED_TOKEN',
    ],
    [
      'issuer',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({ iss: 'https://other.test' }),
      'WRONG_ISSUER',
    ],
    [
      'audience',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({ aud: 'anon' }),
      'WRONG_AUDIENCE',
    ],
    [
      'service role',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({ role: 'service_role' }),
      'INVALID_TOKEN',
    ],
    [
      'anon role',
      async (f: Awaited<ReturnType<typeof fixture>>) => f.token({ role: 'anon' }),
      'INVALID_TOKEN',
    ],
  ] as const)('rejects %s without contacting getUser', async (_name, makeToken, code) => {
    const f = await fixture();
    await expect(verifyAccessToken(await makeToken(f), f.deps)).rejects.toMatchObject({ code });
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it('rejects missing tokens before contacting Supabase', async () => {
    const f = await fixture();
    await expect(fetchConfirmedUser('', f.deps)).rejects.toMatchObject({ code: 'MISSING_TOKEN' });
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it('fails closed when confirmation lookup is unavailable', async () => {
    const f = await fixture();
    f.getUser.mockRejectedValue(new Error('network failure'));
    await expect(fetchConfirmedUser(await f.token(), f.deps)).rejects.toMatchObject({
      code: 'SUPABASE_UNREACHABLE',
    });
  });
  it('rejects unconfirmed identity', async () => {
    const f = await fixture();
    f.getUser.mockResolvedValue({
      data: { user: { id: 'subject', email: 'a@example.test', email_confirmed_at: null } },
      error: null,
    });
    await expect(fetchConfirmedUser(await f.token(), f.deps)).rejects.toMatchObject({
      code: 'NOT_CONFIRMED',
    });
  });
  it('projects confirmed identity without metadata-based authority', async () => {
    const f = await fixture();
    const claims = {
      app_metadata: { role: 'admin' },
      user_metadata: { role: 'admin', verified: true },
    };
    const user = await fetchConfirmedUser(await f.token(claims), f.deps);
    expect(user).toMatchObject({
      sub: 'subject',
      email: 'a@example.test',
      confirmedEmail: true,
      role: 'authenticated',
    });
    expect(user.rawClaims.user_metadata).toEqual(claims.user_metadata);
    expect(user.role).not.toBe('admin');
  });
});
