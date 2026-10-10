#!/bin/sh
# The GL renderer (ZN-116, display-gl with ZINC_RENDERER=gl) against the software frame: the programs of tests/visual are rendered by both, the GL frame (a window of
# the host's GPU, here Metal under the macOS OpenGL layer; Mesa llvmpipe on Linux) is box-averaged down to the software size and compared with the tolerance policy
# (TESTING.md): at most 5% of the pixels more than 24 away in a channel, mean error under 3. shapes.ts draws LINE and POLY, which the GL renderer skips until ZN-181:
# it only has to stay under 12% / 15. hero and navigation are whole apps on the same limits (ZN-412.03): hero's stacked translucent glows need the
# raster's integer blend in the shader. lottie-gallery and svg-gallery: LINE/POLY filled on the GPU (stencil then cover, ZN-590.02), batched when
# their boxes are apart (ZN-590.04).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
for e in ../tests/visual/clock.ts:5:3 ../tests/visual/overlays.tsx:5:3 ../tests/visual/ui.tsx:5:3 ../tests/visual/shapes.ts:5:3 \
  ../examples/hero/src/main.tsx:5:3 ../examples/maps/navigation/src/main.tsx:5:3 ../examples/ui/lottie-gallery:5:3 ../examples/maps/svg-gallery:5:3; do
  p=${e%%:*}; r=${e#*:}; pct=${r%%:*}; mae=${r#*:}
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SHOT="$tmp/sw.png" "$ZINC" run "$p" >/dev/null 2>&1
  ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_FRAMES=20 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run "$p" >"$tmp/gl.log" 2>&1
  [ -s "$tmp/gl.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
  grep -q "renderer gl:" "$tmp/gl.log" || { echo "$p: ZINC_RENDERER=gl did not start the GL renderer"; fail=1; continue; }  
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "$p: $out"; fail=1; continue; }
  python3 - "$p" "$out" "$pct" "$mae" <<'PY' || fail=1
import re, sys
p, out, pct, mae = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", out)
if not m or float(m.group(1)) > pct or float(m.group(2)) > mae: print("%s: GL frame differs from the software frame: %s (limits %s%% / %s)" % (p, out, pct, mae)); sys.exit(1)
PY
done
# canvas/sketch's gradient paints (grad 4: the sky, the fireworks' glows from frame ~60) are filled by the shader, not by CPU tiles (ZN-590.04)
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=300 ZINC_SHOT="$tmp/sw.png" "$ZINC" run ../examples/canvas/sketch >/dev/null 2>&1
ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_FRAMES=300 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run ../examples/canvas/sketch >"$tmp/gl.log" 2>&1
grep -q "per frame 0.0 LINE/POLY tiles" "$tmp/gl.log" || { echo "canvas/sketch: LINE/POLY tiles rasterized on the CPU: $(grep -o 'per frame [0-9.]* LINE/POLY tiles' "$tmp/gl.log")"; fail=1; }
out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "canvas/sketch: $out"; fail=1; }
python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("canvas/sketch: GL frame differs from the software frame: %s (limits 5%% / 3)" % sys.argv[1]); sys.exit(1)
PY
exit $fail
