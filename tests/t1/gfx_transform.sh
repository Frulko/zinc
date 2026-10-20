#!/bin/sh
# zinc:gfx setTransform (ZN-263.01): rect, rounded rect, border, shadow, gradient, image and text at 0, 15, 45 and 90 degrees, a scaled-then-
# rotated group, a transformed polygon and stroke (tests/data/gfx_transform). The software frame of the interpreter and of the compiled program
# is the golden (tests/golden/gfx-transform/frame.png); the GL replay draws it within the tolerance policy (5% of the pixels over 24, mae 3).
# The GL run pretends a screen smaller than the window (ZINC_TEST_SCREEN, display-gl's sdl.cpp): its screenshot keeps the surface's size.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # name [env...]
  n=$1; shift
  env "$@" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/$n.png" "$ZINC" run tests/data/gfx_transform >"$tmp/$n.log" 2>&1
  [ -f "$tmp/$n.png" ] || { echo "$n: no frame: $(head -c 300 "$tmp/$n.log")"; fail=1; return 1; }
  tools/pngdiff "$tmp/$n.png" tests/golden/gfx-transform/frame.png >"$tmp/d" || { echo "$n: the frame differs from the golden: $(head -1 "$tmp/d")"; fail=1; }
}
shot interpreter ZINC_RUN=interp
shot compiled ZINC_RUN=native
command -v python3 >/dev/null || { echo "skipped the GL replay: no python3"; exit $fail; }
ZINC_TEST_SCREEN=640x480 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" ZINC_RUN=interp timeout 90 "$ZINC" run tests/data/gfx_transform >"$tmp/gl.log" 2>&1
if [ -s "$tmp/gl.bmp" ]; then
  out=$(python3 tools/glcompare "$tmp/gl.bmp" tests/golden/gfx-transform/frame.png) || { echo "GL: $out"; fail=1; }
  python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("GL: the frame differs from the software one: %s (limits 5%% / 3)" % sys.argv[1]); sys.exit(1)
PY
else echo "GL replay skipped: no GL window here"; fi
exit $fail
