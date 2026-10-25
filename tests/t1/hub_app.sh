#!/bin/sh
# Zinc Hub (ZN-843, app/hub) against the hub server of ZN-842 on this machine, headless: the app pairs with the code the server prints,
# installs an app published with `zinc publish --hub`, updates it (the check at start announces the update), rolls it back and forward,
# follows the beta channel, and refuses a tampered .zapp, a tampered manifest, a catalog signed by another key and an older version.
# Icons: 1.0.0 has none (a framed initial in the list); from 1.1.0 on, zinc.json app.icon: the hub caches the package's icon.png
# checked against the catalog's SHA-256, and an icon altered on the server leaves the placeholder.
# zinc-tile is a stand-in that records its calls (on the tablet it is the engine's, ZN-841). ZINC_HUB_SCRIPT runs the buttons' actions.
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
"$Z" run app/hub-server -- --port "$port" --data "$tmp/data" >"$tmp/server.log" 2>&1 & srv=$!
for i in $(seq 1 100); do grep -q 'pairing code' "$tmp/server.log" && break; sleep 0.2; done
grep -q 'pairing code' "$tmp/server.log" || { echo "the server did not start:"; head -20 "$tmp/server.log"; exit 1; }
token=$(cat "$tmp/data/publisher.token")
pc=$(sed -n 's/^hub: pairing code //p' "$tmp/server.log" | tail -1)
serverkey=$(sed -n 's/^hub: server key //p' "$tmp/server.log")

"$Z" new cli "$tmp/notes" >/dev/null || exit 2
cp examples/remarkable/notes/icon.svg "$tmp/notes/icon.svg"
publish() {   # version [channel]
  python3 - "$tmp/notes/zinc.json" "$1" "$k_public" <<'PY'
import json, sys
p, v, key = sys.argv[1:]
d = json.load(open(p)); d['app'] = {'id': 'com.example.notes', 'version': v}
if v != '1.0.0': d['app']['icon'] = 'icon.svg'
d['update'] = {'url': 'http://127.0.0.1/', 'channel': 'stable', 'publicKey': key}
json.dump(d, open(p, 'w'))
PY
  out=$("$Z" publish "$tmp/notes" --key "$k_seed" --channel "${2:-stable}" -o "$tmp/out-$1" --hub "$hub" --token "$token" 2>&1)
  echo "$out" | grep -q "stored com.example.notes $1" || { echo "publish $1: $out"; fail=1; }
}
printf '#!/bin/sh\necho "$@" >>"%s/tile.log"\n' "$tmp" >"$tmp/zinc-tile"; chmod 755 "$tmp/zinc-tile"
export ZINC_HUB_DIR="$tmp/hub" ZINC_HUB_APPS="$tmp/apps" ZINC_HUB_TILE="$tmp/zinc-tile" ZINC_HUB_DEVICE=test-tablet
session=0
app() {   # a session of the hub app: $1 the script, the log in $tmp/app.log (HUB_APP_SHOTS=<dir>: the last frame of each, n.png)
  session=$((session + 1)); [ -n "$HUB_APP_SHOTS" ] && export ZINC_SHOT="$HUB_APP_SHOTS/$session.png"
  ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_HUB_SCRIPT="$1" ZINC_SCENE_DUMP="$tmp/scene.bin" timeout 60 "$Z" run app/hub >"$tmp/app.log" 2>&1 \
    || { echo "the hub app failed ($1):"; tail -15 "$tmp/app.log"; fail=1; }
}
expect() { grep -qF "$1" "$tmp/app.log" || { echo "expected '$1' in:"; grep '^hub:' "$tmp/app.log"; fail=1; }; }
live=$tmp/apps/notes.zapp

# pairing with the code, then install 1.0.0: its tile, the key and token kept by the app only
publish 1.0.0
app "server $hub; pair 123456; pair $pc; install com.example.notes"
expect 'Wrong pairing code'
expect "Paired with $hub (key $(echo "$serverkey" | cut -c1-16)). 1 apps."
expect 'Installed notes 1.0.0.'
cmp -s "$live" "$tmp/out-1.0.0/notes-1.0.0.zapp" || { echo "the installed .zapp is not the published 1.0.0"; fail=1; }
grep -qx "$live" "$tmp/tile.log" 2>/dev/null || { echo "zinc-tile was not called on $live: $(cat "$tmp/tile.log" 2>/dev/null)"; fail=1; }
out=$("$Z" run "$live" 2>&1); echo "$out" | grep -q 'hello from' || { echo "the installed app does not run: $out" | tail -5; fail=1; }   # what its tile runs
grep -qx "serverKey=$serverkey" "$tmp/hub/hub.conf" && [ "$(stat -f %Lp "$tmp/hub/hub.conf" 2>/dev/null || stat -c %a "$tmp/hub/hub.conf")" = 600 ] \
  || { echo "hub.conf: $(ls -l "$tmp/hub/hub.conf"; cat "$tmp/hub/hub.conf")"; fail=1; }
