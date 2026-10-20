#!/bin/sh
# React Native's border keys in object styles (ZN-363): tests/golden/style-border/objects.tsx (borderStyle dashed/dotted, corner radii, side colours, a dynamic
# radius and side colour) renders the recorded frame, and classes.tsx, the same cards through classes, gives the same pixels.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=600x200 ZINC_SCALE=1 ZINC_FRAMEHASH=last
want=$(cat tests/golden/style-border/frame.hash)
fail=0
for f in objects classes; do
  h=$("$ZINC" run tests/golden/style-border/$f.tsx 2>&1 | grep framehash)
  [ "$h" = "$want" ] || { echo "style border $f: $h, recorded $want"; fail=1; }
done
[ $fail -eq 0 ] && echo "style border: ok"
exit $fail
