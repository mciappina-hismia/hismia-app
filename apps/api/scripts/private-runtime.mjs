import { randomBytes, pbkdf2Sync, createHmac, createHash, X509Certificate } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const TARGET = 'hismia_api.zfpnjsbxrgbcehmefozb';
const HOST = 'aws-0-sa-east-1.pooler.supabase.com';
const QUERY =
  'sslmode=require&sslaccept=strict&connection_limit=2&connect_timeout=5&pool_timeout=5&schema=profile_private';
const CA_PIN =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
const AUTH_KEYS = [
  'SUPABASE_PROJECT_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_JWKS_URL',
  'SUPABASE_ISSUER',
  'SUPABASE_AUDIENCE',
];
const fail = () => {
  throw new Error('private runtime rejected');
};
// Categorized IO error: never includes the failing path or its content.
// Only a fixed allowlist of phases is exposed via error.code; the message is generic.
function ioFailure(phase) {
  throw Object.assign(new Error('private runtime rejected'), { code: phase });
}

export function scram(password, salt, iterations = 4096) {
  if (
    !/^[A-Za-z0-9_-]+$/.test(password) ||
    salt.length < 16 ||
    !Number.isSafeInteger(iterations) ||
    iterations < 4096 ||
    iterations > 1000000
  )
    fail();
  // Generated ASCII passwords need no SASLprep transformation.
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const client = createHmac('sha256', salted).update('Client Key').digest();
  const stored = createHash('sha256').update(client).digest('base64');
  const server = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${stored}:${server}`;
}
function canonicalCaPath(path) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path.length > 512 ||
    /[\x00-\x1f\x7f]/.test(path)
  )
    fail();
  return path;
}
export function runtimeUrl(password, ca, mode) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(password)) fail();
  if (mode !== undefined) fail();
  return `postgresql://${TARGET}:${password}@${HOST}:5432/postgres?${QUERY}${ca === undefined ? '' : `&sslcert=${encodeURIComponent(canonicalCaPath(ca))}`}`;
}
export function parseConfig(text) {
  if (typeof text !== 'string' || text.length > 1024) fail();
  const match = /^DATABASE_URL=(postgresql:\/\/[^\r\n]+)\n$/.exec(text);
  if (!match) fail();
  const url = new URL(match[1]);
  // Canonical reconstruction rejects encoding tricks, duplicates, extra parameters,
  // URL normalization, alternate ports/users/targets and dotenv/shell syntax.
  const ca = url.searchParams.has('sslcert') ? url.searchParams.get('sslcert') : undefined;
  const expected = runtimeUrl(url.password, ca);
  if (match[1] !== expected || text !== `DATABASE_URL=${match[1]}\n`) fail();
  return match[1];
}

// Shared fail-closed catalog predicate. This neither changes privileges nor reads
// application rows. PUBLIC grants outside the private schema are not revoked.
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
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
      WHERE m.member = r.oid AND m.roleid = g.oid AND NOT m.admin_option AND m.inherit_option AND m.set_option)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = g.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles other
      WHERE other.oid NOT IN (r.oid, g.oid) AND pg_catalog.pg_has_role(r.oid, other.oid, 'MEMBER'))
    AND n.nspowner NOT IN (r.oid, g.oid) AND c.relowner NOT IN (r.oid, g.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class owned WHERE owned.relowner IN (r.oid, g.oid))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace owned WHERE owned.nspowner IN (r.oid, g.oid))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database owned WHERE owned.datdba IN (r.oid, g.oid))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_type t
      WHERE t.typnamespace = n.oid AND t.typname = 'AccountType' AND t.typtype = 'e'
        AND t.typowner NOT IN (r.oid, g.oid) AND pg_catalog.has_type_privilege(r.oid, t.oid, 'USAGE')
        AND NOT pg_catalog.has_type_privilege(r.oid, t.oid, 'USAGE WITH GRANT OPTION'))
    AND pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE')
    AND NOT pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE,USAGE WITH GRANT OPTION')
    AND pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT')
    AND pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT')
    AND NOT pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE,REFERENCES'))
    AND c.relrowsecurity AND c.relforcerowsecurity
) AS safe`;

function provisionSql(verifier) {
  if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(verifier))
    fail();
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
DO $provision$
DECLARE safe boolean;
BEGIN
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'target rejected'; END IF;
  ${ROLE_SAFE_SQL} INTO safe;
  IF safe IS DISTINCT FROM true OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hismia_api' AND NOT rolcanlogin
  ) THEN RAISE EXCEPTION 'role rejected'; END IF;
  ALTER ROLE hismia_api PASSWORD '${verifier}' LOGIN;
END;
$provision$;
COMMIT;
`;
}

