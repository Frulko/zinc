#!/bin/sh
# Tile maps and zinc:tilemap (ZN-443, docs/plugins/tilemap.md) on tests/data/tilemap: a Tiled map (.tmj with an external .tsj: every flip,
# base64 zlib and gzip layers, an offset, a group with opacity, a hidden layer, objects with typed properties) and LDtk's own test project
# levelBgs.ldtk, both on one tileset (sources and licences: tests/data/tilemap/NOTICE). zinc run imports them into its dev packs (their tiles
# into the atlas "tiles"); the levels, layers, objects and properties are expected.txt; the Tiled map, the LDtk level Level_1 and a culled
# view of the Tiled map are the editors' renders in ref/ (check.py: LDtk exact, Tiled within 2); the interpreter and QuickJS draw the native
# build's frame; a .tmx map is refused with what to do.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
unset ZINC_ASSETS ZINC_PACKS
p="$tmp/p"
cp -R tests/data/tilemap "$p" && rm -rf "$p/ref" "$p/check.py" "$p/expected.txt" "$p/NOTICE"
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=644x280 ZINC_FRAMES=2 ZINC_FRAMEHASH=last ZINC_SCALE=1"
(cd "$p" && env $env ZINC_SHOT="$tmp/shot.png" "$Z" run . >"$tmp/out.txt" 2>"$tmp/err.txt") || { echo "tilemap: the run failed"; head -20 "$tmp/err.txt"; exit 1; }
python3 tests/data/tilemap/check.py "$tmp/shot.png" >"$tmp/check.txt" || { cat "$tmp/check.txt"; exit 1; }
grep -v '^time ' "$tmp/out.txt" | diff tests/data/tilemap/expected.txt - >"$tmp/diff" || { echo "tilemap: the levels differ from expected.txt"; head -20 "$tmp/diff"; exit 1; }
want=$(grep framehash "$tmp/err.txt" | awk '{print $5}')
for engine in --interp "--engine quickjs"; do
  got=$(cd "$p" && env $env "$Z" run . $engine 2>&1 | grep framehash | awk '{print $5}')
  [ -n "$want" ] && [ "$got" = "$want" ] || { echo "tilemap: $engine draws $got, the native build $want"; exit 1; }
done
# a Tiled XML map is refused with what to do instead
mkdir -p "$p/assets/x" && printf '<?xml version="1.0"?><map/>' >"$p/assets/x/old.tmx" && sed 's/{tmj,ldtk}/{tmj,tmx,ldtk}/' tests/data/tilemap/zinc.json >"$p/zinc.json"
(cd "$p" && "$Z" assets build . 2>&1) | grep -q 'x/old.tmx: a Tiled XML file: save it as JSON' || { echo "tilemap: a .tmx map is not refused with its advice"; exit 1; }
echo "tilemap: ok ($(cat "$tmp/check.txt"); interpreter and QuickJS $want)"
