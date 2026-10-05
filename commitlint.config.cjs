// Commitlint configuration. Enforces Conventional Commits for every
// commit that lands in this repository. Pairs with `.husky/commit-msg`,
// which invokes `pnpm commitlint --edit "$1"`.
//
// Keep this file conservative: the repository already uses Conventional
// Commits manually (see `AGENTS.md` §3.2). Adding extra rules tends to
// fight the workflow rather than help it. If a custom rule is needed,
// document the rationale in `odd/tasks/` before adding it here.
'use strict';

module.exports = {
  extends: ['@commitlint/config-conventional'],
};
