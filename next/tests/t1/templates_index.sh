#!/bin/sh
# Templates through the index (ZN-349): zinc new --list adds the index's templates with their tier (official hello, verified acme's fancy), within the trust
# policy; zinc new hello fetches it and pins the plugins its template.json names in the new zinc.lock; a community template (a git URL) is refused under an
# official-only policy and accepted otherwise.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
commit() { (cd "$1" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm one && git rev-parse HEAD) || exit 2; }
mkdir -p "$tmp/greet" && printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts", "version": "1.0" }\n' > "$tmp/greet/plugin.json" && echo "export const g = 1;" > "$tmp/greet/index.ts"
commit "$tmp/greet" > /dev/null
cp -R ../templates/cli "$tmp/tpl"
python3 -c "import json; p='$tmp/tpl/template.json'; t=json.load(open(p)); t['name']='hello'; t['description']='hello with greet'; t['plugins']=['file://$tmp/greet']; json.dump(t, open(p,'w'))"
c=$(commit "$tmp/tpl")
python3 - "$PWD/tools/index-repo" "$tmp" "$c" <<'PY' || exit 1
import importlib.machinery, importlib.util, json, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, c = sys.argv[2], sys.argv[3]
keys = {r: [ir.keygen()] for r in ir.ROLES}; acme = ir.keygen()
def desc(name, d): x = {"kind": "template", "name": name, "description": d, "source": {"repository": "file://" + tmp + "/tpl", "commit": c}}; return json.dumps(x).encode(), {"kind": "template", "name": name, "description": d}
deleg = {"keys": {ir.keyid(acme["public"]): ir.key_obj(acme["public"])}, "roles": [{"name": "acme", "keyids": [ir.keyid(acme["public"])], "threshold": 1, "paths": ["acme/*/*"], "terminating": True}]}
fd, fc = desc("fancy", "a fancy start")
am = ir.metadata("targets", 1, 30, targets={"acme/templates/fancy.json": ir.target_entry(fd, fc)})
ir.build(tmp + "/index", keys, {"templates/hello.json": desc("hello", "hello with greet"), "acme/templates/fancy.json": (fd, fc)}, delegations=deleg, extra_roles={"acme": (am, [acme["seed"]])})
PY
export ZINC_INDEX_URL="file://$tmp/index" ZINC_INDEX_ROOT="$tmp/index/root.json" ZINC_HOME="$tmp/home"
out=$("$Z" new --list 2>&1)
echo "$out" | grep -q "^  hello  *official  *hello with greet" && echo "$out" | grep -q "^  fancy  *verified  *(acme) a fancy start" || { echo "templates_index: --list does not show the index's templates with their tier: $out"; fail=1; }
"$Z" new hello "$tmp/app1" > "$tmp/out" 2>&1 || { echo "templates_index: zinc new hello failed: $(cat "$tmp/out")"; fail=1; }
grep -q "hello: tier official" "$tmp/out" && [ -f "$tmp/app1/plugins/greet/plugin.json" ] && grep -q "\"commit\": \"$(git -C "$tmp/greet" rev-parse HEAD)\"" "$tmp/app1/zinc.lock" && grep -q '"greet":' "$tmp/app1/zinc.json" || { echo "templates_index: the template's plugin is not pinned in the new zinc.lock: $(cat "$tmp/out")"; fail=1; }
mkdir -p "$tmp/home"; echo '{"tiers": ["official"]}' > "$tmp/home/policy.json"
"$Z" new --list 2>&1 | grep -q "fancy" && { echo "templates_index: an official-only policy still lists a verified template"; fail=1; }
"$Z" new "file://$tmp/tpl" "$tmp/app2" > "$tmp/out" 2>&1 && { echo "templates_index: a community template was used under official-only"; fail=1; }
grep -q "accepts only official (user .*), not community: refused" "$tmp/out" || { echo "templates_index: the refusal: $(cat "$tmp/out")"; fail=1; }
rm "$tmp/home/policy.json"
"$Z" new "file://$tmp/tpl" "$tmp/app3" >/dev/null 2>&1 && [ -f "$tmp/app3/zinc.lock" ] || { echo "templates_index: a community template is refused by the default policy"; fail=1; }
exit $fail
