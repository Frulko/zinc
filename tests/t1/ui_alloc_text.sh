#!/bin/sh
# Allocations of a text layout pass (ZN-269, counter of ZN-189): the ZN-269 classes cost at most 1.5x of the default wrapping, truncate no more (tests/golden/ui-alloc-text).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=1000 "$ZINC" run tests/golden/ui-alloc-text/main.tsx 2>&1 | diff - tests/golden/ui-alloc-text/main.out || { echo "ui-alloc-text: a layout pass allocates differently"; exit 1; }
echo "ui_alloc_text: ok"
