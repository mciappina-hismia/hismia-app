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
import {
  classifyRequest,
  installNetworkBoundary,
  packageMetrics,
  contrastRatio,
  syntheticAuth,
  browserSession,
  scrubAxeDiagnostics,
  measure,
  measureRoute,
  routes,
  scrubActionDiagnostic,
} from './browser.mjs';
import { parseOptions, summarizeAssets, executeVerification } from '../verify-critical-flows.mjs';

const measurementSteps = [
  'goto',
  'status',
  'heading',
  'observe',
  'observer-read',
  'interaction-start',
  'tab',
  'frames',
  'interaction-read',
  'focus-check',
];
function measurementPage(
  failAt,
  state = {
    state: 'login-required',
    counts: { heading: 1, readyForm: 0, loginLink: 1, status: 0 },
  },
) {
  const fail = (step) => {
    if (step === failAt) throw new Error('synthetic-token/raw-message');
  };
  const evaluations = [
    'observer-read',
    'interaction-start',
    'frames',
    'interaction-read',
    'focus-check',
  ];
  let index = 0;
  return {
    async goto() {
      index = 0;
      fail('goto');
      return {
        status() {
          fail('status');
          return 200;
        },
      };
    },
    locator: () => ({
      async waitFor() {
        fail('heading');
      },
    }),
    async waitForTimeout() {
      fail('observe');
    },
    keyboard: {
      async press() {
        fail('tab');
      },
    },
    async evaluate(fn) {
      if (fn.name === 'navigationPageState') return typeof state === 'function' ? state() : state;
      const step = evaluations[index++];
      fail(step);
      if (step === 'observer-read') return { fcp: null, lcp: null, cls: 0 };
      if (step === 'interaction-read') return 10;
      if (step === 'focus-check') return true;
    },
  };
}
const preparedConditions = [
  'prepared-auth-context/first-measured-navigation',
  'prepared-auth-context/repeat-measured-navigation',
];
function benchmarkPage(failure) {
  const page = measurementPage(failure);
  const calls = [];
  const goto = page.goto;
  page.goto = async (url, options) => {
    calls.push('goto:' + new URL(url).pathname);
    return goto(url, options);
  };
  const evaluate = page.evaluate;
  page.evaluate = async (fn) => {
    if (fn.name !== 'navigationPageState')
      calls.push(fn.toString().includes('__hismiaInteraction =') ? 'timer-start' : 'evaluate');
    return evaluate(fn);
  };
  const observe = page.waitForTimeout;
  page.waitForTimeout = async (ms) => {
    calls.push('observe:' + ms);
    return observe(ms);
  };
  page.getByRole = (role, options) => ({
    async waitFor(wait) {
      assert.equal(role, 'button');
      assert.equal(options.name, 'Guardar perfil');
      assert.equal(wait.state, 'visible');
      calls.push('ready-visible');
      if (failure === 'ready-form') throw new Error('synthetic-ready-failure');
    },
  });
  page.waitForFunction = async () => {
    calls.push('ready-enabled');
    if (failure === 'ready-enabled') throw new Error('synthetic-ready-failure');
  };
  return { page, calls };
}
test('only onboarding prepares login once outside both measured navigations in the same session', async () => {
  for (const route of routes) {
    const { page, calls } = benchmarkPage();
    const auth = {};
    const evidence = { navigations: [] };
    let logins = 0;
    await measureRoute(
      page,
      'http://127.0.0.1:32111',
      route,
      1,
      auth,
      evidence,
      async (receivedPage, origin, receivedAuth) => {
        assert.equal(receivedPage, page);
        assert.equal(receivedAuth, auth);
        assert.equal(origin, 'http://127.0.0.1:32111');
        logins++;
        calls.push('login');
      },
    );
    assert.equal(logins, route === '/onboarding' ? 1 : 0);
    assert.deepEqual(
      evidence.navigations.map((item) => item.cache),
      route === '/onboarding' ? preparedConditions : ['fresh-context', 'repeat-context'],
    );
    assert.equal(calls.filter((call) => call === 'goto:' + route).length, 2);
    assert.ok(
      evidence.navigations.every(
        (item) =>
          item.route === route &&
          item.sample === 1 &&
          item.fcpMs === null &&
          item.unavailable.includes('fcpMs'),
      ),
    );
    if (route === '/onboarding') {
      assert.equal(calls[0], 'login');
      assert.equal(calls.filter((call) => call === 'observe:1000').length, 2);
      assert.equal(calls.filter((call) => call === 'ready-enabled').length, 2);
      assert.equal(calls.filter((call) => call === 'timer-start').length, 2);
      for (const index of calls.flatMap((call, index) => (call === 'timer-start' ? [index] : [])))
        assert.equal(calls[index - 1], 'ready-enabled');
    } else assert.ok(!calls.includes('ready-visible') && !calls.includes('ready-enabled'));
  }
});
test('preparation and readiness failures remain rejected with distinct finite receipts', async () => {
  for (const failure of ['login', 'ready-form', 'ready-enabled', 'focus-check']) {
    const { page, calls } = benchmarkPage(failure);
    const evidence = { navigations: [] };
    await assert.rejects(
      measureRoute(page, 'http://127.0.0.1:32111', '/onboarding', 1, {}, evidence, async () => {
        calls.push('login');
        if (failure === 'login') throw new Error('synthetic-login-failure');
      }),
    );
    assert.equal(evidence.failedAction.scope, failure === 'login' ? 'preparation' : 'measurement');
    assert.equal(evidence.failedAction.step, failure === 'ready-enabled' ? 'ready-form' : failure);
    assert.equal(evidence.failedAction.cache, preparedConditions[0]);
    assert.equal(evidence.navigations.length, 0);
    if (failure !== 'focus-check') assert.ok(!calls.includes('timer-start'));
  }
  for (const cache of preparedConditions)
    assert.equal(
      scrubActionDiagnostic({ scope: 'measurement', step: 'ready-form', cache }).cache,
      cache,
    );
  assert.equal(
    scrubActionDiagnostic({
      scope: 'measurement',
      step: 'ready-form',
      cache: 'secret-unapproved-condition',
    }).cache,
    null,
  );
});

