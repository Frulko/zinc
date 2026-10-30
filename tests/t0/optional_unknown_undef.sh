#!/bin/sh
# undefined given to an optional unknown (object literal property, ternary, argument, Request init.body) is undefined, on the interpreter, AOT and QuickJS (ZN-877).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/optional_unknown_undef.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/optional_unknown_undef.out - || { echo "optional_unknown_undef: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/optional_unknown_undef.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/optional_unknown_undef.out - || { echo "optional_unknown_undef: QuickJS differs"; fail=1; }
exit $fail
