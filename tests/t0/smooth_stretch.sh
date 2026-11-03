#!/bin/sh
# ImageFlag.Smooth over a noise field (tests/data/smooth_stretch): a 10x stretch, odd ratios, a part of the picture with alpha, a shrink, a mirror.
# The frame must stay the bits the scalar loop of runtime/raster.cpp draw_smooth made (the PNG's hash was taken from the release before the
# vector path for runs of columns that share their texels was added): the vector path does the same float operations in the same order.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for e in --interp "--engine quickjs"; do
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=560x400 ZINC_SCALE=1 ZINC_SHOT="$t/s.png" "$ZINC" run tests/data/smooth_stretch $e > "$t/log" 2>&1 || { echo "$e: $(head -c 300 "$t/log")"; exit 1; }
  sum=$(shasum "$t/s.png" | cut -d' ' -f1)
  [ "$sum" = "25be51b8afb4f5cef016985c0790bf929f45b7b2" ] || { echo "$e: the smooth stretch draws other pixels ($sum)"; exit 1; }
done
