#!/bin/sh
# The trust policy (ZN-346): each key changes what is installed — tiers (a community plugin refused), prebuilt (source only: built instead of fetched),
# rebuilds (3 asked, 2 matched: built), transparency (required, no log key: built), mirrors (a mirror the policy does not list is never asked); a system
# policy is not loosened by the project's zinc.json; zinc doctor prints each value and where it comes from. Skipped (77) without the pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
zig=${ZINC_ZIG:-$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)}
[ -x "$zig" ] || { echo "trust_policy: no pinned zig downloaded"; exit 77; }
export ZINC_ZIG="$zig"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/greet" && printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts" }\n' > "$tmp/greet/plugin.json" && echo "export const g = 1;" > "$tmp/greet/index.ts"
(cd "$tmp/greet" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
mkdir -p "$tmp/proj"; echo '{ "name": "policy" }' > "$tmp/proj/zinc.json"
out=$(ZINC_HOME="$tmp/pub" "$Z" plugin-build device "$tmp/proj" --pack "$tmp/device.tar" 2>&1) || { echo "trust_policy: the publisher build failed: $out"; exit 1; }
key=$(echo "$out" | sed -n 's#.*/plugins/device-\([0-9a-f]*\)/.*#\1#p' | head -1); t=$(tar tf "$tmp/device.tar" | head -1 | cut -d/ -f1)
python3 - "$PWD/tools/index-repo" "$tmp" "$t" "$key" <<'PY' || exit 1
import hashlib, importlib.machinery, importlib.util, json, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, target, key = sys.argv[2:5]
keys = {r: [ir.keygen()] for r in ir.ROLES}; acme = ir.keygen()
tar = open(tmp + "/device.tar", "rb").read(); sha = hashlib.sha256(tar).hexdigest()
ir.build(tmp + "/official", keys, {"binaries/%s/device-%s.tar" % (target, key): (tar, None)})
deleg = {"keys": {ir.keyid(acme["public"]): ir.key_obj(acme["public"])}, "roles": [{"name": "acme", "keyids": [ir.keyid(acme["public"])], "threshold": 1, "paths": ["acme/*/*/*"], "terminating": True}]}
p = "acme/binaries/%s/device-%s.tar" % (target, key)
am = ir.metadata("targets", 1, 30, targets={p: ir.target_entry(tar)})
ir.build(tmp + "/verified", keys, {p: (tar, None), "rebuilds/%s.json" % sha: (json.dumps({"matches": 2}).encode(), None)}, delegations=deleg, extra_roles={"acme": (am, [acme["seed"]])})
PY
use() { export ZINC_INDEX_URL="file://$tmp/$1" ZINC_INDEX_ROOT="$tmp/$1/root.json"; }
pb() { ZINC_HOME="$tmp/h-$1" "$Z" plugin-build device "$2" 2>&1; }
policy() { python3 -c "import json,sys; p='$1'; c=json.load(open(p)) if p.endswith('zinc.json') else {}; c.update({'policy': json.loads(sys.argv[1])} if p.endswith('zinc.json') else json.loads(sys.argv[1])); json.dump(c, open(p,'w'))" "$2"; }
mk() { rm -rf "$tmp/$1"; mkdir -p "$tmp/$1"; echo '{ "name": "p" }' > "$tmp/$1/zinc.json"; }
# tiers
mk tiers; policy "$tmp/tiers/zinc.json" '{"tiers": ["official", "verified"]}'
ZINC_HOME="$tmp/h-tiers" "$Z" add "file://$tmp/greet" "$tmp/tiers" > "$tmp/out" 2>&1 && { echo "trust_policy: a community plugin was added under tiers official, verified"; fail=1; }
grep -q "accepts only official, verified (project" "$tmp/out" || { echo "trust_policy: the tier refusal does not say why: $(cat "$tmp/out")"; fail=1; }
mk tiers2; ZINC_HOME="$tmp/h-tiers2" "$Z" add "file://$tmp/greet" "$tmp/tiers2" >/dev/null 2>&1 || { echo "trust_policy: the default policy refuses community"; fail=1; }
# prebuilt (a user policy)
use official
mk pre; pb pre-default "$tmp/pre" | grep -q "^device fetched " || { echo "trust_policy: the official binary is not used by default"; fail=1; }
mkdir -p "$tmp/h-pre"; echo '{"prebuilt": false}' > "$tmp/h-pre/policy.json"
pb pre "$tmp/pre" | grep -q "^device built " || { echo "trust_policy: prebuilt false still fetched the binary"; fail=1; }
# transparency
mk tr; policy "$tmp/tr/zinc.json" '{"transparency": "required"}'
pb tr "$tmp/tr" | grep -q "requires the transparency log" || { echo "trust_policy: transparency required used a binary with no log key"; fail=1; }
# rebuilds
use verified
mk rb; pb rb-default "$tmp/rb" | grep -q "^device fetched " || { echo "trust_policy: 2 matching rebuilds do not meet the default"; fail=1; }
policy "$tmp/rb/zinc.json" '{"rebuilds": 3}'
pb rb "$tmp/rb" | grep -q "2 matching rebuild(s) of the 3 required" || { echo "trust_policy: rebuilds 3 used a binary with 2"; fail=1; }
# mirrors (a user policy): the index's binary from mirrors only, m1 is not allowed
use official
for m in m1 m2; do mkdir -p "$tmp/$m/index/targets/binaries/$t"; cp "$tmp/official/targets/binaries/$t/device-$key.tar" "$tmp/$m/index/targets/binaries/$t/"; done
printf 'X' | dd of="$tmp/m1/index/targets/binaries/$t/device-$key.tar" bs=1 seek=700 conv=notrunc 2>/dev/null
mk mi; out=$(ZINC_MIRRORS="file://$tmp/m1 file://$tmp/m2" pb mi-default "$tmp/mi")
echo "$out" | grep -q "m1/index/targets" || { echo "trust_policy: without a mirror policy m1 was not asked: $out"; fail=1; }
mkdir -p "$tmp/h-mi"; printf '{"mirrors": ["file://%s/m2"]}' "$tmp" > "$tmp/h-mi/policy.json"
out=$(ZINC_MIRRORS="file://$tmp/m1 file://$tmp/m2" pb mi "$tmp/mi")
echo "$out" | grep -q "m1/index" && { echo "trust_policy: a mirror the policy does not list was asked: $out"; fail=1; }
echo "$out" | grep -q "^device fetched " || { echo "trust_policy: the allowed mirror did not serve: $out"; fail=1; }
# a system policy the project cannot loosen; doctor says where each value comes from
mk sys; policy "$tmp/sys/zinc.json" '{"tiers": ["official", "verified", "community"], "prebuilt": true, "rebuilds": 1}'
echo '{"tiers": ["official"], "prebuilt": false, "rebuilds": 4}' > "$tmp/system-policy.json"
export ZINC_SYSTEM_POLICY="$tmp/system-policy.json"
ZINC_HOME="$tmp/h-sys" "$Z" add "file://$tmp/greet" "$tmp/sys" > "$tmp/out" 2>&1 && { echo "trust_policy: the project loosened the system's tiers"; fail=1; }
grep -q "accepts only official (system $tmp/system-policy.json)" "$tmp/out" || { echo "trust_policy: the refusal does not name the system policy: $(cat "$tmp/out")"; fail=1; }
out=$(cd "$tmp/sys" && ZINC_HOME="$tmp/h-sys" "$Z" doctor 2>&1)
echo "$out" | grep -q "tiers *official  (system $tmp/system-policy.json)" && echo "$out" | grep -q "prebuilt *source only  (system" && echo "$out" | grep -q "rebuilds *4  (system" && echo "$out" | grep -q "mirrors *any (ZINC_MIRRORS)  (default)" || { echo "trust_policy: doctor does not print the effective policy: $(echo "$out" | tail -7)"; fail=1; }
exit $fail
