#!/bin/sh
# Exact Web Worker facade regression, no window or network.
set -eu
out=$(mktemp)
trap 'rm -f "$out"' EXIT
ZINC_HEADLESS=1 ZINC_WEB=1 timeout 8 "$ZINC" run --engine quickjs tests/golden/web_worker/page.js > "$out" 2>&1 || { cat "$out"; exit 1; }
grep -Fx 'web Worker: clone transfer module Blob capacity crash PASS' "$out" >/dev/null || { cat "$out"; exit 1; }
ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_PERMISSIONS=enforce timeout 5 "$ZINC" run --engine quickjs tests/golden/web_worker/permissions > "$out" 2>&1 || { cat "$out"; exit 1; }
grep -Fx 'web Worker: enforced file and network permission denial PASS' "$out" >/dev/null || { cat "$out"; exit 1; }
bin=$(dirname "$ZINC")
"$bin/host_permissions_test" > "$out" 2>&1 || { cat "$out"; exit 1; }
[ "$(grep -c 'worker.invalid' "$out")" = 1 ] || { cat "$out"; exit 1; }
