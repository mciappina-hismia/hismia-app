import { describe, it, expect } from 'vitest';
import { validateCaContents } from './validate-ca.js';

const VALID_PEM = `-----BEGIN CERTIFICATE-----
MIIBkTCCATegAwIBAgIJAKnK2dP4f6NxMA0GCSqGSIb3DQEBCwUAMBQxEjAQBgNV
BAgMCVRlc3RDb3VudHJ5MQ8wDQYDVQQKDAZUZXN0Q28xETAPBgNVBAMMCFRlc3RD
-----
END CERTIFICATE-----
`;

describe('validateCaContents', () => {
  it('rejects a non-string', () => {
    expect(() => validateCaContents(123)).toThrow();
  });

  it('rejects a PEM that contains a private key', () => {
    expect(() =>
      validateCaContents(
        '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n' + VALID_PEM,
      ),
    ).toThrow();
  });

  it('rejects a malformed PEM', () => {
    expect(() => validateCaContents('not a certificate')).toThrow();
  });

  it('rejects a PEM that does not end with the certificate marker', () => {
    const truncated = VALID_PEM.replace(/-----END CERTIFICATE-----/, '');
    expect(() => validateCaContents(truncated)).toThrow();
  });
});
