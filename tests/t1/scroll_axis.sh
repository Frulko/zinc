#!/bin/sh
# Scroll axes: in an `overflow: scroll` view whose content fits the width, a horizontal finger drag or trackpad swipe does not move or rubber-band the
# content sideways (iOS / React Native alwaysBounceHorizontal = false); the vertical part scrolls; content wider than the view still scrolls on X.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 "$ZINC" run tests/golden/scroll-axis 2>&1)
[ "$out" = "$(cat tests/golden/scroll-axis/main.out)" ] || { echo "scroll axis: $(echo "$out" | diff - tests/golden/scroll-axis/main.out | head -4)"; exit 1; }
echo "scroll axis: ok"
