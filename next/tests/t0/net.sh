#!/bin/sh
# zinc:net (ZN-057): fetch over curl against a local HTTP server: a 200 with its body, a 404, and a refused connection (status 0).
cd "$(dirname "$0")/../.." || exit 2
command -v curl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1 || { echo "needs curl and python3"; exit 77; }
tmp=$(mktemp -d); trap 'kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
echo "hello net" > "$tmp/a.txt"
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
(cd "$tmp" && exec python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1) &
pid=$!
i=0; until curl -s -o /dev/null "http://127.0.0.1:$port/a.txt"; do i=$((i + 1)); [ $i -gt 50 ] && { echo "the test server did not start"; exit 1; }; sleep 0.1; done
"$ZINC" run tests/golden/host/net.ts -- "http://127.0.0.1:$port" 2>&1 | diff - tests/golden/host/net.out >/dev/null || { echo "zinc:net output differs from tests/golden/host/net.out"; exit 1; }
