import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  createScratch,
  linkDependencies,
  buildScratch,
  startScratch,
  loopbackOrigin,
} from './verification/scratch.mjs';
import { startSyntheticApi, syntheticIdentity } from './verification/synthetic-api.mjs';
import { runBrowser, routes } from './verification/browser.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export function parseOptions(args) {
  const names = {
    '--playwright-module': 'playwrightModule',
    '--chrome': 'chrome',
    '--axe': 'axe',
    '--next-port': 'nextPort',
    '--stub-port': 'stubPort',
    '--samples': 'samples',
    '--as-of': 'asOf',
    '--dependency-root': 'dependencyRoot',
  };
  const options = { samples: 3, asOf: '2026-01-01' };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const name = names[args[i]];
    if (!name || seen.has(name) || typeof args[i + 1] !== 'string')
      throw new Error('Invalid CLI options');
    seen.add(name);
    options[name] = args[i + 1];
  }
  for (const name of [
    'playwrightModule',
    'chrome',
    'axe',
    ...(options.dependencyRoot === undefined ? [] : ['dependencyRoot']),
  ]) {
    if (
      typeof options[name] !== 'string' ||
      !path.isAbsolute(options[name]) ||
      /[\u0000-\u001f\u007f]/.test(options[name]) ||
      options[name]
        .split(path.sep)
        .some((part) =>
          /^(?:\.env.*|\.git|\.ssh|secrets?|credentials?|private-runtime.*)$/i.test(part),
        )
    )
      throw new Error('Invalid public tool path');
  }
  for (const name of ['nextPort', 'stubPort', 'samples']) {
    if (!/^\d+$/.test(String(options[name]))) throw new Error('Invalid numeric option');
    options[name] = Number(options[name]);
  }
  loopbackOrigin(`http://127.0.0.1:${options.nextPort}`, options.nextPort);
  loopbackOrigin(`http://127.0.0.1:${options.stubPort}`, options.stubPort);
  if (options.nextPort === options.stubPort || options.samples < 3 || options.samples > 10)
    throw new Error('Invalid port/sample configuration');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.asOf) ||
    new Date(options.asOf + 'T00:00:00Z').toISOString().slice(0, 10) !== options.asOf
  )
    throw new Error('Invalid reference date');
  return Object.freeze(options);
}
async function validateTools(options) {
  if (
    !options.playwrightModule.endsWith('/playwright/index.mjs') ||
    !options.chrome.endsWith('/Google Chrome.app/Contents/MacOS/Google Chrome') ||
    !options.axe.endsWith('/axe-core/axe.js')
  )
    throw new Error('Unsupported public tools');
  for (const file of [options.playwrightModule, options.chrome, options.axe]) {
    if (!(await lstat(file)).isFile()) throw new Error('Public tool unavailable');
    await access(file, file === options.chrome ? constants.X_OK : constants.R_OK);
  }
}
async function snapshotDigest(root) {
  const hash = createHash('sha256');
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      if (directory === root && name === 'home') continue;
      const file = path.join(directory, name);
      const stat = await lstat(file);
      if (stat.isDirectory()) await visit(file);
      else if (stat.isFile())
        hash
          .update(path.relative(root, file))
          .update('\0')
          .update(await readFile(file))
          .update('\0');
      else throw new Error('Nonregular snapshot entry');
    }
  }
  await visit(root); // Before dependency links or builds, in the fresh public snapshot only.
  return hash.digest('hex');
}
const profiles = [
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
async function localRequest(origin, pathname, options = {}) {
  loopbackOrigin(origin);
  assert.ok(pathname.startsWith('/') && !pathname.startsWith('//'));
  return fetch(origin + pathname, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
}

/** These requests traverse the real production Next server, never a browser interception. */
export async function verifyRewrites(origin, api) {
  const headers = {
    Authorization: `Bearer ${syntheticIdentity.token}`,
    'Content-Type': 'application/json',
  };
  let checks = 0;
  async function status(route, expected, options = {}, expectedBody) {
    const response = await localRequest(origin, route, options);
    assert.equal(response.status, expected, 'Rewrite status mismatch');
    if (expectedBody)
      assert.deepEqual(
        await response.json(),
        expectedBody,
        'Rewrite body/header forwarding mismatch',
      );
    else await response.body?.cancel();
    checks++;
  }
  await status(
    '/api/hismia/auth/me',
    200,
    { headers },
    { sub: syntheticIdentity.subject, email: syntheticIdentity.email, role: 'authenticated' },
  );
  await status('/api/hismia/auth/me', 401);
  await status('/api/hismia/auth/me', 405, { method: 'POST', headers });
  for (const body of profiles) {
    api.reset();
    const options = { method: 'POST', headers, body: JSON.stringify(body) };
    const persisted = {
      ...body,
      createdAt: syntheticIdentity.timestamp,
      updatedAt: syntheticIdentity.timestamp,
    };
    await status('/api/hismia/profiles/onboarding', 201, options, persisted);
    await status('/api/hismia/profiles/onboarding', 200, options, persisted);
  }
  await status('/api/hismia/profiles/onboarding', 409, {
    method: 'POST',
    headers,
    body: JSON.stringify(profiles[0]),
  });
  api.reset();
  await status('/api/hismia/profiles/onboarding', 400, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...profiles[0], birthDate: '2099-01-01' }),
  });
  await status('/api/hismia/profiles/onboarding', 401, { method: 'POST', body: '{}' });
  await status('/api/hismia/profiles/onboarding', 415, {
    method: 'POST',
    headers: { Authorization: headers.Authorization },
    body: '{}',
  });
  await status('/api/hismia/profiles/onboarding', 405, { headers });
  const before = api.report().requests;
  await status('/api/hismia/not-forwarded', 404, { headers });
  assert.equal(api.report().requests, before, 'Unrelated route forwarded');
  return {
    passed: true,
    checks,
    statuses: [200, 201, 400, 401, 404, 405, 409, 415],
    fixture: api.report(),
  };
}
function zeroSizes() {
  return { js: { raw: 0, gzip: 0, brotli: 0 }, css: { raw: 0, gzip: 0, brotli: 0 } };
}
export function summarizeAssets(routeFiles, buffers) {
  const references = new Map();
  for (const [route, files] of Object.entries(routeFiles)) {
    for (const name of new Set(files)) {
      if (!references.has(name)) references.set(name, []);
      references.get(name).push(route);
    }
  }
  const assets = [...references.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, referencedRoutes]) => {
      const bytes = buffers[name];
      if (!Buffer.isBuffer(bytes) || !/\.(js|css)$/.test(name))
        throw new Error('Invalid route asset');
      return {
        name,
        kind: name.endsWith('.css') ? 'css' : 'js',
        scope: referencedRoutes.length > 1 ? 'shared' : 'route',
        referencedRoutes,
        raw: bytes.length,
        gzip: gzipSync(bytes).length,
        brotli: brotliCompressSync(bytes).length,
      };
    });
  const totals = {};
  for (const route of Object.keys(routeFiles)) {
    totals[route] = { shared: zeroSizes(), route: zeroSizes(), total: zeroSizes() };
    for (const asset of assets.filter((item) => item.referencedRoutes.includes(route))) {
      for (const field of ['raw', 'gzip', 'brotli']) {
        totals[route][asset.scope][asset.kind][field] += asset[field];
        totals[route].total[asset.kind][field] += asset[field];
      }
    }
  }
  return {
    method:
      'unique JS/CSS referenced by initial production HTML; shared means referenced by multiple tested routes',
    assets,
    routes: totals,
    limitations: [
      'Not a full lazy-loaded asset graph',
      'Compression computed offline; not transferred bytes',
    ],
  };
}
export async function collectAssets(front, origin) {
  const routeFiles = {};
  const buffers = {};
  const root = path.join(front, '.next');
  if ((await realpath(root)) !== root) throw new Error('Invalid scratch build output');
  for (const route of routes) {
    const response = await localRequest(origin, route);
    assert.equal(response.status, 200, 'Route HTML unavailable');
    const html = await response.text();
    if (Buffer.byteLength(html) > 2_000_000) throw new Error('Route HTML too large');
    const files = [
      ...html.matchAll(
        /(?:src|href)=["']\/_next\/(static\/[a-zA-Z0-9_./-]+\.(?:js|css))(?:\?[^"']*)?["']/g,
      ),
    ].map((match) => match[1]);
    assert.ok(
      files.some((file) => file.endsWith('.js')),
      'Missing production route JavaScript',
    );
    routeFiles[route] = files;
    for (const name of files) {
      if (buffers[name]) continue;
      const file = await realpath(path.join(root, name));
      if (
        !file.startsWith(path.join(root, 'static') + path.sep) ||
        (await lstat(file)).size > 20_000_000
      )
        throw new Error('Invalid scratch asset path');
      buffers[name] = await readFile(file);
    }
  }
  return summarizeAssets(routeFiles, buffers);
}

