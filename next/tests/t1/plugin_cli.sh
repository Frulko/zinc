#!/bin/sh
# The plugin commands over a local index (ZN-347), end to end: search, add greet@^1.0 (the highest 1.x), install on a clean machine with --frozen, plugins
# update (1.1 -> 1.2, never 2.0), remove; and the errors name the plugin, its version and the reason: a capability, the policy, a revocation, a signature.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
g() { git -C "$tmp/greet" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/greet"; (cd "$tmp/greet" && git init -q) || exit 2
for v in 1.0 1.1 1.2 1.3 2.0; do   # one commit per version; 1.3 asks for the camera
  perms='[]'; [ $v = 1.3 ] && perms='["camera"]'
  printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts", "version": "%s", "permissions": %s, "description": "says hello" }\n' $v "$perms" > "$tmp/greet/plugin.json"
  echo "export const v = '$v';" > "$tmp/greet/index.ts"; g add -A && g commit -qm "v$v" && g rev-parse HEAD > "$tmp/commit-$v"
done
index() {   # index <versions...>: the index of those versions of greet; REVOKE=<version> revokes one
  python3 - "$PWD/tools/index-repo" "$tmp" "${REVOKE:-}" "$@" <<'PY' || exit 1
import importlib.machinery, importlib.util, json, os, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, revoke, versions = sys.argv[2], sys.argv[3], sys.argv[4:]
kf = tmp + "/keys.json"
keys = json.load(open(kf)) if os.path.exists(kf) else {r: [ir.keygen()] for r in ir.ROLES}
json.dump(keys, open(kf, "w"))
t = {}
for v in versions:
    d = {"kind": "plugin", "name": "greet", "version": v, "description": "says hello", "targets": ["macos", "linux"], "source": {"repository": "file://" + tmp + "/greet", "commit": open(tmp + "/commit-" + v).read().strip()}}
    t["plugins/greet/%s.json" % v] = (json.dumps(d).encode(), {k: d[k] for k in ("kind", "name", "version", "description", "targets")})
t["revocations.json"] = (json.dumps({"versions": [{"plugin": "greet", "version": revoke, "reason": "it crashes on start", "replacement": "1.3"}] if revoke else [], "keys": []}).encode(), None)
v = json.load(open(tmp + "/v")) + 1 if os.path.exists(tmp + "/v") else 1
json.dump(v, open(tmp + "/v", "w"))
ir.build(tmp + "/index", keys, t, version=v, root_file=(tmp + "/index/root.json") if os.path.exists(tmp + "/index/root.json") else None)
PY
}
export ZINC_INDEX_URL="file://$tmp/index" ZINC_INDEX_ROOT="$tmp/root.json" ZINC_HOME="$tmp/home"
index 1.0 1.1 2.0 && cp "$tmp/index/root.json" "$tmp/root.json"
"$Z" plugins search hello | grep -q "^plugin  *greet 1.1 " || { echo "plugin_cli: search does not list greet 1.1"; fail=1; }
mkdir -p "$tmp/app"; echo '{ "name": "app" }' > "$tmp/app/zinc.json"
"$Z" add "greet@^1.0" "$tmp/app" | grep -q "^greet 1.1: tier official" || { echo "plugin_cli: add greet@^1.0 did not take 1.1"; fail=1; }
grep -q '"greet": "greet@^1.0"' "$tmp/app/zinc.json" && grep -q '"version": "1.1"' "$tmp/app/zinc.lock" || { echo "plugin_cli: the dependency or the lock is wrong"; fail=1; }
mkdir -p "$tmp/clean" && cp "$tmp/app/zinc.json" "$tmp/app/zinc.lock" "$tmp/clean/"
ZINC_HOME="$tmp/clean-home" "$Z" install --frozen "$tmp/clean" >/dev/null && diff -r "$tmp/app/plugins" "$tmp/clean/plugins" >/dev/null || { echo "plugin_cli: a clean machine does not install the same bytes"; fail=1; }
index 1.0 1.1 1.2 2.0
out=$(cd "$tmp/app" && "$Z" plugins update 2>&1)
echo "$out" | grep -q "^greet 1.1 -> 1.2$" && grep -q "'1.2'" "$tmp/app/plugins/greet/index.ts" || { echo "plugin_cli: update did not move to 1.2 (and not 2.0): $out"; fail=1; }
[ -z "$(cd "$tmp/app" && "$Z" plugins update 2>&1)" ] || { echo "plugin_cli: an update with nothing new says something"; fail=1; }
index 1.0 1.1 1.2 1.3 2.0
out=$(cd "$tmp/app" && "$Z" plugins update 2>&1) && { echo "plugin_cli: the update asking for the camera passed"; fail=1; }
echo "$out" | grep -q "zinc add: greet 1.3: plugin greet now asks for capabilities the lock does not grant: camera" || { echo "plugin_cli: the capability error does not name plugin, version, reason: $out"; fail=1; }
REVOKE=1.2 index 1.0 1.1 1.2 1.3 2.0
out=$(ZINC_HOME="$tmp/clean-home" "$Z" install "$tmp/app" 2>&1) && { echo "plugin_cli: a revoked version was installed"; fail=1; }
echo "$out" | grep -q "greet 1.2 is revoked: it crashes on start; use 1.3 instead" || { echo "plugin_cli: the revocation error: $out"; fail=1; }
mkdir -p "$tmp/strict"; echo '{ "name": "s", "policy": {"tiers": ["verified"]} }' > "$tmp/strict/zinc.json"
out=$("$Z" add "greet@~1.1" "$tmp/strict" 2>&1) && { echo "plugin_cli: the policy did not refuse an official plugin"; fail=1; }
echo "$out" | grep -q "zinc add: greet 1.1: the trust policy accepts only verified" || { echo "plugin_cli: the policy error: $out"; fail=1; }
mkdir -p "$tmp/arch/greet" && cp "$tmp/greet/index.ts" "$tmp/arch/greet/" && "$Z" update-keygen > "$tmp/k" && pub=$(sed -n 's/^public=//p' "$tmp/k")
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts", "version": "9.9", "publisher": {"name": "eve", "publicKey": "%s"} }\n' "$pub" > "$tmp/arch/greet/plugin.json"
tar -czf "$tmp/greet-9.9.tar.gz" -C "$tmp/arch" greet && printf '%0128d\n' 0 > "$tmp/greet-9.9.tar.gz.sig"
mkdir -p "$tmp/sig"; echo '{ "name": "s" }' > "$tmp/sig/zinc.json"
out=$("$Z" add "file://$tmp/greet-9.9.tar.gz" "$tmp/sig" 2>&1) && { echo "plugin_cli: a bad signature was accepted"; fail=1; }
echo "$out" | grep -q "zinc add: greet 9.9: the signature .* does not verify" || { echo "plugin_cli: the signature error: $out"; fail=1; }
"$Z" remove greet "$tmp/app" && [ ! -d "$tmp/app/plugins/greet" ] && ! grep -q greet "$tmp/app/zinc.json" "$tmp/app/zinc.lock" || { echo "plugin_cli: remove left greet behind"; fail=1; }
exit $fail
