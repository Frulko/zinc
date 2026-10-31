#!/bin/sh
# Selectable static text (ZN-270): drag, copy, clear, select-none (tests/golden/ui-select).
# Several lines and several blocks (ZN-917): the selected text and the frame (highlight over the blocks) agree on the
# interpreter, QuickJS and the compiled program (tests/golden/ui-select-multi).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-select
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x120 ZINC_FRAMES=5 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-select: selection differs from main.out"; exit 1; }
d=tests/golden/ui-select-multi
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x300 ZINC_FRAMES=6 ZINC_SCALE=1 ZINC_FRAMEHASH=last
fail=0
"$ZINC" run --interp $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-select-multi: interpreter differs"; fail=1; }
"$ZINC" run $d/main.tsx --engine quickjs 2>&1 | diff - $d/main.out || { echo "ui-select-multi: QuickJS differs"; fail=1; }
if "$ZINC" build $d/main.tsx -o "$tmp/app" >"$tmp/log" 2>&1; then "$tmp/app" 2>&1 | diff - $d/main.out || { echo "ui-select-multi: compiled differs"; fail=1; }
else echo "ui-select-multi does not build: $(tail -c 300 "$tmp/log")"; fail=1; fi
[ $fail = 0 ] && echo "ui_select: ok"
exit $fail
