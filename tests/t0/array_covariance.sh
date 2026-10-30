#!/bin/sh
# Covariant arrays (`Big[]` as `Song[]`, `Dog[]` as `Animal[]`) on the interpreter, AOT and QuickJS, with the same output.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/array_covariance
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/main.ts 2>/dev/null | diff -u $d/expected.out - || { echo "interpreter output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts --engine quickjs 2>/dev/null | diff -u $d/expected.out - || { echo "QuickJS output differs"; fail=1; }
if timeout 300 "$ZINC" build $d/main.ts -o "$tmp/a" >/dev/null 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/a" 2>/dev/null | diff -u $d/expected.out - || { echo "AOT output differs"; fail=1; }
else echo "zinc build failed"; fail=1; fi
exit $fail
