#!/bin/sh
# The clock (ZN-083): a program that measures a 50 ms timer sees about 50 ms of real time by default (Date.now is the epoch, performance.now starts at 0, the
# timer really waits) and exactly 50 ms of virtual time under ZINC_DETERMINISTIC (Date.now starts at 0, nothing sleeps).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/c.ts" <<'TS'
const d0 = Date.now()
const p0 = performance.now()
setTimeout(() => {
  console.log(Date.now() - d0, Math.round(performance.now() - p0), d0 > 1.6e12, p0 < 1000, performance.timeOrigin > 1.6e12)
}, 50)
TS
start=$(python3 -c 'import time; print(int(time.time()*1000))')
out=$(env -u ZINC_DETERMINISTIC "$ZINC" run "$tmp/c.ts" 2>&1)
end=$(python3 -c 'import time; print(int(time.time()*1000))')
dt=$(echo "$out" | awk '{print $1}')
[ "$dt" -ge 49 ] && [ "$dt" -lt 200 ] && echo "$out" | grep -q "true true true" || { echo "real clock: $out"; exit 1; }
[ $((end - start)) -ge 49 ] || { echo "the timer did not really wait: $((end - start)) ms"; exit 1; }
out=$(ZINC_DETERMINISTIC=1 "$ZINC" run "$tmp/c.ts" 2>&1)
[ "$out" = "50 50 false true false" ] || { echo "virtual clock: $out"; exit 1; }
