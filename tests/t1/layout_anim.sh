#!/bin/sh
# LayoutAnimation (ZN-365): tests/golden/layout-anim resizes and moves nodes after configureNext (linear 400 ms: the boxes at 0, 50 and 100 %), fades a new node
# in, keeps a removed node in the tree fading out and lets it leave at the end, calls onEnd; classic.out and rn.out (ZINC_UI_LAYOUT=rn) differ only by the name.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
fail=0
out=$("$ZINC" run tests/golden/layout-anim 2>&1); [ "$out" = "$(cat tests/golden/layout-anim/classic.out)" ] || { echo "classic: $(echo "$out" | diff - tests/golden/layout-anim/classic.out | head -4)"; fail=1; }
out=$(ZINC_UI_LAYOUT=rn "$ZINC" run tests/golden/layout-anim 2>&1); [ "$out" = "$(cat tests/golden/layout-anim/rn.out)" ] || { echo "rn: $(echo "$out" | diff - tests/golden/layout-anim/rn.out | head -4)"; fail=1; }
[ $fail -eq 0 ] && echo "layout anim: ok"
exit $fail
