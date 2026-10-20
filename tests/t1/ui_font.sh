#!/bin/sh
# Typography A (ZN-267): family list fall-through, weight -> nearest baked face, baked slant, and only the faces the app names are baked (tests/golden/ui-font).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run tests/golden/ui-font 2>&1 | diff - tests/golden/ui-font/main.out || { echo "ui-font: faces differ from main.out"; exit 1; }
echo "ui_font: ok"