async function parents(d) {
  if (resolve(d.root) !== d.root) fail();
  const ancestors = [];
  for (let p = dirname(d.root); ; p = dirname(p)) {
    ancestors.push(p);
    if (dirname(p) === p) break;
  }
  for (const p of ancestors) {
    const s = await d.io.lstat(p);
    if (
      (await d.io.realpath(p)) !== p ||
      s.isSymbolicLink() ||
      !s.isDirectory() ||
      ![0, d.uid].includes(s.uid) ||
      s.mode & 0o022
    )
      fail();
  }
  for (const p of [d.root, join(d.root, 'apps'), join(d.root, 'apps/api')]) {
    const s = await d.io.lstat(p);
    if (
      (await d.io.realpath(p)) !== p ||
      s.isSymbolicLink() ||
      !s.isDirectory() ||
      s.uid !== d.uid ||
      s.mode & 0o022
    )
      fail();
  }
}
function privateStat(s, uid) {
  if (
    s.isSymbolicLink() ||
    !s.isFile() ||
    s.uid !== uid ||
    (s.mode & 0o7777) !== 0o600 ||
    s.nlink !== 1
  )
    fail();
}
async function absent(io, p) {
  try {
    await io.lstat(p);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fail();
}
async function secureWrite(d, p, content, created) {
  await parents(d);
  const h = await d.io.open(
    p,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  created.value = true;
  try {
    const opened = await h.stat();
    privateStat(opened, d.uid);
    const sameTarget = async () => {
      const named = await d.io.lstat(p);
      privateStat(named, d.uid);
      if (named.dev !== opened.dev || named.ino !== opened.ino) fail();
    };
    await sameTarget();
    await h.writeFile(content, 'utf8');
    await h.sync();
    privateStat(await h.stat(), d.uid);
    await sameTarget();
    await parents(d);
  } finally {
    await h.close();
  }
}
async function readConfig(d, p) {
  await parents(d);
  let before;
  try {
    before = await d.io.lstat(p);
  } catch (error) {
    if (error?.code === 'ENOENT') ioFailure('IO_CONFIG_MISSING');
    if (error?.code === 'EACCES' || error?.code === 'EPERM') ioFailure('IO_CONFIG_DENIED');
    throw error;
  }
  privateStat(before, d.uid);
  const h = await d.io.open(p, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await h.stat();
    privateStat(opened, d.uid);
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size > 1024) fail();
    const text = await h.readFile('utf8');
    const after = await d.io.lstat(p);
    privateStat(after, d.uid);
    if (opened.ino !== after.ino || opened.dev !== after.dev || opened.size !== after.size) fail();
    await parents(d);
    return { url: parseConfig(text), stat: after, text };
  } finally {
    await h.close();
  }
}
async function validateCa(d, path) {
  canonicalCaPath(path);
  let before;
  try {
    before = await d.io.lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') ioFailure('IO_CA_MISSING');
    if (error?.code === 'EACCES' || error?.code === 'EPERM') ioFailure('IO_CA_DENIED');
    throw error;
  }
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.uid !== d.uid ||
    before.mode & 0o022 ||
    before.size > 8192 ||
    before.size < 500 ||
    (await d.io.realpath(path)) !== path
  )
    fail();
  const h = await d.io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await h.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      fail();
    const pem = await h.readFile('utf8');
    const after = await d.io.lstat(path);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      /PRIVATE KEY/.test(pem) ||
      !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(
        pem,
      )
    )
      fail();
    const cert = d.certificate ? d.certificate(pem) : new X509Certificate(pem);
    if (
      !cert.ca ||
      cert.fingerprint256 !== CA_PIN ||
      Date.now() < Date.parse(cert.validFrom) ||
      Date.now() > Date.parse(cert.validTo)
    )
      fail();
  } finally {
    await h.close();
  }
}
async function configureCa(d, config, ca) {
  await validateCa(d, ca);
  const original = await readConfig(d, config);
  if (new URL(original.url).searchParams.has('sslcert')) fail();
  const updated = `DATABASE_URL=${runtimeUrl(new URL(original.url).password, ca)}\n`;
  if (updated.length > 1024) fail();
  const stage = `${config}.${d.random(16).toString('hex')}.stage`;
  let h;
  let identity;
  try {
    h = await d.io.open(
      stage,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    identity = await h.stat();
    privateStat(identity, d.uid);
    await h.writeFile(updated, 'utf8');
    await h.sync();
    const staged = await d.io.lstat(stage);
    privateStat(staged, d.uid);
    if (staged.dev !== identity.dev || staged.ino !== identity.ino) fail();
    const current = await readConfig(d, config);
    if (
      current.stat.dev !== original.stat.dev ||
      current.stat.ino !== original.stat.ino ||
      current.text !== original.text
    )
      fail();
    await validateCa(d, ca);
    await parents(d);
    await d.io.rename(stage, config);
    const dir = await d.io.open(
      dirname(config),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } finally {
    if (h) await h.close();
    if (identity) {
      try {
        const named = await d.io.lstat(stage);
        if (named.dev === identity.dev && named.ino === identity.ino) await d.io.unlink(stage);
      } catch {
        /* No cleanup of an unverified path. */
      }
    }
  }
}
// These exact package-runner keys describe the invocation, not runtime overrides.
// Their values are never interpreted or forwarded (see the child env allowlist).
const LIFECYCLE_METADATA = new Set(['npm_config_user_agent', 'npm_config_recursive']);
function environmentSafe(env) {
  for (const key of Object.keys(env)) {
    if (LIFECYCLE_METADATA.has(key)) continue;
    // The start child already forces development; no other Node setting is benign.
    if (key === 'NODE_ENV' && env[key] === 'development') continue;
    if (
      /^(DATABASE_|DIRECT_URL$|PG|PRISMA_|NODE_|LD_|DYLD_|npm_config_|NPM_CONFIG_|DEBUG$|RUST_|SSL_CERT_)/.test(
        key,
      )
    )
      fail();
  }
  if (env.AUTH_USE_MOCK && env.AUTH_USE_MOCK !== 'false') fail();
}
const TRANSACTION_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1003',
  'P1011',
  'P1017',
  'P2024',
  'P2028',
]);

