#!/bin/sh
# A relayout of a whole page allocates nothing (ZN-189): the allocator's counter does not move over 600 forced layouts (tests/golden/ui-alloc-layout).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=620 "$ZINC" run tests/golden/ui-alloc-layout/main.tsx 2>&1 | diff - tests/golden/ui-alloc-layout/main.out || { echo "ui-alloc-layout: a layout pass allocated"; exit 1; }
echo "ui_alloc_layout: ok"
