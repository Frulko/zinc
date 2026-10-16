#!/bin/sh
# The agent as a service and signed updates (ZN-729.04), on the loopback interface with a test key. `zinc agent install --print`: the systemd
# unit and the launchd agent by their text (nothing is installed on this machine). An app with update.publicKey: an unsigned .zapp, an older
# one and one signed with another key are refused with a message, a signed newer one replaces it; an update that exits at once is rolled
# back and the client is told; `zinc device update <app>` fetches the next version from the app's channel on the device (file://), an
# altered manifest is refused; `zinc device update` checks and fetches an engine package with the device's trusted key.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" www="$tmp/www" name="zn-o$$" fail=0
dev() { ZINC_HOME="$W" timeout 60 "$Z" device "$@"; }
bad() { echo "FAIL: $*"; fail=1; }
cleanup() {
  for f in "$D"/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(cat "$f")" 2>/dev/null; done   # apps outlive their agent
  kill $apid 2>/dev/null; wait $apid 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT
S=${ZN_WAIT_SCALE:-1}   # a shared runner under load: the apps and the waits are that many times longer
until_grep() { n=0; while [ $n -lt $((100 * S)) ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
mkdir -p "$www" "$tmp/fakehome"

# the service, by its text: HOME is an empty directory, and it stays empty
unit=$(HOME="$tmp/fakehome" XDG_CONFIG_HOME= ZINC_HOME="$D" "$Z" agent install --print --os linux --port 7000 --name "my board" --no-shell) || bad "install --print --os linux"
echo "$unit" | grep -q "^# writes $tmp/fakehome/.config/systemd/user/zinc-agent.service$" || bad "the unit's path: $unit"
echo "$unit" | grep -q '^ExecStart="/.*/zinc" "agent" "--port" "7000" "--name" "my board" "--no-shell"$' || bad "the unit's command: $unit"
for line in '^\[Service\]$' '^Restart=always$' '^KillMode=process$' '^WantedBy=default.target$' "^Environment=\"ZINC_HOME=$D\"$" '^# then: systemctl --user enable --now zinc-agent.service$' '^# then: loginctl enable-linger '; do
  echo "$unit" | grep -q "$line" || bad "the unit lacks $line: $unit"
done
plist=$(HOME="$tmp/fakehome" ZINC_HOME="$D" "$Z" agent install --print --os macos --name "a<b") || bad "install --print --os macos"
echo "$plist" | grep -q "^# writes $tmp/fakehome/Library/LaunchAgents/dev.zinc.agent.plist$" || bad "the launchd agent's path: $plist"
echo "$plist" | grep -q "<key>RunAtLoad</key><true/>" && echo "$plist" | grep -q "<string>a&lt;b</string>" && echo "$plist" | grep -q "^# then: launchctl bootstrap gui/$(id -u) $tmp/fakehome/Library" || bad "the launchd agent: $plist"
if command -v plutil >/dev/null 2>&1; then echo "$plist" | grep -v '^#' | plutil -lint - >/dev/null || bad "plutil refuses the launchd agent: $plist"; fi
HOME="$tmp/fakehome" XDG_CONFIG_HOME= ZINC_HOME="$D" "$Z" agent uninstall --print | grep -q "^# removes $tmp/fakehome/" || bad "uninstall --print"
ZINC_HOME="$D" "$Z" agent install --port 2>/dev/null; [ $? -eq 2 ] || bad "install with a bad option is not a usage error"
[ -z "$(ls -A "$tmp/fakehome")" ] && [ ! -e "$D" ] || bad "--print wrote something: $(find "$tmp/fakehome" "$D" 2>/dev/null)"

# the app's key, another key (it also signs the engine's channel), and five versions of one app
eval "$("$Z" update-keygen | sed 's/^/k_/')"   # k_seed, k_public
eval "$("$Z" update-keygen | sed 's/^/e_/')"
project() {   # <dir> <version> <the program>
  mkdir -p "$tmp/$1/src"
  printf '%s\n' "$3" > "$tmp/$1/src/main.ts"
  printf '{"name":"otaapp","entry":"src/main.ts","app":{"id":"com.example.ota","version":"%s"},"update":{"url":"file://%s/","channel":"stable","publicKey":"%s"}}\n' "$2" "$www" "$k_public" > "$tmp/$1/zinc.json"
  ZINC_HOME="$W" "$Z" pack "$tmp/$1" -o "$tmp/$1.zapp" > /dev/null 2>&1 || { echo "pack of $1 failed"; exit 2; }
}
project v09 0.9.0 'console.log("this is 0.9.0");'
project v10 1.0.0 'console.log("this is 1.0.0");'
project v11 1.1.0 "console.log('this is 1.1.0'); setTimeout(() => { console.log('still there'); }, $((6000 * S)));"
project v12 1.2.0 'console.log("this is 1.2.0"); throw new Error("a broken build");'
project v13 1.3.0 'console.log("this is 1.3.0");'

# ZINC_REALTIME: the apps wait on the real clock (tests/run sets the virtual one, where a timer of 6 s is over at once)
ZINC_HOME="$D" SHELL=/bin/sh ZINC_REALTIME=1 ZINC_AGENT_TRIAL_MS=$((4000 * S)) ZINC_UPDATE_PUBKEY="$e_public" "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
dev pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }
app="$D/agent/apps/otaapp"
log="$D/agent/logs/otaapp.log"   # written anew at each start

# the first install needs no signature: nothing on the device has a key yet
dev install "$tmp/v10.zapp" > /dev/null 2>&1 || bad "the first install"
out=$(dev install "$tmp/v11.zapp" 2>&1) && bad "an unsigned .zapp replaced a signed app"
echo "$out" | grep -q "unsigned, refused" || bad "unsigned: $out"
"$Z" sign "$tmp/v09.zapp" "$k_seed" > /dev/null
out=$(dev install "$tmp/v09.zapp" 2>&1) && bad "an older version replaced a signed app"
echo "$out" | grep -q "otaapp 1.0.0 is installed: 0.9.0 is not newer, refused" || bad "older: $out"
"$Z" sign "$tmp/v11.zapp" "$e_seed" > /dev/null
out=$(dev install "$tmp/v11.zapp" 2>&1) && bad "a .zapp signed with another key replaced a signed app"
echo "$out" | grep -q "signature does not verify" || bad "another key: $out"
mkdir -p "$tmp/dir" && printf '#!/bin/sh\necho intruder\n' > "$tmp/dir/run.sh"
out=$(dev install "$tmp/dir" --name otaapp 2>&1) && bad "an export directory replaced a signed app"
echo "$out" | grep -q "not a directory" || bad "a directory: $out"
dev run otaapp > /dev/null 2>&1; until_grep "this is 1.0.0" "$log" || bad "the refused installs changed the app: $(cat "$log")"
[ ! -e "$app/previous.zapp" ] || bad "a refused install left a previous version"

# signed with its key and newer: it replaces the app, and holds its trial (it runs 6 s, the agent's trial lasts 4 s here)
"$Z" sign "$tmp/v11.zapp" "$k_seed" > /dev/null
dev install "$tmp/v11.zapp" > /dev/null 2>&1 || bad "a signed newer .zapp is refused"
[ -f "$app/previous.zapp" ] && [ -f "$app/trial" ] || bad "the version replaced was not kept: $(ls "$app")"
out=$(dev run otaapp 2>&1) || bad "the run of a good update: $out"
dev apps | grep -q "^otaapp .*running" || bad "the good update is not running after its trial: $(dev apps)"
[ ! -e "$app/previous.zapp" ] && [ ! -e "$app/trial" ] || bad "an update that held is still on trial: $(ls "$app")"
until_grep "this is 1.1.0" "$log" || bad "the signed update does not run: $(cat "$log")"

# an update that exits at once: the client is told, the previous version is back and started
"$Z" sign "$tmp/v12.zapp" "$k_seed" > /dev/null
dev install "$tmp/v12.zapp" > /dev/null 2>&1 || bad "the broken update could not be installed"
out=$(dev run otaapp 2>&1) && bad "the run of a broken update reports success: $out"
echo "$out" | grep -q "exited at once (status 101): it was rolled back, version 1.1.0 is back" && echo "$out" | grep -q "a broken build" || bad "the client is not told of the rollback: $out"
cmp -s "$app/app.zapp" "$tmp/v11.zapp" && [ ! -e "$app/previous.zapp" ] && [ ! -e "$app/trial" ] || bad "the previous version is not back: $(ls "$app")"
until_grep "this is 1.1.0" "$log" || bad "the previous version was not started again: $(cat "$log")"

# from the channel: zinc publish wrote it, the device fetches and checks it
ZINC_HOME="$W" "$Z" publish "$tmp/v13" --key "$k_seed" -o "$www" > /dev/null 2>&1 || bad "publish"
out=$(dev update otaapp 2>&1) || bad "update from the channel: $out"
echo "$out" | grep -q "otaapp 1.3.0 is installed (it was 1.1.0)" || bad "update: $out"
dev run otaapp > /dev/null 2>&1 || bad "the run of the fetched update"
[ ! -e "$app/previous.zapp" ] && [ ! -e "$app/trial" ] || bad "an update that ended with status 0 is still on trial: $(ls "$app")"
until_grep "this is 1.3.0" "$log" || bad "the fetched update does not run: $(cat "$log")"
dev update otaapp 2>&1 | grep -q "otaapp 1.3.0 is up to date" || bad "a second update is not up to date"
sed -i.bak 's/^version=1.3.0$/version=9.9.9/' "$www/stable.manifest"
out=$(dev update otaapp 2>&1) && bad "an altered manifest was accepted"
echo "$out" | grep -qi "signature" || bad "altered manifest: $out"
out=$(dev update nothere 2>&1) && bad "the update of an app that is not there"
echo "$out" | grep -q "no app named nothere" || bad "no such app: $out"

# the engine: a package of a channel signed with a key the device trusts is fetched and checked there
echo "a newer engine" > "$www/zinc-99.0.0.pkg"
printf 'version=99.0.0\nurl=zinc-99.0.0.pkg\nsha256=%s\n' "$(shasum -a 256 "$www/zinc-99.0.0.pkg" | cut -d' ' -f1)" > "$tmp/engine.txt"
"$Z" update-sign "$tmp/engine.txt" "$e_seed" > "$www/engine.manifest" || bad "update-sign"
out=$(dev update --url "file://$www/engine.manifest" 2>&1) || bad "engine update: $out"
echo "$out" | grep -q "zinc 99.0.0 downloaded and verified on the device" && cmp -s "$D/updates/zinc-99.0.0.pkg" "$www/zinc-99.0.0.pkg" || bad "the engine package: $out"
"$Z" update-sign "$tmp/engine.txt" "$k_seed" > "$www/engine.manifest"
dev update --url "file://$www/engine.manifest" > /dev/null 2>&1 && bad "an engine channel signed with a key the device does not trust was accepted"

[ $fail -eq 0 ] && echo "agent_ota: ok"
exit $fail
