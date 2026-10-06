import { constants } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  symlink,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

// No broad repository copy, no environment discovery and no caller-file deletion.
const areas = ['', 'apps/front', 'packages/types', 'packages/validation'];
const publicPaths = [
  'apps/front/src',
  'apps/front/public',
  'packages/types/src',
  'packages/validation/src',
  'package.json',
  'tsconfig.base.json',
  'eslint.config.mjs',
  '.prettierrc.json',
  'apps/front/package.json',
  'apps/front/tsconfig.json',
  'apps/front/next-env.d.ts',
  'apps/front/next.config.mjs',
  'apps/front/postcss.config.mjs',
  'packages/types/package.json',
  'packages/types/tsconfig.json',
  'packages/validation/package.json',
  'packages/validation/tsconfig.json',
];
const excluded =
  /^(?:\.env.*|\.git|\.svn|\.hg|\.next|\.cache|\.vite|\.turbo|\.pnpm|\.output|\.vercel|node_modules|dist|build|out|coverage|caches?|secrets?|credentials?|private[-_.]?runtime.*|\.?meta)$/i;
const extensions = /\.(?:tsx?|[cm]?js|json|css|svg|png|jpe?g|webp|ico|woff2?|txt)$/i;
const layouts = new WeakSet();
function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
function requireScratch(scratch) {
  if (!layouts.has(scratch)) throw new Error('Unknown scratch layout');
}
async function safeSource(root, relative) {
  let file = root;
  for (const segment of relative.split('/')) {
    file = path.join(file, segment);
    let stat;
    try {
      stat = await lstat(file);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('Public source unavailable');
    }
    if (stat.isSymbolicLink()) throw new Error('Public source symlink denied');
  }
  return file;
}
async function copyPublic(source, destination, budget) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Public source symlink denied');
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      // Filter names before opening or inspecting their contents.
      if (excluded.test(name)) continue;
      await copyPublic(path.join(source, name), path.join(destination, name), budget);
    }
  } else if (stat.isFile() && extensions.test(source)) {
    if (stat.size > 20_000_000 || (budget.bytes += stat.size) > 100_000_000)
      throw new Error('Public snapshot size limit');
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    budget.files++;
  } else if (!stat.isFile()) throw new Error('Nonregular public source denied');
}

/** Creates a fresh public-only tree. Retains it for evidence; never deletes it. */
export async function createScratch({ repoRoot, parent = tmpdir() }) {
  if (!path.isAbsolute(repoRoot) || !(await lstat(repoRoot)).isDirectory())
    throw new Error('Invalid repository root');
  const source = await realpath(repoRoot);
  const destinationParent = await realpath(parent);
  if (destinationParent === source || inside(source, destinationParent))
    throw new Error('Scratch must be outside repository');
  const root = await mkdtemp(path.join(destinationParent, 'hismia-public-'));
  const budget = { bytes: 0, files: 0 };
  for (const relative of publicPaths) {
    const file = await safeSource(source, relative);
    if (file) await copyPublic(file, path.join(root, relative), budget);
  }
  const home = path.join(root, 'home');
  await mkdir(home);
  const scratch = Object.freeze({
    root,
    source,
    front: path.join(root, 'apps/front'),
    home,
    snapshot: Object.freeze(budget),
  });
  layouts.add(scratch);
  return scratch;
}

/** Direct package links only; the node_modules directory itself is scratch-owned. */
export async function linkDependencies(scratch) {
  requireScratch(scratch);
  for (const area of areas) {
    const directory = path.join(scratch.root, area);
    const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const dependencies = { ...metadata.dependencies, ...metadata.devDependencies };
    await mkdir(path.join(directory, 'node_modules'), { recursive: true });
    for (const name of Object.keys(dependencies).sort()) {
      if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(name) || name.includes('..'))
        throw new Error('Invalid dependency name');
      const destination = path.join(directory, 'node_modules', name);
      let target;
      if (name === '@hismia/types' || name === '@hismia/validation') {
        target = path.join(scratch.root, 'packages', name.split('/')[1]);
      } else {
        if (name.startsWith('@hismia/') || String(dependencies[name]).startsWith('workspace:'))
          throw new Error('Unknown workspace dependency');
        const store = path.join(scratch.source, 'node_modules/.pnpm');
        // Reject redirected store roots. Normal pnpm package links are allowed.
        for (const directory of [path.dirname(store), store]) {
          try {
            if (!(await lstat(directory)).isDirectory()) throw new Error();
          } catch {
            throw new Error('Invalid public dependency store');
          }
        }
        for (const base of [path.join(scratch.source, area), scratch.source]) {
          try {
            target = await realpath(path.join(base, 'node_modules', name));
            break;
          } catch (error) {
            if (error.code !== 'ENOENT') throw new Error('Public dependency unavailable');
          }
        }
        if (
          !target ||
          !inside(store, target) ||
          !target.endsWith(`${path.sep}node_modules${path.sep}${name}`)
        )
          throw new Error('Dependency outside public store');
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await symlink(target, destination, 'dir');
    }
  }
}

