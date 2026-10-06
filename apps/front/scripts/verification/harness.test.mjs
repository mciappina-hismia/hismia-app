import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  lstat,
  symlink,
  realpath,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import {
  createScratch,
  linkDependencies,
  cleanEnvironment,
  loopbackOrigin,
  spawnOwned,
  runOwned,
  waitReady,
  buildScratch,
  startScratch,
} from './scratch.mjs';
import { startSyntheticApi, syntheticIdentity } from './synthetic-api.mjs';

// Retain these exclusively synthetic temporary fixtures; never delete caller files.
async function put(root, name, text = 'synthetic') {
  const destination = path.join(root, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, text);
}
async function fixture() {
  const source = await mkdtemp(path.join(tmpdir(), 'hismia-source-'));
  for (const area of ['', 'apps/front', 'packages/types', 'packages/validation']) {
    await put(
      source,
      path.join(area, 'package.json'),
      JSON.stringify({ name: area || 'synthetic-root', dependencies: {} }),
    );
  }
  await put(source, 'tsconfig.base.json', '{}');
  for (const area of ['apps/front', 'packages/types', 'packages/validation']) {
    await put(source, `${area}/tsconfig.json`, '{}');
    await put(source, `${area}/src/index.ts`, 'export const synthetic = true;');
  }
  await put(source, 'apps/front/next.config.mjs', 'export default {};');
  return { source, scratch: await createScratch({ repoRoot: source }) };
}
const node = process.execPath;
async function ownedFixture(scratch, script, args = []) {
  const file = path.join(scratch.root, 'fixture.mjs');
  await writeFile(file, script);
  return spawnOwned({ scratch, node, script: file, args, apiOrigin: 'http://127.0.0.1:32101' });
}
async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('snapshot is an explicit public allowlist with recursive exclusions', async () => {
  const { source } = await fixture();
  const excluded = [
    '.env',
    '.env.local',
    '.git/config',
    '.next/cache/item.js',
    'dist/item.js',
    'node_modules/item.js',
    'private-runtime/item.js',
    '.cache/item.js',
    '.vite/item.json',
    'build/item.js',
    'credentials/item.json',
  ];
  for (const name of excluded) await put(source, `apps/front/src/${name}`);
  await put(source, 'apps/api/src/never.ts');
  await put(source, 'apps/front/public/icon.svg', '<svg/>');
  const scratch = await createScratch({ repoRoot: source });
  assert.match(await readFile(path.join(scratch.front, 'src/index.ts'), 'utf8'), /synthetic/);
  assert.equal(await readFile(path.join(scratch.front, 'public/icon.svg'), 'utf8'), '<svg/>');
  for (const name of excluded) await assert.rejects(access(path.join(scratch.front, 'src', name)));
  await assert.rejects(access(path.join(scratch.root, 'apps/api')));
  await assert.rejects(access(path.join(scratch.root, '.git')));
});

test('snapshot excludes .meta/meta recursively before inspecting metadata symlinks', async () => {
  const { source } = await fixture();
  const excluded = [];
  for (const area of [
    'apps/front/src',
    'apps/front/public',
    'packages/types/src',
    'packages/validation/src',
  ]) {
    for (const name of ['.meta', 'meta']) {
      const relative = `${area}/nested/${name}/synthetic.json`;
      excluded.push(relative);
      await put(source, relative, '{"syntheticMetadata":true}');
    }
  }
  let scratch = await createScratch({ repoRoot: source });
  for (const name of excluded) await assert.rejects(access(path.join(scratch.root, name)));
  const outside = await mkdtemp(path.join(tmpdir(), 'hismia-metadata-'));
  await symlink(outside, path.join(source, 'apps/front/src/.meta'));
  scratch = await createScratch({ repoRoot: source });
  await assert.rejects(access(path.join(scratch.front, 'src/.meta')));
});

test('snapshot rejects symlinks rather than following public or ancestor escapes', async () => {
  const { source } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), 'hismia-outside-'));
  await put(outside, 'public.ts');
  await symlink(path.join(outside, 'public.ts'), path.join(source, 'apps/front/src/escape.ts'));
  await assert.rejects(createScratch({ repoRoot: source }), /symlink/i);
  const root = await mkdtemp(path.join(tmpdir(), 'hismia-ancestor-'));
  await symlink(path.join(source, 'apps'), path.join(root, 'apps'));
  await assert.rejects(createScratch({ repoRoot: root }), /symlink/i);
});

