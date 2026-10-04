import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrismaProfilesRepository } from './prisma-profiles.repository';
const input = {
  accountType: 'professional' as const,
  displayName: 'New',
  specialty: 'Test',
  practiceLocality: 'Test',
};
const row = {
  subject: 'subject',
  accountType: 'professional',
  displayName: 'Original',
  specialty: 'Test',
  practiceLocality: 'Test',
  birthDate: null,
  gender: null,
  residenceLocality: null,
  name: null,
  type: null,
  location: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('Prisma profile transaction', () => {
  it('limits migration permissions to new private objects and preserves isolation invariants', () => {
    const sql = readFileSync('prisma/migrations/20260717000000_profiles/migration.sql', 'utf8');
    expect(sql).not.toMatch(/REVOKE\s+[^;]*\bON\s+DATABASE\b/i);
    expect(sql).not.toMatch(/REVOKE\s+[^;]*\bON\s+SCHEMA\s+public\b/i);
    expect(sql).toMatch(
      /CREATE ROLE hismia_profile_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE\s+NOREPLICATION NOBYPASSRLS/,
    );
    expect(sql).not.toMatch(/ALTER\s+[^;]*\bOWNER\s+TO\s+hismia_profile_runtime/i);
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bTO\s+hismia_profile_runtime\s+WITH\s+ADMIN/i);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain("USING (subject = NULLIF(current_setting('hismia.subject', true), ''))");
    expect(sql).toContain(
      "WITH CHECK (subject = NULLIF(current_setting('hismia.subject', true), ''))",
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE profile_private.profiles TO hismia_profile_runtime',
    );
  });
  it('binds local context, inserts without overwrite, then separately reads under READ COMMITTED', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ set_config: 'subject' }])
        .mockResolvedValueOnce([row]),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const client = { $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)) };
    const repository = new PrismaProfilesRepository(() => client as never);
    const result = await repository.createOrRead('subject', input);
    expect(result).toEqual({
      ...input,
      displayName: 'Original',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    expect(result).not.toHaveProperty('subject');
    expect(client.$transaction.mock.calls[0]?.[1]).toMatchObject({
      isolationLevel: 'ReadCommitted',
    });
    expect(tx.$queryRaw.mock.calls[0]?.[0].join('?')).toContain(
      "set_config('hismia.subject', ?, true)",
    );
    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe('subject');
    expect(tx.$executeRaw.mock.calls[0]?.[0].join('?')).toContain(
      'ON CONFLICT (subject) DO NOTHING',
    );
    expect(tx.$queryRaw.mock.calls[1]?.[0].join('?')).toContain('WHERE subject = ?');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.$queryRaw.mock.invocationCallOrder[0]!,
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeGreaterThan(
      tx.$executeRaw.mock.invocationCallOrder[0]!,
    );
  });
  it.each([
    undefined,
    'not-a-url',
    'https://synthetic.example.test/profile',
    'postgresql://localhost/profile',
  ])(
    'fails closed for missing/invalid database URL %s, without opening a connection',
    async (value) => {
      const old = process.env.DATABASE_URL;
      if (value === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = value;
      try {
        await expect(
          new PrismaProfilesRepository().createOrRead('subject', input),
        ).rejects.toThrow();
      } finally {
        if (old !== undefined) process.env.DATABASE_URL = old;
        else delete process.env.DATABASE_URL;
      }
    },
  );
});
