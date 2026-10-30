#!/bin/sh
# A conditional joining an i32 and a number is a number (tests/golden/host/ternary_int_float.ts), on the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
want='2.5 2.5 2.5 2.5 3'
for e in --interp --native; do
  got=$("$ZINC" run $e tests/golden/host/ternary_int_float.ts 2>&1); [ "$got" = "$want" ] || { echo "ternary_int_float: $e printed $got"; fail=1; }
done
got=$("$ZINC" run tests/golden/host/ternary_int_float.ts --engine quickjs 2>&1); [ "$got" = "$want" ] || { echo "ternary_int_float: QuickJS printed $got"; fail=1; }
exit $fail
