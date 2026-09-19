#!/bin/sh
# No install step. Runs from its own extracted folder, writing only new experiment outputs in the project.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${JEV_NODE:-}" ]; then
  NODE="$JEV_NODE"
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  NODE=$(command -v node) || { echo 'Node 22+ is required. Set JEV_NODE to the installed executable.' >&2; exit 1; }
fi
"$NODE" -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node 22+ is required");process.exit(1)}'
exec "$NODE" "$HERE/lab.mjs" "$@"
