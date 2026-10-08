#!/bin/sh
# The rn layout engine in zinc:ui (ZN-286): tests/golden/layout-rn shows that a text change re-measures that text only and a paint-only change runs no layout;
# the scroll and layers conformance programs give classic's frozen output in rn mode, except three known lines of layers (Yoga centres a text taller than its
# button, like CSS and React Native; classic starts it at the top); the hero page renders in rn mode to its recorded frame hash.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1
fail=0
"$ZINC" run tests/golden/layout-rn > "$tmp/out" 2>&1; diff -q "$tmp/out" tests/golden/layout-rn/main.out >/dev/null || { echo "layout-rn: $(diff "$tmp/out" tests/golden/layout-rn/main.out | head -6)"; fail=1; }
ZINC_UI_LAYOUT=rn "$ZINC" run ../tests/conformance/scroll.tsx > "$tmp/scroll" 2>&1; diff -q "$tmp/scroll" ../tests/conformance/scroll.out >/dev/null || { echo "scroll in rn: $(diff "$tmp/scroll" ../tests/conformance/scroll.out | head -6)"; fail=1; }
ZINC_UI_LAYOUT=rn "$ZINC" run ../tests/conformance/layers.tsx > "$tmp/layers" 2>&1
known='text 20,11 43x22 "Menu"|text 107,7 37x22 "Plain"|text 22,211 32x22 "Low"'
d=$(diff "$tmp/layers" ../tests/conformance/layers.out | grep '^<' | sed 's/^< *//' | grep -Ev "^($known)$")
[ -z "$d" ] || { echo "layers in rn, beyond the known lines: $(echo "$d" | head -5)"; fail=1; }
[ "$(diff "$tmp/layers" ../tests/conformance/layers.out | grep -c '^<')" -le 3 ] || { echo "layers in rn: more lines differ than the 3 known"; fail=1; }
h=$(cd ../examples/hero && ZINC_UI_LAYOUT=rn ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_FRAMEHASH=last "$ZINC" run . 2>&1 | grep framehash | tail -1)
[ "$h" = "$(cat tests/golden/layout-rn/hero.framehash)" ] || { echo "hero in rn: '$h', recorded '$(cat tests/golden/layout-rn/hero.framehash)'"; fail=1; }
[ $fail -eq 0 ] && echo "layout rn: ok"
exit $fail
