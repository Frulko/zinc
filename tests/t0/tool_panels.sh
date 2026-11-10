#!/bin/sh
# Pure bounds, parser transitions and editor math; no rendering or services.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  got=$(timeout 35 "$ZINC" run tests/data/tool_panels/model.ts "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^tool models: ok$' || { echo "$got"; exit 1; }
done
echo 'tool panels: ok'
