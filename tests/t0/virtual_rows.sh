#!/bin/sh
# A React-model <VirtualList> whose rows are components (ZN-868): a row that scrolls out, or that the list makes again when it renders again,
# is unmounted (componentWillUnmount runs) and its instance dropped; they were kept for good, so scrolling a long list grew without end.
# 2,000 rows down and back up, then a render: the rows mounted are the ones shown. A component replaced (another key) let its nodes live on
# out of the tree: its list kept its rows mounted, measured them at no height and scrolled on its own; now its nodes are destroyed and the
# list's rows unmount with it, and its onScroll handler is forgotten (a node made later with its handle called it). onScroll gives React
# Native's contentSize and layoutMeasurement too (ZN-903: a chat knows it shows its end). The interpreter, the compiled run and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_SIZE=200x200 ZINC_SCALE=1 ZINC_FRAMES=1000
want='onScroll'"'"'s content, view and offset at the end: 48000 120 47880
rows mounted as at the start: true
rows made over the scroll: true
a replaced list unmounts its rows: true
its onScroll is gone: true'
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run tests/data/virtual_rows/main.tsx 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run tests/data/virtual_rows/main.tsx $engine 2>&1 | grep -v '^zinc'); fi
  [ "$got" = "$want" ] || { echo "virtual_rows $engine: got"; echo "$got"; fail=1; }
done
exit $fail
