#!/bin/sh
# zinc.lock (ZN-344): zinc add pins source, version, tier and the capabilities plugin.json "permissions" asks for in zinc.lock, and the dependency in zinc.json;
# a second checkout installs exactly the locked bytes; an update asking for a new capability is refused (and named) until --accept; zinc install --frozen
# fails when zinc.json and zinc.lock disagree; a lock left inside zinc.json by an older zinc is still read and moved out.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HOME="$tmp/home"
g() { git -C "$tmp/greet" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/greet" "$tmp/a" "$tmp/b"
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts", "version": "1.0", "permissions": ["net"] }\n' > "$tmp/greet/plugin.json"
echo "export const v = 1;" > "$tmp/greet/index.ts"
g init -q && g add . && g commit -qm one || exit 2
echo '{ "name": "app" }' > "$tmp/a/zinc.json"
out=$("$Z" add "file://$tmp/greet" "$tmp/a" 2>&1) || { echo "plugin_lock: zinc add failed: $out"; exit 1; }
echo "$out" | grep -q "greet: asks for the capabilities net" || { echo "plugin_lock: the capabilities are not shown: $out"; fail=1; }
python3 - "$tmp/a" "$tmp/greet" <<'PY' || fail=1
import json, sys
lock, cfg = json.load(open(sys.argv[1] + "/zinc.lock")), json.load(open(sys.argv[1] + "/zinc.json"))
e = lock["plugins"]["greet"]
assert e["permissions"] == ["net"] and e["version"] == "1.0" and e["requested"] == "file://" + sys.argv[2] and len(e["commit"]) == 40, e
assert cfg["dependencies"] == {"greet": "file://" + sys.argv[2]} and "lock" not in cfg, cfg
PY
cp "$tmp/a/zinc.json" "$tmp/a/zinc.lock" "$tmp/b/"
"$Z" install "$tmp/b" >/dev/null && diff -r "$tmp/a/plugins" "$tmp/b/plugins" >/dev/null || { echo "plugin_lock: a second checkout does not get the locked bytes"; fail=1; }
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts", "version": "1.1", "permissions": ["net", "camera"] }\n' > "$tmp/greet/plugin.json"
g commit -qam two
out=$("$Z" add "file://$tmp/greet" "$tmp/a" 2>&1) && { echo "plugin_lock: an update asking for camera was accepted"; fail=1; }
echo "$out" | grep -q "capabilities the lock does not grant: camera" && echo "$out" | grep -q -- "--accept" || { echo "plugin_lock: the refusal does not name the capability: $out"; fail=1; }
grep -q '"version": "1.0"' "$tmp/a/zinc.lock" && grep -q '"1.0"' "$tmp/a/plugins/greet/plugin.json" || { echo "plugin_lock: the refused update changed something"; fail=1; }
"$Z" add --accept "file://$tmp/greet" "$tmp/a" >/dev/null 2>&1 && grep -q '"camera"' "$tmp/a/zinc.lock" || { echo "plugin_lock: --accept does not grant the capability"; fail=1; }
cp "$tmp/a/zinc.json" "$tmp/a/zinc.lock" "$tmp/b/"
"$Z" install --frozen "$tmp/b" >/dev/null || { echo "plugin_lock: --frozen refuses a project whose files agree"; fail=1; }
python3 -c "import json; p='$tmp/b/zinc.json'; c=json.load(open(p)); c['dependencies']['other']='file:///nowhere/other.tar.gz'; json.dump(c, open(p,'w'))"
"$Z" install --frozen "$tmp/b" >/dev/null 2>"$tmp/err" && { echo "plugin_lock: --frozen installed with a dependency missing from zinc.lock"; fail=1; }
grep -q "other is a dependency but not in zinc.lock" "$tmp/err" || { echo "plugin_lock: --frozen does not say what differs: $(cat "$tmp/err")"; fail=1; }
python3 -c "import json; p='$tmp/b/zinc.json'; c=json.load(open(p)); del c['dependencies']['other']; c['dependencies']['greet']='file:///elsewhere/greet'; json.dump(c, open(p,'w'))"
"$Z" install --frozen "$tmp/b" >/dev/null 2>"$tmp/err" && { echo "plugin_lock: --frozen installed a dependency the lock pins elsewhere"; fail=1; }
grep -q "greet asks for file:///elsewhere/greet" "$tmp/err" || { echo "plugin_lock: --frozen does not name the changed dependency: $(cat "$tmp/err")"; fail=1; }
mkdir -p "$tmp/old" && python3 -c "import json; l=json.load(open('$tmp/a/zinc.lock')); json.dump({'name': 'old', 'lock': {'plugins': l['plugins']}}, open('$tmp/old/zinc.json','w'))"
"$Z" install "$tmp/old" >/dev/null 2>&1 && [ -f "$tmp/old/plugins/greet/plugin.json" ] || { echo "plugin_lock: a lock inside zinc.json is not read"; fail=1; }
"$Z" trust greet "$tmp/old" >/dev/null 2>&1; "$Z" add "file://$tmp/greet" "$tmp/old" >/dev/null 2>&1 && [ -f "$tmp/old/zinc.lock" ] && ! grep -q '"lock"' "$tmp/old/zinc.json" || { echo "plugin_lock: the old lock is not moved to zinc.lock"; fail=1; }
exit $fail
