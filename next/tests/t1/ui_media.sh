#!/bin/sh
# Media and container queries (ZN-272): flips of pointer kind, container width and keyboard inset (tests/golden/ui-media).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=1 "$ZINC" run tests/golden/ui-media 2>&1 | diff - tests/golden/ui-media/main.out || { echo "ui-media: queries differ from main.out"; exit 1; }
echo "ui_media: ok"