test('prepared readiness predicate requires visible enabled controls and repeat failures retain first sample', async () => {
  const { runInNewContext } = await import('node:vm');
  const { page } = benchmarkPage();
  let predicate;
  page.waitForFunction = async (fn) => {
    predicate = fn;
  };
  const evidence = { navigations: [] };
  await measureRoute(
    page,
    'http://127.0.0.1:32111',
    '/onboarding',
    2,
    {},
    evidence,
    async () => {},
  );
  for (const [disabled, width, expected] of [
    [false, 20, true],
    [true, 20, false],
    [false, 0, false],
  ]) {
    const controls = [
      {
        tagName: 'BUTTON',
        type: 'submit',
        textContent: 'Guardar perfil',
        disabled: false,
        getBoundingClientRect: () => ({ width: 20, height: 20 }),
      },
      { tagName: 'INPUT', disabled, getBoundingClientRect: () => ({ width, height: 20 }) },
    ];
    assert.equal(
      runInNewContext(`(${predicate.toString()})()`, {
        document: { querySelectorAll: () => [{ querySelectorAll: () => controls }] },
      }),
      expected,
    );
  }
  const second = measurementPage('focus-check');
  let visits = 0;
  const goto = page.goto;
  const evaluate = page.evaluate;
  page.goto = async (...args) => {
    visits++;
    return goto(...args);
  };
  page.evaluate = (fn) => (visits === 2 ? second.evaluate(fn) : evaluate(fn));
  const failed = { navigations: [] };
  await assert.rejects(
    measureRoute(page, 'http://127.0.0.1:32111', '/onboarding', 3, {}, failed, async () => {}),
  );
  assert.equal(failed.navigations.length, 1);
  assert.equal(failed.navigations[0].cache, preparedConditions[0]);
  assert.equal(failed.failedAction.cache, preparedConditions[1]);
  assert.equal(failed.failedAction.step, 'focus-check');
});

for (const step of measurementSteps) {
  test(`measurement failure retains finite ${step} evidence and remains rejected`, async () => {
    const evidence = {};
    await assert.rejects(
      measure(
        measurementPage(step),
        'http://127.0.0.1:32111',
        '/onboarding',
        'fresh-context',
        1,
        evidence,
      ),
      (error) => {
        assert.equal(error.message, 'synthetic-token/raw-message');
        assert.equal(evidence.failedAction.step, step);
        assert.equal(evidence.failedAction.scope, 'measurement');
        assert.equal(evidence.failedAction.page.state, 'login-required');
        assert.doesNotMatch(JSON.stringify(evidence), /synthetic-token|raw-message/);
        return true;
      },
    );
  });
}
test('action projection rejects untrusted keys/enums/routes/counts and separates postcheck/cleanup', () => {
  const raw = {
    scope: 'measurement',
    step: 'raw-secret',
    route: '/onboarding?token=secret',
    cache: 'secret',
    sample: 99,
    page: {
      state: 'raw-state',
      counts: { heading: Infinity, readyForm: -1, loginLink: 21, status: 2, secret: 'token' },
    },
    password: 'secret',
  };
  const projected = scrubActionDiagnostic(raw);
  assert.deepEqual(projected, {
    scope: 'measurement',
    step: 'unknown',
    route: null,
    cache: null,
    sample: null,
    page: {
      state: 'unknown',
      counts: { heading: null, readyForm: null, loginLink: null, status: 2 },
    },
  });
  assert.doesNotMatch(JSON.stringify(projected), /secret|token|raw-state/);
  assert.equal(scrubActionDiagnostic({ scope: 'postcheck', step: 'network' }).step, 'network');
  assert.equal(scrubActionDiagnostic({ scope: 'cleanup', step: 'context-close' }).scope, 'cleanup');
  assert.equal(scrubActionDiagnostic({ scope: 'cleanup', step: 'heading' }).step, 'unknown');
});
test('measurement diagnosis cannot hang or replace the primary failure; successful metrics stay unavailable', async () => {
  for (const state of [
    () => {
      throw new Error('secret');
    },
    () => new Promise(() => {}),
  ]) {
    const evidence = {};
    await assert.rejects(
      measure(
        measurementPage('heading', state),
        'http://127.0.0.1:32111',
        '/onboarding',
        'repeat-context',
        2,
        evidence,
      ),
      /synthetic-token\/raw-message/,
    );
    assert.equal(evidence.failedAction.page, null);
  }
  const result = await measure(
    measurementPage(null),
    'http://127.0.0.1:32111',
    '/onboarding',
    'fresh-context',
    1,
    {},
  );
  assert.equal(result.fcpMs, null);
  assert.ok(result.unavailable.includes('fcpMs'));
});

