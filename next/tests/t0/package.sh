#!/bin/sh
# Packaging (ZN-053): `zinc update` reads a manifest, refuses a download whose checksum differs, keeps a verified one; ZINC_ROOT moves the engine
# files; tools/sign-macos --dry-run lists the signing and notarization steps; the budget file of tools/package is read. The package itself is tests/t2/package.sh.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
echo "package" > "$tmp/Zinc-9.9.9.zip"
sum=$("$ZINC" toolchain sha256 "$tmp/Zinc-9.9.9.zip" | cut -d' ' -f1)
k=$("$ZINC" update-keygen); seed=$(echo "$k" | sed -n 's/^seed=//p'); export ZINC_UPDATE_PUBKEY=$(echo "$k" | sed -n 's/^public=//p')   # manifests are signed (ZN-149)
sign() { "$ZINC" update-sign "$1" "$seed" > "$1.s" && mv "$1.s" "$1"; }
printf 'version=9.9.9\nurl=file://%s/Zinc-9.9.9.zip\nsha256=%s\nnotes=a test release\n' "$tmp" "$sum" > "$tmp/manifest"; sign "$tmp/manifest"
"$ZINC" update --check "file://$tmp/manifest" >"$tmp/out" 2>&1; [ $? -eq 10 ] && grep -q "9.9.9 is available" "$tmp/out" || { echo "zinc update --check does not report a newer release: $(cat "$tmp/out")"; fail=1; }
"$ZINC" update "file://$tmp/manifest" >"$tmp/out" 2>&1 && cmp -s "$tmp/home/updates/Zinc-9.9.9.zip" "$tmp/Zinc-9.9.9.zip" || { echo "zinc update does not keep the verified download: $(cat "$tmp/out")"; fail=1; }
printf 'version=9.9.9\nurl=file://%s/Zinc-9.9.9.zip\nsha256=%064d\n' "$tmp" 0 > "$tmp/bad"; sign "$tmp/bad"
rm -rf "$tmp/home/updates"
"$ZINC" update "file://$tmp/bad" >"$tmp/out" 2>&1; [ $? -eq 1 ] && grep -q "checksum mismatch" "$tmp/out" && [ ! -e "$tmp/home/updates/Zinc-9.9.9.zip" ] || { echo "a download with a wrong checksum is not refused and discarded: $(cat "$tmp/out")"; fail=1; }
printf 'version=0.0.1\nurl=file://%s/Zinc-9.9.9.zip\nsha256=%s\n' "$tmp" "$sum" > "$tmp/same"; sign "$tmp/same"
"$ZINC" update --check "file://$tmp/same" 2>&1 | grep -q "up to date" || { echo "the current version is not reported as up to date"; fail=1; }
[ "$(ZINC_ROOT=/somewhere/else "$ZINC" --root)" = /somewhere/else ] || { echo "ZINC_ROOT does not move the engine files"; fail=1; }
tools/sign-macos --dry-run Zinc-0.0.1-macos-arm64.zip 2>&1 | grep -q "notarytool submit" && tools/sign-macos --dry-run Zinc-0.0.1-macos-arm64.zip 2>&1 | grep -q "stapler staple" || { echo "tools/sign-macos --dry-run does not list the notarization steps"; fail=1; }
grep -q "^BUDGET_MB" tools/package || { echo "tools/package has no size budget"; fail=1; }
exit $fail
