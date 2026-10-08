#!/bin/sh
# React Native's transform array (ZN-361): tests/golden/style-transform (rotate in deg/turn, scale, skewX + scaleX, translate, a dynamic rotate) renders to
# its frame hash (the even scale around the centre paints; rotate and skew paint with ZN-361.01), the hits follow the transformed shapes, and 3D entries fail.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_SIZE=620x320 ZINC_SCALE=1 ZINC_HEADLESS=1
fail=0
h=$(ZINC_FRAMES=4 ZINC_FRAMEHASH=last "$ZINC" run tests/golden/style-transform 2>&1 | grep framehash)
[ "$h" = "$(cat tests/golden/style-transform/frame.hash)" ] || { echo "style transform: $h"; fail=1; }
ZINC_FRAMES=6 ZINC_HITS=1 "$ZINC" run tests/golden/style-transform 2>&1 | grep -v framehash | diff - tests/golden/style-transform/hits.out || { echo "transform hits differ"; fail=1; }
printf '{ "name": "t", "entry": "main.tsx", "ui": { "layout": "rn" } }\n' > "$tmp/zinc.json"
printf "import { render } from 'zinc:ui/solid';\nfunction App(): i32 { return <view style={{ transform: [{ rotateX: '45deg' }] }} />; }\nrender(App, 0, (dt: number) => {});\n" > "$tmp/main.tsx"
"$ZINC" run "$tmp" 2>&1 | grep -q "rotateX is 3D, only 2D transforms are supported" || { echo "a 3D transform entry is not refused"; fail=1; }
[ $fail -eq 0 ] && echo "style transform: ok"
exit $fail
