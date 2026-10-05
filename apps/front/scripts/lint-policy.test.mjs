import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runLintCheck } from 'next/dist/lib/eslint/runLintCheck.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const pkgPath = path.join(frontendDir, 'package.json');
const sourceDir = path.join(frontendDir, 'src');
const sentinelMessage = 'Next embedded lint regression sentinel';

function assertLintResult(result, context) {
  assert.notEqual(result, null, `${context}: Next must not swallow lint failure as null`);
  assert.equal(typeof result, 'object', `${context}: expected a structured lint result`);
  assert.ok(
    result.eventInfo?.lintedFilesCount > 0,
    `${context}: Next must actually lint frontend source files`,
  );
}

describe('frontend lint policy', () => {
  it('does not bypass build lint with ignoreDuringBuilds', async () => {
    // Read the public source instead of evaluating config and its runtime env lookup.
    const config = await readFile(path.join(frontendDir, 'next.config.mjs'), 'utf8');
    assert.doesNotMatch(config, /\bignoreDuringBuilds\b/);
  });

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

describe('Next actual embedded lint adapter', () => {
  for (const lintDuringBuild of [false, true]) {
    const mode = `lintDuringBuild=${lintDuringBuild}`;

    it(`lints frontend src successfully (${mode})`, async (t) => {
      const result = await runLintCheck(frontendDir, [sourceDir], {
        lintDuringBuild,
        // ESLint cwd is independent of Next's baseDir; do not mutate process.cwd().
        eslintOptions: { cwd: frontendDir, cache: false, fix: false },
      });
      assertLintResult(result, mode);
      t.diagnostic(`lintedFilesCount=${result.eventInfo.lintedFilesCount}`);
      assert.equal(result.isError, false, result.output ?? mode);
    });

    it(`reports an in-memory Program sentinel violation (${mode})`, async (t) => {
      const result = await runLintCheck(frontendDir, [sourceDir], {
        lintDuringBuild,
        eslintOptions: {
          cwd: frontendDir,
          cache: false,
          fix: false,
          overrideConfig: {
            rules: {
              'no-restricted-syntax': [
                'error',
                { selector: 'Program', message: sentinelMessage },
              ],
            },
          },
        },
      });
      assertLintResult(result, mode);
      t.diagnostic(`lintedFilesCount=${result.eventInfo.lintedFilesCount}`);
      assert.equal(result.isError, true, `${mode}: sentinel must make lint fail`);
      assert.ok(
        result.output?.includes(sentinelMessage),
        `${mode}: failure must come from the sentinel, not an unrelated lint error`,
      );
    });
  }
});
