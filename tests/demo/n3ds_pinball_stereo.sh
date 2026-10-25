#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=400x240 ZINC_FRAMES=14 \
 ZINC_SHOT="$tmp/view.png" ZINC_SHOT_FRAMES=10,11,12,13 "$ZINC" run examples/n3ds-pinball/tools/stereo.ts --interp >"$tmp/out" 2>&1 || { cat "$tmp/out"; exit 1; }
grep -q 'pinball stereo: stars, ramp slope, mono and cached slider passed' "$tmp/out" || { cat "$tmp/out"; exit 1; }
for frame in 10 11 12 13; do
 [ -s "$tmp/view-$frame.png" ] || { echo "missing stereo frame $frame"; exit 1; }
done
tools/pngdiff "$tmp/view-12.png" "$tmp/view-13.png" --tol 0 --max-diff 0 || exit 1
# This region contains the ramp/wire, without the pre-existing raised caps or popups.
if tools/pngdiff "$tmp/view-10.png" "$tmp/view-11.png" --tol 1 --max-diff 100 --crop 228,70,80,165 >"$tmp/diff"; then
 echo 'ramp has no stereo disparity'; cat "$tmp/diff"; exit 1
fi
