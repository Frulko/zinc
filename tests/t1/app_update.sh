#!/bin/sh
# App updates, publish and verify (ZN-324.01): `zinc publish` writes <channel>.manifest signed with the app's key beside the .zapp; served by a local
# HTTP server, `zinc update-app` finds the newer version, downloads it and checks its SHA-256; a manifest altered after signing and a channel that
# offers an older version are refused.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=; trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
eval "$("$Z" update-keygen | sed 's/^/k_/')"   # k_seed, k_public
port=$((20000 + $$ % 20000))
mkdir -p "$tmp/www/beta"
(cd "$tmp/www" && exec python3 -m http.server $port --bind 127.0.0.1 >/dev/null 2>&1) & srv=$!
setver() { python3 - "$1/zinc.json" "$2" "$port" "$k_public" <<'PY'
import json, sys
p, v, port, key = sys.argv[1:]
d = json.load(open(p)); d['app'] = {'id': 'com.example.upd', 'version': v}
d['update'] = {'url': f'http://127.0.0.1:{port}/', 'channel': 'stable', 'publicKey': key}
json.dump(d, open(p, 'w'))
PY
}
"$Z" new cli "$tmp/v1" >/dev/null && cp -R "$tmp/v1" "$tmp/v2" && cp -R "$tmp/v1" "$tmp/v0" || exit 2
setver "$tmp/v1" 1.0.0; setver "$tmp/v2" 1.1.0; setver "$tmp/v0" 0.9.0
"$Z" publish "$tmp/v2" --key "$k_seed" --notes "faster" -o "$tmp/www" >/dev/null || { echo "publish failed"; exit 1; }
"$Z" publish "$tmp/v0" --key "$k_seed" --channel beta -o "$tmp/www/beta" >/dev/null || { echo "publish beta failed"; exit 1; }
cp "$tmp/www/beta/beta.manifest" "$tmp/www/beta.manifest"; cp "$tmp/www/beta/"*.zapp "$tmp/www/"
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf "http://127.0.0.1:$port/stable.manifest" >/dev/null && break; sleep 0.3; done
out=$("$Z" update-app "$tmp/v1" --check 2>&1); rc=$?
[ $rc -eq 10 ] && echo "$out" | grep -q '1.1.0 is available (this is 1.0.0): faster' || { echo "check: rc $rc, $out"; fail=1; }
out=$("$Z" update-app "$tmp/v1" 2>&1) || { echo "download: $out"; fail=1; }
path=$(echo "$out" | sed -n 's/^downloaded and verified: //p')
[ -f "$path" ] && cmp -s "$path" "$tmp/www/v1-1.1.0.zapp" || { echo "the downloaded update is not the published one: $out"; fail=1; }
out=$("$Z" update-app "$tmp/v1" --channel beta 2>&1); [ $? -ne 0 ] && echo "$out" | grep -q 'older than 1.0.0' || { echo "an older version is accepted: $out"; fail=1; }
sed -i.bak 's/^notes=faster$/notes=evil/' "$tmp/www/stable.manifest"
out=$("$Z" update-app "$tmp/v1" --check 2>&1); [ $? -ne 0 ] && echo "$out" | grep -qi 'signature' || { echo "an altered manifest is accepted: $out"; fail=1; }
[ $fail -eq 0 ] && echo "app update: ok"
exit $fail
