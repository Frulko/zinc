#!/bin/sh
# examples/js-three (ZN-712): the unmodified three.js r186 in plain JavaScript on the web environment, run as a user runs it
# (`zinc run <dir>`, "web" in its zinc.json). GLTFLoader brings assets/lighthouse.glb, three lights shade it, and a scripted
# drag (tests/golden/js-examples/three.input) turns the camera through OrbitControls: frame 10 is the example's screenshot.png. The scene is
# lit and antialiased, so the frames are compared by structure (the same run without the drag scores 0.88).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=12 ZINC_INPUT=tests/golden/js-examples/three.input ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=10 \
  "$ZINC" run ../examples/js-three > "$tmp/out" 2> "$tmp/err" || { echo "example_js_three: the example failed: $(head -c 300 "$tmp/err")"; fail=1; }
[ -s "$tmp/err" ] && { echo "example_js_three: three.js wrote on stderr: $(head -c 300 "$tmp/err")"; fail=1; }
tools/pngdiff "$tmp/shot-10.png" ../examples/js-three/screenshot.png --ssim 0.97 > "$tmp/diff" || { echo "example_js_three: frame 10 is not examples/js-three/screenshot.png: $(tail -1 "$tmp/diff")"; fail=1; }
exit $fail
