#!/bin/sh
# AppKit controls and overlays (D210, ZN-1073): zinc:appkit's PushButton, Switch, Checkbox, PopUpButton, SegmentedControl, Slider, DatePicker,
# SearchField and Progress (the kit's Button, Switch, Slider, Tabs and Progress under them) in tests/golden/ui-appkit-controls, shown headless (a
# window never shown) and dumped. Each control is driven through AppKit; its value comes back to the program and a refused one goes back to the
# program's. An alert, a sheet and a popover are built (not presented headless), ended through AppKit, and resolve their promises. The interpreter
# is compared with the golden, QuickJS and the AOT with the interpreter, and the drawn fallback (ZINC_RENDER=drawn) with its lines. macOS only
# (ZN_UPDATE_GOLDEN=1 writes the golden again).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: AppKit is macOS only"; exit 77; }
g=tests/golden/ui-appkit-controls
render=; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_RENDER=$render ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SIZE=480x300 ZINC_SCALE=1 timeout 300 "$ZINC" run -q "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui appkit controls: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
  ! grep -q 'did not build' "$tmp/$n.err" || { echo "ui appkit controls: $n: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui appkit controls: $(head -12 "$tmp/d")"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui appkit controls: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui appkit controls: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
render=drawn; run drawn --interp
for want in 'press save' 'switch true' 'checkbox false' 'drawn: overlays 1' 'drawn alert -1' 'drawn: overlays 0'; do
  grep -qxF "$want" "$tmp/drawn.out" || { echo "ui appkit controls: the drawn fallback lacks '$want': $(tr '\n' '|' < "$tmp/drawn.out")"; exit 1; }
done
echo "ui_appkit_controls: ok"
