#!/bin/sh
# The asset build (ZN-434, docs/reports/zinc-next-assets.md): the unit checks (rules, groups, image layouts, cache, stale packs), then
# `zinc assets build` on the game-2d template: a second build imports nothing, a changed image is imported alone, the report lists every
# asset with its bytes and time, two copies in two directories with two ZINC_HOMEs give the same packs, and `zinc bake` reuses its blob.
BUILD=${BUILD:-build}
[ -x "$BUILD/assets_test" ] || { echo "skipped: assets_test is not built"; exit 77; }
out=$("$BUILD/assets_test" 2>&1)
echo "$out" | grep -q 'all checks passed' || { echo "$out" | tail -20; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
imported() { sed -n 's/.*"imported": \([0-9]*\).*/\1/p' "$1/build/assets/macos/report.json" "$1/build/assets/linux/report.json" 2>/dev/null; }
mkdir -p "$tmp/one" "$tmp/two/deeper"
HOME="$tmp/one" ZINC_HOME="$tmp/one/.zinc" "$ZINC" new game-2d "$tmp/one/g2d" >/dev/null || exit 1
cp -R "$tmp/one/g2d" "$tmp/two/deeper/g2d"

one() { (cd "$tmp/one" && HOME="$tmp/one" ZINC_HOME="$tmp/one/.zinc" "$ZINC" "$@"); }
one assets build g2d >/dev/null || exit 1
[ "$(imported "$tmp/one/g2d")" = 3 ] || { echo "first build: $(imported "$tmp/one/g2d") imported, expected 3"; exit 1; }
one assets build g2d >/dev/null || exit 1
[ "$(imported "$tmp/one/g2d")" = 0 ] || { echo "second build of an unchanged project imported $(imported "$tmp/one/g2d")"; exit 1; }
report=$(cat "$tmp/one/g2d"/build/assets/*/report.json)
for a in coin.svg coin.wav player.svg; do
  echo "$report" | grep -q "{\"name\": \"$a\", \"importer\": \"[a-z]*\", \"group\": \"default\", \"sourceBytes\": [1-9][0-9]*, \"outputBytes\": [1-9][0-9]*, \"ms\": [0-9.]*, \"cached\": true, \"packBytes\": [0-9]*[,}]" ||
    { echo "report: no line for $a"; echo "$report"; exit 1; }
done

sed 's/#/#0/' "$tmp/one/g2d/assets/player.svg" > "$tmp/p.svg" && cp "$tmp/p.svg" "$tmp/one/g2d/assets/player.svg"
cmp -s "$tmp/p.svg" "$tmp/two/deeper/g2d/assets/player.svg" && { echo "the edit did not change player.svg"; exit 1; }
one assets build g2d >/dev/null || exit 1
[ "$(imported "$tmp/one/g2d")" = 1 ] || { echo "after one change: $(imported "$tmp/one/g2d") imported, expected 1"; exit 1; }
grep -q '"name": "player.svg", .*"cached": false' "$tmp/one/g2d"/build/assets/*/report.json || { echo "player.svg was not the one imported"; exit 1; }

cp "$tmp/p.svg" "$tmp/two/deeper/g2d/assets/player.svg"
for profile in "" --release; do
  one assets build g2d $profile >/dev/null || exit 1
  (cd "$tmp" && HOME="$tmp/two" ZINC_HOME="$tmp/two/.zinc" "$ZINC" assets build "$tmp/two/deeper/g2d" $profile >/dev/null) || exit 1
  for p in "$tmp/one/g2d"/build/assets/*/*.zpk; do
    cmp -s "$p" "$tmp/two/deeper/g2d/build/assets/$(basename "$(dirname "$p")")/$(basename "$p")" || { echo "two packs of the same project differ ($profile): $p"; exit 1; }
  done
done

# an asset that is a symbolic link (examples/hero/assets/city.bin) is packed under its own name: fs::relative followed the link out of the
# directory and the name started with '..', taken for a hidden file (ZN-436)
ln -s player.svg "$tmp/one/g2d/assets/linked.svg"
one assets build g2d >/dev/null || exit 1
grep -q '"name": "linked.svg"' "$tmp/one/g2d"/build/assets/*/report.json || { echo "the linked asset is not packed"; exit 1; }

# the font baker behind the same cache: the second bake of an unchanged program is the blob of the first (a program with no plugin: a fresh
# ZINC_HOME would build game-2d's audio plugin first)
printf "console.log('baked: \\\\u00e9');\n" > "$tmp/one/p.ts"
ZINC_LOG=build=info one bake p.ts -o "$tmp/1.res" 2>"$tmp/log1" || exit 1
ZINC_LOG=build=info one bake p.ts -o "$tmp/2.res" 2>"$tmp/log2" || exit 1
grep -q 'fonts and images baked' "$tmp/log1" && grep -q 'fonts and images from the asset cache' "$tmp/log2" || { echo "the bake was not reused"; cat "$tmp/log1" "$tmp/log2" | tail -5; exit 1; }
cmp -s "$tmp/1.res" "$tmp/2.res" || { echo "the cached blob differs from the baked one"; exit 1; }
exit 0
