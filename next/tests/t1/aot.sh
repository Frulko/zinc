#!/bin/sh
# AOT (ZN-022): fib, nbody, binarytrees and sort build to native programs whose output is the frozen one, and the programs of
# tests/golden/run behave the same compiled as interpreted (output and exit code).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for k in fib nbody binarytrees sort; do
  "$ZINC" build ../tests/bench/kernels/$k.ts -o "$tmp/$k" 2>"$tmp/err" || { echo "aot build failed: $k: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  "$tmp/$k" 2>&1 | diff -q - corpus/bench/$k.out >/dev/null || { echo "aot output differs: $k"; fail=1; }
done
for f in tests/golden/run/library.ts tests/golden/run/exceptions.ts tests/golden/run/async.ts tests/golden/run/dyn_values.ts tests/golden/run/records.ts; do
  k=$(basename "$f" .ts)
  "$ZINC" build "$f" -o "$tmp/$k" 2>"$tmp/err" || { echo "aot build failed: $k: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  "$tmp/$k" 2>&1 | diff -q - "tests/golden/run/$k.out" >/dev/null || { echo "aot output differs: $k"; fail=1; }
done
exit $fail
