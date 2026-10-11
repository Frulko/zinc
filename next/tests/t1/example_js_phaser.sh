#!/bin/sh
# examples/js-phaser (ZN-712): a game played by a script, on the unmodified Phaser 3.90.0 and the web environment, run as a user runs it
# (`zinc run <dir> --engine quickjs`). Sprites of a sheet, arcade physics (gravity, overlap, world bounds), the cursor keys and a score in a
# bitmap font. The drops are seeded, so the session of tests/golden/js-examples/phaser.input is always the same game: the boat waits and
# catches a star, goes right at frame 258 and catches two more against the wall, comes back at frame 540 into a rock: `game over: 3 stars`.
# Frame 440 (two stars caught, two falling) is the example's screenshot.png. Phaser's sound calls run and play nothing (no audio: ZN-573).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=600 ZINC_INPUT=tests/golden/js-examples/phaser.input ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=440 \
  "$ZINC" run ../examples/js-phaser --engine quickjs > "$tmp/out" 2> "$tmp/err" || { echo "example_js_phaser: the game failed: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
[ "$(cat "$tmp/out")" = "game over: 3 stars" ] || { echo "example_js_phaser: the session did not end on 'game over: 3 stars': $(head -c 200 "$tmp/out")"; fail=1; }
grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q . && { echo "example_js_phaser: Phaser wrote on stderr: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
tools/pngdiff "$tmp/shot-440.png" ../examples/js-phaser/screenshot.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_phaser: frame 440 is not examples/js-phaser/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
exit $fail
