// Pure validation for the pinned Supabase CA certificate.
// Extracted from the former `apps/api/scripts/private-runtime.mjs` so the
// AppConfigModule can drive the IO and reuse the same logic in tests.
//
// Security model: a CA is acceptable only if it (a) is parseable as a
// single PEM-encoded X.509 certificate, (b) has `ca` capability set,
// (c) has the hardcoded fingerprint, and (d) is within its validity
// window. None of these checks expose the certificate contents or
// paths to the caller.

import { X509Certificate } from 'node:crypto';
import { CA_PIN } from './parse-config.js';

class Rejection extends Error {
  constructor() {
    super('private runtime rejected');
  }
}

function fail(): never {
  throw new Rejection();
}

const CERT_RE =
  /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/;
const PRIVATE_KEY_RE = /PRIVATE KEY/;

export interface CaValidationResult {
  fingerprint: string;
  validFrom: Date;
  validTo: Date;
}

/**
 * Validate the contents of a CA certificate. The caller is responsible
 * for ensuring the bytes come from a file the operator controls (regular
 * file, no symlinks, owner-only permissions); this function only checks
 * the certificate itself.
 *
 * The `expectedFingerprint` parameter is internal; production code uses
 * the default (the hardcoded `CA_PIN`). Tests inject a known fingerprint
 * to exercise the success path without generating a real certificate
 * whose digest matches the pin.
 */
export function validateCaContents(
  pem: unknown,
  now: Date = new Date(),
  expectedFingerprint: string = CA_PIN,
): CaValidationResult {
  if (typeof pem !== 'string') fail();
  if (PRIVATE_KEY_RE.test(pem)) fail();
  if (!CERT_RE.test(pem)) fail();

  const cert = new X509Certificate(pem);
  if (!cert.ca) fail();

  const fingerprint = cert.fingerprint256;
  if (fingerprint !== expectedFingerprint) fail();

  const validFrom = Date.parse(cert.validFrom);
  const validTo = Date.parse(cert.validTo);
  if (Number.isNaN(validFrom) || Number.isNaN(validTo)) fail();
  if (now.getTime() < validFrom || now.getTime() > validTo) fail();

  return { fingerprint, validFrom: new Date(validFrom), validTo: new Date(validTo) };
}
