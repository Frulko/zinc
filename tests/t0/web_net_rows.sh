#!/bin/sh
# zinc:net's fetch on the web (targets/web/rows-net.js, ZN-1065): a program that only fetches gets the fetch rows in its page and no W0603 (the servers' rows stay out
# of its bundle), the map plugin (index.ts fetches tiles with zinc:net) exports with nothing to warn about, and a program that serves still gets its W0603.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/fetch" "$tmp/serve"
echo '{"name":"netfetch","entry":"main.ts"}' > "$tmp/fetch/zinc.json"
cat > "$tmp/fetch/main.ts" <<'EOF'
import { fetch } from 'zinc:net';
fetch('./index.html').then((r) => r.text()).then((t) => console.log(t.length));
EOF
echo '{"name":"netserve","entry":"main.ts"}' > "$tmp/serve/zinc.json"
cat > "$tmp/serve/main.ts" <<'EOF'
import { serve } from 'zinc:net';
serve(8080, (req) => ({ status: 200, body: 'hi', contentType: 'text/plain' }));
EOF
out=$("$Z" export "$tmp/fetch" --target web -o "$tmp/out" 2>&1) || { echo "web_net_rows: export failed: $out"; exit 1; }
echo "$out" | grep -q W0603 && { echo "web_net_rows: a fetch-only program warns: $out"; fail=1; }
grep -q 'httpFetchFile' "$tmp"/out/native.*.js || { echo "web_net_rows: rows-net.js is not in native.js"; fail=1; }
grep -q '"unsupported":\[[^]]*http' "$tmp/out/index.html" && { echo "web_net_rows: http rows left unsupported: $(grep -o '"unsupported":\[[^]]*\]' "$tmp/out/index.html")"; fail=1; }
out=$("$Z" export examples/maps/explorer --target web --check 2>&1)
echo "$out" | grep -q W0603 && { echo "web_net_rows: zinc:map warns: $out"; fail=1; }
out=$("$Z" export "$tmp/serve" --target web --check 2>&1)
echo "$out" | grep -q "W0603.*raw sockets" || { echo "web_net_rows: a server program does not warn: $out"; fail=1; }
exit $fail
