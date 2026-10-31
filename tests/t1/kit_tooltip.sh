#!/bin/sh
# The kit's Tooltip (tests/golden/kit-tooltip): it shows after its delay under the pointer, a press hides it, Tab shows it on the focused child
# at once and moves it with the focus, and it stays inside the window. ZN_UPDATE_GOLDEN=1 records the output again.
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/kit-tooltip
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 "$ZINC" run "$g" 2>&1)
if [ -n "$ZN_UPDATE_GOLDEN" ]; then echo "$out" > "$g/out.txt"; echo "kit tooltip: golden recorded"; exit 0; fi
if [ "$out" != "$(cat "$g/out.txt")" ]; then echo "kit tooltip: the output differs from $g/out.txt"; echo "$out" | diff "$g/out.txt" - | head -10; exit 1; fi
echo "kit tooltip: ok"
