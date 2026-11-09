#!/bin/sh
# Library conversion rewrites retain one checked call; real subsequent calls still need fresh guards.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/guarded_callback/main.ts $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^guarded callback: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for fixture in unchecked mutated second_call; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/guarded_callback/$fixture.ts" >"$tmp/log" 2>&1; then echo "unsafe callback accepted: $fixture"; exit 1; fi
  grep -q Z0105 "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
