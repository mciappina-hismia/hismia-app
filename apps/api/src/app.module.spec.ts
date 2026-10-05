import { afterEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PROFILE_REPOSITORY } from './profiles/profiles.repository';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

function configure(mock: string | undefined) {
  process.env.NODE_ENV = 'test';
  process.env.APP_CONFIG_SKIP_INIT = '1';
  process.env.SUPABASE_PROJECT_URL = 'https://example.test';
  process.env.SUPABASE_JWKS_URL = 'https://example.test/.well-known/jwks.json';
  process.env.SUPABASE_ISSUER = 'https://example.test/auth/v1';
  process.env.SUPABASE_AUDIENCE = 'authenticated';
  delete process.env.SUPABASE_ANON_KEY;
  if (mock === undefined) delete process.env.AUTH_USE_MOCK;
  else process.env.AUTH_USE_MOCK = mock;
}

describe('AppModule identity configuration', () => {
  it('boots with mock identity and no anon key', async () => {
    configure('true');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue({
        createOrRead: () => {
          throw new Error('No database in unit tests');
        },
      })
      .compile();
    expect(module).toBeDefined();
    await module.close();
  });
  it.each([undefined, 'false'])('fails boot without anon key when mock is %s', async (mock) => {
    configure(mock);
    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /SUPABASE_ANON_KEY|Missing Supabase identity configuration/,
    );
  });
});
