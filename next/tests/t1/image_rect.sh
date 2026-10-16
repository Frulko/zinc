#!/bin/sh
# zinc:gfx sprites (ZN-432): drawImageRect (a source rectangle of an image: mirrored, nearest or linear, alpha, cut at the image's edges) and imageFromBytes.
# tests/data/image_rect/main.ts draws frames of a sprite sheet from the baked image and from the same PNG decoded at run time. The nearest sprites are checked
# against the sheet texel by texel and the two images give the same pixels (check.py); the output and the frame hash are the golden's on the interpreter, QuickJS
# and the AOT build. zinc:canvas's 9-argument drawImage, now on the row, draws the frame its clip around the whole image scaled drew (canvas-golden.png, made
# by the engine before the row existed). Through setTransform (xform.ts: a rotation, a non-uniform scale, both, mirrored, transparency): the software frame is
# xform-golden.png on the interpreter, with the same hash on QuickJS and the AOT build, and the inside of each texel of the nearest sprites is the sheet's
# (xform_check.py takes every pixel back through the matrix). Sprites (ZN-581, sprite.ts: rotation, tint, the four blend modes): the software frame is
# sprite-golden.png, sprite_check.py computes the tinted and blended nearest sprites from the sheet, the same hash on QuickJS and the AOT build.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/data/image_rect
want=$(cat $d/golden.txt)
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_FRAMEHASH=last"
unset ZINC_ASSETS
fail=0
same() { [ "$2" = "$want" ] || { printf '%s:\n%s\nwant:\n%s\n' "$1" "$2" "$want"; fail=1; }; }
hash() { grep framehash | awk '{print $5}'; }
same interpreter "$(env $env ZINC_SHOT="$t/sw.png" "$ZINC" run $d/main.ts 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
python3 $d/check.py "$t/sw.png" $d/assets/sheet.png || fail=1
same quickjs "$(env $env "$ZINC" run $d/main.ts --engine quickjs 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
xi=$(env $env ZINC_SHOT="$t/xform.png" "$ZINC" run $d/xform.ts 2>&1 | hash)
out=$(python3 tools/pngdiff "$t/xform.png" $d/xform-golden.png 2>&1) || { echo "image_rect: the sprites through setTransform differ from xform-golden.png: $out"; fail=1; }
python3 $d/xform_check.py "$t/xform.png" $d/assets/sheet.png >"$t/xform.log" || { cat "$t/xform.log"; fail=1; }
xq=$(env $env "$ZINC" run $d/xform.ts --engine quickjs 2>&1 | hash)
[ -n "$xi" ] && [ "$xq" = "$xi" ] || { echo "image_rect: xform.ts on QuickJS ($xq) is not the interpreter's frame ($xi)"; fail=1; }
si=$(env $env ZINC_SHOT="$t/sprite.png" "$ZINC" run $d/sprite.ts 2>&1 | hash)
out=$(python3 tools/pngdiff "$t/sprite.png" $d/sprite-golden.png 2>&1) || { echo "image_rect: the turned, tinted and blended sprites differ from sprite-golden.png: $out"; fail=1; }
python3 $d/sprite_check.py "$t/sprite.png" $d/assets/sheet.png || { echo "image_rect: the tinted and blended sprites are not the formulas'"; fail=1; }
sq=$(env $env "$ZINC" run $d/sprite.ts --engine quickjs 2>&1 | hash)
[ -n "$si" ] && [ "$sq" = "$si" ] || { echo "image_rect: sprite.ts on QuickJS ($sq) is not the interpreter's frame ($si)"; fail=1; }
if [ -n "$CXX" ] || command -v c++ >/dev/null; then
  "$ZINC" build $d/main.ts -o "$t/app" >"$t/build.log" 2>&1 || { echo "image_rect: AOT build failed: $(head -c 300 "$t/build.log")"; exit 1; }
  same aot "$(env $env ZINC_ASSETS=$d/assets "$t/app" 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
  "$ZINC" build $d/xform.ts -o "$t/xapp" >"$t/build.log" 2>&1 || { echo "image_rect: AOT build of xform.ts failed: $(head -c 300 "$t/build.log")"; exit 1; }
  xa=$(env $env ZINC_ASSETS=$d/assets "$t/xapp" 2>&1 | hash)
  [ "$xa" = "$xi" ] || { echo "image_rect: xform.ts built ($xa) is not the interpreter's frame ($xi)"; fail=1; }
  "$ZINC" build $d/sprite.ts -o "$t/sapp" >"$t/build.log" 2>&1 || { echo "image_rect: AOT build of sprite.ts failed: $(head -c 300 "$t/build.log")"; exit 1; }
  sa=$(env $env ZINC_ASSETS=$d/assets "$t/sapp" 2>&1 | hash)
  [ "$sa" = "$si" ] || { echo "image_rect: sprite.ts built ($sa) is not the interpreter's frame ($si)"; fail=1; }
fi
# the frame diff: a sprite whose source rectangle alone changes at frame 3 is damage, plain (the box's width in the command's off) and through a matrix
# (in the XFORM's payload), in the full diff and in the signatures alike; the frame after it is none
for xf in 0 1; do
  ZINC_XF=$xf ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 ZINC_SHOT_FRAMES=2,3,4 ZINC_SHOT="$t/d$xf.png" ZINC_SCENE_DUMP="$t/d$xf.scn" "$ZINC" run $d/damage.ts >/dev/null 2>&1
  a=$("$ZINC" capture --scene "$t/d$xf-2.scn" --damage "$t/d$xf-3.scn" 2>&1); b=$("$ZINC" capture --scene "$t/d$xf-3.scn" --damage "$t/d$xf-4.scn" 2>&1)
  case "$a" in "damage 1 rects equal"*) a=1 ;; esac; case "$b" in "damage 0 rects equal"*) b=0 ;; esac   # then the union box
  [ "$a" = 1 ] && [ "$b" = 0 ] || { echo "image_rect: damage of a changed source rectangle (matrix $xf): '$a' then '$b', want 1 rect then 0"; fail=1; }
done
ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$t/canvas.png" "$ZINC" run $d/canvas.ts >"$t/canvas.log" 2>&1
out=$(python3 tools/pngdiff "$t/canvas.png" $d/canvas-golden.png 2>&1) || { echo "image_rect: zinc:canvas drawImage with a source rectangle differs from its golden: $out $(head -c 200 "$t/canvas.log")"; fail=1; }
[ $fail -eq 0 ] && echo "image_rect: ok ($(cat "$t/xform.log"))"
exit $fail
