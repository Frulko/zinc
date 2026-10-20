#!/bin/sh
# Two fingers on a touch screen over a node with onWheel and no onPinch (hero's map, written for a mouse and a trackpad): the spread reaches
# the wheel handler as a trackpad's pinch, the factor since the last move, at the first finger; it follows either finger and ends with one.
cd "$(dirname "$0")/../.." || exit 2
want='wheel 0 pinch 2.000 at 100 100
wheel 0 pinch 1.250 at 50 100
wheel 0 pinch 0.500 at 50 100'
got=$(ZINC_INPUT=tests/golden/ui/spread.input ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=16 "$ZINC" run --interp tests/golden/ui/spread.tsx 2>/dev/null)
[ "$got" = "$want" ] || { printf 'touch_spread: the wheel handler got\n%s\nwant:\n%s\n' "$got" "$want"; exit 1; }
echo "touch_spread: ok"
