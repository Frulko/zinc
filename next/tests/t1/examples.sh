#!/bin/sh
# The example apps (examples/) that the engine compiles run headless for a few frames and exit 0 (ZN-049, ZN-057). Not in the list, with the reason (docs/reports/zinc-next-hostmodules.md):
# maps/explorer and maps/svg-gallery (native map and svg engines), the apps that import zinc:pixelfont, osc, mqtt, gpio, platform or telemetry, camera, scripting, 3d, mapper.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for e in hero/src/main.tsx remarkable/dashboard/src/main.tsx remarkable/notes/src/main.tsx maps/navigation/src/main.tsx bouncing-ball/src/main.ts breakout/src/main.ts flipctl/src/main.ts hello/src/main.ts lang/src/main.ts \
         ui/kit-gallery/src/main.tsx ui/keyboard/src/main.tsx ui/lottie-gallery/src/main.tsx led/falling-cubes/src/main.ts led/oled-clock/src/main.tsx robot-eyes/src/main.ts robot-eyes-oled/src/main.ts zed-editor/sample/src/main.ts; do
  f="../examples/$e"
  [ -e "$f" ] || { echo "missing example $e"; fail=1; continue; }
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 timeout 60 "$ZINC" run "$f" 2>&1 >/dev/null); rc=$?
  [ $rc -eq 0 ] || { echo "$e: exit $rc: $(echo "$out" | head -c 200)"; fail=1; }
done
# pixel goldens of the engine's own output (the examples have none from the old toolchain): a frame of three of them
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for spec in "hero/src/main.tsx hero 30" "remarkable/dashboard/src/main.tsx dashboard 3" "remarkable/notes/src/main.tsx notes 3"; do
  set -- $spec
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$3 ZINC_SIZE=1100x700 ZINC_SCALE=1 ZINC_SHOT="$tmp/$2.png" ZINC_SHOT_FRAMES=$3 "$ZINC" run "../examples/$1" >/dev/null 2>&1
  tools/pngdiff "$tmp/$2-$3.png" "tests/golden/examples/$2-$3.png" >/dev/null || { echo "$2: frame $3 differs from tests/golden/examples/$2-$3.png"; fail=1; }
done
exit $fail
