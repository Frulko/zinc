#!/bin/sh
# Scene dump (ZN-170): ZINC_SCENE_DUMP writes the program's command list; `zinc capture --scene` replays it through the software raster, bit-identical to the live frame (ZINC_SHOT).
# Also ZINC_RENDER_STATS prints the counters of the last frame.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
for app in ../examples/hero/src/main.tsx ../examples/maps/navigation/src/main.tsx; do
  n=$(basename "$(dirname "$(dirname "$app")")")
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=12 ZINC_SHOT_FRAMES=3,8,12 ZINC_SHOT="$t/$n.png" ZINC_SCENE_DUMP="$t/$n.scn" ZINC_RENDER_STATS=1 "$ZINC" run "$app" >/dev/null 2>"$t/$n.err"
  grep -q '^zinc stats: .* cmds=[0-9]* ' "$t/$n.err" || { echo "$n: no render stats: $(tail -3 "$t/$n.err")"; fail=1; }
  for f in 3 8 12; do
    "$ZINC" capture --scene "$t/$n-$f.scn" "$app" -o "$t/$n-$f-replay.png" 2>"$t/e" || { echo "$n frame $f: replay failed: $(cat "$t/e")"; fail=1; continue; }
    cmp -s "$t/$n-$f.png" "$t/$n-$f-replay.png" || { echo "$n frame $f: the replay differs from the live frame"; fail=1; }
  done
done
[ $fail -eq 0 ] && echo "scene_dump: ok"
exit $fail
