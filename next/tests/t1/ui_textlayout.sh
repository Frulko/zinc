#!/bin/sh
# Text layout (ZN-269): the exact lines of line-clamp, nowrap, pre, break-*, truncate and balance (tests/golden/ui-textlayout/main.out).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=1 "$ZINC" run tests/golden/ui-textlayout/main.tsx 2>&1 | diff - tests/golden/ui-textlayout/main.out || { echo "ui-textlayout: lines differ from main.out"; exit 1; }
echo "ui_textlayout: ok"
