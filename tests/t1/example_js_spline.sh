#!/bin/sh
# examples/js-spline (ZN-772): a scene made in Spline, run by Spline's own runtime (@splinetool/runtime 2.0.98, taken by tools/test-lib) on the
# web environment, as a user runs it (`zinc run <dir>`). A scripted pointer (tests/golden/js-examples/spline.input) goes left, over the robot's
# eyes, then right: the robot looks at it (Spline's LookAt), the program is told of the hover by name, and frame 89 is the example's
# screenshot.png while frame 39 (looking left) is not. The blob (Spline's metaballs, marching cubes on the GPU) is its golden frame: macOS's GL
# failed the link of its `continue` inside a `switch` (no blob) and kept stale positions for the vertices that return early (streaks across the
# frame). Then a machine without WebGL 2 (ZINC_WEBGL_MAX=1) refuses the program by name.
cd "$(dirname "$0")/../.." || exit 2
tools/test-lib spline-runtime-2.0.98 > /dev/null || exit 77
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=800x500 ZINC_FRAMES=90 ZINC_INPUT=tests/golden/js-examples/spline.input ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=39,89 \
  "$ZINC" run examples/js-spline > "$tmp/out" 2> "$tmp/err" || { echo "example_js_spline: the example failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -v -e "WARNING: Output of vertex shader" -e "^updating from  *[0-9]* to  *[0-9]*$" "$tmp/err" > "$tmp/err2"   # the macOS GL driver's notes on Spline's shaders (varyings it does not read), the runtime's note on an older scene file
[ -s "$tmp/err2" ] && { echo "example_js_spline: the scene wrote on stderr: $(head -c 300 "$tmp/err2")"; fail=1; }
grep -q "^js-spline: assets/scene.splinecode, 21 objects$" "$tmp/out" || { echo "example_js_spline: the scene did not start: $(head -c 300 "$tmp/out")"; fail=1; }
grep -q "^mouseHover NORMAL$" "$tmp/out" || { echo "example_js_spline: the hover over the eyes did not reach the program"; fail=1; }
tools/pngdiff "$tmp/shot-89.png" examples/js-spline/screenshot.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_spline: frame 89 is not examples/js-spline/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
tools/pngdiff "$tmp/shot-39.png" "$tmp/shot-89.png" --tol 16 --max-diff 2000 > /dev/null && { echo "example_js_spline: the robot does not turn to the pointer (frames 39 and 89 are alike)"; fail=1; }
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=800x500 ZINC_FRAMES=60 SPLINE_FPS=0 SPLINE_SCENE=assets/scenes/blob.splinecode ZINC_SHOT="$tmp/blob.png" \
  "$ZINC" run examples/js-spline > /dev/null 2>&1 || { echo "example_js_spline: the blob scene failed"; fail=1; }
tools/pngdiff "$tmp/blob.png" tests/golden/js-examples/spline-blob.png --tol 16 --max-diff 300 > "$tmp/diff" || { echo "example_js_spline: the blob is not tests/golden/js-examples/spline-blob.png: $(tail -1 "$tmp/diff")"; fail=1; }
# a GPU without WebGL 2: the program, which requires gpu>=webgl2, stops with the reason instead of failing inside three.js
env ZINC_HEADLESS=1 ZINC_WEBGL_MAX=1 ZINC_FRAMES=5 "$ZINC" run examples/js-spline > /dev/null 2> "$tmp/no2" && { echo "example_js_spline: it ran on a machine without WebGL 2"; fail=1; }
grep -q "js-spline cannot run here: it requires gpu>=webgl2" "$tmp/no2" || { echo "example_js_spline: no WebGL 2 is not said by name: $(head -c 300 "$tmp/no2")"; fail=1; }
exit $fail
