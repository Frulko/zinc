#!/bin/sh
# zinc:worker numeric arrays (u32[], i32[], f32[], f64[]): a dense wire block, a copy, and a transfer list of any numeric array that empties the sender's;
# the same output on the interpreter, QuickJS and the compiled build (AOT).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/data/worker_typed
fail=0
for e in "--interp" "--engine quickjs"; do
  ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts $e 2>/dev/null | diff -u $d/expected.out - || { echo "worker_typed ($e) differs"; fail=1; }
done
timeout 300 "$ZINC" build $d/main.ts -o "$t/app" >/dev/null 2>&1 || { echo "worker_typed: build failed"; exit 1; }
ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$t/app" 2>/dev/null | diff -u $d/expected.out - || { echo "worker_typed (aot) differs"; fail=1; }
[ $fail = 0 ] && echo "worker_typed: ok"
exit $fail
