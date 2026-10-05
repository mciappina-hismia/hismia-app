// Pure functions extracted from the former `apps/api/scripts/private-runtime.mjs`.
// These functions have no side effects, no IO, no environment access.
// They validate the canonical Supabase Session pooler URL and reconstruct it
// from the supplied components so a config file that does not match the
// expected fixed target is rejected.
//
// Security model: the canonical URL is constructed from a hardcoded target
// (the Hismia API role on Supabase) plus an operator-supplied password and
// optional CA path. A config file whose URL is not byte-for-byte equal to
// this reconstruction is rejected, defeating URL substitution, encoding
// tricks, alternate ports/users, and dotenv/shell syntax.

import { isAbsolute, resolve } from 'node:path';

export const TARGET = 'hismia_api.zfpnjsbxrgbcehmefozb';
export const HOST = 'aws-0-sa-east-1.pooler.supabase.com';
export const QUERY =
  'sslmode=require&sslaccept=strict&connection_limit=2&connect_timeout=5&pool_timeout=5&schema=profile_private';
export const CA_PIN =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';

class Rejection extends Error {
  constructor() {
    super('private runtime rejected');
  }
}

function fail(): never {
  throw new Rejection();
}

export function canonicalCaPath(path: unknown): string {
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

export function runtimeUrl(password: string, ca?: string): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(password)) fail();
  const suffix = ca === undefined ? '' : `&sslcert=${encodeURIComponent(canonicalCaPath(ca))}`;
  return `postgresql://${TARGET}:${password}@${HOST}:5432/postgres?${QUERY}${suffix}`;
}

export function parseConfig(text: unknown): string {
  if (typeof text !== 'string' || text.length > 1024) fail();
  const match = /^DATABASE_URL=(postgresql:\/\/[^\r\n]+)\n$/.exec(text);
  if (!match) fail();
  const url = new URL(match[1]);
  // The password is typed as a string in the URL interface but TS sees the
  // overloaded `string` (with the `String.prototype.toString` member) in
  // this project's lib config; coerce explicitly to satisfy the call.
  const password = String(url.password);
  if (password.length === 0) fail();
  const caRaw = url.searchParams.get('sslcert');
  const ca: string | undefined = caRaw === null ? undefined : caRaw;
  const expected = runtimeUrl(password, ca);
  if (match[1] !== expected || text !== `DATABASE_URL=${match[1]}\n`) fail();
  return match[1];
}
