#!/bin/sh
# The app API of updates (ZN-324.03, zinc:system/update): A.zapp (1.0.0) checks its channel on a local HTTP server, downloads 1.1.0 (signature and
# SHA-256 checked by the engine), restarts into it; 1.1.0 calls healthy() and is kept, and finds nothing newer.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=; trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1
eval "$("$Z" update-keygen | sed 's/^/k_/')"
port=$((20000 + ($$ + 13) % 20000))
mkdir -p "$tmp/www"
(cd "$tmp/www" && exec python3 -m http.server $port --bind 127.0.0.1 >/dev/null 2>&1) & srv=$!
make() {   # make <dir> <version> <main.ts text>
  "$Z" new cli "$tmp/$1" >/dev/null || exit 2
  printf '%s\n' "$3" > "$tmp/$1/src/main.ts"
  python3 - "$tmp/$1/zinc.json" "$2" "$port" "$k_public" <<'PY'
import json, sys
p, v, port, key = sys.argv[1:]
d = json.load(open(p)); d['name'] = 'app'; d['app'] = {'id': 'com.example.api', 'version': v}; d['permissions'] = ['update']
d['update'] = {'url': f'http://127.0.0.1:{port}/', 'publicKey': key}
json.dump(d, open(p, 'w'))
PY
}
make v1 1.0.0 "import * as update from 'zinc:system/update';
console.log('version 1');
const u = update.check();
console.log('available ' + u.available + ' ' + u.version + ' ' + u.notes);
if (u.available) { console.log('downloaded ' + update.download()); update.restart(); }"
make v2 1.1.0 "import * as update from 'zinc:system/update';
console.log('version 2');
update.healthy();
console.log('available ' + update.check().available);"
"$Z" pack "$tmp/v1" -o "$tmp/A.zapp" >/dev/null || { echo "pack failed"; exit 1; }
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.3; done
"$Z" publish "$tmp/v2" --key "$k_seed" --notes "better" -o "$tmp/www" >/dev/null || { echo "publish failed"; exit 1; }
want="version 1
available true 1.1.0 better
downloaded 1.1.0
version 2
available false"
got=$("$Z" run "$tmp/A.zapp" 2>&1 | grep -v '^\[system\]')
[ "$got" = "$want" ] || { echo "the app did not update itself: $got"; exit 1; }
[ -f "$ZINC_HOME/apps/com.example.api/current" ] && [ ! -f "$ZINC_HOME/apps/com.example.api/trial" ] || { echo "1.1.0 was not kept"; exit 1; }
echo "app update api: ok"
