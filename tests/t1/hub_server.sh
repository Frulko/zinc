#!/bin/sh
# The hub server (ZN-842, app/hub-server): started on a free port with an empty data directory, it takes two versions from
# `zinc publish --hub`, pairs a device by the code it prints, serves it a catalog signed with the hub key (checked with zinc verify) and the
# app's manifest and .zapp (the app's signature and the SHA-256 checked here); it refuses a tampered .zapp, an older version, a wrong
# publisher token, a wrong pairing code and a request without a device token; the admin page lists apps and devices and retracts a version.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v curl >/dev/null && command -v python3 >/dev/null || { echo "SKIP: needs curl and python3"; exit 77; }
tmp=$(mktemp -d); srv=
trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
eval "$("$Z" update-keygen | sed 's/^/k_/')"   # k_seed, k_public: the app's key
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
hub=http://127.0.0.1:$port
"$Z" run app/hub-server -- --port "$port" --data "$tmp/data" >"$tmp/hub.log" 2>&1 & srv=$!
for i in $(seq 1 100); do grep -q 'pairing code' "$tmp/hub.log" && break; sleep 0.2; done
grep -q 'pairing code' "$tmp/hub.log" || { echo "the hub did not start:"; head -20 "$tmp/hub.log"; exit 1; }
token=$(cat "$tmp/data/publisher.token")
serverkey=$(sed -n 's/^hub: server key //p' "$tmp/hub.log")

setver() { python3 - "$1/zinc.json" "$2" "$k_public" <<'PY'
import json, sys
p, v, key = sys.argv[1:]
d = json.load(open(p)); d['app'] = {'id': 'com.example.hub', 'version': v}
d['update'] = {'url': 'http://127.0.0.1/', 'channel': 'stable', 'publicKey': key}
json.dump(d, open(p, 'w'))
PY
}
"$Z" new cli "$tmp/v1" >/dev/null && cp -R "$tmp/v1" "$tmp/v2" && cp -R "$tmp/v1" "$tmp/v0" || exit 2
setver "$tmp/v1" 1.0.0; setver "$tmp/v2" 1.1.0; setver "$tmp/v0" 0.9.0

# publishing: two versions in order, then an older one and a wrong token are refused
out=$("$Z" publish "$tmp/v1" --key "$k_seed" -o "$tmp/out1" --hub "$hub" --token "$token" 2>&1) && echo "$out" | grep -q 'stored com.example.hub 1.0.0 on stable' || { echo "publish 1.0.0: $out"; fail=1; }
out=$("$Z" publish "$tmp/v2" --key "$k_seed" -o "$tmp/out2" --hub "$hub" --token "$token" 2>&1) && echo "$out" | grep -q 'stored com.example.hub 1.1.0 on stable' || { echo "publish 1.1.0: $out"; fail=1; }
out=$("$Z" publish "$tmp/v0" --key "$k_seed" -o "$tmp/out0" --hub "$hub" --token "$token" 2>&1) && { echo "an older version is accepted: $out"; fail=1; }
echo "$out" | grep -q 'refused: 0.9.0 is not newer than 1.1.0' || { echo "older version: $out"; fail=1; }
out=$("$Z" publish "$tmp/v0" --key "$k_seed" -o "$tmp/out0" --hub "$hub" --token wrong 2>&1) && { echo "a wrong publisher token is accepted: $out"; fail=1; }
echo "$out" | grep -q 'wrong publisher token' || { echo "wrong token: $out"; fail=1; }
# a tampered .zapp under the signed manifest of a newer version: the SHA-256 does not match
setver "$tmp/v1" 1.2.0
"$Z" publish "$tmp/v1" --key "$k_seed" -o "$tmp/out3" >/dev/null || { echo "local publish failed"; fail=1; }
cp "$tmp/out3/v1-1.2.0.zapp" "$tmp/bad.zapp" && printf 'X' | dd of="$tmp/bad.zapp" bs=1 seek=600 conv=notrunc 2>/dev/null
cat "$tmp/out3/stable.manifest" "$tmp/bad.zapp" >"$tmp/body"
out=$(curl -s -X POST -H "Authorization: Bearer $token" -H "X-Manifest-Length: $(wc -c <"$tmp/out3/stable.manifest" | tr -d ' ')" --data-binary @"$tmp/body" "$hub/publish")
echo "$out" | grep -q 'does not match the SHA-256' || { echo "a tampered .zapp is accepted: $out"; fail=1; }

