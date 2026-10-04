#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
source .env
# shellcheck disable=SC1091
source .env.runtime.local
set +a
exec "$(pnpm bin)"/nest start "$@"