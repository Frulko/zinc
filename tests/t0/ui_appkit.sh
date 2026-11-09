#!/bin/sh
# The AppKit host (D210, ZN-1070): zinc:appkit shows tests/golden/ui-appkit with real NSViews in a window that is never shown (headless) and dumps
# them: views, a flattened Pressable, labels measured by AppKit, an image, fields, a text area, a scroll view; a press that goes through the views to
# zinc:ui, typing, Enter and scrolling through AppKit coming back as the drawn UI's events; an update and a recycled handle. The interpreter is
# compared with the golden, QuickJS and the AOT with the interpreter. macOS only. The widths AppKit measures follow the system font: a new macOS
# may move them (ZN_UPDATE_GOLDEN=1 writes the golden again).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: AppKit is macOS only"; exit 77; }
g=tests/golden/ui-appkit
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SIZE=320x240 ZINC_SCALE=1 timeout 300 "$ZINC" run -q "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui appkit: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui appkit: $(head -12 "$tmp/d")"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui appkit: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui appkit: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
echo "ui_appkit: ok"
