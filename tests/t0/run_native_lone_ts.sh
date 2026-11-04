#!/bin/sh
# `zinc run --native` of a program that does not draw is compiled (AOT), not interpreted: the executable lands in the run cache and the
# output is the program's; stderr stays empty on a redirected run (the "compiling for this machine" line is for terminals).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cat > "$t/lone.ts" <<'E'
let s = 0;
for (let i = 0; i < 1000; i++) s += i;
console.log('sum ' + s);
E
ZINC_HOME="$t/home" ZINC_HEADLESS=1 "$ZINC" run --native "$t/lone.ts" > "$t/out" 2> "$t/err"
[ "$(cat "$t/out")" = "sum 499500" ] || { echo "run_native_lone_ts: output: $(cat "$t/out") $(cat "$t/err")"; exit 1; }
[ -s "$t/err" ] && { echo "run_native_lone_ts: stderr is not empty: $(cat "$t/err")"; exit 1; }
ls "$t"/home/cache/run/*/app >/dev/null 2>&1 || { echo "run_native_lone_ts: --native did not compile the program (no cached executable)"; exit 1; }
ZINC_HOME="$t/home" ZINC_HEADLESS=1 ZINC_STEPS=1 "$ZINC" run --native "$t/lone.ts" 2>&1 | grep -q 'native, cached build' || { echo "run_native_lone_ts: the second run does not use the cached executable"; exit 1; }
echo "run_native_lone_ts: ok"
