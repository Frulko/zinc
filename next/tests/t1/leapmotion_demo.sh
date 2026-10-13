#!/bin/sh
# One scripted session: play, hand lab, explicit simulation, air writing, repeated width clicks and undo.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_NATIVE=sim ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x800 ZINC_LEAP_SIM=0
ZINC_INPUT="$PWD/tests/data/leapmotion/session.input" ZINC_FRAMES=126 ZINC_SHOT="$tmp/session.png" \
  "$ZINC" run ../examples/leapmotion --interp >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
for mode in 'Fruit slice' 'Hand lab' 'Air ink'; do
  grep -q "air-arcade mode $mode" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
golden=tests/golden/leapmotion/session.png
if [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ]; then mkdir -p "$(dirname "$golden")"; cp "$tmp/session.png" "$golden"; fi
tools/pngdiff "$tmp/session.png" "$golden"
# A short identical frame on the other engines, independent of the long session.
for engine in interp quickjs; do
  if [ "$engine" = interp ]; then flag=--interp; else flag='--engine quickjs'; fi
  ZINC_FRAMES=5 ZINC_LEAP_SIM=1 ZINC_SHOT="$tmp/$engine.png" "$ZINC" run ../examples/leapmotion $flag >"$tmp/$engine.log" 2>&1 \
    || { cat "$tmp/$engine.log"; exit 1; }
done
tools/pngdiff "$tmp/interp.png" "$tmp/quickjs.png"
ZINC_NATIVE=real "$ZINC" build ../examples/leapmotion -o "$tmp/arcade" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
ZINC_FRAMES=5 ZINC_LEAP_SIM=1 ZINC_SHOT="$tmp/aot.png" "$tmp/arcade" >"$tmp/aot.log" 2>&1 || { cat "$tmp/aot.log"; exit 1; }
tools/pngdiff "$tmp/interp.png" "$tmp/aot.png"
echo 'leapmotion_demo: all checks passed'
