#!/bin/sh
# Variable-height virtual list (ZN-193): 100k rows, rows in view only, content height from measured rows (tests/golden/ui-virtual).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=12 "$ZINC" run tests/golden/ui-virtual 2>&1 | diff - tests/golden/ui-virtual/main.out || { echo "ui-virtual: rows differ from main.out"; exit 1; }
echo "ui_virtual: ok"
