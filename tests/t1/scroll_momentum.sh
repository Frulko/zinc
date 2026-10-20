#!/bin/sh
# Trackpad and Magic Mouse scrolling as the macOS HAL reports it (ZINC_INPUT `scroll DX DY PHASE`, the HalInput.scroll_* fields): fractional deltas
# move the list 1:1, the OS momentum after the lift is followed delta for delta with nothing added (the offset stops when its deltas stop), fingers
# landing drop the rest of it, a momentum reaching the end bounces and rests on the end, a wheel notch eases 48 px (one frame with reduced motion),
# and a plain lift (phase 2, HALs without OS momentum) still runs the engine's inertia. tests/golden/scroll-momentum/main.tsx says what each part is.
cd "$(dirname "$0")/../.." || exit 2
here=$(pwd)
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT="$here/tests/golden/scroll-momentum/input" ZINC_FRAMES=200 "$ZINC" run tests/golden/scroll-momentum 2>/dev/null)
[ "$out" = "$(cat tests/golden/scroll-momentum/main.out)" ] || { echo "scroll momentum: $(echo "$out" | diff - tests/golden/scroll-momentum/main.out | head -6)"; exit 1; }
echo "scroll momentum: ok"