export function loopbackOrigin(value, expectedPort) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid loopback origin');
  }
  const port = Number(url.port);
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    (expectedPort !== undefined && port !== expectedPort) ||
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    value !== url.origin
  )
    throw new Error('Invalid loopback origin');
  return url.origin;
}
export function cleanEnvironment({ node, home, apiOrigin }) {
  if (!path.isAbsolute(node) || !path.isAbsolute(home)) throw new Error('Invalid tool/home');
  return {
    HOME: home,
    XDG_CONFIG_HOME: home,
    PATH: `${path.dirname(node)}:/usr/bin:/bin`,
    NEXT_TELEMETRY_DISABLED: '1',
    HISMIA_API_ORIGIN: loopbackOrigin(apiOrigin),
    NEXT_PUBLIC_SUPABASE_URL: 'https://auth.synthetic.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key',
  };
}
function bounded(value, fallback) {
  const duration = value ?? fallback;
  if (!Number.isInteger(duration) || duration < 1 || duration > 1_800_000)
    throw new Error('Invalid timeout');
  return duration;
}
function failure(message, receipt) {
  return Object.assign(new Error(message), { receipt });
}
function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw new Error('Cannot inspect owned process group');
  }
}
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw new Error('Cannot stop owned process group');
  }
}

/** POSIX-only owned process group. No shell, inherited env or child output in reports. */
export async function spawnOwned({
  scratch,
  node,
  script,
  args = [],
  apiOrigin,
  cwd = scratch?.front,
}) {
  requireScratch(scratch);
  if (process.platform === 'win32') throw new Error('Owned process groups require POSIX');
  if (!path.isAbsolute(node) || path.basename(node) !== 'node' || !(await lstat(node)).isFile())
    throw new Error('Invalid Node tool');
  await access(node, constants.X_OK);
  if ((await realpath(node)) !== (await realpath(process.execPath)))
    throw new Error('Node tool must match the invoking runtime');
  if (
    !Array.isArray(args) ||
    args.some(
      (arg) => typeof arg !== 'string' || arg.length > 4096 || /[\u0000-\u001f\u007f]/.test(arg),
    )
  )
    throw new Error('Invalid command argument');
  const scriptPath = await realpath(script);
  const store = path.join(scratch.source, 'node_modules/.pnpm');
  const publicCli =
    inside(store, scriptPath) &&
    /\/node_modules\/(?:typescript\/bin\/tsc|next\/dist\/bin\/next)$/.test(scriptPath);
  if (
    (!inside(scratch.root, scriptPath) && !inside(store, scriptPath)) ||
    !(await lstat(scriptPath)).isFile() ||
    (!/\.(?:[cm]?js)$/.test(scriptPath) && !publicCli)
  )
    throw new Error('Invalid owned script');
  if (!inside(scratch.root, cwd) || (await realpath(cwd)) !== cwd)
    throw new Error('Invalid owned cwd');
  const started = performance.now();
  const environment = cleanEnvironment({ node, home: scratch.home, apiOrigin });
  const child = spawn(node, [scriptPath, ...args], {
    cwd,
    env: environment,
    detached: true,
    stdio: 'ignore',
    shell: false,
  });
  let ended = false;
  let receipt;
  let launchError = false;
  const exit = new Promise((resolve) => {
    child.once('error', () => {
      launchError = true;
    });
    child.once('close', (exitCode, signal) => {
      ended = true;
      receipt = {
        pid: child.pid ?? null,
        exitCode,
        signal,
        durationMs: performance.now() - started,
      };
      resolve(receipt);
    });
  });
  let stopping;
  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      if (child.pid && groupAlive(child.pid)) signalGroup(child.pid, 'SIGTERM');
      const deadline = performance.now() + 1500;
      while ((!ended || (child.pid && groupAlive(child.pid))) && performance.now() < deadline)
        await delay(20);
      if (child.pid && groupAlive(child.pid)) signalGroup(child.pid, 'SIGKILL');
      const killDeadline = performance.now() + 1500;
      while ((!ended || (child.pid && groupAlive(child.pid))) && performance.now() < killDeadline)
        await delay(20);
      const quiescent = ended && (!child.pid || !groupAlive(child.pid));
      const result = { ...receipt, pid: child.pid ?? null, quiescent };
      if (!quiescent) throw failure('Owned process did not quiesce', result);
      return result;
    })();
    return stopping;
  }
  // Readiness must attribute the listener to this exact child, not a port alone.
  // lsof inspects only its IPv4 LISTEN socket; -nP disables name/service lookups.
  // No file/process inventory, inherited environment, shell or raw tool output.
  async function ownsListener(port, timeoutMs) {
    if (ended || stopping || !child.pid) return false;
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('Invalid listener port');
    for (const tool of ['/usr/sbin/lsof', '/usr/bin/lsof']) {
      try {
        const { stdout } = await promisify(execFile)(
          tool,
          [
            '-nP',
            '-a',
            '-p',
            String(child.pid),
            '-i4TCP@127.0.0.1:' + port,
            '-sTCP:LISTEN',
            '-Fpn',
          ],
          {
            cwd,
            env: environment,
            timeout: bounded(timeoutMs, 500),
            killSignal: 'SIGKILL',
            maxBuffer: 4096,
          },
        );
        const fields = stdout.trim().split('\n');
        return (
          !ended &&
          !stopping &&
          fields.includes(`p${child.pid}`) &&
          fields.includes(`n127.0.0.1:${port}`)
        );
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        if (error.code === 1 || error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
          return false;
        throw new Error('Listener ownership inspection failed');
      }
    }
    throw new Error('Listener ownership tool unavailable');
  }
  return Object.freeze({
    exit,
    stop,
    ownsListener,
    get ended() {
      return ended;
    },
    get launchError() {
      return launchError;
    },
  });
}