# devices: nothing without a token; a wrong code is refused; the right one gives the server key and a token
code=$(curl -s -o /dev/null -w '%{http_code}' "$hub/catalog.json"); [ "$code" = 401 ] || { echo "catalog without a token: $code"; fail=1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer nope' "$hub/apps/com.example.hub/v1-1.1.0.zapp"); [ "$code" = 401 ] || { echo "zapp with a wrong token: $code"; fail=1; }
pc=$(sed -n 's/^hub: pairing code //p' "$tmp/hub.log" | tail -1)
code=$(curl -s -o /dev/null -w '%{http_code}' -d "code=000000x&name=intruder" "$hub/pair"); [ "$code" = 403 ] || { echo "a wrong pairing code: $code"; fail=1; }
pair=$(curl -s -d "code=$pc&name=test-tablet" "$hub/pair")
dtoken=$(echo "$pair" | python3 -c 'import json, sys; print(json.load(sys.stdin)["token"])' 2>/dev/null)
echo "$pair" | grep -q "\"serverKey\":\"$serverkey\"" && [ -n "$dtoken" ] || { echo "pairing: $pair"; fail=1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -d "code=$pc&name=again" "$hub/pair"); [ "$code" = 403 ] || { echo "a used pairing code works again: $code"; fail=1; }
auth="Authorization: Bearer $dtoken"

# the catalog, signed by the hub key; the app's manifest signed by the app key; the .zapp its SHA-256
curl -sf -H "$auth" "$hub/catalog.json" >"$tmp/catalog.json" && curl -sf -H "$auth" "$hub/catalog.json.sig" >"$tmp/catalog.json.sig" || { echo "catalog download failed"; fail=1; }
grep -q '"id":"com.example.hub"' "$tmp/catalog.json" && grep -q '"version":"1.1.0"' "$tmp/catalog.json" || { echo "catalog: $(cat "$tmp/catalog.json")"; fail=1; }
"$Z" verify "$tmp/catalog.json" --key "$serverkey" >/dev/null 2>&1 || { echo "the catalog signature does not verify"; fail=1; }
sed -i.bak 's/1\.1\.0/9.9.9/' "$tmp/catalog.json"
"$Z" verify "$tmp/catalog.json" --key "$serverkey" >/dev/null 2>&1 && { echo "an altered catalog verifies"; fail=1; }
curl -sf -H "$auth" "$hub/apps/com.example.hub/stable.manifest" >"$tmp/m" || { echo "manifest download failed"; fail=1; }
grep -v '^sig=' "$tmp/m" >"$tmp/m.body"; sed -n 's/^sig=//p' "$tmp/m" >"$tmp/m.body.sig"
"$Z" verify "$tmp/m.body" --key "$k_public" >/dev/null 2>&1 || { echo "the app manifest signature does not verify: $(cat "$tmp/m")"; fail=1; }
curl -sf -H "$auth" "$hub/apps/com.example.hub/v1-1.1.0.zapp" >"$tmp/got.zapp" || { echo "zapp download failed"; fail=1; }
sum=$(shasum -a 256 "$tmp/got.zapp" | cut -d' ' -f1)
grep -q "^sha256=$sum$" "$tmp/m" && cmp -s "$tmp/got.zapp" "$tmp/out2/v1-1.1.0.zapp" || { echo "the served .zapp is not the published one ($sum)"; fail=1; }

# admin: apps and devices listed, 1.1.0 retracted -> 1.0.0 is current again; a wrong token sees nothing
code=$(curl -s -o /dev/null -w '%{http_code}' "$hub/admin?token=nope"); [ "$code" = 403 ] || { echo "admin with a wrong token: $code"; fail=1; }
page=$(curl -sf "$hub/admin?token=$token")
echo "$page" | grep -q 'test-tablet' && echo "$page" | grep -q '1.1.0 (current)' || { echo "admin page: $page" | head -5; fail=1; }
page=$(curl -sf -d "token=$token&app=com.example.hub&channel=stable&version=1.1.0" "$hub/admin/retract")
echo "$page" | grep -q '1.1.0 (retracted)' && echo "$page" | grep -q '1.0.0 (current)' || { echo "retract: $page" | head -5; fail=1; }
curl -sf -H "$auth" "$hub/catalog.json" | grep -q '"version":"1.0.0"' || { echo "the catalog still offers the retracted version"; fail=1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$auth" "$hub/apps/com.example.hub/v1-1.1.0.zapp"); [ "$code" = 404 ] || { echo "a retracted .zapp is served: $code"; fail=1; }

kill $srv; wait $srv 2>/dev/null; srv=
[ $fail -eq 0 ] && echo "hub server: ok"
exit $fail
