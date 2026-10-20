#!/bin/sh
# Frames that allocate nothing (ZN-192): 600 repainted frames of a page with text, buttons, hover states and a focused text field leave the allocator's counter alone (tests/golden/ui-alloc).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=620 "$ZINC" run tests/golden/ui-alloc/main.tsx 2>&1 | diff - tests/golden/ui-alloc/main.out || { echo "ui-alloc: a frame allocated"; exit 1; }
echo "ui_alloc: ok"
