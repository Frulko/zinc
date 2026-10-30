#!/bin/sh
# A React-model <VirtualList> whose rows are components (ZN-868): a row that scrolls out, or that the list makes again when it renders again,
# is unmounted (componentWillUnmount runs) and its instance dropped; they were kept for good, so scrolling a long list grew without end.
# 2,000 rows down and back up, then a render: the rows mounted are the ones shown. The interpreter, the compiled run and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_SIZE=200x200 ZINC_SCALE=1 ZINC_FRAMES=1000
want='rows mounted as at the start: true
rows made over the scroll: true'
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run tests/data/virtual_rows/main.tsx 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run tests/data/virtual_rows/main.tsx $engine 2>&1 | grep -v '^zinc'); fi
  [ "$got" = "$want" ] || { echo "virtual_rows $engine: got"; echo "$got"; fail=1; }
done
exit $fail
