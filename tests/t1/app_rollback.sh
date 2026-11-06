#!/bin/sh
# App updates, swap and rollback (ZN-324.02): the app ships as A.zapp (1.0.0); `zinc update-app` downloads 1.1.0 from a local HTTP server and
# stages it; the next launch of A.zapp runs 1.1.0 on trial and keeps it once it exits normally; a staged 1.2.0 that crashes at start is rolled back
# on the launch after, which runs 1.1.0 again. A 1.3.0 that calls exit(3) is not kept either (ZN-996), and a second launch while a 1.4.0 is
# still on trial runs 1.1.0 without rolling the trial back: the 1.4.0 that ends well is kept.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=; trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
eval "$("$Z" update-keygen | sed 's/^/k_/')"
port=$((20000 + ($$ + 7) % 20000))
mkdir -p "$tmp/www"
(cd "$tmp/www" && exec python3 -m http.server $port --bind 127.0.0.1 >/dev/null 2>&1) & srv=$!
make() {   # make <dir> <version> <main.ts text>
  "$Z" new cli "$tmp/$1" >/dev/null || exit 2
  printf '%s\n' "$3" > "$tmp/$1/src/main.ts"
  python3 - "$tmp/$1/zinc.json" "$2" "$port" "$k_public" <<'PY'
import json, sys
p, v, port, key = sys.argv[1:]
d = json.load(open(p)); d['name'] = 'app'; d['app'] = {'id': 'com.example.roll', 'version': v}
d['update'] = {'url': f'http://127.0.0.1:{port}/', 'publicKey': key}
json.dump(d, open(p, 'w'))
PY
}
make v1 1.0.0 "console.log('version 1');"
make v2 1.1.0 "console.log('version 2');"
make v3 1.2.0 "throw new Error('boom at start');"
"$Z" pack "$tmp/v1" -o "$tmp/A.zapp" >/dev/null || exit 1
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.3; done
"$Z" publish "$tmp/v2" --key "$k_seed" -o "$tmp/www" >/dev/null && "$Z" update-app "$tmp/v1" >/dev/null || { echo "publish / update-app 1.1.0 failed"; exit 1; }
[ "$("$Z" run "$tmp/A.zapp" 2>&1)" = "version 2" ] || { echo "the staged 1.1.0 does not run: $("$Z" run "$tmp/A.zapp" 2>&1)"; fail=1; }
d="$ZINC_HOME/apps/com.example.roll"
[ -f "$d/current" ] && [ ! -f "$d/trial" ] && [ ! -f "$d/staged" ] || { echo "1.1.0 was not kept: $(ls "$d")"; fail=1; }
[ "$("$Z" run "$tmp/A.zapp" 2>&1)" = "version 2" ] || { echo "1.1.0 is not the version in use"; fail=1; }
"$Z" publish "$tmp/v3" --key "$k_seed" -o "$tmp/www" >/dev/null && "$Z" update-app "$tmp/v1" >/dev/null || { echo "publish / update-app 1.2.0 failed"; exit 1; }
out=$("$Z" run "$tmp/A.zapp" 2>&1); [ $? -ne 0 ] && echo "$out" | grep -q 'boom at start' || { echo "the crashing 1.2.0 did not run on trial: $out"; fail=1; }
out=$("$Z" run "$tmp/A.zapp" 2>&1)
echo "$out" | grep -q 'failed to start; it was rolled back' && echo "$out" | tail -1 | grep -qx 'version 2' || { echo "no rollback to 1.1.0: $out"; fail=1; }
[ "$("$Z" run "$tmp/A.zapp" 2>&1)" = "version 2" ] || { echo "after the rollback: $("$Z" run "$tmp/A.zapp" 2>&1)"; fail=1; }
# a non-zero exit is a failure, not a healthy run
make v4 1.3.0 "import { exit } from 'zinc:sys'; console.log('version 4'); exit(3);"
"$Z" publish "$tmp/v4" --key "$k_seed" -o "$tmp/www" >/dev/null && "$Z" update-app "$tmp/v1" >/dev/null || { echo "publish / update-app 1.3.0 failed"; exit 1; }
out=$("$Z" run "$tmp/A.zapp" 2>&1); [ $? -eq 3 ] && [ "$out" = "version 4" ] || { echo "1.3.0 did not run on trial: $out"; fail=1; }
[ -f "$d/trial" ] || { echo "1.3.0 that exited with 3 was kept: $(ls "$d")"; fail=1; }
out=$("$Z" run "$tmp/A.zapp" 2>&1)
echo "$out" | grep -q 'failed to start; it was rolled back' && echo "$out" | tail -1 | grep -qx 'version 2' || { echo "no rollback of the exit(3) update: $out"; fail=1; }
# a second launch during a trial runs the version in use and leaves the trial alone
make v5 1.4.0 "console.log('version 5'); setTimeout(() => { console.log('version 5 done'); }, 2500);"
"$Z" publish "$tmp/v5" --key "$k_seed" -o "$tmp/www" >/dev/null && "$Z" update-app "$tmp/v1" >/dev/null || { echo "publish / update-app 1.4.0 failed"; exit 1; }
ZINC_REALTIME=1 "$Z" run "$tmp/A.zapp" > "$tmp/first.out" 2>&1 & first=$!
n=0; while [ $n -lt 50 ] && ! grep -q 'version 5' "$tmp/first.out"; do sleep 0.1; n=$((n+1)); done
out=$("$Z" run "$tmp/A.zapp" 2>&1)
[ "$out" = "version 2" ] || { echo "the second launch during the trial: $out"; fail=1; }
wait $first
grep -q 'version 5 done' "$tmp/first.out" && [ -f "$d/current" ] && [ ! -f "$d/trial" ] && [ ! -f "$d/staged" ] || { echo "1.4.0 was not kept after its trial: $(cat "$tmp/first.out"; ls "$d")"; fail=1; }
[ "$("$Z" run "$tmp/A.zapp" 2>&1 | head -1)" = "version 5" ] || { echo "1.4.0 is not the version in use"; fail=1; }
[ $fail -eq 0 ] && echo "app rollback: ok"
exit $fail
