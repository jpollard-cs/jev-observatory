#!/bin/bash
set -euo pipefail
BASE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null || { echo 'Node.js 20 or later is required.' >&2; exit 1; }
exec node "$BASE/cli.mjs" prepare "$@"
