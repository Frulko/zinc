#!/bin/sh
# Community publishers (ZN-340.02): a fork of the device plugin whose plugin.json names publisher Alice and her key is added from a signed archive: zinc add
# prints "tier community, publisher Alice" before installing, pins the key in the lock, and the plugin is built from source. Version 2 signed by another key
# is refused until `zinc trust device`, then pinned; an archive whose .sig is missing is refused.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HOME="$tmp/home" ZINC_PREBUILT=0
"$Z" update-keygen > "$tmp/k1"; "$Z" update-keygen > "$tmp/k2"
s1=$(sed -n 's/^seed=//p' "$tmp/k1"); p1=$(sed -n 's/^public=//p' "$tmp/k1"); s2=$(sed -n 's/^seed=//p' "$tmp/k2"); p2=$(sed -n 's/^public=//p' "$tmp/k2")
pack() {   # pack <n> <public key> <seed or ''>: device-<n>.tar.gz of a fork published by Alice with that key
  rm -rf "$tmp/src" && mkdir -p "$tmp/src" && cp -R ../plugins/device "$tmp/src/device"
  python3 -c "import json,sys; p='$tmp/src/device/plugin.json'; m=json.load(open(p)); m['publisher']={'name':'Alice','publicKey':'$2'}; m['description']+=' (fork $1)'; json.dump(m,open(p,'w'),indent=2)"
  tar -czf "$tmp/device-$1.tar.gz" -C "$tmp/src" device
  [ -z "$3" ] || "$Z" sign "$tmp/device-$1.tar.gz" "$3" >/dev/null
}
mkdir -p "$tmp/proj"; echo '{ "name": "community" }' > "$tmp/proj/zinc.json"
pack 1 "$p1" "$s1"
out=$("$Z" add "file://$tmp/device-1.tar.gz" "$tmp/proj" 2>&1)
echo "$out" | head -1 | grep -q "^device: tier community, publisher Alice (key ${p1%${p1#????????????????}}..., pinned)" || { echo "plugin_community: the first add does not print the tier and publisher first: $out"; fail=1; }
grep -q "\"publicKey\": \"$p1\"" "$tmp/proj/zinc.lock" && grep -q '"tier": "community"' "$tmp/proj/zinc.lock" || { echo "plugin_community: the key is not pinned in the lock"; fail=1; }
"$Z" plugin-build device "$tmp/proj" 2>&1 | grep -q "^device built " || { echo "plugin_community: the community plugin is not built from source"; fail=1; }
pack 2 "$p2" "$s2"
out=$("$Z" add "file://$tmp/device-2.tar.gz" "$tmp/proj" 2>&1) && { echo "plugin_community: a new publisher key was accepted: $out"; fail=1; }
echo "$out" | grep -q "publisher key changed" && echo "$out" | grep -q "zinc trust device" || { echo "plugin_community: the refusal does not say why: $out"; fail=1; }
grep -q "(fork 1)" "$tmp/proj/plugins/device/plugin.json" || { echo "plugin_community: the refused version replaced the installed one"; fail=1; }
"$Z" trust device "$tmp/proj" >/dev/null || { echo "plugin_community: zinc trust failed"; fail=1; }
"$Z" add "file://$tmp/device-2.tar.gz" "$tmp/proj" >/dev/null 2>&1 && grep -q "\"publicKey\": \"$p2\"" "$tmp/proj/zinc.lock" || { echo "plugin_community: after zinc trust the new key is not pinned"; fail=1; }
pack 3 "$p2" ""
"$Z" add "file://$tmp/device-3.tar.gz" "$tmp/proj" >/dev/null 2>&1 && { echo "plugin_community: an archive without its .sig was accepted"; fail=1; }
exit $fail
