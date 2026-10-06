#!/bin/sh
# Differential check against the oracle (tools/oracle, needs Node): every program our checker accepts must be accepted by
# the oracle. A program we reject and the oracle accepts is allowed (machine numeric kinds, boolean conditions): counted.
cd "$(dirname "$0")/../.." || exit 2
violations=0; agree=0; stricter=0; total=0
for f in tests/golden/checker/ok/*.ts tests/golden/run/*.ts tests/golden/checker/errors/*.ts ../tests/bench/kernels/fib.ts ../tests/bench/kernels/mandelbrot.ts ../tests/bench/kernels/nbody.ts ../tests/bench/kernels/spectralnorm.ts ../tests/bench/kernels/strings.ts ../tests/bench/kernels/mapset.ts ../tests/bench/kernels/sort.ts; do
  total=$((total + 1))
  if "$ZINC" check --check "$f" >/dev/null 2>&1; then ours=0; else ours=1; fi
  if tools/oracle "$f" >/dev/null 2>&1; then theirs=0; else theirs=1; fi
  if [ $ours = 0 ] && [ $theirs = 1 ]; then echo "VIOLATION: we accept, oracle rejects: $f"; violations=$((violations + 1))
  elif [ $ours = $theirs ]; then agree=$((agree + 1)); else stricter=$((stricter + 1)); fi
done
echo "oracle diff: $total files, $agree agree, $stricter stricter than the oracle, $violations violations"
[ $violations -eq 0 ] && [ $total -ge 30 ]