test('page observation leaves ambiguous setup/unavailable states unknown', async () => {
  const { runInNewContext } = await import('node:vm');
  for (const text of ['Configuración requerida.', 'No se pudo verificar tu cuenta.']) {
    const page = measurementPage('heading');
    const evaluate = page.evaluate;
    page.evaluate = async (fn) =>
      fn.name === 'navigationPageState'
        ? runInNewContext(`(${fn.toString()})()`, {
            document: {
              querySelectorAll: (selector) =>
                selector === 'h1'
                  ? [{ textContent: 'Completar perfil' }]
                  : selector === '[role="alert"]'
                    ? [{ textContent: text }]
                    : [],
            },
          })
        : evaluate(fn);
    const evidence = {};
    await assert.rejects(
      measure(page, 'http://127.0.0.1:32111', '/onboarding', 'fresh-context', 1, evidence),
    );
    assert.equal(evidence.failedAction.page.state, 'unknown');
    assert.equal(evidence.failedAction.page.counts.heading, 1);
    assert.doesNotMatch(JSON.stringify(evidence), /Configuración|verificar/);
  }
});

test('cleanup failure cannot misattribute an earlier measurement failure', async () => {
  const evidence = { stage: 'navigation', cleanup: {} };
  const child = { exitCode: null, signalCode: null };
  await assert.rejects(
    browserSession(
      {
        chromium: {
          launchServer: async () => ({
            wsEndpoint: () => 'synthetic',
            process: () => child,
            close: async () => {
              throw new Error('secret');
            },
            kill: async () => {
              child.signalCode = 'SIGKILL';
            },
          }),
          connect: async () => ({}),
        },
        launchOptions: {},
        timeoutMs: 1000,
        cleanupMs: 50,
        evidence,
      },
      async () => {
        await measure(
          measurementPage('heading'),
          'http://127.0.0.1:32111',
          '/onboarding',
          'fresh-context',
          1,
          evidence,
        );
      },
    ),
    (error) => {
      assert.equal(error.browserEvidence.failure.action.step, 'heading');
      assert.equal(error.browserEvidence.failure.action.scope, 'measurement');
      assert.equal(error.browserEvidence.cleanup.action.step, 'server-close');
      return true;
    },
  );
});

