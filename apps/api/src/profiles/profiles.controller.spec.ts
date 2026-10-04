import { describe, expect, it, vi } from 'vitest';
import { ProfilesController } from './profiles.controller';
import type { ProfilesService } from './profiles.service';

describe('ProfilesController delegation', () => {
  it('passes only the authenticated sub and input to the service', async () => {
    const original = {
      accountType: 'institution',
      name: 'Synthetic',
      type: 'Test',
      location: 'Test',
    };
    const onboard = vi.fn().mockResolvedValue(original);
    const controller = new ProfilesController({ onboard } as unknown as ProfilesService);
    expect(
      await controller.onboard(
        {
          sub: 'confirmed-subject',
          email: 'synthetic@example.test',
          role: 'authenticated',
          confirmedEmail: true,
          appMetadata: {},
          rawClaims: {
            sub: 'confirmed-subject',
            email: 'synthetic@example.test',
            role: 'authenticated',
            aud: 'authenticated',
            iss: 'https://example.test',
            exp: 1,
            iat: 0,
          },
        },
        original,
      ),
    ).toBe(original);
    expect(onboard).toHaveBeenCalledWith('confirmed-subject', original);
  });
});
