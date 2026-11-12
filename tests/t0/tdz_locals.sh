#!/bin/sh
# Local-name membership preserves shadowing and sibling TDZ guards.
cd "$(dirname "$0")/../.." || exit 2
set -eu
export ZINC_HEADLESS=1 ZINC_LANG=en
fixture=tests/data/tdz_locals
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in interp quickjs; do
  if [ "$engine" = interp ]; then
    timeout 15 "$ZINC" run --interp "$fixture/main.ts" > "$tmp/out"
  else
    timeout 15 "$ZINC" run --engine quickjs "$fixture/main.ts" > "$tmp/out"
  fi
  diff -u "$fixture/expected.txt" "$tmp/out"
done
timeout 30 "$ZINC" build "$fixture/main.ts" -o "$tmp/main" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
timeout 10 "$tmp/main" > "$tmp/out"
diff -u "$fixture/expected.txt" "$tmp/out"
for name in negative var-negative; do
  if timeout 15 "$ZINC" check "$fixture/$name.ts" > "$tmp/diagnostic" 2>&1; then
    echo "$name unexpectedly accepted"; exit 1
  fi
  grep 'error Z' "$tmp/diagnostic" > "$tmp/errors"
  diff -u "$fixture/$name.txt" "$tmp/errors"
done
