#!/bin/sh
# Revocations (ZN-345): the index's revocations.json (signed by the top-level role) revokes greet 1.0 (reason, replacement) and publisher acme's key.
# zinc install refuses the revoked version; zinc run of the project that still has it warns with the reason and the replacement; zinc add of the version is
# refused; and with acme's key revoked, its delegated role signs nothing, so acme's plugin cannot be found or added.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for p in greet widget; do
  mkdir -p "$tmp/$p" && printf '{ "name": "%s", "kind": "module", "module": "zinc:%s", "entry": "index.ts", "version": "1.0" }\n' $p $p > "$tmp/$p/plugin.json"
  echo "export function hi(): string { return 'hi'; }" > "$tmp/$p/index.ts"
  (cd "$tmp/$p" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
done
python3 - "$PWD/tools/index-repo" "$tmp" "$(git -C "$tmp/widget" rev-parse HEAD)" <<'PY' || exit 1
import importlib.machinery, importlib.util, json, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, widget = sys.argv[2], sys.argv[3]
keys = {r: [ir.keygen()] for r in ir.ROLES}; acme = ir.keygen()
deleg = {"keys": {ir.keyid(acme["public"]): ir.key_obj(acme["public"])}, "roles": [{"name": "acme", "keyids": [ir.keyid(acme["public"])], "threshold": 1, "paths": ["acme/*/*"], "terminating": True}]}
desc = json.dumps({"kind": "plugin", "name": "widget", "source": {"repository": "file://" + tmp + "/widget", "commit": widget}}).encode()
am = ir.metadata("targets", 1, 30, targets={"acme/plugins/widget.json": ir.target_entry(desc)})
def build(name, revocations):
    t = {"acme/plugins/widget.json": (desc, None)}
    if revocations is not None: t["revocations.json"] = (json.dumps(revocations).encode(), None)
    ir.build(tmp + "/" + name, keys, t, delegations=deleg, extra_roles={"acme": (am, [acme["seed"]])})
build("clean", {"versions": [], "keys": []})
build("revoked", {"versions": [{"plugin": "greet", "version": "1.0", "reason": "it leaks tokens", "replacement": "greet 1.1"}],
                  "keys": [{"publicKey": acme["public"], "reason": "acme's key was stolen"}]})
PY
mkdir -p "$tmp/proj"; echo '{ "name": "app", "entry": "main.ts" }' > "$tmp/proj/zinc.json"
printf "import { hi } from 'zinc:greet';\nconsole.log(hi());\n" > "$tmp/proj/main.ts"
use() { export ZINC_INDEX_URL="file://$tmp/$1" ZINC_INDEX_ROOT="$tmp/$1/root.json" ZINC_HOME="$tmp/home-$1"; }
use clean
"$Z" add "file://$tmp/greet" "$tmp/proj" >/dev/null 2>&1 || { echo "revocation: zinc add before any revocation failed"; fail=1; }
"$Z" add widget "$tmp/proj" 2>&1 | grep -q "tier verified, publisher acme" || { echo "revocation: acme's plugin is not found before its key is revoked"; fail=1; }
use revoked
out=$("$Z" install "$tmp/proj" 2>&1) && { echo "revocation: a revoked version was installed: $out"; fail=1; }
echo "$out" | grep -q "greet 1.0 is revoked: it leaks tokens; use greet 1.1 instead" || { echo "revocation: install does not say why: $out"; fail=1; }
out=$(cd "$tmp/proj" && "$Z" run main.ts 2>&1)
echo "$out" | grep -q "warning: plugin greet 1.0 is revoked: it leaks tokens; use greet 1.1 instead" && echo "$out" | grep -q "^hi$" || { echo "revocation: zinc run does not warn about the installed revoked version: $out"; fail=1; }
"$Z" add "file://$tmp/greet" "$tmp/proj" 2>&1 | grep -q "is revoked" || { echo "revocation: zinc add of a revoked version is not refused"; fail=1; }
out=$("$Z" add widget "$tmp/proj" 2>&1) && { echo "revocation: a plugin signed only by a revoked key was added: $out"; fail=1; }
echo "$out" | grep -q "no plugin 'widget' in the index" || { echo "revocation: the revoked key's plugin: $out"; fail=1; }
exit $fail
