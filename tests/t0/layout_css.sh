#!/bin/sh
# CSS conformance of the classic layout (ZN-1022): 100% sizes along the main axis, flex-basis, a flex-1 column beside a bar and flex-1's equal shares with
# the automatic minimum size lay out as Chrome lays the same tree out (tests/golden/layout-css/main.out, made by tools/layout-fixtures --chrome).
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/layout-css
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 "$ZINC" run $g 2>&1 | grep -E '^[a-z0-9 -]+: -?[0-9]+,' | diff - $g/main.out || { echo "layout_css: classic differs from Chrome"; exit 1; }
echo "layout_css: ok"