test('safe action receipts survive browser/orchestration failure with cleanup still observed', async () => {
  for (const scope of ['measurement', 'postcheck', 'cleanup']) {
    const evidence = { stage: 'synthetic', cleanup: {} };
    const child = { exitCode: null, signalCode: null };
    const server = {
      wsEndpoint: () => 'synthetic',
      process: () => child,
      async close() {
        child.exitCode = 0;
        if (scope === 'cleanup') throw new Error('secret');
      },
      async kill() {
        child.signalCode = 'SIGKILL';
      },
    };
    const root = await mkdtemp(path.join(tmpdir(), 'hismia-action-report-'));
    const report = await executeVerification(parseOptions(cliArgs), {
      validateTools: async () => {},
      createScratch: async () => ({ root, front: root }),
      linkDependencies: async () => {},
      buildScratch: async () => ({}),
      loadSchema: async () => ({}),
      startSyntheticApi: async () => ({
        origin: 'http://127.0.0.1:32112',
        close: async () => ({ quiescent: true }),
      }),
      startScratch: async () => ({
        origin: 'http://127.0.0.1:32111',
        owned: { stop: async () => ({ quiescent: true }) },
      }),
      verifyRewrites: async () => ({}),
      collectAssets: async () => ({}),
      runBrowser: async () => {
        await browserSession(
          {
            chromium: { launchServer: async () => server, connect: async () => ({}) },
            launchOptions: {},
            timeoutMs: 1000,
            cleanupMs: 50,
            evidence,
          },
          async () => {
            if (scope === 'measurement')
              await measure(
                measurementPage('focus-check'),
                'http://127.0.0.1:32111',
                '/onboarding',
                'repeat-context',
                1,
                evidence,
              );
            if (scope === 'postcheck') {
              evidence.action = { scope: 'postcheck', step: 'network', secret: 'token' };
              throw new Error('secret');
            }
          },
        );
      },
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.browser.failure.action.scope, scope);
    assert.equal(
      report.browser.failure.action.step,
      scope === 'measurement' ? 'focus-check' : scope === 'postcheck' ? 'network' : 'server-close',
    );
    assert.equal(report.cleanup.next.quiescent, true);
    assert.equal(report.cleanup.api.quiescent, true);
    assert.doesNotMatch(JSON.stringify(report.browser.failure), /secret|token/);
  }
});

test('axe diagnostics retain safe selectors and finite color metrics, not raw nodes', () => {
  const result = scrubAxeDiagnostics({
    version: '4.13.0',
    passes: [],
    violations: [
      {
        id: 'color-contrast',
        nodes: [
          {
            target: ['form > p.notice:nth-child(2)'],
            html: '<p>synthetic-password</p>',
            failureSummary: 'synthetic-token',
            any: [
              {
                id: 'color-contrast',
                data: {
                  foregroundColor: '#777777',
                  backgroundColor: 'rgb(255, 255, 255)',
                  contrastRatio: 4.1,
                  expectedContrastRatio: '4.5:1',
                  fontSize: '12.0pt (16px)',
                  fontWeight: '400',
                  message: 'synthetic-private-path',
                },
              },
            ],
          },
        ],
      },
    ],
    incomplete: [],
  });
  assert.deepEqual(result.violations[0].diagnostics[0].targets, ['form > p.notice:nth-child(2)']);
  assert.deepEqual(result.violations[0].diagnostics[0].checks[0].metrics, {
    foregroundColor: [119, 119, 119],
    backgroundColor: [255, 255, 255],
    contrastRatio: 4.1,
    expectedContrastRatio: 4.5,
    fontSize: 16,
    fontWeight: 400,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /synthetic-password|synthetic-token|synthetic-private-path|html|failureSummary/,
  );
});

test('axe diagnostics reject attribute values, secrets, paths and nonfinite metrics', () => {
  const targets = [
    'input[value="synthetic-password"]',
    '#synthetic-password',
    '.access_token',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature',
    '/private/tmp/report',
    '<input>',
    '#' + 'x'.repeat(200),
    'label',
  ];
  const result = scrubAxeDiagnostics({
    violations: [
      {
        id: 'color-contrast',
        nodes: [
          {
            target: targets,
            any: [
              {
                id: 'color-contrast',
                data: {
                  contrastRatio: Infinity,
                  foregroundColor: 'url(/private/path)',
                  fontWeight: -1,
                  expectedContrastRatio: 'synthetic-token',
                  fontSize: NaN,
                },
              },
            ],
          },
        ],
      },
    ],
    incomplete: [{ id: 'aria-prohibited-attr', nodes: [{}] }],
  });
  assert.deepEqual(result.violations[0].diagnostics[0].targets, ['label']);
  assert.deepEqual(result.violations[0].diagnostics[0].checks, []);
  assert.equal(result.incomplete[0].unavailableNodes, 1);
  assert.equal(result.incomplete[0].nodes, 1);
  assert.doesNotMatch(JSON.stringify(result), /password|access_token|eyJ|private|Infinity|NaN/);
});

test('axe diagnostics bound rules, nodes, selector strings and checks', () => {
  const node = {
    target: Array(10).fill('p.notice'),
    any: Array(20).fill({ id: 'color-contrast', data: { contrastRatio: 2 } }),
  };
  const result = scrubAxeDiagnostics({
    violations: Array(80).fill({ id: 'color-contrast', nodes: Array(20).fill(node) }),
    incomplete: [],
  });
  assert.equal(result.violations.length, 64);
  assert.equal(result.violations[0].nodes, 20);
  assert.equal(result.violations[0].diagnostics.length, 5);
  assert.equal(result.violations[0].diagnostics[0].targets.length, 3);
  assert.equal(result.violations[0].diagnostics[0].checks.length, 6);
});

test('C denies hostname/port/credential aliases and all external destinations', () => {
  const origin = 'http://127.0.0.1:32111';
  assert.equal(classifyRequest(`${origin}/login`, origin), 'next');
  assert.equal(classifyRequest('https://auth.synthetic.test/auth/v1/user', origin), 'auth');
  for (const url of [
    'http://localhost:32111/login',
    'http://127.0.0.1:32112/login',
    'https://auth.synthetic.test:444/auth/v1/user',
    'https://user:pass@auth.synthetic.test/auth/v1/user',
    'https://other.synthetic.test/',
    'ws://127.0.0.1:32111/',
  ]) {
    assert.equal(classifyRequest(url, origin), 'deny');
  }
});

test('C installs deny-by-default HTTP and WebSocket routing before navigation', async () => {
  const calls = [];
  let http;
  let ws;
  const context = {
    async routeWebSocket(pattern, callback) {
      calls.push('ws');
      ws = callback;
    },
    async route(pattern, callback) {
      calls.push('http');
      http = callback;
    },
  };
  const report = await installNetworkBoundary(context, {
    origin: 'http://127.0.0.1:32111',
    auth: { reply: async () => ({ status: 200, body: {} }) },
  });
  assert.deepEqual(calls, ['ws', 'http']);
  const invoke = async (url) => {
    let action;
    await http({
      request: () => ({
        url: () => url,
        method: () => 'GET',
        headers: () => ({}),
        postData: () => null,
      }),
      continue: async () => {
        action = 'continue';
      },
      fulfill: async () => {
        action = 'fulfill';
      },
      abort: async () => {
        action = 'abort';
      },
    });
    return action;
  };
  assert.equal(await invoke('http://127.0.0.1:32111/signup'), 'continue');
  assert.equal(await invoke('https://auth.synthetic.test/auth/v1/user'), 'fulfill');
  assert.equal(await invoke('https://blocked.synthetic.test/'), 'abort');
  ws({ close: () => calls.push('closed') });
  assert.deepEqual(calls, ['ws', 'http', 'closed']);
  assert.equal(report.deniedHttp, 1);
  assert.equal(report.deniedWebSocket, 1);
});

test('C packages only finite measurements, with unavailable metrics explicit and no INP label', () => {
  const result = packageMetrics({
    fcp: 12,
    lcp: null,
    cls: 0,
    responseStart: 2,
    ttfb: 1,
    interaction: NaN,
    access_token: 'synthetic-bearer',
  });
  assert.equal(result.fcpMs, 12);
  assert.equal(result.cls, 0);
  assert.equal(result.lcpMs, null);
  assert.ok(result.unavailable.includes('lcpMs'));
  assert.ok(result.unavailable.includes('interactionMs'));
  assert.doesNotMatch(JSON.stringify(result), /synthetic-bearer|access_token|INP/);
  assert.ok(contrastRatio([0, 0, 0], [255, 255, 255]) > 20.9);
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1);
});

test('C asset packaging deduplicates shared JS/CSS and measures actual compression', () => {
  const summary = summarizeAssets(
    {
      '/login': ['shared.js', 'login.js', 'style.css'],
      '/signup': ['shared.js', 'signup.js', 'style.css'],
    },
    {
      'shared.js': Buffer.from('synthetic '.repeat(100)),
      'login.js': Buffer.from('login'),
      'signup.js': Buffer.from('signup'),
      'style.css': Buffer.from('body{color:black}'),
    },
  );
  assert.equal(summary.assets.find((asset) => asset.name === 'shared.js').scope, 'shared');
  assert.equal(summary.assets.find((asset) => asset.name === 'login.js').scope, 'route');
  assert.ok(summary.routes['/login'].shared.js.gzip < summary.routes['/login'].shared.js.raw);
  assert.equal(summary.routes['/login'].route.js.raw, 5);
  assert.equal(summary.assets.length, 4);
});

const cliArgs = [
  '--playwright-module',
  '/tmp/playwright/index.mjs',
  '--chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '--axe',
  '/tmp/axe-core/axe.js',
  '--next-port',
  '32111',
  '--stub-port',
  '32112',
  '--samples',
  '3',
];
test('C CLI refuses missing tools, duplicate ports, undersampling and unknown options', () => {
  assert.equal(parseOptions(cliArgs).samples, 3);
  for (const args of [
    [],
    [...cliArgs, '--unknown', 'x'],
    [...cliArgs, '--samples', '2'],
    cliArgs.map((item) => (item === '32112' ? '32111' : item)),
  ]) {
    assert.throws(() => parseOptions(args));
  }
});

test('C orchestration builds before loading scratch schema and always cleans up after browser failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hismia-orchestration-'));
  const calls = [];
  const report = await executeVerification(parseOptions(cliArgs), {
    validateTools: async () => {},
    createScratch: async () => ({ root, front: root, snapshot: { files: 1, bytes: 10 } }),
    linkDependencies: async () => calls.push('links'),
    buildScratch: async () => {
      calls.push('build');
      return {};
    },
    loadSchema: async () => {
      calls.push('scratch-schema');
      return () => {};
    },
    startSyntheticApi: async () => ({
      origin: 'http://127.0.0.1:32112',
      reset() {},
      report: () => ({}),
      close: async () => {
        calls.push('api-close');
        return { quiescent: true };
      },
    }),
    startScratch: async () => ({
      origin: 'http://127.0.0.1:32111',
      owned: {
        stop: async () => {
          calls.push('next-stop');
          return { quiescent: true };
        },
      },
    }),
    verifyRewrites: async () => ({ passed: true }),
    collectAssets: async () => ({}),
    runBrowser: async () => {
      throw new Error('synthetic-bearer must not be reported');
    },
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.phase, 'browser');
  assert.deepEqual(calls, ['links', 'build', 'scratch-schema', 'next-stop', 'api-close']);
  assert.equal(report.cleanup.next.quiescent, true);
  assert.equal(report.cleanup.api.quiescent, true);
  const stored = await readFile(path.join(root, 'critical-flows-summary.json'), 'utf8');
  assert.doesNotMatch(stored, /synthetic-bearer/);
});

