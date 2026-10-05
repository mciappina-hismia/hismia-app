import { describe, it, expect } from 'vitest';
import { runtimeUrl, parseConfig, canonicalCaPath, TARGET, HOST, QUERY } from './parse-config.js';

const VALID_PASSWORD = 'A'.repeat(64);

describe('runtimeUrl', () => {
  it('builds the canonical Session pooler URL without sslcert', () => {
    expect(runtimeUrl(VALID_PASSWORD)).toBe(
      `postgresql://${TARGET}:${VALID_PASSWORD}@${HOST}:5432/postgres?${QUERY}`,
    );
  });

  it('appends sslcert= when a CA path is provided', () => {
    const url = runtimeUrl(VALID_PASSWORD, '/Users/op/Downloads/prod-ca-2021.crt');
    expect(url).toContain('sslcert=');
    expect(url).toContain('%2FUsers%2Fop%2FDownloads%2Fprod-ca-2021.crt');
  });

  it('rejects a short password', () => {
    expect(() => runtimeUrl('short')).toThrow(/private runtime rejected/);
  });

  it('rejects a password with forbidden characters', () => {
    expect(() => runtimeUrl('A'.repeat(63) + ' ')).toThrow(/private runtime rejected/);
  });
});

describe('canonicalCaPath', () => {
  it('accepts an absolute, resolved path', () => {
    expect(canonicalCaPath('/Users/op/Downloads/prod-ca-2021.crt')).toBe(
      '/Users/op/Downloads/prod-ca-2021.crt',
    );
  });

  it('rejects a relative path', () => {
    expect(() => canonicalCaPath('prod-ca-2021.crt')).toThrow();
  });

  it('rejects a control character', () => {
    expect(() => canonicalCaPath('/Users/op/\u0000/ca.crt')).toThrow();
  });

  it('rejects a path longer than 512 characters', () => {
    expect(() => canonicalCaPath('/' + 'a'.repeat(600))).toThrow();
  });
});

describe('parseConfig', () => {
  it('round-trips a config line produced by runtimeUrl', () => {
    const line = `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}\n`;
    expect(parseConfig(line)).toBe(runtimeUrl(VALID_PASSWORD));
  });

  it('rejects an alternate host', () => {
    const malicious = `DATABASE_URL=postgresql://${TARGET}:${VALID_PASSWORD}@evil.example.com:5432/postgres?${QUERY}\n`;
    expect(() => parseConfig(malicious)).toThrow();
  });

  it('rejects an alternate user', () => {
    const malicious = `DATABASE_URL=postgresql://postgres:${VALID_PASSWORD}@${HOST}:5432/postgres?${QUERY}\n`;
    expect(() => parseConfig(malicious)).toThrow();
  });

  it('rejects an alternate port', () => {
    const malicious = `DATABASE_URL=postgresql://${TARGET}:${VALID_PASSWORD}@${HOST}:6543/postgres?${QUERY}\n`;
    expect(() => parseConfig(malicious)).toThrow();
  });

  it('rejects extra URL parameters', () => {
    const malicious = `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}&allowPublicKeyRetrieval=true\n`;
    expect(() => parseConfig(malicious)).toThrow();
  });

  it('rejects a line longer than 1024 characters', () => {
    const long = 'DATABASE_URL=' + 'A'.repeat(1100) + '\n';
    expect(() => parseConfig(long)).toThrow();
  });

  it('rejects a line without the trailing newline', () => {
    const line = `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}`;
    expect(() => parseConfig(line)).toThrow();
  });

  it('rejects a file that contains more than one line', () => {
    const line = `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}\nEXTRA=1\n`;
    expect(() => parseConfig(line)).toThrow();
  });

  it('rejects dotenv-style expansion', () => {
    const malicious = `DATABASE_URL=postgresql://${TARGET}:$ENV{PASSWORD}@${HOST}:5432/postgres?${QUERY}\n`;
    expect(() => parseConfig(malicious)).toThrow();
  });
});
