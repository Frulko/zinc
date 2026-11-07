#!/bin/sh
# A finger scroll up through rows of a variable <VirtualList> never measured: each row measured above the view moves the offset in the running
# gesture too (the scroll axis, not only the shown offset), so the rows shown move by the finger's delta; they used to jump back by the
# difference with the estimate at the next frame. The interpreter, the compiled run and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_SIZE=200x200 ZINC_SCALE=1 ZINC_INPUT=tests/data/virtual_settle/input.txt
want='row followed: true
moves by the finger only: true'
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run tests/data/virtual_settle/main.tsx 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run tests/data/virtual_settle/main.tsx $engine 2>&1 | grep -v '^zinc'); fi
  [ "$got" = "$want" ] || { echo "virtual_settle $engine: got"; echo "$got"; fail=1; }
done
exit $fail
