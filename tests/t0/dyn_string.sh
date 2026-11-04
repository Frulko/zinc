#!/bin/sh
# String() of a dynamic value (any, unknown: a field of JSON.parse) converts as JavaScript does, on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/dyn_string.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/dyn_string.out - || { echo "dyn_string: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/dyn_string.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/dyn_string.out - || { echo "dyn_string: QuickJS differs"; fail=1; }
exit $fail
