#!/bin/sh
# Style runs inside one text (ui.setTextRuns): wrapped in their own faces (a long word cut with break-words), selected and copied as one text,
# removed (tests/golden/ui-runs).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-runs
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x200 ZINC_FRAMES=6 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-runs: the lines or the selection differ from main.out"; exit 1; }
