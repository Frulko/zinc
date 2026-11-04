#!/bin/sh
# A press on a focusable node does not scroll it into view; focus given by the program does (tests/golden/ui-press-no-reveal).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-press-no-reveal
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=30 timeout 60 "$ZINC" run $d/main.tsx 2>&1 | grep -v -E '^ +[a-z]+ |^zinc: ' | diff - $d/main.out || { echo "ui_press_no_reveal: wrong"; exit 1; }
