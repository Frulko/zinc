#!/bin/sh
# The font importer (ZN-442, src/assets/font.h): a rule `"as": "font", "charset": ["ascii", "i18n/*.json"], "sdf": "msdf"` subsets Inter to
# ASCII and the characters of an i18n JSON file's strings (107 in all; the report says so), and its MSDF atlas draws them (zinc:gfx/msdf); a
# charset item that is neither a named set nor a file fails the build. A 12 px label drawn 8 times larger, directly and through setTransform,
# is as sharp as Inter rasterized at 96 px (SSIM 0.99 or more against that reference: a resampled bitmap is not).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
here=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
unset ZINC_ASSETS ZINC_PACKS
p="$tmp/p"; cp -R tests/data/font_assets "$p" && mkdir -p "$p/assets/fonts" && cp lib/fonts/Inter-Regular.ttf "$p/assets/fonts/Inter.ttf"
(cd "$p" && "$Z" assets build . >"$tmp/build.txt" 2>&1) || { echo "font_assets: the build failed"; cat "$tmp/build.txt"; exit 1; }
grep -q '"name": "fonts/Inter.ttf", "importer": "font", .*"format": "msdf", "gpuBytes": [1-9][0-9]*, "glyphs": 107}' "$p"/build/assets/*/report.json ||
  { echo "font_assets: the report does not list the font with its atlas and 107 characters"; grep Inter "$p"/build/assets/*/report.json; exit 1; }
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=240x160 ZINC_FRAMES=2"
for m in ref msdf turned; do
  (cd "$p" && env $env FONT_MODE=$m ZINC_SHOT="$tmp/$m.png" timeout 60 "$Z" run . --interp >"$tmp/$m.txt" 2>&1) || { echo "font_assets: the $m run failed"; tail -5 "$tmp/$m.txt"; exit 1; }
done
grep -q '^Ł true П true ж false$' "$tmp/msdf.txt" || { echo "font_assets: the atlas does not hold the i18n file's characters alone"; grep -v '^ ' "$tmp/msdf.txt"; exit 1; }
for m in msdf turned; do
  python3 "$here/tools/pngdiff" "$tmp/ref.png" "$tmp/$m.png" --ssim 0.99 >"$tmp/$m.diff" || { echo "font_assets: the $m label is not the font at 96 px"; cat "$tmp/$m.diff"; exit 1; }
done
python3 tests/data/font_assets/edges.py "$tmp/ref.png" "$tmp/msdf.png" "$tmp/turned.png" >"$tmp/edges.txt" || { echo "font_assets: a label scaled 8x is blurred"; cat "$tmp/edges.txt"; exit 1; }
sed 's/"i18n\/\*.json"/"i18n\/*.po"/' tests/data/font_assets/zinc.json > "$p/zinc.json"
(cd "$p" && "$Z" assets build . >"$tmp/bad.txt" 2>&1) && { echo "font_assets: a charset glob that matches nothing did not fail the build"; exit 1; }
grep -q 'fonts/Inter.ttf: charset "i18n/\*.po" is neither a named set' "$tmp/bad.txt" || { echo "font_assets: the error does not name the item"; cat "$tmp/bad.txt"; exit 1; }
echo "font_assets: ok ($(grep -o 'ssim [0-9.]*' "$tmp/msdf.diff"), turned $(grep -o 'ssim [0-9.]*' "$tmp/turned.diff"))"
