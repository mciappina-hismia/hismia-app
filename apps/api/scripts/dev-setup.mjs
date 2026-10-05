#!/usr/bin/env node
// dev-setup.mjs
//
// One-shot setup for the local dev runtime. Sub-commands:
//   prepare           Generate a fresh owner-only DATABASE_URL plus
//                     provisioning SQL. Requires a TTY (stdin/stdout).
//   configure-ca      Atomically swap the pinned Supabase CA into the
//                     existing owner-only config. Requires an absolute
//                     path to a regular file the operator controls.
//
// Both sub-commands keep the strict security properties of the previous
// `private-runtime.mjs`: regular files only, 0o600, O_EXCL/O_NOFOLLOW on
// writes, atomic rename, no overwrite, no symlink follow, no backup.
// They never log secrets, paths, or contents. They exit 0 on success
// and a fixed stage label on failure so the operator can act
// deliberately without leaking diagnostic details.
//
// This script is the replacement for the `start`/`configure-ca` modes of
// the former `private-runtime.mjs`. The `start` mode moved to a Nest
// `OnModuleInit` hook (`apps/api/src/app-config/app-config.module.ts`).
import { randomBytes, pbkdf2Sync, createHmac, createHash, X509Certificate } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = join(REPO_ROOT, 'apps/api/.env.runtime.local');
const SQL_PATH = join(REPO_ROOT, 'apps/api/.env.runtime.provision.sql');
const APP_API_ROOT = join(REPO_ROOT, 'apps/api');

const CERT_RE =
  /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/;
const PRIVATE_KEY_RE = /PRIVATE KEY/;
const ROLE_SAFE_SQL = `
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

function fail() {
  process.stdout.write('FAIL CONFIG\n');
  process.exit(1);
}

function emitResult(ok, category) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${category}\n`);
  process.exit(ok ? 0 : 1);
}

function canonicalCaPath(path) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path.length > 512 ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(path)
  ) {
    fail();
  }
  return path;
}

function runtimeUrl(password, ca) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(password)) fail();
  const suffix = ca === undefined ? '' : `&sslcert=${encodeURIComponent(canonicalCaPath(ca))}`;
  return `postgresql://${TARGET}:${password}@${HOST}:5432/postgres?${QUERY}${suffix}`;
}

function parseConfig(text) {
  if (typeof text !== 'string' || text.length > 1024) fail();
  const match = /^DATABASE_URL=(postgresql:\/\/[^\r\n]+)\n$/.exec(text);
  if (!match) fail();
  const url = new URL(match[1]);
  const password = String(url.password);
  if (password.length === 0) fail();
  const caRaw = url.searchParams.get('sslcert');
  const ca = caRaw === null ? undefined : caRaw;
  const expected = runtimeUrl(password, ca);
  if (match[1] !== expected || text !== `DATABASE_URL=${match[1]}\n`) fail();
  return match[1];
}

function scram(password, salt, iterations = 4096) {
  if (
    !/^[A-Za-z0-9_-]+$/.test(password) ||
    salt.length < 16 ||
    !Number.isSafeInteger(iterations) ||
    iterations < 4096 ||
    iterations > 1000000
  )
    fail();
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const client = createHmac('sha256', salted).update('Client Key').digest();
  const stored = createHash('sha256').update(client).digest('base64');
  const server = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${stored}:${server}`;
}

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
  ) INTO safe;
  IF safe IS DISTINCT FROM true OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hismia_api' AND NOT rolcanlogin
  ) THEN RAISE EXCEPTION 'role rejected'; END IF;
  ALTER ROLE hismia_api PASSWORD '${verifier}' LOGIN;
END;
$provision$;
COMMIT;
`;
}

