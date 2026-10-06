#!/bin/sh
# VM: the kernels that run (fib, mandelbrot, nbody, spectralnorm, strings, mapset, sort) print the frozen corpus outputs (no Node), every run golden matches (outputs generated once with
# Node by tools/regen-run-goldens), a bytecode file runs like its source, and runtime errors are reported, not crashes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for k in fib mandelbrot nbody spectralnorm strings mapset sort; do
  "$ZINC" run ../tests/bench/kernels/$k.ts 2>&1 | diff -q - corpus/bench/$k.out >/dev/null || { echo "output differs from the frozen corpus: $k"; fail=1; }
done
for f in tests/golden/run/*.ts; do
  "$ZINC" run "$f" 2>&1 | diff -q - "${f%.ts}.out" >/dev/null || { echo "run golden differs: $(basename "$f")"; fail=1; }
done
for f in tests/golden/checker/ok/*.ts; do
  exp=tests/golden/run/ok_$(basename "$f" .ts).out
  [ -e "$exp" ] || continue
  "$ZINC" run "$f" 2>&1 | diff -q - "$exp" >/dev/null || { echo "run golden differs: ok/$(basename "$f")"; fail=1; }
done
"$ZINC" --emit=zbc-bin ../tests/bench/kernels/fib.ts "$tmp/fib.zbc" && "$ZINC" run "$tmp/fib.zbc" | diff -q - corpus/bench/fib.out >/dev/null || { echo "bytecode file output differs"; fail=1; }
for f in tests/golden/run/errors/*.ts; do
  out=$("$ZINC" run "$f" 2>&1); rc=$?
  # an uncaught exception ends the program with code 101 and `panic: Uncaught <Name>: <message>`; other runtime errors with code 1
  case "$(basename "$f")" in uncaught.ts) want=101 ;; *) want=1 ;; esac
  [ $rc -eq $want ] && echo "$out" | grep -q "$(cat "${f%.ts}.expect")" || { echo "runtime error fixture $(basename "$f"): rc=$rc '$out'"; fail=1; }
done
exit $fail