test('C synthetic auth enforces PKCE challenge and exact SDK paths without external HTTP', async () => {
  const { createHash } = await import('node:crypto');
  const auth = syntheticAuth('http://127.0.0.1:32111');
  const headers = { apikey: 'synthetic-public-key', authorization: 'Bearer synthetic-public-key' };
  const verifier = 'synthetic-verifier';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const request = (pathname, method, body = {}, extra = {}) =>
    auth.reply({
      url: new URL(`https://auth.synthetic.test${pathname}`),
      method,
      headers: { ...headers, ...extra },
      body,
    });
  assert.equal(
    (
      await request(
        '/auth/v1/recover?redirect_to=http%3A%2F%2F127.0.0.1%3A32111%2Fauth%2Freset-password',
        'POST',
        {
          email: syntheticIdentity.email,
          code_challenge: challenge,
          code_challenge_method: 's256',
        },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/auth/v1/token?grant_type=pkce', 'POST', {
        auth_code: 'synthetic-recovery-code',
        code_verifier: 'wrong',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/auth/v1/token?grant_type=pkce', 'POST', {
        auth_code: 'synthetic-recovery-code',
        code_verifier: verifier,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        '/auth/v1/user',
        'GET',
        {},
        { authorization: `Bearer ${syntheticIdentity.token}` },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        '/auth/v1/logout?scope=local',
        'POST',
        {},
        { authorization: `Bearer ${syntheticIdentity.token}` },
      )
    ).status,
    200,
  );
  assert.equal((await request('/auth/v1/unexpected', 'GET')).status, 400);
  assert.doesNotMatch(JSON.stringify(auth.report()), /synthetic-bearer|synthetic-verifier/);
});

