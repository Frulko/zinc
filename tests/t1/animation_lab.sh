#!/bin/sh
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$ZINC" check examples/animation-lab
cat >"$tmp/input" <<'INPUT'
20 pad A
22 padup A
40 pad Start
42 padup Start
60 pad Start
62 padup Start
80 pad A
82 padup A
90 pad Right
92 padup Right
100 pad B
102 padup B
110 pad X
112 padup X
INPUT
ZINC_INPUT="$tmp/input" ZINC_SCENE_DUMP="$tmp/scene" ZINC_SHOT_FRAMES=15,55,75,115 \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=120 ZINC_SHOT="$tmp/frame.png" \
  "$ZINC" run examples/animation-lab -- --proof >"$tmp/run.log" 2>&1
cat "$tmp/run.log"
grep -q 'loops/seek/pause/step/blend/socket passed' "$tmp/run.log"
tools/pngdiff "$tmp/frame-15.png" tests/golden/animation-lab/frame.png --tol 0
python3 tools/scene-texts "$tmp/scene-55" | grep -q 'Idle / PLAYING'
python3 tools/scene-texts "$tmp/scene-75" | grep -q 'Run / PLAYING'
python3 tools/scene-texts "$tmp/scene-115" | grep -q 'Run / PAUSED'
python3 tools/scene-texts "$tmp/scene-115" | grep -q 'loop off'
