#!/bin/sh
# Images in a box (ZN-262): object-fit / object-position, background images (bg-[url(..)], size, position, repeat), tint-* and tintColor,
# React Native's resizeMode. tests/golden/style-image (a 2:1 image in 1:1 boxes) renders to its frame hash (interpreter and AOT) and its pixels
# follow CSS's definitions and raster.cpp's tint multiply (tests/data/style_image/check.py). On the esp32 profile (tier T0)
# a repeat past 16 tiles is drawn as at most 16 larger tiles, with one log line. The GL replay draws the frame, tints included, within a
# few units of the software frame at the same density.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
g=tests/golden/style-image d=tests/data/style_image
fail=0
h=$(ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=544x224 ZINC_FRAMEHASH=last ZINC_SHOT="$tmp/g.png" "$ZINC" run $g 2>&1 | grep framehash)
[ "$h" = "$(cat $g/frame.hash)" ] || { echo "style image: $h"; fail=1; }
python3 $d/check.py golden "$tmp/g.png" || fail=1
if [ -n "$CXX" ] || command -v c++ >/dev/null; then
  "$ZINC" build $g -o "$tmp/app" >"$tmp/build.log" 2>&1 || { echo "style image: AOT build failed: $(head -c 300 "$tmp/build.log")"; exit 1; }
  a=$(ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=544x224 ZINC_FRAMEHASH=last ZINC_ASSETS=$g/assets "$tmp/app" 2>&1 | grep framehash)
  [ "$a" = "$h" ] || { echo "style image: the AOT build's $a is not the interpreter's $h"; fail=1; }
fi
out=$(ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=544x224 ZINC_SHOT="$tmp/e.png" timeout 120 "$ZINC" run --profile esp32 $g 2>&1)
l="zinc:ui: an image repeated beyond 16 tiles is drawn as 16 larger tiles at most on this profile (tier T0)"
[ "$(echo "$out" | grep -cF "$l")" = 1 ] || { echo "esp32: not once: $l"; fail=1; }
python3 $d/check.py esp32 "$tmp/e.png" || fail=1
ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SIZE=544x224 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run $g >"$tmp/gl.log" 2>&1
if [ ! -s "$tmp/gl.bmp" ]; then echo "GL skipped: no GL window here"
elif ! grep -q "renderer gl:" "$tmp/gl.log"; then echo "style image: ZINC_RENDERER=gl did not start the GL renderer"; fail=1
else
  k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // 544)" "$tmp/gl.bmp")
  ZINC_HEADLESS=1 ZINC_SCALE=$k ZINC_SIZE=544x224 ZINC_SHOT="$tmp/sw.png" "$ZINC" run $g >/dev/null 2>&1
  o=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png")
  python3 - "$o" <<'PY' || { echo "style image: the GL frame differs from the software frame: $o"; fail=1; }
import re, sys
m = re.search(r"scale 1, pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
sys.exit(0 if m and float(m.group(1)) <= 0.01 and float(m.group(2)) <= 0.1 else 1)
PY
fi
[ $fail -eq 0 ] && echo "style image: ok"
exit $fail
