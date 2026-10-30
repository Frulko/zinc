#!/bin/sh
# zinc:net (ZN-087): the server and the client of zinc:net talk on loopback inside one program: bodies of 1 MiB, chunked transfer, redirects, limits, errors.
# The interpreter and QuickJS (which waits while the host loop listens). A port another program holds: the error names it and says what to do.
cd "$(dirname "$0")/../.." || exit 2
timeout 60 "$ZINC" run tests/golden/host/net.ts 2>&1 | diff - tests/golden/host/net.out >/dev/null || { echo "zinc:net output differs from tests/golden/host/net.out"; exit 1; }
timeout 60 "$ZINC" run tests/golden/host/net.ts --engine quickjs 2>/dev/null | diff - tests/golden/host/net.out >/dev/null || { echo "zinc:net on QuickJS differs from tests/golden/host/net.out"; exit 1; }
tmp=$(mktemp -d)
python3 -c 'import socket,time; s=socket.socket(); s.bind(("0.0.0.0",0)); s.listen(1); print(s.getsockname()[1], flush=True); time.sleep(30)' > "$tmp/port" &
holder=$!
trap 'kill $holder 2>/dev/null; rm -rf "$tmp"' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$tmp/port" ] && break; sleep 0.2; done
port=$(cat "$tmp/port")
printf "import { serve, Reply } from 'zinc:net';\nserve(%s, (): Reply => ({ status: 200, contentType: 'text/plain', body: '' }));\n" "$port" > "$tmp/busy.ts"
for e in "" "--engine quickjs"; do
  timeout 20 "$ZINC" run "$tmp/busy.ts" $e > "$tmp/out" 2>&1
  grep -q "net.serve: port $port is already in use by another program: stop it, or listen on another port" "$tmp/out" \
    || { echo "zinc:net ($e): a busy port does not say which one and what to do: $(head -3 "$tmp/out")"; exit 1; }
done
