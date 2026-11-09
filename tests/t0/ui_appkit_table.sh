#!/bin/sh
# AppKit Table and Outline (D210, ZN-1072): zinc:appkit's Table of 10,000 rows and an Outline in tests/golden/ui-appkit-table, shown headless (a window
# that is never shown) and dumped. Only the rows in view and a few more are built (the host's cache is zinc:ui's virtual list); a scroll through
# AppKit brings the rows it shows; type-select reaches a row never built; sorting and selecting come back as events; the Outline expands, type-selects
# and collapses. The interpreter is compared with the golden, QuickJS and the AOT with the interpreter, and the drawn fallback (ZINC_RENDER=drawn)
# with its lines. macOS only (ZN_UPDATE_GOLDEN=1 writes the golden again).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: AppKit is macOS only"; exit 77; }
g=tests/golden/ui-appkit-table
render=; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_RENDER=$render ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SIZE=480x300 ZINC_SCALE=1 timeout 300 "$ZINC" run -q "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui appkit table: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui appkit table: $(head -12 "$tmp/d")"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui appkit table: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui appkit table: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
render=drawn; run drawn --interp
for want in 'drawn: outline 0,0 140x300 table 140,0 340x300 rows built 16' 'table select 9990' 'outline select trash' 'drawn: rows built 19'; do
  grep -qxF "$want" "$tmp/drawn.out" || { echo "ui appkit table: the drawn fallback lacks '$want': $(tr '\n' '|' < "$tmp/drawn.out")"; exit 1; }
done
echo "ui_appkit_table: ok"
