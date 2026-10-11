#!/bin/sh
# Sprite atlases and zinc:sprite (ZN-438, docs/plugins/sprite.md) on tests/data/sprite_atlas, whose raster sources make.py writes: PNG frames
# with transparent borders and a translucent texel, an @2x one, numbered ones, a TexturePacker sheet with a trimmed and a rotated frame, an
# Aseprite file with a tag, five frames for pages of 32 texels. zinc run builds the atlases into its dev packs; their tables are expected.txt
# (trimmed offsets, pages cut to their frames or to powers of two, animations of tags, sheets and numbered files, frameAt); at pixel scales 1
# and 2 every frame drawn from the atlas, at whole and fractional positions and scaled, is the loose image's pixels, and the sheet's and the
# Aseprite file's frames are their sources' texels (check.py); the interpreter and QuickJS draw the native build's frame; without packs
# (ZINC_PACKS="") zinc:sprite draws the loose images, the same pixels.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
unset ZINC_ASSETS ZINC_PACKS
p="$tmp/p"
cp -R tests/data/sprite_atlas "$p" && rm -f "$p/make.py" "$p/check.py" "$p/expected.txt"
python3 tests/data/sprite_atlas/make.py "$p" > "$tmp/pixels.json" || exit 1
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=256x96 ZINC_FRAMES=2 ZINC_FRAMEHASH=last"
for s in 1 2; do
  (cd "$p" && env $env ZINC_SCALE=$s ZINC_SHOT="$tmp/shot$s.png" "$Z" run . >"$tmp/out$s.txt" 2>"$tmp/err$s.txt") || { echo "sprite_atlas: the run failed"; head -20 "$tmp/err$s.txt"; exit 1; }
  python3 tests/data/sprite_atlas/check.py "$tmp/shot$s.png" "$tmp/pixels.json" "$tmp/out$s.txt" >"$tmp/check$s.txt" || { cat "$tmp/check$s.txt"; exit 1; }
done
grep -v '^at ' "$tmp/out1.txt" | diff tests/data/sprite_atlas/expected.txt - >"$tmp/diff" || { echo "sprite_atlas: the atlas tables differ from expected.txt"; head -20 "$tmp/diff"; exit 1; }
want=$(grep framehash "$tmp/err1.txt" | awk '{print $5}')
for engine in --interp "--engine quickjs"; do
  got=$(cd "$p" && env $env ZINC_SCALE=1 "$Z" run . $engine 2>&1 | grep framehash | awk '{print $5}')
  [ -n "$want" ] && [ "$got" = "$want" ] || { echo "sprite_atlas: $engine draws $got, the native build $want"; exit 1; }
done
(cd "$p" && env $env ZINC_PACKS= ZINC_SCALE=1 ZINC_SHOT="$tmp/loose.png" "$Z" run . >"$tmp/loose.txt" 2>&1) || { echo "sprite_atlas: the run without packs failed"; head -20 "$tmp/loose.txt"; exit 1; }
grep -q '^atlas sprites: 0 page(s)$' "$tmp/loose.txt" || { echo "sprite_atlas: without packs the atlas still has pages"; exit 1; }
python3 tests/data/sprite_atlas/check.py "$tmp/loose.png" "$tmp/pixels.json" "$tmp/loose.txt" >"$tmp/check3.txt" || { echo "sprite_atlas: without packs: $(cat "$tmp/check3.txt")"; exit 1; }
echo "sprite_atlas: ok ($(cat "$tmp/check1.txt"); $(cat "$tmp/check2.txt"); interpreter and QuickJS $want; without packs the loose images)"
