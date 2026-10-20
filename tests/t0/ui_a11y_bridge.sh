#!/bin/sh
# The screen reader bridge (ZN-630): what zinc:ui sends the host while a reader listens, frame by frame (tests/golden/ui-a11y-bridge: the whole
# tree, a press and a scroll by the reader, a modal dialog, the reader gone), the same on the interpreter and the AOT; and the tree the host
# rebuilds from it (tools/a11y-tree) lists the nodes of ui.inspect().
cd "$(dirname "$0")/../.." || exit 2
g=tests/golden/ui-a11y-bridge
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() {   # run <flag> <name>: the program's output, then what the host was told
  rm -f "$tmp/$2.log"
  ZINC_DEVICE_LOG="$tmp/$2.log" ZINC_INPUT="$PWD/$g/input.txt" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 ZINC_SIZE=200x240 ZINC_SCALE=1 \
    "$ZINC" run "$1" $g > "$tmp/$2.out" 2>/dev/null
  { cat "$tmp/$2.out"; echo '--- sent to the host'; cat "$tmp/$2.log"; } > "$tmp/$2.all"
}
run --interp interp
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/interp.all" $g/main.out; fi
diff "$tmp/interp.all" $g/main.out > "$tmp/d" || { echo "ui a11y bridge: $(head -8 "$tmp/d")"; exit 1; }
run --native aot
cmp -s "$tmp/aot.all" "$tmp/interp.all" || { echo "ui a11y bridge: the AOT differs: $(diff "$tmp/aot.all" "$tmp/interp.all" | head -6)"; exit 1; }
# the first tree sent = the first inspect() (its hidden nodes left out)
sed -n '/^inspect:$/,/^$/p' "$tmp/interp.out" | sed '1d' | sed -n '1,/^$/p' > "$tmp/inspect.txt"
tools/a11y-tree inspect "$tmp/inspect.txt" > "$tmp/a"
tools/a11y-tree log "$tmp/interp.log" 1 > "$tmp/b"
diff "$tmp/a" "$tmp/b" > "$tmp/d" || { echo "ui a11y bridge: the host's tree differs from inspect(): $(head -6 "$tmp/d")"; exit 1; }
echo "ui_a11y_bridge: ok"
