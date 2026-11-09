#!/bin/sh
# zinc:net serve(..., { hostname: '127.0.0.1' }) (tests/golden/host/net_hostname.ts): the server answers on 127.0.0.1 and refuses a connection to this
# machine's network address (when it has one); an address that is not an IP is refused with the reason. The interpreter and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "no python3"; exit 77; }
tmp=$(mktemp -d)
trap 'kill $srv 2>/dev/null; rm -rf "$tmp"' EXIT
for engine in interp quickjs; do
  if [ $engine = quickjs ]; then timeout 30 "$ZINC" run tests/golden/host/net_hostname.ts --engine quickjs > "$tmp/srv" 2>&1 &
  else timeout 30 "$ZINC" run tests/golden/host/net_hostname.ts > "$tmp/srv" 2>&1 & fi
  srv=$!
  for _ in $(seq 100); do grep -q '^ready' "$tmp/srv" 2>/dev/null && break; sleep 0.1; done
  port=$(sed -n 's/^ready //p' "$tmp/srv")
  [ -n "$port" ] || { echo "$engine: the server did not start: $(head -5 "$tmp/srv")"; exit 1; }
  grep -q '^bad hostname: net.serve: cannot listen on nope: not an IP address' "$tmp/srv" || { echo "$engine: no reason for a bad hostname: $(head -5 "$tmp/srv")"; exit 1; }
  out=$(timeout 20 python3 -I - "$port" <<'EOF'
import socket, sys, urllib.request
port = int(sys.argv[1])
lan = None
try:
    u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); u.connect(("192.0.2.1", 9)); lan = u.getsockname()[0]; u.close()   # no packet sent
except OSError: pass
if lan and not lan.startswith("127."):
    try: socket.create_connection((lan, port), 1).close(); print("reachable from %s" % lan)
    except OSError: pass
print(urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=5).read().decode())
EOF
)
  kill $srv 2>/dev/null; wait $srv 2>/dev/null
  [ "$out" = "loopback 127.0.0.1" ] || { echo "$engine: $out"; exit 1; }
done
exit 0
