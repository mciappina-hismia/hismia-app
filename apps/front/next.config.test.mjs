import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

async function config(origin) {
  const previous = process.env.HISMIA_API_ORIGIN;
  if (origin === undefined) delete process.env.HISMIA_API_ORIGIN;
  else process.env.HISMIA_API_ORIGIN = origin;
  try {
    return (await import(`./next.config.mjs?case=${encodeURIComponent(origin ?? 'default')}`))
      .default;
  } finally {
    if (previous === undefined) delete process.env.HISMIA_API_ORIGIN;
    else process.env.HISMIA_API_ORIGIN = previous;
  }
}

describe('restricted API proxy', () => {
  it('rewrites only the two fixed same-origin routes with local default', async () => {
    const rules = await (await config(undefined)).rewrites();
    assert.deepEqual(rules, [
      { source: '/api/hismia/auth/me', destination: 'http://127.0.0.1:3001/auth/me' },
      {
        source: '/api/hismia/profiles/onboarding',
        destination: 'http://127.0.0.1:3001/profiles/onboarding',
      },
    ]);
  });
  it('allows HTTPS remotely and HTTP only on exact loopback hosts', async () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      assert.equal(
        (await (await config(`http://${host}:3001`)).rewrites())[0].destination,
        `http://${host}:3001/auth/me`,
      );
    }
    for (const host of ['api.example.test', 'localhost.evil.test', '127.0.0.2', '[::2]']) {
      await assert.rejects(() => config(`http://${host}:3001`), /HISMIA_API_ORIGIN/);
    }
  });
  it('accepts a fixed HTTPS host and rejects unsafe origins', async () => {
    assert.equal(
      (await (await config('https://api.example.test')).rewrites())[0].destination,
      'https://api.example.test/auth/me',
    );
    for (const unsafe of [
      'https://user:pass@api.example.test',
      'https://api.example.test/path',
      'https://api.example.test/?x=1',
      'https://api.example.test/#x',
      'file:///etc/passwd',
      'http://api.example.test\\@evil.test',
    ]) {
      await assert.rejects(() => config(unsafe), /HISMIA_API_ORIGIN/);
    }
  });
});
