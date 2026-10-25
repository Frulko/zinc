#!/bin/sh
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 tests/data/scene-exchange/bad_skin.py examples/animation-lab/assets/companion.glb "$tmp"
ANIMATION_BAD_DIR="$tmp" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=1 \
  "$ZINC" run examples/animation-lab -- --proof >"$tmp/run.log" 2>&1
cat "$tmp/run.log"
grep -q 'Blender error .*loops/seek/pause/step/blend/socket passed' "$tmp/run.log"
