// Read-only database probe extracted from the former
// `apps/api/scripts/private-runtime.mjs`.
//
// Security model: the probe is the only piece of code that exercises the
// canonical `hismia_api` role on Supabase before Nest's listener binds
// the public port. It runs a single read-only transaction that asserts
// the database identity, the role attributes (no superuser, no RLS
// bypass, no createdb, no replication, no per-role settings), the
// private schema layout, and the visibility predicate. No rows are read
// or printed. Any pre-callback failure is mapped to a fixed allowlist of
// Prisma error codes (P1000, P1001, P1002, P1003, P1011, P1017, P2024,
// P2028) so the calling layer can present stable diagnostic labels.

export const ROLE_SAFE_SQL = `
SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r
  JOIN pg_catalog.pg_roles g ON g.rolname = 'hismia_profile_runtime'
  JOIN pg_catalog.pg_namespace n ON n.nspname = 'profile_private'
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = 'profiles' AND c.relkind = 'r'
  WHERE r.rolname = 'hismia_api'
    AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolinherit AND r.rolconfig IS NULL
    AND NOT g.rolsuper AND NOT g.rolbypassrls AND NOT g.rolcreatedb
    AND NOT g.rolcreaterole AND NOT g.rolreplication AND NOT g.rolcanlogin AND g.rolinherit AND g.rolconfig IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting settings WHERE settings.setrole IN (r.oid, g.oid))
    AND (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) = 1
    AND (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member = g.oid) = 0
    AND n.nspowner = r.oid
    AND c.relowner = r.oid
  ) AS safe
`;

const CATALOG_QUERY = `SELECT (
  current_database() = 'postgres' AND current_user = 'hismia_api' AND session_user = 'hismia_api'
  AND COALESCE(current_setting('hismia.subject', true), '') = ''
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND rolcanlogin)
  AND (${ROLE_SAFE_SQL})
) AS safe`;

const VISIBILITY_QUERY =
  'SELECT NOT EXISTS (SELECT 1 FROM profile_private.profiles LIMIT 1) AS safe';

export const TRANSACTION_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1003',
  'P1011',
  'P1017',
  'P2024',
  'P2028',
]);

export type DbProbeStage =
  | 'CHECK'
  | 'CLIENT'
  | 'TRANSACTION'
  | 'TRANSACTION_UNKNOWN'
  | 'READ_ONLY'
  | 'CATALOG'
  | 'VISIBILITY'
  | 'DISCONNECT'
  | `TRANSACTION_${string}`;

export interface QueryResult {
  safe: boolean;
}

export interface DbClient {
  $transaction<T>(
    fn: (tx: TxClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
  $disconnect(): Promise<void>;
}

export interface TxClient {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

// The Prisma generated client's $queryRawUnsafe is loosely typed; the
// helper accepts `unknown` and narrows at the call site. This keeps the
// pure-function tests free of Prisma type imports.

export interface DbProbeDeps {
  client: DbClient;
}

/**
 * Run the read-only probe. Returns `null` on success, otherwise the
 * fixed allowlist stage label that the caller can present. Mirrors the
 * semantics of the helper's `check(d, url)` function exactly.
 */
export async function probeDb(deps: DbProbeDeps): Promise<DbProbeStage | null> {
  let stage: DbProbeStage = 'CLIENT';
  try {
    stage = 'TRANSACTION';
    await deps.client.$transaction(
      async (tx) => {
        stage = 'READ_ONLY';
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
        stage = 'CATALOG';
        const catalog = (await tx.$queryRawUnsafe<QueryResult>(CATALOG_QUERY)) as unknown;
        if (!isSingleSafeTrue(catalog)) throw new StageError('CATALOG');
        stage = 'VISIBILITY';
        const visibility = (await tx.$queryRawUnsafe<QueryResult>(VISIBILITY_QUERY)) as unknown;
        if (!isSingleSafeTrue(visibility)) throw new StageError('VISIBILITY');
      },
      { maxWait: 5000, timeout: 10000 },
    );
    return null;
  } catch (error) {
    return mapFailure(stage, error);
  }
}

class StageError extends Error {
  constructor(public readonly stage: DbProbeStage) {
    super(stage);
  }
}

function isSingleSafeTrue(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const row = value[0] as { safe?: unknown } | undefined;
  return Boolean(row) && row?.safe === true;
}

// Re-export for tests; the boolean check is "exactly one row with safe === true".
export const __test__ = { isSingleSafeTrue };

function mapFailure(stage: DbProbeStage, error: unknown): DbProbeStage {
  if (stage === 'TRANSACTION') {
    let code: string | undefined;
    try {
      code = (error as { errorCode?: unknown } | null)?.errorCode as string | undefined;
    } catch {
      code = undefined;
    }
    if (typeof code !== 'string' || !TRANSACTION_CODES.has(code)) {
      try {
        code = (error as { code?: unknown } | null)?.code as string | undefined;
      } catch {
        code = undefined;
      }
    }
    return typeof code === 'string' && TRANSACTION_CODES.has(code)
      ? (`TRANSACTION_${code}` as DbProbeStage)
      : 'TRANSACTION_UNKNOWN';
  }
  return stage;
}
