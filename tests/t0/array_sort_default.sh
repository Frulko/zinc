#!/bin/sh
# sort() without a comparator orders by the elements' text, as JavaScript does, on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/array_sort_default.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/array_sort_default.out - || { echo "array_sort_default: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/array_sort_default.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/array_sort_default.out - || { echo "array_sort_default: QuickJS differs"; fail=1; }
exit $fail
