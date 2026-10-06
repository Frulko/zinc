#!/bin/sh
# Parser: fib, mandelbrot and nbody parse with a consistent tree and match golden dumps; each error fixture reports
# its expected Z-code and position (tests/golden/parser/errors/<name>.ts + <name>.expect).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for k in fib mandelbrot nbody; do
  src=../tests/bench/kernels/$k.ts
  "$ZINC" parse --check "$src" || fail=1
  "$ZINC" parse --dump "$src" | diff -q - tests/golden/parser/$k.ast >/dev/null || { echo "golden differs: $k"; fail=1; }
done
for k in param_props interfaces abstract statics generics tuples unions closures closures2; do
  "$ZINC" parse --check tests/golden/run/$k.ts || fail=1
  "$ZINC" parse --dump tests/golden/run/$k.ts | diff -q - tests/golden/parser/$k.ast >/dev/null || { echo "golden differs: $k"; fail=1; }
done
for f in tests/golden/parser/errors/*.ts; do
  got=$("$ZINC" parse --check "$f" 2>&1 | sed -E 's/^[^:]*:([0-9]+:[0-9]+): error (Z[0-9]+):.*/\2 \1/')
  [ "$got" = "$(cat "${f%.ts}.expect")" ] || { echo "error fixture $(basename "$f"): got '$got'"; fail=1; }
done
exit $fail
