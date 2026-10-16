#!/bin/sh
# NativeView (ZN-749): the box, clip and visibility zinc:ui tells a native view's host, only when they change: scrolled and clipped by its scroll
# area, hidden under a menu and under a dialog's scrim, under a hidden parent, and once more when it is unmounted (tests/golden/ui-native-view).
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/ui-native-view
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 ZINC_SIZE=200x300 ZINC_SCALE=1 "$ZINC" run --interp $g 2>/dev/null)
[ "$out" = "$(cat $g/main.out)" ] || { echo "ui native view: $(echo "$out" | diff - $g/main.out | head -8)"; exit 1; }
rn=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=10 ZINC_SIZE=200x300 "$ZINC" run --interp $g/rn.tsx 2>/dev/null)
[ "$rn" = 'place 10 30 180x100 true' ] || { echo "ui native view: zinc:react-native's NativeView told '$rn'"; exit 1; }
