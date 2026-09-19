#!/bin/bash
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo 'Node.js 22 or newer is required.'; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node.js 22 or newer is required");process.exit(1)}'
cd "$HERE"
exec node server.mjs "$@"
