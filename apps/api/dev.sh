#!/bin/bash
# The AppConfigModule in apps/api/src/app-config/app-config.module.ts
# replaces the old private-runtime.mjs start path. The start
# strict-env-allowlist was dropped: Nest now starts with the operator's
# full process.env, and the AppConfigModule's OnModuleInit asserts the
# DATABASE_URL, CA and DB connectivity via dedicated, well-tested pure
# functions. Setup of the private config and CA still uses
# `apps/api/scripts/dev-setup.mjs` and must be run once before this
# script is useful.
set -euo pipefail
exec pnpm exec nest start "$@"
