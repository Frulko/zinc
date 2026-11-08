#!/bin/sh
# Pointer and keyboard edge cases of zinc:ui (ZN-1023): the pointer finger lifted first no longer blocks the next pinch; each mouse button gets its
# own onPointerUp; Space and Enter keep a Pressable `pressed` until their release; the arrows, Page Down, End and Home scroll a focused ScrollView;
# rows prepended to a VirtualList (prependRows) keep the row on screen in place; a selection drag resting past a field's edge keeps scrolling.
# The interpreter and QuickJS print the golden tests/data/ui-input-edges/expected.out (the compiled run matched it when written).
cd "$(dirname "$0")/../.." || exit 2
fail=0
for engine in --interp "--engine quickjs"; do
  got=$(tests/data/ui-input-edges/run.sh "$engine")
  [ "$got" = "$(cat tests/data/ui-input-edges/expected.out)" ] || { echo "ui_input_edges $engine: got"; echo "$got"; fail=1; }
done
exit $fail
