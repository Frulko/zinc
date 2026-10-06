#!/bin/sh
# M5 demo (ZN-027, ZN-044): the frames of tests/visual/clock.ts (frames 20 and 60) and of tests/visual/ui.tsx (frames 1 and 40) are pixel-identical to the goldens of the current build, run headless.
# An unknown zinc: module is reported with a diagnostic.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for n in 20 60; do
  ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=$n ZINC_SHOT="$tmp/clock.png" ZINC_SHOT_FRAMES=$n "$ZINC" run ../tests/visual/clock.ts >/dev/null 2>"$tmp/err" \
    || { echo "clock.ts failed at $n frames: $(head -c 300 "$tmp/err")"; fail=1; continue; }
  tools/pngdiff "$tmp/clock-$n.png" ../tests/visual/clock-$n.png >/dev/null || { echo "frame $n differs from tests/visual/clock-$n.png"; fail=1; }
done
# a zinc:ui screen (kit components, Solid signals, JSX, a transition, scripted pointer input): frames 1 and 40
for n in 1 40; do
  ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=$n ZINC_SHOT="$tmp/ui.png" ZINC_SHOT_FRAMES=$n "$ZINC" run ../tests/visual/ui.tsx >/dev/null 2>"$tmp/err" \
    || { echo "ui.tsx failed at $n frames: $(head -c 300 "$tmp/err")"; fail=1; continue; }
  tools/pngdiff "$tmp/ui-$n.png" ../tests/visual/ui-$n.png >/dev/null || { echo "ui frame $n differs from tests/visual/ui-$n.png"; fail=1; }
done
printf "import { nothing } from 'zinc:nope';\n" > "$tmp/bad.ts"
"$ZINC" run "$tmp/bad.ts" 2>&1 | grep -q "Z0" || { echo "an unknown zinc: module is not reported"; fail=1; }
exit $fail