async function check(d, url) {
  let client;
  let category = 'CLIENT';
  try {
    client = await d.client({ datasources: { db: { url } }, log: [] });
    category = 'TRANSACTION';
    await client.$transaction(
      async (tx) => {
        category = 'READ_ONLY';
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
        category = 'CATALOG';
        const catalog = await tx.$queryRawUnsafe(`SELECT (
        current_database() = 'postgres' AND current_user = 'hismia_api' AND session_user = 'hismia_api'
        AND COALESCE(current_setting('hismia.subject', true), '') = ''
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND rolcanlogin)
        AND (${ROLE_SAFE_SQL})
      ) AS safe`);
        if (catalog.length !== 1 || catalog[0].safe !== true) fail();
        category = 'VISIBILITY';
        const visibility = await tx.$queryRawUnsafe(
          'SELECT NOT EXISTS (SELECT 1 FROM profile_private.profiles LIMIT 1) AS safe',
        );
        if (visibility.length !== 1 || visibility[0].safe !== true) fail();
      },
      { maxWait: 5000, timeout: 10000 },
    );
    category = 'CHECK';
  } catch (error) {
    // Only a pre-callback rejection may carry a diagnostic code. Never stringify errors.
    if (category === 'TRANSACTION') {
      let code;
      try {
        code = error?.errorCode;
      } catch {
        // A hostile getter must not prevent checking the existing code field.
      }
      if (typeof code !== 'string' || !TRANSACTION_CODES.has(code)) {
        try {
          code = error?.code;
        } catch {
          code = undefined;
        }
      }
      category =
        typeof code === 'string' && TRANSACTION_CODES.has(code)
          ? `TRANSACTION_${code}`
          : 'TRANSACTION_UNKNOWN';
    }
  } finally {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        category = 'DISCONNECT';
      }
    }
  }
  return category === 'CHECK' ? null : category;
}

