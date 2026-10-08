#!/bin/sh
# Signed update manifests (ZN-149): a manifest signed with the release key is accepted; a changed line, another key, a malformed signature and a missing signature are refused.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
k=$("$ZINC" update-keygen); seed=$(echo "$k" | sed -n 's/^seed=//p'); pub=$(echo "$k" | sed -n 's/^public=//p')
k2=$("$ZINC" update-keygen); pub2=$(echo "$k2" | sed -n 's/^public=//p')
printf 'version=99.0.0\nurl=file:///nonexistent/zinc.tar.gz\nsha256=0000000000000000000000000000000000000000000000000000000000000000\nnotes=test\n' > "$t/m.txt"
"$ZINC" update-sign "$t/m.txt" "$seed" > "$t/signed.txt" || { echo "update-sign failed"; exit 1; }
check() { ZINC_UPDATE_PUBKEY="$1" "$ZINC" update --check "file://$2" 2>&1; }
out=$(check "$pub" "$t/signed.txt"); [ $? = 10 ] || { echo "a correctly signed manifest was not accepted: $out"; exit 1; }
sed 's/notes=test/notes=evil/' "$t/signed.txt" > "$t/tampered.txt"
out=$(check "$pub" "$t/tampered.txt"); echo "$out" | grep -q "does not verify" || { echo "a tampered manifest was not refused: $out"; exit 1; }
out=$(check "$pub2" "$t/signed.txt"); echo "$out" | grep -q "does not verify" || { echo "a manifest signed by another key was not refused: $out"; exit 1; }
sed 's/^sig=\(..\)/sig=00/' "$t/signed.txt" > "$t/bad.txt"
out=$(check "$pub" "$t/bad.txt"); echo "$out" | grep -q "does not verify" || { echo "a bad signature was not refused: $out"; exit 1; }
out=$(check "$pub" "$t/m.txt"); echo "$out" | grep -q "not signed" || { echo "an unsigned manifest was not refused: $out"; exit 1; }
out=$(ZINC_UPDATE_PUBKEY= "$ZINC" update --check "file://$t/signed.txt" 2>&1); echo "$out" | grep -q "no trusted update key" || { echo "no trusted key must refuse: $out"; exit 1; }
echo "update_sign: ok"
