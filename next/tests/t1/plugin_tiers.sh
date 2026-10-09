#!/bin/sh
# Publisher tiers through the index (ZN-340.01): `zinc add <name>` prints the tier and the publisher before installing (official: the top-level role;
# verified: a role delegated to publisher acme for acme/*/* and acme/*/*/*: a * stays within one path segment, as in python-tuf); an official binary is used with no compiler run; a verified publisher's binary is refused
# (built here) until rebuilds/<sha256>.json, signed by the top-level role, counts the 2 matching rebuilds ZINC_REBUILDS_MIN asks, then it is used.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
zig=${ZINC_ZIG:-$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)}
[ -x "$zig" ] || { echo "plugin_tiers: no pinned zig downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/zigw" && ln -s "$(dirname "$zig")/lib" "$tmp/zigw/lib"
printf '#!/bin/sh\ncase "$1" in c++|cc) echo "$1" >> "%s/runs";; esac\nexec "%s" "$@"\n' "$tmp" "$zig" > "$tmp/zigw/zig"; chmod +x "$tmp/zigw/zig"
export ZINC_ZIG="$tmp/zigw/zig"
runs() { wc -l < "$tmp/runs" | tr -d ' '; }
for p in greet widget; do
  mkdir -p "$tmp/$p" && printf '{ "name": "%s", "kind": "module", "module": "zinc:%s", "entry": "index.ts" }\n' $p $p > "$tmp/$p/plugin.json" && echo "export const v = 1;" > "$tmp/$p/index.ts"
  (cd "$tmp/$p" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
done
mkdir -p "$tmp/proj"; echo '{ "name": "tiers" }' > "$tmp/proj/zinc.json"
out=$(ZINC_HOME="$tmp/pub" "$Z" plugin-build device "$tmp/proj" --pack "$tmp/device.tar" 2>&1) || { echo "plugin_tiers: the publisher build failed: $out"; exit 1; }
key=$(echo "$out" | sed -n 's#.*/plugins/device-\([0-9a-f]*\)/.*#\1#p' | head -1); t=$(tar tf "$tmp/device.tar" | head -1 | cut -d/ -f1)
python3 - "$PWD/tools/index-repo" "$tmp" "$t" "$key" "$(git -C "$tmp/greet" rev-parse HEAD)" "$(git -C "$tmp/widget" rev-parse HEAD)" <<'PY' || exit 1
import hashlib, importlib.machinery, importlib.util, json, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, target, key, greet, widget = sys.argv[2:7]
keys = {r: [ir.keygen()] for r in ir.ROLES}; acme = ir.keygen()
tar = open(tmp + "/device.tar", "rb").read()
desc = lambda repo, commit: json.dumps({"kind": "plugin", "name": repo.rsplit("/", 1)[1], "source": {"repository": "file://" + repo, "commit": commit}}).encode()
deleg = {"keys": {ir.keyid(acme["public"]): ir.key_obj(acme["public"])}, "roles": [{"name": "acme", "keyids": [ir.keyid(acme["public"])], "threshold": 1, "paths": ["acme/*/*", "acme/*/*/*"], "terminating": True}]}
acme_targets = {"acme/plugins/widget.json": desc(tmp + "/widget", widget), "acme/binaries/%s/device-%s.tar" % (target, key): tar}
am = ir.metadata("targets", 1, 30, targets={p: ir.target_entry(d) for p, d in acme_targets.items()})
official = {"plugins/greet.json": (desc(tmp + "/greet", greet), None), "binaries/%s/device-%s.tar" % (target, key): (tar, None)}
ir.build(tmp + "/official", keys, official)
verified = {"plugins/greet.json": (desc(tmp + "/greet", greet), None)}; verified.update({p: (d, None) for p, d in acme_targets.items()})
ir.build(tmp + "/verified", keys, verified, delegations=deleg, extra_roles={"acme": (am, [acme["seed"]])})
att = json.dumps({"sha256": hashlib.sha256(tar).hexdigest(), "matches": 2, "rebuilders": ["r1", "r2"]}).encode()
verified["rebuilds/%s.json" % hashlib.sha256(tar).hexdigest()] = (att, None)
ir.build(tmp + "/rebuilt", keys, verified, delegations=deleg, extra_roles={"acme": (am, [acme["seed"]])})
PY
use() { export ZINC_INDEX_URL="file://$tmp/$1" ZINC_INDEX_ROOT="$tmp/$1/root.json" ZINC_HOME="$tmp/home-$1"; : > "$tmp/runs"; }
use official
out=$("$Z" add greet "$tmp/proj" 2>&1)
echo "$out" | grep -q "^greet: tier official, publisher Zinc" && [ -f "$tmp/proj/plugins/greet/plugin.json" ] || { echo "plugin_tiers: zinc add greet: $out"; fail=1; }
out=$("$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device fetched " && [ "$(runs)" = 0 ] || { echo "plugin_tiers: the official binary was not used: $out"; fail=1; }
use verified
out=$("$Z" add widget "$tmp/proj" 2>&1)
echo "$out" | grep -q "^widget: tier verified, publisher acme" && [ -f "$tmp/proj/plugins/widget/plugin.json" ] || { echo "plugin_tiers: zinc add widget: $out"; fail=1; }
grep -q '"tier": "verified"' "$tmp/proj/zinc.json" || { echo "plugin_tiers: the tier is not in the lock"; fail=1; }
out=$("$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "0 matching rebuild(s) of the 2 required: building it here" && echo "$out" | grep -q "^device built " && [ "$(runs)" -gt 0 ] || { echo "plugin_tiers: a verified binary without rebuilds was used: $out"; fail=1; }
use rebuilt
out=$("$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device fetched " && [ "$(runs)" = 0 ] || { echo "plugin_tiers: a verified binary with 2 matching rebuilds was not used: $out"; fail=1; }
exit $fail
