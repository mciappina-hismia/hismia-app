// AppConfigModule loads the private runtime config and validates it before
// Nest's listener binds. It replaces the old
// `apps/api/scripts/private-runtime.mjs` start path, which used a strict
// `environmentSafe()` regex that broke for benign `NODE_*` variables set
// by developers (e.g. `NODE_OPTIONS=--no-deprecation`). Nest now starts
// with its own process.env and this module asserts the database, CA and
// DB connectivity via dedicated, well-tested pure functions.
//
// On any failure the module throws, Nest's bootstrap fails, and the
// process exits with code 1 — matching the old `FAIL CONFIG` /
// `FAIL API_EXIT` semantics without the silent environment-rejection
// mode that swallowed useful diagnostic information.

import { promises as fs, constants } from 'node:fs';
import { resolve } from 'node:path';
import { Module, OnModuleInit, Injectable, Inject } from '@nestjs/common';
import { parseConfig } from './parse-config.js';
import { validateCaContents } from './validate-ca.js';
import { probeDb, type DbClient, type DbProbeStage } from './db-probe.js';

export const APP_CONFIG_FILE = 'apps/api/.env.runtime.local';
export const APP_CONFIG_MAX_BYTES = 1024;
export const APP_CA_MAX_BYTES = 8192;
export const APP_CA_MIN_BYTES = 500;

export const APP_CONFIG_READER = Symbol.for('AppConfigReader');
export const APP_CA_READER = Symbol.for('AppCaReader');
export const APP_DB_PROBE = Symbol.for('AppDbProbe');

export interface AppConfigFileReader {
  read(path: string, maxBytes: number): Promise<string>;
}

export interface AppCaFileReader {
  read(path: string, minBytes: number, maxBytes: number): Promise<string>;
}

export interface AppDbProbe {
  probe(deps: { client: DbClient }): Promise<DbProbeStage | null>;
}

export interface AppConfig {
  databaseUrl: string;
  databasePassword: string;
  caPath: string | undefined;
}

@Injectable()
export class AppConfigService implements OnModuleInit {
  constructor(
    @Inject(APP_CONFIG_READER) private readonly configReader: AppConfigFileReader,
    @Inject(APP_CA_READER) private readonly caReader: AppCaFileReader,
    @Inject(APP_DB_PROBE) private readonly dbProbe: AppDbProbe,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.APP_CONFIG_SKIP_INIT === '1') return;
    const config = await this.loadConfig();
    if (config.caPath) {
      await this.loadCa(config.caPath);
    }
    await this.probeDb(config.databaseUrl);
  }

  async loadConfig(): Promise<AppConfig> {
    const text = await this.configReader.read(APP_CONFIG_FILE, APP_CONFIG_MAX_BYTES);
    const url = parseConfig(text);
    const parsed = new URL(url);
    return {
      databaseUrl: url,
      databasePassword: parsed.password,
      caPath: parsed.searchParams.get('sslcert') ?? undefined,
    };
  }

  async loadCa(caPath: string): Promise<void> {
    const pem = await this.caReader.read(caPath, APP_CA_MIN_BYTES, APP_CA_MAX_BYTES);
    validateCaContents(pem);
  }

  async probeDb(databaseUrl: string): Promise<void> {
    const client = await makePrismaClientFromUrl(databaseUrl);
    const stage = await this.dbProbe.probe({ client });
    if (stage !== null) {
      throw new Error(`FAIL DB_PROBE ${stage}`);
    }
  }
}

const defaultConfigReader: AppConfigFileReader = {
  async read(path: string, maxBytes: number) {
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (stat.size > maxBytes) {
        throw new Error(`FAIL CONFIG_FILE_TOO_LARGE ${stat.size}`);
      }
      return await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  },
};

const defaultCaReader: AppCaFileReader = {
  async read(path: string, minBytes: number, maxBytes: number) {
    if (resolve(path) !== path) throw new Error('FAIL CA_NOT_ABSOLUTE');
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size < minBytes || stat.size > maxBytes) {
        throw new Error(`FAIL CA_INVALID ${stat.size}`);
      }
      return await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  },
};

const defaultDbProbe: AppDbProbe = { probe: (deps) => probeDb(deps) };

// Defer the Prisma import to startup so the module is importable in
// environments where the generated client is not yet present (e.g. during
// initial install). The import error then surfaces as a normal
// `OnModuleInit` failure with the same exit code as before.
type PrismaClientCtor = new (options: { datasources: { db: { url: string } }; log: unknown[] }) => {
  $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: object) => Promise<unknown>;
  $disconnect: () => Promise<void>;
};
let prismaClientCtor: PrismaClientCtor | null = null;
async function loadPrismaClientCtor(): Promise<PrismaClientCtor> {
  if (prismaClientCtor) return prismaClientCtor;
  const mod = await import('@prisma/client');
  prismaClientCtor = mod.PrismaClient as unknown as PrismaClientCtor;
  return prismaClientCtor;
}

async function makePrismaClientFromUrl(databaseUrl: string): Promise<DbClient> {
  const Ctor = await loadPrismaClientCtor();
  const client = new Ctor({ datasources: { db: { url: databaseUrl } }, log: [] });
  return {
    $transaction: ((fn: (tx: unknown) => Promise<unknown>, options?: object) =>
      // Forwarding as-is; the Prisma typing accepts the same options we
      // pass in db-probe.ts.
      (client as unknown as { $transaction: typeof client.$transaction }).$transaction(
        fn as never,
        options as never,
      )) as DbClient['$transaction'],
    $disconnect: () => client.$disconnect(),
  };
}

@Module({
  providers: [
    {
      provide: APP_CONFIG_READER,
      useValue: defaultConfigReader,
    },
    {
      provide: APP_CA_READER,
      useValue: defaultCaReader,
    },
    {
      provide: APP_DB_PROBE,
      useValue: defaultDbProbe,
    },
    AppConfigService,
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
