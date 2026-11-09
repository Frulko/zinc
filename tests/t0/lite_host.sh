#!/bin/sh
# A compiled program without network links no TLS (ZN-805): `zinc build` links libzn_host_sys_lite for a program that calls no fetch, server,
# socket, MQTT, zinc:subtle or pack-writing row, so Mbed TLS and llhttp stay out of it; a program that fetches keeps them, and both run.
cd "$(dirname "$0")/../.." || exit 2
[ -f "$(dirname "$ZINC")/libzn_host_sys_lite.a" ] || { echo "skipped: no libzn_host_sys_lite.a beside zinc"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "console.log('now ' + typeof Date.now());\n" > "$tmp/plain.ts"
printf "fetch('http://127.0.0.1:1/').then(() => console.log('fetched')).catch(() => console.log('refused'));\n" > "$tmp/net.ts"
fail=0
for p in plain net; do
  timeout 120 "$ZINC" build "$tmp/$p.ts" -o "$tmp/$p" >"$tmp/$p.log" 2>&1 || { echo "lite_host: build $p failed: $(tail -3 "$tmp/$p.log")"; exit 1; }
done
[ "$(strings "$tmp/plain" | grep -c -i mbedtls)" -eq 0 ] || { echo "lite_host: a program without network links Mbed TLS"; fail=1; }
[ "$(strings "$tmp/net" | grep -c -i mbedtls)" -gt 0 ] || { echo "lite_host: a program that fetches has no Mbed TLS"; fail=1; }
[ "$(timeout 20 "$tmp/plain")" = "now number" ] || { echo "lite_host: the program without network did not run"; fail=1; }
[ "$(timeout 20 "$tmp/net")" = "refused" ] || { echo "lite_host: the program that fetches did not run"; fail=1; }
[ $fail -eq 0 ] && echo "lite_host: ok"
exit $fail
