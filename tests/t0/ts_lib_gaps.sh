#!/bin/sh
# ZN-1050: number toLocaleString, JSON.stringify with a replacer and integer keys first, an any as a condition or a ?: branch (tests/data/ts_lib_gaps, Node output), and a zinc:sys clock() finer than the millisecond: interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/ts_lib_gaps
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/main.ts 2>/dev/null | diff -u $d/expected.out - || { echo "interpreter output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts --engine quickjs 2>/dev/null | diff -u $d/expected.out - || { echo "QuickJS output differs"; fail=1; }
if timeout 300 "$ZINC" build $d/main.ts -o "$tmp/a" >/dev/null 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/a" 2>/dev/null | diff -u $d/expected.out - || { echo "AOT output differs"; fail=1; }
else echo "zinc build failed"; fail=1; fi
for e in --interp "--engine quickjs" --native; do
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=0 timeout 120 "$ZINC" run $e $d/clock.ts 2>/dev/null | grep '^clock')
  [ "$out" = "clock ok" ] || { echo "clock() $e: $out"; fail=1; }
done
exit $fail
