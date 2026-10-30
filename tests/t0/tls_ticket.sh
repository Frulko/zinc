#!/bin/sh
# TLS 1.3 session tickets cut by the network with the server's reply behind them: the client hands the reply out at once (build/tls_ticket_test,
# both ends in memory, every cut of the server's flight). A stall here is a connection that waits forever (gateway.discord.gg, ZN-866).
# Skips (77) without openssl.
cd "$(dirname "$0")/../.." || exit 2
command -v openssl >/dev/null 2>&1 || exit 77
bin=$(dirname "$ZINC")/tls_ticket_test
[ -x "$bin" ] || { echo "$bin is missing (tools/build tls_ticket_test)"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/ca.key" -out "$tmp/ca.pem" -days 2 -subj "/CN=ca" >/dev/null 2>&1
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/srv.key" -out "$tmp/srv.csr" -subj "/CN=localhost" >/dev/null 2>&1
printf 'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\n' > "$tmp/srv.ext"
openssl x509 -req -in "$tmp/srv.csr" -CA "$tmp/ca.pem" -CAkey "$tmp/ca.key" -CAcreateserial -out "$tmp/srv.pem" -extfile "$tmp/srv.ext" -days 2 >/dev/null 2>&1 || exit 77
ZINC_CA_FILE="$tmp/ca.pem" timeout 60 "$bin" "$tmp/srv.pem" "$tmp/srv.key"