test('workspace imports resolve scratch dist, never the original dist', async () => {
  const { source } = await fixture();
  await put(
    source,
    'apps/front/package.json',
    JSON.stringify({
      dependencies: { '@hismia/types': 'workspace:*', '@hismia/validation': 'workspace:*' },
    }),
  );
  for (const name of ['types', 'validation']) {
    await put(
      source,
      `packages/${name}/package.json`,
      JSON.stringify({ name: `@hismia/${name}`, main: './dist/index.js' }),
    );
    await put(source, `packages/${name}/dist/index.js`, 'module.exports = "original";');
  }
  const scratch = await createScratch({ repoRoot: source });
  await linkDependencies(scratch);
  for (const name of ['types', 'validation']) {
    await assert.rejects(access(path.join(scratch.root, `packages/${name}/dist/index.js`)));
    await put(scratch.root, `packages/${name}/dist/index.js`, 'module.exports = "scratch";');
    const require = createRequire(path.join(scratch.front, 'package.json'));
    assert.equal(require(`@hismia/${name}`), 'scratch');
    assert.equal(
      await realpath(require.resolve(`@hismia/${name}`)),
      path.join(scratch.root, `packages/${name}/dist/index.js`),
    );
  }
});

test('links declared public dependencies without linking whole node_modules', async () => {
  const { source } = await fixture();
  await put(
    source,
    'apps/front/package.json',
    JSON.stringify({ dependencies: { zod: 'synthetic' } }),
  );
  await put(
    source,
    'node_modules/.pnpm/zod-synthetic/node_modules/zod/package.json',
    '{"name":"zod"}',
  );
  await mkdir(path.join(source, 'apps/front/node_modules'), { recursive: true });
  await symlink(
    path.join(source, 'node_modules/.pnpm/zod-synthetic/node_modules/zod'),
    path.join(source, 'apps/front/node_modules/zod'),
  );
  const scratch = await createScratch({ repoRoot: source });
  await linkDependencies(scratch);
  assert.equal((await lstat(path.join(scratch.front, 'node_modules'))).isSymbolicLink(), false);
  assert.equal(
    await realpath(path.join(scratch.front, 'node_modules/zod')),
    await realpath(path.join(source, 'node_modules/.pnpm/zod-synthetic/node_modules/zod')),
  );
  await assert.rejects(access(path.join(scratch.front, 'node_modules/.pnpm')));
});

test('rejects dependency targets outside the public installed store', async () => {
  const { source } = await fixture();
  await put(source, 'apps/front/package.json', '{"dependencies":{"zod":"synthetic"}}');
  await mkdir(path.join(source, 'apps/front/node_modules'), { recursive: true });
  await symlink(
    path.join(source, 'packages/types'),
    path.join(source, 'apps/front/node_modules/zod'),
  );
  const scratch = await createScratch({ repoRoot: source });
  await assert.rejects(linkDependencies(scratch), /dependency/i);
});

test('clean environment contains only explicit synthetic settings', () => {
  const env = cleanEnvironment({
    node,
    home: '/tmp/synthetic-home',
    apiOrigin: 'http://127.0.0.1:32101',
  });
  assert.deepEqual(
    Object.keys(env).sort(),
    [
      'HISMIA_API_ORIGIN',
      'HOME',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_TELEMETRY_DISABLED',
      'PATH',
      'XDG_CONFIG_HOME',
    ].sort(),
  );
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://auth.synthetic.test');
  assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'synthetic-public-key');
  assert.equal(env.HOME, env.XDG_CONFIG_HOME);
  assert.equal(env.NEXT_TELEMETRY_DISABLED, '1');
});

test('origins deny host aliases, credentials, paths and unexpected ports', () => {
  assert.equal(loopbackOrigin('http://127.0.0.1:32101', 32101), 'http://127.0.0.1:32101');
  for (const value of [
    'http://localhost:32101',
    'http://127.0.0.1:32102',
    'https://127.0.0.1:32101',
    'http://x:y@127.0.0.1:32101',
    'http://127.0.0.1:32101/a',
    'http://127.0.0.1:32101?x',
    'http://127.0.0.1:32101#x',
  ]) {
    assert.throws(() => loopbackOrigin(value, 32101), /loopback/i);
  }
});

test('owned command gets sanitized environment and returns exit/quiescence evidence', async () => {
  const { scratch } = await fixture();
  const script = path.join(scratch.root, 'check-env.mjs');
  await writeFile(
    script,
    'if(process.env.NEXT_PUBLIC_SUPABASE_URL!=="https://auth.synthetic.test" || process.env.NODE_OPTIONS || process.env.DATABASE_URL)process.exit(3);',
  );
  const receipt = await runOwned({ scratch, node, script, apiOrigin: 'http://127.0.0.1:32101' });
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.quiescent, true);
  assert.ok(receipt.durationMs >= 0);
});

