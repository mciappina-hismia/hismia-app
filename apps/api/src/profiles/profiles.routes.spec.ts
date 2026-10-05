import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { AuthError } from '../auth/auth.types';
import { PROFILE_REPOSITORY } from './profiles.repository';
const input = { accountType: 'institution', name: 'Synthetic', type: 'Test', location: 'Test' };
const persisted = {
  ...input,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('onboarding routes', () => {
  let app: NestFastifyApplication;
  const createOrRead = vi.fn();
  const authenticate = vi.fn();
  beforeEach(async () => {
    process.env.APP_CONFIG_SKIP_INIT = '1';
    process.env.SUPABASE_PROJECT_URL = 'https://example.test';
    process.env.SUPABASE_JWKS_URL = 'https://example.test/.well-known/jwks.json';
    process.env.SUPABASE_ISSUER = 'https://example.test/auth/v1';
    process.env.SUPABASE_AUDIENCE = 'authenticated';
    process.env.SUPABASE_ANON_KEY = 'anon';
    createOrRead.mockReset().mockResolvedValue(persisted);
    authenticate.mockReset().mockResolvedValue({
      sub: 'confirmed-subject',
      email: 'synthetic@example.test',
      role: 'authenticated',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ authenticate })
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue({ createOrRead })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => {
    await app.close();
  });
  const post = () =>
    request(app.getHttpServer())
      .post('/profiles/onboarding')
      .set('Authorization', 'Bearer synthetic');
  it('returns 200 and the original profile for creation and retry', async () => {
    expect((await post().send(input).expect(200)).body).toEqual(persisted);
    expect(
      (
        await post()
          .send({ ...input, name: 'Changed' })
          .expect(200)
      ).body,
    ).toEqual(persisted);
    expect(createOrRead).toHaveBeenCalledWith('confirmed-subject', input);
  });
  it('rejects authority fields', async () => {
    expect(
      (
        await post()
          .send({ ...input, subject: 'other' })
          .expect(400)
      ).body.code,
    ).toBe('PROFILE_INVALID');
    expect(createOrRead).not.toHaveBeenCalled();
  });
  it('returns a type conflict', async () => {
    createOrRead.mockResolvedValue({ accountType: 'professional' });
    expect((await post().send(input).expect(409)).body.code).toBe('ACCOUNT_TYPE_IMMUTABLE');
  });
  it('returns sanitized 503 on unavailable storage', async () => {
    createOrRead.mockRejectedValue(new Error('private SQL details'));
    const result = await post().send(input).expect(503);
    expect(result.body.code).toBe('PROFILE_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(result.body)).not.toContain('SQL');
  });
  it('requires confirmed guard identity before persistence', async () => {
    authenticate.mockRejectedValue(new AuthError('NOT_CONFIRMED', 'Synthetic denial'));
    await post().send(input).expect(401);
    await request(app.getHttpServer()).post('/profiles/onboarding').send(input).expect(401);
    expect(createOrRead).not.toHaveBeenCalled();
  });
});
