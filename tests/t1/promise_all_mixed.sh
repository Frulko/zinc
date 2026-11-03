#!/bin/sh
# const [a, b] = await Promise.all([pa, pb]) with promises of different types, as in TypeScript: the three engines, a rejection caught.
cd "$(dirname "$0")/../.." || exit 2
want='1 1 true
x 1
xx
x 1
x 1
lambda 1
x!,x!
caught boom
caught late'
fail=0
for mode in --interp --native "--engine quickjs"; do
  got=$(ZINC_HEADLESS=1 "$ZINC" run tests/data/promise_all_mixed.ts $mode 2>&1)
  [ "$got" = "$want" ] || { echo "promise_all_mixed $mode: $got"; fail=1; }
done
exit $fail