export async function runOwned(options) {
  const timeoutMs = bounded(options.timeoutMs, 120_000);
  const owned = await spawnOwned(options);
  let timer;
  let timedOut = false;
  try {
    await Promise.race([
      owned.exit,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const receipt = await owned.stop();
  if (timedOut) throw failure('Command timed out', receipt);
  if (owned.launchError || receipt.exitCode !== 0) throw failure('Command failed', receipt);
  return receipt;
}

/** Requires system lsof and the exact owned child's loopback listener before AND
 * after HTTP 200. No availability-check race or unrelated listener can prove readiness.
 * Denies redirects; failure always stops the owned child before rejecting.
 */
export async function waitReady(owned, { origin, port, pathname = '/login', timeoutMs = 30_000 }) {
  try {
    loopbackOrigin(origin, port);
    const duration = bounded(timeoutMs, 30_000);
    if (!['/login', '/auth/recover', '/'].includes(pathname))
      throw new Error('Invalid readiness path');
    const deadline = performance.now() + duration;
    const probeTimeout = () => Math.min(500, Math.max(1, Math.ceil(deadline - performance.now())));
    while (!owned.ended && performance.now() < deadline) {
      if (!(await owned.ownsListener(port, probeTimeout()))) {
        await delay(25);
        continue;
      }
      let ok = false;
      try {
        const response = await fetch(`${origin}${pathname}`, {
          redirect: 'manual',
          signal: AbortSignal.timeout(
            Math.min(500, Math.max(1, Math.ceil(deadline - performance.now()))),
          ),
        });
        await response.body?.cancel();
        ok = response.status === 200;
      } catch {
        /* Only retry this already validated loopback destination. */
      }
      if (
        ok &&
        !owned.ended &&
        performance.now() < deadline &&
        (await owned.ownsListener(port, probeTimeout()))
      )
        return;
      await delay(25);
    }
    throw new Error('Readiness failed');
  } catch (error) {
    const receipt = await owned.stop();
    if (
      [
        'Invalid loopback origin',
        'Listener ownership tool unavailable',
        'Listener ownership inspection failed',
      ].includes(error.message)
    )
      throw failure(error.message, receipt);
    throw failure('Readiness failed', receipt);
  }
}

/** Build scratch workspace packages before invoking the real Next build. Not run by unit tests. */
export async function buildScratch(scratch, { node, apiOrigin, timeoutMs = 600_000 }) {
  requireScratch(scratch);
  const receipts = [];
  for (const name of ['types', 'validation']) {
    receipts.push(
      await runOwned({
        scratch,
        node,
        apiOrigin,
        timeoutMs,
        cwd: path.join(scratch.root, 'packages', name),
        script: path.join(scratch.root, 'packages', name, 'node_modules/typescript/bin/tsc'),
        args: ['--incremental', 'false'],
      }),
    );
  }
  receipts.push(
    await runOwned({
      scratch,
      node,
      apiOrigin,
      timeoutMs,
      script: path.join(scratch.front, 'node_modules/next/dist/bin/next'),
      args: ['build'],
    }),
  );
  return { packages: receipts.slice(0, 2), next: receipts[2] };
}

/** Caller must use try/finally and await owned.stop(); binds Next only to 127.0.0.1. */
export async function startScratch(scratch, { node, apiOrigin, port, timeoutMs = 30_000 }) {
  const origin = loopbackOrigin(`http://127.0.0.1:${port}`, port);
  if (origin === loopbackOrigin(apiOrigin)) throw new Error('Next and stub ports must differ');
  const owned = await spawnOwned({
    scratch,
    node,
    apiOrigin,
    script: path.join(scratch.front, 'node_modules/next/dist/bin/next'),
    args: ['start', '-H', '127.0.0.1', '-p', String(port)],
  });
  await waitReady(owned, { origin, port, timeoutMs });
  return { origin, owned };
}
