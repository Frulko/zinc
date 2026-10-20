#!/bin/sh
# The network log (ZN-370): a program doing fetch (plain, redirected, refused, over TLS), a WebSocket and an MQTT publish shows them in the inspector's Network
# domain with bodies, frames and timings (scripted DevTools client: tests/netlog_check.py), `zinc run --har` writes the same requests as a HAR 1.2 file, and
# headers that carry credentials are masked in both, and so are the query parameters, JSON fields and form fields named in ZINC_NET_SENSITIVE (ZN-635). Every port is a free one (the inspector's through ZINC_DEVTOOLS_PORT, ZN-633), so the test runs beside
# any other. Skips (77) without python3; TLS needs openssl 3.4+ as tests/t0/tls.sh.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'kill $servers $broker $app 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 5); http=$1; https=$2; mqtt=$3; quit=$4; inspector=$5; tls=0
if command -v openssl >/dev/null 2>&1; then   # a CA and a certificate for localhost, as tests/t0/tls.sh makes them
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/ca.key" -out "$tmp/ca.pem" -days 2 -subj "/CN=ca" >/dev/null 2>&1
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$tmp/good.key" -out "$tmp/good.csr" -subj "/CN=good" >/dev/null 2>&1
  printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n' > "$tmp/good.ext"
  openssl x509 -req -in "$tmp/good.csr" -CA "$tmp/ca.pem" -CAkey "$tmp/ca.key" -CAcreateserial -out "$tmp/good.pem" -extfile "$tmp/good.ext" -days 2 >/dev/null 2>&1 && tls=1
fi
if [ $tls = 1 ]; then python3 tests/netlog_servers.py $http $https "$tmp/good.pem" "$tmp/good.key" & servers=$!; else https=0; python3 tests/netlog_servers.py $http & servers=$!; fi
python3 tests/mqtt_broker.py $mqtt >/dev/null 2>&1 & broker=$!
sleep 1
ZINC_NET_SENSITIVE=pin,API_KEY ZINC_DEVTOOLS_PORT=$inspector ZINC_CA_FILE="$tmp/ca.pem" ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run --har "$tmp/out.har" tests/golden/host/netlog.tsx -- $http $https $mqtt $quit > "$tmp/app.log" 2>&1 &
app=$!
n=0; while [ $n -lt $((200 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/app.log"; do sleep 0.05; n=$((n+1)); done   # the inspector listens (stderr, not buffered)
python3 tests/netlog_check.py $quit "$tmp/out.har" $tls $inspector > "$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; echo "the program:"; cat "$tmp/app.log"; exit 1; }
wait $app
[ -n "$NETLOG_KEEP" ] && { cp "$tmp/out.har" "$NETLOG_KEEP"; cat "$tmp/check.log"; }   # for a look at the file and the checker's lines
if [ -n "$NETLOG_CHROME" ]; then tools/har-chrome "$tmp/out.har" || exit 1; fi   # the importer of the installed Chrome reads the file (3 s of headless Chrome)
exit 0
