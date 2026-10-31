#!/bin/sh
# Checker: the 3 kernels and every ok/ program are accepted (and the kernels' types match goldens); every errors/ fixture
# reports exactly the diagnostics listed in its .expect (one `Zxxxx line:col` per line).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for k in fib mandelbrot nbody; do
  "$ZINC" check --types tests/bench/kernels/$k.ts 2>&1 | diff -q - tests/golden/checker/types/$k.types >/dev/null || { echo "types differ: $k"; fail=1; }
done
for f in tests/golden/checker/ok/*.ts; do
  "$ZINC" check --check "$f" 2>&1 || { echo "rejected valid program: $f"; fail=1; }
done
for f in tests/golden/checker/errors/*.ts; do
  got=$("$ZINC" check --check "$f" 2>&1 | sed -E 's/^[^:]*:([0-9]+:[0-9]+): error (Z[0-9]+):.*/\2 \1/')
  [ "$got" = "$(cat "${f%.ts}.expect")" ] || { echo "fixture $(basename "$f"): got '$got'"; fail=1; }
done
# statements before super(...) (TypeScript 4.6) run in order: the IR (the interpreter and AOT share its lowering) and QuickJS
for e in "" "--engine quickjs"; do
  got=$("$ZINC" run tests/golden/checker/ok/super_after_statements.ts $e 2>&1)
  [ "$got" = "a+3 3" ] || { echo "super_after_statements ${e:-interpreter}: got '$got'"; fail=1; }
done
exit $fail
