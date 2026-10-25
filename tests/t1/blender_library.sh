#!/bin/sh
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tools/scene-exchange examples/blender-library/assets/scene.json
"$ZINC" check examples/blender-library
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=300 ZINC_SHOT="$tmp/frame.png" \
  "$ZINC" run examples/blender-library -- --proof >"$tmp/run.log" 2>&1
cat "$tmp/run.log"
grep -q 'preserved gate, rejected revision' "$tmp/run.log"
grep -q 'idle frames 300 draws 1' "$tmp/run.log"
tools/pngdiff "$tmp/frame.png" tests/golden/blender-library/frame.png --tol 0
