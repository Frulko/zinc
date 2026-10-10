#!/bin/sh
# Convex polygons in one pass on the GPU (ZN-679): tests/data/gl_convex (triangles, cards with a folded corner under setTransform, an octagon,
# translucent overlaps; a nine-point polygon and a concave star that keep the stencil path) drawn by the GL replay (ZINC_DISPLAY=gl) matches
# the software frame: under 1% of the pixels more than 24 apart, mean error under 1.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
[ "$(uname)" = Darwin ] && launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/sw.png" "$ZINC" run tests/data/gl_convex >"$tmp/sw.log" 2>&1
ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" ZINC_RUN=interp timeout 90 "$ZINC" run tests/data/gl_convex >"$tmp/gl.log" 2>&1
[ -s "$tmp/sw.png" ] && [ -s "$tmp/gl.bmp" ] || { echo "no frame: $(head -c 300 "$tmp/sw.log" "$tmp/gl.log")"; exit 1; }
out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || true
python3 - "$out" <<'PY'
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) >= 1 or float(m.group(2)) >= 1: print("the GL replay differs from the software frame:", sys.argv[1]); sys.exit(1)
PY
