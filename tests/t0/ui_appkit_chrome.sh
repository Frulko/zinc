#!/bin/sh
# The AppKit window chrome (D210, ZN-1071): zinc:appkit's Window, Toolbar, SplitView and Sidebar in tests/golden/ui-appkit-chrome, shown headless (a
# titled window that is never shown) and dumped: the window's title and toolbar style, the NSToolbar's items (a custom one holding a field), the split
# view and the sidebar. Tab in a field is left to zinc:ui; Tab and Shift-Tab move the first responder through the fields and a focusable view; keys
# reach the focused node; a toolbar item's press comes back as onPress; a divider drag re-lays out both panes' subtrees, held at the sidebar's maxWidth.
# The interpreter is compared with the golden, QuickJS and the AOT with the interpreter, and the drawn fallback (ZINC_RENDER=drawn) with its line.
# macOS only (ZN_UPDATE_GOLDEN=1 writes the golden again).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: AppKit is macOS only"; exit 77; }
g=tests/golden/ui-appkit-chrome
render=; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <name> <zinc args...>
  n=$1; shift
  ZINC_RENDER=$render ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SIZE=320x240 ZINC_SCALE=1 timeout 300 "$ZINC" run -q "$@" $g > "$tmp/$n.out" 2>"$tmp/$n.err" || { echo "ui appkit chrome: $n fails: $(head -c 400 "$tmp/$n.err")"; exit 1; }
}
run interp --interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.out" $g/main.out; fi
diff "$tmp/interp.out" $g/main.out > "$tmp/d" || { echo "ui appkit chrome: $(head -12 "$tmp/d")"; exit 1; }
run qjs --engine quickjs
cmp -s "$tmp/qjs.out" "$tmp/interp.out" || { echo "ui appkit chrome: QuickJS differs: $(diff "$tmp/qjs.out" "$tmp/interp.out" | head -6)"; exit 1; }
run aot
cmp -s "$tmp/aot.out" "$tmp/interp.out" || { echo "ui appkit chrome: the AOT differs: $(diff "$tmp/aot.out" "$tmp/interp.out" | head -6)"; exit 1; }
render=drawn; run drawn --interp
want='drawn: toolbar 0,0 320x38 sidebar 0,38 100x202 content 100,38 220x202 item 12,4 41x28'
grep -qxF "$want" "$tmp/drawn.out" || { echo "ui appkit chrome: the drawn fallback: $(tail -1 "$tmp/drawn.out")"; exit 1; }
echo "ui_appkit_chrome: ok"