// All effects are injected; imports never generate credentials or touch config.
export async function run(args, d) {
  const mode = args[0];
  const valid =
    (mode === 'prepare' && args.length === 1) ||
    (mode === 'check' && args.length === 2 && args[1] === '--ack-remote-read-only') ||
    (mode === 'start' && args.length === 2 && args[1] === '--ack-api-listener') ||
    (mode === 'configure-ca' &&
      args.length === 3 &&
      args[1] === '--ack-ca-config' &&
      typeof args[2] === 'string' &&
      isAbsolute(args[2]) &&
      resolve(args[2]) === args[2]);
  const result = (ok, category) => {
    d.emit(`${ok ? 'PASS' : 'FAIL'} ${category}`);
    return ok ? 0 : 1;
  };
  if (!valid) return result(false, 'ARGUMENTS');
  if (mode === 'prepare' && (!d.tty.stdin || !d.tty.stdout)) return result(false, 'PRIVATE_TTY');
  const config = join(d.root, 'apps/api/.env.runtime.local');
  const sql = join(d.root, 'apps/api/.env.runtime.provision.sql');
  const created = { value: false };
  let category = mode === 'prepare' ? 'PREPARE' : 'CONFIG';
  try {
    environmentSafe(d.env);
    if (mode === 'prepare') {
      await parents(d);
      await absent(d.io, config);
      await absent(d.io, sql);
      const password = d.random(32).toString('base64url');
      const verifier = scram(password, d.random(16));
      await secureWrite(d, config, `DATABASE_URL=${runtimeUrl(password)}\n`, created);
      await secureWrite(d, sql, provisionSql(verifier), created);
      return result(true, 'PREPARED');
    }
    if (mode === 'configure-ca') {
      await configureCa(d, config, args[2]);
      return result(true, 'CA_CONFIGURED');
    }
    const { url } = await readConfig(d, config);
    const ca = new URL(url).searchParams.get('sslcert');
    if (ca) await validateCa(d, ca);
    if (mode === 'check') {
      const failure = await check(d, url);
      return result(failure === null, failure ?? 'CHECK');
    }
    category = 'API_EXIT';
    // Deliberately allowlist, rather than forward ambient process state.
    const env = { PATH: d.env.PATH, HOME: d.env.HOME, NODE_ENV: 'development', DATABASE_URL: url };
    for (const key of AUTH_KEYS) if (d.env[key]) env[key] = d.env[key];
    const apiRoot = join(d.root, 'apps/api');
    const nest = join(apiRoot, 'node_modules/.bin/nest');
    try {
      await d.io.access(nest, constants.X_OK);
    } catch (error) {
      if (error?.code === 'ENOENT') ioFailure('IO_NEST_MISSING');
      if (error?.code === 'EACCES' || error?.code === 'EPERM') ioFailure('IO_NEST_DENIED');
      throw error;
    }
    const code = await d.spawn(nest, ['start'], {
      cwd: apiRoot,
      env,
      shell: false,
      stdio: 'ignore',
    });
    return result(code === 0, 'API_EXIT');
  } catch (error) {
    if (created.value) return result(false, 'PREPARE_PARTIAL');
    // Map fixed allowlisted IO phases without ever exposing paths, contents or Node messages.
    const code = error?.code;
    if (typeof code === 'string' && code.startsWith('IO_')) return result(false, code);
    return result(false, category);
  }
}

export function assertClientMetadata(source) {
  const metadata = [...source.matchAll(/"relativeEnvPaths"\s*:/g)];
  if (!/"clientVersion"\s*:\s*"6\.19\.0"/.test(source) || metadata.length !== 1) fail();
  const paths = /"relativeEnvPaths"\s*:\s*(\{[^{}]*\})/.exec(source);
  if (!paths) fail();
  const values = JSON.parse(paths[1]);
  if (
    !Object.hasOwn(values, 'rootEnvPath') ||
    Object.keys(values).some((key) => !['rootEnvPath', 'schemaEnvPath'].includes(key)) ||
    Object.values(values).some((value) => value !== null)
  )
    fail();
}
async function installedClientGuard() {
  // Prisma's generated module can call warnEnvConflicts before construction,
  // and the constructor can load dotenv. Refuse any generated env-file paths
  // BEFORE importing it; an explicit datasource URL alone is not sufficient.
  const require = createRequire(import.meta.url);
  const clientRequire = createRequire(require.resolve('@prisma/client'));
  const generated = clientRequire.resolve('.prisma/client/index');
  assertClientMetadata(await fs.readFile(generated, 'utf8'));
}
async function liveClient(options) {
  await installedClientGuard();
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient(options);
}
async function liveSpawn(command, args, options) {
  await installedClientGuard();
  return new Promise((resolveExit) => {
    const child = spawn(command, args, options);
    child.once('error', () => resolveExit(1));
    child.once('close', (code, signal) => resolveExit(signal ? 1 : code));
  });
}
const filename = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // No raw exception output, even if setup fails before run(). Operator must use
  // a private, unobserved terminal; a TTY alone cannot detect recording software.
  try {
    process.exitCode = await run(process.argv.slice(2), {
      root: resolve(dirname(filename), '../../..'),
      uid: process.getuid(),
      io: fs,
      tty: { stdin: process.stdin.isTTY === true, stdout: process.stdout.isTTY === true },
      random: randomBytes,
      env: process.env,
      client: liveClient,
      spawn: liveSpawn,
      emit: (line) => process.stdout.write(`${line}\n`),
    });
  } catch {
    process.stdout.write('FAIL SETUP\n');
    process.exitCode = 1;
  }
}
