#!/bin/sh
# examples/js-gsap: GSAP 3.15.0 whole (every plugin, dist/all.js) on the QuickJS engine and the web environment, run as a user runs it
# (`zinc run <dir>`): a timeline of staggered, elastic and eased tweens drawn on a canvas 2D. Frame 70 is the example's screenshot.png. The
# page loads its script through a URL, so a regression of `new URL` in the web environment fails here too. GSAP's licence is not open
# source: tools/test-lib takes the pinned file into the cache; neither cached nor downloadable: skipped.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tools/test-lib gsap-3.15.0 > /dev/null 2> "$tmp/fetch" || { echo "skipped: $(head -c 300 "$tmp/fetch")"; exit 77; }
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=800x500 ZINC_FRAMES=72 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=70 \
  "$ZINC" run ../examples/js-gsap > "$tmp/out" 2> "$tmp/err" || { echo "example_js_gsap: the page failed: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q . && { echo "example_js_gsap: wrote on stderr: $(grep -v '^zinc: Canvas 2D' "$tmp/err" | head -c 300)"; fail=1; }
tools/pngdiff "$tmp/shot-70.png" ../examples/js-gsap/screenshot.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_gsap: frame 70 is not examples/js-gsap/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
exit $fail
