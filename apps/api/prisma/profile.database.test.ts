import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, Prisma, type Profile } from '@prisma/client';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaProfilesRepository } from '../src/profiles/prisma-profiles.repository';
import type { AccountProfileInput } from '@hismia/types';

// Fail rather than silently skip when run without the dedicated cluster harness.
const api = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const base = join(api, 'node_modules/.cache/pg');
const root = process.env.PROFILE_TEST_ROOT;
if (!root || dirname(root) !== base || !/^[a-f0-9]{8}$/.test(root.slice(base.length + 1)))
  throw new Error('Harness-owned cluster required');
let parent = root;
while (parent !== api) {
  if (lstatSync(parent).isSymbolicLink()) throw new Error('Symlink test target refused');
  parent = dirname(parent);
}
if (realpathSync(root) !== root) throw new Error('Noncanonical cluster root');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  root: string;
  data: string;
  socket: string;
  database: string;
};
if (
  manifest.root !== root ||
  manifest.data !== join(root, 'd') ||
  manifest.socket !== join(root, 's') ||
  manifest.database !== 'profile_test'
)
  throw new Error('Invalid harness manifest');
const confinedUrl = (name: string, role: string) => {
  const value = process.env[name];
  if (!value) throw new Error('Explicit test URL required');
  const url = new URL(value);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== 'localhost' ||
    url.port !== '5432' ||
    url.pathname !== '/profile_test' ||
    url.username !== role ||
    !url.password ||
    url.searchParams.get('host') !== manifest.socket ||
    url.searchParams.get('connection_limit') !== '1' ||
    [...url.searchParams.keys()].some((key) => !['host', 'connection_limit'].includes(key))
  )
    throw new Error('Unconfined test URL refused');
  return value;
};
const runtimeUrl = confinedUrl('PROFILE_TEST_RUNTIME_URL', 'profile_login');
const ownerUrl = confinedUrl('PROFILE_TEST_OWNER_URL', 'profile_owner');
const client = (url: string) => new PrismaClient({ datasources: { db: { url } } });
const runtime = client(runtimeUrl);
const contender = client(runtimeUrl);
const observer = client(runtimeUrl);
// Owner connection is exclusively for catalog/schema/role assertions below.
const owner = client(ownerUrl);
const repository = new PrismaProfilesRepository(() => runtime);
const retryRepository = new PrismaProfilesRepository(() => contender);
const professional: AccountProfileInput = {
  accountType: 'professional',
  displayName: 'Original synthetic',
  specialty: 'Test',
  practiceLocality: 'Test',
};
const institution: AccountProfileInput = {
  accountType: 'institution',
  name: 'Synthetic',
  type: 'Test',
  location: 'Test',
};
const context = (tx: Prisma.TransactionClient, subject: string) =>
  tx.$queryRaw`SELECT set_config('hismia.subject', ${subject}, true)`;
const insertProfessional = (tx: Prisma.TransactionClient, subject: string) => tx.$executeRaw`
  INSERT INTO profile_private.profiles (subject, "accountType", "displayName", specialty, "practiceLocality")
  VALUES (${subject}, 'professional', 'Original synthetic', 'Test', 'Test')`;
