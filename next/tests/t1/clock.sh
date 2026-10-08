#!/bin/sh
# The virtual clock (ZN-293): a program sleeping 10 s three times prints its lines in under 200 ms of wall time under --clock virtual, the same lines on the interpreter and on QuickJS;
# --clock real waits for real.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/clock; t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
"$ZINC" --emit=zbc-bin $d/sleep.ts "$t/sleep.zbc" || { echo "no zbc"; exit 1; }
now() { python3 -c 'import time; print(int(time.time()*1000))'; }
a=$(now); out=$("$ZINC" run "$t/sleep.zbc" --clock virtual 2>&1); b=$(now)
[ "$out" = "$(cat $d/sleep.out)" ] || { echo "virtual clock output differs: $out"; exit 1; }
[ $((b - a)) -lt 200 ] || { echo "virtual clock run took $((b - a)) ms (limit 200)"; exit 1; }
[ "$("$ZINC" run $d/sleep.ts --engine quickjs 2>&1)" = "$(cat $d/sleep.out)" ] || { echo "quickjs timestamps differ"; exit 1; }
a=$(now); "$ZINC" run $d/short.ts --clock real >/dev/null 2>&1; b=$(now)
[ $((b - a)) -ge 300 ] || { echo "--clock real did not wait ($((b - a)) ms)"; exit 1; }
[ "$("$ZINC" run $d/short.ts --clock real 2>&1 | tail -1)" = "waited true" ] || { echo "--clock real output differs"; exit 1; }
echo "clock: ok"