test('readiness probes only exact loopback and cleanup closes the owned server', async () => {
  const { scratch } = await fixture();
  const port = await unusedPort();
  const owned = await ownedFixture(
    scratch,
    `import {createServer} from 'node:http'; createServer((q,s)=>s.end('synthetic')).listen(${port},'127.0.0.1');`,
  );
  try {
    await waitReady(owned, { origin: `http://127.0.0.1:${port}`, port, timeoutMs: 3000 });
    await assert.rejects(
      waitReady(owned, { origin: `http://localhost:${port}`, port }),
      /loopback/i,
    );
  } finally {
    const receipt = await owned.stop();
    assert.equal(receipt.quiescent, true);
    assert.ok(receipt.signal || receipt.exitCode === 0);
  }
  await assert.rejects(fetch(`http://127.0.0.1:${port}`));
});

test('readiness timeout stops the child and reports bounded failure evidence', async () => {
  const { scratch } = await fixture();
  const port = await unusedPort();
  const owned = await ownedFixture(scratch, 'setInterval(()=>{},1000);');
  await assert.rejects(
    waitReady(owned, { origin: `http://127.0.0.1:${port}`, port, timeoutMs: 100 }),
    (error) => error.message === 'Readiness failed' && error.receipt.quiescent === true,
  );
  assert.equal((await owned.stop()).quiescent, true);
});

test('readiness rejects a child that stops listening while returning HTTP 200', async () => {
  const { scratch } = await fixture();
  const port = await unusedPort();
  const marker = path.join(scratch.root, 'response-served.txt');
  const owned = await ownedFixture(
    scratch,
    `
    import {createServer} from 'node:http';
    import {writeFileSync} from 'node:fs';
    const server = createServer((request, response) => {
      writeFileSync(${JSON.stringify(marker)}, 'served');
      response.end('owned synthetic response');
      server.close();
    });
    server.listen(${port}, '127.0.0.1');
    setInterval(() => {}, 1000);
  `,
  );
  try {
    await assert.rejects(
      waitReady(owned, { origin: `http://127.0.0.1:${port}`, port, timeoutMs: 1500 }),
      (error) => error.message === 'Readiness failed' && error.receipt.quiescent === true,
    );
    assert.equal(await readFile(marker, 'utf8'), 'served');
  } finally {
    await owned.stop();
  }
});

