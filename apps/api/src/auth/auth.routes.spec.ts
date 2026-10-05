import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { generateKeyPair, SignJWT } from 'jose';
import { AppModule } from '../app.module';
import { AuthService, fetchConfirmedUser } from './auth.service';

import { PROFILE_REPOSITORY } from '../profiles/profiles.repository';

const issuer = 'https://example.test/auth/v1';

describe('auth routes', () => {
  let app: NestFastifyApplication;
  let token: (extra?: Record<string, unknown>) => Promise<string>;
  let confirmed: boolean;
  let getUser: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.APP_CONFIG_SKIP_INIT = '1';
    process.env.SUPABASE_PROJECT_URL = 'https://example.test';
    process.env.SUPABASE_JWKS_URL = `${issuer}/.well-known/jwks.json`;
    process.env.SUPABASE_ISSUER = issuer;
    process.env.SUPABASE_AUDIENCE = 'authenticated';
    process.env.SUPABASE_ANON_KEY = 'anon';
    const keys = await generateKeyPair('ES256');
    confirmed = true;
    getUser = vi.fn().mockImplementation(async () => ({
      data: {
        user: {
          id: 'subject',
          email: 'a@example.test',
          email_confirmed_at: confirmed ? '2026-01-01' : null,
        },
      },
      error: null,
    }));
    const deps = {
      jwks: async () => keys.publicKey,
      issuer,
      audience: 'authenticated',
      supabase: { auth: { getUser } },
    };
    token = (extra = {}) =>
      new SignJWT({ email: 'a@example.test', role: 'authenticated', ...extra })
        .setProtectedHeader({ alg: 'ES256' })
        .setSubject('subject')
        .setIssuer(typeof extra.iss === 'string' ? extra.iss : issuer)
        .setAudience(typeof extra.aud === 'string' ? extra.aud : 'authenticated')
        .setIssuedAt()
        .setExpirationTime(extra.exp === 1 ? 1 : '1h')
        .sign(keys.privateKey);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ authenticate: (jwt: string) => fetchConfirmedUser(jwt, deps) })
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue({
        createOrRead: vi.fn().mockRejectedValue(new Error('Synthetic unavailable storage')),
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns only projected identity with a valid, confirmed token', async () => {
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${await token({ user_metadata: { role: 'admin' } })}`)
      .expect(200);
    expect(result.body).toEqual({ sub: 'subject', email: 'a@example.test', role: 'authenticated' });
  });
  it('keeps health public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
  it.each([undefined, 'Bearer', 'Basic abc', 'Bearer a b', 'Bearer invalid.jwt.value'])(
    'denies invalid bearer header %s',
    async (header) => {
      const req = request(app.getHttpServer()).get('/auth/me');
      if (header) req.set('Authorization', header);
      const result = await req.expect(401);
      expect(result.body.code).toBe('AUTH_DENIED');
      if (header === 'Bearer invalid.jwt.value') expect(getUser).not.toHaveBeenCalled();
    },
  );
  it('never returns 200 for unconfirmed user', async () => {
    confirmed = false;
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${await token()}`)
      .expect(401);
    expect(result.body.code).toBe('AUTH_DENIED');
    await request(app.getHttpServer())
      .post('/profiles/onboarding')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ accountType: 'institution', name: 'Synthetic', type: 'Test', location: 'Test' })
      .expect(401);
  });
  it.each([
    ['expired', { exp: 1 }],
    ['issuer', { iss: 'https://other.test' }],
    ['audience', { aud: 'anon' }],
    ['anonymous', { is_anonymous: true }],
  ])('denies %s at the route without contacting getUser', async (_name, claims) => {
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${await token(claims)}`)
      .expect(401);
    expect(result.body.code).toBe('AUTH_DENIED');
    expect(getUser).not.toHaveBeenCalled();
  });
  it.each(['anon', 'service_role'])('rejects role %s', async (role) => {
    const result = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${await token({ role })}`)
      .expect(401);
    expect(result.body.code).toBe('AUTH_DENIED');
    expect(getUser).not.toHaveBeenCalled();
  });
});
