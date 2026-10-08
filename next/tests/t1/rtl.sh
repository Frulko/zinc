#!/bin/sh
# Right-to-left (ZN-377): tests/golden/rtl in ZINC_DIR=ltr and rtl prints the boxes of a row, padding-inline, a margin-start, text at its default start
# alignment (under rtl each one is the ltr box mirrored), an rtl: variant's colour, and renders to the recorded frames (the Nuxt UI Switch and Tabs
# mirrored); the rn engine (Yoga) prints the same boxes as classic in both directions.
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/rtl
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5 ZINC_SIZE=400x400 ZINC_SCALE=1
fail=0
for d in ltr rtl; do
  out=$(ZINC_DIR=$d "$ZINC" run $g/main.tsx 2>&1)
  [ "$out" = "$(cat $g/$d.out)" ] || { echo "$d: $(echo "$out" | diff - $g/$d.out | head -4)"; fail=1; }
  rn=$(ZINC_DIR=$d ZINC_UI_LAYOUT=rn "$ZINC" run $g/main.tsx 2>&1)
  [ "$rn" = "$out" ] || { echo "$d: rn differs from classic: $(echo "$rn" | diff - $g/$d.out | head -4)"; fail=1; }
  h=$(ZINC_DIR=$d ZINC_FRAMEHASH=last "$ZINC" run $g/main.tsx 2>&1 | grep framehash)
  [ "$h" = "$(cat $g/$d.hash)" ] || { echo "$d frame: $h"; fail=1; }
done
[ $fail -eq 0 ] && echo "rtl: ok"
exit $fail
