// Path-aware lint-staged configuration.
// We dispatch eslint to the package that owns the staged file so each
// package's lint command mirrors what `pnpm -r run lint` does. Plain
// prettier runs on every supported file because prettier picks up
// `.prettierrc.json` from the repo root automatically.
//
// Notes for future maintainers:
// - The root `eslint.config.mjs` is TypeScript-only and explicitly
//   ignores `*.js`, `*.mjs`, `*.cjs`. Those extensions go through
//   prettier only.
// - `apps/front` is the only workspace with ESLint 9 (flat config).
//   The other workspaces share the root flat config. Calling eslint
//   with `--config` keeps the resolution explicit.
'use strict';

const isFront = (filename) => filename.startsWith('apps/front/');
const isApi = (filename) => filename.startsWith('apps/api/');
const isPackage = (filename) => /^packages\/[^/]+\//.test(filename);

/** @type {import('lint-staged').Config} */
module.exports = {
  '*.{js,mjs,cjs}': (filenames) => filenames.map((filename) => `prettier --write ${filename}`),

  '*.{json,md}': (filenames) => filenames.map((filename) => `prettier --write ${filename}`),

  '*.{ts,tsx}': (filenames) => {
    const commands = [];
    for (const filename of filenames) {
      commands.push(`prettier --write ${filename}`);
      if (isFront(filename)) {
        commands.push(
          `pnpm --filter @hismia/front exec eslint --fix --max-warnings=0 --no-warn-ignored ${filename}`,
        );
      } else if (isApi(filename) || isPackage(filename)) {
        commands.push(`pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored ${filename}`);
      } else {
        // Root-level TS files: use the root flat config.
        commands.push(`pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored ${filename}`);
      }
    }
    return commands;
  },
};
