import type { AccountProfileInput, PersistedProfile } from '@hismia/types';

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
export interface ProfilesRepository {
  createOrRead(subject: string, input: AccountProfileInput): Promise<PersistedProfile>;
}
