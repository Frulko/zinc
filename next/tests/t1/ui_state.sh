#!/bin/sh
# State variants (ZN-273): hover:, disabled: values through the pointer and a paint-only change that runs no layout (tests/golden/ui-state).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-state
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=12 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-state: values differ from main.out"; exit 1; }
echo "ui_state: ok"

