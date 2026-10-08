#!/bin/sh
# classic's React Native subset (ZN-288): with "preset": "react-native", tests/golden/layout-compat (flex: 1 equal shares, flexShrink, minWidth / maxWidth with
# grow, alignSelf, aspectRatio, alignContent) prints the same boxes in classic and in Yoga, except the two known lines of a grow item with a minWidth: classic
# follows CSS (250 / 50), Yoga gives 275 / 25. Without the preset, flex: 1 keeps classic's meaning (grow over the content size).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
g=tests/golden/layout-compat
fail=0
ZINC_UI_LAYOUT=classic "$ZINC" run $g > "$tmp/classic" 2>&1
diff -q "$tmp/classic" $g/main.out >/dev/null || { echo "classic: $(diff "$tmp/classic" $g/main.out | head -6)"; fail=1; }
ZINC_UI_LAYOUT=rn "$ZINC" run $g > "$tmp/rn" 2>&1
known='^min: |^beside min: '
grep -Ev "$known" "$tmp/rn" > "$tmp/rn.rest"; grep -Ev "$known" $g/main.out > "$tmp/classic.rest"
diff -q "$tmp/rn.rest" "$tmp/classic.rest" >/dev/null || { echo "rn differs from classic beyond the known lines: $(diff "$tmp/rn" $g/main.out | head -6)"; fail=1; }
[ "$(grep -cE "$known" "$tmp/rn")" = 2 ] || { echo "rn: the minWidth lines are missing"; fail=1; }
mkdir -p "$tmp/legacy" && cp $g/main.tsx "$tmp/legacy/" && echo '{ "name": "legacy", "entry": "main.tsx" }' > "$tmp/legacy/zinc.json"
"$ZINC" run "$tmp/legacy" 2>&1 | grep -q "^flex1 a: 0,0 100x30" && { echo "flex: 1 means equal shares without the preset"; fail=1; }
[ $fail -eq 0 ] && echo "layout compat: ok"
exit $fail
