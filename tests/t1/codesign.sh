#!/bin/sh
# Code signing (ZN-321). macOS: `zinc export` of tests/golden/permissions (camera and a network address added) signs the .app ad hoc, then with a
# test identity (a self-signed code signing certificate in a temporary keychain, put in the search list for the test and taken out after) given by
# zinc.json "signing": codesign --verify --strict passes both times, the test identity's signature has the hardened runtime, the entitlements
# follow "permissions" (camera, network client) and the export prints the notarization commands. Artifacts: --key writes <file>.sig, zinc verify
# accepts it, a changed byte and another key are refused. spctl --assess needs a Developer ID and notarization: printed, not required.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "codesign: macOS only"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
kc="$tmp/test.keychain"
old=$(security list-keychains -d user | tr -d '"' | xargs)
trap 'security list-keychains -d user -s $old; security delete-keychain "$kc" 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
cp -R tests/golden/permissions "$tmp/p"
python3 - "$tmp/p/zinc.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d['permissions'] += ['camera']; d['app'] = {'id': 'com.example.signed', 'name': 'Signed'}; json.dump(d, open(p, 'w'))
PY
app="$tmp/p/dist/permissions-macos/permissions.app"
ents() { codesign -d --entitlements - "$app" 2>/dev/null | tr -d '\n'; }
# 1. ad hoc, with the update key's signatures
keys=$("$Z" update-keygen); seed=$(echo "$keys" | sed -n 's/^seed=//p'); pub=$(echo "$keys" | sed -n 's/^public=//p')
other=$("$Z" update-keygen | sed -n 's/^public=//p')
out=$(cd "$tmp/p" && "$Z" export . --target macos --key "$seed" 2>&1) || { echo "export failed: $out"; exit 1; }
codesign --verify --strict "$app" 2>&1 || { echo "ad hoc: codesign --verify --strict fails"; fail=1; }
ents | grep -q 'com.apple.security.device.camera' && ents | grep -q 'com.apple.security.network.client' || { echo "ad hoc: entitlements missing: $(ents)"; fail=1; }
ents | grep -q 'network.server' && { echo "ad hoc: net:127.0.0.1 does not listen, so no network.server: $(ents)"; fail=1; }
exe="$tmp/p/dist/permissions-macos/permissions"
"$Z" verify "$exe" --key "$pub" >/dev/null || { echo "zinc verify refuses the export's own signature: $out"; fail=1; }
"$Z" verify "$exe" --key "$other" >/dev/null 2>&1 && { echo "zinc verify accepts another key"; fail=1; }
cp "$exe" "$tmp/changed"; cp "$exe.sig" "$tmp/changed.sig"
printf 'Z' | dd of="$tmp/changed" bs=1 seek=4096 conv=notrunc 2>/dev/null
"$Z" verify "$tmp/changed" --key "$pub" >/dev/null 2>&1 && { echo "zinc verify accepts a changed byte"; fail=1; }
# 2. a test identity from zinc.json "signing": hardened runtime, the same entitlements, the notarization commands
cat > "$tmp/cs.cnf" <<'CNF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
CN = Zinc Test Signing
[ext]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:false
CNF
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tmp/key.pem" -out "$tmp/cert.pem" -days 2 -config "$tmp/cs.cnf" >/dev/null 2>&1
/usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -out "$tmp/id.p12" -passout pass:zinc >/dev/null 2>&1
security create-keychain -p zinc "$kc" && security set-keychain-settings "$kc" && security unlock-keychain -p zinc "$kc" &&
  security import "$tmp/id.p12" -k "$kc" -P zinc -T /usr/bin/codesign >/dev/null && security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k zinc "$kc" >/dev/null ||
  { echo "cannot make the test identity"; exit 1; }
security list-keychains -d user -s "$kc" $old   # codesign finds a private key through the search list only; restored on exit
id=$(security find-identity -p codesigning "$kc" | awk '/Zinc Test Signing/ {print $2; exit}')   # an untrusted identity is named by its SHA-1
python3 - "$tmp/p/zinc.json" "$id" "$kc" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d['signing'] = {'identity': sys.argv[2], 'keychain': sys.argv[3], 'notaryProfile': 'zinc-notary'}; json.dump(d, open(p, 'w'))
PY
out=$(cd "$tmp/p" && "$Z" export . --target macos 2>&1) || { echo "export with the test identity failed: $out"; exit 1; }
codesign --verify --strict "$app" 2>&1 || { echo "test identity: codesign --verify --strict fails"; fail=1; }
info=$(codesign -dvv "$app" 2>&1)
echo "$info" | grep -q "Authority=Zinc Test Signing" || { echo "not signed by the test identity: $info"; fail=1; }
echo "$info" | grep -q "flags=.*runtime" || { echo "no hardened runtime: $info"; fail=1; }
ents | grep -q 'com.apple.security.device.camera' || { echo "test identity: entitlements missing: $(ents)"; fail=1; }
echo "$out" | grep -q "xcrun notarytool submit .*--keychain-profile 'zinc-notary' --wait" && echo "$out" | grep -q "xcrun stapler staple" || { echo "no notarization commands: $out"; fail=1; }
spctl --assess --type execute "$app" >/dev/null 2>&1 && echo "spctl: accepted" || echo "spctl: rejected (expected without a Developer ID and notarization)"
[ $fail -eq 0 ] && echo "codesign: ok"
exit $fail
