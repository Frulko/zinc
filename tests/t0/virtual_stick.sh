#!/bin/sh
# <VirtualList stickToBottom> (ZN-868): the flag reaches the list (the lowering used to drop every attribute it did not know, silently), so a
# chat's history of rows of their own heights opens at its end, follows the rows that come, and stays put once scrolled up, also when the list
# renders again (virtualize kept no measured height: every render reset them to the estimate and the rows shown jumped). An unknown
# attribute on <VirtualList> is refused with its name. The interpreter, the compiled run and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_SIZE=200x200 ZINC_SCALE=1
want='opened at the end: true
follows new rows: true
scrolled up stays: true
rendered again, kept: true'
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run tests/data/virtual_stick/main.tsx 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run tests/data/virtual_stick/main.tsx $engine 2>&1 | grep -v '^zinc'); fi
  [ "$got" = "$want" ] || { echo "virtual_stick $engine: got"; echo "$got"; fail=1; }
done
cat > "$tmp/bad.tsx" <<'TSX'
import { render } from 'zinc:ui/react';
function App() { return <VirtualList count={3} itemHeight={20} onEndReached={() => {}}>{(i: i32) => <Text>{`${i}`}</Text>}</VirtualList>; }
render(App, 0, null);
TSX
out=$("$ZINC" check "$tmp/bad.tsx" 2>&1)
case "$out" in *"unknown attribute 'onEndReached' on <VirtualList>"*) ;; *) echo "virtual_stick: an unknown attribute was not refused: $out"; fail=1 ;; esac
exit $fail
