#!/bin/sh
# React Native's size constraints in object styles (ZN-359): tests/golden/style-size checks minWidth, maxWidth, minHeight, maxHeight, aspectRatio ("16/9" and
# a number), dynamic values and `width: pct(v)`, in classic (classic.out) and in the rn layout mode (rn.out).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5
fail=0
out=$("$ZINC" run tests/golden/style-size 2>&1); [ "$out" = "$(cat tests/golden/style-size/classic.out)" ] || { echo "classic: $(echo "$out" | diff - tests/golden/style-size/classic.out | head -4)"; fail=1; }
out=$(ZINC_UI_LAYOUT=rn "$ZINC" run tests/golden/style-size 2>&1); [ "$out" = "$(cat tests/golden/style-size/rn.out)" ] || { echo "rn: $(echo "$out" | diff - tests/golden/style-size/rn.out | head -4)"; fail=1; }
[ $fail -eq 0 ] && echo "style size: ok"
exit $fail
