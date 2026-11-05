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
# Date.now is the real time, however long the program took to start: the kernel's date for a file just written says it
cat > "$tmp/w.ts" <<'TS'
import * as fs from 'zinc:fs';
let waste = 0;
for (let i: i32 = 0; i < 30000000; i++) waste += i;
fs.writeText(`${sys_dir()}/stamp`, `${waste}`);
function sys_dir(): string { return fs.tmpdir(); }
const off = Date.now() - fs.stat(`${fs.tmpdir()}/stamp`).mtimeMs;
console.log(Math.abs(off) < 20 ? 'near' : `off by ${off} ms`);
TS
out=$(env -u ZINC_DETERMINISTIC TMPDIR="$tmp" "$ZINC" run "$tmp/w.ts" 2>&1)
[ "$out" = near ] || { echo "Date.now is not the real time: $out"; exit 1; }
out=$(env -u ZINC_DETERMINISTIC TMPDIR="$tmp" "$ZINC" run "$tmp/w.ts" --engine quickjs 2>/dev/null)
[ "$out" = near ] || { echo "QuickJS Date.now is not the real time: $out"; exit 1; }
# QuickJS: Date.now is the epoch by default too (it was the virtual clock from 0 whatever the mode), and 0-based under ZINC_DETERMINISTIC
echo 'console.log(Date.now() > 1.6e12, Math.abs(Date.now() - new Date().getTime()) < 5000)' > "$tmp/q.ts"
out=$(env -u ZINC_DETERMINISTIC "$ZINC" run "$tmp/q.ts" --engine quickjs 2>/dev/null)
[ "$out" = "true true" ] || { echo "QuickJS real clock: $out"; exit 1; }
out=$(ZINC_DETERMINISTIC=1 "$ZINC" run "$tmp/q.ts" --engine quickjs 2>/dev/null)
[ "$out" = "false false" ] || { echo "QuickJS virtual clock: $out"; exit 1; }
