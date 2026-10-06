import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { cleanEnvironment, loopbackOrigin } from './scratch.mjs';
import { syntheticIdentity } from './synthetic-api.mjs';

export const routes = [
  '/login',
  '/signup',
  '/auth/confirm',
  '/auth/recover',
  '/auth/reset-password',
  '/onboarding',
];
const password = 'synthetic-password';
const updatedPassword = 'synthetic-updated-password';
const viewport = { width: 1280, height: 800 };
export function classifyRequest(value, origin) {
  loopbackOrigin(origin);
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'deny';
  }
  if (url.username || url.password) return 'deny';
  if (url.protocol === 'http:' && url.origin === origin) return 'next';
  if (url.protocol === 'https:' && url.origin === 'https://auth.synthetic.test') return 'auth';
  return 'deny';
}
export async function installNetworkBoundary(context, { origin, auth }) {
  loopbackOrigin(origin);
  const counters = { deniedHttp: 0, deniedWebSocket: 0 };
  await context.routeWebSocket('**/*', (socket) => {
    counters.deniedWebSocket++;
    socket.close({ code: 1008, reason: 'Synthetic harness denies WebSockets' });
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const kind = classifyRequest(request.url(), origin);
    if (kind === 'next') {
      await route.continue();
      return;
    }
    if (kind === 'deny') {
      counters.deniedHttp++;
      await route.abort('blockedbyclient');
      return;
    }
    try {
      const result = await auth.reply({
        url: new URL(request.url()),
        method: request.method(),
        headers: request.headers(),
        body: request.postData() ? JSON.parse(request.postData()) : {},
      });
      await route.fulfill({
        status: result.status,
        contentType: 'application/json',
        body: JSON.stringify(result.body),
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
          'Access-Control-Allow-Headers':
            'apikey,authorization,content-type,x-client-info,x-supabase-api-version',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      counters.deniedHttp++;
      await route.abort('blockedbyclient');
    }
  });
  return counters;
}

/** HTTP semantics only. The installed browser SDK generates/stores/exchanges PKCE itself. */
export function syntheticAuth(origin) {
  loopbackOrigin(origin);
  const user = {
    id: syntheticIdentity.subject,
    aud: 'authenticated',
    role: 'authenticated',
    email: syntheticIdentity.email,
    email_confirmed_at: syntheticIdentity.timestamp,
    confirmed_at: syntheticIdentity.timestamp,
    app_metadata: {},
    user_metadata: {},
    created_at: syntheticIdentity.timestamp,
  };
  const session = () => ({
    access_token: syntheticIdentity.token,
    refresh_token: 'synthetic-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  });
  const challenges = new Map();
  const counters = {
    signup: 0,
    recover: 0,
    pkce: 0,
    password: 0,
    user: 0,
    update: 0,
    logout: 0,
    options: 0,
    denied: 0,
  };
  let active = false;
  let rejectLogin = false;
  const deny = () => {
    counters.denied++;
    return {
      status: 400,
      body: { code: 'synthetic_protocol_denied', msg: 'Synthetic request denied' },
    };
  };
  const ok = (body = {}) => ({ status: 200, body });
  return {
    denyNextLogin() {
      rejectLogin = true;
    },
    report() {
      return { ...counters };
    },
    async reply({ url, method, headers, body }) {
      if (classifyRequest(url.href, origin) !== 'auth') return deny();
      const h = new Headers(headers);
      const known = [
        '/auth/v1/signup',
        '/auth/v1/recover',
        '/auth/v1/token',
        '/auth/v1/user',
        '/auth/v1/logout',
      ];
      if (!known.includes(url.pathname)) return deny();
      if (method === 'OPTIONS') {
        const allowed = new Set([
          'apikey',
          'authorization',
          'content-type',
          'x-client-info',
          'x-supabase-api-version',
        ]);
        const requested = (h.get('access-control-request-headers') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        if (requested.some((name) => !allowed.has(name))) return deny();
        counters.options++;
        return ok();
      }
      if (h.get('apikey') !== 'synthetic-public-key') return deny();
      if (method === 'POST' && ['/auth/v1/signup', '/auth/v1/recover'].includes(url.pathname)) {
        const kind = url.pathname.endsWith('/signup') ? 'signup' : 'recover';
        const target = origin + (kind === 'signup' ? '/auth/confirm' : '/auth/reset-password');
        if (
          url.searchParams.get('redirect_to') !== target ||
          body.email !== syntheticIdentity.email ||
          body.code_challenge_method !== 's256' ||
          !/^[\w-]{43}$/.test(body.code_challenge)
        )
          return deny();
        if (
          kind === 'signup' &&
          (body.password !== password || Object.keys(body.data ?? {}).length !== 0)
        )
          return deny();
        challenges.set(
          kind === 'signup' ? 'synthetic-signup-code' : 'synthetic-recovery-code',
          body.code_challenge,
        );
        counters[kind]++;
        return ok(
          kind === 'signup' ? { ...user, email_confirmed_at: null, confirmed_at: null } : {},
        );
      }
      if (method === 'POST' && url.pathname === '/auth/v1/token') {
        if (url.search === '?grant_type=pkce') {
          const expected = challenges.get(body.auth_code);
          if (
            !expected ||
            typeof body.code_verifier !== 'string' ||
            createHash('sha256').update(body.code_verifier).digest('base64url') !== expected
          )
            return deny();
          challenges.delete(body.auth_code);
          counters.pkce++;
        } else if (url.search === '?grant_type=password') {
          counters.password++;
          if (rejectLogin) {
            rejectLogin = false;
            return {
              status: 400,
              body: { code: 'invalid_credentials', msg: 'Synthetic login rejected' },
            };
          }
          if (body.email !== syntheticIdentity.email || body.password !== password) return deny();
        } else return deny();
        active = true;
        return ok(session());
      }
      if (h.get('authorization') !== `Bearer ${syntheticIdentity.token}` || !active)
        return { status: 401, body: { code: 'bad_jwt', msg: 'Synthetic session missing' } };
      if (url.pathname === '/auth/v1/user' && url.search === '') {
        if (method === 'GET') {
          counters.user++;
          return ok(user);
        }
        if (method === 'PUT' && body.password === updatedPassword) {
          counters.update++;
          return ok({ user });
        }
      }
      if (
        url.pathname === '/auth/v1/logout' &&
        method === 'POST' &&
        url.search === '?scope=local'
      ) {
        counters.logout++;
        active = false;
        return ok();
      }
      return deny();
    },
  };
}
export function packageMetrics(raw) {
  const fields = {
    fcpMs: 'fcp',
    lcpMs: 'lcp',
    cls: 'cls',
    responseStartMs: 'responseStart',
    ttfbMs: 'ttfb',
    interactionMs: 'interaction',
  };
  const output = { unavailable: [] };
  for (const [name, source] of Object.entries(fields)) {
    const value = raw[source];
    output[name] = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    if (output[name] === null) output.unavailable.push(name);
  }
  return output;
}
export function contrastRatio(foreground, background) {
  const luminance = (rgb) =>
    rgb
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Runs inside each fresh document before application code. No UI/client/SDK substitution.
function observeNavigation() {
  const lab = {
    fcp: null,
    lcp: null,
    cls: null,
    observers: [],
    supported: PerformanceObserver.supportedEntryTypes,
  };
  window.__hismiaLab = lab;
  let windowStart = 0;
  let previous = 0;
  let cluster = 0;
  for (const type of ['paint', 'largest-contentful-paint', 'layout-shift']) {
    if (!lab.supported.includes(type)) continue;
    if (type === 'layout-shift') lab.cls = 0;
    const consume = (entries) => {
      for (const entry of entries) {
        if (type === 'paint' && entry.name === 'first-contentful-paint') lab.fcp = entry.startTime;
        if (type === 'largest-contentful-paint') lab.lcp = entry.startTime;
        if (type === 'layout-shift' && !entry.hadRecentInput) {
          if (
            previous === 0 ||
            entry.startTime - previous > 1000 ||
            entry.startTime - windowStart > 5000
          ) {
            windowStart = entry.startTime;
            cluster = 0;
          }
          cluster += entry.value;
          previous = entry.startTime;
          lab.cls = Math.max(lab.cls, cluster);
        }
      }
    };
    const observer = new PerformanceObserver((list) => consume(list.getEntries()));
    observer.observe({ type, buffered: true });
    lab.observers.push({ observer, consume });
  }
}
async function associatedError(control) {
  assert.ok(
    await control.evaluate(
      (element) =>
        element.labels?.length > 0 &&
        document.activeElement === element &&
        element.getAttribute('aria-invalid') === 'true' &&
        (element.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .some((id) => document.getElementById(id)?.textContent?.trim()),
    ),
    'Invalid field focus/label/description contract',
  );
}
/** Pure, self-contained projection; also runs in the synthetic page so raw axe nodes
 * never cross the driver boundary. Limits apply independently to both rule lists. */
export function scrubAxeDiagnostics(result) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const sensitive = /password|token|jwt|bearer|secret|private|credential|verifier|eyj/i;
  const id = (value) =>
    typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !sensitive.test(value)
      ? value
      : 'unavailable-rule';
  const selector = (value) => {
    if (typeof value !== 'string' || value.length > 160 || sensitive.test(value)) return false;
    const atom =
      /^(?:[a-z][a-z0-9-]{0,19}|\*)?(?:[.#][a-z][a-z0-9_-]{0,47})*(?::(?:first-child|last-child|first-of-type|last-of-type|nth-child\([1-9][0-9]{0,2}\)|nth-of-type\([1-9][0-9]{0,2}\)))*$/;
    return value
      .split(/\s*[>+~]\s*|\s+/)
      .every((part) => part.length > 0 && atom.test(part) && /^[a-z*.#]/.test(part));
  };
  const number = (value, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
      ? value
      : undefined;
  const rgb = (value) => {
    if (typeof value !== 'string') return undefined;
    if (/^#[0-9a-f]{6}$/i.test(value))
      return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
    const channels = match?.slice(1).map(Number);
    return channels?.every((channel) => channel <= 255) ? channels : undefined;
  };
  const metrics = (data = {}) => {
    const output = {};
    for (const field of ['foregroundColor', 'backgroundColor']) {
      const value = rgb(data[field]);
      if (value) output[field] = value;
    }
    const expected =
      typeof data.expectedContrastRatio === 'string' &&
      /^(?:\d+(?:\.\d+)?):1$/.test(data.expectedContrastRatio)
        ? Number(data.expectedContrastRatio.split(':')[0])
        : data.expectedContrastRatio;
    const size =
      typeof data.fontSize === 'string'
        ? /^(?:\d+(?:\.\d+)?pt \()?([0-9]+(?:\.[0-9]+)?)px\)?$/.exec(data.fontSize)
        : null;
    const weight =
      typeof data.fontWeight === 'string' && /^\d{1,4}$/.test(data.fontWeight)
        ? Number(data.fontWeight)
        : data.fontWeight;
    for (const [field, raw, max] of [
      ['contrastRatio', data.contrastRatio, 100],
      ['expectedContrastRatio', expected, 100],
      ['fontSize', size ? Number(size[1]) : data.fontSize, 10000],
      ['fontWeight', weight, 1000],
    ]) {
      const value = number(raw, max);
      if (value !== undefined) output[field] = value;
    }
    return output;
  };
  const rules = (items) =>
    list(items)
      .slice(0, 64)
      .map((rule) => {
        const nodes = list(rule.nodes);
        const diagnostics = nodes.slice(0, 5).map((node) => {
          const targets = list(node.target).slice(0, 32).filter(selector).slice(0, 3);
          const checks = [
            ...list(node.any).slice(0, 6),
            ...list(node.all).slice(0, 6),
            ...list(node.none).slice(0, 6),
          ]
            .filter((check) => check.id === 'color-contrast')
            .map((check) => ({ id: 'color-contrast', metrics: metrics(check.data ?? {}) }))
            .filter((check) => Object.keys(check.metrics).length > 0)
            .slice(0, 6);
          return { targets, checks };
        });
        return {
          id: id(rule.id),
          nodes: nodes.length,
          diagnostics,
          omittedNodes: Math.max(0, nodes.length - diagnostics.length),
          unavailableNodes: diagnostics.filter(
            (node) => !node.targets.length && !node.checks.length,
          ).length,
        };
      });
  return {
    version:
      typeof result.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(result.version)
        ? result.version
        : null,
    violations: rules(result.violations),
    incomplete: rules(result.incomplete),
    passedRules: list(result.passes).length,
  };
}

async function audit(page, axe, evidence, state) {
  await page.addScriptTag({ path: axe });
  // Serialize trusted projection code, NOT DOM/results. Scrubbing happens in-page.
  const automated = await page.evaluate(`(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return (${scrubAxeDiagnostics.toString()})(result);
  })()`);
  const receipt = { state, axe: automated, contrast: null };
  evidence.a11y.push(receipt);
  const samples = await page.evaluate(() => {
    const rgba = (value) => {
      if (!/^rgba?\(/.test(value)) return null;
      const numbers = value.match(/[\d.]+/g)?.map(Number);
      return numbers?.length >= 3 ? [...numbers.slice(0, 3), numbers[3] ?? 1] : null;
    };
    const result = [];
    for (const element of document.querySelectorAll('h1,h2,p,label,button,a,input,select')) {
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        element.disabled ||
        element.closest('[aria-hidden="true"],[aria-label="Hismia"]')
      )
        continue;
      if (
        !['INPUT', 'SELECT'].includes(element.tagName) &&
        ![...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())
      )
        continue;
      const style = getComputedStyle(element);
      const backgrounds = [];
      let uncertain = false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const layer = getComputedStyle(ancestor);
        if (Number(layer.opacity) !== 1 || layer.backgroundImage !== 'none') uncertain = true;
        backgrounds.push(rgba(layer.backgroundColor));
      }
      result.push({
        tag: element.tagName,
        foreground: rgba(style.color),
        backgrounds,
        large:
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700),
        uncertain,
      });
    }
    return result;
  });
  const contrast = { tested: 0, unavailable: 0, violations: [] };
  const over = (color, background) =>
    color.slice(0, 3).map((value, index) => value * color[3] + background[index] * (1 - color[3]));
  for (const sample of samples) {
    if (sample.uncertain || !sample.foreground || sample.backgrounds.some((layer) => !layer)) {
      contrast.unavailable++;
      continue;
    }
    let background = [255, 255, 255];
    for (const layer of sample.backgrounds.reverse()) background = over(layer, background);
    const ratio = contrastRatio(over(sample.foreground, background), background);
    contrast.tested++;
    if (ratio < (sample.large ? 3 : 4.5))
      contrast.violations.push({ tag: sample.tag, ratio, required: sample.large ? 3 : 4.5 });
  }
  receipt.contrast = contrast;
  assert.equal(automated.violations.length, 0, 'Automated accessibility violations');
  assert.equal(contrast.violations.length, 0, 'Rendered text contrast violations');
  assert.ok(contrast.tested > 0, 'No rendered contrasts measured');
}
async function loadedWordmark(page) {
  const wordmark = page.getByRole('img', { name: 'Hismia', exact: true });
  await wordmark.waitFor({ state: 'visible' });
  assert.equal(await wordmark.count(), 1, 'Wordmark accessible image contract');
  const graphic = await wordmark.evaluate(async (image) => {
    if (
      image.tagName !== 'IMG' ||
      image.getAttribute('src') !== '/brand/hismia-wordmark.svg' ||
      image.getAttribute('alt') !== 'Hismia'
    )
      return { loaded: false };
    await image.decode();
    if (
      image.naturalWidth !== 144 ||
      image.naturalHeight !== 44 ||
      image.width !== 144 ||
      image.height !== 44
    )
      return { loaded: false };
    // Only this local logo is rasterized, never page/form/auth content. Return counts,
    // not image bytes, DOM text, screenshots or attribute inventories.
    const canvas = document.createElement('canvas');
    canvas.width = 144;
    canvas.height = 44;
    const context = canvas.getContext('2d');
    if (!context) return { loaded: false };
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 144, 44).data;
    let opaquePixels = 0;
    let hisPixels = 0;
    let miaPixels = 0;
    let edgePixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      opaquePixels++;
      const pixel = i / 4;
      const x = pixel % 144;
      const y = Math.floor(pixel / 144);
      if (x === 0 || x === 143 || y === 0 || y === 43) edgePixels++;
      if (pixels[i + 3] === 255) {
        if (pixels[i] === 9 && pixels[i + 1] === 57 && pixels[i + 2] === 106) hisPixels++;
        if (pixels[i] === 50 && pixels[i + 1] === 192 && pixels[i + 2] === 180) miaPixels++;
      }
    }
    return { loaded: true, width: 144, height: 44, opaquePixels, hisPixels, miaPixels, edgePixels };
  });
  assert.equal(graphic.loaded, true, 'Wordmark local image load contract');
  assert.ok(
    graphic.opaquePixels > 0 && graphic.hisPixels > 0 && graphic.miaPixels > 0,
    'Wordmark must contain both visible brand fills',
  );
  assert.equal(graphic.edgePixels, 0, 'Wordmark glyphs must not reach reserved bounds');
  return graphic;
}
async function login(page, origin, auth, rejectFirst = false) {
  await page.goto(origin + '/login');
  await loadedWordmark(page);
  await page.getByLabel('Email', { exact: true }).fill(syntheticIdentity.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  if (rejectFirst) auth.denyNextLogin();
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
  if (rejectFirst) {
    await page.getByRole('alert').filter({ hasText: 'No se pudo iniciar sesión' }).waitFor();
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).waitFor();
}
async function fillProfile(page, type) {
  const values =
    type === 'institution'
      ? {
          'Nombre de la institución': 'Sintética',
          'Tipo de institución': 'Sintético',
          Ubicación: 'Sintética',
        }
      : type === 'professional'
        ? {
            'Nombre visible': 'Sintético',
            Especialidad: 'Sintética',
            'Localidad de ejercicio': 'Sintética',
          }
        : {
            'Nombre visible': 'Sintético',
            'Fecha de nacimiento': '1990-01-01',
            'Localidad de residencia': 'Sintética',
          };
  for (const [label, value] of Object.entries(values))
    await page.getByLabel(label, { exact: true }).fill(value);
}
async function holdPersistence(context, origin) {
  let release;
  let entered;
  let count = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const pattern = origin + '/api/hismia/profiles/onboarding';
  await context.route(pattern, async (route) => {
    count++;
    entered();
    await gate;
    await route.fallback();
  });
  return {
    release,
    count: () => count,
    remove: () => context.unroute(pattern),
    async waitForEntry() {
      let timer;
      try {
        await Promise.race([
          reached,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Persistence request missing')), 10_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
const preparedConditions = [
  'prepared-auth-context/first-measured-navigation',
  'prepared-auth-context/repeat-measured-navigation',
];

export function scrubActionDiagnostic(raw = {}) {
  const codes = {
    measurement: [
      'goto',
      'status',
      'heading',
      'observe',
      'observer-read',
      'ready-form',
      'interaction-start',
      'tab',
      'frames',
      'interaction-read',
      'focus-check',
    ],
    preparation: ['login'],
    postcheck: ['network', 'auth', 'page-errors'],
    cleanup: ['context-close', 'server-close', 'browser-kill', 'process-exit'],
  };
  const scope = Object.hasOwn(codes, raw.scope) ? raw.scope : 'unknown';
  const count = (value) => (Number.isInteger(value) && value >= 0 && value <= 20 ? value : null);
  const states = ['ready-profile', 'login-required', 'checking', 'unknown'];
  return {
    scope,
    step: codes[scope]?.includes(raw.step) ? raw.step : 'unknown',
    route: routes.includes(raw.route) ? raw.route : null,
    cache: ['fresh-context', 'repeat-context', ...preparedConditions].includes(raw.cache)
      ? raw.cache
      : null,
    sample: Number.isInteger(raw.sample) && raw.sample >= 1 && raw.sample <= 10 ? raw.sample : null,
    page:
      raw.page && typeof raw.page === 'object'
        ? {
            state: states.includes(raw.page.state) ? raw.page.state : 'unknown',
            counts: Object.fromEntries(
              ['heading', 'readyForm', 'loginLink', 'status'].map((key) => [
                key,
                count(raw.page.counts?.[key]),
              ]),
            ),
          }
        : null,
  };
}

// Read only fixed synthetic UI contracts; raw text is compared in-page, never returned.
function navigationPageState() {
  const headings = [...document.querySelectorAll('h1')];
  const forms = [...document.querySelectorAll('form')];
  const statuses = [...document.querySelectorAll('[role="status"]')];
  const ready = forms.filter((form) =>
    [...form.querySelectorAll('button[type="submit"]')].some(
      (button) => button.textContent.trim() === 'Guardar perfil' && !button.disabled,
    ),
  );
  const links = [...document.querySelectorAll('a[href="/login"]')].filter(
    (link) => link.textContent.trim() === 'inicia sesión',
  );
  let state = 'unknown';
  if (headings.length === 1 && headings[0].textContent.trim() === 'Completar perfil') {
    if (ready.length === 1 && links.length === 0 && forms.length === 1) state = 'ready-profile';
    else if (links.length === 1 && forms.length === 0) state = 'login-required';
    else if (
      forms.length === 0 &&
      links.length === 0 &&
      statuses.length === 1 &&
      statuses[0].textContent.trim() === 'Verificando tu cuenta…'
    )
      state = 'checking';
  }
  return {
    state,
    counts: {
      heading: Math.min(20, headings.length),
      readyForm: Math.min(20, ready.length),
      loginLink: Math.min(20, links.length),
      status: Math.min(20, statuses.length),
    },
  };
}

export async function measure(page, origin, route, cache, sample, evidence = {}) {
  const action = { scope: 'measurement', route, cache, sample, page: null };
  const step = (value) => {
    action.step = value;
    evidence.action = scrubActionDiagnostic(action);
  };
  try {
    step('goto');
    const response = await page.goto(origin + route, { waitUntil: 'load' });
    step('status');
    assert.equal(response.status(), 200, 'Navigation failed');
    step('heading');
    await page.locator('h1').waitFor();
    // A controlled observation window, not a readiness sleep or final lifecycle LCP claim.
    step('observe');
    await page.waitForTimeout(1000);
    step('observer-read');
    const raw = await page.evaluate(() => {
      const lab = window.__hismiaLab;
      for (const { observer, consume } of lab.observers) consume(observer.takeRecords());
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        fcp: lab.fcp,
        lcp: lab.lcp,
        cls: lab.cls,
        responseStart: navigation?.responseStart ?? null,
        ttfb: navigation ? navigation.responseStart - navigation.requestStart : null,
      };
    });
    if (route === '/onboarding' && preparedConditions.includes(cache)) {
      step('ready-form');
      await page
        .getByRole('button', { name: 'Guardar perfil', exact: true })
        .waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const forms = document.querySelectorAll('form');
        if (forms.length !== 1) return false;
        const controls = [...forms[0].querySelectorAll('input,select,button')];
        return (
          controls.length > 0 &&
          controls.some(
            (control) =>
              control.tagName === 'BUTTON' &&
              control.type === 'submit' &&
              control.textContent.trim() === 'Guardar perfil',
          ) &&
          controls.every((control) => {
            const rect = control.getBoundingClientRect();
            return !control.disabled && rect.width > 0 && rect.height > 0;
          })
        );
      });
    }
    step('interaction-start');
    await page.evaluate(() => {
      window.__hismiaInteraction = performance.now();
    });
    step('tab');
    await page.keyboard.press('Tab');
    step('frames');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    step('interaction-read');
    raw.interaction = await page.evaluate(() => performance.now() - window.__hismiaInteraction);
    step('focus-check');
    assert.ok(
      await page.evaluate(() => document.activeElement !== document.body),
      'Keyboard focus unavailable',
    );
    return { route, cache, sample, ...packageMetrics(raw) };
  } catch (error) {
    // Capture failure before diagnostic I/O so a lifecycle deadline still has the action.
    evidence.failedAction ??= scrubActionDiagnostic(action);
    try {
      action.page = await boundedCall(() => page.evaluate(navigationPageState), 250);
      evidence.failedAction = scrubActionDiagnostic(action);
    } catch {
      /* Nullable observation; never replace the primary failure or block cleanup. */
    }
    throw error;
  }
}

export async function measureRoute(page, origin, route, sample, auth, evidence, prepare = login) {
  const conditions =
    route === '/onboarding' ? preparedConditions : ['fresh-context', 'repeat-context'];
  if (route === '/onboarding') {
    evidence.action = scrubActionDiagnostic({
      scope: 'preparation',
      step: 'login',
      route,
      cache: conditions[0],
      sample,
    });
    try {
      // The existing real-SDK fixture signs in in this new context, before any measured
      // navigation. It already visits onboarding: neither subsequent condition is cold.
      await prepare(page, origin, auth);
    } catch (error) {
      evidence.failedAction ??= scrubActionDiagnostic(evidence.action);
      throw error;
    }
  }
  for (const cache of conditions) {
    evidence.navigations.push(await measure(page, origin, route, cache, sample, evidence));
  }
}

async function boundedCall(task, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error('Bounded operation timeout'), { deadline: true })),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function browserSession(
  { chromium, launchOptions, timeoutMs = 300_000, cleanupMs = 3000, evidence },
  task,
) {
  let server;
  let stopped = false;
  let killed;
  let failed = false;
  const check = () => {
    if (stopped) throw new Error('Browser workflow stopped');
  };
  async function cleanup(name, operation) {
    try {
      await boundedCall(operation, cleanupMs);
      evidence.cleanup[name] = 'fulfilled';
    } catch (error) {
      evidence.cleanup[name] = error.deadline ? 'timeout' : 'failed';
      evidence.cleanup.action = scrubActionDiagnostic({
        scope: 'cleanup',
        step: name === 'kill' ? 'browser-kill' : 'server-close',
      });
      failed = true;
    }
  }
  const kill = () => (killed ??= cleanup('kill', () => server.kill()));
  try {
    await boundedCall(async () => {
      server = await chromium.launchServer({ ...launchOptions, timeout: timeoutMs });
      // A late launch is still owned: terminate it, never resume navigation.
      if (stopped) {
        await kill();
        return;
      }
      const browser = await chromium.connect(server.wsEndpoint(), { timeout: timeoutMs });
      check();
      await task(browser, check);
    }, timeoutMs);
  } catch (error) {
    failed = true;
    evidence.failure = {
      category: error.deadline ? 'deadline' : 'workflow',
      stage: evidence.stage,
      action: scrubActionDiagnostic(evidence.failedAction ?? evidence.action),
    };
  } finally {
    stopped = true;
    if (server) {
      if (evidence.failure?.category === 'deadline') await kill();
      await cleanup('serverClose', () => server.close());
      if (evidence.cleanup.serverClose !== 'fulfilled') await kill();
      const child = server.process();
      evidence.cleanup.processExited = child.exitCode !== null || child.signalCode !== null;
      evidence.cleanup.exitCode = child.exitCode;
      evidence.cleanup.signal = child.signalCode;
      if (!evidence.cleanup.processExited) failed = true;
    } else {
      evidence.cleanup.processExited = null;
      failed = true;
    }
  }
  if (failed) {
    evidence.failure ??= {
      category: 'cleanup',
      stage: evidence.stage,
      action: scrubActionDiagnostic(
        evidence.cleanup.action ?? { scope: 'cleanup', step: 'process-exit' },
      ),
    };
    evidence.action = scrubActionDiagnostic(evidence.action);
    if (evidence.failedAction) evidence.failedAction = scrubActionDiagnostic(evidence.failedAction);
    throw Object.assign(new Error('Browser verification failed'), {
      browserEvidence: structuredClone(evidence),
    });
  }
}

export async function runBrowser({ playwrightModule, chrome, axe, samples, scratch, origin, api }) {
  loopbackOrigin(origin);
  const { chromium } = await import(pathToFileURL(playwrightModule).href);
  const evidence = {
    stage: 'launch',
    flows: [],
    a11y: [],
    navigations: [],
    contexts: [],
    cleanup: {},
    methodology: {
      viewport,
      locale: 'es-AR',
      timezone: 'UTC',
      samplesPerRoutePerCondition: samples,
      observationWindowMs: 1000,
      cpuThrottle: 'none',
      networkThrottle: 'none; loopback and locally fulfilled synthetic HTTPS auth',
      cold: 'Other five routes: fresh anonymous context, empty SDK/browser storage; shared browser process and OS caches are not cold',
      warm: 'Other five routes: repeat anonymous navigation in same context/page; HTTP cache disabled by Playwright routing in every condition',
      onboarding: {
        preparation:
          'Each independent sample context uses existing real-SDK synthetic login before measurement, without profile write or storage/session seeding; preparation already visits onboarding',
        conditions: preparedConditions,
        warmth:
          'Both are authenticated and prepared/warm, not cold; first/repeat measured navigations share only their own sample page/session',
        readiness:
          'After fixed post-load observer capture, wait for visible ready-form save button and visible enabled controls, then start Tab timer; navigation timing origin and FCP/windowed LCP/CLS observation window unchanged',
      },
      populations: {
        expectedAnonymousNavigations: 10 * samples,
        expectedPreparedAuthenticatedNavigations: 2 * samples,
        grouping:
          'route plus exact condition; do not pool different authentication/cache populations or merge prior failed anonymous onboarding attempts',
      },
      lcp: 'last observed candidate at end of fixed post-load window, before interaction; not final lifecycle LCP',
      cls: 'maximum 1s-gap/5s session window excluding recent input, within observation window',
      interaction:
        'keyboard Tab to two animation frames, including driver overhead; laboratory latency only',
      limitations: [
        'No field performance or capacity claim',
        'No screen-reader/manual certification',
        'Axe incomplete rules and non-simple background contrasts require manual follow-up',
        'Initial HTML assets omit unreferenced lazy chunks',
        'Browser routing/Chrome flags are not an OS egress firewall',
        'Owned BrowserServer close/kill bounded; direct-child exit observed, not descendant or OS egress proof',
      ],
    },
  };
  let browser;
  let check;
  async function contextTask(stage, task) {
    check();
    evidence.stage = stage;
    evidence.action = scrubActionDiagnostic();
    const context = await browser.newContext({
      viewport,
      locale: 'es-AR',
      timezoneId: 'UTC',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    check();
    const auth = syntheticAuth(origin);
    let boundary;
    let pageErrors = 0;
    try {
      context.setDefaultTimeout(10_000);
      context.on('page', (page) => page.on('pageerror', () => pageErrors++));
      boundary = await installNetworkBoundary(context, { origin, auth });
      check();
      await context.addInitScript(observeNavigation);
      check();
      const page = await context.newPage();
      check();
      await task({ context, page, auth });
      evidence.action = scrubActionDiagnostic({ scope: 'postcheck', step: 'network' });
      assert.equal(boundary.deniedHttp + boundary.deniedWebSocket, 0, 'Unexpected network attempt');
      evidence.action = scrubActionDiagnostic({ scope: 'postcheck', step: 'auth' });
      assert.equal(auth.report().denied, 0, 'Unexpected SDK HTTP contract');
      evidence.action = scrubActionDiagnostic({ scope: 'postcheck', step: 'page-errors' });
      assert.equal(pageErrors, 0, 'Browser page error');
    } catch (error) {
      evidence.failedAction ??= scrubActionDiagnostic(evidence.action);
      throw error;
    } finally {
      let closed = false;
      try {
        await boundedCall(() => context.close(), 3000);
        closed = true;
      } catch (error) {
        evidence.cleanup.action = scrubActionDiagnostic({
          scope: 'cleanup',
          step: 'context-close',
        });
        evidence.failedAction ??= evidence.cleanup.action;
        throw error;
      } finally {
        evidence.contexts.push({
          stage,
          closed,
          network: boundary,
          auth: auth.report(),
          pageErrors,
        });
      }
      check();
    }
  }
  await browserSession(
    {
      chromium,
      evidence,
      launchOptions: {
        executablePath: chrome,
        headless: true,
        env: cleanEnvironment({
          node: process.execPath,
          home: scratch.home,
          apiOrigin: api.origin,
        }),
        args: [
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-sync',
          '--no-first-run',
          '--disable-features=MediaRouter,OptimizationHints',
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        ],
      },
    },
    async (launched, guard) => {
      browser = launched;
      check = guard;
      evidence.browserVersion = browser.version();
      api.reset();
      await contextTask('signup-confirmation', async ({ page, auth }) => {
        await page.goto(origin + '/signup');
        evidence.wordmark = await loadedWordmark(page);
        await page.getByRole('button', { name: 'Crear Cuenta', exact: true }).click();
        await associatedError(page.getByLabel('Email', { exact: true }));
        await audit(page, axe, evidence, 'signup-invalid');
        await page.getByLabel('Email', { exact: true }).fill(syntheticIdentity.email);
        await page.getByLabel('Contraseña', { exact: true }).fill(password);
        await page.getByLabel('Tipo de cuenta', { exact: true }).selectOption('professional');
        await page.getByRole('button', { name: 'Crear Cuenta', exact: true }).click();
        await page
          .getByRole('status')
          .filter({ hasText: 'recibirás un enlace de confirmación' })
          .waitFor();
        assert.equal(auth.report().signup, 1);
        await page.goto(origin + '/auth/confirm?code=synthetic-signup-code');
        await page.getByRole('button', { name: 'Guardar perfil', exact: true }).waitFor();
        assert.equal(
          await page.getByLabel('Tipo de cuenta', { exact: true }).inputValue(),
          'professional',
        );
        assert.equal(auth.report().pkce, 1);
        assert.equal(new URL(page.url()).search, '');
        evidence.flows.push({ name: 'signup-confirmation-real-sdk', passed: true });
      });
      for (const type of ['patient', 'professional', 'institution']) {
        api.reset();
        await contextTask('profile-' + type, async ({ page, context, auth }) => {
          await login(page, origin, auth, type === 'patient');
          if (type === 'professional')
            await page.getByLabel('Nombre visible', { exact: true }).fill('Borrador sintético');
          await page.getByLabel('Tipo de cuenta', { exact: true }).selectOption(type);
          if (type === 'professional')
            assert.equal(await page.getByLabel('Nombre visible', { exact: true }).inputValue(), '');
          await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
          await page
            .getByRole('alert')
            .filter({ hasText: 'Revisa los campos indicados' })
            .waitFor();
          await associatedError(
            page.getByLabel(
              type === 'institution' ? 'Nombre de la institución' : 'Nombre visible',
              { exact: true },
            ),
          );
          await audit(page, axe, evidence, 'profile-' + type + '-invalid');
          await fillProfile(page, type);
          if (type === 'patient') {
            await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('2099-01-01');
            await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
            await associatedError(page.getByLabel('Fecha de nacimiento', { exact: true }));
            await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('1990-01-01');
          }
          const before = api.report().routes['/profiles/onboarding'] ?? 0;
          let held;
          try {
            if (type === 'patient') held = await holdPersistence(context, origin);
            await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
            if (held) {
              await held.waitForEntry();
              assert.equal(
                await page.getByRole('button', { name: 'Guardando…', exact: true }).isDisabled(),
                true,
              );
              await page
                .locator('form')
                .evaluate((form) =>
                  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
                );
              held.release();
            }
            await page
              .getByRole('status')
              .filter({ hasText: 'Perfil guardado o ya existente' })
              .waitFor();
            assert.equal((api.report().routes['/profiles/onboarding'] ?? 0) - before, 1);
            if (held) assert.equal(held.count(), 1);
            await audit(page, axe, evidence, 'profile-' + type + '-saved');
          } finally {
            if (held) {
              held.release();
              await held.remove();
            }
          }
          evidence.flows.push({
            name: 'profile-' + type,
            passed: true,
            duplicateSubmit: type === 'patient',
          });
        });
      }
      api.reset({
        accountType: 'patient',
        displayName: 'Sintético',
        birthDate: '1990-01-01',
        residenceLocality: 'Sintética',
      });
      await contextTask('profile-conflict', async ({ page, auth }) => {
        await login(page, origin, auth);
        await page.getByLabel('Tipo de cuenta', { exact: true }).selectOption('professional');
        await fillProfile(page, 'professional');
        await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'tipo de cuenta diferente' }).waitFor();
        assert.equal(
          await page.getByLabel('Nombre visible', { exact: true }).inputValue(),
          'Sintético',
        );
        await audit(page, axe, evidence, 'profile-conflict');
        evidence.flows.push({ name: 'profile-conflict-preserves-draft', passed: true });
      });
      api.reset();
      await contextTask('recovery-signout-stale-profile', async ({ page, context, auth }) => {
        await login(page, origin, auth);
        await fillProfile(page, 'patient');
        const held = await holdPersistence(context, origin);
        const response = page.waitForResponse(
          (reply) => reply.url() === origin + '/api/hismia/profiles/onboarding',
          { timeout: 60_000 },
        );
        void response.catch(() => {});
        try {
          await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
          await held.waitForEntry();
          const recovery = await context.newPage();
          await recovery.goto(origin + '/auth/reset-password');
          await recovery
            .getByRole('heading', { name: 'Necesitás un enlace de recuperación' })
            .waitFor();
          await recovery.goto(origin + '/auth/recover');
          await recovery.getByLabel('Email', { exact: true }).fill('invalid');
          await recovery
            .getByRole('button', { name: 'Enviar enlace de recuperación', exact: true })
            .click();
          await associatedError(recovery.getByLabel('Email', { exact: true }));
          await audit(recovery, axe, evidence, 'recovery-invalid');
          await recovery.getByLabel('Email', { exact: true }).fill(syntheticIdentity.email);
          await recovery
            .getByRole('button', { name: 'Enviar enlace de recuperación', exact: true })
            .click();
          await recovery
            .getByRole('status')
            .filter({ hasText: 'Si este email puede ser recuperado' })
            .waitFor();
          await recovery.goto(origin + '/auth/reset-password?code=synthetic-recovery-code');
          await recovery.getByLabel('Nueva contraseña', { exact: true }).waitFor();
          assert.equal(new URL(recovery.url()).search + new URL(recovery.url()).hash, '');
          await recovery.getByLabel('Nueva contraseña', { exact: true }).fill('x');
          await recovery
            .getByRole('button', { name: 'Actualizar contraseña', exact: true })
            .click();
          await associatedError(recovery.getByLabel('Nueva contraseña', { exact: true }));
          await audit(recovery, axe, evidence, 'reset-invalid');
          await recovery.getByLabel('Nueva contraseña', { exact: true }).fill(updatedPassword);
          await recovery
            .getByRole('button', { name: 'Actualizar contraseña', exact: true })
            .click();
          await recovery.waitForURL(origin + '/login');
          assert.equal(auth.report().recover, 1);
          assert.equal(auth.report().pkce, 1);
          assert.equal(auth.report().update, 1);
          assert.equal(auth.report().logout, 1);
          assert.equal(
            await recovery.evaluate(() =>
              Object.keys(localStorage).some((key) => key.endsWith('-auth-token')),
            ),
            false,
          );
          await page.getByRole('link', { name: /inicia sesión/i }).waitFor();
          held.release();
          assert.equal((await response).status(), 201);
          assert.equal(await page.getByText(/Perfil guardado o ya existente/).count(), 0);
          evidence.flows.push({
            name: 'recovery-real-sdk-and-cross-tab-signout-stale-result',
            passed: true,
          });
        } finally {
          held.release();
          await held.remove();
        }
      });
      for (const route of routes) {
        for (let sample = 1; sample <= samples; sample++) {
          await contextTask('navigation-' + route, async ({ page, auth }) => {
            await measureRoute(page, origin, route, sample, auth, evidence);
          });
        }
      }
      check();
      evidence.stage = 'complete';
    },
  );
  return evidence;
}
