import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  AppConfigService,
  APP_CONFIG_READER,
  APP_CA_READER,
  APP_DB_PROBE,
  type AppConfigFileReader,
  type AppCaFileReader,
  type AppDbProbe,
} from './app-config.module.js';
import { runtimeUrl } from './parse-config.js';
import * as validateCaModule from './validate-ca.js';

const VALID_PASSWORD = 'A'.repeat(64);
const VALID_CA_PATH = '/Users/op/Downloads/prod-ca-2021.crt';
const VALID_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIBkTCCATegAwIBAgIJAKnK2dP4f6NxMA0GCSqGSIb3DQEBCwUAMBQxEjAQBgNV
BAgMCVRlc3RDb3VudHJ5MQ8wDQYDVQQKDAZUZXN0Q28xETAPBgNVBAMMCFRlc3RD
-----END CERTIFICATE-----
`;

async function buildModule(overrides: {
  config?: Partial<AppConfigFileReader>;
  ca?: Partial<AppCaFileReader>;
  db?: Partial<AppDbProbe>;
}) {
  const configReader: AppConfigFileReader = {
    read: async () => overrides.config?.read?.bind(overrides.config) as never,
    ...overrides.config,
  } as AppConfigFileReader;
  const caReader: AppCaFileReader = {
    read: async () => overrides.ca?.read?.bind(overrides.ca) as never,
    ...overrides.ca,
  } as AppCaFileReader;
  const dbProbe: AppDbProbe = {
    probe: async () => null,
    ...overrides.db,
  } as AppDbProbe;

  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: APP_CONFIG_READER, useValue: configReader },
      { provide: APP_CA_READER, useValue: caReader },
      { provide: APP_DB_PROBE, useValue: dbProbe },
      AppConfigService,
    ],
  }).compile();

  return moduleRef.get(AppConfigService);
}

describe('AppConfigService', () => {
  it('passes on a valid config without sslcert', async () => {
    const service = await buildModule({
      config: { read: async () => `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}\n` },
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('passes on a valid config with sslcert', async () => {
    const spy = vi.spyOn(validateCaModule, 'validateCaContents').mockReturnValue({
      fingerprint: 'pinned',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 86_400_000),
    });
    try {
      const service = await buildModule({
        config: { read: async () => `DATABASE_URL=${runtimeUrl(VALID_PASSWORD, VALID_CA_PATH)}\n` },
        ca: { read: async () => VALID_CA_PEM },
      });
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(VALID_CA_PEM);
    } finally {
      spy.mockRestore();
    }
  });

  it('throws when the config file is invalid', async () => {
    const service = await buildModule({
      config: { read: async () => 'GARBAGE=1\n' },
    });
    await expect(service.onModuleInit()).rejects.toThrow(/private runtime rejected/);
  });

  it('throws when the DB probe fails', async () => {
    const service = await buildModule({
      config: { read: async () => `DATABASE_URL=${runtimeUrl(VALID_PASSWORD)}\n` },
      db: { probe: async () => 'CATALOG' },
    });
    await expect(service.onModuleInit()).rejects.toThrow(/FAIL DB_PROBE CATALOG/);
  });

  it('throws when the CA contents are not a certificate', async () => {
    const service = await buildModule({
      config: { read: async () => `DATABASE_URL=${runtimeUrl(VALID_PASSWORD, VALID_CA_PATH)}\n` },
      ca: { read: async () => 'not a certificate' },
    });
    await expect(service.onModuleInit()).rejects.toThrow(/private runtime rejected/);
  });
});
