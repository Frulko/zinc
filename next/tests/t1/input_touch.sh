#!/bin/sh
# Scripted touch points: `touch ID X Y` and `touchup ID` in a ZINC_INPUT script reach zinc:gfx (touchCount, touchId, touchX, touchY) as a touch
# screen's would: several fingers at once, in landing order, each held until its touchup, the first one also being the pointer.
cd "$(dirname "$0")/../.." || exit 2
got=$(ZINC_INPUT=tests/data/input_touch/touches.input ZINC_DETERMINISTIC=1 ZINC_FRAMES=8 "$ZINC" run tests/data/input_touch/main.ts 2>&1)
[ "$got" = "$(cat tests/data/input_touch/expected.txt)" ] || { printf 'input_touch: touches differ\n%s\nwant:\n%s\n' "$got" "$(cat tests/data/input_touch/expected.txt)"; exit 1; }
echo "input_touch: ok"
