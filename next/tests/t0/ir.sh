#!/bin/sh
# IR: the 3 kernels lower to the golden dumps (verified before dumping), every checker ok/ program lowers and verifies
# (default parameters and closures are reported as unsupported until their tasks), and the verifier unit test passes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for k in fib mandelbrot nbody; do
  "$ZINC" --emit=ir ../tests/bench/kernels/$k.ts 2>&1 | diff -q - tests/golden/ir/$k.ir >/dev/null || { echo "ir golden differs: $k"; fail=1; }
done
for k in inherit interfaces devirt statics param_props abstract many_props generics; do
  "$ZINC" --emit=ir tests/golden/run/$k.ts 2>&1 | diff -q - tests/golden/ir/$k.ir >/dev/null || { echo "ir golden differs: $k"; fail=1; }
done
for f in tests/golden/checker/ok/*.ts; do
  case $(basename "$f") in default_params.ts|nested.ts) "$ZINC" --emit=ir "$f" >/dev/null 2>&1 && { echo "expected unsupported: $f"; fail=1; }; continue ;; esac
  "$ZINC" --emit=ir "$f" >/dev/null 2>/tmp/zn-ir-err.$$ || { echo "lowering failed: $f"; head -2 /tmp/zn-ir-err.$$; fail=1; }
done
rm -f /tmp/zn-ir-err.$$
"$(dirname "$ZINC")/ir_test" || fail=1
exit $fail
