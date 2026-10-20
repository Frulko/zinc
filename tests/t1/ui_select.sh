#!/bin/sh
# Selectable static text (ZN-270): drag, copy, clear, select-none (tests/golden/ui-select).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-select
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x120 ZINC_FRAMES=5 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-select: selection differs from main.out"; exit 1; }
echo "ui_select: ok"

