import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilesService } from './profiles.service';

const patient = {
  accountType: 'patient' as const,
  displayName: 'Synthetic Patient',
  birthDate: '2008-02-29',
  residenceLocality: 'Synthetic City',
};
const professional = {
  accountType: 'professional' as const,
  displayName: 'Synthetic Professional',
  specialty: 'Synthetic specialty',
  practiceLocality: 'Synthetic City',
};
const institution = {
  accountType: 'institution' as const,
  name: 'Synthetic',
  type: 'Test',
  location: 'Test',
};
const persisted = {
  ...professional,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};
const setup = () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
  const repository = { createOrRead: vi.fn().mockResolvedValue(persisted) };
  return { repository, service: new ProfilesService(repository) };
};
afterEach(() => vi.useRealTimers());

describe('profile onboarding', () => {
  it('returns the original persisted contract and derives subject separately', async () => {
    const { service, repository } = setup();
    expect(
      await service.onboard('confirmed-subject', { ...professional, displayName: 'Changed' }),
    ).toEqual(persisted);
    expect(repository.createOrRead).toHaveBeenCalledWith('confirmed-subject', {
      ...professional,
      displayName: 'Changed',
    });
  });
  it.each([
    [],
    null,
    { ...patient, subject: 'other' },
    { ...professional, admin: true },
    { ...institution, verified: true },
    { ...professional, accountType: 'admin' },
    { ...patient, birthDate: '2008-02-29\n' },
    { ...patient, birthDate: '2008-02-30' },
    { ...professional, extra: true },
  ])('rejects invalid or authority-bearing input %j', async (input) => {
    const { service, repository } = setup();
    await expect(service.onboard('subject', input)).rejects.toMatchObject({
      response: { code: 'PROFILE_INVALID' },
    });
    expect(repository.createOrRead).not.toHaveBeenCalled();
  });
  it.each([patient, professional, institution])(
    'accepts the strict $accountType variant',
    async (input) => {
      const { service, repository } = setup();
      repository.createOrRead.mockResolvedValue({
        ...input,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
      });
      await expect(service.onboard('subject', input)).resolves.toMatchObject(input);
    },
  );
  it('uses UTC and the March-1 leap birthday boundary', async () => {
    const { service, repository } = setup();
    vi.setSystemTime(new Date('2026-02-28T23:59:59.999Z'));
    await expect(service.onboard('subject', patient)).rejects.toMatchObject({
      response: { code: 'PROFILE_INVALID' },
    });
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    repository.createOrRead.mockResolvedValue({
      ...patient,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    });
    await expect(service.onboard('subject', patient)).resolves.toMatchObject(patient);
    await expect(
      service.onboard('subject', { ...patient, birthDate: '2008-03-02' }),
    ).rejects.toMatchObject({ response: { code: 'PROFILE_INVALID' } });
  });
  it('rejects a different established type', async () => {
    const { service } = setup();
    await expect(service.onboard('subject', patient)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_TYPE_IMMUTABLE' },
    });
  });
  it('hides storage errors', async () => {
    const { service, repository } = setup();
    repository.createOrRead.mockRejectedValue(new Error('secret database details'));
    await expect(service.onboard('subject', professional)).rejects.toMatchObject({
      response: { code: 'PROFILE_STORAGE_UNAVAILABLE' },
    });
  });
});
