// Regression test for the historical Next embedded lint failure.
//
// `next lint` is deprecated in Next.js 15 and will be removed in Next 16.
// With current `eslint-config-next` it fails with:
//   Invalid Options: useEslintrc, extensions, resolvePluginsRelativeTo,
//                    rulePaths, ignorePath, reportUnusedDisableDirectives
// We rely on the direct ESLint CLI instead. This test guards the package.json
// declaration and the absence of a runnable Next lint wrapper.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(here, '..', 'package.json');

describe('frontend lint policy', () => {
  it('declares an ESLint CLI lint script without an embedded next lint script', async () => {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    assert.equal(pkg.scripts?.lint, 'eslint src --max-warnings=0');
    assert.ok(!Object.keys(pkg.scripts ?? {}).includes('next-lint'));
    for (const value of Object.values(pkg.scripts ?? {})) {
      assert.ok(
        !/(^|\s)next\s+lint(\s|$)/.test(value),
        `forbidden embedded next lint script: ${value}`,
      );
    }
  });
});
