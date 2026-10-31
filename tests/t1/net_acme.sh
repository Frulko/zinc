#!/bin/sh
# zinc:net/acme (ZN-893) against a local Pebble, Let's Encrypt's test ACME server: an account, an order for localhost, the http-01 challenge
# answered by zinc:net, the CSR, the certificate; then kept, renewed and swapped into a running https server (openssl checks the served
# certificate is the renewed one). Needs Pebble: PEBBLE=<dir> holding the pebble binary and Pebble's test/certs (pebble.minica.pem,
# localhost/cert.pem, localhost/key.pem), e.g. the v2.10.1 release and its repository's test/certs; skipped without it. Interpreter only:
# the client is Zinc code over zinc:net, which net_ws and net_limits prove on QuickJS and AOT.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$PEBBLE" ] && [ -x "$PEBBLE/pebble" ] || { echo "skipped: PEBBLE (the directory of Pebble and its test certs) is not set"; exit 77; }
command -v openssl >/dev/null && command -v python3 >/dev/null || { echo "skipped: needs openssl and python3"; exit 77; }
tmp=$(mktemp -d); peb=; srv=
trap 'kill $peb $srv 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 4)
acme=$1; mgmt=$2; http01=$3; https=$4
cat > "$tmp/pebble.json" <<EOF
{"pebble": {"listenAddress": "127.0.0.1:$acme", "managementListenAddress": "127.0.0.1:$mgmt",
  "certificate": "$PEBBLE/localhost/cert.pem", "privateKey": "$PEBBLE/localhost/key.pem",
  "httpPort": $http01, "tlsPort": 5001, "ocspResponderURL": "", "externalAccountBindingRequired": false, "keyAlgorithm": "ecdsa"}}
EOF
PEBBLE_VA_NOSLEEP=1 PEBBLE_WFE_NONCEREJECT=0 "$PEBBLE/pebble" -config "$tmp/pebble.json" > "$tmp/pebble.log" 2>&1 &
peb=$!
for _ in $(seq 50); do grep -q "Listening on" "$tmp/pebble.log" && break; sleep 0.1; done
ZINC_CA_FILE="$PEBBLE/pebble.minica.pem" timeout 60 "$ZINC" run tests/golden/host/net_acme.ts -- "https://localhost:$acme/dir" $http01 $https "$tmp/state" > "$tmp/out" 2>&1 &
srv=$!
for _ in $(seq 600); do grep -q "ready\|failed\|error" "$tmp/out" && break; sleep 0.1; done
served=$(openssl s_client -connect 127.0.0.1:$https -servername localhost </dev/null 2>/dev/null | openssl x509 -noout -serial 2>/dev/null)
want=$(openssl x509 -noout -serial -in "$tmp/state/cert.pem" 2>/dev/null)
echo "served renewed $([ -n "$served" ] && [ "$served" = "$want" ] && echo true || echo false)" >> "$tmp/out"
diff "$tmp/out" tests/golden/host/net_acme.out > "$tmp/diff" || { echo "zinc:net/acme differs from tests/golden/host/net_acme.out:"; head -20 "$tmp/diff"; tail -5 "$tmp/pebble.log"; exit 1; }
