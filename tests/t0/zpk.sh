#!/bin/sh
# ZPK packs (ZN-433, docs/zpk.md): a 10 000-entry round trip through every codec, the reader's refusals, and two packs of the same files
# made from two directories with two homes are byte-identical.
BUILD=${BUILD:-build}
[ -x "$BUILD/zpk_test" ] || { echo "skipped: zpk_test is not built"; exit 77; }
out=$("$BUILD/zpk_test" 2>&1)
echo "$out" | grep -q 'all checks passed' || { echo "$out" | tail -20; exit 1; }
bin=$(cd "$BUILD" && pwd)/zpk_test
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for d in one two/deeper; do mkdir -p "$tmp/$d/assets" "$tmp/home-${d%%/*}"; cp -R tests/data/images lib/std "$tmp/$d/assets/"; done
(cd "$tmp/one" && HOME="$tmp/home-one" ZINC_HOME="$tmp/home-one/.zinc" "$bin" pack assets "$tmp/1.zpk") || exit 1
(cd "$tmp" && HOME="$tmp/home-two" ZINC_HOME="$tmp/home-two/.zinc" "$bin" pack "$tmp/two/deeper/assets" "$tmp/2.zpk") || exit 1
[ -s "$tmp/1.zpk" ] || { echo "no pack written"; exit 1; }
cmp -s "$tmp/1.zpk" "$tmp/2.zpk" || { echo "two packs of the same files differ"; exit 1; }
