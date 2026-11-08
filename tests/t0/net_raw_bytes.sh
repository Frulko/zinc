#!/bin/sh
# Request.rawBytes: a POST body with ED A2 85 ED BB AF (two surrogate halves, joined by a string), invalid UTF-8 and a NUL comes through
# byte for byte on the interpreter, QuickJS and the compiled program (tests/golden/host/net_raw_bytes.ts), and so do all 256 byte values. Port 18852.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
printf 'S\355\242\205\355\273\257\004\377\200\355\240\200\300\257\000Z' >"$tmp/in.bin"
want='17:83,237,162,133,237,187,175,4,255,128,237,160,128,192,175,0,90'
LC_ALL=C awk 'BEGIN { for (i = 0; i < 256; i++) printf "%c", i }' >"$tmp/all.bin"
all="256:$(seq 0 255 | paste -sd, -)"
"$ZINC" build tests/golden/host/net_raw_bytes.ts -o "$tmp/app" >"$tmp/log" 2>&1 || { echo "the program does not build: $(tail -c 300 "$tmp/log")"; exit 1; }
fail=0
run() {
  "$@" >"$tmp/server" 2>&1 & pid=$!
  for i in $(seq 1 100); do curl -s -o /dev/null http://127.0.0.1:18852/ && break; sleep 0.2; done
  out=$(curl -s --data-binary @"$tmp/in.bin" http://127.0.0.1:18852/)
  [ "$out" = "$want" ] || { echo "$2 $3: $out, want $want"; fail=1; }
  out=$(curl -s --data-binary @"$tmp/all.bin" http://127.0.0.1:18852/)
  [ "$out" = "$all" ] || { echo "$2 $3: the 256 byte values come back as $out"; fail=1; }
  kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
}
run "$ZINC" run --interp tests/golden/host/net_raw_bytes.ts
run "$ZINC" run tests/golden/host/net_raw_bytes.ts --engine quickjs
run "$tmp/app"
exit $fail
