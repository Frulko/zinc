#!/bin/sh
# zinc:worker (D181): messages both ways on the record wire, a moved u8[], a worker's error to onerror, terminate; a worker that draws is refused.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for i in 1 2; do   # twice: the deterministic wait gives the same order on every run
  ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp tests/data/worker_basic/main.ts 2>/dev/null | diff -u tests/data/worker_basic/expected.out - || { echo "worker_basic output differs (run $i)"; fail=1; }
done
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp tests/data/worker_draw/main.ts 2>&1 | grep -q "a worker cannot draw" || { echo "a worker importing zinc:gfx is not refused"; fail=1; }
exit $fail
