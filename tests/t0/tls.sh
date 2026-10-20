#!/bin/sh
# https (ZN-089) against a test CA made with openssl: good certificate, wrong name, expired, untrusted CA. Skips (77) without openssl 3.4+ (x509 -not_before).
cd "$(dirname "$0")/../.." || exit 2
command -v openssl >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkca() { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/$1.key" -out "$tmp/$1.pem" -days 2 -subj "/CN=$1" >/dev/null 2>&1; }
mkcert() {   # name san extra-args
  name=$1
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/$1.key" -out "$tmp/$1.csr" -subj "/CN=$1" >/dev/null 2>&1
  printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\n' "$2" > "$tmp/$1.ext"
  shift 2
  openssl x509 -req -in "$tmp/$name.csr" -CA "$tmp/ca.pem" -CAkey "$tmp/ca.key" -CAcreateserial -out "$tmp/$name.pem" -extfile "$tmp/$name.ext" "$@" >/dev/null 2>&1
}
mkca ca; mkca stranger
mkcert good "DNS:localhost,IP:127.0.0.1" -days 2 || exit 77
mkcert other "DNS:other.test" -days 2
mkcert old "DNS:localhost,IP:127.0.0.1" -not_before 20200101000000Z -not_after 20200102000000Z || exit 77
run() { ZINC_CA_FILE="$tmp/$1.pem" timeout 30 "$ZINC" run tests/golden/host/tls.ts -- "$tmp" "$2" 2>&1; }
{ run ca good; run ca other; run ca old; run stranger good; } > "$tmp/out"
diff -u tests/golden/host/tls.out "$tmp/out" || { echo "https output differs"; exit 1; }

# MQTT over TLS against the python broker (skips when python3 is missing)
if command -v python3 >/dev/null 2>&1; then
  python3 tests/mqtt_broker.py 18832 "$tmp/good.pem" "$tmp/good.key" >/dev/null 2>&1 & bpid=$!
  sleep 1
  out=$(ZINC_CA_FILE="$tmp/ca.pem" timeout 30 "$ZINC" run tests/golden/host/mqtt_tls.ts -- 18832 2>&1)
  kill "$bpid" 2>/dev/null; wait "$bpid" 2>/dev/null
  [ "$out" = "[ 'secure/a=hello over tls' ]" ] || { echo "mqtt over TLS: $out"; exit 1; }
fi

# wss:// in zinc:socket against a node echo server over TLS 1.2 and 1.3 (1.3 sends its session tickets close to the first reply, ZN-762): the test CA
# trusted, then a CA the client does not trust (skips without node)
if command -v node >/dev/null 2>&1; then
  for v in TLSv1.2 TLSv1.3; do
    port=$(python3 tests/free_ports.py 2>/dev/null || echo 18853)
    node tests/wss_echo.mjs "$port" "$tmp/good.pem" "$tmp/good.key" "$v" > "$tmp/wss.log" 2>&1 & wpid=$!
    for _ in $(seq 30); do grep -q ready "$tmp/wss.log" 2>/dev/null && break; sleep 0.3; done
    { ZINC_CA_FILE="$tmp/ca.pem" timeout 30 "$ZINC" run tests/golden/host/wss.ts -- "$port" 2>&1
      ZINC_CA_FILE="$tmp/stranger.pem" timeout 30 "$ZINC" run tests/golden/host/wss.ts -- "$port" 2>&1; } | sed "s/:$port/:PORT/g" > "$tmp/wss.out"
    kill "$wpid" 2>/dev/null; wait "$wpid" 2>/dev/null
    sed "s/VERSION/$v/" tests/golden/host/wss.out | diff -u - "$tmp/wss.out" || { echo "wss over $v differs"; exit 1; }
    port=$(python3 tests/free_ports.py 2>/dev/null || echo 18854)
    node tests/wss_echo.mjs "$port" "$tmp/good.pem" "$tmp/good.key" "$v" first > "$tmp/first.log" 2>&1 & wpid=$!
    for _ in $(seq 30); do grep -q ready "$tmp/first.log" 2>/dev/null && break; sleep 0.3; done
    out=$(ZINC_REALTIME=1 ZINC_CA_FILE="$tmp/ca.pem" timeout 10 "$ZINC" run tests/golden/host/tls_first.ts -- "$port" 2>&1)
    kill "$wpid" 2>/dev/null; wait "$wpid" 2>/dev/null
    [ "$out" = "got server first over $v" ] || { echo "server-first line over $v: $out"; exit 1; }
  done
fi
