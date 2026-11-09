#!/bin/sh
# A typed nullish cleanup uses its existing null ABI despite unrelated Dyn imports; opaque Dyn is no typed callable.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for fixture in used unused; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run "tests/data/nullable_cleanup/$fixture.ts" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^nullable cleanup: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
if LANG=en timeout 15 "$ZINC" check tests/data/nullable_cleanup/invalid.ts >"$tmp/log" 2>&1; then echo 'opaque Dyn accepted as typed callable'; exit 1; fi
grep -q 'Z0005' "$tmp/log" || { cat "$tmp/log"; exit 1; }
if LANG=en timeout 15 "$ZINC" check tests/data/nullable_cleanup/invalid_return.ts >"$tmp/log" 2>&1; then echo 'scalar accepted as cleanup'; exit 1; fi
grep -q 'Z0103' "$tmp/log" || { cat "$tmp/log"; exit 1; }
