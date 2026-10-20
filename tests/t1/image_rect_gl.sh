#!/bin/sh
# zinc:gfx sprites on the GPU (ZN-432): tests/data/image_rect/main.ts drawn by the GL replay (display-gl with ZINC_RENDERER=gl: source rectangles as texture
# coordinates, mirrors, nearest and linear filters on baked and decoded images, alpha of a decoded image) against the software frame rendered at the density of the
# GL window, pixel for pixel: no more than 0.5% of the pixels more than 24 away in a channel and a mean error under 1 (display-gl's tolerance, gl_renderer.sh, is 5%
# and 3; a sprite mirrored the wrong way is 1.4% of this frame). The nearest sprites of the GL frame are also checked against the sheet (check.py).
# Through setTransform (xform.ts: sprites turned, stretched, mirrored): the same comparison with 1% and 1 (the raster smooths a turned edge, the GPU cuts it), and
# the inside of the texels of the GL frame is the sheet's (xform_check.py).
# Sprites (ZN-581, sprite.ts: turned, tinted, the four blend modes): the same comparison with 1% and 1, and the tinted and blended nearest sprites
# of the GL frame are the formulas' (sprite_check.py, 2 of slack: the GPU blends in floats).
# Opens a window: skipped (77) where there is none.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
d=tests/data/image_rect
unset ZINC_ASSETS
fail=0
# both <program> <frame name> <limit in % of the pixels over 24>: the GL frame and the software one at the same density; prints glcompare's line
both() {
  ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$2.bmp" timeout 90 "$ZINC" run $d/$1 >"$tmp/$2.log" 2>&1
  [ -s "$tmp/$2.bmp" ] || return 77
  grep -q "renderer gl:" "$tmp/$2.log" || { echo "ZINC_RENDERER=gl did not start the GL renderer"; return 1; }
  k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // 400)" "$tmp/$2.bmp")   # the density of the GL window
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE="$k" ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$2.png" "$ZINC" run $d/$1 >/dev/null 2>&1
  o=$(python3 tools/glcompare "$tmp/$2.bmp" "$tmp/$2.png") || { echo "$o"; return 1; }
  python3 - "$o" "$3" <<'PY' || return 1
import re, sys
m = re.search(r"scale 1, pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > float(sys.argv[2]) or float(m.group(2)) > 1: print("the GL frame differs from the software frame at the same density: %s (limits %s%% / 1)" % (sys.argv[1], sys.argv[2])); sys.exit(1)
PY
  echo "density $k, $o"
}
out=$(both main.ts sprites 0.5); rc=$?
[ $rc -eq 77 ] && { echo "skipped: no GL window here ($(head -c 200 "$tmp/sprites.log"))"; exit 77; }
[ $rc -eq 0 ] || { echo "image_rect_gl: main.ts: $out"; fail=1; }
python3 $d/check.py "$tmp/sprites.bmp" $d/assets/sheet.png 2 || { echo "image_rect_gl: the sprites of the GL frame are not the sheet's"; fail=1; }
xout=$(both xform.ts xform 1) || { echo "image_rect_gl: xform.ts: $xout"; fail=1; }
python3 $d/xform_check.py "$tmp/xform.bmp" $d/assets/sheet.png 2 >"$tmp/xcheck.log" || { cat "$tmp/xcheck.log"; echo "image_rect_gl: through setTransform the sprites of the GL frame are not the sheet's"; fail=1; }
sout=$(both sprite.ts sprite 1) || { echo "image_rect_gl: sprite.ts: $sout"; fail=1; }
python3 $d/sprite_check.py "$tmp/sprite.bmp" $d/assets/sheet.png 2 || { echo "image_rect_gl: the tinted and blended sprites of the GL frame are not the formulas'"; fail=1; }
[ $fail -eq 0 ] && echo "image_rect_gl: ok ($out; through setTransform: $xout; sprites: $sout)"
exit $fail
