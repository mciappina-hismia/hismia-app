import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { accountProfileSchema } from '@hismia/validation';
import type { AccountProfileInput, PersistedProfile } from '@hismia/types';
import { PROFILE_REPOSITORY, type ProfilesRepository } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(@Inject(PROFILE_REPOSITORY) private readonly repository: ProfilesRepository) {}

  async onboard(subject: string, input: unknown): Promise<PersistedProfile> {
    const parsed = accountProfileSchema(new Date().toISOString().slice(0, 10)).safeParse(input);
    // The shared calendar parser's $ anchor also accepts a trailing newline.
    if (
      !parsed.success ||
      (parsed.data.accountType === 'patient' && parsed.data.birthDate.length !== 10)
    ) {
      throw new BadRequestException({ code: 'PROFILE_INVALID', message: 'Invalid profile' });
    }
    // Zod's optional fields include undefined; the shared contract uses exact optional properties.
    const data = parsed.data;
    const profile: AccountProfileInput =
      data.accountType === 'patient'
        ? {
            accountType: 'patient',
            displayName: data.displayName,
            birthDate: data.birthDate,
            residenceLocality: data.residenceLocality,
            ...(data.gender === undefined ? {} : { gender: data.gender }),
          }
        : data;
    let persisted: PersistedProfile;
    try {
      persisted = await this.repository.createOrRead(subject, profile);
    } catch {
      throw new ServiceUnavailableException({
        code: 'PROFILE_STORAGE_UNAVAILABLE',
        message: 'Profile storage unavailable',
      });
    }
    if (persisted.accountType !== parsed.data.accountType) {
      throw new ConflictException({
        code: 'ACCOUNT_TYPE_IMMUTABLE',
        message: 'Account type is immutable',
      });
    }
    return persisted;
  }
}
