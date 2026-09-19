#!/bin/sh
# Explicit --live runs only the 48 compact first-pass requests. No shell sourcing of .env.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -n "${JEV_NODE:-}" ]; then
  NODE="$JEV_NODE"
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  NODE=$(command -v node) || { echo 'Node is required. Set JEV_NODE to your installed Node executable.' >&2; exit 1; }
fi
mode=${1:---prepare}
[ "$#" -eq 0 ] || shift
case "$mode" in
  --live)
    if [ "$#" -ne 0 ] && { [ "$#" -ne 2 ] || [ "$1" != '--limit' ]; }; then
      echo 'Usage: run-compact-pilot.sh --live [--limit 1..48]' >&2; exit 1
    fi
    "$NODE" scripts/compact-pilot.mjs --prepare
    HASH=$("$NODE" -p 'JSON.parse(require("node:fs").readFileSync("runs/compact-single-pass-48-v1/manifest.json", "utf8")).planHash')
    "$NODE" scripts/compact-pilot.mjs --live --approve-plan "$HASH" --max-requests 48 --max-cost-usd 0.30 "$@"
    ;;
  --prepare|--status|--report|--help)
    [ "$#" -eq 0 ] || { echo 'Unexpected arguments.' >&2; exit 1; }
    "$NODE" scripts/compact-pilot.mjs "$mode"
    ;;
  *) echo 'Usage: run-compact-pilot.sh [--prepare|--status|--report|--live [--limit 1..48]]' >&2; exit 1 ;;
esac