test('C total browser deadline aborts a nonsettling port and bounds failed cleanup', async () => {
  const calls = [];
  const child = { exitCode: null, signalCode: null };
  const server = {
    wsEndpoint: () => 'synthetic-endpoint',
    process: () => child,
    close: () => new Promise(() => {}),
    async kill() {
      calls.push('kill');
      child.signalCode = 'SIGKILL';
    },
  };
  const chromium = {
    launchServer: async () => server,
    connect: async () => ({ close: async () => {} }),
  };
  const evidence = { stage: 'network', cleanup: {} };
  const started = Date.now();
  await assert.rejects(
    browserSession(
      { chromium, launchOptions: {}, timeoutMs: 40, cleanupMs: 30, evidence },
      async () => new Promise(() => {}),
    ),
    (error) => {
      assert.equal(error.browserEvidence.failure.category, 'deadline');
      assert.equal(error.browserEvidence.cleanup.processExited, true);
      assert.equal(error.browserEvidence.cleanup.serverClose, 'timeout');
      return true;
    },
  );
  assert.deepEqual(calls, ['kill']);
  assert.ok(Date.now() - started < 1000);
});

test('C late launch is killed without claiming exit before obtaining its handle', async () => {
  let resolveLaunch;
  let kills = 0;
  let connects = 0;
  const evidence = { stage: 'launch', cleanup: {} };
  const launch = new Promise((resolve) => {
    resolveLaunch = resolve;
  });
  await assert.rejects(
    browserSession(
      {
        chromium: {
          launchServer: () => launch,
          connect: async () => {
            connects++;
          },
        },
        launchOptions: {},
        timeoutMs: 20,
        cleanupMs: 50,
        evidence,
      },
      async () => {},
    ),
    (error) => error.browserEvidence.cleanup.processExited === null,
  );
  resolveLaunch({
    kill: async () => {
      kills++;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(kills, 1);
  assert.equal(connects, 0);
});

test('C successful browser workflow awaits owned server exit', async () => {
  const child = { exitCode: null, signalCode: null };
  const evidence = { stage: 'complete', cleanup: {} };
  let ran = false;
  await browserSession(
    {
      chromium: {
        launchServer: async () => ({
          wsEndpoint: () => 'synthetic',
          process: () => child,
          close: async () => {
            child.exitCode = 0;
          },
        }),
        connect: async () => ({}),
      },
      launchOptions: {},
      timeoutMs: 100,
      cleanupMs: 20,
      evidence,
    },
    async () => {
      ran = true;
    },
  );
  assert.equal(ran, true);
  assert.equal(evidence.cleanup.processExited, true);
  assert.equal(evidence.cleanup.serverClose, 'fulfilled');
});

test('C deadline covers cumulative launch, connect and workflow time', async () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
  const child = { exitCode: null, signalCode: null };
  let aborted = false;
  const server = {
    wsEndpoint: () => 'synthetic',
    process: () => child,
    async close() {
      child.exitCode = 0;
    },
    async kill() {
      aborted = true;
      child.signalCode = 'SIGKILL';
    },
  };
  const evidence = { stage: 'launch', cleanup: {} };
  await assert.rejects(
    browserSession(
      {
        chromium: {
          async launchServer() {
            await pause();
            return server;
          },
          async connect() {
            await pause();
            return {};
          },
        },
        launchOptions: {},
        timeoutMs: 65,
        cleanupMs: 50,
        evidence,
      },
      async () => {
        await pause();
      },
    ),
    (error) => error.browserEvidence.failure.category === 'deadline',
  );
  assert.equal(aborted, true);
});

test('C deadline terminates an owned synthetic process, not merely its promise', async () => {
  const { scratch } = await fixture();
  const owned = await ownedFixture(scratch, 'setInterval(() => {}, 1000);');
  const child = { exitCode: null, signalCode: null };
  const server = {
    wsEndpoint: () => 'synthetic',
    process: () => child,
    async close() {
      const receipt = await owned.stop();
      Object.assign(child, { exitCode: receipt.exitCode, signalCode: receipt.signal });
    },
    async kill() {
      await this.close();
    },
  };
  try {
    await assert.rejects(
      browserSession(
        {
          chromium: { launchServer: async () => server, connect: async () => ({}) },
          launchOptions: {},
          timeoutMs: 40,
          cleanupMs: 3500,
          evidence: { stage: 'evaluate', cleanup: {} },
        },
        async () => new Promise(() => {}),
      ),
      (error) => error.browserEvidence.cleanup.processExited === true,
    );
    const receipt = await owned.stop();
    assert.equal(receipt.quiescent, true);
    assert.throws(() => process.kill(receipt.pid, 0), { code: 'ESRCH' });
  } finally {
    await owned.stop();
  }
});

test('C browser cleanup failure cannot pass on driver disconnection alone', async () => {
  const evidence = { stage: 'complete', cleanup: {} };
  const server = {
    wsEndpoint: () => 'synthetic',
    process: () => ({ exitCode: null, signalCode: null }),
    close: async () => {
      throw new Error('synthetic-token');
    },
    kill: () => new Promise(() => {}),
  };
  await assert.rejects(
    browserSession(
      {
        chromium: {
          launchServer: async () => server,
          connect: async () => ({ close: async () => {} }),
        },
        launchOptions: {},
        timeoutMs: 100,
        cleanupMs: 20,
        evidence,
      },
      async () => {},
    ),
    (error) => {
      assert.equal(error.browserEvidence.cleanup.processExited, false);
      assert.equal(error.browserEvidence.cleanup.serverClose, 'failed');
      assert.equal(error.browserEvidence.cleanup.kill, 'timeout');
      assert.doesNotMatch(JSON.stringify(error.browserEvidence), /synthetic-token/);
      return true;
    },
  );
});

test('C cleanup retains safe owned-process receipt even when stop rejects', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hismia-cleanup-'));
  const report = await executeVerification(parseOptions(cliArgs), {
    validateTools: async () => {},
    createScratch: async () => ({ root, front: root }),
    linkDependencies: async () => {},
    buildScratch: async () => ({}),
    loadSchema: async () => ({}),
    startSyntheticApi: async () => ({
      origin: 'http://127.0.0.1:32112',
      close: async () => ({ quiescent: true }),
    }),
    startScratch: async () => ({
      origin: 'http://127.0.0.1:32111',
      owned: {
        stop: async () => {
          throw Object.assign(new Error('synthetic-token'), {
            receipt: {
              pid: 123,
              exitCode: 7,
              signal: null,
              quiescent: false,
              durationMs: 10,
              stdout: 'synthetic-token',
            },
          });
        },
      },
    }),
    verifyRewrites: async () => ({}),
    collectAssets: async () => ({}),
    runBrowser: async () => ({}),
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.cleanup.next.pid, 123);
  assert.equal(report.cleanup.next.exitCode, 7);
  assert.equal(report.cleanup.next.quiescent, false);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-token|stdout/);
});

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

async function linkedLayout() {
  const { source } = await fixture();
  const installed = await mkdtemp(path.join(tmpdir(), 'hismia-installed-'));
  for (const area of ['', 'apps/front', 'packages/types', 'packages/validation']) {
    await mkdir(path.join(installed, area, 'node_modules'), { recursive: true });
    await symlink(
      path.join(installed, area, 'node_modules'),
      path.join(source, area, 'node_modules'),
    );
  }
  const store = path.join(installed, 'node_modules/.pnpm');
  for (const [name, cli] of [
    ['next', 'dist/bin/next'],
    ['typescript', 'bin/tsc'],
  ]) {
    const target = path.join(store, `${name}-synthetic/node_modules/${name}`);
    await put(target, cli, 'process.exit(0);');
    await symlink(target, path.join(installed, 'node_modules', name));
  }
  await put(
    source,
    'apps/front/package.json',
    JSON.stringify({ dependencies: { next: 'synthetic', '@hismia/validation': 'workspace:*' } }),
  );
  await put(
    source,
    'packages/types/package.json',
    JSON.stringify({ devDependencies: { typescript: 'synthetic' } }),
  );
  await put(
    source,
    'packages/validation/package.json',
    JSON.stringify({ devDependencies: { typescript: 'synthetic' } }),
  );
  return { source, installed, store, scratch: await createScratch({ repoRoot: source }) };
}

test('linked layout requires explicit root and validates canonical Next/TS CLIs', async () => {
  const { source, installed, scratch } = await linkedLayout();
  await linkDependencies(scratch, { dependencyRoot: installed });
  await assert.rejects(
    linkDependencies(await createScratch({ repoRoot: source })),
    (error) => error.category === 'dependency-store-untrusted',
  );
  for (const script of [
    'apps/front/node_modules/next/dist/bin/next',
    'packages/types/node_modules/typescript/bin/tsc',
  ]) {
    const receipt = await runOwned({
      scratch,
      node,
      script: path.join(scratch.root, script),
      apiOrigin: 'http://127.0.0.1:32101',
    });
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.quiescent, true);
  }
  assert.equal(
    await realpath(path.join(scratch.front, 'node_modules/@hismia/validation')),
    path.join(scratch.root, 'packages/validation'),
  );
  await assert.rejects(access(path.join(scratch.root, 'packages/validation/dist')));
});

