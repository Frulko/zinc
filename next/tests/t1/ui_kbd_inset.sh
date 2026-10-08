#!/bin/sh
# The on-screen keyboard publishes env(keyboard-inset) (ZN-272): focusing a field raises it, a bar with pb-[env(keyboard-inset)] follows, the frame is the golden (tests/golden/ui-kbd-inset).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-kbd-inset
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=32 ZINC_FRAMEHASH=last "$ZINC" run $d/main.tsx 2>&1)
[ "$(echo "$out" | grep -v framehash)" = "$(cat $d/main.out)" ] || { echo "ui-kbd-inset: values differ: $out"; exit 1; }
[ "$(echo "$out" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')" = "$(cat $d/frame.hash)" ] || { echo "ui-kbd-inset: frame differs"; exit 1; }
echo "ui_kbd_inset: ok"
