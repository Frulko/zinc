#!/bin/sh
# One scripted session: play, hand lab, simulation, air writing, undo and a two-device duel.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_LEAP_LIBRARY="$tmp/missing.dylib"
export ZINC_NATIVE=real ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x800 ZINC_LEAP_SIM=0
ZINC_INPUT="$PWD/tests/data/leapmotion/session.input" ZINC_FRAMES=540 ZINC_SHOT="$tmp/session-3d.png" \
  "$ZINC" run ../examples/leapmotion --interp >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
for mode in 'Fruit 3D' 'Hand lab' 'Air ink' 'Shifumi'; do
  grep -q "air-arcade mode $mode" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
golden=tests/golden/leapmotion/session-3d.png
if [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ]; then mkdir -p "$(dirname "$golden")"; cp "$tmp/session-3d.png" "$golden"; fi
tools/pngdiff "$tmp/session-3d.png" "$golden"
# Fixed whole fruits and cut faces cover geometry that the final duel frame cannot show.
ZINC_FRAMES=1 ZINC_SHOT="$tmp/fruits-3d.png" "$ZINC" run tests/data/leapmotion/fruit_scene.ts --interp >"$tmp/fruits.log" 2>&1 \
  || { cat "$tmp/fruits.log"; exit 1; }
golden=tests/golden/leapmotion/fruits-3d.png
if [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ]; then cp "$tmp/fruits-3d.png" "$golden"; fi
tools/pngdiff "$tmp/fruits-3d.png" "$golden"
# A short identical frame on the other engines, independent of the long session.
for engine in interp quickjs; do
  if [ "$engine" = interp ]; then flag=--interp; else flag='--engine quickjs'; fi
  ZINC_FRAMES=5 ZINC_LEAP_SIM=1 ZINC_LEAP_MODE=hands ZINC_SHOT="$tmp/$engine.png" "$ZINC" run ../examples/leapmotion $flag >"$tmp/$engine.log" 2>&1 \
    || { cat "$tmp/$engine.log"; exit 1; }
done
tools/pngdiff "$tmp/interp.png" "$tmp/quickjs.png"
ZINC_NATIVE=real "$ZINC" build ../examples/leapmotion -o "$tmp/arcade" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
ZINC_FRAMES=5 ZINC_LEAP_SIM=1 ZINC_LEAP_MODE=hands ZINC_SHOT="$tmp/aot.png" "$tmp/arcade" >"$tmp/aot.log" 2>&1 || { cat "$tmp/aot.log"; exit 1; }
tools/pngdiff "$tmp/interp.png" "$tmp/aot.png"
echo 'leapmotion_demo: all checks passed'
