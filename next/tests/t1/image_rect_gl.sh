#!/bin/sh
# zinc:gfx sprites on the GPU (ZN-432): tests/data/image_rect/main.ts drawn by the GL replay (display-gl with ZINC_RENDERER=gl: source rectangles as texture
# coordinates, mirrors, nearest and linear filters on baked and decoded images, alpha of a decoded image) against the software frame rendered at the density of the
# GL window, pixel for pixel: no more than 0.5% of the pixels more than 24 away in a channel and a mean error under 1 (display-gl's tolerance, gl_renderer.sh, is 5%
# and 3; a sprite mirrored the wrong way is 1.4% of this frame). The nearest sprites of the GL frame are also checked against the sheet (check.py).
# Opens a window: skipped (77) where there is none.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
d=tests/data/image_rect
unset ZINC_ASSETS
ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run $d/main.ts >"$tmp/gl.log" 2>&1
[ -s "$tmp/gl.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
grep -q "renderer gl:" "$tmp/gl.log" || { echo "image_rect_gl: ZINC_RENDERER=gl did not start the GL renderer"; exit 1; }
k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // 400)" "$tmp/gl.bmp")   # the density of the GL window
fail=0
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE="$k" ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_SHOT="$tmp/sw.png" "$ZINC" run $d/main.ts >/dev/null 2>&1
out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "image_rect_gl: $out"; exit 1; }
python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"scale 1, pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 0.5 or float(m.group(2)) > 1: print("image_rect_gl: the GL frame differs from the software frame at the same density: %s (limits 0.5%% / 1)" % sys.argv[1]); sys.exit(1)
PY
python3 $d/check.py "$tmp/gl.bmp" $d/assets/sheet.png 2 || { echo "image_rect_gl: the sprites of the GL frame are not the sheet's"; fail=1; }
[ $fail -eq 0 ] && echo "image_rect_gl: ok (density $k, $out)"
exit $fail
