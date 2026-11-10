#!/bin/sh
# Mixed primitive unions keep their runtime typeof, including optional fields and one evaluation of calls/getters.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/typeof_union/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^typeof union: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