for (const timing of ['already-occupied', 'late-acquisition']) {
  test(`readiness rejects unrelated HTTP 200 despite ${timing} bind collision`, async () => {
    const { scratch } = await fixture();
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    const marker = path.join(scratch.root, 'child-started.txt');
    const bindGate = path.join(scratch.root, 'allow-bind.txt');
    const unrelated = createServer((request, response) =>
      response.end('unrelated synthetic listener'),
    );
    let requests = 0;
    unrelated.on('request', () => requests++);
    const listen = () => new Promise((resolve) => unrelated.listen(port, '127.0.0.1', resolve));
    if (timing === 'already-occupied') await listen();
    const owned = await ownedFixture(
      scratch,
      `
      import {createServer} from 'node:http';
      import {existsSync, writeFileSync} from 'node:fs';
      writeFileSync(${JSON.stringify(marker)}, 'started');
      const server = createServer((request, response) => response.end('owned synthetic listener'));
      server.on('error', () => setTimeout(() => process.exit(17), 200));
      const timer = setInterval(() => {
        if (!existsSync(${JSON.stringify(bindGate)})) return;
        clearInterval(timer);
        server.listen(${port}, '127.0.0.1');
      }, 10);
    `,
    );
    try {
      const readiness = waitReady(owned, { origin, port, timeoutMs: 2000 });
      // Attach the rejection handler immediately, including during fixture startup.
      const rejected = assert.rejects(
        readiness,
        (error) =>
          error.message === 'Readiness failed' &&
          error.receipt.quiescent === true &&
          error.receipt.exitCode === 17,
      );
      void rejected.catch(() => {}); // Still awaited below; avoid an early unhandled rejection.
      if (timing === 'late-acquisition') {
        const deadline = Date.now() + 1000;
        while (Date.now() < deadline) {
          try {
            await access(marker);
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        await access(marker);
        await listen();
      }
      // Release the actual bind attempt only after the unrelated listener owns the port.
      await writeFile(bindGate, 'bind');
      await rejected;
      assert.equal((await owned.stop()).quiescent, true);
      // Cleanup must not kill or close the unrelated listener.
      assert.equal(await (await fetch(origin)).text(), 'unrelated synthetic listener');
      assert.ok(requests >= 1);
    } finally {
      await owned.stop();
      unrelated.closeAllConnections();
      if (unrelated.listening) await new Promise((resolve) => unrelated.close(resolve));
    }
  });
}

test('command failure and timeout preserve exit evidence without child output', async () => {
  const { scratch } = await fixture();
  const file = path.join(scratch.root, 'failure.mjs');
  await writeFile(file, 'console.error("synthetic-output-not-for-report"); process.exit(7);');
  await assert.rejects(
    runOwned({ scratch, node, script: file, apiOrigin: 'http://127.0.0.1:32101' }),
    (error) =>
      error.message === 'Command failed' && error.receipt.exitCode === 7 && error.receipt.quiescent,
  );
  await writeFile(file, 'setInterval(()=>{},1000);');
  await assert.rejects(
    runOwned({ scratch, node, script: file, apiOrigin: 'http://127.0.0.1:32101', timeoutMs: 100 }),
    (error) => error.message === 'Command timed out' && error.receipt.quiescent,
  );
});

test('invalid tool/script inputs are rejected before launch', async () => {
  const { scratch } = await fixture();
  await assert.rejects(
    spawnOwned({
      scratch,
      node: '/bin/sh',
      script: '/tmp/not-owned.mjs',
      apiOrigin: 'http://127.0.0.1:32101',
    }),
    /tool|script/i,
  );
  const file = path.join(scratch.root, 'fixture.mjs');
  await writeFile(file, 'process.exit(0);');
  await assert.rejects(
    spawnOwned({
      scratch,
      node,
      script: file,
      args: ['bad\nargument'],
      apiOrigin: 'http://127.0.0.1:32101',
    }),
    /argument/i,
  );
});

test('scratch build/start orchestration uses fixture CLIs, package-first order and loopback binding', async () => {
  // These are tiny synthetic executables, NOT Next or TypeScript production builds.
  const { source } = await fixture();
  await put(
    source,
    'apps/front/package.json',
    '{"dependencies":{"next":"synthetic","@hismia/types":"workspace:*","@hismia/validation":"workspace:*"}}',
  );
  for (const name of ['types', 'validation']) {
    await put(
      source,
      `packages/${name}/package.json`,
      '{"devDependencies":{"typescript":"synthetic"}}',
    );
  }
  const compiler = path.join(
    source,
    'node_modules/.pnpm/typescript-synthetic/node_modules/typescript',
  );
  await put(
    compiler,
    'bin/tsc',
    `
    const fs = require('node:fs');
    fs.mkdirSync('dist');
    fs.writeFileSync('dist/index.js', 'synthetic');
    fs.appendFileSync('../../order.txt', require('node:path').basename(process.cwd()) + '\\n');
  `,
  );
  const next = path.join(source, 'node_modules/.pnpm/next-synthetic/node_modules/next');
  await put(
    next,
    'dist/bin/next',
    `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args[0] === 'build') {
      for (const name of ['types', 'validation']) fs.accessSync('../../packages/' + name + '/dist/index.js');
      fs.appendFileSync('../../order.txt', 'next\\n');
    } else {
      if (args[1] !== '-H' || args[2] !== '127.0.0.1' || args[3] !== '-p') process.exit(9);
      require('node:http').createServer((request, response) => response.end('synthetic'))
        .listen(Number(args[4]), args[2]);
    }
  `,
  );
  for (const [area, name, target] of [
    ['apps/front', 'next', next],
    ['packages/types', 'typescript', compiler],
    ['packages/validation', 'typescript', compiler],
  ]) {
    await mkdir(path.join(source, area, 'node_modules'), { recursive: true });
    await symlink(target, path.join(source, area, 'node_modules', name));
  }
  const scratch = await createScratch({ repoRoot: source });
  await linkDependencies(scratch);
  const result = await buildScratch(scratch, { node, apiOrigin: 'http://127.0.0.1:32101' });
  assert.equal(result.packages.length, 2);
  assert.equal(result.next.quiescent, true);
  assert.equal(
    await readFile(path.join(scratch.root, 'order.txt'), 'utf8'),
    'types\nvalidation\nnext\n',
  );
  const port = await unusedPort();
  const started = await startScratch(scratch, {
    node,
    apiOrigin: 'http://127.0.0.1:32101',
    port,
    timeoutMs: 3000,
  });
  try {
    assert.equal((await fetch(started.origin)).status, 200);
  } finally {
    assert.equal((await started.owned.stop()).quiescent, true);
  }
});

test('owned process cleanup includes descendants in its dedicated group', async () => {
  const { scratch } = await fixture();
  const pidFile = path.join(scratch.root, 'descendant.txt');
  const owned = await ownedFixture(
    scratch,
    `
    import {spawn} from 'node:child_process';
    import {writeFileSync} from 'node:fs';
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    process.on('SIGTERM', () => child.once('exit', () => process.exit(0)));
    setInterval(() => {}, 1000);
  `,
  );
  try {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      try {
        await access(pidFile);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.equal((await owned.stop()).quiescent, true);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    await owned.stop();
  }
});

test('cleanup escalates only the owned group when SIGTERM is ignored', async () => {
  const { scratch } = await fixture();
  const marker = path.join(scratch.root, 'ready.txt');
  const owned = await ownedFixture(
    scratch,
    `
    import {writeFileSync} from 'node:fs';
    process.on('SIGTERM', () => {});
    writeFileSync(${JSON.stringify(marker)}, 'ready');
    setInterval(() => {}, 1000);
  `,
  );
  try {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      try {
        await access(marker);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    await access(marker);
    const receipt = await owned.stop();
    assert.equal(receipt.signal, 'SIGKILL');
    assert.equal(receipt.quiescent, true);
  } finally {
    await owned.stop();
  }
});

// Import the real shared source without rebuilding this repository or trusting its dist.
// The fixture gets an immutable copy and strips only its TypeScript syntax in memory.
async function realSchema() {
  const { stripTypeScriptTypes } = await import('node:module');
  const file = new URL('../../../../packages/validation/src/account-profile.ts', import.meta.url);
  const text = await readFile(file, 'utf8');
  const require = createRequire(import.meta.url);
  const zod = new URL(`file://${require.resolve('zod')}`).href;
  const js = stripTypeScriptTypes(text, { mode: 'strip' }).replace(
    "from 'zod'",
    `from ${JSON.stringify(zod)}`,
  );
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`))
    .accountProfileSchema;
}

test('synthetic API validates real shared contracts, request shape and deterministic statuses', async () => {
  const schema = await realSchema();
  const api = await startSyntheticApi({ accountProfileSchema: schema, asOf: '2026-01-01' });
  const request = (route, options = {}) =>
    fetch(`${api.origin}${route}`, { ...options, redirect: 'manual' });
  const headers = {
    Authorization: `Bearer ${syntheticIdentity.token}`,
    'Content-Type': 'application/json',
  };
  try {
    assert.match(api.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/me', { method: 'POST', headers })).status, 405);
    assert.equal((await request('/unrelated', { headers })).status, 404);
    const me = await request('/auth/me', { headers });
    assert.deepEqual(await me.json(), {
      sub: syntheticIdentity.subject,
      email: syntheticIdentity.email,
      role: 'authenticated',
    });
    const variants = [
      {
        accountType: 'patient',
        displayName: 'Sintético',
        birthDate: '1990-01-01',
        residenceLocality: 'Sintética',
      },
      {
        accountType: 'professional',
        displayName: 'Sintético',
        specialty: 'Sintética',
        practiceLocality: 'Sintética',
      },
      { accountType: 'institution', name: 'Sintética', type: 'Sintético', location: 'Sintética' },
    ];
    for (const body of variants) {
      api.reset();
      const result = await request('/profiles/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(result.status, 201);
      assert.deepEqual(await result.json(), {
        ...body,
        createdAt: syntheticIdentity.timestamp,
        updatedAt: syntheticIdentity.timestamp,
      });
      assert.equal(
        (
          await request('/profiles/onboarding', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await request('/profiles/onboarding', {
          method: 'POST',
          headers,
          body: JSON.stringify(variants[0]),
        })
      ).status,
      409,
    );
    api.reset();
    for (const body of [
      { ...variants[0], birthDate: '2020-01-01' },
      { ...variants[0], subject: 'forged' },
      { accountType: 'admin' },
    ]) {
      assert.equal(
        (
          await request('/profiles/onboarding', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (await request('/profiles/onboarding', { method: 'POST', headers, body: '{' })).status,
      400,
    );
    assert.equal(
      (
        await request('/profiles/onboarding', {
          method: 'POST',
          headers: { Authorization: headers.Authorization },
          body: '{}',
        })
      ).status,
      415,
    );
    assert.equal(
      (await request('/profiles/onboarding', { method: 'POST', headers, body: 'x'.repeat(9000) }))
        .status,
      413,
    );
    const report = api.report();
    assert.ok(report.requests > 0);
    assert.ok(report.statuses['400'] >= 4);
    assert.ok(report.routes['/profiles/onboarding'] > 0);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-bearer|forged|Authorization/);
  } finally {
    assert.equal((await api.close()).quiescent, true);
  }
  await assert.rejects(request('/auth/me', { headers }));
});
