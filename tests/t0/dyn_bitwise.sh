#!/bin/sh
# Bitwise operators on any (& | ^ << >> >>>, &= ...) convert their operands to numbers, on the interpreter, AOT and QuickJS: the checker refused them (Z0005).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/dyn_bitwise.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/dyn_bitwise.out - || { echo "dyn_bitwise: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/dyn_bitwise.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/dyn_bitwise.out - || { echo "dyn_bitwise: QuickJS differs"; fail=1; }
exit $fail
