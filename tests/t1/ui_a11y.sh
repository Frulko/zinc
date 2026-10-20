#!/bin/sh
# Accessibility (ZN-276): ui.inspect() of a form and the root font size (tests/golden/ui-a11y).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-a11y
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=8 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-a11y: tree differs from main.out"; exit 1; }
echo "ui_a11y: ok"

