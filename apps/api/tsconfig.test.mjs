import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from './node_modules/typescript/lib/typescript.js';

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(apiDir, '../..');
const requireFromApi = createRequire(import.meta.url);

function diagnosticsText(diagnostics) {
  return diagnostics
    .map((item) => `${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`)
    .join('\n');
}

// Use the public parser so extends, relative paths and defaults are real.
function readConfig(relativePath) {
  const configPath = path.join(rootDir, relativePath);
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.strictEqual(loaded.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  assert.strictEqual(diagnosticsText(parsed.errors), '');
  return parsed.options;
}

const options = readConfig('apps/api/tsconfig.json');

// Virtual source files live under API/src for real package-scope resolution.
// Neither source nor emitted output is written to disk; installed declarations
// and public package exports remain the compiler's normal filesystem inputs.
function compile(sources, overrides = {}) {
  const files = new Map(
    Object.entries(sources).map(([name, source]) => [path.join(apiDir, 'src', name), source]),
  );
  const compilerOptions = { ...options, incremental: false, ...overrides };
  const host = ts.createCompilerHost(compilerOptions);
  const originalReadFile = host.readFile;
  const originalFileExists = host.fileExists;
  host.readFile = (name) => files.get(name) ?? originalReadFile(name);
  host.fileExists = (name) => files.has(name) || originalFileExists(name);
  const output = new Map();
  host.writeFile = (name, content) => output.set(name, content);
  const program = ts.createProgram([...files.keys()], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const emitted = program.emit();
  diagnostics.push(...emitted.diagnostics);
  return { output, diagnostics, program };
}

function emittedFile(result, name) {
  const text = result.output.get(path.join(apiDir, 'dist', name));
  assert.notStrictEqual(text, undefined, `missing emitted ${name}`);
  return text;
}

function executeCommonJs(source, requireModule = requireFromApi) {
  const module = { exports: {} };
  // Only our synthetic compiler output is evaluated, never application code.
  new Function('require', 'exports', 'module', source)(requireModule, module.exports, module);
  return module.exports;
}

test('API inherits strict options and uses an unsuppressed NodeNext pair', () => {
  assert.strictEqual(options.module, ts.ModuleKind.NodeNext);
  assert.strictEqual(options.moduleResolution, ts.ModuleResolutionKind.NodeNext);
  assert.strictEqual(options.ignoreDeprecations, undefined);
  for (const flag of [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitOverride',
    'noImplicitReturns',
    'useUnknownInCatchVariables',
    'noUnusedLocals',
    'noUnusedParameters',
    'esModuleInterop',
    'forceConsistentCasingInFileNames',
    'isolatedModules',
    'resolveJsonModule',
    'skipLibCheck',
    'declaration',
    'sourceMap',
    'experimentalDecorators',
    'emitDecoratorMetadata',
  ])
    assert.strictEqual(options[flag], true, flag);
  assert.strictEqual(options.verbatimModuleSyntax, false);
  assert.strictEqual(options.target, ts.ScriptTarget.ES2022);
  assert.deepStrictEqual(options.lib, ['lib.es2022.d.ts']);
  assert.equal(options.rootDir, path.join(apiDir, 'src'));
  assert.equal(options.outDir, path.join(apiDir, 'dist'));
  for (const name of ['package.json', 'apps/api/package.json']) {
    assert.strictEqual(JSON.parse(readFileSync(path.join(rootDir, name), 'utf8')).type, undefined);
  }
  const front = readConfig('apps/front/tsconfig.json');
  assert.strictEqual(front.moduleResolution, ts.ModuleResolutionKind.Bundler);
  assert.strictEqual(front.module, ts.ModuleKind.ESNext);
  assert.strictEqual(front.verbatimModuleSyntax, true);
  assert.strictEqual(front.noEmit, true);
});

test('package-default CommonJS keeps extensionless imports and Nest metadata emit', () => {
  const result = compile({
    'config-dependency.ts': 'export class Dependency {}',
    'config-decorated.ts': `
      import { Dependency } from './config-dependency';
      function Injectable(): ClassDecorator { return () => {}; }
      @Injectable()
      export class Service {
        constructor(public readonly dependency: Dependency) {}
      }
    `,
  });
  assert.strictEqual(diagnosticsText(result.diagnostics), '');
  const js = emittedFile(result, 'config-decorated.js');
  assert.match(js, /require\("\.\/config-dependency"\)/);
  assert.match(js, /__decorate/);
  assert.match(js, /__metadata\("design:paramtypes", \[config_dependency_1.Dependency\]\)/);
  assert.match(js, /sourceMappingURL=config-decorated.js.map/);
  assert.match(emittedFile(result, 'config-decorated.d.ts'), /export declare class Service/);
  const map = JSON.parse(emittedFile(result, 'config-decorated.js.map'));
  assert.equal(map.version, 3);
  assert.ok(map.sources.some((name) => name.endsWith('config-decorated.ts')));
  requireFromApi('reflect-metadata');
  const dependency = executeCommonJs(emittedFile(result, 'config-dependency.js'));
  const { Service } = executeCommonJs(js, (name) => {
    assert.equal(name, './config-dependency');
    return dependency;
  });
  assert.deepEqual(Reflect.getMetadata('design:paramtypes', Service), [dependency.Dependency]);
  assert.ok(new Service(new dependency.Dependency()).dependency instanceof dependency.Dependency);
});

const publicImports = {
  'config-public.ts': `
    import { decodeProtectedHeader } from 'jose';
    import { healthCheckSchema } from '@hismia/validation';
    import type { HealthResponse } from '@hismia/types';
    export const decode = decodeProtectedHeader;
    export function check(value: HealthResponse): boolean {
      return healthCheckSchema.safeParse(value).success;
    }
    export const loadJose = () => import('jose');
  `,
};

test('real workspace exports and modern jose static imports compile and load on Node', async () => {
  const result = compile(publicImports);
  assert.equal(diagnosticsText(result.diagnostics), '');
  // Inspect actual source inputs: no paths/Vitest aliases to workspace src.
  const sourceNames = result.program.getSourceFiles().map((file) => file.fileName);
  for (const name of ['types', 'validation']) {
    const publicTypes = requireFromApi
      .resolve(`@hismia/${name}`)
      .replace(/index\.js$/, 'index.d.ts');
    assert.ok(sourceNames.includes(publicTypes), `public declarations for ${name}`);
  }
  const js = emittedFile(result, 'config-public.js');
  assert.match(js, /require\("jose"\)/);
  assert.match(js, /require\("@hismia\/validation"\)/);
  assert.doesNotMatch(js, /require\("@hismia\/types"\)/);
  assert.match(js, /import\('jose'\)/);
  const loaded = executeCommonJs(js);
  assert.equal(typeof loaded.decode, 'function');
  assert.equal(loaded.check({ status: 'ok', apiVersion: 'v1', uptimeSeconds: 0 }), true);
  assert.equal(loaded.check({ status: 'invalid', apiVersion: 'v1', uptimeSeconds: 0 }), false);
  assert.equal((await loaded.loadJose()).decodeProtectedHeader, loaded.decode);
  // The types-only package's runtime export is still loadable, without bootstrapping.
  assert.equal(typeof requireFromApi('@hismia/types'), 'object');
});

test('Node16 is not a substitute for modern CommonJS to ESM interoperability', () => {
  const result = compile(publicImports, {
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
  });
  assert.ok(
    result.diagnostics.some(
      (item) =>
        item.code === 1479 &&
        ts.flattenDiagnosticMessageText(item.messageText, '\n').includes('jose'),
    ),
    diagnosticsText(result.diagnostics),
  );
});