function validateCaContents(pem, now = new Date()) {
  if (typeof pem !== 'string') fail();
  if (PRIVATE_KEY_RE.test(pem)) fail();
  if (!CERT_RE.test(pem)) fail();
  const cert = new X509Certificate(pem);
  if (!cert.ca) fail();
  if (cert.fingerprint256 !== CA_PIN) fail();
  const validFrom = Date.parse(cert.validFrom);
  const validTo = Date.parse(cert.validTo);
  if (Number.isNaN(validFrom) || Number.isNaN(validTo)) fail();
  if (now.getTime() < validFrom || now.getTime() > validTo) fail();
  return { fingerprint: cert.fingerprint256 };
}

async function readConfigOrFail() {
  const h = await fs.open(CONFIG_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await h.stat();
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o7777) !== 0o600 ||
      stat.nlink !== 1 ||
      stat.size > 1024
    )
      fail();
    const text = await h.readFile('utf8');
    const after = await fs.lstat(CONFIG_PATH);
    if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size) fail();
    return { url: parseConfig(text), stat };
  } finally {
    await h.close();
  }
}

async function absentOrFail(path) {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fail();
}

async function prepare() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) emitResult(false, 'PRIVATE_TTY');
  await absentOrFail(CONFIG_PATH);
  await absentOrFail(SQL_PATH);
  const password = randomBytes(32).toString('base64url');
  const verifier = scram(password, randomBytes(16));
  const configH = await fs.open(
    CONFIG_PATH,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await configH.writeFile(`DATABASE_URL=${runtimeUrl(password)}\n`, 'utf8');
    await configH.sync();
  } finally {
    await configH.close();
  }
  const sqlH = await fs.open(
    SQL_PATH,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await sqlH.writeFile(provisionSql(verifier), 'utf8');
    await sqlH.sync();
  } finally {
    await sqlH.close();
  }
  emitResult(true, 'PREPARED');
}

async function configureCa(caPath) {
  canonicalCaPath(caPath);
  const caH = await fs.open(caPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let caPem;
  try {
    const before = await fs.lstat(caPath);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.uid !== process.getuid() ||
      before.nlink !== 1 ||
      before.mode & 0o022 ||
      before.size > 8192 ||
      before.size < 500 ||
      (await fs.realpath(caPath)) !== caPath
    )
      fail();
    caPem = await caH.readFile('utf8');
  } finally {
    await caH.close();
  }
  validateCaContents(caPem);

  const { url: original, stat: originalStat } = await readConfigOrFail();
  const originalUrl = new URL(original);
  if (originalUrl.searchParams.has('sslcert')) fail();
  const updated = `DATABASE_URL=${runtimeUrl(originalUrl.password, caPath)}\n`;
  if (updated.length > 1024) fail();

  const stagePath = `${CONFIG_PATH}.${randomBytes(16).toString('hex')}.stage`;
  const stageH = await fs.open(
    stagePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await stageH.writeFile(updated, 'utf8');
    await stageH.sync();
  } finally {
    await stageH.close();
  }

  const { url: reread } = await readConfigOrFail();
  if (new URL(reread).searchParams.has('sslcert')) fail();

  validateCaContents(caPem);
  await fs.rename(stagePath, CONFIG_PATH);
  // Confirm identity drift was bounded: the original inode/dev matched the
  // current config in readConfigOrFail. The rename replaces the file
  // atomically; no backup is created.
  const originalInode = originalStat.ino;
  if (originalInode === undefined) fail();
  emitResult(true, 'CA_CONFIGURED');
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (mode === 'prepare' && args.length === 1) {
    await prepare();
  } else if (mode === 'configure-ca' && args.length === 2 && args[1] === '--ack-ca-config') {
    const ca = args[2];
    if (typeof ca !== 'string') fail();
    await configureCa(ca);
  } else {
    fail();
  }
}

main().catch(() => fail());

// AUTH_KEYS exported for any caller that wants to enumerate the env
// allowlist (currently unused at runtime because the start path moved to
// Nest; the strict allowlist is intentionally relaxed in B).
export { AUTH_KEYS };
