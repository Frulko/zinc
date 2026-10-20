#!/bin/sh
# zinc:osc/full, the OSC plugin written in Zinc on zinc:socket (ZN-716). tests/data/osc/loopback.ts on two loopback endpoints with ports the system
# gives: every type sent is received equal (the edges of int, float and double, strings and blobs of every padding, time tags), a bundle with a
# bundle in it arrives with its tags, patterns select handlers on either side, the bytes on the wire are those of the specification's example and of
# Python's struct, truncated, oversized and deeply nested datagrams give nothing; the same output interpreted and compiled. Then examples/osc: a
# message it sends itself moves the shape. (zinc:socket does not load on QuickJS yet, so this plugin does not either.)
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/data/osc
timeout 30 "$ZINC" run $d/loopback.ts >"$tmp/i.out" 2>&1
diff "$tmp/i.out" $d/loopback.out >"$tmp/d" || { echo "osc_full: loopback.ts interpreted: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
"$ZINC" build $d/loopback.ts -o "$tmp/loopback" >"$tmp/b.log" 2>&1 || { echo "osc_full: loopback.ts does not build: $(tail -c 300 "$tmp/b.log")"; fail=1; }
timeout 30 "$tmp/loopback" 2>&1 | diff - $d/loopback.out >"$tmp/d" || { echo "osc_full: loopback.ts compiled: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
out=$(OSC_PORT=0 OSC_DEMO=1 ZINC_HEADLESS=1 ZINC_FRAMES=20 timeout 30 "$ZINC" run examples/osc 2>&1)
echo "$out" | grep -q "^osc: first message /shape/xy, the shape is at 0\.8[0-9] 0\.5[0-9]$" || { echo "osc_full: examples/osc did not move its shape: $(echo "$out" | head -3)"; fail=1; }
exit $fail
