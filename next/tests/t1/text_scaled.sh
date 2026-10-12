#!/bin/sh
# zinc:gfx text under a matrix that scales (ZN-726, tests/data/text_scaled): the glyphs are made for the size on screen and the layout is
# the text's own font's.
# - main.ts: lines at ten scales from 0.5 to 4, each over a ruler of its textWidth: the ink of a line is its ruler's within a pixel
#   (widths.py), interpreted and compiled (same frame).
# - sharp.ts enlarges a 16 pixel text 2 and 3 times, direct.ts sets it at 32 and 48 pixels: the frames are alike (ssim 0.99 measured, 0.926
#   when the 16 pixel glyphs were enlarged), and the GL replay draws sharp.ts as the software raster does (the limits of gfx_transform).
# - zoom.ts passes through 300 scales with two families: 24 fonts made for the glyphs (the steps of the ladder), not one per scale.
# - zinc:ui (ui, ui-direct): a Text in a view with `transform: scale 2` draws the lines it has without the transform (the texts of the
#   frames' scene dumps) and looks like the same Text set at twice the size in a view twice as wide (ssim 0.994 measured; 0.759 when ui
#   drew it in the nearest font the program had, here the 16 pixel one).
# A text under a matrix that only turns keeps its frame: tests/t1/gfx_transform.sh (0, 15, 45 and 90 degrees in its golden).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
d=tests/data/text_scaled
shot() {   # name interp|native program WxH [frames]
  env ZINC_RUN=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$4 ZINC_FRAMES=${5:-2} ZINC_SHOT="$tmp/$1.png" "$ZINC" run -q "$d/$3" >"$tmp/$1.log" 2>&1 ||
    { echo "$1: exit $?: $(head -c 300 "$tmp/$1.log")"; fail=1; }
}
shot main interp main.ts 920x1500
python3 $d/widths.py "$tmp/main.png" "$tmp/main.log" || fail=1
shot main-native native main.ts 920x1500
tools/pngdiff "$tmp/main-native.png" "$tmp/main.png" >"$tmp/d" 2>&1 || { echo "main: the compiled frame differs from the interpreted one: $(head -1 "$tmp/d")"; fail=1; }

shot sharp interp sharp.ts 1000x140
shot direct interp direct.ts 1000x140
tools/pngdiff "$tmp/sharp.png" "$tmp/direct.png" --ssim 0.98 >"$tmp/d" 2>&1 || { echo "sharp: the enlarged text is not the text set at its size: $(tr '\n' ' ' <"$tmp/d")"; fail=1; }

shot zoom interp zoom.ts 1000x140 302
python3 - "$tmp/zoom.log" <<'PY' || fail=1
import json, sys
rows = [json.loads(l)["fonts"] for l in open(sys.argv[1]) if l.startswith("{")]
if len(rows) != 1 or not 2 <= rows[0]["active"] <= 24: print("zoom: fonts made for 300 scales of two families: %s (24 at most)" % rows); sys.exit(1)
PY

for v in scaled plain direct; do
  p=$d/ui; [ $v = direct ] && p=$d/ui-direct
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=520x400 ZINC_FRAMES=3 ZINC_SHOT="$tmp/ui-$v.png" ZINC_SCENE_DUMP="$tmp/ui-$v.zscn" "$ZINC" run -q --interp $p -- $v >"$tmp/ui-$v.log" 2>&1 ||
    { echo "ui $v: exit $?: $(head -c 300 "$tmp/ui-$v.log")"; fail=1; }
  python3 tools/scene-texts "$tmp/ui-$v.zscn" > "$tmp/ui-$v.txt"
done
[ "$(wc -l < "$tmp/ui-scaled.txt")" -ge 4 ] && cmp -s "$tmp/ui-scaled.txt" "$tmp/ui-plain.txt" || { echo "ui: the scaled Text does not draw the lines of the plain one: $(tr '\n' '|' < "$tmp/ui-scaled.txt") / $(tr '\n' '|' < "$tmp/ui-plain.txt")"; fail=1; }
tools/pngdiff "$tmp/ui-scaled.png" "$tmp/ui-direct.png" --ssim 0.98 >"$tmp/d" 2>&1 || { echo "ui: the scaled Text is not the Text set at twice the size: $(tr '\n' ' ' <"$tmp/d")"; fail=1; }

ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SCALE=1 ZINC_SIZE=1000x140 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" ZINC_RUN=interp timeout 90 "$ZINC" run -q $d/sharp.ts >"$tmp/gl.log" 2>&1
if [ -s "$tmp/gl.bmp" ]; then
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sharp.png") || { echo "GL: $out"; fail=1; }
  python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("GL: the frame differs from the software one: %s (limits 5%% / 3)" % sys.argv[1]); sys.exit(1)
PY
else echo "GL replay skipped: no GL window here"; fi
[ $fail -eq 0 ] && echo "text scaled: ok"
exit $fail
