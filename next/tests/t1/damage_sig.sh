#!/bin/sh
# Compact previous frame (ZN-179): the damage rectangles computed from the 12-byte signatures of the previous frame equal those of the full diff, on pairs of real frames (hero, navigation).
# Also the join rule of diff_rects (LVGL) leaves every frame hash unchanged: the goldens of framehash.sh and the live frame of the scene dumps.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
for app in ../examples/hero/src/main.tsx ../examples/maps/navigation/src/main.tsx; do
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=12 ZINC_SHOT_FRAMES=3,8,12 ZINC_SHOT="$t/x.png" ZINC_SCENE_DUMP="$t/s.scn" "$ZINC" run "$app" >/dev/null 2>&1
  for p in "3 8" "8 12" "3 12" "12 3" "8 8"; do
    set -- $p
    "$ZINC" capture --scene "$t/s-$1.scn" --damage "$t/s-$2.scn" >"$t/o" || { echo "$app frames $1 -> $2: $(cat "$t/o")"; fail=1; }
  done
done
sh tests/t1/framehash.sh >/dev/null || { echo "framehash goldens changed"; fail=1; }
[ $fail -eq 0 ] && echo "damage_sig: ok"
exit $fail
