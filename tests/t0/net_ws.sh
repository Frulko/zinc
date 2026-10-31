#!/bin/sh
# The WebSocket server of zinc:net (ZN-893): handshake, text, binary, fragments, ping/pong, the close handshake both ways, 1009 above
# maxPayloadBytes, back-pressure with drain, the idle ping and close, a refused upgrade, plain HTTP on the same port. The interpreter,
# QuickJS and AOT; the client's lines and the server's handlers' lines are both compared.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "no python3"; exit 77; }
tmp=$(mktemp -d)
trap 'kill $srv 2>/dev/null; rm -rf "$tmp"' EXIT
"$ZINC" build tests/golden/host/net_ws.ts -o "$tmp/aot" >"$tmp/build.log" 2>&1 || { echo "AOT build failed: $(tail -3 "$tmp/build.log")"; exit 1; }
port=18980
for engine in interp quickjs aot; do
  port=$((port + 1))
  case $engine in
    interp) "$ZINC" run tests/golden/host/net_ws.ts -- $port > "$tmp/srv" 2>&1 & ;;
    quickjs) "$ZINC" run tests/golden/host/net_ws.ts --engine quickjs -- $port > "$tmp/srv" 2>&1 & ;;
    aot) "$tmp/aot" $port > "$tmp/srv" 2>&1 & ;;
  esac
  srv=$!
  for _ in $(seq 50); do grep -q ready "$tmp/srv" 2>/dev/null && break; sleep 0.1; done
  timeout 60 python3 tests/t0/net_ws.py $port > "$tmp/out" 2>&1
  for _ in $(seq 20); do kill -0 $srv 2>/dev/null || break; sleep 0.1; done   # GET /quit stops it
  kill $srv 2>/dev/null; wait $srv 2>/dev/null
  diff "$tmp/out" tests/golden/host/net_ws.out > "$tmp/diff" || { echo "zinc:net WebSocket client side on $engine differs from tests/golden/host/net_ws.out:"; head -20 "$tmp/diff"; exit 1; }
  diff "$tmp/srv" tests/golden/host/net_ws.server.out > "$tmp/diff" || { echo "zinc:net WebSocket handlers on $engine differ from tests/golden/host/net_ws.server.out:"; head -20 "$tmp/diff"; exit 1; }
done
