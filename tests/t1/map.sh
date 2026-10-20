#!/bin/sh
# zinc:map on the prototype's own vector-tile engine (ZN-108, decision D24): examples/maps/explorer and navigation render their offline tiles, equal to the engine's goldens
# (tests/golden/examples/map-*-40.png; the old toolchain had none).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for e in explorer navigation; do
  ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=40 ZINC_SCALE=1 ZINC_SHOT="$tmp/$e.png" ZINC_SHOT_FRAMES=40 "$ZINC" run "../examples/maps/$e" >/dev/null 2>&1
  tools/pngdiff "$tmp/$e-40.png" "tests/golden/examples/map-$e-40.png" >/dev/null || { echo "maps/$e: frame 40 differs from tests/golden/examples/map-$e-40.png"; fail=1; }
done
exit $fail
