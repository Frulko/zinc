#!/bin/sh
# React Native's flex keys in object styles (ZN-358): tests/golden/style-flex lays out flex, flexShrink, flexBasis (number, percent, auto), alignSelf and
# alignContent from StyleSheet.create and inline objects; in the rn layout mode `flex: 1` is grow 1, shrink 1, basis 0 (equal shares whatever the content),
# in classic it stays grow only (rn.out and classic.out differ on that line only).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
fail=0
out=$(ZINC_UI_LAYOUT=rn "$ZINC" run tests/golden/style-flex 2>&1); [ "$out" = "$(cat tests/golden/style-flex/rn.out)" ] || { echo "rn: $(echo "$out" | diff - tests/golden/style-flex/rn.out | head -4)"; fail=1; }
out=$("$ZINC" run tests/golden/style-flex 2>&1); [ "$out" = "$(cat tests/golden/style-flex/classic.out)" ] || { echo "classic: $(echo "$out" | diff - tests/golden/style-flex/classic.out | head -4)"; fail=1; }
[ $fail -eq 0 ] && echo "style flex: ok"
exit $fail
