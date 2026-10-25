#!/bin/sh
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tools/scene-exchange examples/lantern-post/assets/scene.json
tools/scene-exchange examples/lantern-post/assets/revised.json
"$ZINC" check examples/lantern-post
cat >"$tmp/input" <<'INPUT'
30 pad Select
32 padup Select
45 pad L
47 padup L
60 pad R
62 padup R
75 pad Y
77 padup Y
INPUT
ZINC_INPUT="$tmp/input" ZINC_SCENE_DUMP="$tmp/scene" ZINC_SHOT_FRAMES=15,85 \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=90 ZINC_SHOT="$tmp/frame.png" \
  "$ZINC" run examples/lantern-post -- --proof >"$tmp/run.log" 2>&1
cat "$tmp/run.log"
grep -q 'three collision-aware deliveries; actual gate edit' "$tmp/run.log"
tools/pngdiff "$tmp/frame-15.png" tests/golden/lantern-post/frame.png --tol 0
python3 tools/scene-texts "$tmp/scene-85" | grep -q '3 OF 3 DELIVERED'
python3 tools/scene-texts "$tmp/scene-85" | grep -q 'unsupported schema/version'
