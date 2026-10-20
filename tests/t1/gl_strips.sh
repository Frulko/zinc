#!/bin/sh
# The strips of the GL replay (ZN-725, runtime/gl_replay.cpp RAMP): on GLES 2 the antialiased edges of STROKE and POLY are thin quads whose
# vertices carry the coverage, not distance maths per pixel. ZINC_GL_STRIPS=1 draws them on this machine's desktop GL, where the frame is
# compared with the software one on gl_renderer's limits (at most 5% of the pixels more than 24 away in a channel, mean error under 3):
# shapes (LINE, POLY, STROKE), navigation (roads and blocks), lottie-gallery and svg-gallery (curves, hairlines, even-odd holes).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
for p in ../tests/visual/shapes.ts ../examples/maps/navigation/src/main.tsx ../examples/ui/lottie-gallery ../examples/maps/svg-gallery; do
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SHOT="$tmp/sw.png" "$ZINC" run "$p" >/dev/null 2>&1
  ZINC_GL_STRIPS=1 ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_FRAMES=20 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run "$p" >"$tmp/gl.log" 2>&1
  [ -s "$tmp/gl.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
  grep -q "per frame 0.0 LINE/POLY tiles" "$tmp/gl.log" || { echo "$p: LINE/POLY tiles rasterized on the CPU"; fail=1; }
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "$p: $out"; fail=1; continue; }
  python3 - "$p" "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[2])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("%s: the strips' frame differs from the software frame: %s (limits 5%% / 3)" % (sys.argv[1], sys.argv[2])); sys.exit(1)
PY
done
exit $fail
