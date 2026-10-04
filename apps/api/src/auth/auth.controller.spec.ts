import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthenticatedUser } from './auth.types';

describe('AuthController', () => {
  it('projects only public identity fields', () => {
    const controller = new AuthController();
    const user = {
      sub: 'subject',
      email: 'a@example.test',
      role: 'authenticated',
      confirmedEmail: true,
      appMetadata: { role: 'admin' },
      rawClaims: {
        sub: 'subject',
        email: 'a@example.test',
        role: 'authenticated',
        aud: 'authenticated',
        iss: 'https://example.test',
        exp: 100,
        iat: 1,
        user_metadata: { secret: true },
      },
    } satisfies AuthenticatedUser;
    expect(controller.me(user)).toEqual({
      sub: 'subject',
      email: 'a@example.test',
      role: 'authenticated',
      appMetadata: { role: 'admin' },
    });
  });
});
