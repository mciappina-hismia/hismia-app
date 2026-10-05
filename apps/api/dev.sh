#!/bin/bash
set -euo pipefail
# Load non-secret defaults from apps/api/.env (URLs, anon key, NODE_ENV).
# This is a sibling of the private `apps/api/.env.runtime.local`; both
# live alongside `apps/api/dev.sh` and are required for `pnpm dev` to
# reach the listener. Anything already exported in the shell wins.
SCRIPT_DIR="$(cd "$(dirname -- "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"
  set +a
fi
exec pnpm exec nest start "$@"