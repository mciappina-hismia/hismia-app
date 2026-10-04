import { PrismaClient, Prisma, type Profile } from '@prisma/client';
import type { AccountProfileInput, PersistedProfile, PatientGender } from '@hismia/types';
import type { OnModuleDestroy } from '@nestjs/common';
import type { ProfilesRepository } from './profiles.repository';

/** Explicit projection: never spread a database row into the public contract. */
const project = (row: Profile): PersistedProfile => {
  const timestamps = {
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.accountType === 'patient') {
    return {
      accountType: 'patient',
      displayName: row.displayName!,
      birthDate: row.birthDate!.toISOString().slice(0, 10),
      ...(row.gender === null ? {} : { gender: row.gender as PatientGender }),
      residenceLocality: row.residenceLocality!,
      ...timestamps,
    };
  }
  if (row.accountType === 'professional') {
    return {
      accountType: 'professional',
      displayName: row.displayName!,
      specialty: row.specialty!,
      practiceLocality: row.practiceLocality!,
      ...timestamps,
    };
  }
  return {
    accountType: 'institution',
    name: row.name!,
    type: row.type!,
    location: row.location!,
    ...timestamps,
  };
};

export class PrismaProfilesRepository implements ProfilesRepository, OnModuleDestroy {
  private client?: PrismaClient;
  constructor(private readonly clientFactory?: () => PrismaClient) {}

  private database(): PrismaClient {
    if (this.client) return this.client;
    if (this.clientFactory) return (this.client = this.clientFactory());
    const value = process.env.DATABASE_URL;
    if (!value) throw new Error('Profile database configuration missing');
    const url = new URL(value);
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !url.username ||
      !url.pathname.slice(1)
    ) {
      throw new Error('Invalid profile database configuration');
    }
    return (this.client = new PrismaClient({ datasources: { db: { url: value } } }));
  }

  async createOrRead(subject: string, input: AccountProfileInput): Promise<PersistedProfile> {
    const patient = input.accountType === 'patient' ? input : undefined;
    const professional = input.accountType === 'professional' ? input : undefined;
    const institution = input.accountType === 'institution' ? input : undefined;
    return this.database().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('hismia.subject', ${subject}, true)`;
        await tx.$executeRaw`
        INSERT INTO profile_private.profiles
          (subject, "accountType", "displayName", "birthDate", gender, "residenceLocality",
           specialty, "practiceLocality", name, type, location)
        VALUES (${subject}, ${input.accountType}::profile_private."AccountType",
          ${patient?.displayName ?? professional?.displayName ?? null},
          ${patient?.birthDate ?? null}::date, ${patient?.gender ?? null},
          ${patient?.residenceLocality ?? null}, ${professional?.specialty ?? null},
          ${professional?.practiceLocality ?? null}, ${institution?.name ?? null},
          ${institution?.type ?? null}, ${institution?.location ?? null})
        ON CONFLICT (subject) DO NOTHING`;
        // A new READ COMMITTED statement snapshot sees the committed unique-key winner.
        const rows = await tx.$queryRaw<Profile[]>`
        SELECT subject, "accountType", "displayName", "birthDate", gender,
          "residenceLocality", specialty, "practiceLocality", name, type, location,
          "createdAt", "updatedAt"
        FROM profile_private.profiles WHERE subject = ${subject}`;
        if (!rows[0]) throw new Error('Profile was not persisted');
        return project(rows[0]);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}
