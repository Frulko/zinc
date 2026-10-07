#!/bin/sh
# zinc:socket and zinc:devtools on the libuv loop (ZN-088): TCP, Unix, UDP, DNS and WebSocket on loopback, the wire format of RFC 6455 (ping, fragments, close codes),
# and a scripted DevTools client against the inspector.
cd "$(dirname "$0")/../.." || exit 2
timeout 60 "$ZINC" run tests/golden/host/socket.ts 2>&1 | diff -q - tests/golden/host/socket.out >/dev/null || { echo "zinc:socket loopback output differs"; exit 1; }
timeout 30 "$ZINC" run tests/golden/host/websocket_raw.ts 2>&1 | diff -q - tests/golden/host/websocket_raw.out >/dev/null || { echo "WebSocket wire test differs"; exit 1; }
ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run tests/golden/host/devtools.tsx 2>&1 | diff -q - tests/golden/host/devtools.out >/dev/null || { echo "zinc:devtools scripted client differs"; exit 1; }
