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
