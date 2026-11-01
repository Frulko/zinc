#!/bin/sh
# A cached layer (ZN-930): unchanged, it is not drawn again (one recording, the same commands while another node changes); invalidate() records it once more.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-layer
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x600 ZINC_FRAMES=8 "$ZINC" run $d 2>&1 | diff - $d/main.out || { echo "ui-layer: differs from main.out"; exit 1; }
echo "ui_layer: ok"
