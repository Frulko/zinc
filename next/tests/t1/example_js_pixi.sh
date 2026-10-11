#!/bin/sh
# examples/js-pixi (ZN-712): a solar system on the unmodified PixiJS 8.22.0 and the web environment, run as a user runs it
# (`zinc run <dir> --engine quickjs`). Sprites of one generated texture in a tree of containers (sun, orbits, planets, moons), a BlurFilter
# behind the sun, and pointer events on the planets: the script of tests/golden/js-examples/pixi.input points at the large planet and clicks
# it at frames 2 to 4, so at frame 60 it is larger, half transparent and where it was, while the others went on: the example's
# screenshot.png. The same run without the click differs by 3800 pixels; 400 are allowed for another GPU's edges and blur.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=62 ZINC_INPUT=tests/golden/js-examples/pixi.input ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=60 \
  "$ZINC" run ../examples/js-pixi --engine quickjs > "$tmp/out" 2> "$tmp/err" || { echo "example_js_pixi: the example failed: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q . && { echo "example_js_pixi: PixiJS wrote on stderr: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
tools/pngdiff "$tmp/shot-60.png" ../examples/js-pixi/screenshot.png --tol 24 --max-diff 400 > "$tmp/diff" || { echo "example_js_pixi: frame 60 is not examples/js-pixi/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
exit $fail
