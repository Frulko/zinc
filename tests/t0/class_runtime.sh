#!/bin/sh
# o.constructor.name and the `any` view of an object of a subclass (its own fields) give what JavaScript gives, on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/class_runtime.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/class_runtime.out - || { echo "class_runtime: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/class_runtime.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/class_runtime.out - || { echo "class_runtime: QuickJS differs"; fail=1; }
exit $fail
