#!/bin/sh
# The keyboard never hides the focused field (ZN-227): the last field of a long form is scrolled above it (tests/golden/ui-kbd-reveal).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-kbd-reveal
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=45 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-kbd-reveal: the field is hidden"; exit 1; }
echo "ui_kbd_reveal: ok"