test('dependency capability reaches linking and only finite diagnostics reach reports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hismia-dependency-report-'));
  const options = parseOptions([...cliArgs, '--dependency-root', root]);
  let supplied;
  const report = await executeVerification(options, {
    validateTools: async () => {},
    createScratch: async () => ({ root }),
    linkDependencies: async (_, capability) => {
      supplied = capability;
      throw Object.assign(new Error('synthetic-private-path'), { category: 'dependency-missing' });
    },
  });
  assert.deepEqual(supplied, { dependencyRoot: root });
  assert.equal(report.failure.category, 'dependency-missing');
  assert.doesNotMatch(JSON.stringify(report), /synthetic-private-path/);
  assert.throws(() => parseOptions([...cliArgs, '--dependency-root', 'relative']));
});

test('linked layout refuses unapproved root, redirected store, escapes and missing modules', async () => {
  const first = await linkedLayout();
  const other = (await linkedLayout()).installed;
  await assert.rejects(
    linkDependencies(first.scratch, { dependencyRoot: other }),
    (error) => error.category === 'dependency-store-untrusted',
  );
  for (const [name, category] of [
    ['absent', 'dependency-missing'],
    ['escape', 'dependency-target-outside-store'],
  ]) {
    const layout = await linkedLayout();
    await put(
      layout.source,
      'apps/front/package.json',
      JSON.stringify({ dependencies: { [name]: 'synthetic' } }),
    );
    if (name === 'escape')
      await symlink(other, path.join(layout.installed, 'apps/front/node_modules/escape'));
    await assert.rejects(
      linkDependencies(await createScratch({ repoRoot: layout.source }), {
        dependencyRoot: layout.installed,
      }),
      (error) => error.category === category,
    );
  }
  const { source } = await fixture();
  const redirected = await mkdtemp(path.join(tmpdir(), 'hismia-redirected-'));
  for (const area of ['', 'apps/front', 'packages/types', 'packages/validation']) {
    await mkdir(path.join(redirected, area, 'node_modules'), { recursive: true });
    await symlink(
      path.join(redirected, area, 'node_modules'),
      path.join(source, area, 'node_modules'),
    );
  }
  await symlink(first.store, path.join(redirected, 'node_modules/.pnpm'));
  await assert.rejects(
    linkDependencies(await createScratch({ repoRoot: source }), { dependencyRoot: redirected }),
    (error) => error.category === 'dependency-store-untrusted',
  );
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
