#!/bin/sh
# PanResponder and Animated.event (ZN-366): tests/golden/pan-responder drags a card with a scripted pointer (grant, moves through Animated.event, release
# with vx / vy in px per ms, a decay that stops), and a ScrollView's onScroll Animated.event fades a header at 0, 40 and 120 px of scroll.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 ZINC_SIZE=480x300 ZINC_SCALE=1 "$ZINC" run tests/golden/pan-responder 2>&1)
[ "$out" = "$(cat tests/golden/pan-responder/main.out)" ] || { echo "pan responder: $(echo "$out" | diff - tests/golden/pan-responder/main.out | head -6)"; exit 1; }
echo "pan responder: ok"