const ownTransaction = <T>(subject: string, action: (tx: Prisma.TransactionClient) => Promise<T>) =>
  runtime.$transaction(
    async (tx) => {
      await context(tx, subject);
      return action(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
const ownRows = (tx: Prisma.TransactionClient) =>
  tx.$queryRaw<Profile[]>`SELECT * FROM profile_private.profiles`;
afterAll(async () => {
  await Promise.all([runtime, contender, observer, owner].map((db) => db.$disconnect()));
});

// No default API tests import this file. All behavior queries use restricted runtime credentials.
describe('real PostgreSQL profiles', () => {
  it('has a private scalar table, FORCE RLS and effective restricted role privileges', async () => {
    const tables = await owner.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owns: boolean }[]
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
        c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'profile_login') AS owns
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'profile_private' AND c.relkind = 'r'`;
    expect(tables).toEqual([
      { relname: 'profiles', relrowsecurity: true, relforcerowsecurity: true, owns: false },
    ]);
    const roles = await owner.$queryRaw<
      {
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolcanlogin: boolean;
      }[]
    >`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles
      WHERE rolname IN ('profile_login', 'hismia_profile_runtime') ORDER BY rolname`;
    expect(roles).toEqual([
      {
        rolname: 'hismia_profile_runtime',
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolcanlogin: false,
      },
      {
        rolname: 'profile_login',
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolcanlogin: true,
      },
    ]);
    const privileges = await owner.$queryRaw<Record<string, boolean>[]>`
      SELECT has_database_privilege('profile_login', current_database(), 'CONNECT') AS connect,
        has_database_privilege('profile_login', current_database(), 'TEMP') AS temp,
        has_database_privilege('profile_login', current_database(), 'CREATE') AS database_create,
        has_schema_privilege('profile_login', 'profile_private', 'USAGE') AS usage,
        has_schema_privilege('profile_login', 'profile_private', 'CREATE') AS schema_create,
        has_type_privilege('profile_login', 'profile_private."AccountType"', 'USAGE') AS type_usage,
        has_table_privilege('profile_login', 'profile_private.profiles', 'SELECT') AS read,
        has_table_privilege('profile_login', 'profile_private.profiles', 'INSERT') AS insert,
        has_table_privilege('profile_login', 'profile_private.profiles', 'UPDATE') AS update,
        has_table_privilege('profile_login', 'profile_private.profiles', 'DELETE') AS delete,
        has_table_privilege('profile_login', 'profile_private.profiles', 'TRUNCATE') AS truncate,
        pg_has_role('profile_login', 'profile_owner', 'MEMBER') AS owner_membership`;
    expect(privileges).toEqual([
      {
        connect: true,
        // Fresh PostgreSQL defaults inherit PUBLIC TEMP; migration must preserve it.
        temp: true,
        database_create: false,
        usage: true,
        schema_create: false,
        type_usage: true,
        read: true,
        insert: true,
        update: false,
        delete: false,
        truncate: false,
        owner_membership: false,
      },
    ]);
    const columns = await owner.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'profile_private' AND table_name = 'profiles' ORDER BY ordinal_position`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'subject',
      'accountType',
      'displayName',
      'birthDate',
      'gender',
      'residenceLocality',
      'specialty',
      'practiceLocality',
      'name',
      'type',
      'location',
      'createdAt',
      'updatedAt',
    ]);
    expect(columns.find((column) => column.column_name === 'subject')?.data_type).toBe('text');
    expect(columns.find((column) => column.column_name === 'birthDate')?.data_type).toBe('date');
  });

  it('fails closed for absent/empty context and denies cross-subject insert/select', async () => {
    const pristine = client(runtimeUrl);
    try {
      const setting = await pristine.$queryRaw<{ subject: string | null }[]>`
        SELECT current_setting('hismia.subject', true) AS subject`;
      expect(setting).toEqual([{ subject: null }]);
      expect(await ownRows(pristine)).toEqual([]);
      await expect(insertProfessional(pristine, randomUUID())).rejects.toThrow();
    } finally {
      await pristine.$disconnect();
    }
    const subject = randomUUID();
    await repository.createOrRead(subject, professional);
    expect(await ownRows(runtime)).toEqual([]);
    await expect(insertProfessional(runtime, randomUUID())).rejects.toThrow();
    expect(await ownTransaction('', ownRows)).toEqual([]);
    await expect(
      ownTransaction('', (tx) => insertProfessional(tx, randomUUID())),
    ).rejects.toThrow();
    const other = randomUUID();
    expect(await ownTransaction(other, ownRows)).toEqual([]);
    await expect(ownTransaction(other, (tx) => insertProfessional(tx, subject))).rejects.toThrow();
    expect((await ownTransaction(subject, ownRows)).map((row) => row.subject)).toEqual([subject]);
  });

  it('preserves all three persisted variants and never overwrites retries', async () => {
    for (const input of [
      professional,
      institution,
      {
        accountType: 'patient' as const,
        displayName: 'Synthetic',
        birthDate: '2000-02-29',
        gender: 'prefiero no informar' as const,
        residenceLocality: 'Test',
      },
    ]) {
      const subject = randomUUID();
      const first = await repository.createOrRead(subject, input);
      const retry = await repository.createOrRead(
        subject,
        input.accountType === 'institution'
          ? { ...input, name: 'Changed' }
          : { ...input, displayName: 'Changed' },
      );
      expect(retry).toEqual(first);
      expect(first).toMatchObject(input);
      expect(
        await repository.createOrRead(
          subject,
          input.accountType === 'institution' ? professional : institution,
        ),
      ).toEqual(first);
    }
  });

  it('rejects NULL-required variants, cross-variant fields, blanks and undocumented gender', async () => {
    const invalid = [
      Prisma.sql`('patient', NULL, DATE '2000-01-01', NULL, 'Test', NULL, NULL, NULL, NULL, NULL)`,
      Prisma.sql`('patient', 'Test', NULL, NULL, 'Test', NULL, NULL, NULL, NULL, NULL)`,
      Prisma.sql`('patient', 'Test', DATE '2000-01-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      Prisma.sql`('professional', 'Test', NULL, NULL, NULL, NULL, 'Test', NULL, NULL, NULL)`,
      Prisma.sql`('professional', 'Test', NULL, NULL, NULL, 'Test', NULL, NULL, NULL, NULL)`,
      Prisma.sql`('professional', NULL, NULL, NULL, NULL, 'Test', 'Test', NULL, NULL, NULL)`,
      Prisma.sql`('institution', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Test', 'Test')`,
      Prisma.sql`('institution', NULL, NULL, NULL, NULL, NULL, NULL, 'Test', NULL, 'Test')`,
      Prisma.sql`('institution', NULL, NULL, NULL, NULL, NULL, NULL, 'Test', 'Test', NULL)`,
      Prisma.sql`('professional', 'Test', DATE '2000-01-01', NULL, NULL, 'Test', 'Test', NULL, NULL, NULL)`,
      Prisma.sql`('institution', 'Wrong', NULL, NULL, NULL, NULL, NULL, 'Test', 'Test', 'Test')`,
      Prisma.sql`('professional', ' \t\n', NULL, NULL, NULL, 'Test', 'Test', NULL, NULL, NULL)`,
      Prisma.sql`('patient', 'Test', DATE '2000-01-01', 'undocumented', 'Test', NULL, NULL, NULL, NULL, NULL)`,
      Prisma.sql`('admin', NULL, NULL, NULL, NULL, NULL, NULL, 'Test', 'Test', 'Test')`,
    ];
    for (const values of invalid) {
      const subject = randomUUID();
      await expect(
        ownTransaction(subject, (tx) =>
          tx.$executeRaw(Prisma.sql`
        INSERT INTO profile_private.profiles
        (subject, "accountType", "displayName", "birthDate", gender, "residenceLocality", specialty, "practiceLocality", name, type, location)
        SELECT ${subject}, v.a::profile_private."AccountType", v.b, v.c::date, v.d, v.e, v.f, v.g, v.h, v.i, v.j
        FROM (VALUES ${values}) AS v(a,b,c,d,e,f,g,h,i,j)`),
        ),
      ).rejects.toMatchObject({
        meta: {
          code:
            values.values.length === 0 && values.strings.join('').includes("'admin'")
              ? '22P02'
              : '23514',
        },
      });
    }
  });

  it('denies profile UPDATE/DELETE/TRUNCATE and private-schema DDL', async () => {
    const subject = randomUUID();
    await repository.createOrRead(subject, professional);
    const statements = [
      Prisma.sql`UPDATE profile_private.profiles SET "displayName" = 'Changed' WHERE subject = ${subject}`,
      Prisma.sql`DELETE FROM profile_private.profiles WHERE subject = ${subject}`,
      Prisma.sql`TRUNCATE profile_private.profiles`,
      Prisma.sql`ALTER TABLE profile_private.profiles ADD COLUMN forbidden text`,
      Prisma.sql`CREATE TABLE profile_private.forbidden (id text)`,
    ];
    for (const statement of statements)
      await expect(ownTransaction(subject, (tx) => tx.$executeRaw(statement))).rejects.toThrow();
    expect(await repository.createOrRead(subject, professional)).toMatchObject(professional);
  });

  it('clears transaction-local context after commit and rollback on the same pool connection', async () => {
    const before = await runtime.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await ownTransaction(randomUUID(), async (tx) => {
      expect(
        (
          await tx.$queryRaw<
            { value: string }[]
          >`SELECT current_setting('hismia.subject', true) AS value`
        )[0]?.value,
      ).toBeTruthy();
    });
    const rollbackSubject = randomUUID();
    await expect(
      ownTransaction(rollbackSubject, async (tx) => {
        await insertProfessional(tx, rollbackSubject);
        throw new Error('synthetic rollback');
      }),
    ).rejects.toThrow('synthetic rollback');
    const after = await runtime.$queryRaw<
      { pid: number; value: string | null }[]
    >`SELECT pg_backend_pid() AS pid, NULLIF(current_setting('hismia.subject', true), '') AS value`;
    expect(after[0]?.pid).toBe(before[0]?.pid);
    expect(after[0]?.value).toBeNull();
    expect(await ownTransaction(rollbackSubject, ownRows)).toEqual([]);
  });

  it.each([
    ['same-type commit', professional, false],
    ['different-type commit', institution, false],
    ['same-type rollback', professional, true],
    ['different-type rollback', institution, true],
  ] as const)(
    'synchronizes a blocked contender with a winning %s',
    async (_name, input, rollback) => {
      const subject = randomUUID();
      let release!: () => void;
      let inserted!: () => void;
      const gate = new Promise<void>((resolveGate) => {
        release = resolveGate;
      });
      const ready = new Promise<void>((resolveReady) => {
        inserted = resolveReady;
      });
      const winner = ownTransaction(subject, async (tx) => {
        await insertProfessional(tx, subject);
        inserted();
        await gate;
        if (rollback) throw new Error('synthetic winner rollback');
      }).then(
        () => 'commit',
        () => 'rollback',
      );
      await ready;
      const second = retryRepository.createOrRead(subject, input);
      // Observe actual unique-key blocking before releasing the winner, not a timing sleep race.
      try {
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (Date.now() < deadline && !blocked) {
          const locks = await observer.$queryRaw<{ blocked: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE usename = current_user AND wait_event = 'transactionid') AS blocked`;
          blocked = locks[0]?.blocked ?? false;
          if (!blocked) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      expect(await winner).toBe(rollback ? 'rollback' : 'commit');
      const persisted = await second;
      expect(persisted).toMatchObject(rollback ? input : professional);
      expect(await retryRepository.createOrRead(subject, input)).toEqual(persisted);
    },
  );
});
