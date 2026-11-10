#!/bin/sh
# A compiled program without network drops Zinc OSC/DNS callers and TLS (ZN-805/164): `zinc build` links libzn_host_sys_lite for a program that calls no fetch, server,
# socket, OSC, MQTT, zinc:subtle or pack-writing row, so Mbed TLS and llhttp stay out of it; a program that fetches keeps them, and both run.
cd "$(dirname "$0")/../.." || exit 2
[ -f "$(dirname "$ZINC")/libzn_host_sys_lite.a" ] || { echo "skipped: no libzn_host_sys_lite.a beside zinc"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "console.log('now ' + typeof Date.now()); setTimeout(() => console.log('timer'), 1);\n" > "$tmp/plain.ts"
printf "fetch('http://127.0.0.1:1/').then(() => console.log('fetched')).catch(() => console.log('refused'));\n" > "$tmp/net.ts"
printf "console.log('hello');\n" > "$tmp/hello.ts"
fail=0
for p in hello plain net; do
  ZN_KEEP_SYMBOLS=1 timeout 120 "$ZINC" build "$tmp/$p.ts" -o "$tmp/$p" >"$tmp/$p.log" 2>&1 || { echo "lite_host: build $p failed: $(tail -3 "$tmp/$p.log")"; exit 1; }
done
[ "$(strings "$tmp/plain" | grep -c -i mbedtls)" -eq 0 ] || { echo "lite_host: a program without network links Mbed TLS"; fail=1; }
[ "$(strings "$tmp/net" | grep -c -i mbedtls)" -gt 0 ] || { echo "lite_host: a program that fetches has no Mbed TLS"; fail=1; }
[ "$(timeout 20 "$tmp/plain")" = "now number
timer" ] || { echo "lite_host: the program without network did not run"; fail=1; }
[ "$(timeout 20 "$tmp/net")" = "refused" ] || { echo "lite_host: the program that fetches did not run"; fail=1; }
# This gate covers Zinc transport references. libuv's shared close/stream internals still retain socket helpers (ZN-164 remains open).
nm "$tmp/plain" > "$tmp/plain.raw.nm" || exit 1
c++filt < "$tmp/plain.raw.nm" > "$tmp/plain.nm" || exit 1
if grep -Eq 'zn::(osc::|loop::(oscListen|oscClose|oscSend|resolveHost))|[ _]uv_getaddrinfo$|llhttp_|mbedtls_' "$tmp/plain.nm"; then
  echo "lite_host: unused Zinc OSC/DNS, HTTP parser or TLS code retained"; fail=1
fi
if [ "$(uname -s)/$(uname -m)" = Darwin/arm64 ]; then
  [ "$(wc -c < "$tmp/hello")" -le 300000 ] || { echo "lite_host: native hello exceeds 300000 B"; fail=1; }
  [ "$(wc -c < "$tmp/plain")" -le 5000000 ] || { echo "lite_host: hosted timer exceeds 5000000 B"; fail=1; }
fi
[ "$(timeout 20 "$tmp/hello")" = hello ] || { echo "lite_host: hello did not run"; fail=1; }
[ $fail -eq 0 ] && echo "lite_host: ok"
exit $fail
