#!/bin/sh
# A native module's u8[] is the program's array on QuickJS too (ZN-1008): tests/golden/host/qjs_bytes.ts (RTP header bytes mapped to hex,
# pushed, concatenated, printed as JSON; a 70 KB result; a 60 KB and a 6 MB WebSocket message between zinc:socket and zinc:net) prints the
# same on the interpreter, QuickJS and AOT; tests/golden/host/qjs_websocket.js (a plain JavaScript program: URL and the browser's WebSocket
# as globals) on QuickJS. Ports 18992 to 18995.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1
fail=0
want='8078123401020304deadbeef
15 [128,120,18,52]
70032 70032 70033
message 60000
message 6291456'
keep() { grep -v -e '^  ' -e '^zinc' ; }
out=$(timeout 120 "$ZINC" run --interp tests/golden/host/qjs_bytes.ts -- 18992 2>&1 | keep)
[ "$out" = "$want" ] || { echo "qjs_bytes (interp): $out"; fail=1; }
out=$(timeout 120 "$ZINC" run --engine quickjs tests/golden/host/qjs_bytes.ts -- 18993 2>&1 | keep)
[ "$out" = "$want" ] || { echo "qjs_bytes (quickjs): $out"; fail=1; }
if timeout 600 "$ZINC" build tests/golden/host/qjs_bytes.ts -o "$tmp/app" >"$tmp/build" 2>&1; then
  out=$(timeout 120 "$tmp/app" 18994 2>&1 | keep)
  [ "$out" = "$want" ] || { echo "qjs_bytes (aot): $out"; fail=1; }
else echo "qjs_bytes: zinc build failed: $(tail -3 "$tmp/build" | tr '\n' ' ')"; fail=1; fi
want='file:///app/src/w.js https://e.com/a/x?q=1#h
open true
echo hi
binary true 0,128,255
close 1000'
out=$(timeout 60 "$ZINC" run --engine quickjs tests/golden/host/qjs_websocket.js -- 18995 2>&1 | keep)
[ "$out" = "$want" ] || { echo "qjs_websocket.js (quickjs): $out"; fail=1; }
[ $fail = 0 ] && echo "qjs_bytes: ok"
exit $fail