# Open: with the tile's launcher (ZINC_NEXT) the hub names the package and quits; without it, it says to use AppLoad
export ZINC_NEXT=$tmp/next; app "open com.example.notes"; unset ZINC_NEXT
[ "$(cat "$tmp/next" 2>/dev/null)" = "$live" ] || { echo "Open did not hand $live to the launcher: $(cat "$tmp/next" 2>/dev/null)"; fail=1; }
app "open com.example.notes"
expect 'Open notes from AppLoad'
grep -q 'test-tablet' "$tmp/data/devices.txt" || { echo "the server does not list the tablet"; fail=1; }
icon=$tmp/hub/apps/com.example.notes/icon.png
[ -e "$icon" ] && { echo "an icon is cached for 1.0.0, which has none"; fail=1; }
python3 tools/scene-texts "$tmp/scene.bin" | grep -qx N || { echo "no placeholder (the initial N) for an app without an icon"; fail=1; }

# 1.1.0: announced by the check at start, then updated; 1.0.0 kept for rollback
publish 1.1.0
app "update com.example.notes"
expect 'Updates: notes 1.1.0.'
expect 'Updated notes 1.1.0 (was 1.0.0).'
cmp -s "$live" "$tmp/out-1.1.0/notes-1.1.0.zapp" && cmp -s "$tmp/hub/apps/com.example.notes/previous.zapp" "$tmp/out-1.0.0/notes-1.0.0.zapp" \
  || { echo "after the update: the live or the kept package is wrong"; fail=1; }
tar xOf "$tmp/out-1.1.0/notes-1.1.0.zapp" icon.png >"$tmp/icon-1.1.0.png" && cmp -s "$icon" "$tmp/icon-1.1.0.png" || { echo "the cached icon is not the package's icon.png"; fail=1; }
python3 tools/scene-texts "$tmp/scene.bin" | grep -qx N && { echo "the placeholder is shown for an app with an icon"; fail=1; }
# an icon altered on the server: not cached, the placeholder instead
srvicon=$tmp/data/apps/com.example.notes/notes-1.1.0.png
cp "$srvicon" "$tmp/srvicon.bak" && printf 'X' | dd of="$srvicon" bs=1 seek=40 conv=notrunc 2>/dev/null && rm -f "$icon"
app "refresh"
[ -e "$icon" ] && { echo "an altered icon was cached"; fail=1; }
python3 tools/scene-texts "$tmp/scene.bin" | grep -qx N || { echo "no placeholder for an altered icon"; fail=1; }
cp "$tmp/srvicon.bak" "$srvicon"

# rollback to 1.0.0, and the list shows it (the drawn frame); then forward again
app "rollback com.example.notes"
expect 'Rolled notes back to 1.0.0 (from 1.1.0).'
cmp -s "$live" "$tmp/out-1.0.0/notes-1.0.0.zapp" || { echo "the rollback did not put 1.0.0 back"; fail=1; }
texts=$(python3 tools/scene-texts "$tmp/scene.bin")
for t in 'Zinc Hub' 'notes' 'Installed 1.0.0 · 1.1.0 available' 'Update to 1.1.0'; do
  echo "$texts" | grep -qxF "$t" || { echo "the apps page does not show '$t':"; echo "$texts" | head -30; fail=1; }
done
echo "$texts" | grep -q 'Rollback' && { echo "the apps page offers a rollback to a newer version"; fail=1; }
app "update com.example.notes"
expect 'Updated notes 1.1.0 (was 1.0.0).'

# a tampered .zapp on the server: refused by its signed SHA-256, nothing replaced
publish 1.2.0
printf 'X' | dd of="$tmp/data/apps/com.example.notes/notes-1.2.0.zapp" bs=1 seek=600 conv=notrunc 2>/dev/null
app "update com.example.notes"
expect 'Refused: notes-1.2.0.zapp does not match the SHA-256 its publisher signed. It was altered; nothing was installed.'
cmp -s "$live" "$tmp/out-1.1.0/notes-1.1.0.zapp" || { echo "a tampered update replaced the app"; fail=1; }
# a tampered manifest (pointing at a forged SHA-256): refused by the app's signature
m="$tmp/data/apps/com.example.notes/stable/1.2.0.manifest"
sed -i.bak "s/^sha256=.*/sha256=$(shasum -a 256 "$tmp/data/apps/com.example.notes/notes-1.2.0.zapp" | cut -d' ' -f1)/" "$m"
app "update com.example.notes"
expect 'Refused: the manifest of com.example.notes is not signed by its publisher.'

# an older version offered by the server (1.1.0 and 1.2.0 retracted: 1.0.0 is current again): refused
for v in 1.2.0 1.1.0; do curl -sf -d "token=$token&app=com.example.notes&channel=stable&version=$v" "$hub/admin/retract" >/dev/null || { echo "retract $v failed"; fail=1; }; done
app "update com.example.notes"
expect 'Refused: notes 1.0.0 is older than the installed 1.1.0. The hub never downgrades an app; use Rollback to go back.'
cmp -s "$live" "$tmp/out-1.1.0/notes-1.1.0.zapp" || { echo "an older version replaced the app"; fail=1; }

# the beta channel
publish 1.3.0-beta.1 beta
app "channel com.example.notes beta; update com.example.notes"
expect 'Updated notes 1.3.0-beta.1 (was 1.1.0).'

# a catalog signed by another key than the one pinned at pairing
sed -i.bak 's/^serverKey=.*/serverKey=0000000000000000000000000000000000000000000000000000000000000000/' "$tmp/hub/hub.conf"
app "refresh; page settings"
expect 'Refused: the catalog is not signed by the server this tablet paired with.'

kill $srv; wait $srv 2>/dev/null; srv=
[ $fail -eq 0 ] && echo "hub app: ok"
exit $fail
