#!/bin/sh
# zinc:canvas on the plugin's native code (ZN-105): canvas2d.host.cpp links against the host library's rasterizer through the thunk (one runtime owner); the conformance program prints
# the geometry's decisions as frozen, interpreted and compiled, and examples/canvas/sketch draws a frame headless.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_NATIVE=real "$ZINC" run tests/conformance/canvas2d.ts 2>&1 | diff -q - tests/conformance/canvas2d.out >/dev/null || { echo "canvas2d.ts differs from its frozen output on the native plugin"; fail=1; }
ZINC_NATIVE=real "$ZINC" build tests/conformance/canvas2d.ts -o "$tmp/c" >"$tmp/b.log" 2>&1 && "$tmp/c" 2>&1 | diff -q - tests/conformance/canvas2d.out >/dev/null || { echo "canvas2d.ts differs as an AOT program: $(head -c 300 "$tmp/b.log")"; fail=1; }
ZINC_HEADLESS=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/s.png" ZINC_SHOT_FRAMES=30 "$ZINC" run examples/canvas/sketch >/dev/null 2>"$tmp/e.log"
[ -s "$tmp/s-30.png" ] || { echo "examples/canvas/sketch drew no frame: $(head -c 300 "$tmp/e.log")"; fail=1; }
# under zinc:gfx's setTransform (a zinc:stage node drawing at its place, a turned zinc:ui parent) the fills, gradients and images of a canvas
# land where gfx's own shapes and the canvas's clip go (ZN-774.14: they were drawn at the untransformed place, cut away by the moved clip)
for p in moved placed; do
  ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$p.png" "$ZINC" run tests/data/canvas_transform/$p.ts >"$tmp/$p.log" 2>&1 ||
    { echo "tests/data/canvas_transform/$p.ts: $(head -c 300 "$tmp/$p.log")"; fail=1; }
done
tools/pngdiff "$tmp/moved.png" "$tmp/placed.png" >"$tmp/d" 2>&1 || { echo "a canvas under setTransform is not drawn where the same canvas placed is: $(head -1 "$tmp/d")"; fail=1; }
exit $fail
