import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the separately authorized database verification actor executes this file.
const api = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const repository = realpathSync(resolve(api, '../..'));
const bin = '/opt/homebrew/opt/postgresql@18/bin';
const base = join(api, 'node_modules/.cache/pg');
const assertContainedParents = (target) => {
  const relative = target.slice(repository.length + 1);
  if (!target.startsWith(`${repository}/`)) throw new Error('Output escapes repository');
  let current = repository;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error(`Symlink output parent refused: ${current}`);
    if (existsSync(current) && !lstatSync(current).isDirectory())
      throw new Error('Output parent is not a directory');
  }
};
assertContainedParents(base);
const root = join(base, randomBytes(4).toString('hex'));
if (existsSync(root)) throw new Error('Existing cluster refused');
const data = join(root, 'd');
const socket = join(root, 's');
// PostgreSQL's Unix socket sockaddr limit is platform dependent; refuse rather than use TCP.
if (Buffer.byteLength(join(socket, '.s.PGSQL.5432')) >= 104)
  throw new Error(`Socket path too long: ${socket}`);
for (const tool of ['initdb', 'pg_ctl', 'psql', 'postgres']) {
  if (!existsSync(join(bin, tool))) throw new Error(`Required binary unavailable: ${tool}`);
}
mkdirSync(base, { recursive: true, mode: 0o700 });
mkdirSync(root, { mode: 0o700 });
mkdirSync(socket, { mode: 0o700 });
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C' };
const children = new Set();
let interrupted = false;
let signalCode;
const run = (command, args, { input, env = {}, quiet = false } = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: api,
      detached: true, // Private child process group, including pnpm's Vitest descendants.
      env: { ...cleanEnv, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.add(child);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (!quiet) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (!quiet) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      if (code !== 0) reject(new Error(`${command} exited ${code}`));
      else resolveRun(output);
    });
    child.stdin.end(input);
  });
// Do not race shutdown with child commands. A received signal terminates only recorded children,
// then the foreground promise settles and finally stops the exact recorded cluster.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    signalCode = signal === 'SIGINT' ? 130 : 143;
    for (const child of children) {
      if (!child.pid) continue;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') console.error('Could not terminate recorded child group');
      }
    }
  });
}
const ensureLive = () => {
  if (interrupted) throw new Error('Verification interrupted');
};
const password = () => randomBytes(24).toString('hex');
const bootstrapPassword = password();
const ownerPassword = password();
const runtimePassword = password();
const connection = (user, pass) => {
  const url = new URL(`postgresql://${user}:${pass}@localhost:5432/profile_test`);
  url.searchParams.set('host', socket);
  url.searchParams.set('connection_limit', '1');
  return url.toString();
};
console.log(`Fresh synthetic cluster output (retained): ${root}`);
writeFileSync(
  join(root, 'manifest.json'),
  JSON.stringify({ root, data, socket, bin, database: 'profile_test' }, null, 2),
  { mode: 0o600 },
);
let failure;
try {
  await run(join(bin, 'initdb'), [
    '-D',
    data,
    '-U',
    'synthetic_bootstrap',
    '--auth-local=trust',
    '--auth-host=reject',
    '--encoding=UTF8',
    '--no-locale',
  ]);
  ensureLive();
  await run(join(bin, 'pg_ctl'), [
    '-D',
    data,
    '-l',
    join(root, 'postgres.log'),
    '-o',
    `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,
    '-w',
    'start',
  ]);
  ensureLive();
  const psqlArgs = [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    socket,
    '-U',
    'synthetic_bootstrap',
    '-d',
    'postgres',
  ];
  await run(join(bin, 'psql'), psqlArgs, {
    quiet: true,
    input: `
    ALTER ROLE synthetic_bootstrap PASSWORD '${bootstrapPassword}';
    CREATE ROLE profile_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB CREATEROLE PASSWORD '${ownerPassword}';
    CREATE ROLE profile_login LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${runtimePassword}';
    CREATE DATABASE profile_test OWNER profile_owner;
  `,
  });
  writeFileSync(
    join(data, 'pg_hba.conf'),
    'local all all scram-sha-256\nhost all all all reject\n',
    { mode: 0o600 },
  );
  await run(join(bin, 'pg_ctl'), ['-D', data, 'reload']);
  ensureLive();
  // Read one exact checked-in migration; never use ambient DATABASE_URL or dotenv.
  const migration = readFileSync(
    join(api, 'prisma/migrations/20260717000000_profiles/migration.sql'),
    'utf8',
  );
  await run(
    join(bin, 'psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-U', 'profile_owner', '-d', 'profile_test'],
    { input: migration, env: { PGPASSWORD: ownerPassword } },
  );
  await run(
    join(bin, 'psql'),
    [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-U',
      'synthetic_bootstrap',
      '-d',
      'profile_test',
    ],
    {
      quiet: true,
      input: 'GRANT hismia_profile_runtime TO profile_login;',
      env: { PGPASSWORD: bootstrapPassword },
    },
  );
  ensureLive();
  await run('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.database.config.ts'], {
    env: {
      PROFILE_TEST_ROOT: root,
      PROFILE_TEST_RUNTIME_URL: connection('profile_login', runtimePassword),
      PROFILE_TEST_OWNER_URL: connection('profile_owner', ownerPassword),
    },
  });
} catch (error) {
  failure = error;
} finally {
  // Also inspect a partially successful pg_ctl start. Never target a default/existing cluster.
  if (existsSync(join(data, 'postmaster.pid'))) {
    try {
      await run(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
    } catch (error) {
      failure = error;
    }
  }
  if (existsSync(join(data, 'postmaster.pid'))) {
    const pid = readFileSync(join(data, 'postmaster.pid'), 'utf8').split('\n')[0];
    console.error(`BLOCKER: exact test-owned process may remain active; PID=${pid}; data=${data}`);
    failure = new Error('Cluster stop not established');
  } else {
    console.log(
      `STOP evidence: no postmaster.pid at ${data}; retained synthetic artifacts: ${root}`,
    );
  }
}
if (failure) {
  console.error(failure.message);
  process.exitCode = signalCode ?? 1;
}
