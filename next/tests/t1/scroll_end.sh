#!/bin/sh
# A scroll area reaches its end (ZN-737): in a page beside a fixed bar, in a screen stacked `absolute inset-0`, the content that wraps (a flex-wrap, a text)
# is measured for the width the screen ends with, so a scroll from code, the wheel, a finger and the keyboard's focus all bring the last child whole into
# the view; a nested scroll area too (tests/golden/scroll-end).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/scroll-end
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=134 "$ZINC" run --interp $d 2>/dev/null)
[ "$out" = "$(cat $d/main.out)" ] || { echo "scroll end: $(echo "$out" | diff - $d/main.out | head -8)"; exit 1; }
echo "scroll end: ok"
