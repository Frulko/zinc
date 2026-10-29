#!/bin/sh
# zinc:net fetch's RequestInit.bodyBytes sent byte for byte (tests/golden/host/net_body_bytes.ts): a server on the interpreter writes the
# body it gets; the interpreter, QuickJS and the compiled program each post eight bytes, three of them 0x80 and above. Port 18844.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
export NET_BYTES_DIR=$tmp
want='200 82,0,0,255,128,7,0,200'
NET_BYTES_SERVE=1 timeout 120 "$ZINC" run --interp tests/golden/host/net_body_bytes.ts >"$tmp/server" 2>&1 &
pid=$!
"$ZINC" build tests/golden/host/net_body_bytes.ts -o "$tmp/app" >"$tmp/log" 2>&1 || { echo "the program does not build: $(tail -c 300 "$tmp/log")"; exit 1; }
for i in $(seq 1 100); do curl -s -o /dev/null http://127.0.0.1:18844/ && break; sleep 0.2; done
fail=0
check() { out=$("$@" 2>/dev/null | tail -1); [ "$out" = "$want" ] || { echo "$1 $2 $3: $out, want $want"; fail=1; }; }
check timeout 30 "$ZINC" run --interp tests/golden/host/net_body_bytes.ts
check timeout 30 "$ZINC" run tests/golden/host/net_body_bytes.ts --engine quickjs
check timeout 30 "$tmp/app"
kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
exit $fail