function safeReceipt(receipt) {
  const result = {};
  if (!receipt || typeof receipt !== 'object') return result;
  for (const field of ['pid', 'exitCode', 'durationMs']) {
    if (
      receipt[field] === null ||
      (typeof receipt[field] === 'number' && Number.isFinite(receipt[field]))
    )
      result[field] = receipt[field];
  }
  if (receipt.signal === null || /^SIG[A-Z0-9]+$/.test(receipt.signal ?? ''))
    result.signal = receipt.signal;
  if (typeof receipt.quiescent === 'boolean') result.quiescent = receipt.quiescent;
  return result;
}

/** Narrow lifecycle ports permit fixture tests; defaults always use the real B/B1 helpers. */
export async function executeVerification(options, overrides = {}) {
  const ports = {
    validateTools,
    createScratch,
    linkDependencies,
    buildScratch,
    startScratch,
    startSyntheticApi,
    verifyRewrites,
    collectAssets,
    runBrowser,
    loadSchema: async (scratch) =>
      (
        await import(
          pathToFileURL(path.join(scratch.root, 'packages/validation/dist/index.js')).href
        )
      ).accountProfileSchema,
    ...overrides,
  };
  const report = {
    schemaVersion: 1,
    status: 'failed',
    phase: 'tools',
    configuration: {
      nextPort: options.nextPort,
      stubPort: options.stubPort,
      samples: options.samples,
      asOf: options.asOf,
    },
    cleanup: {},
  };
  let scratch;
  let api;
  let next;
  try {
    await ports.validateTools(options);
    report.phase = 'snapshot';
    scratch = await ports.createScratch({ repoRoot });
    report.source = {
      publicSnapshotSha256: await snapshotDigest(scratch.root),
      ...scratch.snapshot,
    };
    await ports.linkDependencies(scratch, { dependencyRoot: options.dependencyRoot });
    report.phase = 'build';
    const apiOrigin = loopbackOrigin(`http://127.0.0.1:${options.stubPort}`, options.stubPort);
    const started = performance.now();
    report.build = {
      receipts: await ports.buildScratch(scratch, { node: process.execPath, apiOrigin }),
      elapsedMs: performance.now() - started,
    };
    report.phase = 'synthetic-api';
    const accountProfileSchema = await ports.loadSchema(scratch);
    api = await ports.startSyntheticApi({
      accountProfileSchema,
      asOf: options.asOf,
      port: options.stubPort,
    });
    assert.equal(api.origin, apiOrigin, 'Synthetic API port mismatch');
    report.phase = 'next-start';
    next = await ports.startScratch(scratch, {
      node: process.execPath,
      apiOrigin,
      port: options.nextPort,
    });
    report.phase = 'rewrites';
    report.rewrites = await ports.verifyRewrites(next.origin, api);
    report.phase = 'assets';
    report.assets = await ports.collectAssets(scratch.front, next.origin);
    report.phase = 'browser';
    report.browser = await ports.runBrowser({ ...options, scratch, origin: next.origin, api });
    report.status = 'passed';
    report.phase = 'complete';
  } catch (error) {
    // Never persist provider/Playwright error text, URL query, body, verifier or token.
    const categories = [
      'dependency-store-untrusted',
      'dependency-missing',
      'dependency-target-outside-store',
    ];
    report.failure = {
      category: categories.includes(error.category) ? error.category : 'verification-failed',
    };
    if (error.receipt) report.cleanup.failedCommand = safeReceipt(error.receipt);
    if (error.browserEvidence) report.browser = error.browserEvidence;
  } finally {
    for (const [name, close] of [
      ['next', next && (() => next.owned.stop())],
      ['api', api && (() => api.close())],
    ]) {
      if (!close) continue;
      try {
        report.cleanup[name] = safeReceipt(await close());
        if (!report.cleanup[name].quiescent) throw new Error('Cleanup incomplete');
      } catch (error) {
        report.status = 'failed';
        report.cleanup[name] = {
          ...report.cleanup[name],
          ...safeReceipt(error.receipt),
          quiescent: false,
        };
      }
    }
  }
  if (scratch) {
    await writeFile(
      path.join(scratch.root, 'critical-flows-summary.json'),
      JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    report.reportFile = path.join(scratch.root, 'critical-flows-summary.json');
  }
  return report;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const report = await executeVerification(parseOptions(process.argv.slice(2)));
    console.log(JSON.stringify(report));
    if (report.status !== 'passed') process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify({
        status: 'failed',
        phase: 'configuration-or-report',
        failure: { category: 'verification-failed' },
      }),
    );
    process.exitCode = 1;
  }
}
