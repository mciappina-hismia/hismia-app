#!/bin/bash
set -euo pipefail
# The helper parses private configuration as data.
exec node "$(dirname "$0")/scripts/private-runtime.mjs" start --ack-api-listener "$@"
