#!/bin/sh
# Keyboard modes (ZN-227): mode="touch" shows it only after a touch (tests/golden/ui-kbd-mode); zinc.json "keyboard": "never" is the default of a Keyboard without a mode.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-kbd-mode
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=55 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-kbd-mode: modes differ"; exit 1; }
sed "s/ mode=\"touch\"//" $d/main.tsx > /tmp/zn-kbd-env.tsx
out=$(ZINC_KEYBOARD=never ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=55 "$ZINC" run /tmp/zn-kbd-env.tsx 2>&1 | tail -1); rm -f /tmp/zn-kbd-env.tsx
echo "$out" | grep -q "touch: keyboard inset above 100 false" || { echo "ZINC_KEYBOARD=never did not keep the keyboard away: $out"; exit 1; }
echo "ui_kbd_mode: ok"
