#!/bin/sh
# examples/js-p5 (ZN-712): a sketch in global mode on the unmodified p5.js 1.11.13 and the web environment, run as a user runs it
# (`zinc run <dir>`). WEBGL mode: 144 lit boxes in a wave, turned and tilted by the pointer. The script of
# tests/golden/js-examples/p5.input puts the pointer at 420,120, and frame 30 is the example's screenshot.png, compared by structure (lit
# faces; the same run with no pointer scores 0.82). p5.js is LGPL-2.1 and is not in the repository: tools/test-lib takes the pinned file into
# the cache where the example looks for it. Neither cached nor downloadable: the test is skipped.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tools/test-lib p5-1.11.13 > /dev/null 2> "$tmp/fetch" || { echo "skipped: $(head -c 300 "$tmp/fetch")"; exit 77; }
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=32 ZINC_INPUT=tests/golden/js-examples/p5.input ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=30 \
  "$ZINC" run ../examples/js-p5 > "$tmp/out" 2> "$tmp/err" || { echo "example_js_p5: the sketch failed: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q . && { echo "example_js_p5: p5 wrote on stderr: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
tools/pngdiff "$tmp/shot-30.png" ../examples/js-p5/screenshot.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_p5: frame 30 is not examples/js-p5/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
# The 2D sketch (sketch2d.js: a ring of dots around the pointer, a line of text): the same script, frame 30 is screenshot2d.png.
env P5_SKETCH=sketch2d.js ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=32 ZINC_INPUT=tests/golden/js-examples/p5.input ZINC_SHOT="$tmp/shot2d.png" ZINC_SHOT_FRAMES=30 \
  "$ZINC" run ../examples/js-p5 > "$tmp/out" 2> "$tmp/err" || { echo "example_js_p5: the 2D sketch failed: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q . && { echo "example_js_p5: the 2D sketch wrote on stderr: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
tools/pngdiff "$tmp/shot2d-30.png" ../examples/js-p5/screenshot2d.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_p5: the 2D frame 30 is not examples/js-p5/screenshot2d.png: $(tail -1 "$tmp/diff")"; fail=1; }
exit $fail
