#!/bin/sh
# What a style costs in draw commands (ZN-258, ZN-268, ZN-270): ring, outline, decoration, text shadow and the budget guard (tests/golden/ui-cmds).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-cmds
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x120 ZINC_FRAMES=24 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-cmds: costs differ from main.out"; exit 1; }
echo "ui_cmds: ok"

