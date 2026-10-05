import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';

let helper;
try {
  helper = await import('./private-runtime.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const root = '/checkout';
const api = `${root}/apps/api`;
const password = 'fixed_nonsecret_test_password_012345678901234';
const file = `${api}/.env.runtime.local`;
const sqlFile = `${api}/.env.runtime.provision.sql`;
const stat = (overrides = {}) => ({
  uid: 1000,
  mode: 0o600,
  nlink: 1,
  dev: 1,
  ino: 1,
  isFile: () => true,
  isDirectory: () => false,
  isSymbolicLink: () => false,
  ...overrides,
});
function fixture() {
  const files = new Map();
  const events = [];
  const output = [];
  const io = {
    realpath: async (p) => p,
    access: async () => {}, // synthetic executable; never launch a real child
    lstat: async (p) => {
      if (['/', root, `${root}/apps`, api].includes(p))
        return stat({ mode: 0o755, isFile: () => false, isDirectory: () => true });
      if (!files.has(p)) throw Object.assign(new Error('nonsecret'), { code: 'ENOENT' });
      return files.get(p).stat;
    },
    rename: async (from, to) => {
      events.push(['rename', from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
    unlink: async (p) => {
      events.push(['unlink', p]);
      files.delete(p);
    },
    open: async (p, flags, mode) => {
      events.push(['open', p, flags, mode]);
      if (flags & constants.O_CREAT) {
        if (files.has(p)) throw new Error('nonsecret existing');
        files.set(p, { stat: stat(), content: '' });
      }
      const entry = files.get(p);
      if (!entry && p === api) return { sync: async () => {}, close: async () => {} };
      if (!entry) throw Object.assign(new Error('nonsecret'), { code: 'ENOENT' });
      return {
        stat: async () => entry.stat,
        writeFile: async (s) => {
          entry.content = s;
        },
        readFile: async () => entry.content,
        sync: async () => {},
        close: async () => {
          events.push(['close', p]);
        },
      };
    },
  };
  const deps = {
    io,
    root,
    uid: 1000,
    tty: { stdin: true, stdout: true },
    random: (n) => {
      events.push(['random', n]);
      return Buffer.alloc(n, 7);
    },
    emit: (s) => output.push(s),
    env: {},
  };
  return { deps, files, events, output };
}
const requireHelper = () => assert.ok(helper, 'secure runtime helper must exist');
test('CA URL preserves the canonical restricted target and rejects query weakening', () => {
  requireHelper();
  const ca = '/trusted/public ca.crt';
  const url = helper.runtimeUrl(password);
  const configured = helper.runtimeUrl(password, ca);
  assert.equal(configured, `${url}&sslcert=%2Ftrusted%2Fpublic%20ca.crt`);
  assert.equal(helper.parseConfig(`DATABASE_URL=${configured}\n`), configured);
  for (const bad of [
    `${configured}&sslcert=%2Fother`,
    configured.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'),
    configured.replace('sslcert=', 'sslcert=%2Fother&sslcert='),
    configured.replace('%2Ftrusted', '/trusted'),
    configured.replace('%2Ftrusted', '%2ftrusted'),
    configured.replace('%2Ftrusted', '%2F..%2Ftrusted'),
  ])
    assert.throws(() => helper.parseConfig(`DATABASE_URL=${bad}\n`));
  assert.throws(() => helper.runtimeUrl(password, 'relative.crt'));
});
test('configure-ca requires exact acknowledgment before private IO', async () => {
  requireHelper();
  for (const args of [
    ['configure-ca'],
    ['configure-ca', '/trusted/ca.crt'],
    ['configure-ca', '--ack-ca-config', 'relative.crt'],
    ['configure-ca', '--ack-ca-config', '/trusted/ca.crt', 'extra'],
  ]) {
    const f = fixture();
    assert.equal(await helper.run(args, f.deps), 1);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.output, ['FAIL ARGUMENTS']);
  }
});
test('configure-ca atomically retains synthetic credentials, uses exclusive staging and no backup', async () => {
  const f = fixture();
  const ca = '/trusted/ca.crt';
  const pem = '-----BEGIN CERTIFICATE-----\n' + 'A'.repeat(600) + '\n-----END CERTIFICATE-----\n';
  f.files.set(ca, { stat: stat({ size: pem.length }), content: pem });
  f.files.set(file, { stat: stat(), content: `DATABASE_URL=${helper.runtimeUrl(password)}\n` });
  f.deps.certificate = () => ({
    ca: true,
    fingerprint256:
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    validFrom: '2021-04-28',
    validTo: '2031-04-26',
  });
  assert.equal(await helper.run(['configure-ca', '--ack-ca-config', ca], f.deps), 0);
  assert.deepEqual(f.output, ['PASS CA_CONFIGURED']);
  assert.equal(f.files.get(file).content, `DATABASE_URL=${helper.runtimeUrl(password, ca)}\n`);
  assert.equal(f.files.size, 2);
  const rename = f.events.find((event) => event[0] === 'rename');
  assert.equal(rename[2], file);
  assert.ok(
    f.events.find(
      (event) =>
        event[0] === 'open' &&
        event[1] === rename[1] &&
        event[2] & constants.O_EXCL &&
        event[2] & constants.O_NOFOLLOW &&
        event[3] === 0o600,
    ),
  );
  assert.equal(f.events.filter((event) => event[0] === 'unlink').length, 0);
});
test('configure-ca rejects unpinned CA and never changes existing config', async () => {
  const f = fixture();
  const ca = '/trusted/ca.crt';
  const original = `DATABASE_URL=${helper.runtimeUrl(password)}\n`;
  f.files.set(file, { stat: stat(), content: original });
  f.files.set(ca, { stat: stat({ size: 600 }), content: 'A'.repeat(600) });
  assert.equal(await helper.run(['configure-ca', '--ack-ca-config', ca], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL CONFIG']);
  assert.equal(f.files.get(file).content, original);
  assert.equal(
    f.events.some((event) => event[0] === 'rename'),
    false,
  );
});
test('configure-ca rejects hostile certificate metadata and leaves private original untouched', async () => {
  for (const change of ['symlink', 'owner', 'permissions', 'fingerprint', 'not-ca', 'key']) {
    const f = fixture();
    const ca = '/trusted/ca.crt';
    const original = `DATABASE_URL=${helper.runtimeUrl(password)}\n`;
    const pem = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(600)}\n-----END CERTIFICATE-----\n`;
    f.files.set(file, { stat: stat(), content: original });
    f.files.set(ca, {
      stat: stat({ size: pem.length }),
      content: change === 'key' ? `${pem}PRIVATE KEY` : pem,
    });
    const entry = f.files.get(ca);
    if (change === 'symlink') entry.stat.isSymbolicLink = () => true;
    if (change === 'owner') entry.stat.uid = 2000;
    if (change === 'permissions') entry.stat.mode = 0o666;
    f.deps.certificate = () => ({
      ca: change !== 'not-ca',
      fingerprint256:
        change === 'fingerprint'
          ? 'wrong'
          : '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
      validFrom: '2021-04-28',
      validTo: '2031-04-26',
    });
    assert.equal(await helper.run(['configure-ca', '--ack-ca-config', ca], f.deps), 1);
    assert.deepEqual(f.output, ['FAIL CONFIG']);
    assert.equal(f.files.get(file).content, original);
    assert.equal(
      f.events.some((event) => event[0] === 'rename'),
      false,
    );
  }
});
test('helper exists with bounded public operations', () => {
  requireHelper();
  for (const key of ['run', 'scram', 'runtimeUrl', 'parseConfig', 'ROLE_SAFE_SQL'])
    assert.ok(helper[key]);
});
test('prepare rejects either nonTTY before IO or random generation', async () => {
  requireHelper();
  for (const stream of ['stdin', 'stdout']) {
    const f = fixture();
    f.deps.tty[stream] = false;
    assert.equal(await helper.run(['prepare'], f.deps), 1);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.output, ['FAIL PRIVATE_TTY']);
  }
});
test('SCRAM uses standard SHA256 derivation and labels with fixed nonsecret input', () => {
  requireHelper();
  const salt = Buffer.from('0123456789abcdef');
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const client = createHmac('sha256', salted).update('Client Key').digest();
  const stored = createHash('sha256').update(client).digest('base64');
  const server = createHmac('sha256', salted).update('Server Key').digest('base64');
  assert.equal(
    helper.scram(password, salt, 4096),
    `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`,
  );
  // Published PBKDF2-HMAC-SHA256 vector anchors the independent derivation.
  assert.equal(
    pbkdf2Sync('password', 'salt', 4096, 32, 'sha256').toString('hex'),
    'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a',
  );
  assert.throws(() => helper.scram(password, Buffer.alloc(15), 4096));
  assert.throws(() => helper.scram(password, salt, 4095));
});
test('prepare writes only exclusive owner-only targets and keeps all credential material private', async () => {
  requireHelper();
  const f = fixture();
  assert.equal(await helper.run(['prepare'], f.deps), 0);
  assert.deepEqual([...f.files.keys()], [file, sqlFile]);
  for (const e of f.events.filter((e) => e[0] === 'open')) {
    assert.equal(e[3], 0o600);
    assert.ok(e[2] & constants.O_EXCL);
    assert.ok(e[2] & constants.O_NOFOLLOW);
  }
  assert.equal(
    helper.parseConfig(f.files.get(file).content),
    f.files.get(file).content.trim().slice(13),
  );
  const sql = f.files.get(sqlFile).content;
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /ALTER ROLE hismia_api PASSWORD 'SCRAM-SHA-256\$/);
  assert.match(sql, /LOGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.ok(sql.includes(helper.ROLE_SAFE_SQL));
  assert.match(sql, /rolcanlogin/);
  assert.doesNotMatch(
    sql,
    /(?:^|[;\n])\s*(?:CREATE\s+ROLE|GRANT\s+|INSERT\s+|UPDATE\s+|DELETE\s+)/im,
  );
  assert.deepEqual(f.output, ['PASS PREPARED']);
});
test('prepare refuses existing targets, symlinks, foreign ownership and writable parents', async () => {
  requireHelper();
  for (const change of ['existing', 'symlink', 'owner', 'mode', 'canonical']) {
    const f = fixture();
    const original = f.deps.io.lstat;
    if (change === 'existing') f.files.set(sqlFile, { stat: stat(), content: 'keep' });
    else if (change === 'canonical') f.deps.io.realpath = async () => '/elsewhere';
    else
      f.deps.io.lstat = async (p) =>
        p === api
          ? stat({
              isDirectory: () => true,
              isSymbolicLink: () => change === 'symlink',
              uid: change === 'owner' ? 2000 : 1000,
              mode: change === 'mode' ? 0o777 : 0o755,
            })
          : original(p);
    assert.equal(await helper.run(['prepare'], f.deps), 1);
    assert.equal(f.events.length, 0);
  }
});
test('partial write failure retains files and emits no raw exception or contents', async () => {
  requireHelper();
  const f = fixture();
  const open = f.deps.io.open;
  f.deps.io.open = async (...args) => {
    if (args[0] === sqlFile) throw new Error(password);
    return open(...args);
  };
  assert.equal(await helper.run(['prepare'], f.deps), 1);
  assert.equal(f.files.size, 1);
  assert.deepEqual(f.output, ['FAIL PREPARE_PARTIAL']);
  assert.ok(f.events.some((e) => e[0] === 'close'));
});
test('read and prepare reject changed descriptor identity or insecure created files, closing handles', async () => {
  requireHelper();
  for (const operation of ['prepare', 'check']) {
    const f = operation === 'prepare' ? fixture() : checker();
    const open = f.deps.io.open;
    f.deps.io.open = async (...args) => {
      const handle = await open(...args);
      handle.stat = async () => stat({ ino: 2 });
      return handle;
    };
    const args = operation === 'prepare' ? ['prepare'] : ['check', '--ack-remote-read-only'];
    assert.equal(await helper.run(args, f.deps), 1);
    assert.ok(f.events.some((e) => e[0] === 'close'));
    if (operation === 'check') assert.equal(f.options(), undefined);
  }
  const f = fixture();
  const open = f.deps.io.open;
  f.deps.io.open = async (...args) => {
    const h = await open(...args);
    f.files.get(args[0]).stat.mode = 0o644;
    return h;
  };
  assert.equal(await helper.run(['prepare'], f.deps), 1);
  assert.equal(f.files.get(file).content, '');
  assert.deepEqual(f.output, ['FAIL PREPARE_PARTIAL']);
});
test('config parser accepts only canonical fixed target and rejects every URL/env bypass', () => {
  requireHelper();
  const url = helper.runtimeUrl(password);
  assert.equal(helper.parseConfig(`DATABASE_URL=${url}\n`), url);
  for (const bad of [
    url.replace('5432', '6543'),
    url.replace('/postgres?', '/other?'),
    url.replace('hismia_api.', 'postgres.'),
    url.replace('aws-0-sa-east-1', 'aws-1-sa-east-1'),
    url.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'),
    url.replace('sslmode=require', 'sslmode=verify-full'),
    `${url}&options=evil`,
    `${url}#evil`,
    url.replace(password, '%27evil'),
    url.replace(':5432', ''),
    url.replace('connection_limit=2', 'connection_limit=99'),
  ])
    assert.throws(() => helper.parseConfig(`DATABASE_URL=${bad}\n`));
  for (const bad of [
    `DATABASE_URL=${url}\nEXTRA=x\n`,
    `DATABASE_URL=${url}\nDATABASE_URL=${url}\n`,
    `export DATABASE_URL=${url}\n`,
    `DATABASE_URL="${url}"\n`,
    `DATABASE_URL=$(evil)\n`,
    `DATABASE_URL=${url}\n\n`,
    `DATABASE_URL=${url}\r\n`,
  ])
    assert.throws(() => helper.parseConfig(bad));
});
function checker() {
  const f = fixture();
  f.files.set(file, { stat: stat(), content: `DATABASE_URL=${helper.runtimeUrl(password)}\n` });
  let disconnected = 0;
  const queries = [];
  let options;
  const client = {
    $transaction: async (fn, opts) => {
      queries.push(opts);
      return fn({
        $executeRawUnsafe: async (q) => {
          queries.push(q);
        },
        $queryRawUnsafe: async (q) => {
          queries.push(q);
          return [{ safe: true }];
        },
      });
    },
    $disconnect: async () => {
      disconnected++;
    },
  };
  f.deps.client = async (o) => {
    options = o;
    return client;
  };
  return { ...f, client, queries, disconnected: () => disconnected, options: () => options };
}
test('check requires remote read-only acknowledgement before any private read/client', async () => {
  requireHelper();
  const f = checker();
  assert.equal(await helper.run(['check'], f.deps), 1);
  assert.equal(f.events.length, 0);
  assert.equal(f.options(), undefined);
});
test('check validates file security and rejects inherited URL/injected environment before network', async () => {
  requireHelper();
  for (const change of ['owner', 'mode', 'symlink', 'directory', 'hardlink', 'url', 'injected']) {
    const f = checker();
    const entry = f.files.get(file);
    if (change === 'owner') entry.stat.uid = 2000;
    if (change === 'mode') entry.stat.mode = 0o644;
    if (change === 'symlink') entry.stat.isSymbolicLink = () => true;
    if (change === 'directory') entry.stat.isFile = () => false;
    if (change === 'hardlink') entry.stat.nlink = 2;
    if (change === 'url') f.deps.env.DATABASE_URL = 'nonsecret';
    if (change === 'injected') f.deps.env.NODE_OPTIONS = '--inspect';
    assert.equal(await helper.run(['check', '--ack-remote-read-only'], f.deps), 1);
    assert.equal(f.options(), undefined);
  }
});
test('check uses installed-client options, bounded read-only queries, no identity/rows and disconnect', async () => {
  requireHelper();
  const f = checker();
  assert.equal(await helper.run(['check', '--ack-remote-read-only'], f.deps), 0);
  assert.deepEqual(f.options(), {
    datasources: { db: { url: helper.runtimeUrl(password) } },
    log: [],
  });
  assert.equal(f.disconnected(), 1);
  assert.deepEqual(f.output, ['PASS CHECK']);
  const text = f.queries.filter((q) => typeof q === 'string').join('\n');
  assert.match(text, /SET TRANSACTION READ ONLY/);
  assert.match(text, /statement_timeout/);
  assert.match(text, /EXISTS/);
  assert.match(text, /current_setting\('hismia.subject', true\)/);
  assert.doesNotMatch(
    text,
    /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|set_config|SELECT\s+\*)/,
  );
  assert.deepEqual(f.queries[0], { maxWait: 5000, timeout: 10000 });
});
test('check reports fixed failure stages, never secrets, and stops queries after failure', async () => {
  requireHelper();
  const cases = {
    client: 'CLIENT',
    transaction: 'TRANSACTION_UNKNOWN',
    readOnly: 'READ_ONLY',
    catalogQuery: 'CATALOG',
    catalogAssertion: 'CATALOG',
    visibilityQuery: 'VISIBILITY',
    visibilityAssertion: 'VISIBILITY',
    disconnect: 'DISCONNECT',
  };
  for (const [failure, category] of Object.entries(cases)) {
    const f = checker();
    const verifier = 'synthetic_verifier_never_output';
    const secretError = () => new Error(`${password} ${verifier}`);
    let constructed = 0;
    const originalClient = f.deps.client;
    f.deps.client = async (options) => {
      constructed++;
      if (failure === 'client') throw secretError();
      return originalClient(options);
    };
    if (failure === 'transaction')
      f.client.$transaction = async () => {
        throw secretError();
      };
    else if (
      [
        'readOnly',
        'catalogQuery',
        'catalogAssertion',
        'visibilityQuery',
        'visibilityAssertion',
      ].includes(failure)
    ) {
      f.client.$transaction = async (fn, opts) => {
        f.queries.push(opts);
        return fn({
          $executeRawUnsafe: async (q) => {
            f.queries.push(q);
            if (failure === 'readOnly') throw secretError();
          },
          $queryRawUnsafe: async (q) => {
            f.queries.push(q);
            const visibility = q.includes('SELECT NOT EXISTS');
            if (
              (visibility && failure === 'visibilityQuery') ||
              (!visibility && failure === 'catalogQuery')
            )
              throw secretError();
            return [
              {
                safe: !(visibility
                  ? failure === 'visibilityAssertion'
                  : failure === 'catalogAssertion'),
              },
            ];
          },
        });
      };
    }
    if (failure === 'disconnect')
      f.client.$disconnect = async () => {
        throw secretError();
      };
    assert.equal(await helper.run(['check', '--ack-remote-read-only'], f.deps), 1);
    assert.deepEqual(f.output, [`FAIL ${category}`]);
    assert.doesNotMatch(f.output.join(''), new RegExp(`${password}|${verifier}`));
    assert.equal(constructed, 1);
    if (failure !== 'client' && failure !== 'disconnect') assert.equal(f.disconnected(), 1);
    const statements = f.queries.filter((q) => typeof q === 'string');
    if (failure === 'client' || failure === 'transaction') assert.equal(statements.length, 0);
    if (failure === 'readOnly') assert.equal(statements.length, 1);
    if (failure.startsWith('catalog')) assert.equal(statements.length, 4);
    if (failure.startsWith('visibility')) assert.equal(statements.length, 5);
  }
});
test('pre-callback transaction failure reports only fixed allowlisted Prisma codes', async () => {
  requireHelper();
  const allowed = ['P1000', 'P1001', 'P1002', 'P1003', 'P1011', 'P1017', 'P2024', 'P2028'];
  const hostile = ['P9999', 'P1000_SECRET', 'p1000', '', 1000, null, undefined];
  for (const code of [...allowed, ...hostile, 'throwing-getter']) {
    const f = checker();
    const secret = 'synthetic_secret_never_output';
    f.client.$transaction = async () => {
      const error = new Error(secret);
      error.meta = { url: secret };
      if (code === 'throwing-getter')
        Object.defineProperty(error, 'code', {
          get: () => {
            throw new Error(secret);
          },
        });
      else error.code = code;
      throw error;
    };
    assert.equal(await helper.run(['check', '--ack-remote-read-only'], f.deps), 1);
    assert.deepEqual(f.output, [
      `FAIL ${allowed.includes(code) ? `TRANSACTION_${code}` : 'TRANSACTION_UNKNOWN'}`,
    ]);
    assert.equal(f.disconnected(), 1);
    assert.equal(f.queries.length, 0);
    assert.ok(!f.output.join('').includes(secret));
  }
});
test('pre-callback Prisma initialization errorCode is allowlisted without reading hostile fields', async () => {
  requireHelper();
  for (const errorCode of ['P1000', 'P1017', 'P9999', 'P1000_SECRET', 1000, 'throwing-getter']) {
    const f = checker();
    const secret = 'synthetic_secret_never_output';
    f.client.$transaction = async () => {
      const error = new Error(secret);
      error.meta = { url: secret };
      Object.defineProperty(error, 'code', {
        get: () => {
          throw new Error(secret);
        },
      });
      if (errorCode === 'throwing-getter')
        Object.defineProperty(error, 'errorCode', {
          get: () => {
            throw new Error(secret);
          },
        });
      else error.errorCode = errorCode;
      throw error;
    };
    assert.equal(await helper.run(['check', '--ack-remote-read-only'], f.deps), 1);
    const expected = ['P1000', 'P1017'].includes(errorCode)
      ? `TRANSACTION_${errorCode}`
      : 'TRANSACTION_UNKNOWN';
    assert.deepEqual(f.output, [`FAIL ${expected}`]);
    assert.equal(f.disconnected(), 1);
    assert.equal(f.queries.length, 0);
    assert.ok(!f.output.join('').includes(secret));
  }
});
test('role guard covers attributes, exact membership, ownership, grants and forced RLS', () => {
  requireHelper();
  for (const part of [
    'rolsuper',
    'rolbypassrls',
    'rolcreatedb',
    'rolcreaterole',
    'rolreplication',
    'rolinherit',
    'pg_auth_members',
    'pg_has_role',
    'hismia_profile_runtime',
    'relowner',
    'nspowner',
    'has_schema_privilege',
    'has_table_privilege',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'relrowsecurity',
    'relforcerowsecurity',
    'SELECT WITH GRANT OPTION',
    'INSERT WITH GRANT OPTION',
    'USAGE WITH GRANT OPTION',
    'MAINTAIN',
  ])
    assert.ok(helper.ROLE_SAFE_SQL.includes(part), part);
});
test('API-only start uses child env, never credentials in argv, suppresses logs and waits for actual exit', async () => {
  requireHelper();
  const f = checker();
  let received;
  Object.assign(f.deps.env, {
    SUPABASE_ANON_KEY: 'fixed_nonsecret_auth',
    AUTH_USE_MOCK: 'false',
    UNRELATED: 'do-not-forward',
  });
  f.deps.spawn = async (...args) => {
    received = args;
    return 0;
  };
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 0);
  assert.equal(received[0], `${api}/node_modules/.bin/nest`);
  assert.deepEqual(received[1], ['start']);
  assert.equal(received[2].cwd, api);
  assert.deepEqual(received[2].stdio, 'ignore');
  assert.equal(received[2].shell, false);
  assert.equal(received[2].env.DATABASE_URL, helper.runtimeUrl(password));
  assert.equal(received[2].env.UNRELATED, undefined);
  assert.equal(received[2].env.AUTH_USE_MOCK, undefined);
  assert.ok(!JSON.stringify(received.slice(0, 2)).includes(password));
  assert.deepEqual(f.output, ['PASS API_EXIT']);
  f.deps.spawn = async () => 7;
  f.output.length = 0;
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL API_EXIT']);
});
test('start requires the API-local executable and never falls back to root or global Nest', async () => {
  const f = checker();
  const local = `${api}/node_modules/.bin/nest`;
  const attempts = [];
  f.deps.io.access = async (path, mode) => {
    attempts.push([path, mode]);
    if (path !== local) throw new Error('not installed in API package');
  };
  f.deps.spawn = async (command, argv, options) => {
    assert.equal(command, local);
    assert.deepEqual(argv, ['start']);
    assert.equal(options.cwd, api);
    return 0;
  };
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 0);
  assert.deepEqual(attempts, [[local, constants.X_OK]]);
  f.output.length = 0;
  f.deps.io.access = async () => {
    throw new Error('missing binary');
  };
  f.deps.spawn = () => assert.fail('must not fall back');
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL API_EXIT']);
});
test('start emits nothing claiming readiness while the child is still running and sanitizes spawn failure', async () => {
  requireHelper();
  const f = checker();
  let finish;
  f.deps.spawn = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const running = helper.run(['start', '--ack-api-listener'], f.deps);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.output, []);
  finish(0);
  assert.equal(await running, 0);
  f.output.length = 0;
  f.deps.spawn = async () => {
    throw new Error(password);
  };
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL API_EXIT']);
});
test('generated Prisma metadata must not permit implicit dotenv reads', () => {
  requireHelper();
  assert.doesNotThrow(() =>
    helper.assertClientMetadata(
      '"clientVersion": "6.19.0", "relativeEnvPaths": {"rootEnvPath": null}',
    ),
  );
  for (const source of [
    '"clientVersion": "6.19.0", "relativeEnvPaths": {"rootEnvPath": ".env"}',
    '"clientVersion": "6.19.0", "relativeEnvPaths": {"rootEnvPath": null, "schemaEnvPath": ".env"}',
    '"clientVersion": "7.0.0", "relativeEnvPaths": {"rootEnvPath": null}',
    '',
  ])
    assert.throws(() => helper.assertClientMetadata(source));
});
test('generated Prisma metadata rejects duplicate env path definitions, including a later effective path', () => {
  requireHelper();
  for (const later of ['{"rootEnvPath": ".env"}', '{"rootEnvPath": null}']) {
    assert.throws(() =>
      helper.assertClientMetadata(
        `"clientVersion": "6.19.0", "relativeEnvPaths": {"rootEnvPath": null}, "relativeEnvPaths": ${later}`,
      ),
    );
  }
});
test('start rejects missing listener acknowledgement, mock auth and unsafe env; invalid modes have no IO', async () => {
  requireHelper();
  for (const args of [[], ['prepare', 'extra'], ['start'], ['unknown']]) {
    const f = fixture();
    assert.equal(await helper.run(args, f.deps), 1);
    assert.deepEqual(f.events, []);
  }
  const f = checker();
  f.deps.env.AUTH_USE_MOCK = 'true';
  f.deps.spawn = async () => assert.fail('must not spawn');
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
});
test('legacy transaction TLS bypass is rejected before any child or client launch', async () => {
  const f = checker();
  const insecure = `postgresql://hismia_api.zfpnjsbxrgbcehmefozb:${password}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=disable&connection_limit=2&connect_timeout=5&pool_timeout=5&schema=profile_private&application_name=hismia-api`;
  f.files.get(file).content = `DATABASE_URL=${insecure}\n`;
  f.deps.spawn = () => assert.fail('must not launch');
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL CONFIG']);
  assert.equal(f.options(), undefined);
  assert.throws(() => helper.runtimeUrl(password, undefined, 'tx'));
  assert.throws(() => helper.parseConfig(`DATABASE_URL=${insecure}\n`));
});
test('start categorizes missing or unreadable private config without leaking paths', async () => {
  requireHelper();
  for (const change of [
    'env-missing',
    'env-denied',
    'ca-missing',
    'ca-denied',
    'nest-missing',
    'nest-denied',
  ]) {
    const f = checker();
    const expected = {
      'env-missing': 'FAIL IO_CONFIG_MISSING',
      'env-denied': 'FAIL IO_CONFIG_DENIED',
      'ca-missing': 'FAIL IO_CA_MISSING',
      'ca-denied': 'FAIL IO_CA_DENIED',
      'nest-missing': 'FAIL IO_NEST_MISSING',
      'nest-denied': 'FAIL IO_NEST_DENIED',
    }[change];
    const err = (code) => Object.assign(new Error('private'), { code });
    if (change === 'env-missing') {
      const lstat = f.deps.io.lstat;
      f.deps.io.lstat = async (p) => {
        if (p === file) throw err('ENOENT');
        return lstat(p);
      };
    }
    if (change === 'env-denied') {
      const lstat = f.deps.io.lstat;
      f.deps.io.lstat = async (p) => {
        if (p === file) throw err('EACCES');
        return lstat(p);
      };
    }
    if (change === 'ca-missing') {
      const ca = '/checkout/missing-ca.crt';
      const pem =
        '-----BEGIN CERTIFICATE-----\n' + 'A'.repeat(600) + '\n-----END CERTIFICATE-----\n';
      f.files.set(ca, { stat: stat({ size: pem.length }), content: pem });
      f.files.get(file).content = `DATABASE_URL=${helper.runtimeUrl(password, ca)}\n`;
      const lstat = f.deps.io.lstat;
      f.deps.io.lstat = async (p) => {
        if (p === ca) throw err('ENOENT');
        return lstat(p);
      };
    }
    if (change === 'ca-denied') {
      const ca = '/checkout/denied-ca.crt';
      const pem =
        '-----BEGIN CERTIFICATE-----\n' + 'A'.repeat(600) + '\n-----END CERTIFICATE-----\n';
      f.files.set(ca, { stat: stat({ size: pem.length }), content: pem });
      f.files.get(file).content = `DATABASE_URL=${helper.runtimeUrl(password, ca)}\n`;
      const lstat = f.deps.io.lstat;
      f.deps.io.lstat = async (p) => {
        if (p === ca) throw err('EACCES');
        return lstat(p);
      };
    }
    if (change === 'nest-missing') {
      f.deps.io.access = async () => {
        throw err('ENOENT');
      };
    }
    if (change === 'nest-denied') {
      f.deps.io.access = async () => {
        throw err('EACCES');
      };
    }
    f.deps.spawn = () => assert.fail('must not spawn');
    assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
    assert.deepEqual(f.output, [expected]);
  }
});
test('config is data, not shell code, including at the dev entrypoint', async () => {
  requireHelper();
  const f = checker();
  f.files.get(file).content =
    `DATABASE_URL=${helper.runtimeUrl(password)};$(touch /synthetic-marker)\n`;
  f.deps.spawn = () => assert.fail('must not launch');
  assert.equal(await helper.run(['start', '--ack-api-listener'], f.deps), 1);
  assert.deepEqual(f.output, ['FAIL CONFIG']);
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), '../dev.sh');
  assert.doesNotMatch(readFileSync(entry, 'utf8'), /\bsource\s|\b\.\s+\.env|\b(?:eval|pnpm)\b/);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('bash', [entry, '--unexpected'], {
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /postgresql:|synthetic-marker|fixed_nonsecret/,
  );
});
